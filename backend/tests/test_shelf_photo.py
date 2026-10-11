import io
import uuid
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFilter

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import install
from app.models import OwnerIdentity, Product, Shop, ShopProduct, StockEvent, Supplier
from app.routers.ai import get_shelf_vision, router
from app.services.catalogue_match import STRONG, CatalogueIndex, classify
from app.services.shelf_pipeline import merge_with_tiles
from app.services.shelf_vision import (
    Detection,
    ShelfResult,
    image_quality,
    suggested_level,
    worst_quality,
)

TEST_SETTINGS = Settings(app_env="test", jwt_secret="shelf-test-secret")
PHONE = "+919876543210"
AUTH = {"Authorization": f"Bearer {create_access_token(PHONE, TEST_SETTINGS)}"}


def product(brand, name, size="", barcode=None):
    return Product(
        id=uuid.uuid4(), barcode=barcode, name=name, brand=brand, size=size, unit="piece",
        category=None, name_ml=None, image_url=None, mrp=None, is_active=True,
    )  # fmt: skip


NOW = datetime(2026, 10, 11, tzinfo=timezone.utc)

CATALOGUE = [
    product("Parle", "Parle-G", "56 g", "8901719101755"),
    product("Dabur", "Dabur Honey", "250 g", "8901207000000"),
    product("Britannia", "Good Day Butter", "100 g", "8901063000000"),
    product("Max Protein", "Max Protein Choco Classic Bar", "50 g", "8906000000000"),
]


def photo(sharp=True, bright=True, size=(1000, 1200)) -> bytes:
    img = Image.new("RGB", size, (200, 200, 200) if bright else (5, 5, 5))
    d = ImageDraw.Draw(img)
    for x in range(0, size[0], 40):
        for y in range(0, size[1], 40):
            d.rectangle([x, y, x + 20, y + 20], fill=(30, 30, 30) if bright else (40, 40, 40))
    if not sharp:
        img = img.filter(ImageFilter.GaussianBlur(10))
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


# ---------- matching ----------


def test_strong_match_requires_brand_and_words():
    idx = CatalogueIndex(CATALOGUE)
    best, alts, needs_scan = classify(idx.match("Parle", "Parle-G", "56 g"))
    assert best is not None and best.product.barcode == "8901719101755"
    assert not needs_scan and best.score >= STRONG


def test_unknown_brand_is_not_forced_onto_nearest_product():
    idx = CatalogueIndex(CATALOGUE)
    best, _, needs_scan = classify(idx.match("Nirapara", "Chilli Powder", "100 g"))
    assert best is None and needs_scan


def test_generic_words_do_not_match_a_different_brand():
    idx = CatalogueIndex(CATALOGUE)
    best, _, needs_scan = classify(idx.match("", "50 CLASSIC", ""))
    assert best is None
    assert needs_scan


def test_empty_catalogue_means_scan():
    assert classify(CatalogueIndex([]).match("Parle", "Parle-G", "")) == (None, [], True)


# ---------- helpers ----------


def test_suggested_level_buckets():
    assert [suggested_level(n) for n in (1, 2, 3, 5, 6, 40)] == [
        "few", "few", "some", "some", "plenty", "plenty",
    ]  # fmt: skip


def test_image_quality_detects_problems():
    assert image_quality(photo()) == "good"
    assert image_quality(photo(sharp=False)) == "blurry"
    assert image_quality(photo(bright=False)) == "too_dark"
    assert image_quality(photo(size=(300, 400))) == "too_far"
    assert worst_quality(["good", "blurry", "too_far"]) == "blurry"


# ---------- endpoint ----------


