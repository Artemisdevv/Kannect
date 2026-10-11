import uuid
from decimal import Decimal

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import AuthenticatedOwner, require_supplier
from app.db import get_db
from app.errors import install
from app.models import Supplier
from app.routers import supplier_insight


class Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self

    def all(self):
        return self.rows


class FakeDB:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def execute(self, statement, params=None):
        self.calls.append((str(statement), params or {}))
        return Result(self.rows)


def client(db, supplier):
    app = FastAPI()
    install(app)
    app.include_router(supplier_insight.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[require_supplier] = lambda: AuthenticatedOwner(
        phone="+919000000101", role="supplier", shop=None, supplier=supplier
    )
    return TestClient(app)


def supplier(with_location=True):
    return Supplier(id=uuid.uuid4(), phone="+919000000101", name="S",
                    location="POINT(76 9)" if with_location else None)  # fmt: skip


ROW = {
    "product_id": uuid.uuid4(), "barcode": "8901", "name": "Cinthol soap", "name_ml": None,
    "brand": "Godrej", "size": "100g", "category": "personal_care", "unit": "piece",
    "image_url": None, "mrp": Decimal("45.00"), "shops_low_or_out": 4, "shops_total": 7,
    "supplier_sells": False,
}  # fmt: skip


def test_demand_shape_and_privacy_parameters():
    db = FakeDB([ROW])
    r = client(db, supplier()).get("/supplier/demand")
    assert r.status_code == 200
    item = r.json()["items"][0]
    assert item["shops_low_or_out"] == 4 and item["shops_total"] == 7
    assert item["product"]["mrp"] == 45.0 and item["supplier_sells"] is False
    sql, params = db.calls[0]
    assert params["min_shops"] == 3  # k-anonymity threshold is enforced in SQL via HAVING
    assert "HAVING" in sql and "shop_id" not in r.text and "shop_name" not in r.text


def test_demand_requires_supplier_profile_with_location():
    assert client(FakeDB([]), None).get("/supplier/demand").status_code == 404
    r = client(FakeDB([]), supplier(with_location=False)).get("/supplier/demand")
    assert r.status_code == 400
