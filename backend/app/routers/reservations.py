"""Reserve for pickup: a shopper asks a shop to set items aside; the owner accepts or declines.

No payment and no delivery. Shoppers have no account: they give a name and phone, and keep a secret
token on their device to look at or cancel the request. Stock is only taken off when the owner marks
the pickup collected, which makes a normal bill. An accepted reservation holds the quantity in the
meantime, so two shoppers cannot both be promised the last packet.
"""

import re
import secrets
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import bindparam, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import AuthenticatedOwner, is_e164_phone, require_retailer
from app.db import get_db
from app.models import Product, Shop
from app.models.reservation import Reservation, ReservationLine
from app.routers.billing import BillInput, BillLineInput, create_bill
from app.services.stock_sql import STOCK_CTE

public_router = APIRouter(prefix="/reservations", tags=["reservations"])
shop_router = APIRouter(prefix="/shop/reservations", tags=["reservations"])

CENT = Decimal("0.01")
MAX_LINES = 10
MAX_PIECES = 20  # per line
MAX_GRAMS = 10_000  # per line (10 kg)
OPEN_PER_PHONE_PER_SHOP = 3
OPEN_PER_PHONE = 6
PENDING_PER_SHOP = 40
DEFAULT_HOLD_MINUTES = 120


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _tidy(value: str) -> str:
    return " ".join(value.split())


def normalize_phone(raw: str) -> str:
    """Indian mobile (10 digits starting 6-9, optionally with +91, 91 or 0) or any E.164 number."""
    cleaned = re.sub(r"[\s\-().]", "", raw)
    digits = cleaned.removeprefix("+")
    if not digits.isdigit():
        raise ValueError("Phone number must be digits")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        if digits[0] not in "6789":
            raise ValueError("Mobile numbers start with 6, 7, 8 or 9")
        return f"+91{digits}"
    e164 = f"+{cleaned.removeprefix('+')}"
    if cleaned.startswith("+") and is_e164_phone(e164):
        return e164
    raise ValueError("Enter a 10-digit mobile number")


class ReservationItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: UUID
    quantity: int = Field(ge=1)


class ReservationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: UUID
    shop_id: UUID
    customer_name: str = Field(min_length=2, max_length=80)
    customer_phone: str
    note: str | None = Field(default=None, max_length=300)
    items: list[ReservationItemInput] = Field(min_length=1, max_length=MAX_LINES)

    @field_validator("customer_name", mode="before")
    @classmethod
    def tidy_name(cls, value):
        return _tidy(value) if isinstance(value, str) else value

    @field_validator("note", mode="before")
    @classmethod
    def tidy_note(cls, value):
        if isinstance(value, str):
            return _tidy(value) or None
        return value

    @field_validator("customer_phone")
    @classmethod
    def phone(cls, value: str) -> str:
        return normalize_phone(value)

    @field_validator("items")
    @classmethod
    def one_line_per_product(cls, items):
        if len({i.product_id for i in items}) != len(items):
            raise ValueError("Each product may appear only once")
        return items


class AcceptInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hold_minutes: int = Field(default=DEFAULT_HOLD_MINUTES, ge=15, le=1440)


class DeclineInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = Field(default=None, max_length=200)

    @field_validator("reason", mode="before")
    @classmethod
    def tidy_reason(cls, value):
        return (_tidy(value) or None) if isinstance(value, str) else value


def effective_status(reservation: Reservation, now: datetime | None = None) -> str:
    now = now or datetime.now(UTC)
    if (
        reservation.status == "accepted"
        and reservation.hold_until is not None
        and reservation.hold_until <= now
    ):
        return "expired"
    return reservation.status


def _line_total(price: Decimal, quantity: int, unit: str) -> Decimal:
    amount = price * quantity
    return _money(amount / Decimal(1000) if unit == "gram" else amount)


