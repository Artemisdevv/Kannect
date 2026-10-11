"""Supplier insight: anonymised, aggregated demand from nearby retailers.

Privacy rule from the contract: never name a shop or expose its numbers, and show a product only
when at least MIN_SHOPS different shops contribute, so one shop's stock can never be inferred.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import AuthenticatedOwner, require_supplier
from app.db import get_db
from app.services.stock_sql import STOCK_CTE

router = APIRouter(prefix="/supplier", tags=["supplier"])

MIN_SHOPS = 3
LIMIT = 50


@router.get("/demand")
def demand(
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, Any]:
    """Products that many shops in this supplier's delivery radius are low or out of."""
    supplier = owner.supplier
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if supplier.location is None:
        raise HTTPException(status_code=400, detail="Set the supplier location first")

    sql = f"""
    WITH {STOCK_CTE}
    SELECT p.id AS product_id, p.barcode, p.name, p.name_ml, p.brand, p.size, p.category,
           p.unit, p.image_url, p.mrp,
           COUNT(DISTINCT st.shop_id) FILTER (
             WHERE st.qty <= 0 OR st.qty < st.low_threshold) AS shops_low_or_out,
           COUNT(DISTINCT st.shop_id) AS shops_total,
           EXISTS (SELECT 1 FROM supplier_product x
                   WHERE x.supplier_id = :supplier_id AND x.product_id = p.id AND x.available)
             AS supplier_sells
    FROM stock st
    JOIN shop s ON s.id = st.shop_id
    JOIN product p ON p.id = st.product_id
    JOIN supplier sup ON sup.id = :supplier_id
    WHERE p.is_active AND s.location IS NOT NULL
      AND ST_DWithin(s.location::geography, sup.location::geography, sup.delivery_radius_m)
    GROUP BY p.id
    HAVING COUNT(DISTINCT st.shop_id) FILTER (
             WHERE st.qty <= 0 OR st.qty < st.low_threshold) >= :min_shops
    ORDER BY shops_low_or_out DESC, shops_total DESC, p.name
    LIMIT :limit
    """
    rows = (
        db.execute(text(sql), {"supplier_id": supplier.id, "min_shops": MIN_SHOPS, "limit": LIMIT})
        .mappings()
        .all()
    )
    return {
        "items": [
            {
                "product": {
                    "id": str(r["product_id"]),
                    "barcode": r["barcode"],
                    "name": r["name"],
                    "name_ml": r["name_ml"],
                    "brand": r["brand"],
                    "size": r["size"],
                    "category": r["category"],
                    "unit": r["unit"],
                    "image_url": r["image_url"],
                    "mrp": float(r["mrp"]) if r["mrp"] is not None else None,
                },
                "shops_low_or_out": int(r["shops_low_or_out"]),
                "shops_total": int(r["shops_total"]),
                "supplier_sells": bool(r["supplier_sells"]),
            }
            for r in rows
        ]
    }
