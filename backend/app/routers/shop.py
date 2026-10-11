"""Retailer shop-product and stock-event endpoints."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import AuthenticatedOwner, require_retailer
from app.db import get_db
from app.models import Product, ShopProduct, StockEvent
from app.stock import default_low_threshold, shop_product_payload, stock_quantity

router = APIRouter(prefix="/shop", tags=["shop"])


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
        .with_for_update()
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
    source_rank = {"level_guess": 0, "photo_estimate": 1, "owner_exact": 2, None: 3}

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
            0 if row.product.unit == "gram" else 1,
            source_rank.get(latest_source, 3),
            row.product.name.casefold(),
        )

    rows.sort(key=priority)
    return {
        "items": [
            shop_product_payload(row, row.product, stock_quantity(row.stock_events))
            for row in rows[:15]
        ]
    }
