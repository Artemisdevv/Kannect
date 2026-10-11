"""Seed demo retailers and suppliers around one Kochi neighbourhood.

Usage (from backend/):
    python scripts/seed_demo.py            # dry run
    python scripts/seed_demo.py --apply
    python scripts/seed_demo.py --apply --reset   # delete the demo shops first, then recreate

EVERYTHING HERE IS FICTIONAL: shop and supplier names, owners, phone numbers (+91900000xxxx) and
exact coordinates (approximate, around Kaloor, Kochi). Prices are the demo MRPs from the starter
packs. Demo owners log in with the demo OTP (DEMO_OTP).

Demo scenario ("network moment"): a shopper at DEMO_POINT searches "soap". The nearest shop is out of
Cinthol soap, the next one ~300 m away has it in stock.
"""

import argparse
import json
import random
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from geoalchemy2 import WKTElement  # noqa: E402
from sqlalchemy import delete, select, text  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    OwnerIdentity,
    Product,
    Shop,
    ShopProduct,
    StockEvent,
    Supplier,
)
from app.stock import DEFAULT_LOW_THRESHOLDS  # noqa: E402

PACKS = Path(__file__).resolve().parents[2] / "data/seed/packs"
DEMO_POINT = (9.9990, 76.3020)  # (lat, lng) the demo shopper stands at, near Kaloor, Kochi
PHONE_PREFIX = "+91900000"

# name, owner, type, (dlat, dlng) offset from DEMO_POINT in degrees (0.001 deg ~ 110 m)
SHOPS = [
    ("Sreeram Stores", "Sreekumar", "provision", (0.0010, 0.0008)),
    ("Mary Matha Provision", "Mary Joseph", "provision", (-0.0020, 0.0015)),
    ("Nair's Kada", "Ramachandran Nair", "grocery", (0.0030, -0.0020)),
    ("Fathima Supermarket", "Fathima Beevi", "grocery", (-0.0035, -0.0030)),
    ("Joseph & Sons Groceries", "Joseph Thomas", "grocery", (0.0055, 0.0040)),
    ("Al-Ameen Stores", "Abdul Majeed", "provision", (-0.0060, 0.0050)),
    ("Thomas Fresh Mart", "Thomas Varghese", "grocery", (0.0075, -0.0060)),
    ("Lakshmi Provisions", "Lakshmi Devi", "provision", (-0.0090, -0.0070)),
]
SUPPLIERS = [
    ("Kaloor Wholesale Traders", "Anil Menon", (0.0025, 0.0030)),
    ("Ernakulam Provision Distributors", "Basheer Ahmed", (-0.0040, -0.0045)),
    ("Malabar FMCG Distribution", "Suresh Pillai", (0.0100, 0.0090)),
]

# Hand-set states for the demo products, per shop index: in / low / out / none (not stocked)
SCENARIO = {
    "Cinthol soap": ["out", "in", "low", "in", "none", "in", "out", "low"],
    "Parle G biscuit": ["in", "in", "in", "low", "in", "out", "in", "in"],
    "Maggi Noodles": ["in", "out", "in", "in", "low", "in", "none", "in"],
    "Amul Pasteurized Butter": ["low", "in", "out", "in", "in", "low", "in", "out"],
    "Tata Salt": ["in", "in", "low", "in", "out", "in", "in", "low"],
}


def load_packs() -> dict[str, list[dict]]:
    return {
        f.stem: json.loads(f.read_text(encoding="utf-8"))["items"] for f in PACKS.glob("*.json")
    }


