"""Run shelf photos through the real POST /shop/ai/shelf-photo and save each response.

Usage (from backend/):
    python scripts/run_shelf_api.py [--fast] [--limit N] [--images ../data] [--out ../data/out/shelf_api]

Logs in as a demo retailer (demo OTP), so it needs the demo shops seeded and LLM_API_KEY set.
Responses are saved one JSON per photo, then summarised. `--fast` skips the zoomed-tile re-read.
scripts/eval_shelf.py builds the human labelling sheet from these files.
"""

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402

PHONE = "+919000000002"  # Mary Matha Provision (demo retailer)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", default="../data")
    ap.add_argument("--out", default="../data/out/shelf_api")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--fast", action="store_true")
    args = ap.parse_args()

    client = TestClient(app)
    otp = get_settings().demo_otp
    client.post("/api/v1/auth/otp/request", json={"phone": PHONE, "role": "retailer"})
    r = client.post("/api/v1/auth/otp/verify", json={"phone": PHONE, "otp": otp, "role": "retailer"})
    headers = {"Authorization": f"Bearer {r.json()['token']}"}

    photos = sorted(p for p in Path(args.images).iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    if args.limit:
        photos = photos[: args.limit]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    totals = {"items": 0, "match": 0, "alt_only": 0, "uncertain": 0, "loose": 0,
              "loose_tile": 0, "scan": 0, "seconds": 0.0}  # fmt: skip
    for i, p in enumerate(photos, 1):
        t0 = time.time()
        resp = client.post("/api/v1/shop/ai/shelf-photo", headers=headers,
                           params={"thorough": str(not args.fast).lower()},
                           files=[("images", (p.name, p.read_bytes(), "image/jpeg"))])  # fmt: skip
        dt = time.time() - t0
        if resp.status_code != 200:
            print(f"[{i}/{len(photos)}] {p.name}: HTTP {resp.status_code} {resp.text[:120]}")
            continue
        body = resp.json()
        (out / f"{p.stem}.json").write_text(json.dumps({"image": p.name, **body}, ensure_ascii=False), encoding="utf-8")
        d = body["detections"]
        totals["items"] += len(d)
        totals["match"] += sum(bool(x["match"]) and not x["loose"] for x in d)
        totals["loose"] += sum(x["loose"] for x in d)
        totals["loose_tile"] += sum(x["loose"] and bool(x["match"]) for x in d)
        totals["uncertain"] += sum(x["uncertain"] for x in d)
        totals["alt_only"] += sum((not x["match"]) and bool(x["alternatives"]) and not x["uncertain"]
                                  for x in d)  # fmt: skip
        totals["scan"] += sum(x["needs_scan"] for x in d)
        totals["seconds"] += dt
        print(f"[{i}/{len(photos)}] {p.name[-22:]}: {len(d)} items, "
              f"{sum(bool(x['match']) for x in d)} matched, {dt:.0f}s", flush=True)  # fmt: skip
    n = max(len(photos), 1)
    print("\nTOTALS", {k: (round(v, 1) if isinstance(v, float) else v) for k, v in totals.items()},
          f"avg {totals['seconds'] / n:.0f}s per photo")  # fmt: skip


if __name__ == "__main__":
    main()
