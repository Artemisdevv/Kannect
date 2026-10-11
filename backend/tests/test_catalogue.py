import uuid
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_db
from app.errors import install
from app.models import OwnerIdentity, Product, Shop, Supplier
from app.routers.catalogue import router

TEST_SETTINGS = Settings(app_env="test", jwt_secret="catalogue-test-secret")
OWNER_PHONE = "+919876543210"
AUTH_HEADERS = {
    "Authorization": f"Bearer {create_access_token(OWNER_PHONE, TEST_SETTINGS)}"
}


def _product(**overrides):
    values = {
        "id": uuid.uuid4(),
        "barcode": "8901234567890",
        "name": "Soap",
        "name_ml": None,
        "brand": None,
        "size": None,
        "category": None,
        "unit": "piece",
        "image_url": None,
        "mrp": Decimal("25.00"),
        "is_active": True,
        "merged_into_id": None,
    }
    values.update(overrides)
    return Product(**values)


class FakeResult:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class FakeSession:
    def __init__(
        self,
        *,
        barcode_product=None,
        products=None,
        by_id=None,
        shop=None,
        duplicate=None,
        commit_error=None,
        role="retailer",
    ):
        self.barcode_product = barcode_product
        self.products = products or []
        self.by_id = by_id or {}
        self.shop = shop
        self.duplicate = duplicate
        self.commit_error = commit_error
        self.role = role
        self.statements = []
        self.added = []
        self.commits = 0
        self.rollbacks = 0

    def scalar(self, statement):
        self.statements.append(statement)
        entity = statement.column_descriptions[0].get("entity")
        if entity is Shop:
            return self.shop
        if entity is Supplier:
            return None
        if entity is Product:
            if statement.column_descriptions[0]["name"] == "Product":
                return self.barcode_product
            return self.duplicate.id if self.duplicate else None
        return self.duplicate.id if self.duplicate else None

    def get(self, model, key):
        if model is OwnerIdentity:
            return OwnerIdentity(phone=key, role=self.role)
        assert model is Product
        return self.by_id.get(key)

    def scalars(self, statement):
        self.statements.append(statement)
        return FakeResult(self.products)

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.commits += 1
        if self.commit_error is not None:
            raise self.commit_error
        if self.added and self.added[-1].id is None:
            self.added[-1].id = uuid.uuid4()

    def refresh(self, _value):
        pass

    def rollback(self):
        self.rollbacks += 1


def _client(session):
    app = FastAPI()
    install(app)
    app.include_router(router, prefix="/api/v1")

    def override_db():
        yield session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    return TestClient(app)


