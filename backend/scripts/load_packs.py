"""Apply starter-pack prices and loose items to the catalogue.

Usage (from backend/):
    python scripts/load_packs.py            # dry run
    python scripts/load_packs.py --apply

For packaged items: sets product.mrp where it is still NULL; with --reprice it overwrites every pack item
(use after editing prices in the pack JSON).
For loose items (no barcode): inserts a product row if one with that name and no barcode is missing.
The price in these packs is a DEMO value (see mrp_source in the pack JSON), not a verified MRP.
Applying the packs also refreshes ordered membership in starter_pack_item. Upgrade the database
before using --apply.
"""

import argparse
import json
import sys
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text  # noqa: E402

from app.config import get_settings  # noqa: E402

PACKS = Path(__file__).resolve().parents[2] / "data/seed/packs"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--reprice", action="store_true", help="overwrite mrp for every pack item")
    args = ap.parse_args()

    packaged: dict[str, dict] = {}
    loose: dict[str, dict] = {}
    pack_items: dict[str, list[dict]] = {}
    for f in sorted(PACKS.glob("*.json")):
        pack = json.loads(f.read_text(encoding="utf-8"))
        shop_type = pack["shop_type"]
        if shop_type in pack_items:
            raise ValueError(f"Duplicate starter pack for shop type {shop_type}")
        pack_items[shop_type] = pack["items"]
        for it in pack["items"]:
            if it["loose"]:
                loose[it["name"]] = it
            else:
                packaged[it["barcode"]] = it
    print(
        f"packaged products to price: {len(packaged)}   loose items: {len(loose)}   "
        f"pack memberships: {sum(len(items) for items in pack_items.values())}"
    )

    engine = create_engine(get_settings().database_url)
    with engine.begin() as conn:
        found = {
            r[0]: r[1]
            for r in conn.execute(
                text("select barcode, mrp from product where barcode = any(:b)"),
                {"b": list(packaged)},
            )
        }
        missing = [b for b in packaged if b not in found]
        to_price = [
            b for b in packaged if b in found and (args.reprice or found[b] is None)
        ]
        print(f"in catalogue: {len(found)}  missing (will insert from the pack): {len(missing)}  "
              f"to price (mrp is NULL): {len(to_price)}")  # fmt: skip
        existing = {
            r[0]
            for r in conn.execute(text("select name from product where barcode is null"))
        }
        new_loose = [n for n in loose if n not in existing]
        print(f"loose items to insert: {len(new_loose)} of {len(loose)}")
        if not args.apply:
            print("\ndry run only. Re-run with --apply.")
            conn.rollback()
            return

        for b in missing:
            it = packaged[b]
            conn.execute(
                text(
                    "insert into product (barcode, name, brand, size, category, unit, image_url, mrp, is_active) "
                    "values (:b, :n, :br, :sz, :c, 'piece', :img, :m, true) on conflict (barcode) do nothing"
                ),
                {"b": b, "n": it["name"], "br": it["brand"], "sz": it["size"],
                 "c": it["category"] or "packaged_food", "img": it["image_url"], "m": it["mrp"]},
            )  # fmt: skip
        for b in to_price:
            conn.execute(
                text("update product set mrp = :m where barcode = :b"),
                {"m": packaged[b]["mrp"], "b": b},
            )
        for n in new_loose:
            it = loose[n]
            conn.execute(
                text(
                    "insert into product (name, name_ml, category, unit, mrp, is_active) "
                    "values (:n, :ml, :c, :u, :m, true)"
                ),
                {"n": n, "ml": it["name_ml"], "c": it["category"], "u": it["unit"], "m": it["mrp"]},
            )

        product_ids: dict[tuple[str, str], UUID] = {}
        products = conn.execute(
            text(
                "select id, barcode, name from product "
                "where barcode = any(:barcodes) "
                "or (barcode is null and name = any(:loose_names))"
            ),
            {"barcodes": list(packaged), "loose_names": list(loose)},
        )
        for product_id, barcode, name in products:
            key = ("barcode", barcode) if barcode is not None else ("name", name)
            product_ids[key] = product_id

        membership_rows = []
        for shop_type, items in pack_items.items():
            identities = [
                ("name", item["name"])
                if item["loose"]
                else ("barcode", item["barcode"])
                for item in items
            ]
            if len(identities) != len(set(identities)):
                raise ValueError(f"Duplicate product in {shop_type} starter pack")
            conn.execute(
                text("delete from starter_pack_item where shop_type = :shop_type"),
                {"shop_type": shop_type},
            )
            for position, identity in enumerate(identities):
                product_id = product_ids.get(identity)
                if product_id is None:
                    raise ValueError(
                        f"Could not resolve {identity[1]!r} in {shop_type} starter pack"
                    )
                membership_rows.append(
                    {"shop_type": shop_type, "product_id": product_id, "position": position}
                )
        if membership_rows:
            conn.execute(
                text(
                    "insert into starter_pack_item (shop_type, product_id, position) "
                    "values (:shop_type, :product_id, :position)"
                ),
                membership_rows,
            )
        print(
            f"\npriced {len(to_price)} products, inserted {len(new_loose)} loose items, "
            f"loaded {len(membership_rows)} pack memberships"
        )


if __name__ == "__main__":
    main()
