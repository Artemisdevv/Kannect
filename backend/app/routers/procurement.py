"""Retailer procurement endpoints: suppliers, reorder suggestions, receive orders."""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2 import Geography
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import cast, func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import AuthenticatedOwner, require_retailer
from app.db import get_db
from app.models import (
    Product,
    Shop,
    ShopProduct,
    StockEvent,
    Supplier,
    SupplierOrder,
    SupplierProduct,
)
from app.routers.orders import _order_payload
from app.routers.supplier import _product_payload, _supplier_payload, _supplier_product_payload
from app.stock import default_low_threshold, stock_quantity, stock_status

router = APIRouter(tags=["procurement"])


class ReceiveItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: UUID
    quantity: int = Field(ge=0)


class ReceiveOrderInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Omitted items means the supplier delivered every ordered pack in full.
    # When present, only listed products are received; omitted products remain unreceived.
    items: list[ReceiveItem] | None = None


def _shop_id(owner: AuthenticatedOwner) -> UUID:
    if owner.shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    return owner.shop.id


def _load_shop_products(db: Session, shop_id: UUID) -> list[ShopProduct]:
    return list(
        db.scalars(
            select(ShopProduct)
            .where(ShopProduct.shop_id == shop_id)
            .options(
                joinedload(ShopProduct.product), selectinload(ShopProduct.stock_events)
            )
        ).all()
    )


@router.get("/suppliers")
def list_suppliers(
    q: str | None = None,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, list[dict[str, Any]]]:
    """Suppliers that serve this shop's area (within delivery radius)."""
    shop_id = _shop_id(owner)
    shop = db.get(Shop, shop_id)
    if shop is None or shop.location is None:
        return {"items": []}

    suppliers = db.scalars(
        select(Supplier)
        .join(Shop, Shop.id == shop_id)
        .where(
            Supplier.location.is_not(None),
            Shop.location.is_not(None),
            func.ST_DWithin(
                cast(Supplier.location, Geography(srid=4326)),
                cast(Shop.location, Geography(srid=4326)),
                Supplier.delivery_radius_m,
            ),
        )
    ).all()

    if q:
        folded = q.casefold()
        suppliers = [s for s in suppliers if folded in (s.name or "").casefold()]

    suppliers.sort(key=lambda s: (s.name or "").casefold())
    return {"items": [_supplier_payload(s) for s in suppliers]}


@router.get("/suppliers/{supplier_id}/products")
def list_supplier_products(
    supplier_id: UUID,
    q: str | None = None,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, list[dict[str, Any]]]:
    """A supplier's wholesale catalogue."""
    shop_id = _shop_id(owner)
    shop = db.get(Shop, shop_id)
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # Check if supplier serves this shop's area
    if shop is None or shop.location is None:
        raise HTTPException(status_code=404, detail="Shop location not found")

    serves_shop = db.scalar(
        select(Supplier.id)
        .join(Shop, Shop.id == shop_id)
        .where(
            Supplier.id == supplier_id,
            Supplier.location.is_not(None),
            Shop.location.is_not(None),
            func.ST_DWithin(
                cast(Supplier.location, Geography(srid=4326)),
                cast(Shop.location, Geography(srid=4326)),
                Supplier.delivery_radius_m,
            ),
        )
    )
    if serves_shop is None:
        raise HTTPException(status_code=404, detail="Supplier does not serve this shop's area")

    rows = db.scalars(
        select(SupplierProduct)
        .where(
            SupplierProduct.supplier_id == supplier_id,
            SupplierProduct.available.is_(True),
        )
        .options(joinedload(SupplierProduct.supplier), joinedload(SupplierProduct.product))
    ).all()

    if q:
        folded = q.casefold()
        rows = [r for r in rows if folded in r.product.name.casefold()]

    rows.sort(key=lambda row: row.product.name.casefold())
    return {"items": [_supplier_product_payload(row) for row in rows]}