def qty_for(state: str, unit: str, rng: random.Random) -> int:
    t = DEFAULT_LOW_THRESHOLDS[unit]
    if state == "in":
        return rng.randint(t * 2, t * 8)
    if state == "low":
        return rng.randint(max(1, t // 5), t - 1)
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()
    rng = random.Random(2026)
    packs = load_packs()

    with SessionLocal() as db:
        # resolve pack items to real product rows (by barcode, loose by name)
        wanted = {i["barcode"] for p in packs.values() for i in p if i["barcode"]}
        by_barcode = {
            p.barcode: p for p in db.scalars(select(Product).where(Product.barcode.in_(wanted)))
        }
        loose = {
            p.name: p for p in db.scalars(select(Product).where(Product.barcode.is_(None)))
        }

        def resolve(item: dict) -> Product | None:
            return loose.get(item["name"]) if item["loose"] else by_barcode.get(item["barcode"])

        scenario_products: dict[str, Product] = {}
        for key in SCENARIO:
            for items in packs.values():
                hit = next(
                    (i for i in items if not i["loose"] and key.lower() in
                     f"{i['brand']} {i['name']}".lower()), None,
                )  # fmt: skip
                if hit and resolve(hit):
                    scenario_products[key] = resolve(hit)
                    break
        missing = set(SCENARIO) - set(scenario_products)
        print(f"products resolved: {len(by_barcode)} packaged, {len(loose)} loose; "
              f"scenario items found: {len(scenario_products)}/{len(SCENARIO)} {sorted(missing) or ''}")  # fmt: skip

        phones = [f"{PHONE_PREFIX}{i:04d}" for i in range(1, len(SHOPS) + 1)]
        sup_phones = [f"{PHONE_PREFIX}{100 + i:04d}" for i in range(1, len(SUPPLIERS) + 1)]
        existing = set(db.scalars(select(Shop.phone).where(Shop.phone.like(f"{PHONE_PREFIX}%"))))
        if existing and not args.reset:
            print(f"{len(existing)} demo shops already exist; use --reset to rebuild. Nothing changed.")
            return

        plan_rows = 0
        if args.apply and args.reset and existing:
            ids = list(db.scalars(select(Shop.id).where(Shop.phone.in_(existing))))
            db.execute(delete(StockEvent).where(StockEvent.shop_id.in_(ids)))
            db.execute(delete(ShopProduct).where(ShopProduct.shop_id.in_(ids)))
            db.execute(delete(Shop).where(Shop.id.in_(ids)))
            db.execute(delete(Supplier).where(Supplier.phone.like(f"{PHONE_PREFIX}%")))
            db.execute(delete(OwnerIdentity).where(OwnerIdentity.phone.like(f"{PHONE_PREFIX}%")))
            db.flush()
            print(f"reset: removed {len(ids)} demo shops")

        for idx, (name, owner, stype, (dlat, dlng)) in enumerate(SHOPS):
            lat, lng = DEMO_POINT[0] + dlat, DEMO_POINT[1] + dlng
            shop = Shop(
                id=uuid.uuid4(), name=name, owner_name=owner, phone=phones[idx],
                address="Near Kaloor, Kochi (demo, approximate)", language="ml",
                shop_type=stype, location=WKTElement(f"POINT({lng} {lat})", srid=4326),
            )  # fmt: skip
            db.add(shop)
            db.add(OwnerIdentity(phone=phones[idx], role="retailer"))
            db.flush()

            items = [(i, resolve(i)) for i in packs[stype]]
            items = [(i, p) for i, p in items if p is not None]
            chosen: dict[uuid.UUID, tuple[dict | None, Product, str]] = {}
            for item, prod in items:
                state = rng.choices(["in", "low", "out", "none"], [60, 20, 12, 8])[0]
                chosen[prod.id] = (item, prod, state)
            for key, prod in scenario_products.items():  # hand-set states win
                chosen[prod.id] = (None, prod, SCENARIO[key][idx])

            for item, prod, state in chosen.values():
                if state == "none":
                    continue
                price = prod.mrp if prod.mrp is not None else item["mrp"]
                sp = ShopProduct(
                    shop_id=shop.id, product_id=prod.id, price=price,
                    cost_price=round(price * 85 / 100, 2), pinned=bool(item and item["loose"]),
                    low_threshold=DEFAULT_LOW_THRESHOLDS[prod.unit], needs_recount=False,
                )  # fmt: skip
                db.add(sp)
                db.flush()
                q = qty_for(state, prod.unit, rng)
                opening = q if state != "out" else DEFAULT_LOW_THRESHOLDS[prod.unit] * 2
                db.add(StockEvent(shop_id=shop.id, product_id=prod.id, client_id=uuid.uuid4(),
                                  type="restock", quantity=opening, count_source="owner_exact"))  # fmt: skip
                if state == "out":
                    db.add(StockEvent(shop_id=shop.id, product_id=prod.id, client_id=uuid.uuid4(),
                                      type="sale", quantity=opening))  # fmt: skip
                plan_rows += 1

        for idx, (name, contact, (dlat, dlng)) in enumerate(SUPPLIERS):
            lat, lng = DEMO_POINT[0] + dlat, DEMO_POINT[1] + dlng
            db.add(Supplier(
                id=uuid.uuid4(), name=name, contact_name=contact, phone=sup_phones[idx],
                address="Kochi (demo, fictional)", delivery_radius_m=15000,
                location=WKTElement(f"POINT({lng} {lat})", srid=4326),
            ))  # fmt: skip
            db.add(OwnerIdentity(phone=sup_phones[idx], role="supplier"))

        db.flush()
        print(f"shops: {len(SHOPS)}  suppliers: {len(SUPPLIERS)}  shop_product rows: {plan_rows}")
        lat, lng = DEMO_POINT
        rows = db.execute(text(
            "select s.name, round(st_distance(s.location::geography, st_makepoint(:lng,:lat)::geography)) "
            "from shop s where s.phone like :p order by 2"), {"lat": lat, "lng": lng, "p": f"{PHONE_PREFIX}%"})  # fmt: skip
        print("distance from demo point:", [(n, int(d)) for n, d in rows])
        if not args.apply:
            db.rollback()
            print("\ndry run only (rolled back). Re-run with --apply.")
            return
        db.commit()
        print("committed.")


if __name__ == "__main__":
    main()
