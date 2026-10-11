# ruff: noqa: E501
"""Group-buy lifecycle on real PostGIS: radius, joining, settlement into orders."""

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
    OrderLine,
    OrderTracking,
    OwnerIdentity,
    Product,
    Shop,
    Supplier,
    SupplierOrder,
    SupplierProduct,
)
from app.models.group_buy import GroupBuy, GroupBuyMember

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_INTEGRATION") != "1", reason="set RUN_INTEGRATION=1 with a local database"
)

client = TestClient(app)
# a spot in the south Atlantic, away from the demo shops
LAT, LNG = -10.0, -20.0


def phone() -> str:
    return "+9170" + f"{uuid.uuid4().int % 10**8:08d}"


@pytest.fixture
def world():
    assert make_url(get_settings().database_url).host in {"localhost", "127.0.0.1", "db", "postgres"}
    tag = uuid.uuid4().hex[:8]
    w: dict = {"tag": tag, "phones": {}}
    with SessionLocal() as db:
        product = Product(id=uuid.uuid4(), barcode=f"GB{tag}", name=f"Rice {tag}", unit="piece",
                          is_active=True)  # fmt: skip
        supplier = Supplier(id=uuid.uuid4(), name=f"Sup {tag}", phone=phone(),
                            delivery_radius_m=3000,
                            location=WKTElement(f"POINT({LNG} {LAT})", srid=4326))  # fmt: skip
        db.add_all([product, supplier])
        db.flush()
        db.add(SupplierProduct(supplier_id=supplier.id, product_id=product.id, price=100,
                               pack_size=10, min_order_packs=1, available=True))  # fmt: skip
        db.add(OwnerIdentity(phone=supplier.phone, role="supplier"))
        shops = {}
        # near1 and near2 are inside the 3 km radius, far is ~11 km away
        for key, dlng in (("near1", 0.002), ("near2", 0.004), ("far", 0.1)):
            s = Shop(id=uuid.uuid4(), name=f"{key}{tag}", phone=phone(), language="en",
                     location=WKTElement(f"POINT({LNG + dlng} {LAT})", srid=4326))  # fmt: skip
            db.add(s)
            db.add(OwnerIdentity(phone=s.phone, role="retailer"))
            shops[key] = s
        db.commit()
        w.update(product=product.id, supplier=supplier.id, sup_phone=supplier.phone,
                 shops={k: s.id for k, s in shops.items()},
                 phones={k: s.phone for k, s in shops.items()})  # fmt: skip
    yield w
    with SessionLocal() as db:
        gbs = list(db.scalars(select(GroupBuy.id).where(GroupBuy.supplier_id == w["supplier"])))
        orders = list(db.scalars(select(SupplierOrder.id).where(SupplierOrder.supplier_id == w["supplier"])))
        db.execute(delete(OrderTracking).where(OrderTracking.order_id.in_(orders)))
        db.execute(delete(OrderLine).where(OrderLine.order_id.in_(orders)))
        db.execute(delete(SupplierOrder).where(SupplierOrder.id.in_(orders)))
        db.execute(delete(GroupBuyMember).where(GroupBuyMember.group_buy_id.in_(gbs)))
        db.execute(delete(GroupBuy).where(GroupBuy.id.in_(gbs)))
        db.execute(delete(SupplierProduct).where(SupplierProduct.supplier_id == w["supplier"]))
        db.execute(delete(Supplier).where(Supplier.id == w["supplier"]))
        db.execute(delete(Shop).where(Shop.id.in_(list(w["shops"].values()))))
        db.execute(delete(OwnerIdentity).where(
            OwnerIdentity.phone.in_([w["sup_phone"], *w["phones"].values()])))  # fmt: skip
        db.execute(delete(Product).where(Product.id == w["product"]))
        db.commit()


def login(p: str, role: str) -> dict:
    client.post("/api/v1/auth/otp/request", json={"phone": p, "role": role})
    r = client.post("/api/v1/auth/otp/verify",
                    json={"phone": p, "otp": get_settings().demo_otp, "role": role})  # fmt: skip
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def open_group_buy(w, tiers):
    deadline = (datetime.now(UTC) + timedelta(days=2)).isoformat()
    r = client.post("/api/v1/supplier/group-buys", headers=login(w["sup_phone"], "supplier"),
                    json={"product_id": str(w["product"]), "tiers": tiers, "deadline": deadline})  # fmt: skip
    assert r.status_code == 201, r.text
    return r.json()


