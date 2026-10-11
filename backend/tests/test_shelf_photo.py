import io
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFilter

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import install
from app.models import OwnerIdentity, Product, Shop, Supplier
from app.routers.ai import get_shelf_vision, router
from app.services.catalogue_match import STRONG, CatalogueIndex, classify
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


class FakeSession:
    def __init__(self, products=None, role="retailer"):
        self.products = products or []
        self.role = role

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
        return FakeResult(self.products)


class FakeVision:
    def __init__(self, detections):
        self.detections = detections
        self.calls = []

    def analyze(self, images):
        self.calls.append(len(images))
        return ShelfResult(detections=self.detections)


def client(vision, products=None, role="retailer"):
    app = FastAPI()
    install(app)
    app.include_router(router)
    session = FakeSession(products if products is not None else CATALOGUE, role)
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    app.dependency_overrides[get_shelf_vision] = lambda: vision
    return TestClient(app)


def post(c, files, headers=AUTH):
    return c.post(
        "/shop/ai/shelf-photo",
        files=[("images", (f"p{i}.jpg", data, "image/jpeg")) for i, data in enumerate(files)],
        headers=headers,
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
    r = post(client(vision), [photo(), photo()])
    assert r.status_code == 200
    body = r.json()
    assert vision.calls == [2]  # both images go in a single call
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