def _payload(
    reservation: Reservation, shop: Shop, *, owner_view: bool, token: bool = False
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "id": str(reservation.id),
        "status": effective_status(reservation),
        "shop": {
            "id": str(shop.id),
            "name": shop.name,
            "address": shop.address,
            "phone": shop.phone,
        },
        "customer_name": reservation.customer_name,
        "customer_phone": reservation.customer_phone,
        "note": reservation.note,
        "items": [
            {
                "product_id": str(line.product_id),
                "name": line.name,
                "unit": line.unit,
                "quantity": line.quantity,
                "unit_price": float(line.unit_price),
                "line_total": float(line.line_total),
            }
            for line in reservation.lines
        ],
        "total": float(reservation.total),
        "hold_until": reservation.hold_until.astimezone(UTC).isoformat()
        if reservation.hold_until
        else None,
        "decline_reason": reservation.decline_reason,
        "created_at": reservation.created_at.astimezone(UTC).isoformat(),
    }
    if token:
        data["access_token"] = reservation.access_token
    if owner_view:
        bill_id = reservation.collected_bill_id
        data["bill_id"] = str(bill_id) if bill_id else None
    return data


def _available(
    db: Session, shop_id: UUID, product_ids: list[UUID], exclude: UUID | None = None
) -> dict[UUID, tuple[int, Decimal]]:
    """For each product: (quantity free to promise, shop price). Free = stock minus what other
    accepted, unexpired reservations are already holding."""
    stock_sql = text(
        f"WITH {STOCK_CTE} SELECT product_id, qty, price FROM stock "
        "WHERE shop_id = :shop AND product_id IN :ids"
    ).bindparams(bindparam("ids", expanding=True))
    held_sql = text(
        "SELECT rl.product_id, COALESCE(SUM(rl.quantity), 0) AS held "
        "FROM reservation_line rl JOIN reservation r ON r.id = rl.reservation_id "
        "WHERE r.shop_id = :shop AND r.status = 'accepted' "
        "AND (r.hold_until IS NULL OR r.hold_until > now()) "
        "AND rl.product_id IN :ids AND (CAST(:exclude AS uuid) IS NULL OR r.id <> :exclude) "
        "GROUP BY rl.product_id"
    ).bindparams(bindparam("ids", expanding=True))
    args = {"shop": shop_id, "ids": product_ids}
    stock = {
        r["product_id"]: (int(r["qty"]), r["price"])
        for r in db.execute(stock_sql, args).mappings()
    }
    held = {
        r["product_id"]: int(r["held"])
        for r in db.execute(held_sql, {**args, "exclude": exclude}).mappings()
    }
    return {pid: (max(0, qty - held.get(pid, 0)), price) for pid, (qty, price) in stock.items()}


def _fmt_qty(quantity: int, unit: str) -> str:
    if unit == "gram":
        return f"{quantity / 1000:g} kg"
    return str(quantity)


def _load(db: Session, reservation_id: UUID, **where: Any) -> Reservation | None:
    statement = (
        select(Reservation)
        .where(Reservation.id == reservation_id)
        .options(selectinload(Reservation.lines))
    )
    for column, value in where.items():
        statement = statement.where(getattr(Reservation, column) == value)
    return db.scalar(statement)


# ---------------------------------------------------------------- shopper (public)


