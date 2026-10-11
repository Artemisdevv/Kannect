"""Call POST /shop/ai/shelf-photo for real (Gemini) against the Open Food Facts candidates as catalogue.

Usage (from backend/):  python scripts/try_shelf_endpoint.py [image ...]
Uses the endpoint with a fake DB session, so no Postgres is needed. Needs LLM_API_KEY in .env.
"""

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from test_shelf_photo import PHONE, FakeSession  # noqa: E402

from app.auth import create_access_token  # noqa: E402
from app.config import Settings, get_settings  # noqa: E402
from app.db import get_db  # noqa: E402
from app.errors import install  # noqa: E402
from app.models import Product  # noqa: E402
from app.routers.ai import router  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
live = get_settings()
settings = Settings(app_env="test", jwt_secret="try-secret", llm_api_key=live.llm_api_key,
                    llm_model=live.llm_model)  # fmt: skip

products = []
for line in (ROOT / "data/seed/off_candidates.jsonl").open(encoding="utf-8"):
    c = json.loads(line)
    products.append(Product(id=uuid.uuid4(), barcode=c["code"], name=c["product_name"],
                            brand=c["brands"], size=c["quantity"], unit="piece", is_active=True,
                            category=None, name_ml=None, image_url=c["image_small_url"], mrp=None))  # fmt: skip

app = FastAPI()
install(app)
app.include_router(router)
app.dependency_overrides[get_db] = lambda: FakeSession(products)
app.dependency_overrides[get_settings] = lambda: settings
client = TestClient(app)
auth = {"Authorization": f"Bearer {create_access_token(PHONE, settings)}"}

paths = [Path(p) for p in sys.argv[1:]] or sorted((ROOT / "data").glob("*.jpeg"))[:2]
for p in paths:
    r = client.post("/shop/ai/shelf-photo", files=[("images", (p.name, p.read_bytes(), "image/jpeg"))],
                    headers=auth)  # fmt: skip
    print(f"\n== {p.name}: HTTP {r.status_code}")
    if r.status_code != 200:
        print(r.text[:300])
        continue
    body = r.json()
    dets = body["detections"]
    matched = [d for d in dets if d["match"]]
    print(f"quality={body['image_quality']} items={len(dets)} matched={len(matched)} "
          f"needs_scan={sum(d['needs_scan'] for d in dets)} loose={sum(not d['match'] and not d['needs_scan'] for d in dets)}")  # fmt: skip
    for d in dets:
        tag = "MATCH " if d["match"] else ("scan  " if d["needs_scan"] else "loose ")
        m = f" -> {d['match']['brand']} | {d['match']['name']} {d['match']['size']}" if d["match"] else ""
        print(f"  {tag} x{d['visible_count']:<3} {d['suggested_level']:<6} {d['label'][:42]}{m}")
