"""Recount: set stock to a counted or photo-estimated figure for products the shop already has.

Onboarding (`POST /shop/products/bulk`) skips products the shop already stocks, so a second photo
never refreshed counts. This endpoint does that on purpose, as absolute `correction` events with
the source of the figure recorded, so exact counts stay distinguishable from guesses.
"""

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import AuthenticatedOwner, require_retailer
from app.db import get_db
from app.models import ShopProduct, StockEvent
from app.stock import (
    StockLevel,
    rough_stock_quantity,
    shop_product_payload,
    stock_quantity,
    stock_status,
)

router = APIRouter(prefix="/shop", tags=["shop"])

CountSource = Literal["owner_exact", "photo_estimate", "level_guess"]


class RecountItem(BaseModel):
    client_id: UUID
    product_id: UUID
    quantity: int | None = Field(default=None, ge=0)
    stock_level: StockLevel | None = None
    count_source: CountSource = "owner_exact"

    @model_validator(mode="after")
    def exactly_one_figure(self):
        if (self.quantity is None) == (self.stock_level is None):
            raise ValueError("Send either quantity or stock_level")
        if self.stock_level == "unknown":
            raise ValueError("stock_level cannot be unknown in a recount")
        if self.quantity is not None and self.count_source != "owner_exact":
            raise ValueError("An exact quantity must have count_source owner_exact")
        if self.stock_level is not None and self.count_source == "owner_exact":
            raise ValueError("A level is an estimate, use photo_estimate or level_guess")
        return self


class RecountInput(BaseModel):
    items: list[RecountItem] = Field(min_length=1, max_length=200)


def decide(current_qty: int, threshold: int, item: RecountItem) -> tuple[int, str | None]:
    """Return (new quantity, skip reason). An estimate that lands in the same stock band as
    the current figure changes nothing, so a photo never overwrites a good exact count with a
    rougher number. If the photo disagrees (says low or out), the correction applies."""
    if item.quantity is not None:
        return item.quantity, None
    new_qty = rough_stock_quantity(item.stock_level, threshold)
    if stock_status(new_qty, threshold) == stock_status(current_qty, threshold):
        return current_qty, "unchanged"
    return new_qty, None


@router.post("/recount")
def recount(
    request: RecountInput,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    if owner.shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    shop_id = owner.shop.id
    ids = [item.product_id for item in request.items]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Each product may appear only once")

    rows = {
        row.product_id: row
        for row in db.scalars(
            select(ShopProduct)
            .where(ShopProduct.shop_id == shop_id, ShopProduct.product_id.in_(ids))
            .with_for_update(of=ShopProduct)
            .options(joinedload(ShopProduct.product), selectinload(ShopProduct.stock_events))
        ).all()
    }
    seen = set(
        db.scalars(
            select(StockEvent.client_id).where(
                StockEvent.shop_id == shop_id,
                StockEvent.client_id.in_([item.client_id for item in request.items]),
            )
        ).all()
    )

    updated: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    for item in request.items:
        row = rows.get(item.product_id)
        if row is None:
            skipped.append({"product_id": str(item.product_id), "reason": "not_in_shop"})
            continue
        if item.client_id in seen:  # a retried request: already applied
            skipped.append({"product_id": str(item.product_id), "reason": "already_applied"})
            continue
        current = stock_quantity(row.stock_events)
        new_qty, reason = decide(current, row.low_threshold, item)
        if reason is not None:
            skipped.append({"product_id": str(item.product_id), "reason": reason})
            continue
        db.add(
            StockEvent(
                shop_id=shop_id,
                product_id=item.product_id,
                client_id=item.client_id,
                type="correction",
                quantity=new_qty,
                count_source=item.count_source,
            )
        )
        row.needs_recount = False
        updated.append(
            shop_product_payload(row, row.product, new_qty) | {"previous_qty": current}
        )

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Recount conflicts with existing data") from exc
    return {"items": updated, "skipped": skipped}
