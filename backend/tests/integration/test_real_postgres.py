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
from datetime import UTC, datetime, timedelta

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
    StarterPackItem,
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


def test_receive_order_is_partial_and_idempotent(world):
    supplier_phone = fake_phone()
    supplier_headers = login(supplier_phone, role="supplier")
    retailer_headers = login(world["phone_a"])
    other_retailer_headers = login(world["phone_b"])
    supplier_id = None
    order_ids: list[str] = []
    received_client_ids = []
    correction_client_id = uuid.uuid4()
    sale_client_id = uuid.uuid4()
    extra_product_id = uuid.uuid4()
    with SessionLocal() as db:
        extra = Product(
            id=extra_product_id,
            barcode=f"IR{uuid.uuid4().hex[:12]}",
            name=f"Itest Extra {world['tag']}",
            unit="piece",
            category="grocery",
            mrp=25,
            is_active=True,
        )
        db.add(extra)
        db.add(
            StockEvent(
                shop_id=world["a"],
                product_id=world["product"],
                client_id=correction_client_id,
                type="correction",
                quantity=10,
            )
        )
        db.commit()
        db.add(
            StockEvent(
                shop_id=world["a"],
                product_id=world["product"],
                client_id=sale_client_id,
                type="sale",
                quantity=8,
            )
        )
        db.commit()

    try:
        profile = client.post(
            "/api/v1/supplier",
            headers=supplier_headers,
            json={"name": "Itest Receive Supplier", "location": NEAR},
        )
        assert profile.status_code == 201, profile.text
        supplier_id = profile.json()["id"]
        for product_id, price, pack_size in (
            (world["product"], 36, 6),
            (extra_product_id, 50, 5),
        ):
            listed = client.post(
                "/api/v1/supplier/products",
                headers=supplier_headers,
                json={"product_id": str(product_id), "price": price, "pack_size": pack_size},
            )
            assert listed.status_code == 201, listed.text

        nearby = client.get(
            "/api/v1/suppliers", headers=retailer_headers, params={"q": "Itest Receive"}
        )
        assert nearby.status_code == 200, nearby.text
        assert [item["id"] for item in nearby.json()["items"]] == [supplier_id]
        catalogue = client.get(
            f"/api/v1/suppliers/{supplier_id}/products",
            headers=retailer_headers,
            params={"q": "Itest Soap"},
        )
        assert catalogue.status_code == 200, catalogue.text
        assert len(catalogue.json()["items"]) == 1
        with SessionLocal() as db:
            recent_sales = sum(
                db.scalars(
                    select(StockEvent.quantity).where(
                        StockEvent.shop_id == world["a"],
                        StockEvent.product_id == world["product"],
                        StockEvent.type == "sale",
                        StockEvent.created_at >= datetime.now(UTC) - timedelta(days=7),
                    )
                ).all()
            )
        suggestions = client.get("/api/v1/shop/reorder-suggestions", headers=retailer_headers)
        assert suggestions.status_code == 200, suggestions.text
        suggestion = next(
            item
            for item in suggestions.json()["items"]
            if item["shop_product"]["product"]["id"] == str(world["product"])
        )
        assert suggestion["shop_product"]["stock_qty"] == 2
        needed_units = max(0, recent_sales * 2 + 5 - 2)
        assert suggestion["suggested_packs"] == max(1, (needed_units + 5) // 6)
        assert f"Sold {recent_sales} in the last 7 days" in suggestion["reason"]

        order_input = {
            "client_id": str(uuid.uuid4()),
            "supplier_id": supplier_id,
            "items": [
                {"product_id": str(world["product"]), "packs": 2},
                {"product_id": str(extra_product_id), "packs": 1},
            ],
        }
        created = client.post("/api/v1/shop/orders", headers=retailer_headers, json=order_input)
        assert created.status_code == 201, created.text
        order = created.json()
        order_ids.append(order["id"])
        for status in ("accepted", "dispatched", "delivered"):
            transitioned = client.post(
                f"/api/v1/supplier/orders/{order['id']}/status",
                headers=supplier_headers,
                json={"status": status},
            )
            assert transitioned.status_code == 200, transitioned.text

        receive_url = f"/api/v1/shop/orders/{order['id']}/receive"
        partial = client.post(
            receive_url,
            headers=retailer_headers,
            json={"items": [{"product_id": str(world["product"]), "quantity": 5}]},
        )
        assert partial.status_code == 200, partial.text
        first_receipt_count = len(partial.json()["tracking"])
        assert client.post(
            receive_url,
            headers=retailer_headers,
            json={"items": [{"product_id": str(world["product"]), "quantity": 5}]},
        ).status_code == 200

        with SessionLocal() as db:
            first_key = uuid.uuid5(
                uuid.NAMESPACE_URL, f"kannect:receive:{order['id']}:{world['product']}"
            )
            received_client_ids.append(first_key)
            first_event = db.scalar(select(StockEvent).where(StockEvent.client_id == first_key))
            assert first_event is not None
            assert first_event.quantity == 5
            assert first_event.count_source == "owner_exact"
            assert db.scalar(
                select(StockEvent.id).where(
                    StockEvent.shop_id == world["a"], StockEvent.client_id == first_key
                )
            ) is not None
            second_key = uuid.uuid5(
                uuid.NAMESPACE_URL, f"kannect:receive:{order['id']}:{extra_product_id}"
            )
            received_client_ids.append(second_key)
            assert (
                db.scalar(select(StockEvent.id).where(StockEvent.client_id == second_key))
                is None
            )
            assert db.get(ShopProduct, (world["a"], extra_product_id)) is None

        replay = client.post(
            receive_url,
            headers=retailer_headers,
            json={"items": [{"product_id": str(world["product"]), "quantity": 4}]},
        )
        assert replay.status_code == 409
        assert len(partial.json()["tracking"]) == first_receipt_count

        # A missing line stays unreceived and can be received later.
        second_partial = client.post(
            receive_url,
            headers=retailer_headers,
            json={"items": [{"product_id": str(extra_product_id), "quantity": 3}]},
        )
        assert second_partial.status_code == 200, second_partial.text
        with SessionLocal() as db:
            second_event = db.scalar(select(StockEvent).where(StockEvent.client_id == second_key))
            assert second_event is not None
            assert second_event.quantity == 3
            assert second_event.count_source == "owner_exact"
            assert db.get(ShopProduct, (world["a"], extra_product_id)) is not None

        assert client.post(
            receive_url,
            headers=other_retailer_headers,
            json={"items": [{"product_id": str(world["product"]), "quantity": 5}]},
        ).status_code == 404

        # An omitted body uses the ordered quantities in base units.
        default_order = client.post(
            "/api/v1/shop/orders",
            headers=retailer_headers,
            json={**order_input, "client_id": str(uuid.uuid4())},
        )
        assert default_order.status_code == 201, default_order.text
        order_ids.append(default_order.json()["id"])
        for status in ("accepted", "dispatched", "delivered"):
            result = client.post(
                f"/api/v1/supplier/orders/{default_order.json()['id']}/status",
                headers=supplier_headers,
                json={"status": status},
            )
            assert result.status_code == 200, result.text
        default_receive = client.post(
            f"/api/v1/shop/orders/{default_order.json()['id']}/receive",
            headers=retailer_headers,
        )
        assert default_receive.status_code == 200, default_receive.text
        default_client_ids = []
        for product_id in (world["product"], extra_product_id):
            key = uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"kannect:receive:{default_order.json()['id']}:{product_id}",
            )
            received_client_ids.append(key)
            default_client_ids.append(key)
        with SessionLocal() as db:
            quantities = {
                event.product_id: event.quantity
                for event in db.scalars(
                    select(StockEvent).where(StockEvent.client_id.in_(default_client_ids))
                ).all()
            }
            assert quantities[world["product"]] == 12
            assert quantities[extra_product_id] == 5
    finally:
        with SessionLocal() as db:
            db.execute(delete(StockEvent).where(StockEvent.client_id == sale_client_id))
            db.execute(
                delete(StockEvent).where(StockEvent.client_id == correction_client_id)
            )
            if received_client_ids:
                db.execute(
                    delete(StockEvent).where(StockEvent.client_id.in_(received_client_ids))
                )
            if order_ids:
                db.execute(delete(Invoice).where(Invoice.order_id.in_(order_ids)))
                db.execute(delete(OrderTracking).where(OrderTracking.order_id.in_(order_ids)))
                db.execute(delete(OrderLine).where(OrderLine.order_id.in_(order_ids)))
                db.execute(delete(SupplierOrder).where(SupplierOrder.id.in_(order_ids)))
            db.execute(
                delete(ShopProduct).where(
                    ShopProduct.shop_id == world["a"], ShopProduct.product_id == extra_product_id
                )
            )
            if supplier_id:
                supplier = db.get(Supplier, uuid.UUID(supplier_id))
                if supplier is not None:
                    db.execute(
                        delete(SupplierProduct).where(SupplierProduct.supplier_id == supplier.id)
                    )
                    db.delete(supplier)
            db.execute(delete(OwnerIdentity).where(OwnerIdentity.phone == supplier_phone))
            db.execute(delete(Product).where(Product.id == extra_product_id))
            db.commit()


