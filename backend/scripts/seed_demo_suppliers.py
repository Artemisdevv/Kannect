"""Give the 3 demo suppliers a wholesale catalogue and one open group buy.

Usage (from backend/):
    python scripts/seed_demo_suppliers.py            # dry run
    python scripts/seed_demo_suppliers.py --apply
    python scripts/seed_demo_suppliers.py --apply --reset   # rebuild this data
    python scripts/seed_demo_orders.py --apply             # seed accepted orders/invoices via API

Needs scripts/seed_demo.py to have created the shops and suppliers first.
Everything is fictional demo data. Wholesale prices are derived from the demo retail MRPs in the
starter packs (about 12% under MRP), so they are demo values too. Orders and invoices are not
seeded here: they should be created through the order endpoints so numbering stays Aswin's.

Demo story: the supplier demand view shows many shops low on Cinthol soap, so Kaloor Wholesale
Traders opens a group buy on it, and two nearby shops have already joined.
"""

import argparse
import json
import sys
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import Product, Shop, Supplier, SupplierProduct  # noqa: E402
from app.models.group_buy import GroupBuy, GroupBuyMember  # noqa: E402

PACKS = Path(__file__).resolve().parents[2] / "data/seed/packs"
PHONE_PREFIX = "+91900000"
WHOLESALE = Decimal("0.88")  # wholesale price as a share of retail MRP
SUPPLIER_PHONES = [f"{PHONE_PREFIX}{100 + i:04d}" for i in (1, 2, 3)]

# Which categories each supplier carries. A product in two suppliers' lists gets two prices
# (the second one a little different) so retailers have something to compare.
FOCUS = {
    SUPPLIER_PHONES[0]: {"snacks_biscuits", "beverages", "packaged_food", "personal_care",
                         "household_cleaning", "pest_control"},  # fmt: skip
    SUPPLIER_PHONES[1]: {"staples_grains", "oils_spices", "packaged_food", "fresh_produce"},
    SUPPLIER_PHONES[2]: {"dairy_eggs", "beverages", "snacks_biscuits", "personal_care"},
}
PRICE_SKEW = {SUPPLIER_PHONES[0]: Decimal("1.00"), SUPPLIER_PHONES[1]: Decimal("0.97"),
              SUPPLIER_PHONES[2]: Decimal("1.03")}  # fmt: skip


def pack_size(item: dict) -> int:
    """Base units per wholesale pack."""
    if item["loose"]:
        if item["unit"] == "gram":
            return 25000  # a 25 kg sack
        return 50 if item["name"] == "Coconut" else 30  # a bag of coconuts, an egg tray
    size = (item["size"] or "").lower()
    cat = item["category"] or ""
    if cat == "beverages" or "ml" in size or " l" in size or size.endswith("l"):
        return 12
    if cat == "dairy_eggs":
        return 10
    if any(k in size for k in ("kg", "1 l", "500 g", "500g", "5 kg")):
        return 6
    return 24 if (item["mrp"] or 0) <= 20 else 12


