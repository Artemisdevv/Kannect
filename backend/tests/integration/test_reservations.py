# ruff: noqa: E501
"""Reserve for pickup, on a real PostGIS database.

A shopper (no account) asks a shop to set items aside; the owner accepts or declines; an accepted
request holds the quantity so two shoppers cannot both be promised the last packet; collecting it
sells through normal billing. Needs RUN_INTEGRATION=1 and a local database.
"""

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from geoalchemy2 import WKTElement
from sqlalchemy import delete, select, update
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
from app.models.reservation import Reservation, ReservationLine

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_INTEGRATION") != "1", reason="set RUN_INTEGRATION=1 with a local database"
)

client = TestClient(app)


def phone() -> str:
    return "+9170" + f"{uuid.uuid4().int % 10**8:08d}"


@pytest.fixture
def world():
    assert make_url(get_settings().database_url).host in {"localhost", "127.0.0.1", "db", "postgres"}
    tag = uuid.uuid4().hex[:6]
    w: dict = {"tag": tag, "owner": phone(), "other_owner": phone()}
    with SessionLocal() as db:
        biscuit = Product(id=uuid.uuid4(), barcode=f"R{tag}", name=f"Resv Biscuit {tag}", brand="Rtest",
                          size="50 g", unit="piece", is_active=True)  # fmt: skip
        tomato = Product(id=uuid.uuid4(), barcode=None, name=f"Resv Tomato {tag}", unit="gram", is_active=True)
        db.add_all([biscuit, tomato])
        shops = {}
        for key, ph, lng in (("a", w["owner"], 76.3020), ("b", w["other_owner"], 76.3040)):
            shop = Shop(id=uuid.uuid4(), name=f"Resv Shop {key} {tag}", phone=ph, address="Kaloor", language="en",
                        shop_type="grocery", location=WKTElement(f"POINT({lng} 9.9990)", srid=4326))  # fmt: skip
            db.add(shop)
            db.flush()
            shops[key] = shop
        db.flush()
        for product, price, qty in ((biscuit, 10, 10), (tomato, 40, 5000)):
            db.add(ShopProduct(shop_id=shops["a"].id, product_id=product.id, price=price, low_threshold=5,
                               needs_recount=False, pinned=False))  # fmt: skip
            db.flush()
            db.add(StockEvent(shop_id=shops["a"].id, product_id=product.id, client_id=uuid.uuid4(),
                              type="correction", quantity=qty, count_source="owner_exact"))  # fmt: skip
        db.commit()
        w.update(shop=shops["a"].id, other_shop=shops["b"].id, biscuit=biscuit.id, tomato=tomato.id)
    yield w
    with SessionLocal() as db:
        res_ids = list(db.scalars(select(Reservation.id).where(Reservation.shop_id.in_([w["shop"], w["other_shop"]]))))
        db.execute(delete(ReservationLine).where(ReservationLine.reservation_id.in_(res_ids)))
        db.execute(delete(Reservation).where(Reservation.id.in_(res_ids)))
        bill_ids = list(db.scalars(select(Bill.id).where(Bill.shop_id == w["shop"])))
        db.execute(delete(BillLine).where(BillLine.bill_id.in_(bill_ids)))
        db.execute(delete(Bill).where(Bill.id.in_(bill_ids)))
        db.execute(delete(StockEvent).where(StockEvent.shop_id == w["shop"]))
        db.execute(delete(ShopProduct).where(ShopProduct.shop_id == w["shop"]))
        db.execute(delete(Shop).where(Shop.id.in_([w["shop"], w["other_shop"]])))
        db.execute(delete(OwnerIdentity).where(OwnerIdentity.phone.in_([w["owner"], w["other_owner"]])))
        db.execute(delete(Product).where(Product.id.in_([w["biscuit"], w["tomato"]])))
        db.commit()


