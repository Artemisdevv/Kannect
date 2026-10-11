"""End-to-end checks against a REAL Postgres/PostGIS database.

The other tests use fake sessions, so they cannot see SQL errors (this suite exists because a
FOR UPDATE + outer join bug and a missing shapely dependency slipped through them).

Run locally:
    docker compose up -d db
    DATABASE_URL=postgresql+psycopg://kadanet:kadanet@localhost:5432/kadanet APP_ENV=local \
        alembic upgrade head
    RUN_INTEGRATION=1 DATABASE_URL=... APP_ENV=local pytest tests/integration

Refuses to run against anything that is not a local or CI database, so it can never touch Supabase.
"""

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from geoalchemy2 import WKTElement
from sqlalchemy import delete, select
from sqlalchemy.engine import make_url

from app.config import get_settings
from app.db import SessionLocal
from app.main import app
from app.models import (
    Bill,
    BillLine,
    OwnerIdentity,
    Product,
    Shop,
    ShopProduct,
    StockEvent,
)

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_INTEGRATION") != "1", reason="set RUN_INTEGRATION=1 with a local database"
)

SAFE_HOSTS = {"localhost", "127.0.0.1", "db", "postgres"}


def fake_phone() -> str:
    return "+9170" + f"{uuid.uuid4().int % 10**8:08d}"


@pytest.fixture(scope="module")
def world():
    host = make_url(get_settings().database_url).host
    assert host in SAFE_HOSTS, f"refusing to run integration tests against {host}"

    tag = uuid.uuid4().hex[:8]
    ids: dict = {"tag": tag}
    with SessionLocal() as db:
        product = Product(
            id=uuid.uuid4(), barcode=f"IT{tag}", name=f"Itest Soap {tag}", brand="Itest",
            size="100g", unit="piece", category="personal_care", mrp=45, is_active=True,
        )  # fmt: skip
        db.add(product)
        shops = {}
        # A is the demo shopper's nearest shop, B is ~340 m away
        for key, phone, lat, lng in (
            ("a", fake_phone(), 9.9990, 76.3020),
            ("b", fake_phone(), 9.9990, 76.3050),
        ):
            shop = Shop(
                id=uuid.uuid4(), name=f"Itest Shop {key.upper()} {tag}", phone=phone,
                address="test", language="en", shop_type="grocery",
                location=WKTElement(f"POINT({lng} {lat})", srid=4326),
            )  # fmt: skip
            db.add(shop)
            db.flush()
            db.add(ShopProduct(shop_id=shop.id, product_id=product.id, price=45, low_threshold=5,
                               needs_recount=False, pinned=False))  # fmt: skip
            db.flush()
            db.add(StockEvent(shop_id=shop.id, product_id=product.id, client_id=uuid.uuid4(),
                              type="restock", quantity=10, count_source="owner_exact"))  # fmt: skip
            shops[key] = shop
        db.commit()
        ids.update(product=product.id, a=shops["a"].id, b=shops["b"].id,
                   phone_a=shops["a"].phone, phone_b=shops["b"].phone)  # fmt: skip
    try:
        yield ids
    finally:
        with SessionLocal() as db:
            both = [ids["a"], ids["b"]]
            bill_ids = list(db.scalars(select(Bill.id).where(Bill.shop_id.in_(both))))
            db.execute(delete(BillLine).where(BillLine.bill_id.in_(bill_ids)))
            db.execute(delete(Bill).where(Bill.id.in_(bill_ids)))
            shop_ids = [ids["a"], ids["b"]]
            db.execute(delete(StockEvent).where(StockEvent.shop_id.in_(shop_ids)))
            db.execute(delete(ShopProduct).where(ShopProduct.shop_id.in_(shop_ids)))
            db.execute(delete(Shop).where(Shop.id.in_(shop_ids)))
            db.execute(delete(OwnerIdentity).where(OwnerIdentity.phone.in_(
                [ids["phone_a"], ids["phone_b"]])))  # fmt: skip
            db.execute(delete(Product).where(Product.id == ids["product"]))
            db.commit()


client = TestClient(app)
NEAR = {"lat": 9.9990, "lng": 76.3020}


def login(phone: str) -> dict:
    client.post("/api/v1/auth/otp/request", json={"phone": phone, "role": "retailer"})
    r = client.post(
        "/api/v1/auth/otp/verify", json={"phone": phone, "otp": get_settings().demo_otp}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_full_loop_scan_bill_stock_drops_search_referral_ebill(world):
    q = f"Itest Soap {world['tag']}"

    # both shops start in stock and are found nearest first
    found = client.get("/api/v1/search", params={"q": q, **NEAR}).json()["results"]
    assert [x["shop"]["id"] for x in found] == [str(world["a"]), str(world["b"])]
    assert {x["stock_status"] for x in found} == {"in_stock"}

    # shop A sells everything: login works with a real shop location (shapely), billing locks rows
    headers = login(world["phone_a"])
    bill = client.post(
        "/api/v1/shop/bills", headers=headers,
        json={"client_id": str(uuid.uuid4()), "payment_mode": "cash",
              "items": [{"product_id": str(world["product"]), "quantity": 10}]},
    )  # fmt: skip
    assert bill.status_code == 201, bill.text
    assert bill.json()["total"] == 450.0

    # stock dropped: A disappears from default search, B remains; include_out shows A as out
    after = client.get("/api/v1/search", params={"q": q, **NEAR}).json()["results"]
    assert [x["shop"]["id"] for x in after] == [str(world["b"])]
    with_out = client.get("/api/v1/search", params={"q": q, "include_out": True, **NEAR}).json()
    status = {x["shop"]["id"]: x["stock_status"] for x in with_out["results"]}
    assert status == {str(world["a"]): "out", str(world["b"]): "in_stock"}

    # referral sends the customer from A to B
    ref = client.get(
        "/api/v1/search/referral",
        params={"shop_id": str(world["a"]), "product_id": str(world["product"])},
    ).json()["referral"]
    assert ref["shop"]["id"] == str(world["b"]) and ref["distance_m"] < 400

    # public shop page never leaks counts
    page = client.get(f"/api/v1/shops/{world['a']}", params={"q": q})
    assert page.status_code == 200 and "stock_qty" not in page.text

    # e-bill JSON and HTML page
    bill_id = bill.json()["id"]
    j = client.get(f"/api/v1/ebills/{bill_id}").json()
    assert j["bill"]["total"] == 450.0 and "customer" not in str(j)
    html = client.get(f"/b/{bill_id}")
    assert html.status_code == 200 and "450.00" in html.text and "IST" in html.text


def test_restock_event_path_locks_correctly(world):
    headers = login(world["phone_b"])
    r = client.post(
        "/api/v1/shop/stock-events", headers=headers,
        json={"client_id": str(uuid.uuid4()), "product_id": str(world["product"]),
              "type": "restock", "quantity": 5},
    )  # fmt: skip
    assert r.status_code == 201, r.text
