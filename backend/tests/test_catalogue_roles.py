from fastapi.testclient import TestClient

from app.auth import AuthenticatedOwner, get_current_owner
from app.db import get_db
from app.main import app


class _EmptyDB:
    def scalars(self, *_args, **_kwargs):
        class Result:
            def all(self):
                return []

        return Result()


def _client(role: str) -> TestClient:
    app.dependency_overrides[get_current_owner] = lambda: AuthenticatedOwner(
        phone="+919000000000", role=role, shop=None, supplier=None
    )
    app.dependency_overrides[get_db] = lambda: _EmptyDB()
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def test_supplier_can_search_the_shared_catalogue():
    assert _client("supplier").get("/api/v1/catalogue/products?q=rice").status_code == 200


def test_retailer_can_still_search_the_shared_catalogue():
    assert _client("retailer").get("/api/v1/catalogue/products?q=rice").status_code == 200


def test_other_catalogue_routes_stay_retailer_only():
    assert _client("supplier").get("/api/v1/catalogue/barcode/890100").status_code == 403