def money(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()

    items: dict[str, dict] = {}
    for f in sorted(PACKS.glob("*.json")):
        for it in json.loads(f.read_text(encoding="utf-8"))["items"]:
            items[it["name"] if it["loose"] else it["barcode"]] = it

    with SessionLocal() as db:
        suppliers = {
            s.phone: s for s in db.scalars(select(Supplier).where(Supplier.phone.in_(SUPPLIER_PHONES)))
        }
        if len(suppliers) != 3:
            sys.exit("Run scripts/seed_demo.py --apply first (demo suppliers not found).")
        by_barcode = {p.barcode: p for p in db.scalars(select(Product).where(Product.barcode.isnot(None)))
                      if p.barcode in items}  # fmt: skip
        loose = {p.name: p for p in db.scalars(select(Product).where(Product.barcode.is_(None)))}

        if args.reset and args.apply:
            sup_ids = [s.id for s in suppliers.values()]
            gbs = list(db.scalars(select(GroupBuy.id).where(GroupBuy.supplier_id.in_(sup_ids))))
            db.execute(delete(GroupBuyMember).where(GroupBuyMember.group_buy_id.in_(gbs)))
            db.execute(delete(GroupBuy).where(GroupBuy.id.in_(gbs)))
            db.execute(delete(SupplierProduct).where(SupplierProduct.supplier_id.in_(sup_ids)))
            db.flush()
            print("reset: removed existing demo supplier catalogue and group buys")

        existing = {(r.supplier_id, r.product_id) for r in db.scalars(select(SupplierProduct))}
        added, per_supplier = 0, {p: 0 for p in SUPPLIER_PHONES}
        for key, it in items.items():
            product = loose.get(key) if it["loose"] else by_barcode.get(key)
            if product is None or it["mrp"] is None:
                continue
            cat = it["category"] or product.category or "packaged_food"
            n = pack_size(it)
            unit_wholesale = Decimal(str(it["mrp"])) * WHOLESALE
            for phone, cats in FOCUS.items():
                if cat not in cats and not (it["loose"] and "fresh_produce" in cats):
                    continue
                sup = suppliers[phone]
                if (sup.id, product.id) in existing:
                    continue
                # loose goods are priced per kg in the pack, packs are in grams
                per_unit = unit_wholesale / (1000 if it["unit"] == "gram" else 1)
                db.add(SupplierProduct(
                    supplier_id=sup.id, product_id=product.id, pack_size=n,
                    price=money(per_unit * n * PRICE_SKEW[phone]),
                    min_order_packs=1 if n >= 12 else 2, available=True,
                ))  # fmt: skip
                added += 1
                per_supplier[phone] += 1
        db.flush()
        print(f"supplier_product rows to add: {added}  per supplier: "
              f"{ {suppliers[p].name: n for p, n in per_supplier.items()} }")  # fmt: skip

        # one open group buy that follows the demand story
        kaloor = suppliers[SUPPLIER_PHONES[0]]
        cinthol = next((p for p in by_barcode.values() if "cinthol" in p.name.lower()), None)
        if cinthol is None:
            print("Cinthol not found, skipping the group buy")
        else:
            listing = db.get(SupplierProduct, (kaloor.id, cinthol.id))
            has_open = db.scalars(select(GroupBuy).where(
                GroupBuy.supplier_id == kaloor.id, GroupBuy.product_id == cinthol.id,
                GroupBuy.status == "open")).first()  # fmt: skip
            if listing is not None and not has_open:
                base = listing.price
                gb = GroupBuy(
                    supplier_id=kaloor.id, product_id=cinthol.id, pack_size=listing.pack_size,
                    base_price=base,
                    tiers=[{"min_packs": 5, "price": float(money(base * Decimal("0.95")))},
                           {"min_packs": 12, "price": float(money(base * Decimal("0.90")))}],
                    deadline=datetime.now(UTC) + timedelta(days=3), status="open",
                )  # fmt: skip
                db.add(gb)
                db.flush()
                for name, packs in (("Mary Matha Provision", 3), ("Nair's Kada", 2)):
                    shop = db.scalars(select(Shop).where(Shop.name == name)).first()
                    if shop:
                        db.add(GroupBuyMember(group_buy_id=gb.id, shop_id=shop.id, packs=packs))
                print(f"group buy: Cinthol soap, base Rs {base}/pack of {listing.pack_size}, "
                      f"tiers 5 packs / 12 packs, 2 shops joined (5 packs pooled), closes in 3 days")
            else:
                print("group buy: already exists or supplier does not list Cinthol, skipped")

        if not args.apply:
            db.rollback()
            print("\ndry run only (rolled back). Re-run with --apply.")
            return
        db.commit()
        print("committed.")


if __name__ == "__main__":
    main()
