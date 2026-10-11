# ruff: noqa: E501
import uuid
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import install
from app.models import OwnerIdentity, Product, Shop, ShopProduct, Supplier
from app.routers.ai import get_voice_vision, router
from app.services.voice_bill import VoiceLine, VoiceResult, to_base_units

TEST_SETTINGS = Settings(app_env="test", jwt_secret="voice-test-secret")
PHONE = "+919876543210"
AUTH = {"Authorization": f"Bearer {create_access_token(PHONE, TEST_SETTINGS)}"}


def product(name, unit="piece", barcode=None, brand=None):
    return Product(
        id=uuid.uuid4(), barcode=barcode, name=name, brand=brand, size="", unit=unit,
        category=None, name_ml=None, image_url=None, mrp=None, is_active=True,
    )  # fmt: skip


def shop_row(p, price):
    row = ShopProduct(product_id=p.id, price=Decimal(price), low_threshold=5)
    row.product = p
    return row


class FakeResult:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class FakeSession:
    def __init__(self, rows, role="retailer", has_shop=True):
        self.rows, self.role, self.has_shop = rows, role, has_shop

    def scalar(self, statement):
        entity = statement.column_descriptions[0].get("entity")
        if entity is Shop:
            return Shop(id=uuid.uuid4(), phone=PHONE) if self.has_shop else None
        if entity is Supplier:
            return None
        return None

    def get(self, model, key):
        return OwnerIdentity(phone=key, role=self.role) if model is OwnerIdentity else None

    def scalars(self, statement):
        return FakeResult(self.rows)


class FakeVoice:
    def __init__(self, result):
        self.result, self.calls = result, []

    def analyze(self, audio, mime_type):
        self.calls.append((len(audio), mime_type))
        return self.result


def client(voice, rows, **kw):
    app = FastAPI()
    install(app)
    app.include_router(router)
    session = FakeSession(rows, **kw)
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    app.dependency_overrides[get_voice_vision] = lambda: voice
    return TestClient(app)


def post(c, name="bill.ogg", data=b"abc", content_type="application/octet-stream"):
    return c.post(
        "/shop/ai/voice-bill", files={"audio": (name, data, content_type)}, headers=AUTH
    )


TOMATO = product("Tomato", "gram")
RICE = product("Parle-G", barcode="8901719101755", brand="Parle")
ROWS = [shop_row(TOMATO, "40.00"), shop_row(RICE, "5.00")]


def spoken(*lines, transcript="t"):
    return VoiceResult(transcript=transcript, lines=list(lines))


def test_spoken_loose_item_maps_to_the_shops_tile_in_grams():
    voice = FakeVoice(spoken(VoiceLine(spoken="അര കിലോ തക്കാളി", name="Tomato", quantity=0.5, unit="kg", confidence=0.9)))
    r = post(client(voice, ROWS))
    assert r.status_code == 200
    line = r.json()["suggestions"][0]
    assert line["product"]["id"] == str(TOMATO.id)
    assert (line["quantity"], line["unit"], line["price"]) == (500, "gram", 40.0)
    assert line["needs_check"] is False and line["note"] is None
    assert voice.calls == [(3, "audio/ogg")]


def test_branded_packaged_item_maps_by_name_and_counts_pieces():
    voice = FakeVoice(spoken(VoiceLine(name="Parle-G", brand="Parle", quantity=2, unit="piece", confidence=0.9)))
    line = post(client(voice, ROWS)).json()["suggestions"][0]
    assert line["product"]["id"] == str(RICE.id) and line["quantity"] == 2 and line["price"] == 5.0


def test_unknown_item_is_flagged_not_invented():
    voice = FakeVoice(spoken(VoiceLine(spoken="x", name="Dragon fruit", quantity=1, unit="kg", confidence=0.9)))
    line = post(client(voice, ROWS)).json()["suggestions"][0]
    assert line["product"] is None and line["needs_check"] is True and line["price"] is None


def test_weight_unit_on_a_counted_product_needs_a_check():
    voice = FakeVoice(spoken(VoiceLine(name="Parle-G", brand="Parle", quantity=1, unit="kg", confidence=0.9)))
    line = post(client(voice, ROWS)).json()["suggestions"][0]
    assert line["needs_check"] is True and "check" in line["note"].lower()


def test_empty_and_zero_quantity_lines_are_dropped():
    voice = FakeVoice(spoken(VoiceLine(), VoiceLine(name="Tomato", quantity=0, unit="kg")))
    assert post(client(voice, ROWS)).json()["suggestions"] == []


@pytest.mark.parametrize(
    "line,unit,expected",
    [
        (VoiceLine(quantity=0.5, unit="kg"), "gram", (500, None)),
        (VoiceLine(quantity=250, unit="g"), "gram", (250, None)),
        (VoiceLine(quantity=2, unit="dozen"), "piece", (24, None)),
        (VoiceLine(quantity=3, unit="unknown"), "piece", (3, None)),
    ],
)
def test_unit_conversion(line, unit, expected):
    assert to_base_units(line, unit) == expected


def test_rejects_non_audio_empty_and_oversized_uploads():
    c = client(FakeVoice(spoken()), ROWS)
    assert post(c, name="a.txt", content_type="text/plain").status_code == 400
    assert post(c, data=b"").status_code == 400
    assert post(c, data=b"x" * (5 * 1024 * 1024 + 1)).status_code == 400


def test_needs_a_retailer_with_a_shop():
    c = client(FakeVoice(spoken()), ROWS, has_shop=False)
    assert post(c).status_code == 404
    assert client(FakeVoice(spoken()), ROWS, role="supplier").post(
        "/shop/ai/voice-bill", files={"audio": ("a.ogg", b"abc", "audio/ogg")}, headers=AUTH
    ).status_code in (401, 403)
