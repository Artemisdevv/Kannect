import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth import (
    AuthenticatedOwner,
    InvalidAccessToken,
    create_access_token,
    get_current_owner,
    verify_access_token,
)
from app.config import DEFAULT_JWT_SECRET, Settings, get_settings, validate_runtime_settings
from app.db import get_db
from app.errors import install
from app.models import Shop

TEST_SETTINGS = Settings(app_env="test", jwt_secret="test-secret", jwt_expire_minutes=60)


def _claims(**overrides):
    now = datetime.now(timezone.utc)
    claims = {
        "sub": "+919876543210",
        "iss": "kadanet",
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    claims.update(overrides)
    return claims


def test_create_and_verify_access_token():
    token = create_access_token("+919876543210", TEST_SETTINGS)
    claims = verify_access_token(token, TEST_SETTINGS)

    assert claims["sub"] == "+919876543210"
    assert claims["iss"] == "kadanet"
    assert claims["typ"] == "access"
    assert claims["exp"] - claims["iat"] == 60 * 60
    assert "shop_id" not in claims


def test_token_creation_requires_e164_phone():
    for phone in ("919876543210", "+0123", "+1234567890123456", "+1 234"):
        with pytest.raises(ValueError):
            create_access_token(phone, TEST_SETTINGS)


def test_expired_token_is_rejected():
    expired = int((datetime.now(timezone.utc) - timedelta(minutes=1)).timestamp())
    token = jwt.encode(
        _claims(iat=expired - 300, exp=expired), TEST_SETTINGS.jwt_secret, algorithm="HS256"
    )
    with pytest.raises(InvalidAccessToken):
        verify_access_token(token, TEST_SETTINGS)


def test_invalid_signature_is_rejected():
    token = jwt.encode(_claims(), "another-secret", algorithm="HS256")
    with pytest.raises(InvalidAccessToken):
        verify_access_token(token, TEST_SETTINGS)


def test_wrong_issuer_is_rejected():
    token = jwt.encode(_claims(iss="other"), TEST_SETTINGS.jwt_secret, algorithm="HS256")
    with pytest.raises(InvalidAccessToken):
        verify_access_token(token, TEST_SETTINGS)


def test_wrong_token_type_is_rejected():
    token = jwt.encode(_claims(typ="refresh"), TEST_SETTINGS.jwt_secret, algorithm="HS256")
    with pytest.raises(InvalidAccessToken):
        verify_access_token(token, TEST_SETTINGS)


def test_non_e164_subject_is_rejected():
    token = jwt.encode(_claims(sub="919876543210"), TEST_SETTINGS.jwt_secret, algorithm="HS256")
    with pytest.raises(InvalidAccessToken):
        verify_access_token(token, TEST_SETTINGS)


def test_unsigned_token_is_rejected():
    token = jwt.encode(_claims(), key="", algorithm="none")
    with pytest.raises(InvalidAccessToken):
        verify_access_token(token, TEST_SETTINGS)


class FakeSession:
    def __init__(self, shop):
        self.shop = shop
        self.queries = []

    def scalar(self, statement):
        self.queries.append(statement)
        return self.shop


def _auth_test_app(fake_session):
    app = FastAPI()
    install(app)

    def override_db():
        yield fake_session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS

    @app.get("/private")
    def private(owner: AuthenticatedOwner = Depends(get_current_owner)):
        return {"phone": owner.phone, "shop_id": str(owner.shop.id) if owner.shop else None}

    return app


def test_missing_bearer_credentials_use_contract_error():
    client = TestClient(_auth_test_app(FakeSession(None)))
    response = client.get("/private")
    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "unauthorized", "message": "Invalid or missing bearer token"}
    }
    assert response.headers["www-authenticate"] == "Bearer"


def test_owner_dependency_resolves_shop_by_phone():
    shop = Shop(id=uuid.uuid4(), phone="+919876543210")
    session = FakeSession(shop)
    client = TestClient(_auth_test_app(session))
    response = client.get(
        "/private",
        headers={"Authorization": f"Bearer {create_access_token(shop.phone, TEST_SETTINGS)}"},
    )
    assert response.status_code == 200
    assert response.json() == {"phone": shop.phone, "shop_id": str(shop.id)}
    assert len(session.queries) == 1


def test_new_owner_token_resolves_without_shop():
    session = FakeSession(None)
    client = TestClient(_auth_test_app(session))
    response = client.get(
        "/private",
        headers={"Authorization": f"Bearer {create_access_token('+919876543210', TEST_SETTINGS)}"},
    )
    assert response.status_code == 200
    assert response.json() == {"phone": "+919876543210", "shop_id": None}
    assert len(session.queries) == 1


def test_invalid_bearer_token_uses_contract_error():
    client = TestClient(_auth_test_app(FakeSession(None)))
    response = client.get("/private", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_default_secret_is_allowed_only_for_local_development():
    validate_runtime_settings(Settings(app_env="local", jwt_secret=DEFAULT_JWT_SECRET))
    validate_runtime_settings(Settings(app_env="development", jwt_secret=DEFAULT_JWT_SECRET))
    validate_runtime_settings(Settings(app_env="production", jwt_secret="non-default-secret"))

    with pytest.raises(RuntimeError):
        validate_runtime_settings(Settings(jwt_secret=DEFAULT_JWT_SECRET))

    with pytest.raises(RuntimeError):
        validate_runtime_settings(Settings(app_env="production", jwt_secret=DEFAULT_JWT_SECRET))


def test_application_startup_rejects_default_secret_outside_local(monkeypatch):
    import app.main as main

    monkeypatch.setattr(
        main,
        "get_settings",
        lambda: Settings(app_env="production", jwt_secret=DEFAULT_JWT_SECRET),
    )
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        with TestClient(main.app):
            pass
