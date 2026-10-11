"""Batch-classify shelf photos with a vision LLM (Gemini) into structured product detections.

Usage (from backend/):
    python scripts/classify_shelves.py --images ../data --out ../data/out [--limit 3]

Reads LLM_API_KEY (and optional LLM_MODEL) from backend/.env or the environment.
Writes, per run:
    <out>/detections.jsonl   one JSON object per image (raw model output + metadata)
    <out>/review.csv         one row per detected item, for a human to correct (fill `verified_*`)

Detections are suggestions. The same prompt/schema is meant to be reused by POST /shop/ai/shelf-photo.
"""

import argparse
import csv
import io
import json
import os
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

CATEGORIES = [
    "packaged_food", "snacks_biscuits", "beverages", "dairy_eggs", "staples_grains",
    "oils_spices", "personal_care", "household_cleaning", "stationery", "toys_gifts",
    "electrical_batteries", "pooja_items", "fresh_produce", "loose_goods", "other",
]  # fmt: skip

PROMPT = """You are cataloguing a small Indian neighbourhood shop (kirana / provision store) from a photo.
List every DISTINCT retail product you can identify on the shelves, hooks, counters and hanging racks.

For each product return:
- brand: printed brand name, or "" if not readable
- name: product name as printed (e.g. "High Power cockroach chalk"), keep original spelling
- size: pack size exactly as printed (e.g. "100 g", "1 L"), or ""
- category: one of the allowed categories
- visible_count: number of units/packs of that product visible (count facings and stacked or hanging
  units you can actually see; do not guess units hidden behind others)
- confidence: 0 to 1, your confidence in the brand+name reading
- readable: false if you are guessing from shape/colour only
- loose: true for unpackaged goods sold by weight/count (rice sacks, vegetables, loose items)

Rules: do not invent products or barcodes. If a label is blurry, set readable=false and a low confidence.
Merge identical products into one entry. Ignore people, furniture, bags and signage that is not a product.
Also return image_quality: good | blurry | too_dark | too_far."""


class Detection(BaseModel):
    brand: str = ""
    name: str
    size: str = ""
    category: str = Field(description="one of: " + ", ".join(CATEGORIES))
    visible_count: int = 1
    confidence: float = 0.5
    readable: bool = True
    loose: bool = False


class ShelfResult(BaseModel):
    image_quality: str = "good"
    detections: list[Detection]


def load_env() -> None:
    env = Path(__file__).resolve().parents[1] / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def prepare(path: Path, max_side: int = 2000) -> bytes:
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def classify(client: genai.Client, model: str, path: Path) -> ShelfResult:
    part = types.Part.from_bytes(data=prepare(path), mime_type="image/jpeg")
    cfg = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=ShelfResult,
        temperature=0.1,
    )
    for attempt in range(4):
        try:
            resp = client.models.generate_content(model=model, contents=[part, PROMPT], config=cfg)
            return ShelfResult.model_validate_json(resp.text)
        except Exception as e:  # rate limit / transient
            if attempt == 3:
                raise
            wait = 2 ** (attempt + 1)
            print(f"  retry in {wait}s ({type(e).__name__}: {str(e)[:120]})", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", default="../data")
    ap.add_argument("--out", default="../data/out")
    ap.add_argument("--limit", type=int, default=0, help="only first N images (0 = all)")
    args = ap.parse_args()

    load_env()
    key = os.environ.get("LLM_API_KEY")
    if not key:
        sys.exit("LLM_API_KEY is empty. Put your Gemini key in backend/.env")
    model = os.environ.get("LLM_MODEL", "gemini-2.5-flash")
    client = genai.Client(api_key=key)

    images = sorted(p for p in Path(args.images).iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    if args.limit:
        images = images[: args.limit]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    with (
        (out / "detections.jsonl").open("w", encoding="utf-8") as jf,
        (out / "review.csv").open("w", encoding="utf-8", newline="") as cf,
    ):
        w = csv.writer(cf)
        w.writerow(["image", "brand", "name", "size", "category", "count", "confidence", "readable",
                    "loose", "verified_name", "verified_count", "ok"])  # fmt: skip
        for i, p in enumerate(images, 1):
            print(f"[{i}/{len(images)}] {p.name}", flush=True)
            try:
                res = classify(client, model, p)
            except Exception as e:
                print(f"  FAILED: {e}", file=sys.stderr)
                continue
            jf.write(json.dumps({"image": p.name, "model": model, **res.model_dump()}, ensure_ascii=False) + "\n")
            for d in res.detections:
                w.writerow([p.name, d.brand, d.name, d.size, d.category, d.visible_count,
                            d.confidence, d.readable, d.loose, "", "", ""])  # fmt: skip
            print(f"  {len(res.detections)} items, quality={res.image_quality}")
    print(f"done -> {out}")


if __name__ == "__main__":
    main()