def test_barcode_lookup_returns_active_product():
    product = _product()
    response = _client(FakeSession(barcode_product=product)).get(
        f"/api/v1/catalogue/barcode/{product.barcode}", headers=AUTH_HEADERS
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(product.id)
    assert response.json()["name"] == product.name


@pytest.mark.parametrize(
    "barcode_product,by_id",
    [
        (None, {}),
        (_product(is_active=False), {}),
        (_product(is_active=False, merged_into_id=uuid.uuid4()), {}),
    ],
)
def test_barcode_lookup_not_found_for_unresolvable_product(barcode_product, by_id):
    response = _client(
        FakeSession(barcode_product=barcode_product, by_id=by_id)
    ).get("/api/v1/catalogue/barcode/unknown", headers=AUTH_HEADERS)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_barcode_lookup_follows_inactive_merge_chain():
    canonical = _product(barcode=None, name="Canonical Soap")
    middle = _product(id=uuid.uuid4(), is_active=False, merged_into_id=canonical.id)
    source = _product(is_active=False, merged_into_id=middle.id)
    session = FakeSession(
        barcode_product=source, by_id={middle.id: middle, canonical.id: canonical}
    )

    response = _client(session).get(
        f"/api/v1/catalogue/barcode/{source.barcode}", headers=AUTH_HEADERS
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(canonical.id)


def test_barcode_lookup_rejects_cyclic_merge_chain():
    first_id, second_id = uuid.uuid4(), uuid.uuid4()
    first = _product(id=first_id, is_active=False, merged_into_id=second_id)
    second = _product(id=second_id, is_active=False, merged_into_id=first_id)
    response = _client(
        FakeSession(barcode_product=first, by_id={second_id: second, first_id: first})
    ).get(f"/api/v1/catalogue/barcode/{first.barcode}", headers=AUTH_HEADERS)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_barcode_lookup_rejects_inactive_merge_target_without_canonical_target():
    inactive_target = _product(is_active=False)
    source = _product(is_active=False, merged_into_id=inactive_target.id)
    response = _client(
        FakeSession(barcode_product=source, by_id={inactive_target.id: inactive_target})
    ).get(f"/api/v1/catalogue/barcode/{source.barcode}", headers=AUTH_HEADERS)
    assert response.status_code == 404


def test_catalogue_listing_filters_active_products_by_name():
    match = _product(name="Laundry Soap")
    session = FakeSession(products=[match])
    response = _client(session).get(
        "/api/v1/catalogue/products?q=soap", headers=AUTH_HEADERS
    )
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [str(match.id)]
    sql = str(session.statements[-1]).lower()
    assert "product.is_active is true" in sql
    assert "lower(product.name) like" in sql


def test_catalogue_listing_supports_localized_name_filter():
    localized = _product(name="Soap", name_ml="സോപ്പ്")
    session = FakeSession(products=[localized])
    response = _client(session).get(
        "/api/v1/catalogue/products?q=%E0%B4%B8%E0%B5%8B%E0%B4%AA%E0%B5%8D%E0%B4%AA%E0%B5%8D",
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["items"][0]["name_ml"] == "സോപ്പ്"
    assert "lower(product.name_ml) like" in str(session.statements[-1]).lower()


def test_catalogue_listing_requires_query():
    response = _client(FakeSession()).get("/api/v1/catalogue/products", headers=AUTH_HEADERS)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"


def test_create_product_returns_201_and_stores_shared_fields():
    session = FakeSession(shop=None)
    response = _client(session).post(
        "/api/v1/catalogue/products",
        headers=AUTH_HEADERS,
        json={"barcode": "8901234567890", "name": "Rice", "unit": "gram", "mrp": 42.5},
    )
    assert response.status_code == 201
    assert response.json()["name"] == "Rice"
    assert response.json()["mrp"] == 42.5
    assert session.added[0].barcode == "8901234567890"
    assert session.commits == 1


@pytest.mark.parametrize(
    "payload",
    [
        {"unit": "piece"},
        {"name": "Bad unit", "unit": "box"},
    ],
)
def test_create_product_validates_request(payload):
    response = _client(FakeSession()).post(
        "/api/v1/catalogue/products", headers=AUTH_HEADERS, json=payload
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"


def test_create_product_rejects_duplicate_barcode():
    duplicate = _product()
    session = FakeSession(duplicate=duplicate)
    response = _client(session).post(
        "/api/v1/catalogue/products",
        headers=AUTH_HEADERS,
        json={"barcode": duplicate.barcode, "name": "Duplicate", "unit": "piece"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"
    assert session.commits == 0


def test_create_product_handles_concurrent_duplicate_barcode():
    session = FakeSession(
        commit_error=IntegrityError("insert", {}, Exception("unique barcode"))
    )
    response = _client(session).post(
        "/api/v1/catalogue/products",
        headers=AUTH_HEADERS,
        json={"barcode": "8901234567890", "name": "Race", "unit": "piece"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"
    assert session.rollbacks == 1


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer invalid"}])
@pytest.mark.parametrize(
    "method,path,kwargs",
    [
        ("get", "/api/v1/catalogue/barcode/unknown", {}),
        ("get", "/api/v1/catalogue/products?q=soap", {}),
        (
            "post",
            "/api/v1/catalogue/products",
            {"json": {"name": "Soap", "unit": "piece"}},
        ),
    ],
)
def test_catalogue_requires_valid_bearer_token(headers, method, path, kwargs):
    response = getattr(_client(FakeSession()), method)(path, headers=headers, **kwargs)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_supplier_token_cannot_access_retailer_catalogue_routes():
    token = create_access_token(OWNER_PHONE, TEST_SETTINGS, role="supplier")
    supplier_headers = {
        "Authorization": f"Bearer {token}"
    }
    response = _client(FakeSession(role="supplier")).get(
        "/api/v1/catalogue/barcode/8901023010484", headers=supplier_headers
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "unauthorized"


def test_create_product_rejects_near_duplicate_with_candidates():
    existing = _product(barcode="8901023010484", name="Cinthol soap", brand="Godrej", size="100g")
    session = FakeSession(products=[existing])
    response = _client(session).post(
        "/api/v1/catalogue/products",
        headers=AUTH_HEADERS,
        json={"barcode": "8901023099999", "name": "Cinthol Soap", "brand": "Godrej",
              "size": "100 g", "unit": "piece"},
    )  # fmt: skip
    assert response.status_code == 409
    body = response.json()["error"]
    assert body["code"] == "similar_product"
    assert body["candidates"][0]["barcode"] == "8901023010484"
    assert session.commits == 0


def test_create_product_allow_similar_creates_anyway():
    existing = _product(name="Cinthol soap", brand="Godrej", size="100g")
    session = FakeSession(products=[existing])
    response = _client(session).post(
        "/api/v1/catalogue/products",
        headers=AUTH_HEADERS,
        json={"barcode": "8901023099999", "name": "Cinthol soap", "brand": "Godrej",
              "size": "100g", "unit": "piece", "allow_similar": True},
    )  # fmt: skip
    assert response.status_code == 201
    assert session.commits == 1
    assert not hasattr(session.added[0], "allow_similar")


def test_create_product_different_size_is_not_a_duplicate():
    existing = _product(name="Cinthol soap", brand="Godrej", size="100g")
    session = FakeSession(products=[existing])
    response = _client(session).post(
        "/api/v1/catalogue/products",
        headers=AUTH_HEADERS,
        json={"barcode": "8901023099999", "name": "Cinthol soap", "brand": "Godrej",
              "size": "150g", "unit": "piece"},
    )  # fmt: skip
    assert response.status_code == 201


@pytest.mark.parametrize("barcode", ["abc123456", "123", "12345678901234567"])
def test_create_product_rejects_malformed_barcode(barcode):
    response = _client(FakeSession()).post(
        "/api/v1/catalogue/products",
        headers=AUTH_HEADERS,
        json={"barcode": barcode, "name": "X", "unit": "piece"},
    )
    assert response.status_code == 400
