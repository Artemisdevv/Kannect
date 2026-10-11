"""Guard: every route we serve under /api/v1 must exist in docs/openapi.yaml."""

from pathlib import Path

import yaml

from app.main import API_PREFIX, app

SPEC = Path(__file__).resolve().parents[2] / "docs" / "openapi.yaml"
INFRA = {"/health", "/health/db"}


def test_served_routes_are_in_spec():
    spec_paths = set(yaml.safe_load(SPEC.read_text(encoding="utf-8"))["paths"])
    served = {
        r.path.removeprefix(API_PREFIX)
        for r in app.routes
        if getattr(r, "path", "").startswith(API_PREFIX)
    } - INFRA
    assert served <= spec_paths, f"Routes not in docs/openapi.yaml: {sorted(served - spec_paths)}"
