"""Demo OTP authentication endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import create_access_token, is_e164_phone
from app.config import Settings, get_settings
from app.db import get_db
from app.models import Shop

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


class OTPVerifyResponse(BaseModel):
    token: str
    shop: ShopResponse | None


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

    shop = db.scalar(select(Shop).where(Shop.phone == request.phone))
    return {
        "token": create_access_token(request.phone, settings),
        "shop": _shop_response(shop) if shop is not None else None,
    }
