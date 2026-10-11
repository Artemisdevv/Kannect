"""Public shopper endpoints: nearby search, out-of-stock referral, shop page.

No auth. Never exposes exact stock counts, only in_stock / low / out. Owner-facing numbers stay on
the retailer endpoints.
"""

from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db

router = APIRouter(tags=["search"])

DEFAULT_RADIUS_M = 2000
MAX_RADIUS_M = 20000
RESULT_LIMIT = 50
REFERRAL_RADIUS_M = 5000

# Current stock per (shop, product): latest absolute correction plus later restocks and sales.
STOCK_CTE = """
stock AS (
  SELECT sp.shop_id, sp.product_id, sp.price, sp.low_threshold,
         COALESCE(c.quantity, 0) + COALESCE(SUM(
           CASE e.type WHEN 'restock' THEN e.quantity WHEN 'sale' THEN -e.quantity ELSE 0 END
         ), 0) AS qty
  FROM shop_product sp
  LEFT JOIN LATERAL (
    SELECT quantity, created_at, id FROM stock_event
    WHERE shop_id = sp.shop_id AND product_id = sp.product_id AND type = 'correction'
    ORDER BY created_at DESC, id DESC LIMIT 1
  ) c ON true
  LEFT JOIN stock_event e
    ON e.shop_id = sp.shop_id AND e.product_id = sp.product_id AND e.type <> 'correction'
   AND (c.created_at IS NULL OR (e.created_at, e.id::text) > (c.created_at, c.id::text))
  GROUP BY sp.shop_id, sp.product_id, sp.price, sp.low_threshold, c.quantity
)
"""

STATUS_SQL = """CASE WHEN st.qty <= 0 THEN 'out'
                      WHEN st.qty < st.low_threshold THEN 'low'
                      ELSE 'in_stock' END"""

COLUMNS = f"""
  s.id AS shop_id, s.name AS shop_name, s.address, s.phone,
  ST_Y(s.location) AS lat, ST_X(s.location) AS lng,
  p.id AS product_id, p.barcode, p.name, p.name_ml, p.brand, p.size, p.category, p.unit,
  p.image_url, p.mrp,
  st.price, {STATUS_SQL} AS status,
  ROUND(ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography))
    AS distance_m
"""


def _result(row: Any) -> dict[str, Any]:
    return {
        "shop": {
            "id": str(row["shop_id"]),
            "name": row["shop_name"],
            "address": row["address"],
            "phone": row["phone"],
            "location": {"lat": row["lat"], "lng": row["lng"]},
        },
        "product": _product(row),
        "price": float(row["price"]) if row["price"] is not None else None,
        "stock_status": row["status"],
        "distance_m": int(row["distance_m"]),
    }


def _product(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["product_id"]),
        "barcode": row["barcode"],
        "name": row["name"],
        "name_ml": row["name_ml"],
        "brand": row["brand"],
        "size": row["size"],
        "category": row["category"],
        "unit": row["unit"],
        "image_url": row["image_url"],
        "mrp": float(row["mrp"]) if isinstance(row["mrp"], Decimal) else row["mrp"],
    }


def _tokens(q: str) -> list[str]:
    return [t for t in q.lower().split() if t][:6]


