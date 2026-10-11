"""Group buys. Suppliers open them with price tiers, nearby retailers join with packs.

Aggregated only: retailers see how many shops and packs are pooled, never which shops.
"""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2 import Geography
from pydantic import BaseModel, Field
from sqlalchemy import cast, func, select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedOwner, require_retailer, require_supplier
from app.db import get_db
from app.models import Product, Shop, Supplier, SupplierProduct
from app.models.group_buy import GroupBuy, GroupBuyMember
from app.routers.auth import _supplier_response
from app.routers.catalogue import _product_response
from app.services import group_buys as svc

supplier_router = APIRouter(prefix="/supplier", tags=["supplier"])
retailer_router = APIRouter(tags=["procurement"])

MAX_DAYS = 30
MIN_LEAD = timedelta(minutes=1)


class TierInput(BaseModel):
    min_packs: int = Field(ge=1)
    price: float = Field(gt=0)


class GroupBuyInput(BaseModel):
    product_id: UUID
    tiers: list[TierInput] = Field(min_length=1, max_length=6)
    deadline: datetime


class JoinInput(BaseModel):
    packs: int = Field(ge=1, le=100000)


def _payload(
    db: Session, gb: GroupBuy, pooled: int, joined: int, my_packs: int | None
) -> dict[str, Any]:
    supplier = db.get(Supplier, gb.supplier_id)
    product = db.get(Product, gb.product_id)
    return {
        "id": str(gb.id),
        "supplier": _supplier_response(supplier),
        "product": _product_response(product),
        "pack_size": gb.pack_size,
        "tiers": gb.tiers,
        "pooled_packs": pooled,
        "shops_joined": joined,
        "current_price": (
            float(gb.final_price) if gb.final_price is not None else svc.current_price(gb, pooled)
        ),
        "next_tier": svc.next_tier(gb.tiers, pooled) if gb.status == "open" else None,
        "deadline": gb.deadline.astimezone(UTC).isoformat(),
        "status": gb.status,
        "my_packs": my_packs,
    }


Totals = dict[UUID, tuple[int, int, int | None]]


def _totals(db: Session, ids: list[UUID], shop_id: UUID | None) -> Totals:
    rows = db.execute(
        select(
            GroupBuyMember.group_buy_id,
            func.coalesce(func.sum(GroupBuyMember.packs), 0),
            func.count(),
        )
        .where(GroupBuyMember.group_buy_id.in_(ids))
        .group_by(GroupBuyMember.group_buy_id)
    ).all()
    mine: dict[UUID, int] = {}
    if shop_id is not None:
        mine = dict(
            db.execute(
                select(GroupBuyMember.group_buy_id, GroupBuyMember.packs).where(
                    GroupBuyMember.group_buy_id.in_(ids), GroupBuyMember.shop_id == shop_id
                )
            ).all()
        )
    out = {i: (0, 0, None) for i in ids}
    for gid, pooled, joined in rows:
        out[gid] = (int(pooled), int(joined), mine.get(gid))
    for gid, packs in mine.items():
        pooled, joined, _ = out[gid]
        out[gid] = (pooled, joined, packs)
    return out


# ---------------- supplier ----------------


@supplier_router.post("/group-buys", status_code=201)
def create_group_buy(
    request: GroupBuyInput,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, Any]:
    if owner.supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    now = datetime.now(UTC)
    deadline = request.deadline if request.deadline.tzinfo else request.deadline.replace(tzinfo=UTC)
    if deadline < now + MIN_LEAD or deadline > now + timedelta(days=MAX_DAYS):
        raise HTTPException(
            status_code=400, detail=f"Deadline must be within the next {MAX_DAYS} days"
        )
    try:
        tiers = svc.normalise_tiers([t.model_dump() for t in request.tiers])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    listing = db.get(SupplierProduct, (owner.supplier.id, request.product_id))
    if listing is None or not listing.available:
        raise HTTPException(status_code=400, detail="List this product in your catalogue first")
    if tiers[0]["price"] > float(listing.price):
        raise HTTPException(status_code=400, detail="Tier prices must not exceed your list price")

    gb = GroupBuy(
        supplier_id=owner.supplier.id, product_id=request.product_id, pack_size=listing.pack_size,
        base_price=listing.price, tiers=tiers, deadline=deadline, status="open",
    )  # fmt: skip
    db.add(gb)
    db.commit()
    db.refresh(gb)
    return _payload(db, gb, 0, 0, None)


@supplier_router.get("/group-buys")
def list_supplier_group_buys(
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, Any]:
    if owner.supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    svc.settle_due(db)
    rows = list(
        db.scalars(
            select(GroupBuy)
            .where(GroupBuy.supplier_id == owner.supplier.id)
            .order_by(GroupBuy.created_at.desc())
            .limit(100)
        ).all()
    )
    totals = _totals(db, [g.id for g in rows], None)
    return {"items": [_payload(db, g, totals[g.id][0], totals[g.id][1], None) for g in rows]}


# ---------------- retailer ----------------


def _nearby_open(shop: Shop):
    """Open group buys from suppliers whose delivery radius covers this shop."""
    return (
        select(GroupBuy)
        .join(Supplier, Supplier.id == GroupBuy.supplier_id)
        .where(
            GroupBuy.status == "open",
            GroupBuy.deadline > func.now(),
            func.ST_DWithin(
                cast(Supplier.location, Geography),
                # read the shop's point in SQL, a loaded geometry object cannot be bound here
                cast(select(Shop.location).where(Shop.id == shop.id).scalar_subquery(), Geography),
                Supplier.delivery_radius_m,
            ),
        )
    )


@retailer_router.get("/group-buys")
def list_open_group_buys(
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    shop = owner.shop
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    if shop.location is None:
        raise HTTPException(status_code=400, detail="Set the shop location first")
    svc.settle_due(db)
    rows = list(db.scalars(_nearby_open(shop).order_by(GroupBuy.deadline).limit(100)).all())
    totals = _totals(db, [g.id for g in rows], shop.id)
    return {"items": [_payload(db, g, *totals[g.id]) for g in rows]}


@retailer_router.post("/group-buys/{group_buy_id}/join", status_code=201)
def join_group_buy(
    group_buy_id: UUID,
    request: JoinInput,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    """Set this shop's committed packs. Calling again replaces the earlier commitment."""
    shop = owner.shop
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    if shop.location is None:
        raise HTTPException(status_code=400, detail="Set the shop location first")
    svc.settle_due(db)
    gb = db.scalars(
        _nearby_open(shop).where(GroupBuy.id == group_buy_id).with_for_update(of=GroupBuy)
    ).first()
    if gb is None:
        existing = db.get(GroupBuy, group_buy_id)
        if existing is not None and existing.status != "open":
            raise HTTPException(status_code=409, detail="This group buy is closed")
        raise HTTPException(status_code=404, detail="Group buy not found")
    member = db.get(GroupBuyMember, (gb.id, shop.id))
    if member is None:
        db.add(GroupBuyMember(group_buy_id=gb.id, shop_id=shop.id, packs=request.packs))
    else:
        member.packs = request.packs
    db.commit()
    pooled, joined, mine = _totals(db, [gb.id], shop.id)[gb.id]
    return _payload(db, gb, pooled, joined, mine)
