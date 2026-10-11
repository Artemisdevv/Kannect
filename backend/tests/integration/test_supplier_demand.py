"""Supplier demand on a real PostGIS database: the k >= 3 privacy rule and the radius."""

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from geoalchemy2 import WKTElement
from sqlalchemy import delete
from sqlalchemy.engine import make_url

from app.config import get_settings
from app.db import SessionLocal
from app.main import app
from app.models import OwnerIdentity, Product, Shop, ShopProduct, StockEvent, Supplier

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_INTEGRATION") != "1", reason="set RUN_INTEGRATION=1 with a local database"
)

SAFE_HOSTS = {"localhost", "127.0.0.1", "db", "postgres"}
client = TestClient(app)


def phone() -> str:
    return "+9170" + f"{uuid.uuid4().int % 10**8:08d}"


@pytest.fixture
def world():
    assert make_url(get_settings().database_url).host in SAFE_HOSTS
    tag = uuid.uuid4().hex[:8]
    # a point in the Atlantic: no real demo shop is anywhere near, so counts are exactly ours
    lat0, lng0 = 0.5, -30.0
    made = {"shops": [], "products": [], "supplier": None, "phones": []}
    with SessionLocal() as db:
        crowded = Product(id=uuid.uuid4(), barcode=f"D3{tag}", name=f"Demand3 {tag}", unit="piece",
                          is_active=True)  # fmt: skip
        lonely = Product(id=uuid.uuid4(), barcode=f"D2{tag}", name=f"Demand2 {tag}", unit="piece",
                         is_active=True)  # fmt: skip
        db.add_all([crowded, lonely])
        for i in range(4):
            point = WKTElement(f"POINT({lng0 + i * 0.001} {lat0})", srid=4326)
            shop = Shop(id=uuid.uuid4(), name=f"d{i}{tag}", phone=phone(), language="en",
                        location=point)  # fmt: skip
            db.add(shop)
            db.flush()
            made["shops"].append(shop.id)
            # crowded: low in 3 shops, healthy in 1. lonely: low in only 2 shops
            for prod, low in ((crowded, i < 3), (lonely, i < 2)):
                db.add(ShopProduct(shop_id=shop.id, product_id=prod.id, price=10, low_threshold=5,
                                   needs_recount=False, pinned=False))  # fmt: skip
                db.flush()
                db.add(StockEvent(shop_id=shop.id, product_id=prod.id, client_id=uuid.uuid4(),
                                  type="restock", quantity=2 if low else 50))  # fmt: skip
        sup_phone = phone()
        supplier = Supplier(id=uuid.uuid4(), name=f"sup{tag}", phone=sup_phone,
                            delivery_radius_m=5000,
                            location=WKTElement(f"POINT({lng0} {lat0})", srid=4326))  # fmt: skip
        db.add(supplier)
        db.add(OwnerIdentity(phone=sup_phone, role="supplier"))
        db.commit()
        made.update(products=[crowded.id, lonely.id], supplier=supplier.id, sup_phone=sup_phone,
                    names=(crowded.name, lonely.name))  # fmt: skip
    yield made
    with SessionLocal() as db:
        db.execute(delete(StockEvent).where(StockEvent.shop_id.in_(made["shops"])))
        db.execute(delete(ShopProduct).where(ShopProduct.shop_id.in_(made["shops"])))
        db.execute(delete(Shop).where(Shop.id.in_(made["shops"])))
        db.execute(delete(Supplier).where(Supplier.id == made["supplier"]))
        db.execute(delete(OwnerIdentity).where(OwnerIdentity.phone == made["sup_phone"]))
        db.execute(delete(Product).where(Product.id.in_(made["products"])))
        db.commit()


def supplier_headers(p: str) -> dict:
    client.post("/api/v1/auth/otp/request", json={"phone": p, "role": "supplier"})
    r = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone": p, "otp": get_settings().demo_otp, "role": "supplier"},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_product_appears_only_with_three_or_more_contributing_shops(world):
    r = client.get("/api/v1/supplier/demand", headers=supplier_headers(world["sup_phone"]))
    assert r.status_code == 200, r.text
    items = {i["product"]["name"]: i for i in r.json()["items"]}
    crowded, lonely = world["names"]
    assert items[crowded]["shops_low_or_out"] == 3 and items[crowded]["shops_total"] == 4
    assert lonely not in items  # only 2 shops: hidden so one shop's stock cannot be inferred
    assert "name" not in str(r.json()["items"][0].get("shops", ""))  # no per-shop data at all


def test_retailer_cannot_read_demand(world):
    client.post("/api/v1/auth/otp/request", json={"phone": phone(), "role": "retailer"})
    assert client.get("/api/v1/supplier/demand").status_code == 401