@router.get("/shop/reorder-suggestions")
def reorder_suggestions(
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, list[dict[str, Any]]]:
    """Low/out products with supplier options for each. Suggests only; the owner decides."""
    shop_id = _shop_id(owner)
    shop = db.get(Shop, shop_id)
    rows = _load_shop_products(db, shop_id)

    # Load supplier options and recent sales in batches so query count does not
    # grow linearly with the number of low-stock products.
    week_ago = datetime.now(UTC) - timedelta(days=7)
    supplier_by_product: dict[UUID, list[SupplierProduct]] = {}
    sold_by_product: dict[UUID, int] = {}
    if rows and shop is not None and shop.location is not None:
        product_ids = [row.product_id for row in rows]
        supplier_rows = db.scalars(
            select(SupplierProduct)
            .join(Supplier, SupplierProduct.supplier_id == Supplier.id)
            .where(
                SupplierProduct.product_id.in_(product_ids),
                SupplierProduct.available.is_(True),
                Supplier.location.is_not(None),
                func.ST_DWithin(
                    cast(Supplier.location, Geography(srid=4326)),
                    cast(shop.location, Geography(srid=4326)),
                    Supplier.delivery_radius_m,
                ),
            )
            .options(
                joinedload(SupplierProduct.supplier),
                joinedload(SupplierProduct.product),
            )
        ).all()
        for supplier_row in supplier_rows:
            supplier_by_product.setdefault(supplier_row.product_id, []).append(supplier_row)

        sales = db.execute(
            select(StockEvent.product_id, func.sum(StockEvent.quantity))
            .where(
                StockEvent.shop_id == shop_id,
                StockEvent.product_id.in_(product_ids),
                StockEvent.type == "sale",
                StockEvent.created_at >= week_ago,
            )
            .group_by(StockEvent.product_id)
        ).all()
        sold_by_product = {product_id: int(quantity or 0) for product_id, quantity in sales}

    # Find products that are low or out of stock
    low_items = []
    for row in rows:
        qty = stock_quantity(row.stock_events)
        st = stock_status(qty, row.low_threshold)
        if st in ("low", "out"):
            # Find suppliers for this product that serve this shop's area
            supplier_rows = supplier_by_product.get(row.product_id, [])
            sold_qty = sold_by_product.get(row.product_id, 0)

            # Restock toward the low-stock threshold plus about two weeks of recent sales.
            threshold = row.low_threshold
            suggested_packs = 1
            if supplier_rows:
                min_pack_size = min(sp.pack_size for sp in supplier_rows)
                needed_qty = max(0, sold_qty * 2 + threshold - qty)
                suggested_packs = max(1, (needed_qty + min_pack_size - 1) // min_pack_size)

            reason = f"Sold {sold_qty} in the last 7 days, {qty} left"
            if st == "out":
                reason = f"Out of stock, sold {sold_qty} in the last 7 days"

            options = [_supplier_product_payload(r) for r in supplier_rows]
            if options:
                low_items.append(
                    {
                        "shop_product": {
                            "product": _product_payload(row.product),
                            "price": float(row.price),
                            "cost_price": float(row.cost_price) if row.cost_price else None,
                            "stock_qty": qty,
                            "low_threshold": row.low_threshold,
                            "stock_status": st,
                            "needs_recount": row.needs_recount,
                            "pinned": row.pinned,
                        },
                        "suggested_packs": suggested_packs,
                        "reason": reason,
                        "options": options,
                    }
                )

    # Sort: out of stock first, then low, then by name
    low_items.sort(
        key=lambda x: (
            0 if x["shop_product"]["stock_status"] == "out" else 1,
            x["shop_product"]["product"]["name"].casefold(),
        )
    )

    return {"items": low_items}


@router.post("/shop/orders/{order_id}/receive")
def receive_order(
    order_id: UUID,
    request: ReceiveOrderInput | None = None,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    """Record delivered quantities as owner-confirmed restock events."""
    shop_id = _shop_id(owner)
    order = db.scalar(
        select(SupplierOrder)
        .where(SupplierOrder.id == order_id, SupplierOrder.shop_id == shop_id)
        .with_for_update(of=SupplierOrder)
        .options(
            joinedload(SupplierOrder.shop),
            joinedload(SupplierOrder.supplier),
            selectinload(SupplierOrder.items),
            selectinload(SupplierOrder.tracking),
        )
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status != "delivered":
        raise HTTPException(status_code=409, detail="Only delivered orders can be received")

    order_items = {line.product_id: line for line in order.items}
    items = request.items if request is not None else None
    received_items = (
        {line.product_id: line.packs * line.pack_size for line in order.items}
        if items is None
        else {item.product_id: item.quantity for item in items}
    )
    if items is not None and len(received_items) != len(items):
        raise HTTPException(status_code=400, detail="Each product may appear only once")
    unknown = received_items.keys() - order_items.keys()
    if unknown:
        raise HTTPException(status_code=400, detail=f"Product {min(unknown)} not in this order")

    for product_id, quantity in received_items.items():
        client_id = uuid5(NAMESPACE_URL, f"kannect:receive:{order.id}:{product_id}")
        existing = db.scalar(
            select(StockEvent).where(
                StockEvent.shop_id == shop_id,
                StockEvent.client_id == client_id,
            )
        )
        if existing is not None:
            if existing.product_id != product_id or existing.quantity != quantity:
                raise HTTPException(
                    status_code=409,
                    detail="Order product was already received with a different quantity",
                )
            continue
        # Zero means that this product was not received; it can be reported later.
        if quantity == 0:
            continue

        shop_product = db.scalar(
            select(ShopProduct)
            .where(ShopProduct.shop_id == shop_id, ShopProduct.product_id == product_id)
            .with_for_update(of=ShopProduct)
        )
        if shop_product is None:
            product = db.get(Product, product_id)
            supplier_product = db.get(SupplierProduct, (order.supplier_id, product_id))
            if product is None or supplier_product is None:
                raise HTTPException(status_code=404, detail="Ordered product not found")
            shop_product = ShopProduct(
                shop_id=shop_id,
                product_id=product_id,
                price=product.mrp or _price_per_base_unit(
                    supplier_product.price, supplier_product.pack_size, product.unit
                ),
                cost_price=_price_per_base_unit(
                    supplier_product.price, supplier_product.pack_size, product.unit
                ),
                low_threshold=default_low_threshold(product.unit),
                needs_recount=False,
                pinned=False,
            )
            db.add(shop_product)
            db.flush()

        db.add(
            StockEvent(
                shop_id=shop_id,
                product_id=product_id,
                client_id=client_id,
                type="restock",
                quantity=quantity,
                count_source="owner_exact",
            )
        )
    db.commit()
    return _order_payload(order)


def _price_per_base_unit(pack_price: Any, pack_size: int, unit: str) -> Any:
    """Return price per piece, or per kg for gram-based products."""
    divisor = pack_size / 1000 if unit == "gram" else pack_size
    return pack_price / divisor
