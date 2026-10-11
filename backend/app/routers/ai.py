"""AI suggestion endpoints. They only suggest; the owner confirms before anything is saved."""

from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedOwner, require_retailer
from app.config import Settings, get_settings
from app.db import get_db
from app.models import Product
from app.routers.catalogue import _product_response
from app.services.catalogue_match import CatalogueIndex, classify, norm
from app.services.shelf_vision import (
    Detection,
    GeminiShelfVision,
    ShelfVision,
    image_quality,
    prepare_image,
    suggested_level,
    worst_quality,
)

router = APIRouter(prefix="/shop/ai", tags=["ai"])

MAX_IMAGES = 6
MAX_BYTES = 10 * 1024 * 1024


def get_shelf_vision(settings: Settings = Depends(get_settings)) -> ShelfVision:
    return GeminiShelfVision(settings)


def _merge_duplicates(detections: list[Detection]) -> list[Detection]:
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


@router.post("/shelf-photo")
def shelf_photo(
    images: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    vision: ShelfVision = Depends(get_shelf_vision),
    _: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    if not 1 <= len(images) <= MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"Send 1 to {MAX_IMAGES} images")

    prepared: list[bytes] = []
    for upload in images:
        data = upload.file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(status_code=400, detail="Each image must be under 10 MB")
        try:
            prepared.append(prepare_image(data))
        except ValueError:
            raise HTTPException(status_code=400, detail="Files must be images") from None

    quality = worst_quality([image_quality(p) for p in prepared])
    result = vision.analyze(prepared)

    products = list(db.scalars(select(Product).where(Product.is_active.is_(True))).all())
    index = CatalogueIndex(products)

    detections: list[dict[str, Any]] = []
    for det in _merge_duplicates(result.detections):
        label = " ".join(p for p in (det.brand, det.name, det.size) if p).strip()
        base = {
            "label": label,
            "visible_count": max(1, det.visible_count),
            "suggested_level": suggested_level(det.visible_count),
            "confidence": max(0.0, min(1.0, det.confidence)),
        }
        if det.loose:
            # Loose goods have no barcode: the app maps them to a picture tile
            detections.append({**base, "match": None, "alternatives": [], "needs_scan": False})
            continue
        if not det.readable:
            detections.append({**base, "match": None, "alternatives": [], "needs_scan": True})
            continue
        best, alternatives, needs_scan = classify(index.match(det.brand, det.name, det.size))
        detections.append(
            {
                **base,
                "match": _product_response(best.product) if best else None,
                "alternatives": [_product_response(a.product) for a in alternatives],
                "needs_scan": needs_scan,
            }
        )

    return {"detections": detections, "image_quality": quality}
