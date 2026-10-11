import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.db import get_db
from app.errors import install
from app.models import Bill, BillLine
from app.routers import ebill, search

SETTINGS = Settings(app_env="test", jwt_secret="x", public_base_url="https://api.example.com/")
SHOP_ID = uuid.uuid4()
PRODUCT_ID = uuid.uuid4()


def row(**over):
    base = {
        "shop_id": SHOP_ID, "shop_name": "Mary Matha Provision", "address": "Kaloor",
        "phone": "+919000000002", "lat": 9.997, "lng": 76.3035,
        "product_id": PRODUCT_ID, "barcode": "8901", "name": "Cinthol soap", "name_ml": None,
        "brand": "Godrej", "size": "100g", "category": "personal_care", "unit": "piece",
        "image_url": None, "mrp": Decimal("45.00"), "price": Decimal("45.00"),
        "status": "in_stock", "distance_m": 276.0, "reservable": 12,
    }  # fmt: skip
    return base | over


class Result:
    def __init__(self, rows):
        self.rows = rows

    def mappings(self):
        return self

    def all(self):
        return self.rows

    def first(self):
        return self.rows[0] if self.rows else None


class FakeDB:
    """Returns canned results to successive execute() calls and remembers the SQL it was given."""

    def __init__(self, *results, bill=None):
        self.results = list(results)
        self.calls = []
        self.bill = bill

    def execute(self, statement, params=None):
        self.calls.append((str(statement), params or {}))
        return Result(self.results.pop(0) if self.results else [])

    def scalars(self, _statement):
        return Result([self.bill] if self.bill else [])


def client(db):
    app = FastAPI()
    install(app)
    app.include_router(search.router)
    app.include_router(ebill.api_router)
    app.include_router(ebill.page_router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_settings] = lambda: SETTINGS
    return TestClient(app)


# ---------- search ----------


def test_search_shapes_results_and_hides_counts():
    db = FakeDB([row(), row(shop_name="Nair's Kada", status="low", distance_m=398.0)])
    r = client(db).get("/search", params={"q": "soap", "lat": 9.999, "lng": 76.302})
    assert r.status_code == 200
    results = r.json()["results"]
    assert [x["distance_m"] for x in results] == [276, 398]
    assert results[0]["shop"]["location"] == {"lat": 9.997, "lng": 76.3035}
    assert results[0]["stock_status"] == "in_stock" and results[1]["stock_status"] == "low"
    assert results[0]["price"] == 45.0 and results[0]["product"]["mrp"] == 45.0
    assert "qty" not in r.text and "stock_qty" not in r.text


def test_search_defaults_and_out_filter():
    db = FakeDB([])
    client(db).get("/search", params={"q": "soap", "lat": 1, "lng": 2})
    sql, params = db.calls[0]
    assert params["radius"] == 2000 and params["limit"] == 50
    assert "st.qty > 0" in sql  # out of stock hidden by default

    db = FakeDB([])
    client(db).get("/search", params={"q": "soap", "lat": 1, "lng": 2, "include_out": True})
    assert "st.qty > 0" not in db.calls[0][0]


def test_search_every_word_must_match():
    db = FakeDB([])
    client(db).get("/search", params={"q": "cinthol  soap", "lat": 1, "lng": 2})
    sql, params = db.calls[0]
    assert params["t0"] == "%cinthol%" and params["t1"] == "%soap%"
    assert sql.count("ILIKE :t0") >= 1 and sql.count("ILIKE :t1") >= 1


def test_search_user_text_is_only_ever_a_bound_parameter():
    db = FakeDB([])
    client(db).get("/search", params={"q": "x'; drop table shop;--", "lat": 1, "lng": 2})
    sql, params = db.calls[0]
    assert "drop table" not in sql
    assert any("drop" in str(v) for v in params.values())


@pytest.mark.parametrize(
    "params",
    [
        {"q": "soap", "lat": 200, "lng": 0},
        {"q": "soap", "lat": 0, "lng": 300},
        {"q": "soap", "lat": 1, "lng": 1, "radius_m": 999999},
        {"lat": 1, "lng": 1},
        {"q": "   ", "lat": 1, "lng": 1},
    ],
)
def test_search_rejects_bad_input(params):
    assert client(FakeDB([])).get("/search", params=params).status_code == 400


def test_search_needs_no_auth():
    r = client(FakeDB([])).get("/search", params={"q": "a", "lat": 1, "lng": 1})
    assert r.status_code == 200


def test_search_supports_address_area_fallback_without_claiming_distance():
    result = row(distance_m=None)
    r = client(FakeDB([result])).get("/search", params={"q": "soap", "area": "Kaloor"})
    assert r.status_code == 200
    assert r.json()["results"][0]["distance_m"] is None
    db = FakeDB([])
    client(db).get("/search", params={"q": "soap", "area": "Kaloor"})
    assert "POSITION(LOWER(:area)" in db.calls[0][0] and db.calls[0][1]["area"] == "Kaloor"


def test_nearby_shops_returns_saved_locations_and_never_fabricates_area_distance():
    shop_row = {
        "id": SHOP_ID,
        "name": "Mary",
        "address": "Kaloor",
        "phone": None,
        "lat": 9.997,
        "lng": 76.3035,
        "distance_m": None,
    }
    db = FakeDB([shop_row])
    response = client(db).get("/shops/nearby", params={"area": "Kaloor"})
    assert response.status_code == 200
    result = response.json()["shops"][0]
    assert result["shop"]["location"] == {"lat": 9.997, "lng": 76.3035}
    assert result["distance_m"] is None
    assert "POSITION(LOWER(:area)" in db.calls[0][0]
    assert client(FakeDB([])).get("/shops/nearby", params={"lat": 1}).status_code == 400