def expire(gb_id: str) -> None:
    with SessionLocal() as db:
        db.execute(update(GroupBuy).where(GroupBuy.id == uuid.UUID(gb_id))
                   .values(deadline=datetime.now(UTC) - timedelta(minutes=1)))  # fmt: skip
        db.commit()


TIERS = [{"min_packs": 5, "price": 95}, {"min_packs": 12, "price": 90}]


def test_validation(world):
    h = login(world["sup_phone"], "supplier")
    soon = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    base = {"product_id": str(world["product"]), "deadline": soon}
    assert client.post("/api/v1/supplier/group-buys", headers=h,
                       json={**base, "tiers": [{"min_packs": 5, "price": 120}]}).status_code == 400  # fmt: skip
    assert client.post("/api/v1/supplier/group-buys", headers=h,
                       json={**base, "tiers": TIERS, "deadline": "2020-01-01T00:00:00Z"}).status_code == 400  # fmt: skip
    assert client.post("/api/v1/supplier/group-buys", headers=h,
                       json={**base, "tiers": TIERS, "product_id": str(uuid.uuid4())}).status_code == 400  # fmt: skip


def test_radius_join_and_confirmed_settlement_creates_orders(world):
    gb = open_group_buy(world, TIERS)
    assert gb["current_price"] == 100.0 and gb["pooled_packs"] == 0
    assert gb["next_tier"]["packs_needed"] == 5

    near1 = login(world["phones"]["near1"], "retailer")
    near2 = login(world["phones"]["near2"], "retailer")
    far = login(world["phones"]["far"], "retailer")

    assert [g["id"] for g in client.get("/api/v1/group-buys", headers=near1).json()["items"]] == [gb["id"]]
    assert client.get("/api/v1/group-buys", headers=far).json()["items"] == []  # out of radius
    assert client.post(f"/api/v1/group-buys/{gb['id']}/join", headers=far,
                       json={"packs": 5}).status_code == 404  # fmt: skip

    j1 = client.post(f"/api/v1/group-buys/{gb['id']}/join", headers=near1, json={"packs": 4})
    assert j1.status_code == 201 and j1.json()["my_packs"] == 4 and j1.json()["current_price"] == 100.0
    j2 = client.post(f"/api/v1/group-buys/{gb['id']}/join", headers=near2, json={"packs": 3})
    assert j2.json()["pooled_packs"] == 7 and j2.json()["shops_joined"] == 2
    assert j2.json()["current_price"] == 95.0  # tier 5 reached by pooling
    again = client.post(f"/api/v1/group-buys/{gb['id']}/join", headers=near1, json={"packs": 6})
    assert again.json()["pooled_packs"] == 9 and again.json()["shops_joined"] == 2  # replaces, not adds

    expire(gb["id"])
    sup = login(world["sup_phone"], "supplier")
    listed = client.get("/api/v1/supplier/group-buys", headers=sup).json()["items"]
    assert listed[0]["status"] == "confirmed" and listed[0]["current_price"] == 95.0

    with SessionLocal() as db:
        orders = list(db.scalars(select(SupplierOrder).where(SupplierOrder.group_buy_id == uuid.UUID(gb["id"]))))
        assert len(orders) == 2
        by_shop = {o.shop_id: o for o in orders}
        assert float(by_shop[world["shops"]["near1"]].total) == 6 * 95.0
        assert float(by_shop[world["shops"]["near2"]].total) == 3 * 95.0
        assert all(o.status == "placed" for o in orders)

    # settling again must not duplicate orders
    client.get("/api/v1/supplier/group-buys", headers=sup)
    with SessionLocal() as db:
        n = len(list(db.scalars(select(SupplierOrder).where(SupplierOrder.group_buy_id == uuid.UUID(gb["id"])))))
        assert n == 2

    # closed: joining now is a 409
    assert client.post(f"/api/v1/group-buys/{gb['id']}/join", headers=near1,
                       json={"packs": 1}).status_code == 409  # fmt: skip


def test_failed_when_no_tier_reached_creates_no_orders(world):
    gb = open_group_buy(world, TIERS)
    near1 = login(world["phones"]["near1"], "retailer")
    client.post(f"/api/v1/group-buys/{gb['id']}/join", headers=near1, json={"packs": 2})
    expire(gb["id"])
    sup = login(world["sup_phone"], "supplier")
    assert client.get("/api/v1/supplier/group-buys", headers=sup).json()["items"][0]["status"] == "failed"
    with SessionLocal() as db:
        assert not list(db.scalars(select(SupplierOrder).where(SupplierOrder.group_buy_id == uuid.UUID(gb["id"]))))
