"""Send an audio file through POST /shop/ai/voice-bill as a demo retailer and print the result.

    python scripts/try_voice_bill.py ../data/voice/malayalam_audio_test1.ogg [+919000000002]

Reads only: the endpoint saves nothing. Uses the database and Gemini key in backend/.env.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")

from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402


def main() -> None:
    path = Path(sys.argv[1])
    phone = sys.argv[2] if len(sys.argv) > 2 else "+919000000002"
    c = TestClient(app)
    c.post("/api/v1/auth/otp/request", json={"phone": phone, "role": "retailer"})
    r = c.post(
        "/api/v1/auth/otp/verify",
        json={"phone": phone, "otp": get_settings().demo_otp, "role": "retailer"},
    )
    r.raise_for_status()
    headers = {"Authorization": f"Bearer {r.json()['token']}"}
    out = c.post(
        "/api/v1/shop/ai/voice-bill",
        headers=headers,
        files={"audio": (path.name, path.read_bytes(), "application/octet-stream")},
    )
    print(out.status_code)
    body = out.json()
    print("transcript:", body.get("transcript"))
    for line in body.get("suggestions", []):
        match = (line["product"] or {}).get("name")
        print(
            f"- {line['spoken']!r} -> {match} | qty {line['quantity']} {line['unit']} | "
            f"price {line['price']} | check={line['needs_check']} {line['note'] or ''}"
        )
    if out.status_code != 200:
        print(json.dumps(body, ensure_ascii=False))


main()
