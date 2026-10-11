"""Transactional retailer billing and sale stock-event endpoints."""

from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import AuthenticatedOwner, require_retailer
from app.config import get_settings
from app.db import get_db
from app.models import Bill, BillLine, Product, ShopProduct, StockEvent
from app.stock import default_low_threshold, stock_quantity

router = APIRouter(prefix="/shop/bills", tags=["billing"])
CENT = Decimal("0.01")


class BillLineInput(BaseModel):
    product_id: UUID
    quantity: int = Field(gt=0)
    price: Decimal | None = None


class BillInput(BaseModel):
    client_id: UUID
    created_at: datetime | None = None
    items: list[BillLineInput] = Field(min_length=1)
    payment_mode: Literal["cash", "upi", "card", "other"]
    customer_contact: str | None = None

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


def _canonical_product(db: Session, product: Product) -> Product | None:
    visited: set[UUID] = set()
    current = product
    while not current.is_active:
        if current.id in visited or current.merged_into_id is None:
            return None
        visited.add(current.id)
        current = db.get(Product, current.merged_into_id)
        if current is None:
            return None
    return current


def _round_money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _line_total(unit_price: Decimal, quantity: int, unit: str) -> Decimal:
    amount = unit_price * quantity
    if unit == "gram":
        amount /= Decimal(1000)
    return _round_money(amount)


def _bill_payload(bill: Bill, base_url: str) -> dict[str, Any]:
    return {
        "id": str(bill.id),
        "client_id": str(bill.client_id),
        "shop_id": str(bill.shop_id),
        "created_at": bill.created_at.astimezone(timezone.utc).isoformat(),
        "items": [
            {
                "product_id": str(line.product_id),
                "quantity": line.quantity,
                "price": float(line.unit_price),
                "name": line.name,
                "unit": line.unit,
                "line_total": float(line.line_total),
            }
            for line in bill.items
        ],
        "total": float(bill.total),
        "payment_mode": bill.payment_mode,
        "customer_contact": bill.customer_contact,
        "share_url": f"{base_url.rstrip('/')}/b/{bill.id}",
    }


def _get_bill(db: Session, shop_id: UUID, bill_id: UUID) -> Bill | None:
    return db.scalar(
        select(Bill)
        .where(Bill.shop_id == shop_id, Bill.id == bill_id)
        .options(selectinload(Bill.items))
    )


