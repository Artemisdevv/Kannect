"""Authentication: demo OTP, and real phone verification through phone.email (behind a flag)."""

import json
import re
import urllib.error
import urllib.request
from collections import OrderedDict
from collections.abc import Callable
from typing import Any
from urllib.parse import urlparse

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
config_router = APIRouter(prefix="/auth", tags=["auth"])


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


def _is_demo_phone(phone: str, settings: Settings) -> bool:
    return bool(settings.demo_phone_prefix) and phone.startswith(settings.demo_phone_prefix)


def _start_session(db: Session, settings: Settings, phone: str, role: AuthRole) -> dict[str, Any]:
    """Shared by every way of proving a phone number: one identity per phone, one role per phone."""
    identity = db.get(OwnerIdentity, phone)
    shop = db.scalar(select(Shop).where(Shop.phone == phone))
    supplier = db.scalar(select(Supplier).where(Supplier.phone == phone))
    if (
        (identity is not None and identity.role != role)
        or (role == "supplier" and shop is not None)
        or (role == "retailer" and supplier is not None)
    ):
        raise HTTPException(status_code=401, detail="Phone is registered for another role")

    if identity is None:
        db.add(OwnerIdentity(phone=phone, role=role))
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            identity = db.get(OwnerIdentity, phone)
            if identity is None or identity.role != role:
                raise HTTPException(
                    status_code=401, detail="Phone is registered for another role"
                ) from exc
    return {
        "token": create_access_token(phone, settings, role=role),
        "role": role,
        "shop": _shop_response(shop) if role == "retailer" and shop else None,
        "supplier": _supplier_response(supplier) if role == "supplier" and supplier else None,
    }


@router.post("/verify", response_model=OTPVerifyResponse)
def verify_otp(
    request: OTPVerifyRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    if settings.otp_provider != "demo" and not _is_demo_phone(request.phone, settings):
        # Real numbers must be verified with the provider, never with the shared demo code.
        raise HTTPException(status_code=401, detail="Verify this number with phone.email")
    if request.otp != settings.demo_otp:
        raise HTTPException(status_code=401, detail="Invalid phone or OTP")
    return _start_session(db, settings, request.phone, request.role)


# ---------- phone.email ----------

_PATH = re.compile(r"^/[A-Za-z0-9_\-]{6,128}\.json$")
_used: OrderedDict[str, None] = OrderedDict()  # results already turned into a login (per instance)
_USED_MAX = 5000


class PhoneEmailVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_json_url: str
    role: AuthRole = "retailer"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # a redirect could point us at an internal host
        return None


def fetch_phone_email_user(url: str) -> dict[str, Any]:
    opener = urllib.request.build_opener(_NoRedirect)
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with opener.open(request, timeout=8) as response:
            return json.loads(response.read(16_384))
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise HTTPException(
            status_code=401, detail="Could not confirm the phone verification"
        ) from exc


def get_phone_email_fetcher() -> Callable[[str], dict[str, Any]]:
    return fetch_phone_email_user


def check_result_url(url: str, settings: Settings) -> str:
    """Only ever fetch an https result URL on an allowed host (the client sent it: untrusted)."""
    parsed = urlparse(url.strip())
    hosts = {h.strip().lower() for h in settings.phone_email_hosts.split(",") if h.strip()}
    if (
        parsed.scheme != "https"
        or (parsed.hostname or "").lower() not in hosts
        or parsed.port not in (None, 443)
        or parsed.username
        or parsed.password
        or parsed.query
        or not _PATH.match(parsed.path)
    ):
        raise HTTPException(status_code=400, detail="Not a valid phone verification result")
    return f"https://{parsed.hostname}{parsed.path}"


def phone_from_result(data: dict[str, Any]) -> str:
    code = str(data.get("user_country_code", "")).strip().lstrip("+")
    number = re.sub(r"\D", "", str(data.get("user_phone_number", "")))
    phone = f"+{code}{number}"
    if not code.isdigit() or not number or not is_e164_phone(phone):
        raise HTTPException(status_code=401, detail="Could not confirm the phone verification")
    return phone


@config_router.get("/config")
def auth_config(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    """Tells the app which login to show. Nothing secret here."""
    real = settings.otp_provider == "phone_email"
    return {
        "otp_provider": settings.otp_provider,
        "phone_email_client_id": settings.phone_email_client_id if real else None,
    }


@config_router.post("/phone-email/verify", response_model=OTPVerifyResponse)
def phone_email_verify(
    request: PhoneEmailVerifyRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    fetch: Callable[[str], dict[str, Any]] = Depends(get_phone_email_fetcher),
) -> dict[str, Any]:
    """Log in with a number phone.email has verified. The app sends the result URL it received."""
    if settings.otp_provider != "phone_email":
        raise HTTPException(status_code=400, detail="Phone verification is not enabled")
    url = check_result_url(request.user_json_url, settings)
    if url in _used:
        raise HTTPException(status_code=401, detail="This verification was already used")
    phone = phone_from_result(fetch(url))
    _used[url] = None
    while len(_used) > _USED_MAX:
        _used.popitem(last=False)
    return _start_session(db, settings, phone, request.role)