@router.get("/search")
def search(
    q: str = Query(..., min_length=1, max_length=80),
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(DEFAULT_RADIUS_M, ge=100, le=MAX_RADIUS_M),
    include_out: bool = False,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Nearby shops that stock an item, nearest first."""
    tokens = _tokens(q)
    if not tokens:
        raise HTTPException(status_code=400, detail="q must contain a word")
    params: dict[str, Any] = {"lat": lat, "lng": lng, "radius": radius_m, "limit": RESULT_LIMIT}
    # every word must appear in the name, brand, Malayalam name or category
    word_filters = []
    for i, token in enumerate(tokens):
        params[f"t{i}"] = f"%{token}%"
        word_filters.append(
            f"(p.name ILIKE :t{i} OR p.brand ILIKE :t{i} OR p.name_ml ILIKE :t{i} "
            f"OR p.category ILIKE :t{i})"
        )
    status_filter = "" if include_out else "AND st.qty > 0"
    sql = f"""
    WITH {STOCK_CTE}
    SELECT {COLUMNS}
    FROM stock st
    JOIN shop s ON s.id = st.shop_id
    JOIN product p ON p.id = st.product_id
    WHERE p.is_active AND s.location IS NOT NULL {status_filter}
      AND {" AND ".join(word_filters)}
      AND ST_DWithin(s.location::geography,
                     ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)
    ORDER BY distance_m, p.name
    LIMIT :limit
    """
    rows = db.execute(text(sql), params).mappings().all()
    return {"results": [_result(r) for r in rows]}


@router.get("/search/referral")
def referral(
    shop_id: UUID,
    product_id: UUID,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Nearest other shop that has the product, to use when the chosen shop is out."""
    origin = db.execute(
        text("SELECT ST_Y(location) AS lat, ST_X(location) AS lng FROM shop "
             "WHERE id = :id AND location IS NOT NULL"),
        {"id": shop_id},
    ).mappings().first()  # fmt: skip
    if origin is None:
        raise HTTPException(status_code=404, detail="Shop not found")
    sql = f"""
    WITH {STOCK_CTE}
    SELECT {COLUMNS}
    FROM stock st
    JOIN shop s ON s.id = st.shop_id
    JOIN product p ON p.id = st.product_id
    WHERE st.product_id = :product_id AND st.shop_id <> :shop_id
      AND p.is_active AND s.location IS NOT NULL AND st.qty > 0
      AND ST_DWithin(s.location::geography,
                     ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)
    -- a shop that is comfortably stocked beats one that is nearly out
    ORDER BY (CASE WHEN st.qty < st.low_threshold THEN 1 ELSE 0 END), distance_m
    LIMIT 1
    """
    row = db.execute(
        text(sql),
        {"lat": origin["lat"], "lng": origin["lng"], "radius": REFERRAL_RADIUS_M,
         "product_id": product_id, "shop_id": shop_id},
    ).mappings().first()  # fmt: skip
    return {"referral": _result(row) if row else None}


@router.get("/shops/{shop_id}")
def shop_page(
    shop_id: UUID,
    q: str | None = Query(None, max_length=80),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Public shop page: details plus products with status only (never counts)."""
    shop = db.execute(
        text("SELECT id, name, address, phone, ST_Y(location) AS lat, ST_X(location) AS lng "
             "FROM shop WHERE id = :id"),
        {"id": shop_id},
    ).mappings().first()  # fmt: skip
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop not found")

    params: dict[str, Any] = {"shop_id": shop_id, "lat": shop["lat"] or 0, "lng": shop["lng"] or 0}
    word_filters = []
    for i, token in enumerate(_tokens(q or "")):
        params[f"t{i}"] = f"%{token}%"
        word_filters.append(f"(p.name ILIKE :t{i} OR p.brand ILIKE :t{i} OR p.name_ml ILIKE :t{i})")
    extra = ("AND " + " AND ".join(word_filters)) if word_filters else ""
    sql = f"""
    WITH {STOCK_CTE}
    SELECT {COLUMNS}
    FROM stock st
    JOIN shop s ON s.id = st.shop_id
    JOIN product p ON p.id = st.product_id
    WHERE st.shop_id = :shop_id AND p.is_active {extra}
    ORDER BY p.category NULLS LAST, p.name
    """
    rows = db.execute(text(sql), params).mappings().all()
    return {
        "shop": {
            "id": str(shop["id"]),
            "name": shop["name"],
            "address": shop["address"],
            "phone": shop["phone"],
            "location": {"lat": shop["lat"], "lng": shop["lng"]},
        },
        "products": [
            {
                "product": _product(r),
                "price": float(r["price"]) if r["price"] is not None else None,
                "stock_status": r["status"],
            }
            for r in rows
        ],
    }
