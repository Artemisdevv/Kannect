# ruff: noqa: E501
"""Public e-bill: JSON for apps and a light HTML page for the link shared on WhatsApp.

The bill id is an unguessable UUID and acts as the access token. Customer contact is never shown.
"""

from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal
from html import escape
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select, text
from sqlalchemy.orm import Session, selectinload

from app.config import Settings, get_settings
from app.db import get_db
from app.models import Bill

api_router = APIRouter(tags=["ebill"])
page_router = APIRouter(include_in_schema=False)

IST = timezone(timedelta(hours=5, minutes=30))  # India has no DST
NO_STORE = {"Cache-Control": "private, no-store", "X-Robots-Tag": "noindex"}


def _ist(moment: datetime) -> datetime:
    return (moment if moment.tzinfo else moment.replace(tzinfo=UTC)).astimezone(IST)


def _money(value: Decimal | float) -> str:
    return f"{Decimal(value):,.2f}"


def _qty(quantity: int, unit: str) -> str:
    if unit == "gram":
        return f"{Decimal(quantity) / 1000:g} kg" if quantity >= 1000 else f"{quantity} g"
    return f"{quantity}"


def _load(db: Session, bill_id: UUID) -> tuple[Bill, dict[str, Any]]:
    bill = db.scalars(
        select(Bill).where(Bill.id == bill_id).options(selectinload(Bill.items))
    ).first()
    if bill is None:
        raise HTTPException(status_code=404, detail="Bill not found")
    shop = (
        db.execute(
            text("SELECT id, name, address, phone, ST_Y(location) AS lat, ST_X(location) AS lng "
                 "FROM shop WHERE id = :id"),
            {"id": bill.shop_id},
        ).mappings().first()  # fmt: skip
    )
    return bill, dict(shop) if shop else {}


def _share_text(shop: dict[str, Any], bill: Bill, url: str) -> str:
    name = shop.get("name") or "Shop"
    return f"Bill from {name}: Rs {_money(bill.total)}\n{url}"


@api_router.get("/ebills/{bill_id}")
def ebill_json(
    bill_id: UUID,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    bill, shop = _load(db, bill_id)
    url = f"{settings.public_base_url.rstrip('/')}/b/{bill.id}"
    return {
        "bill": {
            "id": str(bill.id),
            "created_at": _ist(bill.created_at).isoformat(),
            "items": [
                {
                    "product_id": str(line.product_id),
                    "name": line.name,
                    "unit": line.unit,
                    "quantity": line.quantity,
                    "price": float(line.unit_price),
                    "line_total": float(line.line_total),
                }
                for line in bill.items
            ],
            "total": float(bill.total),
            "payment_mode": bill.payment_mode,
            "share_url": url,
        },
        "shop": {
            "id": str(shop["id"]) if shop else None,
            "name": shop.get("name"),
            "address": shop.get("address"),
            "phone": shop.get("phone"),
            "location": {"lat": shop.get("lat"), "lng": shop.get("lng")} if shop else None,
        },
        "share_text": _share_text(shop, bill, url),
        "share_url": url,
    }


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Bill from {shop}</title>
<style>
:root{{--bg:#f6f7f4;--card:#fff;--ink:#1d2a20;--mute:#5f6b62;--line:#e4e8e2;--brand:#1f7a4d}}
@media (prefers-color-scheme:dark){{:root{{--bg:#101612;--card:#18211b;--ink:#eaf2ec;--mute:#9db0a2;--line:#27342b;--brand:#4cc38a}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Malayalam",sans-serif}}
main{{max-width:520px;margin:0 auto;padding:20px 16px 40px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}}
h1{{font-size:1.25rem;margin:0 0 2px}}.mute{{color:var(--mute);font-size:.9rem}}
table{{width:100%;border-collapse:collapse;margin-top:14px}}
td{{padding:9px 0;border-top:1px solid var(--line);vertical-align:top}}
td.r{{text-align:right;white-space:nowrap;padding-left:12px}}
.total td{{font-weight:700;font-size:1.1rem;border-top:2px solid var(--ink)}}
.foot{{margin-top:16px;text-align:center}}a{{color:var(--brand)}}
</style></head><body><main>
<div class="card">
<h1>{shop}</h1>
<div class="mute">{address}{phone}</div>
<div class="mute" style="margin-top:6px">{when} &middot; {mode}</div>
<table>{rows}<tr class="total"><td>Total</td><td class="r">&#8377;{total}</td></tr></table>
</div>
<p class="foot mute">Thank you for shopping local.<br>Digital bill by Kannect</p>
</main></body></html>"""


@page_router.get("/b/{bill_id}", response_class=HTMLResponse)
def ebill_page(bill_id: str, db: Session = Depends(get_db)) -> HTMLResponse:
    try:
        bill, shop = _load(db, UUID(bill_id))
    except (HTTPException, ValueError):
        return HTMLResponse(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>"
            "<title>Bill not found</title><body style='font-family:system-ui;padding:24px'>"
            "<h1>Bill not found</h1><p>This link is not valid.</p></body>",
            status_code=404,
            headers=NO_STORE,
        )
    rows = "".join(
        "<tr><td>{name}<div class='mute'>{qty} &times; &#8377;{price}{per}</div></td>"
        "<td class='r'>&#8377;{total}</td></tr>".format(
            name=escape(line.name),
            qty=escape(_qty(line.quantity, line.unit)),
            price=_money(line.unit_price),
            per="/kg" if line.unit == "gram" else "",
            total=_money(line.line_total),
        )
        for line in bill.items
    )
    address = escape(shop.get("address") or "")
    phone = shop.get("phone")
    html = PAGE.format(
        shop=escape(shop.get("name") or "Shop"),
        address=address,
        phone=(f" &middot; {escape(phone)}" if phone and address else escape(phone or "")),
        when=_ist(bill.created_at).strftime("%d %b %Y, %I:%M %p") + " IST",
        mode=escape(bill.payment_mode.upper()),
        rows=rows,
        total=_money(bill.total),
    )
    return HTMLResponse(html, headers=NO_STORE)