class FakeResult:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class MedianResult:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class FakeSession:
    def __init__(self, products=None, role="retailer", medians=None, shop_rows=None):
        self.products = products or []
        self.shop_rows = shop_rows or []  # ShopProduct rows this shop already has
        self.role = role
        self.medians = medians or {}  # product id -> typical price charged by other shops

    def execute(self, _statement):
        return MedianResult(list(self.medians.items()))

    def scalar(self, statement):
        entity = statement.column_descriptions[0].get("entity")
        if entity is Shop:
            return Shop(id=uuid.uuid4(), phone=PHONE) if self.role == "retailer" else None
        if entity is Supplier:
            return Supplier(id=uuid.uuid4(), phone=PHONE) if self.role == "supplier" else None
        return None

    def get(self, model, key):
        if model is OwnerIdentity:
            return OwnerIdentity(phone=key, role=self.role)
        return None

    def scalars(self, statement):
        if statement.column_descriptions[0].get("entity") is ShopProduct:
            return FakeResult(self.shop_rows)
        return FakeResult(self.products)


class FakeVision:
    def __init__(self, detections):
        self.detections = detections
        self.calls = []

    def analyze(self, images):
        self.calls.append(len(images))
        return ShelfResult(detections=self.detections)


def client(vision, products=None, role="retailer", medians=None, shop_rows=None):
    app = FastAPI()
    install(app)
    app.include_router(router)
    session = FakeSession(
        products if products is not None else CATALOGUE, role, medians, shop_rows
    )
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    app.dependency_overrides[get_shelf_vision] = lambda: vision
    return TestClient(app)


def post(c, files, headers=AUTH, **params):
    return c.post(
        "/shop/ai/shelf-photo",
        files=[("images", (f"p{i}.jpg", data, "image/jpeg")) for i, data in enumerate(files)],
        headers=headers,
        params=params,
    )


DETECTIONS = [
    Detection(brand="Parle", name="Parle-G", size="56 g", category="snacks_biscuits",
              visible_count=7, confidence=0.9),
    Detection(brand="Laxman", name="Laxman Rekha", category="pest_control",
              visible_count=2, confidence=0.9),
    Detection(name="blurry thing", category="other", readable=False, confidence=0.3),
    Detection(name="Rice", category="loose_goods", loose=True, visible_count=1),
]  # fmt: skip


def test_shelf_photo_response_shape():
    vision = FakeVision(DETECTIONS)
    r = post(client(vision), [photo(), photo()], thorough="false")
    assert r.status_code == 200
    body = r.json()
    assert vision.calls == [2]  # fast mode: both images go in a single call
    assert body["image_quality"] == "good"
    by = {d["label"]: d for d in body["detections"]}

    parle = by["Parle Parle-G 56 g"]
    assert parle["match"]["barcode"] == "8901719101755"
    assert parle["needs_scan"] is False
    assert parle["suggested_level"] == "plenty" and parle["visible_count"] == 7

    unknown = by["Laxman Laxman Rekha"]
    assert unknown["match"] is None and unknown["needs_scan"] is True

    assert by["blurry thing"]["needs_scan"] is True
    rice = by["Rice"]
    assert rice["match"] is None and rice["needs_scan"] is False  # loose: tile, not barcode


def test_poor_photo_is_reported():
    r = post(client(FakeVision([])), [photo(), photo(sharp=False)])
    assert r.json()["image_quality"] == "blurry"


def test_requires_retailer_token():
    c = client(FakeVision([]))
    assert post(c, [photo()], headers={}).status_code == 401
    supplier = {
        "Authorization": f"Bearer {create_access_token(PHONE, TEST_SETTINGS, role='supplier')}"
    }
    assert post(client(FakeVision([]), role="supplier"), [photo()], supplier).status_code == 403


@pytest.mark.parametrize("n", [0, 7])
def test_image_count_limits(n):
    r = post(client(FakeVision([])), [photo()] * n) if n else client(FakeVision([])).post(
        "/shop/ai/shelf-photo", headers=AUTH
    )
    assert r.status_code == 400


def test_rejects_non_images():
    r = post(client(FakeVision([])), [b"not an image"])
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_request"


