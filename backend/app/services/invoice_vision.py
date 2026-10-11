# ruff: noqa: E501
"""Read a supplier invoice photo with a vision LLM (Gemini). Suggests only, never writes stock."""

from typing import Protocol

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.config import Settings

PROMPT = """You are reading a photo of a supplier or distributor invoice/bill delivered to a small Indian shop.
Extract the header and every line item of goods. Quote text exactly as printed; do not translate or invent.

Header: supplier_name, invoice_number, date (as printed), invoice_total (the grand total in rupees, a number).

For each goods line:
- description: the full text of the line exactly as printed
- brand, name, size: your best split of that text (size like "100 g", "1 L"), "" when absent
- quantity: the number of units billed, as a number (can be decimal, e.g. 2.5 kg)
- quantity_unit: exactly one of piece, pack, carton, dozen, kg, g, litre, ml, unknown. Use "carton" for case/box/cs/ctn, "pack" for pkt/packet/bag, "piece" for nos/pcs/units
- units_per_pack: how many pieces are inside one pack/carton IF the invoice states it (e.g. "24 pcs/ctn" or "12x50g"), else null
- pack_weight_g: for goods sold in a bag/sack/tin by weight, the weight of ONE pack in grams (e.g. "bag 25kg" -> 25000, "tin 15 kg" -> 15000), else null
- unit_price: the printed rate per billed unit in rupees, or null
- line_total: the printed amount for the line in rupees, or null
- confidence: 0 to 1, how sure you are of this line
- readable: false if you could not really read the line

Rules: skip taxes, discounts, freight, subtotals and the total row (they are not goods). Never make up quantities or prices; use null when not printed or unreadable."""


class InvoiceLine(BaseModel):
    description: str
    brand: str = ""
    name: str = ""
    size: str = ""
    quantity: float = 0
    quantity_unit: str = "unknown"
    units_per_pack: int | None = None
    pack_weight_g: int | None = None
    unit_price: float | None = None
    line_total: float | None = None
    confidence: float = 0.5
    readable: bool = True


class InvoiceResult(BaseModel):
    supplier_name: str = ""
    invoice_number: str = ""
    date: str = ""
    invoice_total: float | None = None
    lines: list[InvoiceLine] = Field(default_factory=list)


class InvoiceVision(Protocol):
    def analyze(self, image: bytes) -> InvoiceResult: ...


# Units that already mean "one item", and the ones that need a pack size to become items
PIECE_UNITS = {"piece"}
PACK_UNITS = {"pack", "carton"}


def to_base_units(line: InvoiceLine, product_unit: str | None) -> tuple[int, str | None]:
    """Convert a billed quantity to the product's base unit (pieces or grams).

    Returns (quantity, note). `note` is set when the conversion needed a guess and the owner must
    check the number (the app shows it next to the line).
    """
    qty = max(line.quantity, 0)
    unit = line.quantity_unit
    if product_unit == "gram":
        if unit == "kg":
            return round(qty * 1000), None
        if unit == "g":
            return round(qty), None
        if unit in PACK_UNITS and line.pack_weight_g:
            return round(qty * line.pack_weight_g), None
        return round(qty), "Weight unit not clear: check the quantity"
    # pieces (or an unmatched product, which we treat as pieces)
    if unit in PIECE_UNITS:
        return round(qty), None
    if unit == "dozen":
        return round(qty * 12), None
    if unit in PACK_UNITS:
        if line.units_per_pack:
            return round(qty * line.units_per_pack), None
        return round(qty), f"Billed in {unit}s and the pieces per {unit} are not on the invoice: set the real count"
    if unit in ("kg", "g", "litre", "ml") and product_unit != "gram":
        return round(qty), f"Billed by {unit}: check how many items that is"
    return round(qty), "Billing unit not clear: check the quantity"


def cost_per_unit(line: InvoiceLine, base_qty: int, product_unit: str | None) -> float | None:
    """Cost per piece (or per kg for loose goods), from the line total when printed."""
    if base_qty <= 0:
        return None
    if line.line_total is not None and line.line_total > 0:
        per_kg = product_unit == "gram"
        return round(line.line_total / (base_qty / 1000 if per_kg else base_qty), 2)
    return None


def totals_check(result: InvoiceResult) -> dict:
    """Compare the sum of line totals with the printed invoice total (catches misreads)."""
    printed = [x.line_total for x in result.lines if x.line_total is not None]
    summed = round(sum(printed), 2) if printed else None
    total = result.invoice_total
    mismatch = None
    if summed is not None and total:
        # tax and discount rows are skipped, so allow a gap before we call it a mismatch
        mismatch = abs(summed - total) / total > 0.15
    return {"lines_total": summed, "invoice_total": total, "possible_misread": mismatch}


class GeminiInvoiceVision:
    def __init__(self, settings: Settings):
        self.settings = settings

    def analyze(self, image: bytes) -> InvoiceResult:
        if not self.settings.llm_api_key:
            raise HTTPException(status_code=503, detail="Invoice AI is not configured")
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self.settings.llm_api_key)
        cfg = types.GenerateContentConfig(
            response_mime_type="application/json", response_schema=InvoiceResult, temperature=0.0
        )
        try:
            resp = client.models.generate_content(
                model=self.settings.llm_model,
                contents=[types.Part.from_bytes(data=image, mime_type="image/jpeg"), PROMPT],
                config=cfg,
            )
            return InvoiceResult.model_validate_json(resp.text)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail="Invoice AI request failed") from e
