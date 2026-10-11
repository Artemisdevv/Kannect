"""Stream the Open Food Facts CSV dump and keep popular products sold in India.

Usage (from backend/):  python scripts/harvest_off.py [--limit 3000] [--out ../data/seed/off_candidates.jsonl]

Streams ~1.3 GB gzip over HTTP and filters on the fly, nothing big is stored.
Keeps: India in countries_tags, barcode with the GS1 India prefix (890), a name, a front image.
Sorted by unique_scans_n (popularity) so the commonly scanned items come first.

Data: Open Food Facts, ODbL (database) / CC-BY-SA (images). Attribution: https://world.openfoodfacts.org
No price field exists in the dump; MRP is added by hand in the curated packs.
"""

import argparse
import codecs
import csv
import gzip
import json
import sys
import urllib.request
from pathlib import Path

URL = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz"
KEEP = [
    "code",
    "product_name",
    "brands",
    "quantity",
    "categories_tags",
    "image_small_url",
    "image_url",
    "unique_scans_n",
]


def rows(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "KadaNet-hackathon/0.1"})
    with urllib.request.urlopen(req) as resp:
        text = codecs.getreader("utf-8")(gzip.GzipFile(fileobj=resp), errors="replace")
        yield from csv.DictReader(text, delimiter="\t", quoting=csv.QUOTE_NONE)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=20000)
    ap.add_argument("--out", default="../data/seed/off_candidates.jsonl")
    ap.add_argument("--url", default=URL)
    args = ap.parse_args()

    csv.field_size_limit(sys.maxsize)
    found: list[dict] = []
    seen = 0
    for row in rows(args.url):
        seen += 1
        if seen % 500_000 == 0:
            print(f"scanned {seen:,} rows, kept {len(found):,}", flush=True)
        if "en:india" not in (row.get("countries_tags") or ""):
            continue
        code = (row.get("code") or "").strip()
        name = (row.get("product_name") or "").strip()
        img = (row.get("image_small_url") or "").strip()
        if not (code.startswith("890") and len(code) == 13 and name and img):
            continue
        item = {k: (row.get(k) or "").strip() for k in KEEP}
        item["unique_scans_n"] = int(item["unique_scans_n"] or 0)
        found.append(item)

    found.sort(key=lambda r: r["unique_scans_n"], reverse=True)
    found = found[: args.limit]
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for r in found:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"scanned {seen:,} rows, wrote {len(found):,} candidates to {out}")


if __name__ == "__main__":
    main()
