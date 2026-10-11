"""Retailer and supplier order lifecycle endpoints."""

import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import AuthenticatedOwner, require_retailer, require_supplier
from app.db import get_db
from app.models import (
    Invoice,
    OrderLine,
    OrderTracking,
    Product,
    Shop,
    Supplier,
    SupplierOrder,
    SupplierProduct,
)
from app.routers.supplier import _supplier_payload

shop_router = APIRouter(prefix="/shop/orders", tags=["procurement"])
supplier_router = APIRouter(prefix="/supplier/orders", tags=["supplier"])
CENT = Decimal("0.01")
ORDER_STATUSES = {"placed", "accepted", "rejected", "dispatched", "delivered", "cancelled"}
ALLOWED_TRANSITIONS = {
    "placed": {"accepted", "rejected"},
    "accepted": {"dispatched"},
    "dispatched": {"delivered"},
}


class OrderLineInput(BaseModel):
    product_id: uuid.UUID
    packs: int = Field(ge=1)


class OrderInput(BaseModel):
    client_id: uuid.UUID
    supplier_id: uuid.UUID
    items: list[OrderLineInput] = Field(min_length=1)
    note: str | None = None


class OrderStatusInput(BaseModel):
    status: Literal["accepted", "rejected", "dispatched", "delivered"]
    note: str | None = None
    eta: datetime | None = None

    @field_validator("eta")
    @classmethod
    def require_utc_eta(cls, value: datetime | None) -> datetime | None:
        if value is not None:
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("eta must include a timezone")
            return value.astimezone(UTC)
        return value


def _round_money(amount: Decimal) -> Decimal:
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def _shop_payload(shop: Shop) -> dict[str, Any]:
    location = None
    if shop.location is not None:
        from geoalchemy2.shape import to_shape

        point = to_shape(shop.location)
        location = {"lat": point.y, "lng": point.x}
    return {
        "id": str(shop.id),
        "name": shop.name,
        "address": shop.address,
        "phone": shop.phone,
        "location": location,
    }


def _order_options():
    return (
        joinedload(SupplierOrder.shop),
        joinedload(SupplierOrder.supplier),
        selectinload(SupplierOrder.items),
        selectinload(SupplierOrder.tracking),
    )


def _order_payload(order: SupplierOrder) -> dict[str, Any]:
    return {
        "id": str(order.id),
        "client_id": str(order.client_id),
        "shop": _shop_payload(order.shop),
        "supplier": _supplier_payload(order.supplier),
        "status": order.status,
        "items": [
            {
                "product_id": str(line.product_id),
                "packs": line.packs,
                "name": line.name,
                "pack_size": line.pack_size,
                "unit_price": float(line.unit_price),
                "line_total": float(line.line_total),
            }
            for line in order.items
        ],
        "total": float(order.total),
        "group_buy_id": str(order.group_buy_id) if order.group_buy_id else None,
        "tracking": [
            {
                "status": event.status,
                "at": event.at.astimezone(UTC).isoformat(),
                "note": event.note,
                "eta": event.eta.astimezone(UTC).isoformat() if event.eta else None,
            }
            for event in order.tracking
        ],
        "created_at": order.created_at.astimezone(UTC).isoformat(),
    }


def _invoice_payload(invoice: Invoice, order: SupplierOrder) -> dict[str, Any]:
    return {
        "number": invoice.number,
        "order_id": str(order.id),
        "issued_at": invoice.issued_at.astimezone(UTC).isoformat(),
        "supplier": _supplier_payload(order.supplier),
        "shop": _shop_payload(order.shop),
        "items": _order_payload(order)["items"],
        "subtotal": float(invoice.subtotal),
        "gst": float(invoice.gst),
        "tax_status": "not_implemented",
        "tax_note": (
            "GST is not currently implemented. "
            "This demo invoice is GST-ready for future work."
        ),
        "total": float(invoice.total),
        "status": invoice.status,
    }


def _get_order(db: Session, order_id: uuid.UUID, *, shop_id=None, supplier_id=None):
    statement = select(SupplierOrder).where(SupplierOrder.id == order_id)
    if shop_id is not None:
        statement = statement.where(SupplierOrder.shop_id == shop_id)
    if supplier_id is not None:
        statement = statement.where(SupplierOrder.supplier_id == supplier_id)
    return db.scalar(statement.options(*_order_options()))


def _shop_id(owner: AuthenticatedOwner) -> uuid.UUID:
    if owner.shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    return owner.shop.id


def _supplier_id(owner: AuthenticatedOwner) -> uuid.UUID:
    if owner.supplier is None:
        raise HTTPException(status_code=404, detail="Supplier profile not found")
    return owner.supplier.id