def owner_headers(p: str) -> dict:
    client.post("/api/v1/auth/otp/request", json={"phone": p, "role": "retailer"})
    r = client.post("/api/v1/auth/otp/verify", json={"phone": p, "otp": get_settings().demo_otp, "role": "retailer"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def reserve(w, items, name="Asha K", phone_no="98765 43210", **extra):
    body = {"client_id": str(uuid.uuid4()), "shop_id": str(w["shop"]), "customer_name": name,
            "customer_phone": phone_no, "items": [{"product_id": str(p), "quantity": q} for p, q in items], **extra}  # fmt: skip
    return client.post("/api/v1/reservations", json=body), body


def stock_of(w, headers, product) -> int:
    rows = client.get("/api/v1/shop/products", headers=headers).json()["items"]
    return next(x["stock_qty"] for x in rows if x["product"]["id"] == str(product))


def test_shopper_reserves_owner_accepts_and_collecting_sells_through_billing(world):
    w, h = world, owner_headers(world["owner"])
    r, _ = reserve(w, [(w["biscuit"], 3), (w["tomato"], 500)])
    assert r.status_code == 201, r.text
    res = r.json()
    assert res["status"] == "requested" and res["customer_phone"] == "+919876543210"  # normalised
    assert res["total"] == 50.0  # 3 x 10 + 0.5 kg x 40
    token, rid = res["access_token"], res["id"]
    assert [i["quantity"] for i in res["items"]] == [3, 500]

    # the shopper can read it with the token and only with the token
    assert client.get(f"/api/v1/reservations/{rid}", headers={"X-Reservation-Token": token}).json()["status"] == "requested"
    assert client.get(f"/api/v1/reservations/{rid}", headers={"X-Reservation-Token": "x" * 24}).status_code == 404
    assert "access_token" not in client.get(f"/api/v1/reservations/{rid}", headers={"X-Reservation-Token": token}).json()

    # the owner sees it first in the list and accepts it
    listing = client.get("/api/v1/shop/reservations", headers=h).json()["items"]
    assert listing[0]["id"] == rid and listing[0]["customer_name"] == "Asha K"
    acc = client.post(f"/api/v1/shop/reservations/{rid}/accept", headers=h, json={"hold_minutes": 60})
    assert acc.status_code == 200 and acc.json()["status"] == "accepted" and acc.json()["hold_until"]
    assert stock_of(w, h, w["biscuit"]) == 10  # nothing is taken off until it is handed over

    # the held 3 are no longer free to promise: 10 - 3 = 7 left for the next shopper
    over, _ = reserve(w, [(w["biscuit"], 8)], name="Ravi M", phone_no="9123456789")
    assert over.status_code == 409 and "only 7 available" in over.json()["error"]["message"]
    ok, _ = reserve(w, [(w["biscuit"], 7)], name="Ravi M", phone_no="9123456789")
    assert ok.status_code == 201

    # collecting makes a bill: stock drops, the reservation links to it, a retry does not sell twice
    col = client.post(f"/api/v1/shop/reservations/{rid}/collect", headers=h)
    assert col.status_code == 200, col.text
    assert col.json()["status"] == "collected" and col.json()["bill_id"] and col.json()["share_url"]
    assert stock_of(w, h, w["biscuit"]) == 7 and stock_of(w, h, w["tomato"]) == 4500
    again = client.post(f"/api/v1/shop/reservations/{rid}/collect", headers=h)
    assert again.status_code == 200 and again.json()["bill_id"] == col.json()["bill_id"]
    assert stock_of(w, h, w["biscuit"]) == 7
    assert client.get(f"/api/v1/reservations/{rid}", headers={"X-Reservation-Token": token}).json()["status"] == "collected"


def test_cannot_reserve_what_the_shop_does_not_have_or_too_much(world):
    w = world
    assert reserve(w, [(w["biscuit"], 11)])[0].status_code == 409  # only 10 in stock
    assert reserve(w, [(w["biscuit"], 21)])[0].status_code == 400  # over the per-line limit
    assert reserve(w, [(w["tomato"], 10_001)])[0].status_code == 400
    assert reserve(w, [(uuid.uuid4(), 1)])[0].status_code == 404  # not a product here
    assert reserve(w, [(w["biscuit"], 1)], phone_no="12345")[0].status_code == 400
    assert reserve(w, [(w["biscuit"], 1)], name="A")[0].status_code == 400
    missing = client.post("/api/v1/reservations", json={"client_id": str(uuid.uuid4()), "shop_id": str(uuid.uuid4()),
                          "customer_name": "Asha", "customer_phone": "9876543210", "items": [{"product_id": str(w["biscuit"]), "quantity": 1}]})  # fmt: skip
    assert missing.status_code == 404
    h = owner_headers(w["owner"])
    assert client.get("/api/v1/shop/reservations", headers=h).json()["items"] == []  # nothing was saved


def test_same_client_id_is_the_same_reservation(world):
    w = world
    first, body = reserve(w, [(w["biscuit"], 1)])
    second = client.post("/api/v1/reservations", json=body)
    assert first.status_code == 201 and second.status_code == 200
    assert second.json()["id"] == first.json()["id"]


def test_shopper_cancel_owner_decline_and_closed_requests(world):
    w, h = world, owner_headers(world["owner"])
    a, _ = reserve(w, [(w["biscuit"], 1)])
    b, _ = reserve(w, [(w["biscuit"], 1)], phone_no="9000011111")
    ra, rb = a.json(), b.json()

    cancelled = client.post(f"/api/v1/reservations/{ra['id']}/cancel", headers={"X-Reservation-Token": ra["access_token"]})
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
    assert client.post(f"/api/v1/reservations/{ra['id']}/cancel", headers={"X-Reservation-Token": "nope" * 6}).status_code == 404
    assert client.post(f"/api/v1/shop/reservations/{ra['id']}/accept", headers=h).status_code == 409  # already closed

    declined = client.post(f"/api/v1/shop/reservations/{rb['id']}/decline", headers=h, json={"reason": "  Sold   out today "})
    assert declined.json()["status"] == "declined" and declined.json()["decline_reason"] == "Sold out today"
    seen = client.get(f"/api/v1/reservations/{rb['id']}", headers={"X-Reservation-Token": rb["access_token"]}).json()
    assert seen["status"] == "declined" and seen["decline_reason"] == "Sold out today"
    assert client.post(f"/api/v1/reservations/{rb['id']}/cancel", headers={"X-Reservation-Token": rb["access_token"]}).status_code == 409
    assert client.post(f"/api/v1/shop/reservations/{rb['id']}/collect", headers=h).status_code == 409  # never accepted


def test_a_shopper_cannot_flood_one_shop(world):
    w = world
    for _ in range(3):
        assert reserve(w, [(w["biscuit"], 1)], phone_no="9988776655")[0].status_code == 201
    blocked, _ = reserve(w, [(w["biscuit"], 1)], phone_no="9988776655")
    assert blocked.status_code == 409 and "open requests" in blocked.json()["error"]["message"]
    assert reserve(w, [(w["biscuit"], 1)], phone_no="9988776600")[0].status_code == 201  # others unaffected


def test_a_hold_that_ran_out_no_longer_blocks_stock_and_shows_expired(world):
    w, h = world, owner_headers(world["owner"])
    r, _ = reserve(w, [(w["biscuit"], 10)])
    rid, token = r.json()["id"], r.json()["access_token"]
    assert client.post(f"/api/v1/shop/reservations/{rid}/accept", headers=h, json={"hold_minutes": 15}).status_code == 200
    assert reserve(w, [(w["biscuit"], 1)], phone_no="9000022222")[0].status_code == 409  # all 10 are held
    with SessionLocal() as db:
        db.execute(update(Reservation).where(Reservation.id == uuid.UUID(rid)).values(hold_until=datetime.now(UTC) - timedelta(minutes=1)))
        db.commit()
    assert client.get(f"/api/v1/reservations/{rid}", headers={"X-Reservation-Token": token}).json()["status"] == "expired"
    assert client.get("/api/v1/shop/reservations", headers=h, params={"status": "expired"}).json()["items"][0]["id"] == rid
    assert reserve(w, [(w["biscuit"], 1)], phone_no="9000022222")[0].status_code == 201  # free again


def test_only_the_shops_own_owner_can_act_on_a_reservation(world):
    w = world
    r, _ = reserve(w, [(w["biscuit"], 1)])
    rid = r.json()["id"]
    other = owner_headers(w["other_owner"])
    assert client.get("/api/v1/shop/reservations", headers=other).json()["items"] == []
    assert client.post(f"/api/v1/shop/reservations/{rid}/accept", headers=other).status_code == 404
    assert client.post(f"/api/v1/shop/reservations/{rid}/decline", headers=other).status_code == 404
    assert client.get("/api/v1/shop/reservations").status_code == 401  # signed out


def reservable(w, product) -> int:
    page = client.get(f"/api/v1/shops/{w['shop']}").json()
    return next(p["reservable"] for p in page["products"] if p["product"]["id"] == str(product))


def test_a_waiting_request_holds_stock_and_the_shop_page_says_how_many_are_left(world):
    w, h = world, owner_headers(world["owner"])
    assert reservable(w, w["biscuit"]) == 10
    assert reservable(w, w["tomato"]) == 5000
    r, _ = reserve(w, [(w["biscuit"], 4), (w["tomato"], 1500)])
    assert r.status_code == 201 and r.json()["status"] == "requested"
    assert reservable(w, w["biscuit"]) == 6  # held while the shop has not answered
    assert reservable(w, w["tomato"]) == 3500
    assert stock_of(w, h, w["biscuit"]) == 10  # the shop's own count only drops at handover
    over, _ = reserve(w, [(w["biscuit"], 7)], phone_no="9123456789")
    assert over.status_code == 409 and "only 6 available" in over.json()["error"]["message"]

    cancelled = client.post(
        f"/api/v1/reservations/{r.json()['id']}/cancel", headers={"X-Reservation-Token": r.json()["access_token"]}
    )
    assert cancelled.status_code == 200
    assert reservable(w, w["biscuit"]) == 10  # released straight away


def test_reservable_is_capped_at_the_per_line_limit(world):
    w = world
    with SessionLocal() as db:
        db.add(StockEvent(shop_id=w["shop"], product_id=w["biscuit"], client_id=uuid.uuid4(),
                          type="restock", quantity=100, count_source="owner_exact"))  # fmt: skip
        db.commit()
    assert reservable(w, w["biscuit"]) == 20
    assert reservable(w, w["tomato"]) == 5000


def test_a_request_the_shop_never_answers_expires_and_frees_the_stock(world):
    w, h = world, owner_headers(world["owner"])
    r, _ = reserve(w, [(w["biscuit"], 10)])
    rid, token = r.json()["id"], r.json()["access_token"]
    assert reservable(w, w["biscuit"]) == 0
    with SessionLocal() as db:
        db.execute(update(Reservation).where(Reservation.id == uuid.UUID(rid)).values(created_at=datetime.now(UTC) - timedelta(minutes=11)))
        db.commit()
    assert client.get(f"/api/v1/reservations/{rid}", headers={"X-Reservation-Token": token}).json()["status"] == "expired"
    assert reservable(w, w["biscuit"]) == 10
    assert reserve(w, [(w["biscuit"], 10)], phone_no="9000033333")[0].status_code == 201
    # the owner can no longer accept it, and cancelling it changes nothing
    assert client.post(f"/api/v1/shop/reservations/{rid}/accept", headers=h).status_code == 409
    assert client.post(f"/api/v1/shop/reservations/{rid}/decline", headers=h).status_code == 409
    gone = client.post(f"/api/v1/reservations/{rid}/cancel", headers={"X-Reservation-Token": token})
    assert gone.status_code == 200 and gone.json()["status"] == "expired"


def test_expired_requests_do_not_count_toward_the_open_request_limit(world):
    w = world
    for _ in range(3):
        assert reserve(w, [(w["biscuit"], 1)], phone_no="9988776655")[0].status_code == 201
    with SessionLocal() as db:
        db.execute(update(Reservation).where(Reservation.shop_id == w["shop"]).values(created_at=datetime.now(UTC) - timedelta(minutes=11)))
        db.commit()
    assert reserve(w, [(w["biscuit"], 1)], phone_no="9988776655")[0].status_code == 201
