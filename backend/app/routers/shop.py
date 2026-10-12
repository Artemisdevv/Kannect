"""Retailer shop-product and stock-event endpoints."""

import csv
import io
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from geoalchemy2 import WKTElement
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import AuthenticatedOwner, require_retailer
from app.db import get_db
from app.models import Bill, Product, Shop, ShopProduct, StockEvent
from app.routers.auth import _shop_response
from app.stock import (
    StockLevel,
    default_low_threshold,
    rough_stock_quantity,
    shop_product_payload,
    stock_quantity,
    stock_status,
)

router = APIRouter(prefix="/shop", tags=["shop"])


ShopType = Literal["grocery", "provision", "vegetable", "stationery", "bakery", "general"]


class LocationInput(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ShopProfileInput(BaseModel):
    """Everything is optional so a new owner can register with just a name and fill in the rest."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=120)
    owner_name: str | None = Field(default=None, max_length=120)
    address: str | None = Field(default=None, max_length=500)
    location: LocationInput | None = None
    language: Literal["ml", "en"] = "ml"
    shop_type: ShopType | None = None
    phone: str | None = None  # must equal the logged-in phone if sent

    @field_validator("name", "owner_name", "address", mode="before")
    @classmethod
    def tidy_text(cls, value):
        """Trim and collapse spaces; blank becomes "not given" instead of an empty string."""
        if isinstance(value, str):
            value = " ".join(value.split())
            return value or None
        return value

    @field_validator("name")
    @classmethod
    def name_long_enough(cls, value):
        if value is not None and len(value) < 2:
            raise ValueError("Shop name must be at least 2 characters")
        return value


class ShopProfilePatch(ShopProfileInput):
    language: Literal["ml", "en"] | None = None


class ShopProductCreate(BaseModel):
    product_id: UUID
    price: Decimal
    cost_price: Decimal | None = None
    opening_stock: int | None = Field(default=None, ge=0)
    low_threshold: int | None = Field(default=None, ge=0)
    pinned: bool | None = None


class ShopProductPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    price: Decimal | None = None
    cost_price: Decimal | None = None
    low_threshold: int | None = Field(default=None, ge=0)
    pinned: bool | None = None


class BulkShopProductItem(BaseModel):
    product_id: UUID
    price: Decimal | None = None
    stock_level: StockLevel | None = None
    opening_stock: int | None = Field(default=None, ge=0)
    count_source: Literal["owner_exact", "photo_estimate", "level_guess"] = "level_guess"


class BulkShopProductInput(BaseModel):
    items: list[BulkShopProductItem]


class StockEventInput(BaseModel):
    client_id: UUID
    product_id: UUID
    type: Literal["restock", "correction"]
    quantity: int
    created_at: datetime | None = None

    @field_validator("quantity")
    @classmethod
    def check_quantity(cls, value: int, info):
        event_type = info.data.get("type")
        if event_type == "restock" and value <= 0:
            raise ValueError("Restock quantity must be greater than zero")
        if event_type == "correction" and value < 0:
            raise ValueError("Correction quantity cannot be negative")
        return value

    @field_validator("created_at")
    @classmethod
    def require_utc_timestamp(cls, value: datetime | None):
        if value is not None:
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError("created_at must include a timezone")
            return value.astimezone(timezone.utc)
        return value


def _point(location: LocationInput | None):
    if location is None:
        return None
    return WKTElement(f"POINT({location.lng} {location.lat})", srid=4326)


@router.post("", status_code=201)
def create_shop_profile(
    request: ShopProfileInput,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    """Register the owner's shop. One shop per phone; the phone comes from the login."""
    if owner.shop is not None:
        raise HTTPException(status_code=409, detail="Shop already exists")
    if request.phone is not None and request.phone != owner.phone:
        raise HTTPException(status_code=400, detail="Phone must match the authenticated owner")
    shop = Shop(
        **request.model_dump(exclude={"phone", "location"}),
        phone=owner.phone,
        location=_point(request.location),
    )
    db.add(shop)
    try:
        db.commit()
        db.refresh(shop)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Shop already exists") from exc
    return _shop_response(shop)


@router.get("")
def get_shop_profile(owner: AuthenticatedOwner = Depends(require_retailer)) -> dict[str, Any]:
    if owner.shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    return _shop_response(owner.shop)


@router.patch("")
def update_shop_profile(
    request: ShopProfilePatch,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    shop = owner.shop
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    values = request.model_dump(exclude_unset=True)
    if "phone" in values and values["phone"] != owner.phone:
        raise HTTPException(status_code=400, detail="Phone must match the authenticated owner")
    values.pop("phone", None)
    if values.get("language", "x") is None:
        values.pop("language")  # null does not clear the language
    if "location" in values:
        values["location"] = _point(request.location)
    for name, value in values.items():
        setattr(shop, name, value)
    if values:
        try:
            db.commit()
            db.refresh(shop)
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=400, detail="Invalid shop values") from exc
    return _shop_response(shop)


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


@router.get("/export")
def export_shop_data(
    format: Literal["json", "csv"] = Query(default="json"),
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> Response:
    """Download this shop's product/stock state, sales, and stock-event history."""
    shop_id = _shop_id(owner)
    products = _load_shop_products(db, shop_id)
    bills = list(
        db.scalars(
            select(Bill)
            .where(Bill.shop_id == shop_id)
            .order_by(Bill.created_at, Bill.id)
            .options(selectinload(Bill.items))
        ).all()
    )
    events = list(
        db.scalars(
            select(StockEvent)
            .where(StockEvent.shop_id == shop_id)
            .order_by(StockEvent.created_at, StockEvent.id)
        ).all()
    )

    payload = {
        "shop": {"id": str(shop_id), "name": owner.shop.name},
        "products": [
            {
                "product_id": str(row.product_id),
                "name": row.product.name,
                "barcode": row.product.barcode,
                "unit": row.product.unit,
                "price": str(row.price),
                "stock_quantity": stock_quantity(row.stock_events),
                "low_threshold": row.low_threshold,
                "needs_recount": row.needs_recount,
            }
            for row in products
        ],
        "bills": [
            {
                "id": str(bill.id),
                "client_id": str(bill.client_id),
                "created_at": bill.created_at.isoformat(),
                "total": str(bill.total),
                "payment_mode": bill.payment_mode,
                "customer_contact": bill.customer_contact,
                "items": [
                    {
                        "product_id": str(line.product_id),
                        "name": line.name,
                        "unit": line.unit,
                        "quantity": line.quantity,
                        "unit_price": str(line.unit_price),
                        "line_total": str(line.line_total),
                    }
                    for line in bill.items
                ],
            }
            for bill in bills
        ],
        "stock_events": [
            {
                "id": str(event.id),
                "client_id": str(event.client_id),
                "product_id": str(event.product_id),
                "type": event.type,
                "quantity": event.quantity,
                "count_source": event.count_source,
                "created_at": event.created_at.isoformat(),
            }
            for event in events
        ],
    }

    if format == "json":
        return Response(
            content=json.dumps(payload, ensure_ascii=False, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="kannect-shop-export.json"'},
        )

    return Response(
        content="﻿" + _readable_csv(owner.shop.name, products, bills, events),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="kannect-shop-export.csv"'},
    )


IST = timezone(timedelta(hours=5, minutes=30))
STATUS_LABELS = {"in_stock": "OK", "low": "LOW - reorder soon", "out": "OUT OF STOCK"}
EVENT_LABELS = {"restock": "Stock added", "correction": "Stock count set", "sale": "Sold"}
SOURCE_LABELS = {
    "owner_exact": "Counted by you",
    "photo_estimate": "Estimated from photo",
    "level_guess": "Rough guess",
}


def _qty_text(quantity: Any, unit: str | None) -> str:
    """Grams are shown as kg, pieces as a plain number, so a shopkeeper can read them."""
    if unit == "gram":
        kilos = Decimal(quantity) / Decimal(1000)
        return f"{kilos.normalize():f} kg"
    return f"{quantity} pcs"


def _money(value: Any) -> str:
    return f"{Decimal(value):.2f}"


def _readable_csv(shop_name: str | None, products, bills, events) -> str:
    """A spreadsheet a shopkeeper can read: summary, stock, sales and stock changes in sections."""
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    local = lambda moment: moment.astimezone(IST)  # noqa: E731
    units = {row.product_id: row.product.unit for row in products}
    names = {row.product_id: row.product.name for row in products}

    stock_rows = []
    for row in products:
        quantity = stock_quantity(row.stock_events)
        status = stock_status(quantity, row.low_threshold)
        if row.needs_recount:
            label = f"{STATUS_LABELS.get(status, status)} (recount needed)"
        else:
            label = STATUS_LABELS.get(status, status)
        stock_rows.append((row.product.name, row.product.unit, row.price, quantity, label, status))
    stock_rows.sort(key=lambda item: item[0].casefold())

    total_sales = sum((Decimal(bill.total) for bill in bills), Decimal(0))
    writer.writerow(["KANNECT SHOP REPORT"])
    writer.writerow(["Shop", shop_name or ""])
    writer.writerow(["Report date", local(datetime.now(timezone.utc)).strftime("%d %b %Y, %I:%M %p")])
    writer.writerow([])
    writer.writerow(["SUMMARY"])
    writer.writerow(["Total sales (Rs)", _money(total_sales)])
    writer.writerow(["Number of bills", len(bills)])
    writer.writerow(["Products in your shop", len(stock_rows)])
    writer.writerow(["Products low or out of stock", sum(1 for item in stock_rows if item[5] != "in_stock")])
    writer.writerow([])

    writer.writerow(["STOCK NOW (what you have in the shop today)"])
    writer.writerow(["Product", "Selling price (Rs)", "Price per", "In stock", "Status"])
    for name, unit, price, quantity, label, _ in stock_rows:
        writer.writerow(
            [name, _money(price), "kg" if unit == "gram" else "piece", _qty_text(quantity, unit), label]
        )
    writer.writerow([])

    writer.writerow(["SALES (every item you sold, newest first)"])
    writer.writerow(["Date", "Time", "Bill no.", "Item", "Quantity", "Rate (Rs)", "Amount (Rs)", "Paid by"])
    for number, bill in sorted(enumerate(bills, start=1), key=lambda pair: pair[1].created_at, reverse=True):
        when = local(bill.created_at)
        for line in bill.items:
            writer.writerow(
                [
                    when.strftime("%d %b %Y"),
                    when.strftime("%I:%M %p"),
                    number,
                    line.name,
                    _qty_text(line.quantity, line.unit),
                    _money(line.unit_price),
                    _money(line.line_total),
                    (bill.payment_mode or "").title(),
                ]
            )
    writer.writerow([])

    writer.writerow(["STOCK CHANGES (restocks, recounts and sales, newest first)"])
    writer.writerow(["Date", "Time", "Product", "What happened", "Quantity", "How it was counted"])
    for event in sorted(events, key=lambda item: item.created_at, reverse=True):
        when = local(event.created_at)
        writer.writerow(
            [
                when.strftime("%d %b %Y"),
                when.strftime("%I:%M %p"),
                names.get(event.product_id, "Removed product"),
                EVENT_LABELS.get(event.type, event.type),
                _qty_text(event.quantity, units.get(event.product_id)),
                SOURCE_LABELS.get(event.count_source or "", ""),
            ]
        )
    return output.getvalue()


@router.get("/products")
def list_shop_products(
    q: str | None = Query(default=None),
    status: Literal["in_stock", "low", "out"] | None = Query(default=None),
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, list[dict[str, Any]]]:
    shop_id = _shop_id(owner)
    products = _load_shop_products(db, shop_id)
    if q:
        folded = q.casefold()
        products = [
            row
            for row in products
            if folded in row.product.name.casefold()
            or folded in (row.product.name_ml or "").casefold()
        ]
    payloads = []
    for row in products:
        quantity = stock_quantity(row.stock_events)
        payload = shop_product_payload(row, row.product, quantity)
        if status is None or payload["stock_status"] == status:
            payloads.append(payload)
    payloads.sort(key=lambda item: item["product"]["name"].casefold())
    return {"items": payloads}


@router.post("/products", status_code=201)
def add_shop_product(
    request: ShopProductCreate,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    shop_id = _shop_id(owner)
    product = db.get(Product, request.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.is_active:
        raise HTTPException(status_code=409, detail="Inactive product cannot be added")
    existing = db.get(ShopProduct, (shop_id, product.id))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Product already belongs to this shop")

    shop_product = ShopProduct(
        shop_id=shop_id,
        product_id=product.id,
        price=request.price,
        cost_price=request.cost_price,
        low_threshold=(
            request.low_threshold
            if request.low_threshold is not None
            else default_low_threshold(product.unit)
        ),
        pinned=request.pinned if request.pinned is not None else False,
    )
    db.add(shop_product)
    db.flush()
    if request.opening_stock is not None:
        db.add(
            StockEvent(
                shop_id=shop_id,
                product_id=product.id,
                client_id=uuid4(),
                type="correction",
                quantity=request.opening_stock,
                count_source="owner_exact",
            )
        )
    try:
        db.commit()
        db.refresh(shop_product)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Product already belongs to this shop") from exc
    return shop_product_payload(
        shop_product,
        product,
        request.opening_stock if request.opening_stock is not None else 0,
    )


@router.post("/products/bulk", status_code=201)
def add_shop_products_bulk(
    request: BulkShopProductInput,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    shop_id = _shop_id(owner)
    product_ids = [item.product_id for item in request.items]
    if len(product_ids) != len(set(product_ids)):
        raise HTTPException(status_code=400, detail="Each product may appear only once")

    requested_ids = set(product_ids)
    products = {
        product.id
        : product
        for product in db.scalars(select(Product).where(Product.id.in_(requested_ids))).all()
    }
    if len(products) != len(requested_ids):
        raise HTTPException(status_code=404, detail="Product not found")
    if any(not product.is_active for product in products.values()):
        raise HTTPException(status_code=409, detail="Inactive product cannot be added")

    existing_ids = (
        set(
            db.scalars(
                select(ShopProduct.product_id).where(
                    ShopProduct.shop_id == shop_id,
                    ShopProduct.product_id.in_(requested_ids),
                )
            ).all()
        )
        if requested_ids
        else set()
    )
    # Re-photographing a shelf overlaps with what was saved before. Products the shop already has
    # are skipped (never overwritten by a photo estimate) and reported, not treated as an error.
    rows: list[tuple[ShopProduct, Product, int]] = []
    skipped: list[str] = []
    for item in request.items:
        if item.product_id in existing_ids:
            skipped.append(str(item.product_id))
            continue
        product = products[item.product_id]
        price = item.price if item.price is not None else product.mrp
        if price is None:
            raise HTTPException(
                status_code=400,
                detail=f"Product {product.id} has no price or catalogue MRP; provide a price.",
            )
        threshold = default_low_threshold(product.unit)
        stock_level = item.stock_level or "unknown"
        quantity = (
            item.opening_stock
            if item.opening_stock is not None
            else rough_stock_quantity(stock_level, threshold)
        )
        row = ShopProduct(
            shop_id=shop_id,
            product_id=product.id,
            price=price,
            low_threshold=threshold,
            needs_recount=(stock_level == "unknown" and item.opening_stock is None),
            pinned=False,
        )
        rows.append((row, product, quantity))

    try:
        db.add_all([row for row, _, _ in rows])
        db.flush()
        items_by_product = {i.product_id: i for i in request.items}
        for row, _, quantity in rows:
            item = items_by_product[row.product_id]
            db.add(
                StockEvent(
                    shop_id=shop_id,
                    product_id=row.product_id,
                    client_id=uuid4(),
                    type="correction",
                    quantity=quantity,
                    count_source=item.count_source,
                )
            )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Bulk products conflict with existing data"
        ) from exc

    return {
        "items": [
            shop_product_payload(row, product, quantity)
            for row, product, quantity in rows
        ],
        "skipped": skipped,
    }


@router.patch("/products/{product_id}")
def update_shop_product(
    product_id: UUID,
    request: ShopProductPatch,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    shop_id = _shop_id(owner)
    row = db.scalar(
        select(ShopProduct)
        .where(ShopProduct.shop_id == shop_id, ShopProduct.product_id == product_id)
        .options(joinedload(ShopProduct.product), selectinload(ShopProduct.stock_events))
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Shop product not found")
    values = request.model_dump(exclude_unset=True)
    if not values:
        return shop_product_payload(row, row.product, stock_quantity(row.stock_events))
    for name, value in values.items():
        setattr(row, name, value)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Invalid shop product values") from exc
    return shop_product_payload(row, row.product, stock_quantity(row.stock_events))


@router.post("/stock-events", status_code=201)
def create_stock_event(
    request: StockEventInput,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    shop_id = _shop_id(owner)
    row = db.scalar(
        select(ShopProduct)
        .where(ShopProduct.shop_id == shop_id, ShopProduct.product_id == request.product_id)
        .with_for_update(of=ShopProduct)
        .options(joinedload(ShopProduct.product), selectinload(ShopProduct.stock_events))
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Shop product not found")
    existing = db.scalar(
        select(StockEvent).where(
            StockEvent.shop_id == shop_id, StockEvent.client_id == request.client_id
        )
    )
    if existing is not None:
        if (
            existing.product_id != request.product_id
            or existing.type != request.type
            or existing.quantity != request.quantity
        ):
            raise HTTPException(status_code=409, detail="Client ID already used for another event")
        return shop_product_payload(row, row.product, stock_quantity(row.stock_events))

    event = StockEvent(
        shop_id=shop_id,
        product_id=request.product_id,
        client_id=request.client_id,
        type=request.type,
        quantity=request.quantity,
        count_source="owner_exact",
        created_at=request.created_at or datetime.now(timezone.utc),
    )
    db.add(event)
    try:
        db.flush()
        row.needs_recount = (
            False
            if request.type == "correction"
            else row.needs_recount or stock_quantity([*row.stock_events, event]) < 0
        )
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        existing = db.scalar(
            select(StockEvent).where(
                StockEvent.shop_id == shop_id, StockEvent.client_id == request.client_id
            )
        )
        if existing is not None and existing.product_id == request.product_id:
            row = db.scalar(
                select(ShopProduct)
                .where(ShopProduct.shop_id == shop_id, ShopProduct.product_id == request.product_id)
                .options(
                    joinedload(ShopProduct.product), selectinload(ShopProduct.stock_events)
                )
            )
            return shop_product_payload(row, row.product, stock_quantity(row.stock_events))
        raise HTTPException(
            status_code=409, detail="Stock event conflicts with existing data"
        ) from exc
    return shop_product_payload(row, row.product, stock_quantity([*row.stock_events, event]))


@router.get("/recount-suggestions")
def recount_suggestions(
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, list[dict[str, Any]]]:
    rows = _load_shop_products(db, _shop_id(owner))
    source_rank = {"photo_estimate": 0, "level_guess": 1, "owner_exact": 2, None: 3}

    def priority(row: ShopProduct) -> tuple[int, int, int, str]:
        latest_source = next(
            (
                event.count_source
                for event in sorted(
                    row.stock_events, key=lambda item: (item.created_at, str(item.id)), reverse=True
                )
                if event.type == "correction" and event.count_source is not None
            ),
            None,
        )
        return (
            0 if row.needs_recount else 1,
            source_rank.get(latest_source, 3),
            0 if row.product.unit == "gram" else 1,
            row.product.name.casefold(),
        )

    rows.sort(key=priority)
    return {
        "items": [
            shop_product_payload(row, row.product, stock_quantity(row.stock_events))
            for row in rows[:15]
        ]
    }
