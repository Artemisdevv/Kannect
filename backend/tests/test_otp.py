import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import verify_access_token
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import install
from app.models import OwnerIdentity, Shop, Supplier
from app.routers.auth import router

TEST_SETTINGS = Settings(app_env="test", jwt_secret="otp-test-secret", demo_otp="123456")
PHONE = "+919876543210"


class FakeSession:
    def __init__(self, shop=None, supplier=None):
        self.shop = shop
        self.supplier = supplier
        self.identity = None
        self.added = []
        self.queries = []

    def get(self, model, key):
        assert model is OwnerIdentity
        if self.identity is not None and self.identity.phone == key:
            return self.identity
        return None

    def scalar(self, statement):
        self.queries.append(statement)
        model = statement.column_descriptions[0].get("entity")
        return self.shop if model is Shop else self.supplier

    def add(self, value):
        self.added.append(value)

    def commit(self):
        if self.added:
            self.identity = self.added[-1]

    def rollback(self):
        self.added.clear()


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
    assert claims["role"] == "retailer"
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
    assert body["role"] == "retailer"
    assert body["supplier"] is None
    assert len(session.queries) == 2


def test_new_owner_gets_token_without_shop():
    session = FakeSession(None)
    response = _client(session).post(
        "/api/v1/auth/otp/verify", json={"phone": PHONE, "otp": TEST_SETTINGS.demo_otp}
    )

    assert response.status_code == 200
    assert verify_access_token(response.json()["token"], TEST_SETTINGS)["sub"] == PHONE
    assert response.json()["shop"] is None
    assert response.json()["role"] == "retailer"
    assert session.identity.phone == PHONE
    assert session.identity.role == "retailer"
    assert len(session.queries) == 2


def test_supplier_role_selection_returns_supplier_token_without_profile():
    response = _client(FakeSession()).post(
        "/api/v1/auth/otp/verify",
        json={"phone": PHONE, "otp": TEST_SETTINGS.demo_otp, "role": "supplier"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "supplier"
    assert verify_access_token(body["token"], TEST_SETTINGS)["role"] == "supplier"
    assert body["shop"] is None
    assert body["supplier"] is None


def test_supplier_role_verification_returns_resolved_profile():
    supplier = Supplier(id=uuid.uuid4(), phone=PHONE, name="Wholesale Co")
    session = FakeSession(supplier=supplier)
    response = _client(session).post(
        "/api/v1/auth/otp/verify",
        json={"phone": PHONE, "otp": TEST_SETTINGS.demo_otp, "role": "supplier"},
    )
    assert response.status_code == 200
    assert response.json()["supplier"] == {
        "id": str(supplier.id),
        "name": "Wholesale Co",
        "contact_name": None,
        "phone": PHONE,
        "address": None,
        "location": None,
        "delivery_radius_m": None,
        "gstin": None,
    }
    assert verify_access_token(response.json()["token"], TEST_SETTINGS)["role"] == "supplier"
    assert len(session.queries) == 2


def test_owner_role_is_sticky_after_initial_verification():
    session = FakeSession()
    client = _client(session)
    first = client.post(
        "/api/v1/auth/otp/verify", json={"phone": PHONE, "otp": TEST_SETTINGS.demo_otp}
    )
    second = client.post(
        "/api/v1/auth/otp/verify",
        json={"phone": PHONE, "otp": TEST_SETTINGS.demo_otp, "role": "supplier"},
    )
    assert first.status_code == 200
    assert second.status_code == 401
    assert second.json()["error"]["code"] == "unauthorized"


def test_otp_verify_rejects_unsupported_role():
    response = _client(FakeSession(None)).post(
        "/api/v1/auth/otp/verify",
        json={"phone": PHONE, "otp": TEST_SETTINGS.demo_otp, "role": "admin"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"


def test_otp_verify_rejects_role_mismatch_with_existing_supplier():
    supplier = Supplier(id=uuid.uuid4(), phone=PHONE, name="Wholesale Co")
    response = _client(FakeSession(supplier=supplier)).post(
        "/api/v1/auth/otp/verify", json={"phone": PHONE, "otp": TEST_SETTINGS.demo_otp}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
