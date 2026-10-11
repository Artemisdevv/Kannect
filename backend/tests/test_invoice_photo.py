import io
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import install
from app.models import OwnerIdentity, Product, Shop, Supplier
from app.routers.ai import get_invoice_vision, router
from app.services.invoice_vision import (
    InvoiceLine,
    InvoiceResult,
    cost_per_unit,
    to_base_units,
    totals_check,
)

SETTINGS = Settings(app_env="test", jwt_secret="invoice-test")
PHONE = "+919876543210"
AUTH = {"Authorization": f"Bearer {create_access_token(PHONE, SETTINGS)}"}


def line(**kw):
    base = {"description": "x", "quantity": 1, "quantity_unit": "piece"}
    return InvoiceLine(**(base | kw))


# ---------- unit conversion ----------


@pytest.mark.parametrize(
    ("kw", "unit", "expected", "note"),
    [
        ({"quantity": 20, "quantity_unit": "piece"}, "piece", 20, False),
        ({"quantity": 3, "quantity_unit": "dozen"}, "piece", 36, False),
        ({"quantity": 5, "quantity_unit": "carton", "units_per_pack": 24}, "piece", 120, False),
        ({"quantity": 4, "quantity_unit": "pack", "units_per_pack": 12}, "piece", 48, False),
        # cartons with no pieces-per-carton: a guess the owner must fix
        ({"quantity": 5, "quantity_unit": "carton"}, "piece", 5, True),
        ({"quantity": 2, "quantity_unit": "unknown"}, "piece", 2, True),
        ({"quantity": 2.5, "quantity_unit": "kg"}, "gram", 2500, False),
        ({"quantity": 500, "quantity_unit": "g"}, "gram", 500, False),
        ({"quantity": 2, "quantity_unit": "pack", "pack_weight_g": 25000}, "gram", 50000, False),
        ({"quantity": 2, "quantity_unit": "pack"}, "gram", 2, True),
        ({"quantity": 2, "quantity_unit": "kg"}, "piece", 2, True),  # weight billed, counted item
        ({"quantity": -3, "quantity_unit": "piece"}, "piece", 0, False),
    ],
)
def test_to_base_units(kw, unit, expected, note):
    qty, n = to_base_units(line(**kw), unit)
    assert qty == expected and (n is not None) == note


def test_cost_per_unit_uses_the_printed_line_total():
    assert cost_per_unit(line(line_total=528.0), 120, "piece") == 4.4
    assert cost_per_unit(line(line_total=2640.0), 50000, "gram") == 52.8  # per kg
    assert cost_per_unit(line(), 120, "piece") is None  # no total printed: do not invent one
    assert cost_per_unit(line(line_total=100.0), 0, "piece") is None


def test_totals_check_flags_a_big_gap_only():
    ok = InvoiceResult(invoice_total=7963.2, lines=[line(line_total=7584.0)])
    assert totals_check(ok)["possible_misread"] is False  # tax row explains a small gap
    bad = InvoiceResult(invoice_total=7963.2, lines=[line(line_total=2000.0)])
    assert totals_check(bad)["possible_misread"] is True
    assert totals_check(InvoiceResult(lines=[line()]))["possible_misread"] is None


# ---------- endpoint ----------


def product(brand, name, size="", unit="piece"):
    return Product(
        id=uuid.uuid4(), barcode="8901", name=name, brand=brand, size=size, unit=unit,
        category=None, name_ml=None, image_url=None, mrp=None, is_active=True,
    )  # fmt: skip


class Result:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class FakeSession:
    def __init__(self, products, role="retailer"):
        self.products, self.role = products, role

    def scalar(self, statement):
        entity = statement.column_descriptions[0].get("entity")
        if entity is Shop:
            return Shop(id=uuid.uuid4(), phone=PHONE) if self.role == "retailer" else None
        if entity is Supplier:
            return None
        return None

    def get(self, model, key):
        return OwnerIdentity(phone=key, role=self.role) if model is OwnerIdentity else None

    def scalars(self, _statement):
        return Result(self.products)


class FakeVision:
    def __init__(self, result):
        self.result, self.calls = result, 0

    def analyze(self, image):
        self.calls += 1
        return self.result


def jpeg() -> bytes:
    """A sharp page with text-like texture, so the blur check passes."""
    img = Image.new("RGB", (900, 1200), (240, 240, 240))
    d = ImageDraw.Draw(img)
    for x in range(0, 900, 36):
        for y in range(0, 1200, 36):
            d.rectangle([x, y, x + 16, y + 16], fill=(25, 25, 25))
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


def client(vision, products=None):
    app = FastAPI()
    install(app)
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: FakeSession(products or [])
    app.dependency_overrides[get_settings] = lambda: SETTINGS
    app.dependency_overrides[get_invoice_vision] = lambda: vision
    return TestClient(app)


def post(c, data=None, headers=AUTH):
    payload = jpeg() if data is None else data
    return c.post("/shop/ai/invoice", headers=headers,
                  files={"image": ("i.jpg", payload, "image/jpeg")})  # fmt: skip


RESULT = InvoiceResult(
    supplier_name="Kaloor Wholesale", invoice_number="KWT/1", date="09-Oct-2026", invoice_total=900,
    lines=[
        InvoiceLine(description="Parle-G Biscuit 56g (24/ctn)", brand="Parle", name="Parle-G",
                    size="56 g", quantity=5, quantity_unit="carton", units_per_pack=24,
                    line_total=528, confidence=0.9),
        InvoiceLine(description="Nirapara Chilli Powder 100g", brand="Nirapara",
                    name="Chilli Powder", size="100 g", quantity=12, line_total=456,
                    confidence=0.9),
        InvoiceLine(description="smudged line", quantity=3, readable=False, confidence=0.3),
        InvoiceLine(description="Discount", quantity=0),  # not goods
    ],
)  # fmt: skip


def test_invoice_endpoint_converts_matches_and_flags():
    c = client(FakeVision(RESULT), [product("Parle", "Parle-G", "56 g")])
    r = post(c)
    assert r.status_code == 200
    body = r.json()
    assert body["image_quality"] == "good"
    assert body["invoice"]["number"] == "KWT/1" and body["invoice"]["lines_total"] == 984.0
    parle, nirapara, smudged = body["suggestions"]  # the zero-quantity row is dropped

    assert parle["product"]["name"] == "Parle-G" and parle["needs_scan"] is False
    assert parle["quantity"] == 120 and parle["cost_price"] == 4.4 and parle["needs_check"] is False
    assert parle["billed"]["units_per_pack"] == 24

    assert nirapara["product"] is None and nirapara["needs_scan"] is True
    assert nirapara["quantity"] == 12 and nirapara["cost_price"] == 38.0  # pieces assumed

    assert smudged["needs_check"] is True and smudged["needs_scan"] is True
    assert "clearly" in smudged["note"]


def test_nothing_is_saved_and_only_one_ai_call_is_made():
    vision = FakeVision(RESULT)
    post(client(vision, []))
    assert vision.calls == 1


def test_invoice_requires_retailer_and_a_real_image():
    c = client(FakeVision(RESULT))
    assert post(c, headers={}).status_code == 401
    assert post(c, data=b"not an image").status_code == 400


def test_invoice_rejects_oversized_upload():
    big = b"\xff\xd8" + b"0" * (10 * 1024 * 1024 + 10)
    assert post(client(FakeVision(RESULT)), data=big).status_code == 400
