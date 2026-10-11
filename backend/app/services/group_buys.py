"""Group-buy rules: tier pricing and settlement at the deadline.

Settlement is lazy: any request that reads group buys first settles the ones whose deadline has
passed, so no scheduler is required. scripts/settle_group_buys.py does the same from cron.
"""

import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import OrderLine, OrderTracking, Product, SupplierOrder
from app.models.group_buy import GroupBuy, GroupBuyMember

NAMESPACE = uuid.UUID("5f0e8f0e-3b0a-4e4e-9f5d-6b1f0f6d9a11")


def normalise_tiers(tiers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort by min_packs and require price to fall as quantity rises. Raises ValueError."""
    clean = sorted(
        ({"min_packs": int(t["min_packs"]), "price": float(t["price"])} for t in tiers),
        key=lambda t: t["min_packs"],
    )
    if not clean:
        raise ValueError("At least one price tier is required")
    for i, t in enumerate(clean):
        if t["min_packs"] < 1 or t["price"] <= 0:
            raise ValueError("Tiers need min_packs >= 1 and price > 0")
        prev = clean[i - 1] if i else None
        if prev and (t["min_packs"] == prev["min_packs"] or t["price"] >= prev["price"]):
            raise ValueError("Higher tiers must need more packs and cost less per pack")
    return clean


def best_tier(tiers: list[dict[str, Any]], pooled: int) -> dict[str, Any] | None:
    reached = [t for t in tiers if pooled >= t["min_packs"]]
    return reached[-1] if reached else None


def next_tier(tiers: list[dict[str, Any]], pooled: int) -> dict[str, Any] | None:
    ahead = [t for t in tiers if t["min_packs"] > pooled]
    if not ahead:
        return None
    t = ahead[0]
    return {**t, "packs_needed": t["min_packs"] - pooled}


def current_price(group_buy: GroupBuy, pooled: int) -> float:
    tier = best_tier(group_buy.tiers, pooled)
    return tier["price"] if tier else float(group_buy.base_price)


def _money(value: Decimal | float) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def pooled_packs(db: Session, group_buy_id: uuid.UUID) -> int:
    total = db.scalar(
        select(func.coalesce(func.sum(GroupBuyMember.packs), 0)).where(
            GroupBuyMember.group_buy_id == group_buy_id
        )
    )
    return int(total or 0)


def settle_due(db: Session, now: datetime | None = None) -> int:
    """Confirm or fail every open group buy past its deadline. Returns how many were settled."""
    now = now or datetime.now(UTC)
    due = list(
        db.scalars(
            select(GroupBuy)
            .where(GroupBuy.status == "open", GroupBuy.deadline <= now)
            .with_for_update(skip_locked=True)
        ).all()
    )
    for gb in due:
        members = list(
            db.scalars(select(GroupBuyMember).where(GroupBuyMember.group_buy_id == gb.id)).all()
        )
        pooled = sum(m.packs for m in members)
        tier = best_tier(gb.tiers, pooled)
        gb.settled_at = now
        if tier is None:
            gb.status = "failed"
            continue
        gb.status = "confirmed"
        gb.final_price = _money(tier["price"])
        product = db.get(Product, gb.product_id)
        for m in members:
            _create_order(db, gb, m, product.name if product else "Product", gb.final_price, now)
    if due:
        db.commit()
    return len(due)


def _create_order(
    db: Session, gb: GroupBuy, member: GroupBuyMember, name: str, price: Decimal, now: datetime
) -> None:
    total = _money(price * member.packs)
    order = SupplierOrder(
        id=uuid.uuid4(),
        shop_id=member.shop_id,
        supplier_id=gb.supplier_id,
        # deterministic, so settling twice can never create a second order for the same member
        client_id=uuid.uuid5(NAMESPACE, f"{gb.id}:{member.shop_id}"),
        status="placed",
        total=total,
        group_buy_id=gb.id,
        note="Group buy",
        created_at=now,
    )
    db.add(order)
    db.flush()
    db.add(
        OrderLine(
            order_id=order.id, product_id=gb.product_id, position=0, name=name,
            packs=member.packs, pack_size=gb.pack_size, unit_price=price, line_total=total,
        )  # fmt: skip
    )
    db.add(OrderTracking(order_id=order.id, status="placed", at=now, note="Group buy confirmed"))