def test_unnamed_dropped_and_duplicates_merged():
    dets = [
        Detection(brand="Aachi", name="Pickle", category="x", visible_count=3, confidence=0.6),
        Detection(brand="aachi", name="pickle", category="x", visible_count=2, confidence=0.9),
        Detection(name="", category="other", visible_count=15),
    ]
    body = post(client(FakeVision(dets)), [photo()]).json()
    assert len(body["detections"]) == 1
    only = body["detections"][0]
    assert only["visible_count"] == 5 and only["confidence"] == 0.9


# ---------- precision rules (found by reviewing 41 auto-matches from 29 real photos) ----------


def test_bare_brand_never_auto_picks_one_product_of_many():
    idx = CatalogueIndex(
        [product("Parle", "Parle-G", "56 g"), product("Parle", "Parle Monaco", "200 g"),
         product("Parle", "Hide & Seek", "100 g")]  # fmt: skip
    )
    best, alts, needs_scan = classify(idx.match("PARLE", "PARLE", ""))
    assert best is None and needs_scan and alts  # owner picks from the alternatives


def test_ambiguous_product_name_is_not_auto_picked():
    idx = CatalogueIndex(
        [product("Cadbury", "Oreo", "50 g"), product("Kwality Walls", "Cornetto Oreo Disc", "72 g")]
    )
    best, alts, needs_scan = classify(idx.match("Oreo", "Oreo", ""))
    assert best is None and needs_scan and len(alts) == 2


def test_product_name_in_the_brand_field_still_matches_when_unique():
    idx = CatalogueIndex([product("Parle", "Hide & Seek", "100 g"), product("Parle", "Parle-G")])
    best, _, needs_scan = classify(idx.match("Hide & Seek", "Hide & Seek", ""))
    assert best is not None and best.product.name == "Hide & Seek" and not needs_scan


def test_one_or_two_letter_brand_cannot_be_trusted():
    idx = CatalogueIndex([product("Act Ii", "Act II Classic Salted", "40 g")])
    best, _, needs_scan = classify(idx.match("Z", "Classic", ""))
    assert best is None and needs_scan


def test_tie_prefers_the_closest_whole_string():
    idx = CatalogueIndex(
        [product("Parle", "Happy Happy", "31.5 g"), product("Parle", "Parle - G", None)]
    )
    best, _, _ = classify(idx.match("Parle", "Parle-G", ""))
    assert best is not None and best.product.name == "Parle - G"


# ---------- the three fixes: hedged brands, loose goods, zoomed tiles ----------


def loose_product(name):
    return Product(id=uuid.uuid4(), barcode=None, name=name, brand=None, size=None, unit="gram",
                   category="fresh_produce", name_ml=None, image_url=None, mrp=None,
                   is_active=True)  # fmt: skip


LOOSE = [loose_product("Tomato"), loose_product("Onion"), loose_product("Matta rice")]


class WholeThenTiles:
    """First call is the whole photo, every later call is a zoomed tile."""

    def __init__(self, whole, tile):
        self.whole, self.tile, self.calls = whole, tile, 0
        import threading

        self.lock = threading.Lock()

    def analyze(self, images):
        with self.lock:
            self.calls += 1
            first = self.calls == 1
        return ShelfResult(detections=self.whole if first else self.tile)


def by_label(body):
    return {d["label"]: d for d in body["detections"]}


def test_hedged_brand_is_kept_as_a_suggestion_never_an_auto_match():
    dets = [
        Detection(brand="Parle", name="Parle-G", category="snacks_biscuits", readable=False,
                  confidence=0.7, visible_count=4),
        Detection(name="Small bottles", category="other", readable=False, confidence=0.4),
    ]  # fmt: skip
    body = post(client(FakeVision(dets)), [photo()], thorough="false").json()
    d = by_label(body)
    hedged = d["Parle Parle-G"]
    assert hedged["match"] is None and hedged["uncertain"] is True and hedged["needs_scan"] is True
    assert [a["name"] for a in hedged["alternatives"]] == ["Parle-G"]  # offered, owner confirms
    generic = d["Small bottles"]
    assert generic["match"] is None and generic["alternatives"] == [] and generic["needs_scan"]
    assert generic["uncertain"] is False


