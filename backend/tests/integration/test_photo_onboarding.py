# ruff: noqa: E501
"""A brand-new retailer onboards from a photo, on a real PostGIS database.

login -> register shop -> shelf photo -> confirm and save in bulk -> stock is live -> shoppers find it.
The AI reader is a fake that returns a fixed shelf, so this runs offline and in CI. It proves the
plumbing between the endpoints (ids, prices, units, skipping repeats), not the AI's accuracy.
"""

import io
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from geoalchemy2 import WKTElement
from PIL import Image, ImageDraw
from sqlalchemy import delete, select
from sqlalchemy.engine import make_url

from app.config import get_settings
from app.db import SessionLocal
from app.main import app
from app.models import OwnerIdentity, Product, Shop, ShopProduct, StockEvent
from app.routers.ai import get_shelf_vision
from app.services.shelf_vision import Detection, ShelfResult

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_INTEGRATION") != "1", reason="set RUN_INTEGRATION=1 with a local database"
)

client = TestClient(app)
LAT, LNG = 12.0, -40.0  # open ocean, no demo shop nearby


def phone() -> str:
    return "+9170" + f"{uuid.uuid4().int % 10**8:08d}"


def photo() -> bytes:
    img = Image.new("RGB", (900, 1200), (240, 240, 240))
    d = ImageDraw.Draw(img)
    for x in range(0, 900, 36):
        for y in range(0, 1200, 36):
            d.rectangle([x, y, x + 16, y + 16], fill=(25, 25, 25))
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


class FixedShelf:
    def __init__(self, detections):
        self.detections = detections

    def analyze(self, images):
        return ShelfResult(detections=self.detections)


@pytest.fixture
def world():
    assert make_url(get_settings().database_url).host in {"localhost", "127.0.0.1", "db", "postgres"}
    tag = uuid.uuid4().hex[:6]
    w = {"tag": tag, "brand": f"Itb{tag}", "phone": phone(), "other_phone": phone()}
    with SessionLocal() as db:
        alpha = Product(id=uuid.uuid4(), barcode=f"A{tag}", name=f"Alpha Biscuit {tag}", brand=w["brand"],
                        size="50 g", unit="piece", category="snacks_biscuits", mrp=10, is_active=True)  # fmt: skip
        beta = Product(id=uuid.uuid4(), barcode=f"B{tag}", name=f"Beta Namkeen {tag}", brand=w["brand"],
                       size="100 g", unit="piece", category="snacks_biscuits", is_active=True)  # fmt: skip
        tile = Product(id=uuid.uuid4(), barcode=None, name=f"Zucchini{tag}", unit="gram",
                       category="fresh_produce", is_active=True)  # fmt: skip
        db.add_all([alpha, beta, tile])
        db.flush()
        # two other shops already sell Beta (no MRP in the catalogue): the median is the suggestion
        others = []
        for i, price in enumerate((40, 60)):
            s = Shop(id=uuid.uuid4(), name=f"other{i}{tag}", phone=phone(), language="en",
                     location=WKTElement(f"POINT({LNG + 0.01 * (i + 1)} {LAT})", srid=4326))  # fmt: skip
            db.add(s)
            db.flush()
            db.add(ShopProduct(shop_id=s.id, product_id=beta.id, price=price, low_threshold=5,
                               needs_recount=False, pinned=False))  # fmt: skip
            others.append(s.id)
        db.commit()
        w.update(alpha=alpha.id, beta=beta.id, tile=tile.id, others=others)
    yield w
    app.dependency_overrides.pop(get_shelf_vision, None)
    with SessionLocal() as db:
        shops = list(db.scalars(select(Shop.id).where(Shop.phone == w["phone"]))) + w["others"]
        db.execute(delete(StockEvent).where(StockEvent.shop_id.in_(shops)))
        db.execute(delete(ShopProduct).where(ShopProduct.shop_id.in_(shops)))
        db.execute(delete(Shop).where(Shop.id.in_(shops)))
        db.execute(delete(OwnerIdentity).where(OwnerIdentity.phone == w["phone"]))
        db.execute(delete(Product).where(Product.id.in_([w["alpha"], w["beta"], w["tile"]])))
        db.commit()


def login(p: str) -> tuple[dict, dict]:
    client.post("/api/v1/auth/otp/request", json={"phone": p, "role": "retailer"})
    r = client.post("/api/v1/auth/otp/verify",
                    json={"phone": p, "otp": get_settings().demo_otp, "role": "retailer"})  # fmt: skip
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()


