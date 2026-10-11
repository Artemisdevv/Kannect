"""Plays a retailer placing an order with a supplier, against a running API (default localhost).

usage: python scripts/try_supplier_flow.py API_URL RETAILER_PHONE OTP LAT LNG
Creates the retailer's shop at LAT/LNG if the number has none, then orders the first product of
the first supplier that serves it. Dev-only; never run against a real database.
"""

import json
import sys
import urllib.error
import urllib.request
import uuid

API, PHONE, OTP, LAT, LNG = sys.argv[1:6]


def call(method, path, body=None, token=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> {e.code}: {e.read().decode()[:300]}")


session = call("POST", "/auth/otp/verify", {"phone": PHONE, "otp": OTP, "role": "retailer"})
token = session["token"]
if not session.get("shop"):
    call("POST", "/shop", {
        "name": "E2E Test Store", "shop_type": "grocery", "owner_name": "Mary", "address": "Kaloor",
        "language": "en", "location": {"lat": float(LAT), "lng": float(LNG)},
    }, token)  # fmt: skip
suppliers = call("GET", "/suppliers", token=token)["items"]
if not suppliers:
    sys.exit("no supplier serves this shop: check the supplier's location and radius")
supplier = suppliers[0]
listing = call("GET", f"/suppliers/{supplier['id']}/products", token=token)["items"]
if not listing:
    sys.exit("the supplier has no listed products yet")
line = listing[0]
order = call("POST", "/shop/orders", {
    "client_id": str(uuid.uuid4()),
    "supplier_id": supplier["id"],
    "items": [{"product_id": line["product"]["id"], "packs": max(line.get("min_order_packs") or 1, 1)}],
}, token)  # fmt: skip
print("placed order", order["id"], "status", order["status"], "total", order["total"])
