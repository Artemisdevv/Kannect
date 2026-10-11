"""JWT access-token helpers and request-scoped owner resolution."""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import Shop

JWT_ISSUER = "kadanet"
TOKEN_TYPE = "access"
_E164_PATTERN = re.compile(r"^\+[1-9][0-9]{1,14}$")
_BEARER = HTTPBearer(auto_error=False)


class InvalidAccessToken(ValueError):
    """Raised when an access token is malformed or fails validation."""


@dataclass(frozen=True)
class AuthenticatedOwner:
    phone: str
    shop: Shop | None


def is_e164_phone(phone: str) -> bool:
    return bool(_E164_PATTERN.fullmatch(phone))


def create_access_token(phone: str, settings: Settings | None = None) -> str:
    if not is_e164_phone(phone):
        raise ValueError("Owner phone must be in E.164 format")

    settings = settings or get_settings()
    now = datetime.now(timezone.utc)
    claims = {
        "sub": phone,
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
            options={"require": ["sub", "iss", "typ", "iat", "exp"]},
        )
    except jwt.InvalidTokenError as exc:
        raise InvalidAccessToken("Invalid or expired bearer token") from exc

    if claims.get("typ") != TOKEN_TYPE or not isinstance(claims.get("sub"), str):
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
    shop = db.scalar(select(Shop).where(Shop.phone == phone))
    return AuthenticatedOwner(phone=phone, shop=shop)
