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
    Invoice,
    OrderLine,
    OrderTracking,
    OwnerIdentity,
    Product,
    Shop,
    ShopProduct,
    StockEvent,
    Supplier,
    SupplierOrder,
    SupplierProduct,
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


def login(phone: str, role: str = "retailer") -> dict:
    client.post("/api/v1/auth/otp/request", json={"phone": phone})
    r = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone": phone, "otp": get_settings().demo_otp} | {"role": role},
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


def test_supplier_profile_and_wholesale_catalogue_round_trip(world):
    phone = fake_phone()
    headers = login(phone, role="supplier")
    try:
        profile = client.post(
            "/api/v1/supplier",
            headers=headers,
            json={
                "name": "Itest Wholesale",
                "location": {"lat": 9.9312, "lng": 76.2673},
            },
        )
        assert profile.status_code == 201, profile.text
        supplier_id = profile.json()["id"]
        assert profile.json()["phone"] == phone
        assert profile.json()["location"] == {"lat": 9.9312, "lng": 76.2673}
        duplicate_profile = client.post("/api/v1/supplier", headers=headers, json={"name": "Again"})
        assert duplicate_profile.status_code == 409

        created = client.post(
            "/api/v1/supplier/products",
            headers=headers,
            json={
                "product_id": str(world["product"]),
                "price": 35.25,
                "pack_size": 12,
                "min_order_packs": 2,
            },
        )
        assert created.status_code == 201, created.text
        assert created.json()["price"] == 35.25
        assert created.json()["product"]["id"] == str(world["product"])
        duplicate_product = client.post(
            "/api/v1/supplier/products",
            headers=headers,
            json={"product_id": str(world["product"]), "price": 35.25, "pack_size": 12},
        )
        assert duplicate_product.status_code == 409

        listed = client.get("/api/v1/supplier/products", headers=headers)
        assert listed.status_code == 200, listed.text
        assert len(listed.json()["items"]) == 1
        assert listed.json()["items"][0]["supplier"]["id"] == supplier_id

        updated = client.patch(
            f"/api/v1/supplier/products/{world['product']}",
            headers=headers,
            json={"available": False},
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["available"] is False

        own_profile = client.get("/api/v1/supplier", headers=headers)
        assert own_profile.status_code == 200
        assert own_profile.json()["id"] == supplier_id
    finally:
        with SessionLocal() as db:
            supplier = db.scalar(select(Supplier).where(Supplier.phone == phone))
            if supplier is not None:
                db.execute(
                    delete(SupplierProduct).where(SupplierProduct.supplier_id == supplier.id)
                )
                db.delete(supplier)
            db.execute(delete(OwnerIdentity).where(OwnerIdentity.phone == phone))
            db.commit()


def test_orders_idempotency_cancellation_and_supplier_rejection(world):
    supplier_phone = fake_phone()
    supplier_headers = login(supplier_phone, role="supplier")
    supplier_id = None
    order_ids = []
    try:
        profile = client.post(
            "/api/v1/supplier", headers=supplier_headers, json={"name": "Itest Supplier"}
        )
        assert profile.status_code == 201, profile.text
        supplier_id = profile.json()["id"]
        product_listing = client.post(
            "/api/v1/supplier/products",
            headers=supplier_headers,
            json={"product_id": str(world["product"]), "price": 55.25, "pack_size": 6},
        )
        assert product_listing.status_code == 201, product_listing.text

        retailer_headers = login(world["phone_a"])
        client_id = str(uuid.uuid4())
        order_request = {
            "client_id": client_id,
            "supplier_id": supplier_id,
            "items": [{"product_id": str(world["product"]), "packs": 2}],
        }
        created = client.post("/api/v1/shop/orders", headers=retailer_headers, json=order_request)
        assert created.status_code == 201, created.text
        order = created.json()
        order_ids.append(order["id"])
        assert order["total"] == 110.5
        assert order["items"][0]["name"] == "Itest Soap " + world["tag"]
        assert order["items"][0]["pack_size"] == 6
        assert len(order["tracking"]) == 1

        replay = client.post("/api/v1/shop/orders", headers=retailer_headers, json=order_request)
        assert replay.status_code == 200
        assert replay.json()["id"] == order["id"]
        assert len(client.get("/api/v1/shop/orders", headers=retailer_headers).json()["items"]) == 1

        cancelled = client.post(
            f"/api/v1/shop/orders/{order['id']}/cancel", headers=retailer_headers
        )
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
        assert len(cancelled.json()["tracking"]) == 2
        assert (
            client.post(
                f"/api/v1/shop/orders/{order['id']}/cancel", headers=retailer_headers
            ).status_code
            == 409
        )

        second_request = {**order_request, "client_id": str(uuid.uuid4())}
        second = client.post("/api/v1/shop/orders", headers=retailer_headers, json=second_request)
        assert second.status_code == 201, second.text
        order_ids.append(second.json()["id"])
        listed = client.get("/api/v1/supplier/orders", headers=supplier_headers)
        assert listed.status_code == 200
        assert len(listed.json()["items"]) == 2

        accepted = client.post(
            f"/api/v1/supplier/orders/{second.json()['id']}/status",
            headers=supplier_headers,
            json={"status": "accepted", "note": "Ready to fulfill"},
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["status"] == "accepted"
        invoice_response = client.get(
            f"/api/v1/supplier/orders/{second.json()['id']}/invoice", headers=supplier_headers
        )
        assert invoice_response.status_code == 200, invoice_response.text
        invoice = invoice_response.json()
        assert invoice["subtotal"] == 110.5
        assert invoice["gst"] == 0
        assert invoice["total"] == 110.5
        assert invoice["tax_status"] == "not_implemented"
        assert "GST is not currently implemented" in invoice["tax_note"]
        shop_invoice = client.get(
            f"/api/v1/shop/orders/{second.json()['id']}/invoice", headers=retailer_headers
        )
        assert shop_invoice.status_code == 200
        assert shop_invoice.json()["number"] == invoice["number"]
        other_retailer_headers = login(world["phone_b"])
        assert (
            client.get(
                f"/api/v1/shop/orders/{second.json()['id']}/invoice",
                headers=other_retailer_headers,
            ).status_code
            == 404
        )

        third_request = {**order_request, "client_id": str(uuid.uuid4())}
        third = client.post("/api/v1/shop/orders", headers=retailer_headers, json=third_request)
        assert third.status_code == 201, third.text
        order_ids.append(third.json()["id"])
        rejected = client.post(
            f"/api/v1/supplier/orders/{third.json()['id']}/status",
            headers=supplier_headers,
            json={"status": "rejected", "note": "Unavailable"},
        )
        assert rejected.status_code == 200, rejected.text
        assert rejected.json()["status"] == "rejected"
        assert rejected.json()["tracking"][-1]["note"] == "Unavailable"
        illegal = client.post(
            f"/api/v1/supplier/orders/{third.json()['id']}/status",
            headers=supplier_headers,
            json={"status": "delivered"},
        )
        assert illegal.status_code == 409
        assert (
            client.get(
                f"/api/v1/supplier/orders/{third.json()['id']}/invoice",
                headers=supplier_headers,
            ).status_code
            == 404
        )
    finally:
        with SessionLocal() as db:
            if order_ids:
                db.execute(delete(Invoice).where(Invoice.order_id.in_(order_ids)))
                db.execute(delete(OrderTracking).where(OrderTracking.order_id.in_(order_ids)))
                db.execute(delete(OrderLine).where(OrderLine.order_id.in_(order_ids)))
                db.execute(delete(SupplierOrder).where(SupplierOrder.id.in_(order_ids)))
            if supplier_id:
                supplier = db.get(Supplier, uuid.UUID(supplier_id))
                if supplier is not None:
                    db.execute(
                        delete(SupplierProduct).where(SupplierProduct.supplier_id == supplier.id)
                    )
                    db.delete(supplier)
            db.execute(delete(OwnerIdentity).where(OwnerIdentity.phone == supplier_phone))
            db.commit()
