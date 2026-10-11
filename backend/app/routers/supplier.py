"""Supplier profile and wholesale catalogue endpoints."""

from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2 import WKTElement
from geoalchemy2.shape import to_shape
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth import AuthenticatedOwner, require_supplier
from app.db import get_db
from app.models import Product, Supplier, SupplierProduct

router = APIRouter(prefix="/supplier", tags=["supplier"])


class LocationInput(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class SupplierInput(BaseModel):
    name: str = Field(default=None)
    contact_name: str = Field(default=None)
    phone: str = Field(default=None)
    address: str = Field(default=None)
    location: LocationInput = Field(default=None)
    delivery_radius_m: int = Field(default=10000, gt=0)
    gstin: str | None = None


class SupplierPatch(BaseModel):
    name: str = Field(default=None)
    contact_name: str = Field(default=None)
    phone: str = Field(default=None)
    address: str = Field(default=None)
    location: LocationInput = Field(default=None)
    delivery_radius_m: int = Field(default=None, gt=0)
    gstin: str | None = None


class SupplierProductInput(BaseModel):
    product_id: UUID
    price: Decimal = Field(max_digits=10, decimal_places=2)
    pack_size: int = Field(gt=0)
    min_order_packs: int = Field(default=1, gt=0)
    available: bool = True


class SupplierProductPatch(BaseModel):
    price: Decimal = Field(default=None, max_digits=10, decimal_places=2)
    pack_size: int = Field(default=None, gt=0)
    min_order_packs: int = Field(default=None, gt=0)
    available: bool = Field(default=None)


def _supplier_payload(supplier: Supplier) -> dict[str, Any]:
    location = None
    if supplier.location is not None:
        point = to_shape(supplier.location)
        location = {"lat": point.y, "lng": point.x}
    return {
        "id": str(supplier.id),
        "name": supplier.name,
        "contact_name": supplier.contact_name,
        "phone": supplier.phone,
        "address": supplier.address,
        "location": location,
        "delivery_radius_m": supplier.delivery_radius_m,
        "gstin": supplier.gstin,
    }


def _product_payload(product: Product) -> dict[str, Any]:
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


def _supplier_product_payload(row: SupplierProduct) -> dict[str, Any]:
    return {
        "supplier": _supplier_payload(row.supplier),
        "product": _product_payload(row.product),
        "price": float(row.price),
        "pack_size": row.pack_size,
        "min_order_packs": row.min_order_packs,
        "available": row.available,
    }


def _location_value(location: LocationInput | None):
    if location is None:
        return None
    return WKTElement(f"POINT({location.lng} {location.lat})", srid=4326)


@router.post("", status_code=201)
def create_supplier_profile(
    request: SupplierInput,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, Any]:
    if owner.supplier is not None:
        raise HTTPException(status_code=409, detail="Supplier profile already exists")
    if request.phone is not None and request.phone != owner.phone:
        raise HTTPException(status_code=400, detail="Phone must match the authenticated owner")

    supplier = Supplier(
        **request.model_dump(exclude={"phone", "location"}),
        phone=owner.phone,
        location=_location_value(request.location),
    )
    db.add(supplier)
    try:
        db.commit()
        db.refresh(supplier)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Supplier profile already exists") from exc
    return _supplier_payload(supplier)


@router.get("")
def get_supplier_profile(
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, Any]:
    if owner.supplier is None:
        raise HTTPException(status_code=404, detail="Supplier profile not found")
    return _supplier_payload(owner.supplier)


@router.patch("")
def update_supplier_profile(
    request: SupplierPatch,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, Any]:
    supplier = owner.supplier
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier profile not found")
    values = request.model_dump(exclude_unset=True)
    if "phone" in values and values["phone"] != owner.phone:
        raise HTTPException(status_code=400, detail="Phone must match the authenticated owner")
    values.pop("phone", None)
    if "location" in values:
        values["location"] = _location_value(request.location)
    for name, value in values.items():
        setattr(supplier, name, value)
    if not values:
        return _supplier_payload(supplier)
    try:
        db.commit()
        db.refresh(supplier)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Invalid supplier profile values") from exc
    return _supplier_payload(supplier)


@router.get("/products")
def list_supplier_products(
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, list[dict[str, Any]]]:
    supplier = owner.supplier
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier profile not found")
    rows = db.scalars(
        select(SupplierProduct)
        .where(SupplierProduct.supplier_id == supplier.id)
        .options(joinedload(SupplierProduct.supplier), joinedload(SupplierProduct.product))
    ).all()
    rows.sort(key=lambda row: row.product.name.casefold())
    return {"items": [_supplier_product_payload(row) for row in rows]}


@router.post("/products", status_code=201)
def create_supplier_product(
    request: SupplierProductInput,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, Any]:
    supplier = owner.supplier
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier profile not found")
    product = db.get(Product, request.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if db.get(SupplierProduct, (supplier.id, product.id)) is not None:
        raise HTTPException(status_code=409, detail="Product is already listed by this supplier")
    row = SupplierProduct(
        supplier_id=supplier.id,
        product_id=product.id,
        price=request.price,
        pack_size=request.pack_size,
        min_order_packs=request.min_order_packs,
        available=request.available,
        supplier=supplier,
        product=product,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Product is already listed by this supplier"
        ) from exc
    return _supplier_product_payload(row)


@router.patch("/products/{product_id}")
def update_supplier_product(
    product_id: UUID,
    request: SupplierProductPatch,
    db: Session = Depends(get_db),
    owner: AuthenticatedOwner = Depends(require_supplier),
) -> dict[str, Any]:
    supplier = owner.supplier
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier profile not found")
    row = db.scalar(
        select(SupplierProduct)
        .where(
            SupplierProduct.supplier_id == supplier.id,
            SupplierProduct.product_id == product_id,
        )
        .options(joinedload(SupplierProduct.supplier), joinedload(SupplierProduct.product))
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Supplier product not found")
    values = request.model_dump(exclude_unset=True)
    if not values:
        return _supplier_product_payload(row)
    for name, value in values.items():
        setattr(row, name, value)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Invalid supplier product values") from exc
    return _supplier_product_payload(row)
