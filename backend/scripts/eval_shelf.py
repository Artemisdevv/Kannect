"""Evaluate the shelf-photo pipeline against human labels.

Step 1, make a sheet for a human to fill in (built from scripts/run_shelf_api.py responses):
    python scripts/eval_shelf.py sheet
    -> data/eval/labeling_sheet.csv   one row per item the system read
    -> data/eval/missed_items.csv     empty, for items visible in a photo that the system missed

Step 2, after labelling:
    python scripts/eval_shelf.py score

How to label (open the photo named in `image`):
  labeling_sheet.csv
    read_ok      y if the label really matches a product on that shelf, n if invented/misread
    match_ok     only for rows with a suggested_product: y if it is the right product (same brand
                 AND variant), n if not. Leave empty when there is no suggestion.
    true_product what it really is, when read_ok=y but the suggestion is wrong or missing
  missed_items.csv
    one row per product visible in the photo that has NO row in the sheet (image, product).
    Only list misses for photos whose rows you labelled, otherwise recall is distorted.

Counts are not scored here, only identification.
"""

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[2] / "data"
EVAL = ROOT / "eval"
SHEET = EVAL / "labeling_sheet.csv"
MISSED = EVAL / "missed_items.csv"
COLS = ["image", "label", "visible_count", "gemini_confidence", "readable", "status",
        "suggested_product", "alternative_1", "alternative_2",
        "read_ok", "match_ok", "true_product", "notes"]  # fmt: skip


def make_sheet() -> None:
    """Build the sheet from what the real endpoint returned (scripts/run_shelf_api.py)."""
    api = sorted((ROOT / "out/shelf_api").glob("*.json"))
    if not api:
        sys.exit("Run scripts/run_shelf_api.py first: the sheet is built from its responses.")

    def name(p: dict) -> str:
        return f"{p.get('brand') or ''} {p['name']} {p.get('size') or ''}".strip()

    EVAL.mkdir(parents=True, exist_ok=True)
    with SHEET.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(COLS)
        for path in api:
            rec = json.loads(path.read_text(encoding="utf-8"))
            for d in rec["detections"]:
                if d["loose"]:
                    status = "loose_tile" if d["match"] else "loose_no_tile"
                elif d["match"]:
                    status = "strong"
                elif d["uncertain"]:
                    status = "uncertain"
                elif d["alternatives"]:
                    status = "weak"
                else:
                    status = "no_match" if d["needs_scan"] else "other"
                alts = [name(a) for a in d["alternatives"]] + ["", ""]
                w.writerow([rec["image"], d["label"], d["visible_count"], round(d["confidence"], 2),
                            status != "uncertain", status, name(d["match"]) if d["match"] else "",
                            alts[0], alts[1], "", "", "", ""])  # fmt: skip
    if not MISSED.exists():
        MISSED.write_text("image,product\n", encoding="utf-8-sig")
    print(f"wrote {SHEET} and {MISSED}")


def rate(num: int, den: int) -> str:
    return f"{num}/{den} = {100 * num / den:.0f}%" if den else "n/a"


def score() -> None:
    rows = list(csv.DictReader(SHEET.open(encoding="utf-8-sig")))
    missed = list(csv.DictReader(MISSED.open(encoding="utf-8-sig"))) if MISSED.exists() else []
    labelled = [r for r in rows if r["read_ok"].strip().lower() in ("y", "n")]
    if not labelled:
        sys.exit("No rows labelled yet: fill the read_ok column first.")
    unlabelled = len(rows) - len(labelled)

    read_ok = [r for r in labelled if r["read_ok"].strip().lower() == "y"]
    print(f"rows: {len(rows)}  labelled: {len(labelled)}  not yet labelled: {unlabelled}")
    print("\nREADING (does the item on the sheet really exist on the shelf?)")
    print(f"  reading precision: {rate(len(read_ok), len(labelled))}")
    found, missed_n = len(read_ok), len(missed)
    print(f"  reading recall   : {rate(found, found + missed_n)}  ({missed_n} missed items listed)")
    if found and (found + missed_n):
        p, rc = found / len(labelled), found / (found + missed_n)
        print(f"  reading F1       : {2 * p * rc / (p + rc):.2f}")

    sugg = [r for r in labelled if r["suggested_product"].strip() and r["match_ok"].strip()]
    ok = [r for r in sugg if r["match_ok"].strip().lower() == "y"]
    print("\nCATALOGUE MATCH (when the app auto-suggests one product)")
    print(f"  match precision  : {rate(len(ok), len(sugg))}")
    resolvable = [
        r for r in read_ok if r["status"] in ("strong", "weak", "uncertain", "no_match")
    ]
    print(f"  auto-matched share of correctly-read packaged items: "
          f"{rate(sum(r['status'] == 'strong' for r in resolvable), len(resolvable))}")
    print(f"  items with no catalogue entry (need a barcode scan): "
          f"{rate(sum(r['status'] == 'no_match' for r in resolvable), len(resolvable))}")

    conf = [float(r["gemini_confidence"]) for r in labelled]
    right = [float(r["gemini_confidence"]) for r in read_ok]
    wrong = [float(r["gemini_confidence"]) for r in labelled if r["read_ok"].strip().lower() == "n"]
    avg = lambda xs: f"{100 * sum(xs) / len(xs):.0f}%" if xs else "n/a"  # noqa: E731
    print("\nCONFIDENCE (the model's own self-reported 0-100%, not a calibrated probability)")
    print(f"  average overall {avg(conf)} | on correct readings {avg(right)} | on wrong {avg(wrong)}")

    by_photo = defaultdict(lambda: [0, 0])
    for r in labelled:
        by_photo[r["image"]][1] += 1
        by_photo[r["image"]][0] += r["read_ok"].strip().lower() == "y"
    full = sum(1 for ok_, n in by_photo.values() if ok_ == n)
    print(f"\nPHOTOS: {len(by_photo)} labelled, {full} with every read item correct")
    worst = sorted(by_photo.items(), key=lambda kv: kv[1][0] / kv[1][1])[:5]
    print("  weakest photos:", [(k[-18:], f"{a}/{b}") for k, (a, b) in worst])

    wrong_rows = [r for r in labelled if r["read_ok"].strip().lower() == "n"]
    if wrong_rows:
        print("\nWRONG READINGS (read these for failure patterns):")
        for r in wrong_rows[:25]:
            print(f"  {r['image'][-18:]}  {r['label'][:40]:40}  {r['notes'][:50]}")


if __name__ == "__main__":
    {"sheet": make_sheet, "score": score}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
