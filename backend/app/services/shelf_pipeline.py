"""Shelf-photo pipeline pieces: dedupe, zoomed tiles, tile merge, loose-goods matching.

Why tiles: reading a whole shelf at once leaves many labels too small to read (a test on three
photos raised the share of readable items from 40/55/33% to 80/76/57%). Tiles are used to
IDENTIFY items. Counts still come from the whole-photo read, because items in overlapping tiles
would be counted twice (we have no boxes to de-duplicate them).
"""

import io

from PIL import Image
from rapidfuzz import fuzz

from app.models import Product
from app.services.catalogue_match import norm
from app.services.shelf_vision import Detection, prepare_image

PRODUCE_CATEGORIES = {"fresh_produce", "loose_goods"}
LOOSE_MATCH = 85  # name similarity needed to map a loose item to one of our loose tiles
OVERLAP = 0.12
ZOOM = 2


def merge_duplicates(detections: list[Detection]) -> list[Detection]:
    """Drop unnamed items and merge repeats of one product (models split rows of packs)."""
    merged: dict[str, Detection] = {}
    for det in detections:
        key = norm(f"{det.brand} {det.name} {det.size}")
        if not key:
            continue
        if key in merged:
            first = merged[key]
            first.visible_count += max(1, det.visible_count)
            first.confidence = max(first.confidence, det.confidence)
            first.readable = first.readable or det.readable
        else:
            merged[key] = det.model_copy(update={"visible_count": max(1, det.visible_count)})
    return list(merged.values())


def make_tiles(data: bytes) -> list[bytes]:
    """Four overlapping quarters, each upscaled so small print is readable."""
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    ox, oy = int(w * OVERLAP), int(h * OVERLAP)
    boxes = [
        (0, 0, w // 2 + ox, h // 2 + oy),
        (w // 2 - ox, 0, w, h // 2 + oy),
        (0, h // 2 - oy, w // 2 + ox, h),
        (w // 2 - ox, h // 2 - oy, w, h),
    ]
    tiles = []
    for box in boxes:
        part = img.crop(box)
        buf = io.BytesIO()
        part.resize((part.width * ZOOM, part.height * ZOOM)).save(buf, "JPEG", quality=90)
        tiles.append(prepare_image(buf.getvalue()))
    return tiles


def _same_item(a: Detection, b: Detection) -> bool:
    ba, bb = norm(a.brand), norm(b.brand)
    na, nb = norm(a.name), norm(b.name)
    if ba and bb and ba == bb:
        # same brand: same item unless both name a clearly different product
        return not na or not nb or fuzz.token_set_ratio(na, nb) >= 60
    return bool(na) and na == nb and not (ba and bb)


def merge_with_tiles(whole: list[Detection], tiles: list[list[Detection]]) -> list[Detection]:
    """Identification from the tiles, counts and loose/generic items from the whole read."""
    whole_m = merge_duplicates(whole)
    from_tiles: dict[str, Detection] = {}
    for tile in tiles:
        for det in merge_duplicates(tile):
            if not det.readable:
                continue
            key = norm(f"{det.brand} {det.name} {det.size}")
            prev = from_tiles.get(key)
            if prev is None:
                from_tiles[key] = det
            else:  # same product in two tiles: larger count, a lower bound without double counting
                prev.visible_count = max(prev.visible_count, det.visible_count)
                prev.confidence = max(prev.confidence, det.confidence)

    out: list[Detection] = []
    for t in from_tiles.values():
        w = next((x for x in whole_m if _same_item(t, x)), None)
        count = max(t.visible_count, w.visible_count if w else 0)
        loose = t.loose or bool(w and w.loose)
        out.append(t.model_copy(update={"visible_count": count, "loose": loose}))
    out.extend(w for w in whole_m if not any(_same_item(w, t) for t in from_tiles.values()))
    return merge_duplicates(out)


# ---------- loose goods ----------


def _singular(word: str) -> str:
    if word.endswith("oes"):
        return word[:-2]  # tomatoes -> tomato
    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        return word[:-1]
    return word


def _loose_key(text: str) -> str:
    return " ".join(_singular(w) for w in norm(text).split())


def is_loose(det: Detection) -> bool:
    """Unlabelled goods sold by weight or count: produce, eggs, sacks of rice."""
    if det.loose or det.category in PRODUCE_CATEGORIES:
        return True
    is_egg = det.category == "dairy_eggs" and "egg" in _loose_key(det.name).split()[:3]
    return is_egg and not det.brand.strip()


def match_loose(det: Detection, loose_products: list[Product]) -> Product | None:
    """Map a loose detection to one of the shop's loose tiles (Tomato, Egg, Nendran banana...)."""
    key = _loose_key(det.name or det.brand)
    if not key:
        return None
    best, best_score = None, 0.0
    for p in loose_products:
        pk = _loose_key(p.name)
        partial = fuzz.partial_ratio(key, pk) if len(key) >= 4 else 0
        score = max(fuzz.token_set_ratio(key, pk), partial)
        if score > best_score:
            best, best_score = p, score
    return best if best_score >= LOOSE_MATCH else None
