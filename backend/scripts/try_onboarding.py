"""End-to-end check of photo onboarding as a brand-new retailer, against the LOCAL database.

    DATABASE_URL=postgresql+psycopg://kadanet:kadanet@localhost:5432/kadanet APP_ENV=local \
        python scripts/try_onboarding.py ../data/<photo>.jpeg

Registers a throwaway shop, reads the photo, then does what the app does: every readable item the
catalogue lacks is created as a new product, and everything is added to the shop.
"""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")

from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402

c = TestClient(app)
phone = "+9170" + f"{uuid.uuid4().int % 10**8:08d}"
c.post("/api/v1/auth/otp/request", json={"phone": phone, "role": "retailer"})
r = c.post("/api/v1/auth/otp/verify",
           json={"phone": phone, "otp": get_settings().demo_otp, "role": "retailer"})  # fmt: skip
h = {"Authorization": f"Bearer {r.json()['token']}"}
print("shop:", c.post("/api/v1/shop", headers=h, json={"name": "Onboarding Test"}).status_code)

photo = Path(sys.argv[1])
res = c.post("/api/v1/shop/ai/shelf-photo?thorough=false", headers=h,
             files=[("images", (photo.name, photo.read_bytes(), "image/jpeg"))])  # fmt: skip
res.raise_for_status()
dets = res.json()["detections"]
matched = [d for d in dets if d["match"]]
weak = [d for d in dets if not d["match"] and d["alternatives"]]
new = [d for d in dets if not d["match"] and not d["alternatives"] and d["readable"] and d["read"]["name"]]
print(f"detections {len(dets)}: matched {len(matched)}, weak {len(weak)}, new-product guesses {len(new)}, "
      f"left out {len(dets) - len(matched) - len(weak) - len(new)}")  # fmt: skip

ids, created, reused = {}, 0, 0
for d in matched:
    ids[d["match"]["id"]] = d
for d in weak:
    ids.setdefault(d["alternatives"][0]["id"], d)
for d in new:
    body = {"name": d["read"]["name"] or d["label"], "unit": "gram" if d["loose"] else "piece"}
    if d["read"]["brand"]:
        body["brand"] = d["read"]["brand"]
    if d["read"]["size"]:
        body["size"] = d["read"]["size"]
    p = c.post("/api/v1/catalogue/products", headers=h, json=body)
    if p.status_code == 201:
        created += 1
        ids.setdefault(p.json()["id"], d)
    elif p.status_code == 409 and p.json()["error"].get("candidates"):
        reused += 1
        ids.setdefault(p.json()["error"]["candidates"][0]["id"], d)
    else:
        print("create failed:", p.status_code, p.text[:120])
print(f"created {created} new products, reused {reused} existing")

items = [{"product_id": pid, "price": 10, "stock_level": d["suggested_level"], "count_source": "photo_estimate"}
         for pid, d in ids.items()]  # fmt: skip
saved = c.post("/api/v1/shop/products/bulk", headers=h, json={"items": items})
print("bulk save:", saved.status_code, "added", len(saved.json().get("items", [])), "skipped", len(saved.json().get("skipped", [])))
print("shop now has:", len(c.get("/api/v1/shop/products", headers=h).json()["items"]), "products")
