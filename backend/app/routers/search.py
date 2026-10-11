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
from app.services.stock_sql import STATUS_SQL, STOCK_CTE

router = APIRouter(tags=["search"])

DEFAULT_RADIUS_M = 2000
MAX_RADIUS_M = 20000
RESULT_LIMIT = 50
REFERRAL_RADIUS_M = 5000

COLUMNS = f"""
  s.id AS shop_id, s.name AS shop_name, s.address, s.phone,
  ST_Y(s.location) AS lat, ST_X(s.location) AS lng,
  p.id AS product_id, p.barcode, p.name, p.name_ml, p.brand, p.size, p.category, p.unit,
  p.image_url, p.mrp,
  st.price, {STATUS_SQL} AS status,
  ROUND(ST_Distance(s.location::geography,
    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography))::integer
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
        "distance_m": int(row["distance_m"]) if row["distance_m"] is not None else None,
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


def _origin_filter(
    lat: float | None, lng: float | None, area: str | None
) -> tuple[str, str, dict[str, Any]]:
    has_coordinates = lat is not None and lng is not None
    has_partial_coordinates = (lat is None) != (lng is None)
    normalized_area = area.strip() if area else ""
    if has_partial_coordinates or has_coordinates == bool(normalized_area):
        raise HTTPException(
            status_code=400, detail="Provide either lat and lng, or a non-empty area"
        )
    if has_coordinates:
        return (
            "ST_DWithin(s.location::geography, "
            "ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)",
            "ROUND(ST_Distance(s.location::geography, "
            "ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography))::integer",
            {"lat": lat, "lng": lng},
        )
    return (
        "POSITION(LOWER(:area) IN LOWER(COALESCE(s.address, ''))) > 0",
        "NULL::integer",
        {"area": normalized_area},
    )


@router.get("/search")
def search(
    q: str = Query(..., min_length=1, max_length=80),
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    area: str | None = Query(None, min_length=1, max_length=100),
    radius_m: int = Query(DEFAULT_RADIUS_M, ge=100, le=MAX_RADIUS_M),
    include_out: bool = False,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Nearby shops that stock an item, nearest first."""
    tokens = _tokens(q)
    if not tokens:
        raise HTTPException(status_code=400, detail="q must contain a word")
    origin_filter, distance_expression, params = _origin_filter(lat, lng, area)
    params |= {"lat": lat, "lng": lng, "radius": radius_m, "limit": RESULT_LIMIT}
    # every word must appear in the name, brand, Malayalam name or category
    word_filters = []
    for i, token in enumerate(tokens):
        params[f"t{i}"] = f"%{token}%"
        word_filters.append(
            f"(p.name ILIKE :t{i} OR p.brand ILIKE :t{i} OR p.name_ml ILIKE :t{i} "
            f"OR p.category ILIKE :t{i})"
        )
    status_filter = "" if include_out else "AND st.qty > 0"
    columns = COLUMNS.replace(
        "ROUND(ST_Distance(s.location::geography, "
        "ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography))::integer\n    AS distance_m",
        f"{distance_expression}\n    AS distance_m",
    )
    sql = f"""
    WITH {STOCK_CTE}
    SELECT {columns}
    FROM stock st
    JOIN shop s ON s.id = st.shop_id
    JOIN product p ON p.id = st.product_id
    WHERE p.is_active AND s.location IS NOT NULL {status_filter}
      AND {" AND ".join(word_filters)}
      AND {origin_filter}
    ORDER BY distance_m, p.name
    LIMIT :limit
    """
    rows = db.execute(text(sql), params).mappings().all()
    return {"results": [_result(r) for r in rows]}


@router.get("/shops/nearby")
def nearby_shops(
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    area: str | None = Query(None, min_length=1, max_length=100),
    radius_m: int = Query(DEFAULT_RADIUS_M, ge=100, le=MAX_RADIUS_M),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Discover shops by coordinates or literal matching against their saved address."""
    origin_filter, distance_expression, params = _origin_filter(lat, lng, area)
    params |= {"radius": radius_m, "limit": RESULT_LIMIT}
    sql = f"""
    SELECT s.id, s.name, s.address, s.phone, ST_Y(s.location) AS lat, ST_X(s.location) AS lng,
      {distance_expression} AS distance_m
    FROM shop s
    WHERE s.location IS NOT NULL
      AND EXISTS (SELECT 1 FROM shop_product sp WHERE sp.shop_id = s.id)
      AND {origin_filter}
    ORDER BY distance_m NULLS LAST, s.name
    LIMIT :limit
    """
    rows = db.execute(text(sql), params).mappings().all()
    return {
        "shops": [
            {
                "shop": {
                    "id": str(r["id"]),
                    "name": r["name"],
                    "address": r["address"],
                    "phone": r["phone"],
                    "location": {"lat": r["lat"], "lng": r["lng"]},
                },
                "distance_m": r["distance_m"],
            }
            for r in rows
        ]
    }


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
