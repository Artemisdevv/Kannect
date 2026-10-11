import uuid
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import AuthenticatedOwner, require_supplier
from app.db import get_db
from app.errors import install
from app.models import Product, Supplier, SupplierProduct
from app.routers.supplier import router

PHONE = "+919876543210"


def _product(**changes):
    values = {
        "id": uuid.uuid4(),
        "barcode": "8901234567890",
        "name": "Rice",
        "name_ml": None,
        "brand": "Brand",
        "size": "1 kg",
        "category": "grocery",
        "unit": "gram",
        "image_url": None,
        "mrp": Decimal("70.00"),
        "is_active": True,
        "merged_into_id": None,
    }
    values.update(changes)
    return Product(**values)


class FakeResult:
    def __init__(self, values):
        self.values = values

    def all(self):
        return self.values


class FakeSession:
    def __init__(self, *, supplier=None, product=None, rows=None, listed=None):
        self.supplier = supplier
        self.product = product
        self.rows = rows or []
        self.listed = listed
        self.added = []
        self.commits = 0
        self.rollbacks = 0

    def get(self, model, key):
        if model is Product:
            return self.product if self.product is not None and key == self.product.id else None
        if model is SupplierProduct:
            return self.listed
        return None

    def scalar(self, _statement):
        return self.listed

    def scalars(self, _statement):
        return FakeResult(self.rows)

    def add(self, value):
        self.added.append(value)

    def commit(self):
        self.commits += 1
        for value in self.added:
            if isinstance(value, Supplier) and value.id is None:
                value.id = uuid.uuid4()

    def refresh(self, _value):
        pass

    def rollback(self):
        self.rollbacks += 1


def _client(session, supplier=None):
    app = FastAPI()
    install(app)
    app.include_router(router, prefix="/api/v1")
    owner = AuthenticatedOwner(phone=PHONE, role="supplier", shop=None, supplier=supplier)
    app.dependency_overrides[require_supplier] = lambda: owner

    def override_db():
        yield session

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def test_create_supplier_profile_uses_authenticated_owner_phone():
    session = FakeSession()
    response = _client(session).post(
        "/api/v1/supplier",
        json={"name": "Wholesale Co", "location": {"lat": 9.93, "lng": 76.26}},
    )
    assert response.status_code == 201
    assert response.json()["phone"] == PHONE
    assert response.json()["delivery_radius_m"] == 10000
    assert session.added[0].phone == PHONE
    assert session.commits == 1


def test_supplier_profile_requires_phone_to_match_owner():
    response = _client(FakeSession()).post("/api/v1/supplier", json={"phone": "+919999999999"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"


def test_get_and_patch_supplier_profile():
    supplier = Supplier(id=uuid.uuid4(), phone=PHONE, name="Old name")
    client = _client(FakeSession(supplier=supplier), supplier)
    assert client.get("/api/v1/supplier").json()["name"] == "Old name"
    response = client.patch("/api/v1/supplier", json={"name": "New name"})
    assert response.status_code == 200
    assert response.json()["name"] == "New name"


def test_supplier_product_create_and_list():
    supplier = Supplier(id=uuid.uuid4(), phone=PHONE, name="Wholesale Co")
    product = _product()
    session = FakeSession(supplier=supplier, product=product)
    client = _client(session, supplier)
    response = client.post(
        "/api/v1/supplier/products",
        json={"product_id": str(product.id), "price": "55.25", "pack_size": 10},
    )
    assert response.status_code == 201
    assert response.json()["price"] == 55.25
    assert response.json()["product"]["id"] == str(product.id)
    assert response.json()["min_order_packs"] == 1

    listed = SupplierProduct(
        supplier_id=supplier.id,
        product_id=product.id,
        price=Decimal("55.25"),
        pack_size=10,
        min_order_packs=1,
        available=True,
        supplier=supplier,
        product=product,
    )
    listing = _client(FakeSession(supplier=supplier, rows=[listed]), supplier).get(
        "/api/v1/supplier/products"
    )
    assert listing.status_code == 200
    assert listing.json()["items"][0]["product"]["name"] == "Rice"


def test_supplier_product_duplicate_and_validation():
    supplier = Supplier(id=uuid.uuid4(), phone=PHONE)
    product = _product()
    listed = SupplierProduct(
        supplier_id=supplier.id,
        product_id=product.id,
        price=Decimal("55.25"),
        pack_size=10,
        min_order_packs=1,
        available=True,
        supplier=supplier,
        product=product,
    )
    duplicate = _client(
        FakeSession(supplier=supplier, product=product, listed=listed), supplier
    ).post(
        "/api/v1/supplier/products",
        json={"product_id": str(product.id), "price": 55, "pack_size": 10},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "conflict"

    invalid = _client(FakeSession(supplier=supplier), supplier).post(
        "/api/v1/supplier/products",
        json={"product_id": str(uuid.uuid4()), "price": 55, "pack_size": 0},
    )
    assert invalid.status_code == 400
    assert invalid.json()["error"]["code"] == "invalid_request"


def test_patch_supplier_product_updates_availability():
    supplier = Supplier(id=uuid.uuid4(), phone=PHONE)
    product = _product()
    listed = SupplierProduct(
        supplier_id=supplier.id,
        product_id=product.id,
        price=Decimal("55.25"),
        pack_size=10,
        min_order_packs=1,
        available=True,
        supplier=supplier,
        product=product,
    )
    response = _client(FakeSession(supplier=supplier, listed=listed), supplier).patch(
        f"/api/v1/supplier/products/{product.id}", json={"available": False}
    )
    assert response.status_code == 200
    assert response.json()["available"] is False


@pytest.mark.parametrize("path", ["/api/v1/supplier", "/api/v1/supplier/products"])
def test_supplier_routes_return_not_found_without_profile(path):
    response = _client(FakeSession()).get(path)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
