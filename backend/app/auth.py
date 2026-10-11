"""JWT access-token helpers and request-scoped owner resolution."""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import OwnerIdentity, Shop, Supplier

JWT_ISSUER = "kadanet"
TOKEN_TYPE = "access"
AuthRole = Literal["retailer", "supplier"]
AUTH_ROLES = {"retailer", "supplier"}
_E164_PATTERN = re.compile(r"^\+[1-9][0-9]{1,14}$")
_BEARER = HTTPBearer(auto_error=False)


class InvalidAccessToken(ValueError):
    """Raised when an access token is malformed or fails validation."""


@dataclass(frozen=True)
class AuthenticatedOwner:
    phone: str
    role: AuthRole
    shop: Shop | None
    supplier: Supplier | None


def is_e164_phone(phone: str) -> bool:
    return bool(_E164_PATTERN.fullmatch(phone))


def create_access_token(
    phone: str, settings: Settings | None = None, *, role: AuthRole = "retailer"
) -> str:
    if not is_e164_phone(phone):
        raise ValueError("Owner phone must be in E.164 format")
    if role not in AUTH_ROLES:
        raise ValueError("Role must be retailer or supplier")

    settings = settings or get_settings()
    now = datetime.now(timezone.utc)
    claims = {
        "sub": phone,
        "role": role,
        "iss": JWT_ISSUER,
        "typ": TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expire_minutes)).timestamp()),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


def verify_access_token(token: str, settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=JWT_ISSUER,
            options={"require": ["sub", "role", "iss", "typ", "iat", "exp"]},
        )
    except jwt.InvalidTokenError as exc:
        raise InvalidAccessToken("Invalid or expired bearer token") from exc

    role = claims.get("role")
    if (
        claims.get("typ") != TOKEN_TYPE
        or not isinstance(claims.get("sub"), str)
        or not isinstance(role, str)
        or role not in AUTH_ROLES
    ):
        raise InvalidAccessToken("Invalid or expired bearer token")
    if not is_e164_phone(claims["sub"]):
        raise InvalidAccessToken("Invalid or expired bearer token")
    return claims


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid or missing bearer token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_owner(
    credentials: HTTPAuthorizationCredentials | None = Depends(_BEARER),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedOwner:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    try:
        claims = verify_access_token(credentials.credentials, settings)
    except InvalidAccessToken as exc:
        raise _unauthorized() from exc

    phone = claims["sub"]
    role: AuthRole = claims["role"]
    identity = db.get(OwnerIdentity, phone)
    if identity is None or identity.role != role:
        raise _unauthorized()
    shop = db.scalar(select(Shop).where(Shop.phone == phone))
    supplier = db.scalar(select(Supplier).where(Supplier.phone == phone))
    if (role == "supplier" and shop is not None) or (role == "retailer" and supplier is not None):
        raise HTTPException(
            status_code=401,
            detail="Phone is registered for another role",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthenticatedOwner(
        phone=phone,
        role=role,
        shop=shop if role == "retailer" else None,
        supplier=supplier if role == "supplier" else None,
    )


def require_role(expected_role: AuthRole):
    def role_dependency(
        owner: AuthenticatedOwner = Depends(get_current_owner),
    ) -> AuthenticatedOwner:
        if owner.role != expected_role:
            raise HTTPException(
                status_code=403,
                detail="Insufficient role",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return owner

    return role_dependency


require_retailer = require_role("retailer")
require_supplier = require_role("supplier")


def require_owner(owner: AuthenticatedOwner = Depends(get_current_owner)) -> AuthenticatedOwner:
    """Any signed-in owner, retailer or supplier."""
    return owner
