import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import verify_access_token
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import install
from app.models import Shop
from app.routers.auth import router

TEST_SETTINGS = Settings(app_env="test", jwt_secret="otp-test-secret", demo_otp="123456")
PHONE = "+919876543210"


class FakeSession:
    def __init__(self, shop):
        self.shop = shop
        self.queries = []

    def scalar(self, statement):
        self.queries.append(statement)
        return self.shop


def _client(session):
    app = FastAPI()
    install(app)
    app.include_router(router, prefix="/api/v1")

    def override_db():
        yield session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    return TestClient(app)


def test_request_otp_returns_contract_204():
    response = _client(FakeSession(None)).post(
        "/api/v1/auth/otp/request", json={"phone": PHONE}
    )
    assert response.status_code == 204
    assert response.content == b""


def test_otp_request_rejects_invalid_phone_with_contract_error():
    response = _client(FakeSession(None)).post(
        "/api/v1/auth/otp/request", json={"phone": "919876543210"}
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"


def test_otp_verify_rejects_invalid_phone():
    response = _client(FakeSession(None)).post(
        "/api/v1/auth/otp/verify", json={"phone": "bad", "otp": "123456"}
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"


def test_otp_verify_rejects_incorrect_code_with_contract_error():
    response = _client(FakeSession(None)).post(
        "/api/v1/auth/otp/verify", json={"phone": PHONE, "otp": "000000"}
    )
    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "unauthorized", "message": "Invalid phone or OTP"}
    }


def test_otp_verify_issues_token_and_returns_existing_shop():
    shop = Shop(
        id=uuid.uuid4(),
        phone=PHONE,
        name="Corner Shop",
        owner_name="Owner",
        address="Main Road",
        language="ml",
        shop_type="grocery",
    )
    session = FakeSession(shop)
    response = _client(session).post(
        "/api/v1/auth/otp/verify", json={"phone": PHONE, "otp": "123456"}
    )

    assert response.status_code == 200
    body = response.json()
    claims = verify_access_token(body["token"], TEST_SETTINGS)
    assert claims["sub"] == PHONE
    assert "shop_id" not in claims
    assert body["shop"] == {
        "id": str(shop.id),
        "name": "Corner Shop",
        "owner_name": "Owner",
        "phone": PHONE,
        "address": "Main Road",
        "location": None,
        "language": "ml",
        "shop_type": "grocery",
    }
    assert len(session.queries) == 1


def test_new_owner_gets_token_without_shop():
    session = FakeSession(None)
    response = _client(session).post(
        "/api/v1/auth/otp/verify", json={"phone": PHONE, "otp": TEST_SETTINGS.demo_otp}
    )

    assert response.status_code == 200
    assert verify_access_token(response.json()["token"], TEST_SETTINGS)["sub"] == PHONE
    assert response.json()["shop"] is None
    assert len(session.queries) == 1
