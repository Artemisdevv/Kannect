"""Shared product catalogue endpoints."""

from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthenticatedOwner, get_current_owner
from app.db import get_db
from app.models import Product

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


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
    _: AuthenticatedOwner = Depends(get_current_owner),
) -> dict[str, Any]:
    product = db.scalar(select(Product).where(Product.barcode == barcode))
    canonical = _active_canonical_product(db, product) if product is not None else None
    if canonical is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return _product_response(canonical)


@router.get("/products", response_model=ProductListResponse)
def list_products(
    q: str = Query(...),
    db: Session = Depends(get_db),
    _: AuthenticatedOwner = Depends(get_current_owner),
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


@router.post("/products", status_code=201, response_model=ProductResponse)
def create_product(
    request: ProductInput,
    db: Session = Depends(get_db),
    _: AuthenticatedOwner = Depends(get_current_owner),
) -> dict[str, Any]:
    if request.barcode is not None:
        existing = db.scalar(select(Product.id).where(Product.barcode == request.barcode))
        if existing is not None:
            raise HTTPException(status_code=409, detail="Barcode already exists")

    product = Product(**request.model_dump())
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
