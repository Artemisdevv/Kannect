"""Fuzzy-match shelf detections to barcoded catalogue candidates.

Usage (from backend/):  python scripts/match_detections.py
Reads  ../data/out/detections.jsonl  and  ../data/seed/off_candidates.jsonl
Writes ../data/out/matches.csv  (best 3 candidates per readable detection) and prints a summary.

Same logic is meant to back POST /shop/ai/shelf-photo: auto-accept >= STRONG, offer alternatives
for WEAK..STRONG, otherwise `needs_scan`.
"""

import csv
import json
import re
from pathlib import Path

from rapidfuzz import fuzz

ROOT = Path(__file__).resolve().parents[2] / "data"
STRONG, WEAK = 85, 60


def norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def main() -> None:
    cands = [json.loads(line) for line in (ROOT / "seed/off_candidates.jsonl").open(encoding="utf-8")]
    keys = [norm(f"{c['brands']} {c['product_name']} {c['quantity']}") for c in cands]

    dets = []
    for line in (ROOT / "out/detections.jsonl").open(encoding="utf-8"):
        rec = json.loads(line)
        for d in rec["detections"]:
            dets.append({"image": rec["image"], **d})

    out = ROOT / "out/matches.csv"
    strong = weak = none = skipped = 0
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["image", "brand", "name", "size", "count", "status", "score",
                    "cand_barcode", "cand_name", "cand_brand", "cand_size", "alternatives"])  # fmt: skip
        for d in dets:
            if not d["readable"] or d["loose"]:
                skipped += 1
                continue
            q = norm(f"{d['brand']} {d['name']} {d['size']}")
            brand = norm(d["brand"])
            qtoks = {t for t in norm(d["name"]).split() if len(t) > 2 and t != brand}
            scored = []
            for i, k in enumerate(keys):
                s = fuzz.token_set_ratio(q, k)
                # brand gate: if we read a brand, the candidate must contain it
                if len(brand) > 2 and fuzz.partial_ratio(brand, k) < 85:
                    s = min(s, 50)
                # coverage: share of the name's words present in the candidate
                if qtoks:
                    cov = sum(any(fuzz.ratio(t, w) >= 85 for w in k.split()) for t in qtoks) / len(qtoks)
                    s = s * (0.5 + 0.5 * cov)
                scored.append((k, s, i))
            top = sorted(scored, key=lambda x: -x[1])[:3]
            best = top[0]
            score = best[1]
            c = cands[best[2]]
            status = "strong" if score >= STRONG else "weak" if score >= WEAK else "needs_scan"
            strong += status == "strong"
            weak += status == "weak"
            none += status == "needs_scan"
            alts = "; ".join(f"{cands[i]['code']} {cands[i]['product_name']}" for _, _, i in top[1:])
            w.writerow([d["image"], d["brand"], d["name"], d["size"], d["visible_count"], status,
                        round(score), c["code"], c["product_name"], c["brands"], c["quantity"], alts])  # fmt: skip

    n = strong + weak + none
    print(f"detections={len(dets)} matched-eligible={n} skipped(unreadable/loose)={skipped}")
    print(f"strong={strong} weak={weak} needs_scan={none}  ->  {out}")


if __name__ == "__main__":
    main()