def test_starter_pack_returns_active_products_in_curated_order(world):
    retailer_headers = login(world["phone_a"])
    extra_product_id = uuid.uuid4()
    with SessionLocal() as db:
        db.add(
            Product(
                id=extra_product_id,
                barcode=f"SP{uuid.uuid4().hex[:12]}",
                name=f"Itest Starter Pack {world['tag']}",
                unit="piece",
                mrp=12,
                is_active=True,
            )
        )
        db.add_all(
            [
                StarterPackItem(
                    shop_type="grocery", product_id=extra_product_id, position=500_000
                ),
                StarterPackItem(
                    shop_type="grocery", product_id=world["product"], position=500_001
                ),
            ]
        )
        db.commit()

    try:
        response = client.get(
            "/api/v1/catalogue/starter-packs",
            headers=retailer_headers,
            params={"shop_type": "grocery"},
        )
        assert response.status_code == 200, response.text
        items = response.json()["items"]
        assert [item["id"] for item in items[-2:]] == [
            str(extra_product_id),
            str(world["product"]),
        ]
        assert items[-2]["mrp"] == 12
        assert items[-2]["barcode"] is not None
        assert (
            client.get(
                "/api/v1/catalogue/starter-packs",
                headers=retailer_headers,
                params={"shop_type": "not-a-shop-type"},
            ).status_code
                == 400
        )
        assert client.get(
            "/api/v1/catalogue/starter-packs", params={"shop_type": "grocery"}
        ).status_code == 401
    finally:
        with SessionLocal() as db:
            db.execute(
                delete(StarterPackItem).where(
                    StarterPackItem.shop_type == "grocery",
                    StarterPackItem.product_id.in_([extra_product_id, world["product"]]),
                )
            )
            db.execute(delete(Product).where(Product.id == extra_product_id))
            db.commit()