@router.post("", status_code=201)
def create_bill(
    request: BillInput,
    response: Response,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    shop_id = _shop_id(owner)
    existing = db.scalar(
        select(Bill)
        .where(Bill.shop_id == shop_id, Bill.client_id == request.client_id)
        .options(selectinload(Bill.items))
    )
    settings = get_settings()
    if existing is not None:
        response.status_code = 200
        return _bill_payload(existing, settings.public_base_url)

    requested_ids = {line.product_id for line in request.items}
    products = {
        product.id: product
        for product in db.scalars(select(Product).where(Product.id.in_(requested_ids))).all()
    }
    if len(products) != len(requested_ids):
        raise HTTPException(status_code=404, detail="Product not found")

    resolved: list[tuple[BillLineInput, Product]] = []
    for line in request.items:
        product = _canonical_product(db, products[line.product_id])
        if product is None:
            raise HTTPException(
                status_code=409, detail="Inactive product has no active merge target"
            )
        resolved.append((line, product))

    product_ids = sorted({product.id for _, product in resolved}, key=str)
    shop_rows = list(
        db.scalars(
            select(ShopProduct)
            .where(ShopProduct.shop_id == shop_id, ShopProduct.product_id.in_(product_ids))
            .order_by(ShopProduct.product_id)
            .with_for_update(of=ShopProduct)
            .options(joinedload(ShopProduct.product), selectinload(ShopProduct.stock_events))
        ).all()
    )
    shop_products = {row.product_id: row for row in shop_rows}
    for line, product in resolved:
        if product.id not in shop_products:
            resolved_price = line.price if line.price is not None else product.mrp
            if resolved_price is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "This product has no shop price or catalogue MRP. "
                        "Enter a price to complete the sale."
                    ),
                )
            row = ShopProduct(
                shop_id=shop_id,
                product_id=product.id,
                price=resolved_price,
                low_threshold=default_low_threshold(product.unit),
                needs_recount=True,
                pinned=False,
            )
            db.add(row)
            shop_products[product.id] = row
            shop_rows.append(row)

    total = Decimal("0.00")
    bill_lines: list[BillLine] = []
    line_stocks: dict[UUID, list[StockEvent]] = {
        product_id: list(row.stock_events) for product_id, row in shop_products.items()
    }
    for position, (line, product) in enumerate(resolved):
        row = shop_products[product.id]
        unit_price = line.price if line.price is not None else row.price
        line_amount = _line_total(unit_price, line.quantity, product.unit)
        total += line_amount
        bill_lines.append(
            BillLine(
                product_id=product.id,
                position=position,
                name=product.name,
                unit=product.unit,
                quantity=line.quantity,
                unit_price=unit_price,
                line_total=line_amount,
            )
        )
        sale = StockEvent(
            shop_id=shop_id,
            product_id=product.id,
            client_id=uuid4(),
            type="sale",
            quantity=line.quantity,
            created_at=request.created_at or datetime.now(timezone.utc),
        )
        db.add(sale)
        line_stocks[product.id].append(sale)

    bill = Bill(
        shop_id=shop_id,
        client_id=request.client_id,
        created_at=request.created_at or datetime.now(timezone.utc),
        total=total,
        payment_mode=request.payment_mode,
        customer_contact=request.customer_contact,
        items=bill_lines,
    )
    db.add(bill)
    for row in shop_rows:
        row.needs_recount = row.needs_recount or stock_quantity(line_stocks[row.product_id]) < 0
    try:
        db.commit()
        db.refresh(bill)
        db.refresh(row) if shop_rows else None
        bill = db.scalar(
            select(Bill)
            .where(Bill.id == bill.id)
            .options(selectinload(Bill.items))
        )
    except IntegrityError as exc:
        db.rollback()
        existing = db.scalar(
            select(Bill)
            .where(Bill.shop_id == shop_id, Bill.client_id == request.client_id)
            .options(selectinload(Bill.items))
        )
        if existing is None:
            raise HTTPException(
                status_code=409, detail="Bill conflicts with existing data"
            ) from exc
        response.status_code = 200
        return _bill_payload(existing, settings.public_base_url)
    return _bill_payload(bill, settings.public_base_url)


@router.get("")
def list_bills(
    from_time: datetime | None = Query(default=None, alias="from"),
    to_time: datetime | None = Query(default=None, alias="to"),
    cursor: str | None = Query(default=None),
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    shop_id = _shop_id(owner)
    statement = select(Bill).where(Bill.shop_id == shop_id)
    if from_time is not None:
        statement = statement.where(Bill.created_at >= from_time)
    if to_time is not None:
        statement = statement.where(Bill.created_at <= to_time)
    if cursor is not None:
        try:
            cursor_id = UUID(cursor)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid cursor") from exc
        cursor_bill = db.scalar(
            select(Bill).where(Bill.shop_id == shop_id, Bill.id == cursor_id)
        )
        if cursor_bill is None:
            raise HTTPException(status_code=400, detail="Invalid cursor")
        statement = statement.where(
            tuple_(Bill.created_at, Bill.id) < tuple_(cursor_bill.created_at, cursor_bill.id)
        )
    bills = list(
        db.scalars(
            statement.order_by(Bill.created_at.desc(), Bill.id.desc())
            .limit(21)
            .options(selectinload(Bill.items))
        ).all()
    )
    more = len(bills) > 20
    bills = bills[:20]
    return {
        "items": [_bill_payload(bill, get_settings().public_base_url) for bill in bills],
        "next_cursor": str(bills[-1].id) if more and bills else None,
    }


@router.get("/{bill_id}")
def get_bill(
    bill_id: str,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    try:
        parsed_id = UUID(bill_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Bill not found") from None
    bill = _get_bill(db, _shop_id(owner), parsed_id)
    if bill is None:
        raise HTTPException(status_code=404, detail="Bill not found")
    return _bill_payload(bill, get_settings().public_base_url)
