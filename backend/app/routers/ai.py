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
from app.services.invoice_vision import (
    GeminiInvoiceVision,
    InvoiceVision,
    cost_per_unit,
    to_base_units,
    totals_check,
)
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


def get_invoice_vision(settings: Settings = Depends(get_settings)) -> InvoiceVision:
    return GeminiInvoiceVision(settings)


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


@router.post("/invoice")
def invoice_photo(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    vision: InvoiceVision = Depends(get_invoice_vision),
    _: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    """Supplier invoice photo -> suggested restock lines. The owner confirms each line, then the
    app calls POST /shop/stock-events (type=restock). Nothing is saved here."""
    data = image.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image must be under 10 MB")
    try:
        prepared = prepare_image(data)
    except ValueError:
        raise HTTPException(status_code=400, detail="File must be an image") from None

    quality = image_quality(prepared)
    result = vision.analyze(prepared)

    products = list(db.scalars(select(Product).where(Product.is_active.is_(True))).all())
    index = CatalogueIndex(products)

    suggestions: list[dict[str, Any]] = []
    for line in result.lines:
        if not line.description.strip() or line.quantity <= 0:
            continue
        brand, name = line.brand.strip(), line.name.strip() or line.description.strip()
        best, alternatives, needs_scan = (
            classify(index.match(brand, name, line.size)) if line.readable else (None, [], True)
        )
        # With no confident match, the top alternative's unit is the best guess (a bag of rice is
        # weighed, not counted). The app recomputes from `billed` if the owner picks another one.
        guess = best or (alternatives[0] if alternatives else None)
        unit = guess.product.unit if guess else None
        base_qty, note = to_base_units(line, unit)
        suggestions.append(
            {
                "raw_text": line.description,
                "product": _product_response(best.product) if best else None,
                "alternatives": [_product_response(a.product) for a in alternatives],
                "quantity": base_qty,
                "unit": unit or "piece",
                "cost_price": cost_per_unit(line, base_qty, unit),
                "billed": {
                    "quantity": line.quantity,
                    "unit": line.quantity_unit,
                    "units_per_pack": line.units_per_pack,
                    "pack_weight_g": line.pack_weight_g,
                    "unit_price": line.unit_price,
                    "line_total": line.line_total,
                },
                "confidence": max(0.0, min(1.0, line.confidence)),
                "needs_scan": needs_scan,
                "needs_check": note is not None or not line.readable or line.confidence < 0.6,
                "note": ("Could not read this line clearly" if not line.readable else note),
            }
        )
    return {
        "suggestions": suggestions,
        "invoice": {
            "supplier_name": result.supplier_name or None,
            "number": result.invoice_number or None,
            "date": result.date or None,
            **totals_check(result),
        },
        "image_quality": quality,
    }