@public_router.post("", status_code=201)
def create_reservation(
    request: ReservationInput,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    shop = db.get(Shop, request.shop_id)
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    existing = db.scalar(
        select(Reservation)
        .where(Reservation.shop_id == shop.id, Reservation.client_id == request.client_id)
        .options(selectinload(Reservation.lines))
    )
    if existing is not None:  # the same request sent again (flaky connection): same answer
        response.status_code = 200
        return _payload(existing, shop, owner_view=False, token=True)

    open_here = db.scalar(
        text(
            "SELECT count(*) FROM reservation WHERE customer_phone = :phone AND shop_id = :shop "
            "AND (status = 'requested' OR (status = 'accepted' AND "
            "(hold_until IS NULL OR hold_until > now())))"
        ),
        {"phone": request.customer_phone, "shop": shop.id},
    )
    if (open_here or 0) >= OPEN_PER_PHONE_PER_SHOP:
        raise HTTPException(
            status_code=409,
            detail=f"You already have {OPEN_PER_PHONE_PER_SHOP} open requests at this shop. "
            "Wait for the shop to answer, or cancel one.",
        )
    open_all = db.scalar(
        text(
            "SELECT count(*) FROM reservation WHERE customer_phone = :phone "
            "AND status IN ('requested', 'accepted')"
        ),
        {"phone": request.customer_phone},
    )
    if (open_all or 0) >= OPEN_PER_PHONE:
        raise HTTPException(status_code=409, detail="You have too many open requests right now.")
    pending = db.scalar(
        text("SELECT count(*) FROM reservation WHERE shop_id = :shop AND status = 'requested'"),
        {"shop": shop.id},
    )
    if (pending or 0) >= PENDING_PER_SHOP:
        raise HTTPException(
            status_code=409, detail="This shop has a lot of pending requests. Try again later."
        )

    ids = [i.product_id for i in request.items]
    products = {p.id: p for p in db.scalars(select(Product).where(Product.id.in_(ids))).all()}
    free = _available(db, shop.id, ids)
    lines: list[ReservationLine] = []
    total = Decimal(0)
    for position, item in enumerate(request.items):
        product = products.get(item.product_id)
        if product is None or item.product_id not in free:
            raise HTTPException(status_code=404, detail="This shop does not stock that product")
        available, price = free[item.product_id]
        limit = MAX_GRAMS if product.unit == "gram" else MAX_PIECES
        if item.quantity > limit:
            raise HTTPException(
                status_code=400,
                detail=f"You can reserve up to {_fmt_qty(limit, product.unit)} of one item.",
            )
        if item.quantity > available:
            left = _fmt_qty(available, product.unit)
            raise HTTPException(
                status_code=409,
                detail=f"{product.name}: only {left} available"
                if available > 0
                else f"{product.name} is out of stock",
            )
        line_total = _line_total(price, item.quantity, product.unit)
        total += line_total
        lines.append(
            ReservationLine(
                position=position,
                product_id=product.id,
                name=" ".join(p for p in (product.brand, product.name, product.size) if p),
                unit=product.unit,
                quantity=item.quantity,
                unit_price=price,
                line_total=line_total,
            )
        )

    reservation = Reservation(
        shop_id=shop.id,
        client_id=request.client_id,
        customer_name=request.customer_name,
        customer_phone=request.customer_phone,
        note=request.note,
        status="requested",
        access_token=secrets.token_urlsafe(24),
        total=_money(total),
        lines=lines,
    )
    db.add(reservation)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        again = db.scalar(
            select(Reservation)
            .where(Reservation.shop_id == shop.id, Reservation.client_id == request.client_id)
            .options(selectinload(Reservation.lines))
        )
        if again is None:
            raise HTTPException(status_code=409, detail="Could not save the request") from exc
        response.status_code = 200
        return _payload(again, shop, owner_view=False, token=True)
    saved = _load(db, reservation.id)
    assert saved is not None
    return _payload(saved, shop, owner_view=False, token=True)


def _shopper_reservation(db: Session, reservation_id: UUID, token: str) -> Reservation:
    reservation = _load(db, reservation_id)
    # Same answer for "no such reservation" and "wrong token": do not confirm that an id exists.
    if reservation is None or not secrets.compare_digest(reservation.access_token, token):
        raise HTTPException(status_code=404, detail="Reservation not found")
    return reservation


@public_router.get("/{reservation_id}")
def get_reservation(
    reservation_id: UUID,
    token: str = Query(..., min_length=10, max_length=64),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    reservation = _shopper_reservation(db, reservation_id, token)
    shop = db.get(Shop, reservation.shop_id)
    assert shop is not None
    return _payload(reservation, shop, owner_view=False)


@public_router.post("/{reservation_id}/cancel")
def cancel_reservation(
    reservation_id: UUID,
    token: str = Query(..., min_length=10, max_length=64),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    reservation = _shopper_reservation(db, reservation_id, token)
    shop = db.get(Shop, reservation.shop_id)
    assert shop is not None
    if reservation.status == "cancelled":
        return _payload(reservation, shop, owner_view=False)
    if reservation.status not in ("requested", "accepted"):
        raise HTTPException(status_code=409, detail="This request can no longer be cancelled")
    reservation.status = "cancelled"
    reservation.decided_at = datetime.now(UTC)
    db.commit()
    return _payload(_load(db, reservation.id) or reservation, shop, owner_view=False)


# ---------------------------------------------------------------- retailer


def _owner_shop(owner: AuthenticatedOwner) -> Shop:
    if owner.shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    return owner.shop


def _locked(db: Session, owner: AuthenticatedOwner, reservation_id: UUID) -> Reservation:
    shop = _owner_shop(owner)
    reservation = db.scalar(
        select(Reservation)
        .where(Reservation.id == reservation_id, Reservation.shop_id == shop.id)
        .with_for_update()
        .options(selectinload(Reservation.lines))
    )
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    return reservation


@shop_router.get("")
def list_reservations(
    status: str | None = Query(
        default=None,
        pattern="^(open|requested|accepted|declined|cancelled|collected|expired)$",
    ),
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, list[dict[str, Any]]]:
    shop = _owner_shop(owner)
    rows = db.scalars(
        select(Reservation)
        .where(Reservation.shop_id == shop.id)
        .order_by(Reservation.created_at.desc())
        .limit(200)
        .options(selectinload(Reservation.lines))
    ).all()
    payloads = [_payload(r, shop, owner_view=True) for r in rows]
    if status == "open":
        payloads = [p for p in payloads if p["status"] in ("requested", "accepted")]
    elif status is not None:
        payloads = [p for p in payloads if p["status"] == status]
    # needs-attention first: new requests, then accepted holds, then the rest
    order = {"requested": 0, "accepted": 1}
    payloads.sort(key=lambda p: order.get(p["status"], 2))
    return {"items": payloads}


@shop_router.post("/{reservation_id}/accept")
def accept_reservation(
    reservation_id: UUID,
    request: AcceptInput | None = None,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    reservation = _locked(db, owner, reservation_id)
    if reservation.status != "requested":
        raise HTTPException(status_code=409, detail="Only a new request can be accepted")
    ids = [line.product_id for line in reservation.lines]
    free = _available(db, reservation.shop_id, ids, exclude=reservation.id)
    for line in reservation.lines:
        available = free.get(line.product_id, (0, Decimal(0)))[0]
        if line.quantity > available:
            raise HTTPException(
                status_code=409,
                detail=f"{line.name}: only {_fmt_qty(available, line.unit)} free now. "
                "Decline it, or fix the stock count first.",
            )
    minutes = (request or AcceptInput()).hold_minutes
    now = datetime.now(UTC)
    reservation.status = "accepted"
    reservation.decided_at = now
    reservation.hold_until = now + timedelta(minutes=minutes)
    db.commit()
    return _payload(_load(db, reservation.id) or reservation, _owner_shop(owner), owner_view=True)


@shop_router.post("/{reservation_id}/decline")
def decline_reservation(
    reservation_id: UUID,
    request: DeclineInput | None = None,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    reservation = _locked(db, owner, reservation_id)
    if reservation.status not in ("requested", "accepted"):
        raise HTTPException(status_code=409, detail="This request is already closed")
    reservation.status = "declined"
    reservation.decline_reason = (request or DeclineInput()).reason
    reservation.decided_at = datetime.now(UTC)
    db.commit()
    return _payload(_load(db, reservation.id) or reservation, _owner_shop(owner), owner_view=True)


@shop_router.post("/{reservation_id}/collect")
def collect_reservation(
    reservation_id: UUID,
    payment_mode: str = Query(default="cash", pattern="^(cash|upi|card|other)$"),
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    """The shopper picked it up: sell it through the normal billing (stock drops, e-bill exists)."""
    reservation = _locked(db, owner, reservation_id)
    if reservation.status == "collected":
        return _payload(reservation, _owner_shop(owner), owner_view=True)
    if reservation.status != "accepted":
        raise HTTPException(status_code=409, detail="Accept the request before handing it over")
    bill = create_bill(
        BillInput(
            client_id=reservation.id,  # fixed id: a retry gets the same bill, never a second one
            payment_mode=payment_mode,
            items=[
                BillLineInput(
                    product_id=line.product_id, quantity=line.quantity, price=line.unit_price
                )
                for line in reservation.lines
            ],
        ),
        Response(),
        db,
        owner,
    )
    reservation = _locked(db, owner, reservation_id)  # create_bill committed and released the lock
    reservation.status = "collected"
    reservation.decided_at = reservation.decided_at or datetime.now(UTC)
    reservation.collected_bill_id = UUID(str(bill["id"]))
    db.commit()
    result = _payload(_load(db, reservation.id) or reservation, _owner_shop(owner), owner_view=True)
    result["share_url"] = bill.get("share_url")
    return result
