# ruff: noqa: E501
"""Read a shelf photo with a vision LLM (Gemini). Suggests only, never writes stock."""

import io
from typing import Protocol

from fastapi import HTTPException
from PIL import Image, ImageFilter, ImageOps, ImageStat
from pydantic import BaseModel, Field

from app.config import Settings

CATEGORIES = [
    "packaged_food", "snacks_biscuits", "beverages", "dairy_eggs", "staples_grains",
    "oils_spices", "personal_care", "household_cleaning", "pest_control", "stationery",
    "toys_gifts", "electrical_batteries", "pooja_items", "fresh_produce", "loose_goods", "other",
]  # fmt: skip

PROMPT = """You are cataloguing a small Indian neighbourhood shop (kirana / provision store) from photos.
There may be several photos of the same shop; they can overlap, so do not count the same item twice.
List every DISTINCT retail product you can identify on the shelves, hooks, counters and hanging racks.

For each product return:
- brand: printed brand name, or "" if not readable
- name: product name as printed, keep original spelling
- size: pack size exactly as printed (e.g. "100 g", "1 L"), or ""
- category: one of the allowed categories
- visible_count: number of units/packs of that product you can actually see (count facings and
  stacked or hanging units; do not guess units hidden behind others)
- confidence: 0 to 1, your confidence in the brand+name reading
- readable: false if you are guessing from shape/colour only
- loose: true for unpackaged goods sold by weight/count (rice sacks, vegetables)

Rules: never invent products or barcodes. If a label is blurry, set readable=false and a low
confidence. Merge identical products into one entry. Ignore people, furniture, bags and signage."""

MAX_SIDE = 2000


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
    detections: list[Detection]


class ShelfVision(Protocol):
    def analyze(self, images: list[bytes]) -> ShelfResult: ...


def prepare_image(data: bytes) -> bytes:
    """Fix rotation, cap the size, re-encode as JPEG. Raises ValueError if not an image."""
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    except Exception as e:
        raise ValueError("not a readable image") from e
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()


# Thresholds are conservative guesses, tune on real photos (see docs/vision-experiment.md).
DARK_BELOW = 40  # mean brightness 0..255
BLURRY_BELOW = 100  # real sharp shelf photos score 370+, Gaussian blur sigma 2 scores ~50-70
SMALL_SIDE = 480


def image_quality(data: bytes) -> str:
    """good | blurry | too_dark | too_far. The LLM's own self-report is not reliable."""
    img = Image.open(io.BytesIO(data)).convert("L")
    if min(img.size) < SMALL_SIDE:
        return "too_far"
    img.thumbnail((800, 800))
    if ImageStat.Stat(img).mean[0] < DARK_BELOW:
        return "too_dark"
    edges = img.filter(ImageFilter.Kernel((3, 3), (0, 1, 0, 1, -4, 1, 0, 1, 0), scale=1, offset=128))
    if ImageStat.Stat(edges).var[0] < BLURRY_BELOW:
        return "blurry"
    return "good"


def worst_quality(qualities: list[str]) -> str:
    order = ["good", "too_far", "too_dark", "blurry"]
    return max(qualities, key=order.index, default="good")


def suggested_level(visible_count: int) -> str:
    """Heuristic only. The owner confirms or edits."""
    if visible_count >= 6:
        return "plenty"
    if visible_count >= 3:
        return "some"
    return "few"


class GeminiShelfVision:
    def __init__(self, settings: Settings):
        self.settings = settings

    def analyze(self, images: list[bytes]) -> ShelfResult:
        if not self.settings.llm_api_key:
            raise HTTPException(status_code=503, detail="Shelf photo AI is not configured")
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self.settings.llm_api_key)
        parts = [types.Part.from_bytes(data=b, mime_type="image/jpeg") for b in images]
        cfg = types.GenerateContentConfig(
            response_mime_type="application/json", response_schema=ShelfResult, temperature=0.1
        )
        try:
            resp = client.models.generate_content(
                model=self.settings.llm_model, contents=[*parts, PROMPT], config=cfg
            )
            return ShelfResult.model_validate_json(resp.text)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail="Shelf photo AI request failed") from e
