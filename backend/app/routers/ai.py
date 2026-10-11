"""AI suggestion endpoints. They only suggest; the owner confirms before anything is saved."""

from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedOwner, require_retailer
from app.config import Settings, get_settings
from app.db import get_db
from app.models import Product, ShopProduct
from app.routers.catalogue import _product_response
from app.services.catalogue_match import CatalogueIndex, classify
from app.services.invoice_vision import (
    GeminiInvoiceVision,
    InvoiceVision,
    cost_per_unit,
    to_base_units,
    totals_check,
)
from app.services.shelf_pipeline import (
    is_loose,
    make_tiles,
    match_loose,
    merge_duplicates,
    merge_with_tiles,
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
UNSURE_MIN = 70  # an unread brand only offers catalogue options at least this close
MAX_BYTES = 10 * 1024 * 1024


def get_shelf_vision(settings: Settings = Depends(get_settings)) -> ShelfVision:
    return GeminiShelfVision(settings)


def get_invoice_vision(settings: Settings = Depends(get_settings)) -> InvoiceVision:
    return GeminiInvoiceVision(settings)


_merge_duplicates = merge_duplicates  # kept for scripts that import it from here

TILE_WORKERS = 6


@router.post("/shelf-photo")
def shelf_photo(
    images: list[UploadFile] = File(...),
    thorough: bool = Query(True, description="Also re-read zoomed tiles to identify small labels"),
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
    whole = vision.analyze(prepared).detections
    found = whole
    if thorough:
        found = merge_with_tiles(whole, _read_tiles(vision, prepared))

    products = list(db.scalars(select(Product).where(Product.is_active.is_(True))).all())
    index = CatalogueIndex([p for p in products if p.barcode])
    loose_products = [p for p in products if not p.barcode]

    detections: list[dict[str, Any]] = []
    for det in merge_duplicates(found):
        label = " ".join(p for p in (det.brand, det.name, det.size) if p).strip()
        base = {
            "label": label,
            "visible_count": max(1, det.visible_count),
            "suggested_level": suggested_level(det.visible_count),
            "confidence": max(0.0, min(1.0, det.confidence)),
            "loose": False,
            "uncertain": False,
        }
        if is_loose(det):
            # No barcode: map to one of the shop's picture tiles (Tomato, Egg, Matta rice...)
            tile = match_loose(det, loose_products)
            detections.append(
                {**base, "loose": True, "match": _product_response(tile) if tile else None,
                 "alternatives": [], "needs_scan": False}  # fmt: skip
            )
            continue
        if not det.readable and not det.brand.strip():
            # Nothing usable (e.g. "small bottles"): the owner scans it
            detections.append({**base, "match": None, "alternatives": [], "needs_scan": True})
            continue
        best, alternatives, needs_scan = classify(index.match(det.brand, det.name, det.size))
        if not det.readable:
            # The model named a brand but hedged. Keep the reading as a suggestion to confirm,
            # never an automatic match, and drop weak guesses.
            options = [m for m in ([best] if best else []) + alternatives if m.score >= UNSURE_MIN]
            detections.append(
                {**base, "uncertain": True, "match": None, "needs_scan": True,
                 "alternatives": [_product_response(m.product) for m in options]}  # fmt: skip
            )
            continue
        detections.append(
            {
                **base,
                "match": _product_response(best.product) if best else None,
                "alternatives": [_product_response(a.product) for a in alternatives],
                "needs_scan": needs_scan,
            }
        )

    _add_suggested_prices(db, detections)
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


def _add_suggested_prices(db: Session, detections: list[dict[str, Any]]) -> None:
    """Pre-fill a price so onboarding from a photo is not a typing job.

    The printed MRP when the catalogue has one, otherwise the typical price other shops charge
    (median, shown as `nearby_median`). Never invented: null when neither exists.
    """
    ids = [UUID(d["match"]["id"]) for d in detections if d.get("match")]
    medians: dict[UUID, float] = {}
    if ids:
        rows = db.execute(
            select(
                ShopProduct.product_id,
                func.percentile_cont(0.5).within_group(ShopProduct.price),
            )
            .where(ShopProduct.product_id.in_(ids))
            .group_by(ShopProduct.product_id)
        ).all()
        medians = {pid: float(m) for pid, m in rows}
    for d in detections:
        d["suggested_price"], d["price_source"] = None, None
        if not d.get("match"):
            continue
        mrp = d["match"].get("mrp")
        if mrp is not None:
            d["suggested_price"], d["price_source"] = mrp, "mrp"
        elif UUID(d["match"]["id"]) in medians:
            d["suggested_price"] = round(medians[UUID(d["match"]["id"])], 2)
            d["price_source"] = "nearby_median"


def _read_tiles(vision: ShelfVision, prepared: list[bytes]) -> list[list[Detection]]:
    """Re-read zoomed tiles of every photo in parallel. Best effort: a failed tile is skipped."""
    tiles = [t for p in prepared for t in make_tiles(p)]

    def read(tile: bytes) -> list[Detection]:
        try:
            return vision.analyze([tile]).detections
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=TILE_WORKERS) as pool:
        return list(pool.map(read, tiles))