@shop_router.post("", status_code=201)
def create_order(
    request: OrderInput,
    response: Response,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    shop_id = _shop_id(owner)
    existing = db.scalar(
        select(SupplierOrder)
        .where(SupplierOrder.shop_id == shop_id, SupplierOrder.client_id == request.client_id)
        .options(*_order_options())
    )
    if existing is not None:
        response.status_code = 200
        return _order_payload(existing)

    supplier = db.get(Supplier, request.supplier_id)
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")

    resolved: list[tuple[OrderLineInput, SupplierProduct, Product]] = []
    for line in request.items:
        listing = db.get(SupplierProduct, (supplier.id, line.product_id))
        if listing is None or not listing.available:
            raise HTTPException(status_code=404, detail="Supplier product not found")
        if line.packs < listing.min_order_packs:
            raise HTTPException(status_code=400, detail="Order is below the supplier minimum")
        product = db.get(Product, line.product_id)
        if product is None:
            raise HTTPException(status_code=404, detail="Product not found")
        resolved.append((line, listing, product))

    total = _round_money(
        sum((listing.price * line.packs for line, listing, _ in resolved), Decimal(0))
    )
    order = SupplierOrder(
        id=uuid.uuid4(),
        shop_id=shop_id,
        supplier_id=supplier.id,
        client_id=request.client_id,
        status="placed",
        total=total,
        note=request.note,
    )
    db.add(order)
    try:
        db.flush()
        for position, (line, listing, product) in enumerate(resolved):
            line_total = _round_money(listing.price * line.packs)
            db.add(
                OrderLine(
                    order_id=order.id,
                    product_id=product.id,
                    position=position,
                    name=product.name,
                    packs=line.packs,
                    pack_size=listing.pack_size,
                    unit_price=listing.price,
                    line_total=line_total,
                )
            )
        db.add(OrderTracking(order_id=order.id, status="placed", note="Order placed"))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        existing = db.scalar(
            select(SupplierOrder)
            .where(SupplierOrder.shop_id == shop_id, SupplierOrder.client_id == request.client_id)
            .options(*_order_options())
        )
        if existing is not None:
            response.status_code = 200
            return _order_payload(existing)
        raise HTTPException(status_code=409, detail="Order conflicts with existing data") from exc

    order = _get_order(db, order.id)
    return _order_payload(order)


@shop_router.get("")
def list_shop_orders(
    status: Literal["placed", "accepted", "rejected", "dispatched", "delivered", "cancelled"]
    | None = Query(default=None),
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, list[dict[str, Any]]]:
    statement = select(SupplierOrder).where(SupplierOrder.shop_id == _shop_id(owner))
    if status is not None:
        statement = statement.where(SupplierOrder.status == status)
    orders = db.scalars(
        statement.options(*_order_options()).order_by(SupplierOrder.created_at.desc())
    ).all()
    return {"items": [_order_payload(order) for order in orders]}


@shop_router.get("/{order_id}")
def get_shop_order(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    order = _get_order(db, order_id, shop_id=_shop_id(owner))
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return _order_payload(order)


@shop_router.post("/{order_id}/cancel")
def cancel_shop_order(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    order = _get_order(db, order_id, shop_id=_shop_id(owner))
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "placed":
        raise HTTPException(status_code=409, detail="Only placed orders can be cancelled")
    order.status = "cancelled"
    order.tracking.append(OrderTracking(status="cancelled", note="Cancelled by retailer"))
    db.commit()
    db.refresh(order)
    return _order_payload(_get_order(db, order.id))


@supplier_router.get("")
def list_supplier_orders(
    status: Literal["placed", "accepted", "rejected", "dispatched", "delivered", "cancelled"]
    | None = Query(default=None),
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, list[dict[str, Any]]]:
    statement = select(SupplierOrder).where(SupplierOrder.supplier_id == _supplier_id(owner))
    if status is not None:
        statement = statement.where(SupplierOrder.status == status)
    orders = db.scalars(
        statement.options(*_order_options()).order_by(SupplierOrder.created_at.desc())
    ).all()
    return {"items": [_order_payload(order) for order in orders]}


@supplier_router.post("/{order_id}/status")
def transition_supplier_order(
    order_id: uuid.UUID,
    request: OrderStatusInput,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, Any]:
    order = _get_order(db, order_id, supplier_id=_supplier_id(owner))
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if request.status not in ALLOWED_TRANSITIONS.get(order.status, set()):
        raise HTTPException(status_code=409, detail="Illegal order status transition")
    if request.eta is not None and request.status not in {"accepted", "dispatched"}:
        raise HTTPException(status_code=400, detail="eta is only valid for accepted or dispatched")
    order.status = request.status
    order.tracking.append(OrderTracking(status=request.status, note=request.note, eta=request.eta))
    if request.status == "accepted":
        invoice_number = f"KN-{datetime.now(UTC):%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"
        subtotal = _round_money(order.total)
        db.add(
            Invoice(
                order_id=order.id,
                number=invoice_number,
                subtotal=subtotal,
                gst=Decimal("0.00"),
                total=subtotal,
                status="unpaid",
            )
        )
    db.commit()
    db.refresh(order)
    return _order_payload(_get_order(db, order.id))


@shop_router.get("/{order_id}/invoice")
def get_shop_invoice(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    order = _get_order(db, order_id, shop_id=_shop_id(owner))
    if order is None or order.invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _invoice_payload(order.invoice, order)


@supplier_router.get("/{order_id}/invoice")
def get_supplier_invoice(
    order_id: uuid.UUID,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, Any]:
    order = _get_order(db, order_id, supplier_id=_supplier_id(owner))
    if order is None or order.invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _invoice_payload(order.invoice, order)