def test_loose_produce_and_eggs_map_to_loose_tiles():
    dets = [
        Detection(name="Tomatoes", category="fresh_produce", readable=False, visible_count=18),
        Detection(name="Eggs", category="dairy_eggs", readable=False, visible_count=6),
        Detection(name="Onions", category="fresh_produce", readable=False),
        Detection(name="Ginger", category="fresh_produce", readable=False, visible_count=30),
    ]
    egg = loose_product("Egg")
    c = client(FakeVision(dets), [*CATALOGUE, *LOOSE, egg])
    d = by_label(post(c, [photo()], thorough="false").json())
    assert d["Tomatoes"]["match"]["name"] == "Tomato" and d["Tomatoes"]["loose"] is True
    assert d["Eggs"]["match"]["name"] == "Egg"
    assert d["Onions"]["match"]["name"] == "Onion"
    # no tile for ginger: still loose, no barcode prompt, the owner adds a tile
    assert d["Ginger"]["match"] is None and d["Ginger"]["loose"] and not d["Ginger"]["needs_scan"]
    assert d["Tomatoes"]["match"]["barcode"] is None


def test_loose_tiles_are_not_confused_with_barcoded_products():
    dets = [Detection(brand="Parle", name="Parle-G", size="56 g", category="snacks_biscuits")]
    d = by_label(post(client(FakeVision(dets), [*CATALOGUE, *LOOSE]), [photo()],
                      thorough="false").json())  # fmt: skip
    assert d["Parle Parle-G 56 g"]["match"]["barcode"] == "8901719101755"


def test_thorough_mode_rereads_tiles_and_recovers_hedged_items():
    whole = [
        Detection(brand="Parle", name="Parle-G", size="56 g", category="snacks_biscuits",
                  readable=False, visible_count=7, confidence=0.6),
        Detection(name="Small tubes", category="other", readable=False, visible_count=10),
    ]  # fmt: skip
    tile = [Detection(brand="Parle", name="Parle-G", size="56 g", category="snacks_biscuits",
                      readable=True, visible_count=3, confidence=0.9)]  # fmt: skip
    vision = WholeThenTiles(whole, tile)
    body = post(client(vision), [photo()]).json()
    assert vision.calls == 1 + 4  # the whole photo, then four zoomed tiles
    d = by_label(body)
    parle = d["Parle Parle-G 56 g"]
    assert parle["match"]["barcode"] == "8901719101755" and parle["uncertain"] is False
    assert parle["visible_count"] == 7  # count comes from the whole photo, not the tile
    assert d["Small tubes"]["needs_scan"] is True  # generic items survive the merge
    assert len(body["detections"]) == 2


def test_a_failing_tile_does_not_break_the_response():
    class Flaky:
        calls = 0

        def analyze(self, images):
            Flaky.calls += 1
            if Flaky.calls > 1:
                raise RuntimeError("tile failed")
            return ShelfResult(detections=[Detection(brand="Parle", name="Parle-G", size="56 g",
                                                     category="snacks_biscuits")])  # fmt: skip

    r = post(client(Flaky()), [photo()])
    assert r.status_code == 200 and by_label(r.json())["Parle Parle-G 56 g"]["match"]


def test_merge_with_tiles_counts_do_not_add_up_across_tiles():
    a = Detection(brand="Maggi", name="Noodles", category="packaged_food", visible_count=9)
    t1 = Detection(brand="Maggi", name="Noodles", category="packaged_food", visible_count=5)
    t2 = Detection(brand="Maggi", name="Noodles", category="packaged_food", visible_count=6)
    tile_only = Detection(brand="Dettol", name="Soap", category="personal_care", visible_count=2)
    out = merge_with_tiles([a], [[t1], [t2, tile_only]])
    counts = {d.brand: d.visible_count for d in out}
    assert counts == {"Maggi": 9, "Dettol": 2}  # whole count wins, never 5 + 6 + 9


