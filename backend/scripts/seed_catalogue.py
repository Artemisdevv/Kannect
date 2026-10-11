"""Load Open Food Facts India products into the shared catalogue (product table).

Usage (from backend/):
    python scripts/seed_catalogue.py            # dry run: cleans, filters, prints a report
    python scripts/seed_catalogue.py --apply    # insert into DATABASE_URL

- Source: data/seed/off_candidates.jsonl (see harvest_off.py). Open Food Facts: ODbL, images CC-BY-SA,
  attribution https://world.openfoodfacts.org (image_url hotlinks the OFF CDN).
- Idempotent: ON CONFLICT (barcode) DO NOTHING, existing rows are never overwritten.
- No prices: OFF has none, so mrp stays NULL (owners set the price when adding the product).
- Skips rows that carry no product information (name is just the brand, junk names).
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.dialects.postgresql import insert  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.models import Product  # noqa: E402

SRC = Path(__file__).resolve().parents[2] / "data/seed/off_candidates.jsonl"
CATEGORY_RULES = [
    (("biscuit", "snack", "chip", "crisp", "namkeen", "confection", "candy", "chocolate"), "snacks_biscuits"),
    (("beverage", "drink", "juice", "tea", "coffee", "water"), "beverages"),
    (("dairy", "dairies", "milk", "yogurt", "cheese", "butter", "egg"), "dairy_eggs"),
    (("spice", "condiment", "sauce", "oil", "masala", "pickle"), "oils_spices"),
    (("cereal", "rice", "flour", "pulse", "legume", "grain", "atta", "dal"), "staples_grains"),
]  # fmt: skip


def tidy(s: str) -> str:
    s = re.sub(r"\s+", " ", s or "").strip()
    return s.title() if s and (s.islower() or s.isupper()) else s


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


GENERIC_TAGS = {"plant-based-foods-and-beverages", "plant-based-foods", "foods-and-beverages",
                "food", "foods", "beverages-and-beverages-preparations"}  # fmt: skip


def category(tags: str) -> str:
    # Most specific tags are listed last; drop OFF's broad parents that would match everything
    specific = [t.split(":", 1)[-1] for t in (tags or "").lower().split(",") if t]
    blob = " ".join(t for t in specific if t not in GENERIC_TAGS)
    for words, cat in CATEGORY_RULES:
        if any(re.search(rf"\b{w}", blob) for w in words):
            return cat
    return "packaged_food"


def size(raw: str) -> str | None:
    raw = (raw or "").strip()
    return raw[:128] if re.search(r"[a-zA-Z]", raw) else None  # "1" alone has no unit


def clean(row: dict) -> tuple[dict | None, str]:
    brand = tidy(row["brands"].split(",")[0]) if row["brands"] else ""
    name = tidy(row["product_name"])
    if len(norm(name)) < 3 or norm(name).isdigit():
        return None, "junk name"
    name_tokens, brand_tokens = set(norm(name).split()), set(norm(brand).split())
    if brand_tokens and name_tokens <= brand_tokens:
        return None, "name is only the brand"  # e.g. Haldiram's / Haldiram's, matches everything
    return {
        "barcode": row["code"],
        "name": name[:255],
        "brand": brand[:255] or None,
        "size": size(row["quantity"]),
        "category": category(row["categories_tags"]),
        "unit": "piece",
        "image_url": row["image_small_url"] or None,
        "mrp": None,
        "is_active": True,
    }, ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    rows = [json.loads(line) for line in SRC.open(encoding="utf-8")]
    kept, dropped = [], Counter()
    seen: set[str] = set()
    for r in rows:
        item, why = clean(r)
        if item is None:
            dropped[why] += 1
        elif item["barcode"] in seen:
            dropped["duplicate barcode"] += 1
        else:
            seen.add(item["barcode"])
            kept.append(item)

    print(f"source rows: {len(rows)}  keep: {len(kept)}  drop: {sum(dropped.values())} {dict(dropped)}")
    print("categories:", dict(Counter(k["category"] for k in kept).most_common()))
    print("with brand:", sum(bool(k["brand"]) for k in kept), " with size:", sum(bool(k["size"]) for k in kept))
    for k in kept[:5]:
        print("  e.g.", k["barcode"], "|", k["brand"], "|", k["name"], "|", k["size"], "|", k["category"])

    if not args.apply:
        print("\ndry run only. Re-run with --apply to insert.")
        return

    engine = create_engine(get_settings().database_url)
    with engine.begin() as conn:
        before = conn.execute(text("select count(*) from product")).scalar()
        for i in range(0, len(kept), 500):
            stmt = insert(Product).values(kept[i : i + 500]).on_conflict_do_nothing(index_elements=["barcode"])
            conn.execute(stmt)
        after = conn.execute(text("select count(*) from product")).scalar()
    print(f"\ninserted {after - before} new products (table had {before}, now {after})")


if __name__ == "__main__":
    main()
