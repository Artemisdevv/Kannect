"""Offline sync endpoint — batch upload of bills and stock events with per-item results."""

from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import AuthenticatedOwner, require_retailer
from app.config import get_settings
from app.db import get_db
from app.models import Bill, BillLine, Product, ShopProduct, StockEvent
from app.stock import default_low_threshold, stock_quantity

router = APIRouter(prefix="/shop", tags=["sync"])
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


class SyncRequest(BaseModel):
    bills: list[BillInput] = Field(default_factory=list)
    stock_events: list[StockEventInput] = Field(default_factory=list)


class BillResult(BaseModel):
    client_id: UUID
    status: Literal["created", "duplicate", "rejected"]
    bill: dict[str, Any] | None = None
    error: str | None = None


class StockEventResult(BaseModel):
    client_id: UUID
    status: Literal["created", "duplicate", "rejected"]
    error: str | None = None


class SyncResponse(BaseModel):
    bills: list[BillResult]
    stock_events: list[StockEventResult]
    flagged_for_recount: list[UUID]


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


def _process_bill(
    db: Session,
    shop_id: UUID,
    request: BillInput,
    base_url: str,
    line_stocks: dict[UUID, list[StockEvent]],
    shop_products: dict[UUID, ShopProduct],
) -> BillResult:
    """Process a single bill, return result. Does not commit."""
    # Idempotency check
    existing = db.scalar(
        select(Bill)
        .where(Bill.shop_id == shop_id, Bill.client_id == request.client_id)
        .options(selectinload(Bill.items))
    )
    if existing is not None:
        return BillResult(
            client_id=request.client_id,
            status="duplicate",
            bill=_bill_payload(existing, base_url),
        )

    # Validate products
    requested_ids = {line.product_id for line in request.items}
    products = {
        product.id: product
        for product in db.scalars(select(Product).where(Product.id.in_(requested_ids))).all()
    }
    if len(products) != len(requested_ids):
        return BillResult(
            client_id=request.client_id,
            status="rejected",
            error="Product not found",
        )

    # Resolve merged products
    resolved: list[tuple[BillLineInput, Product]] = []
    for line in request.items:
        product = _canonical_product(db, products[line.product_id])
        if product is None:
            return BillResult(
                client_id=request.client_id,
                status="rejected",
                error="Inactive product has no active merge target",
            )
        resolved.append((line, product))

    # Ensure shop products exist, create if needed
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
    for row in shop_rows:
        shop_products[row.product_id] = row
        if row.product_id not in line_stocks:
            line_stocks[row.product_id] = list(row.stock_events)

    for line, product in resolved:
        if product.id not in shop_products:
            resolved_price = line.price if line.price is not None else product.mrp
            if resolved_price is None:
                return BillResult(
                    client_id=request.client_id,
                    status="rejected",
                    error=(
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
            db.flush()
            shop_products[product.id] = row
            line_stocks[product.id] = []

    # Create bill lines and sale stock events
    total = Decimal("0.00")
    bill_lines: list[BillLine] = []
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
    try:
        db.flush()
        db.refresh(bill)
    except IntegrityError:
        db.rollback()
        # Race: another request created the same client_id
        existing = db.scalar(
            select(Bill)
            .where(Bill.shop_id == shop_id, Bill.client_id == request.client_id)
            .options(selectinload(Bill.items))
        )
        if existing is not None:
            return BillResult(
                client_id=request.client_id,
                status="duplicate",
                bill=_bill_payload(existing, base_url),
            )
        return BillResult(
            client_id=request.client_id,
            status="rejected",
            error="Bill conflicts with existing data",
        )

    return BillResult(
        client_id=request.client_id,
        status="created",
        bill=_bill_payload(bill, base_url),
    )


def _process_stock_event(
    db: Session,
    shop_id: UUID,
    request: StockEventInput,
    line_stocks: dict[UUID, list[StockEvent]],
    shop_products: dict[UUID, ShopProduct],
) -> StockEventResult:
    """Process a single stock event, return result. Does not commit."""
    # Idempotency check
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
            return StockEventResult(
                client_id=request.client_id,
                status="rejected",
                error="Client ID already used for another event",
            )
        return StockEventResult(
            client_id=request.client_id,
            status="duplicate",
        )

    # Validate shop product exists
    row = db.scalar(
        select(ShopProduct)
        .where(ShopProduct.shop_id == shop_id, ShopProduct.product_id == request.product_id)
        .with_for_update(of=ShopProduct)
        .options(joinedload(ShopProduct.product), selectinload(ShopProduct.stock_events))
    )
    if row is None:
        return StockEventResult(
            client_id=request.client_id,
            status="rejected",
            error="Shop product not found",
        )

    shop_products[request.product_id] = row
    if request.product_id not in line_stocks:
        line_stocks[request.product_id] = list(row.stock_events)

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
    except IntegrityError:
        db.rollback()
        existing = db.scalar(
            select(StockEvent).where(
                StockEvent.shop_id == shop_id, StockEvent.client_id == request.client_id
            )
        )
        if existing is not None and existing.product_id == request.product_id:
            return StockEventResult(
                client_id=request.client_id,
                status="duplicate",
            )
        return StockEventResult(
            client_id=request.client_id,
            status="rejected",
            error="Stock event conflicts with existing data",
        )

    line_stocks[request.product_id].append(event)
    return StockEventResult(
        client_id=request.client_id,
        status="created",
    )


@router.post("/sync")
def sync_offline(
    request: SyncRequest,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_retailer),
) -> SyncResponse:
    """Upload everything queued offline in one batch. Per-item results; never all-or-nothing."""
    shop_id = _shop_id(owner)
    base_url = get_settings().public_base_url

    # Accumulate state across all items in this sync
    line_stocks: dict[UUID, list[StockEvent]] = {}
    shop_products: dict[UUID, ShopProduct] = {}

    bill_results: list[BillResult] = []
    stock_event_results: list[StockEventResult] = []

    # Process bills first (they create sale stock events)
    for bill_request in request.bills:
        result = _process_bill(db, shop_id, bill_request, base_url, line_stocks, shop_products)
        bill_results.append(result)

    # Then process stock events
    for event_request in request.stock_events:
        result = _process_stock_event(db, shop_id, event_request, line_stocks, shop_products)
        stock_event_results.append(result)

    # Commit all successful operations
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail="Sync batch conflict") from None

    # Determine flagged products (stock went negative)
    flagged: list[UUID] = []
    for product_id, events in line_stocks.items():
        if stock_quantity(events) < 0:
            flagged.append(product_id)

    return SyncResponse(
        bills=bill_results,
        stock_events=stock_event_results,
        flagged_for_recount=flagged,
    )