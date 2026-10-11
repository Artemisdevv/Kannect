from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import Response
from pydantic import ValidationError

from app.config import Settings
from app.models import Bill, Product, ShopProduct, StockEvent
from app.routers import billing
from app.routers.billing import BillInput, _line_total
from app.routers.shop import StockEventInput, list_shop_products
from app.stock import stock_quantity, stock_status


def event(kind: str, quantity: int, created_at: datetime, event_id: str):
    return SimpleNamespace(
        type=kind, quantity=quantity, created_at=created_at, id=event_id
    )


def test_stock_uses_latest_absolute_correction_then_later_movements():
    before = datetime(2026, 1, 1, tzinfo=timezone.utc)
    correction = datetime(2026, 1, 2, tzinfo=timezone.utc)
    after = datetime(2026, 1, 3, tzinfo=timezone.utc)
    events = [
        event("restock", 100, before, "1"),
        event("correction", 6, correction, "2"),
        event("sale", 8, after, "3"),
        event("restock", 2, after, "4"),
    ]

    assert stock_quantity(events) == 0
    assert stock_quantity(events[:2]) == 6


@pytest.mark.parametrize(
    ("quantity", "threshold", "expected"),
    [(-2, 5, "out"), (0, 0, "out"), (2, 5, "low"), (5, 5, "in_stock"), (8, 5, "in_stock")],
)
def test_stock_status(quantity, threshold, expected):
    assert stock_status(quantity, threshold) == expected


def test_bill_line_rounds_gram_price_per_kilogram_to_cents():
    assert _line_total(Decimal("199.99"), 250, "gram") == Decimal("50.00")
    assert _line_total(Decimal("12.50"), 3, "piece") == Decimal("37.50")


def test_stock_event_validation_enforces_restock_and_correction_quantities():
    base = {
        "client_id": str(uuid4()),
        "product_id": str(uuid4()),
        "type": "restock",
        "quantity": 0,
    }
    with pytest.raises(ValidationError):
        StockEventInput.model_validate(base)

    correction = {**base, "type": "correction", "quantity": 0}
    assert StockEventInput.model_validate(correction).quantity == 0


def test_bill_rejects_empty_items_and_nonpositive_quantities():
    base = {"client_id": str(uuid4()), "payment_mode": "cash"}
    with pytest.raises(ValidationError):
        BillInput.model_validate({**base, "items": []})
    with pytest.raises(ValidationError):
        BillInput.model_validate(
            {
                **base,
                "items": [{"product_id": str(uuid4()), "quantity": 0}],
            }
        )


class Results:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class CatalogueSession:
    def __init__(self, products):
        self.products = products

    def scalars(self, _statement):
        return Results(self.products)


def test_shop_product_listing_filters_by_name_and_derived_status():
    product_id = uuid4()
    product = Product(id=product_id, name="Tea", unit="piece", is_active=False)
    row = ShopProduct(
        shop_id=uuid4(),
        product_id=product_id,
        product=product,
        price=Decimal("10.00"),
        low_threshold=3,
        needs_recount=False,
        pinned=False,
    )
    row.stock_events = [
        StockEvent(
            id=uuid4(),
            shop_id=row.shop_id,
            product_id=product_id,
            client_id=uuid4(),
            type="correction",
            quantity=2,
            count_source="owner_exact",
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
    ]
    owner = SimpleNamespace(shop=SimpleNamespace(id=row.shop_id))

    response = list_shop_products(
        q="tea", status="low", db=CatalogueSession([row]), owner=owner
    )
    assert len(response["items"]) == 1
    assert response["items"][0]["stock_qty"] == 2
    assert response["items"][0]["stock_status"] == "low"
    assert response["items"][0]["product"]["is_active"] is False


class BillingSession:
    def __init__(self, product):
        self.product = product
        self.shop_products = []
        self.added = []
        self.bill_reads = 0
        self.bill = None

    def scalar(self, statement):
        entity = statement.column_descriptions[0].get("entity")
        if entity is Bill:
            self.bill_reads += 1
            return self.bill
        return None

    def scalars(self, statement):
        entity = statement.column_descriptions[0].get("entity")
        if entity is Product:
            return Results([self.product])
        if entity is ShopProduct:
            return Results(self.shop_products)
        raise AssertionError(entity)

    def add(self, row):
        self.added.append(row)
        if isinstance(row, ShopProduct):
            self.shop_products.append(row)
        if isinstance(row, Bill):
            self.bill = row

    def commit(self):
        self.bill.id = uuid4()

    def refresh(self, _row):
        return None

    def rollback(self):
        raise AssertionError("unexpected rollback")


def test_bill_auto_adds_catalogue_product_and_records_sale_with_negative_stock(monkeypatch):
    product = Product(id=uuid4(), name="Milk", unit="piece", is_active=True)
    shop_id = uuid4()
    owner = SimpleNamespace(shop=SimpleNamespace(id=shop_id))
    session = BillingSession(product)
    settings = Settings(public_base_url="https://shop.example")
    monkeypatch.setattr(billing, "get_settings", lambda: settings)
    request = BillInput.model_validate(
        {
            "client_id": str(uuid4()),
            "payment_mode": "cash",
            "items": [
                {"product_id": str(product.id), "quantity": 2, "price": "4.50"}
            ],
        }
    )

    result = billing.create_bill(request, Response(), session, owner)

    assert result["total"] == 9.0
    assert result["items"][0]["name"] == "Milk"
    assert result["share_url"].startswith("https://shop.example/b/")
    assert len(session.shop_products) == 1
    assert session.shop_products[0].needs_recount is True
    sale_events = [row for row in session.added if isinstance(row, StockEvent)]
    assert len(sale_events) == 1
    assert sale_events[0].type == "sale"
    assert sale_events[0].quantity == 2


def test_bill_replay_returns_existing_record_with_http_200(monkeypatch):
    product = Product(id=uuid4(), name="Milk", unit="piece", is_active=True)
    shop_id = uuid4()
    existing = Bill(
        id=uuid4(),
        shop_id=shop_id,
        client_id=uuid4(),
        created_at=datetime.now(timezone.utc),
        total=Decimal("1.00"),
        payment_mode="cash",
        items=[],
    )
    session = BillingSession(product)
    session.bill = existing
    response = Response()
    monkeypatch.setattr(
        billing, "get_settings", lambda: Settings(public_base_url="https://shop.example")
    )
    request = BillInput.model_validate(
        {
            "client_id": str(existing.client_id),
            "payment_mode": "cash",
            "items": [{"product_id": str(product.id), "quantity": 1, "price": "1.00"}],
        }
    )

    owner = SimpleNamespace(shop=SimpleNamespace(id=shop_id))
    result = billing.create_bill(request, response, session, owner)

    assert result["id"] == str(existing.id)
    assert response.status_code == 200