def test_nearby_shops_coordinate_mode_uses_radius_and_real_distance():
    db = FakeDB(
        [
            {
                "id": SHOP_ID,
                "name": "Mary",
                "address": "Kaloor",
                "phone": None,
                "lat": 9.997,
                "lng": 76.3035,
                "distance_m": 276,
            }
        ]
    )
    response = client(db).get("/shops/nearby", params={"lat": 10, "lng": 76.3, "radius_m": 500})
    assert response.status_code == 200
    assert response.json()["shops"][0]["distance_m"] == 276
    sql, params = db.calls[0]
    assert "ST_DWithin" in sql and params["radius"] == 500
    assert "POSITION" not in sql


# ---------- referral ----------


def test_referral_unknown_shop_is_404():
    r = client(FakeDB([])).get(
        "/search/referral", params={"shop_id": str(SHOP_ID), "product_id": str(PRODUCT_ID)}
    )
    assert r.status_code == 404


def test_referral_returns_nearest_other_shop_or_null():
    origin = [{"lat": 9.998, "lng": 76.302}]
    found = client(FakeDB(origin, [row(distance_m=341.0)])).get(
        "/search/referral", params={"shop_id": str(SHOP_ID), "product_id": str(PRODUCT_ID)}
    )
    assert found.json()["referral"]["shop"]["name"] == "Mary Matha Provision"
    assert found.json()["referral"]["distance_m"] == 341

    db = FakeDB(origin, [])
    none = client(db).get(
        "/search/referral", params={"shop_id": str(SHOP_ID), "product_id": str(PRODUCT_ID)}
    )
    assert none.json() == {"referral": None}
    sql, params = db.calls[1]
    assert params["shop_id"] == SHOP_ID and "st.shop_id <> :shop_id" in sql  # never the same shop
    assert params["radius"] == search.REFERRAL_RADIUS_M


# ---------- shop page ----------


def test_shop_page_404_and_shape():
    assert client(FakeDB([])).get(f"/shops/{SHOP_ID}").status_code == 404
    shop = [{"id": SHOP_ID, "name": "Mary", "address": "Kaloor", "phone": "+91",
             "lat": 9.9, "lng": 76.3}]  # fmt: skip
    r = client(FakeDB(shop, [row(), row(name="Parle G", status="out")])).get(f"/shops/{SHOP_ID}")
    body = r.json()
    assert body["shop"]["name"] == "Mary"
    assert [p["stock_status"] for p in body["products"]] == ["in_stock", "out"]
    assert [p["reservable"] for p in body["products"]] == [12, 12]
    assert "qty" not in r.text


# ---------- e-bill ----------


def make_bill(name="Parle G <b>biscuit</b>", unit="piece", qty=3, price="5.00", total="15.00"):
    bill_id = uuid.uuid4()
    line = BillLine(
        id=uuid.uuid4(), bill_id=bill_id, product_id=PRODUCT_ID, position=0, name=name, unit=unit,
        quantity=qty, unit_price=Decimal(price), line_total=Decimal(total),
    )  # fmt: skip
    return Bill(
        id=bill_id, shop_id=SHOP_ID, client_id=uuid.uuid4(),
        created_at=datetime(2026, 10, 11, 10, 19, tzinfo=UTC), total=Decimal(total),
        payment_mode="upi", customer_contact="+919999999999", items=[line],
    )  # fmt: skip


SHOP_ROW = [{"id": SHOP_ID, "name": "Mary <script>x</script>", "address": "Kaloor",
             "phone": "+919000000002", "lat": 9.99, "lng": 76.3}]  # fmt: skip


def test_ebill_json_has_share_text_and_no_contact():
    bill = make_bill()
    r = client(FakeDB(SHOP_ROW, bill=bill)).get(f"/ebills/{bill.id}")
    body = r.json()
    assert r.status_code == 200
    assert body["share_url"] == f"https://api.example.com/b/{bill.id}"
    assert body["share_text"].endswith(body["share_url"]) and "Rs 15.00" in body["share_text"]
    assert body["bill"]["total"] == 15.0 and body["bill"]["items"][0]["quantity"] == 3
    assert "customer" not in r.text and "9999999999" not in r.text


def test_ebill_page_escapes_html_and_formats_weights():
    bill = make_bill(name="Matta rice", unit="gram", qty=1500, price="60.00", total="90.00")
    r = client(FakeDB(SHOP_ROW, bill=bill)).get(f"/b/{bill.id}")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert "1.5 kg" in r.text and "&#8377;60.00/kg" in r.text and "&#8377;90.00" in r.text
    assert "<script>x</script>" not in r.text and "&lt;script&gt;" in r.text  # shop name escaped
    assert "private, no-store" in r.headers["cache-control"]
    assert "9999999999" not in r.text
    assert "03:49 PM IST" in r.text  # 10:19 UTC shown in India time


def test_ebill_page_escapes_product_names():
    bill = make_bill()
    r = client(FakeDB(SHOP_ROW, bill=bill)).get(f"/b/{bill.id}")
    assert "<b>biscuit</b>" not in r.text and "&lt;b&gt;biscuit&lt;/b&gt;" in r.text


@pytest.mark.parametrize("path", ["/b/not-a-uuid", f"/b/{uuid.uuid4()}"])
def test_ebill_page_bad_or_unknown_link_is_a_friendly_404(path):
    r = client(FakeDB()).get(path)
    assert r.status_code == 404 and "Bill not found" in r.text


def test_ebill_json_unknown_is_404():
    assert client(FakeDB()).get(f"/ebills/{uuid.uuid4()}").status_code == 404
