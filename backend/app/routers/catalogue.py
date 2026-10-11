"""Shared product catalogue endpoints."""

from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthenticatedOwner, require_owner, require_retailer
from app.db import get_db
from app.models import Product, StarterPackItem
from app.services.catalogue_match import STRONG, CatalogueIndex, norm

router = APIRouter(prefix="/catalogue", tags=["catalogue"])
ShopType = Literal["grocery", "provision", "vegetable", "stationery", "bakery", "general"]


class ProductInput(BaseModel):
    barcode: str | None = None
    name: str
    name_ml: str | None = None
    brand: str | None = None
    size: str | None = None
    category: str | None = None
    unit: Literal["piece", "gram"]
    image_url: str | None = None
    mrp: Decimal | None = None


class ProductCreate(ProductInput):
    """Create input. `allow_similar` confirms a new product even if a near duplicate exists."""

    allow_similar: bool = False

    @field_validator("barcode", mode="before")
    @classmethod
    def clean_barcode(cls, value):
        if value is None:
            return None
        value = str(value).strip()
        if not value:
            return None
        if not (value.isdigit() and 6 <= len(value) <= 14):
            raise ValueError("barcode must be 6 to 14 digits")
        return value

    @field_validator("name", "brand", "size", mode="before")
    @classmethod
    def clean_text(cls, value):
        return " ".join(value.split()) if isinstance(value, str) else value


class ProductResponse(ProductInput):
    id: str
    mrp: float | None = None


class ProductListResponse(BaseModel):
    items: list[ProductResponse]


def _product_response(product: Product) -> dict[str, Any]:
    return {
        "id": str(product.id),
        "barcode": product.barcode,
        "name": product.name,
        "name_ml": product.name_ml,
        "brand": product.brand,
        "size": product.size,
        "category": product.category,
        "unit": product.unit,
        "image_url": product.image_url,
        "mrp": float(product.mrp) if product.mrp is not None else None,
    }


def _active_canonical_product(db: Session, product: Product) -> Product | None:
    visited: set[UUID] = set()
    current = product
    while True:
        if current.is_active:
            return current
        if current.id in visited or current.merged_into_id is None:
            return None
        visited.add(current.id)
        current = db.get(Product, current.merged_into_id)
        if current is None or current.id in visited:
            return None


@router.get("/barcode/{barcode}", response_model=ProductResponse)
def lookup_barcode(
    barcode: str,
    db: Session = Depends(get_db),
    _: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    product = db.scalar(select(Product).where(Product.barcode == barcode))
    canonical = _active_canonical_product(db, product) if product is not None else None
    if canonical is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return _product_response(canonical)


@router.get("/starter-packs", response_model=ProductListResponse)
def list_starter_pack(
    shop_type: ShopType,
    db: Session = Depends(get_db),
    _: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, list[dict[str, Any]]]:
    products = db.scalars(
        select(Product)
        .join(StarterPackItem, StarterPackItem.product_id == Product.id)
        .where(
            StarterPackItem.shop_type == shop_type,
            Product.is_active.is_(True),
        )
        .order_by(StarterPackItem.position)
    ).all()
    return {"items": [_product_response(product) for product in products]}


@router.get("/products", response_model=ProductListResponse)
def list_products(
    q: str = Query(...),
    db: Session = Depends(get_db),
    _: AuthenticatedOwner = Depends(require_owner),
) -> dict[str, list[dict[str, Any]]]:
    pattern = f"%{q}%"
    statement = (
        select(Product)
        .where(
            Product.is_active.is_(True),
            or_(Product.name.ilike(pattern), Product.name_ml.ilike(pattern)),
        )
        .order_by(Product.name)
    )
    products = db.scalars(statement).all()
    return {"items": [_product_response(product) for product in products]}


def _similar_products(db: Session, request: ProductCreate) -> list[Product]:
    """Active products that look like the same item, so a scan does not fork the catalogue.

    Different sizes are different products (100g vs 200g have different barcodes), so a size
    mismatch rules a candidate out.
    """
    words = [w for w in norm(f"{request.brand} {request.name}").split() if len(w) > 2]
    if not words:
        return []
    statement = (
        select(Product)
        .where(
            Product.is_active.is_(True),
            or_(*(Product.name.ilike(f"%{w}%") for w in words[:3])),
        )
        .limit(400)
    )
    pool = list(db.scalars(statement).all())
    size = norm(request.size).replace(" ", "")
    if size:
        pool = [p for p in pool if not p.size or norm(p.size).replace(" ", "") == size]
    matches = CatalogueIndex(pool).match(request.brand or "", request.name, request.size or "")
    return [m.product for m in matches if m.score >= STRONG]


@router.post("/products", status_code=201, response_model=ProductResponse)
def create_product(
    request: ProductCreate,
    db: Session = Depends(get_db),
    _: AuthenticatedOwner = Depends(require_retailer),
) -> dict[str, Any]:
    if request.barcode is not None:
        existing = db.scalar(select(Product.id).where(Product.barcode == request.barcode))
        if existing is not None:
            raise HTTPException(status_code=409, detail="Barcode already exists")

    if not request.allow_similar:
        similar = _similar_products(db, request)
        if similar:
            return JSONResponse(
                status_code=409,
                content={
                    "error": {
                        "code": "similar_product",
                        "message": "A similar product exists. Use it, or resend with "
                        "allow_similar=true to add this as a new product.",
                        "candidates": [_product_response(p) for p in similar],
                    }
                },
            )

    product = Product(**request.model_dump(exclude={"allow_similar"}))
    db.add(product)
    try:
        db.commit()
        db.refresh(product)
    except IntegrityError as exc:
        db.rollback()
        if request.barcode is not None:
            raise HTTPException(status_code=409, detail="Barcode already exists") from exc
        raise
    return _product_response(product)