def test_new_retailer_goes_from_login_to_a_searchable_stocked_shop_using_a_photo(world):
    tag, brand = world["tag"], world["brand"]
    headers, session = login(world["phone"])
    assert session["shop"] is None  # brand-new owner: no shop yet

    # 1. no shop yet, so everything shop-related says so
    assert client.get("/api/v1/shop", headers=headers).status_code == 404
    assert client.get("/api/v1/shop/products", headers=headers).status_code == 404

    # 2. register
    created = client.post("/api/v1/shop", headers=headers, json={
        "name": f"Newcomer Stores {tag}", "owner_name": "Test Owner", "address": "Nowhere",
        "location": {"lat": LAT, "lng": LNG}, "language": "ml", "shop_type": "grocery"})  # fmt: skip
    assert created.status_code == 201, created.text
    assert created.json()["location"] == {"lat": LAT, "lng": LNG}
    assert client.post("/api/v1/shop", headers=headers, json={"name": "again"}).status_code == 409
    assert client.post("/api/v1/shop", headers=headers, json={"phone": "+919999999999"}).status_code in (400, 409)
    patched = client.patch("/api/v1/shop", headers=headers, json={"name": f"Newcomer Mart {tag}"})
    assert patched.status_code == 200 and patched.json()["name"].startswith("Newcomer Mart")
    assert client.patch("/api/v1/shop", headers=headers, json={"language": None}).json()["language"] == "ml"
    assert client.get("/api/v1/shop", headers=headers).json()["shop_type"] == "grocery"

    # 3. photograph the shelf
    shelf = [
        Detection(brand=brand, name=f"Alpha Biscuit {tag}", size="50 g", category="snacks_biscuits", visible_count=8),
        Detection(brand=brand, name=f"Beta Namkeen {tag}", size="100 g", category="snacks_biscuits", visible_count=2),
        Detection(name=f"Zucchinis{tag}", category="fresh_produce", readable=False, visible_count=12),
        Detection(name="Small bottles", category="other", readable=False, confidence=0.4),
    ]  # fmt: skip
    app.dependency_overrides[get_shelf_vision] = lambda: FixedShelf(shelf)
    r = client.post("/api/v1/shop/ai/shelf-photo?thorough=false", headers=headers,
                    files=[("images", ("shelf.jpg", photo(), "image/jpeg"))])  # fmt: skip
    assert r.status_code == 200, r.text
    got = {d["label"]: d for d in r.json()["detections"]}
    alpha = got[f"{brand} Alpha Biscuit {tag} 50 g"]
    beta = got[f"{brand} Beta Namkeen {tag} 100 g"]
    tile = got[f"Zucchinis{tag}"]
    assert alpha["match"]["id"] == str(world["alpha"]) and alpha["price_source"] == "mrp"
    assert alpha["suggested_price"] == 10.0
    assert beta["match"]["id"] == str(world["beta"])
    assert (beta["suggested_price"], beta["price_source"]) == (50.0, "nearby_median")  # median of 40 and 60
    assert tile["loose"] and tile["match"]["id"] == str(world["tile"]) and tile["needs_scan"] is False
    assert tile["suggested_price"] is None  # nobody has a price for it: the owner types one
    generic = got["Small bottles"]
    assert generic["match"] is None and generic["needs_scan"] is True

    # 4. the owner confirms: prefilled prices, photo estimates for counts, one typed price for the tile
    items = [
        {"product_id": alpha["match"]["id"], "price": alpha["suggested_price"], "stock_level": "plenty", "count_source": "photo_estimate"},
        {"product_id": beta["match"]["id"], "price": beta["suggested_price"], "stock_level": "few", "count_source": "photo_estimate"},
        {"product_id": tile["match"]["id"], "price": 30, "stock_level": "some", "count_source": "photo_estimate"},
    ]  # fmt: skip
    saved = client.post("/api/v1/shop/products/bulk", headers=headers, json={"items": items})
    assert saved.status_code == 201, saved.text
    assert len(saved.json()["items"]) == 3 and saved.json()["skipped"] == []

    # 5. the stock is live and honest about being an estimate
    mine = {x["product"]["id"]: x for x in client.get("/api/v1/shop/products", headers=headers).json()["items"]}
    assert mine[str(world["alpha"])]["stock_status"] == "in_stock" and mine[str(world["alpha"])]["stock_qty"] == 25  # plenty = 5 x threshold 5
    assert mine[str(world["beta"])]["stock_status"] == "low"  # few = half the threshold
    assert mine[str(world["tile"])]["product"]["unit"] == "gram" and mine[str(world["tile"])]["stock_qty"] == 2000
    with SessionLocal() as db:
        sources = set(db.scalars(select(StockEvent.count_source).where(StockEvent.shop_id == created.json()["id"])))
    assert sources == {"photo_estimate"}  # the recount can find these first

    # 6. a second photo overlaps: repeats are skipped, not an error, and nothing is overwritten
    again = client.post("/api/v1/shop/products/bulk", headers=headers, json={"items": [
        {"product_id": str(world["alpha"]), "price": 99, "stock_level": "none", "count_source": "photo_estimate"}]})  # fmt: skip
    assert again.status_code == 201 and again.json()["items"] == []
    assert again.json()["skipped"] == [str(world["alpha"])]
    after = {x["product"]["id"]: x for x in client.get("/api/v1/shop/products", headers=headers).json()["items"]}
    assert after[str(world["alpha"])]["price"] == 10.0 and after[str(world["alpha"])]["stock_qty"] == 25

    # 7. shoppers nearby can now find the new shop (this is the point of the network)
    found = client.get("/api/v1/search", params={"q": f"Alpha Biscuit {tag}", "lat": LAT, "lng": LNG}).json()["results"]
    assert [x["shop"]["id"] for x in found] == [created.json()["id"]]
    assert found[0]["stock_status"] == "in_stock" and found[0]["price"] == 10.0


def test_bulk_save_still_needs_a_price_when_nothing_suggests_one(world):
    headers, _ = login(world["phone"])
    client.post("/api/v1/shop", headers=headers, json={"name": f"P {world['tag']}", "location": {"lat": LAT, "lng": LNG}})
    r = client.post("/api/v1/shop/products/bulk", headers=headers,
                    json={"items": [{"product_id": str(world["tile"]), "stock_level": "some"}]})  # fmt: skip
    assert r.status_code == 400 and "price" in r.text.lower()
