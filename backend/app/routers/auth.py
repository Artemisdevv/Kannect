"""Demo OTP authentication endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import AuthRole, create_access_token, is_e164_phone
from app.config import Settings, get_settings
from app.db import get_db
from app.models import OwnerIdentity, Shop, Supplier

router = APIRouter(prefix="/auth/otp", tags=["auth"])


class OTPRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        if not is_e164_phone(value):
            raise ValueError("Phone must be in E.164 format")
        return value


class OTPVerifyRequest(OTPRequest):
    otp: str
    role: AuthRole = "retailer"


class LocationResponse(BaseModel):
    lat: float
    lng: float


class ShopResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    owner_name: str | None = None
    phone: str | None = None
    address: str | None = None
    location: LocationResponse | None = None
    language: str | None = None
    shop_type: str | None = None


class SupplierResponse(BaseModel):
    id: str
    name: str | None = None
    contact_name: str | None = None
    phone: str | None = None
    address: str | None = None
    location: LocationResponse | None = None
    delivery_radius_m: int | None = None
    gstin: str | None = None


class OTPVerifyResponse(BaseModel):
    token: str
    role: AuthRole
    shop: ShopResponse | None
    supplier: SupplierResponse | None


def _shop_response(shop: Shop) -> dict[str, Any]:
    location = None
    if shop.location is not None:
        from geoalchemy2.shape import to_shape

        point = to_shape(shop.location)
        location = {"lat": point.y, "lng": point.x}
    return {
        "id": str(shop.id),
        "name": shop.name,
        "owner_name": shop.owner_name,
        "phone": shop.phone,
        "address": shop.address,
        "location": location,
        "language": shop.language,
        "shop_type": shop.shop_type,
    }


def _supplier_response(supplier: Supplier) -> dict[str, Any]:
    location = None
    if supplier.location is not None:
        from geoalchemy2.shape import to_shape

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


@router.post("/request", status_code=204)
def request_otp(_: OTPRequest) -> None:
    """Demo SMS stub; the configured demo OTP is accepted by verification."""


@router.post("/verify", response_model=OTPVerifyResponse)
def verify_otp(
    request: OTPVerifyRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if request.otp != settings.demo_otp:
        raise HTTPException(status_code=401, detail="Invalid phone or OTP")

    identity = db.get(OwnerIdentity, request.phone)
    shop = db.scalar(select(Shop).where(Shop.phone == request.phone))
    supplier = db.scalar(select(Supplier).where(Supplier.phone == request.phone))
    if (
        (identity is not None and identity.role != request.role)
        or (request.role == "supplier" and shop is not None)
        or (request.role == "retailer" and supplier is not None)
    ):
        raise HTTPException(status_code=401, detail="Phone is registered for another role")

    if identity is None:
        db.add(OwnerIdentity(phone=request.phone, role=request.role))
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            identity = db.get(OwnerIdentity, request.phone)
            if identity is None or identity.role != request.role:
                raise HTTPException(
                    status_code=401, detail="Phone is registered for another role"
                ) from exc
    return {
        "token": create_access_token(request.phone, settings, role=request.role),
        "role": request.role,
        "shop": _shop_response(shop) if request.role == "retailer" and shop else None,
        "supplier": (
            _supplier_response(supplier) if request.role == "supplier" and supplier else None
        ),
    }
