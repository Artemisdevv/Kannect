import csv
import io
import json
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.routers.shop import export_shop_data


class ExportSession:
    def __init__(self, shop_products, bills, events):
        self.results = [shop_products, bills, events]
        self.statements = []

    def scalars(self, statement):
        self.statements.append(statement)
        return SimpleNamespace(all=lambda: self.results[len(self.statements) - 1])


@pytest.fixture
def export_data():
    shop_id = uuid4()
    product_id = uuid4()
    bill_id = uuid4()
    event_id = uuid4()
    created_at = datetime(2026, 10, 11, tzinfo=timezone.utc)
    stock_event = SimpleNamespace(
        id=event_id,
        client_id=uuid4(),
        product_id=product_id,
        type="restock",
        quantity=10,
        count_source="owner_exact",
        created_at=created_at,
    )
    product = SimpleNamespace(
        id=product_id, name="Rice", barcode="123", unit="gram"
    )
    shop_product = SimpleNamespace(
        product_id=product_id,
        product=product,
        price=Decimal("48.00"),
        low_threshold=1000,
        needs_recount=False,
        stock_events=[stock_event],
    )
    line = SimpleNamespace(
        product_id=product_id,
        name="Rice",
        unit="gram",
        quantity=2,
        unit_price=Decimal("48.00"),
        line_total=Decimal("0.10"),
    )
    bill = SimpleNamespace(
        id=bill_id,
        client_id=uuid4(),
        created_at=created_at,
        total=Decimal("0.10"),
        payment_mode="cash",
        customer_contact=None,
        items=[line],
    )
    session = ExportSession([shop_product], [bill], [stock_event])
    owner = SimpleNamespace(shop=SimpleNamespace(id=shop_id, name="Anoop Stores"))
    return session, owner, shop_id, bill_id, event_id


def test_export_json_contains_shop_products_sales_and_stock_history(export_data):
    session, owner, shop_id, bill_id, event_id = export_data

    response = export_shop_data(format="json", db=session, owner=owner)
    payload = json.loads(response.body)

    assert response.media_type == "application/json"
    assert 'filename="kannect-shop-export.json"' in response.headers["content-disposition"]
    assert payload["shop"] == {"id": str(shop_id), "name": "Anoop Stores"}
    assert payload["products"][0]["stock_quantity"] == 10
    assert payload["bills"][0]["id"] == str(bill_id)
    assert payload["bills"][0]["items"][0]["line_total"] == "0.10"
    assert payload["stock_events"][0]["id"] == str(event_id)
    assert len(session.statements) == 3
    for statement in session.statements:
        assert str(shop_id) in map(str, statement.compile().params.values())
        assert "shop_id" in str(statement)


def test_export_csv_has_product_sale_and_stock_event_rows(export_data):
    session, owner, _shop_id, bill_id, event_id = export_data

    response = export_shop_data(format="csv", db=session, owner=owner)
    rows = list(csv.DictReader(io.StringIO(response.body.decode("utf-8-sig"))))

    assert response.media_type == "text/csv; charset=utf-8"
    assert 'filename="kannect-shop-export.csv"' in response.headers["content-disposition"]
    assert [row["record_type"] for row in rows] == ["product", "sale", "stock_event"]
    assert rows[0]["stock_quantity"] == "10"
    assert rows[1]["bill_id"] == str(bill_id)
    assert rows[1]["line_total"] == "0.10"
    assert rows[2]["stock_event_id"] == str(event_id)
    assert rows[2]["event_type"] == "restock"


def test_export_requires_a_registered_shop():
    with pytest.raises(HTTPException) as exc_info:
        export_shop_data(format="json", db=None, owner=SimpleNamespace(shop=None))

    assert exc_info.value.status_code == 404