def test_merge_with_tiles_keeps_whole_items_a_tile_could_not_read():
    whole = [Detection(name="Balloons", category="toys_gifts", readable=False, visible_count=20)]
    tile = [Detection(name="Balloons", category="toys_gifts", readable=False, visible_count=5)]
    out = merge_with_tiles(whole, [tile])
    assert [(d.name, d.visible_count) for d in out] == [("Balloons", 20)]


# ---------- suggested price ----------


def test_suggested_price_prefers_mrp_then_nearby_median_and_never_invents():
    with_mrp = product("Parle", "Parle-G", "56 g", barcode="8901719101755")
    with_mrp.mrp = 5
    no_mrp = product("Haldiram's", "Aloo bhujia", "200 g", barcode="8904004400000")
    no_price = product("Aachi", "Sambar Powder", "100 g", barcode="8902000000001")
    dets = [
        Detection(brand="Parle", name="Parle-G", size="56 g", category="snacks_biscuits"),
        Detection(brand="Haldiram's", name="Aloo bhujia", size="200 g", category="snacks_biscuits"),
        Detection(brand="Aachi", name="Sambar Powder", size="100 g", category="oils_spices"),
    ]
    c = client(FakeVision(dets), [with_mrp, no_mrp, no_price], medians={no_mrp.id: 52.5})
    d = by_label(post(c, [photo()], thorough="false").json())
    parle = d["Parle Parle-G 56 g"]
    assert (parle["suggested_price"], parle["price_source"]) == (5.0, "mrp")
    haldirams = d["Haldiram's Aloo bhujia 200 g"]
    assert (haldirams["suggested_price"], haldirams["price_source"]) == (52.5, "nearby_median")
    nothing = d["Aachi Sambar Powder 100 g"]
    assert nothing["suggested_price"] is None and nothing["price_source"] is None


def test_unmatched_items_get_no_suggested_price():
    dets = [Detection(name="Small bottles", category="other", readable=False)]
    d = post(client(FakeVision(dets)), [photo()], thorough="false").json()["detections"][0]
    assert d["match"] is None and d["suggested_price"] is None


def test_items_the_shop_already_stocks_report_the_system_count_for_a_recount():
    stocked = product("Parle", "Parle-G", "56 g", barcode="8901719101755")
    other = product("Dabur", "Dabur Honey", "250 g", barcode="8901207000000")
    row = ShopProduct(product_id=stocked.id, low_threshold=5)
    row.stock_events = [
        StockEvent(id=uuid.uuid4(), type="correction", quantity=40, created_at=NOW)
    ]
    dets = [
        Detection(brand="Parle", name="Parle-G", size="56 g", category="snacks_biscuits"),
        Detection(brand="Dabur", name="Dabur Honey", size="250 g", category="grocery"),
    ]
    c = client(FakeVision(dets), [stocked, other], shop_rows=[row])
    d = by_label(post(c, [photo()], thorough="false").json())
    parle, honey = d["Parle Parle-G 56 g"], d["Dabur Dabur Honey 250 g"]
    assert (parle["in_shop"], parle["current_quantity"], parle["current_status"]) == (
        True, 40, "in_stock"
    )  # fmt: skip
    assert (honey["in_shop"], honey["current_quantity"]) == (False, None)


def test_unmatched_items_are_not_in_shop():
    dets = [Detection(name="Small bottles", category="other", readable=False)]
    d = post(client(FakeVision(dets)), [photo()], thorough="false").json()["detections"][0]
    assert d["in_shop"] is False and d["current_quantity"] is None
