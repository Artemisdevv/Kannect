# ruff: noqa: E501
"""Turn a spoken bill ("ara kilo thakkali, randu Parle-G") into suggested bill lines.

Gemini hears the audio and returns structured lines; the endpoint matches them to the shop's
own products. Suggests only: the owner confirms, then the app calls POST /shop/bills.
"""

import re
from typing import Protocol

from fastapi import HTTPException
from pydantic import BaseModel, Field

from app.config import Settings

PROMPT = """You are listening to a shopkeeper in Kerala dictating a customer's bill, in Malayalam, English or a mix (Manglish).
Transcribe what was said, then list every item sold with its quantity.

transcript: what was said, in Malayalam script when spoken in Malayalam
For each item:
- spoken: the item as the speaker said it, in the original script
- name: the product name in English (e.g. "Tomato", "Onion", "Rice", "Parle-G"); a common Malayalam word like "thakkali" is Tomato, "savala" is Onion, "ari" is Rice
- brand: brand if said (e.g. "Parle", "Sunlight"), else ""
- quantity: the number said, as a number (half = 0.5, one and a half = 1.5, "randu" = 2, "moonu" = 3)
- unit: exactly one of piece, kg, g, litre, ml, dozen, pack, unknown. "kilo" is kg, "ara kilo" is 0.5 kg, "kaal kilo" is 0.25 kg, "nooru gram" is 100 g, "oru" is one
- confidence: 0 to 1, how sure you are of this item

Words for drinking water and bottled drinks matter: "vellam", "kudikkan vellam", "water" or "kuppi vellam" all mean a water bottle, name it "Water bottle".

Rules: only goods being sold, not chit-chat or prices. Never invent an item or quantity that was not said. If the audio has no items, return an empty list."""


# Malayalam / Manglish words a shopkeeper says -> what the product is called on the shelf.
ALIASES = {
    "vellam": "water bottle",
    "kudikkan vellam": "water bottle",
    "kuppi vellam": "water bottle",
    "paal": "milk",
    "pal": "milk",
    "panchasara": "sugar",
    "chaya": "tea",
    "chayapodi": "tea",
    "ari": "rice",
    "uppu": "salt",
    "mulaku": "chilli",
    "enna": "oil",
    "velichenna": "coconut oil",
    "muttai": "egg",
    "mutta": "egg",
    "pazham": "banana",
    "ulli": "onion",
    "savala": "onion",
    "thakkali": "tomato",
    "urulakizhangu": "potato",
    "kizhangu": "potato",
    "biscuit": "biscuit",
    "sabun": "soap",
}
FILLER_WORDS = {"oru", "onnu", "one", "two", "randu", "moonu", "the", "of", "and", "a", "pack", "packet", "bottle"}


def _words(text: str) -> list[str]:
    return re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower()).split()


def apply_alias(text: str) -> str:
    """Replace a spoken Malayalam/Manglish word by the product word ("vellam" -> "water bottle")."""
    folded = " ".join(_words(text))
    if folded in ALIASES:
        return ALIASES[folded]
    return " ".join(ALIASES.get(word, word) for word in folded.split())


def suggest_by_words(heard: str, products: list, limit: int = 4) -> list:
    """Shop products that share a word with what was said, best first: "water" -> "1L water bottle".

    Used when the fuzzy catalogue match finds nothing, so the owner still gets something to tap.
    """
    query = {w for w in _words(apply_alias(heard)) if len(w) > 2 and w not in FILLER_WORDS}
    if not query:
        return []
    scored = []
    for product in products:
        key = _words(f"{product.brand or ''} {product.name} {product.name_ml or ''}")
        hits = sum(any(word == k or (len(word) >= 4 and k.startswith(word)) for k in key) for word in query)
        if hits:
            scored.append((-hits, len(key), product.name.casefold(), product))
    scored.sort(key=lambda item: item[:3])
    return [item[3] for item in scored[:limit]]


class VoiceLine(BaseModel):
    spoken: str = ""
    name: str = ""
    brand: str = ""
    quantity: float = 0
    unit: str = "unknown"
    confidence: float = 0.5


class VoiceResult(BaseModel):
    transcript: str = ""
    lines: list[VoiceLine] = Field(default_factory=list)


class VoiceVision(Protocol):
    def analyze(self, audio: bytes, mime_type: str) -> VoiceResult: ...


def to_base_units(line: VoiceLine, product_unit: str | None) -> tuple[int, str | None]:
    """Convert a spoken quantity to the product's base unit (pieces or grams).

    Returns (quantity, note); `note` is set when the unit did not fit the product and the owner
    must check the number.
    """
    qty, unit = max(line.quantity, 0), line.unit
    if product_unit == "gram":
        if unit == "kg":
            return round(qty * 1000), None
        if unit == "g":
            return round(qty), None
        return round(qty), "Weight not clear: check the quantity (kg or grams)"
    if unit in ("piece", "pack"):
        return round(qty), None
    if unit == "dozen":
        return round(qty * 12), None
    if unit == "unknown":
        return round(qty), None  # a bare number of an item means pieces
    return round(qty), f"Said in {unit}: check how many items that is"


class GeminiVoiceBill:
    def __init__(self, settings: Settings):
        self.settings = settings

    def analyze(self, audio: bytes, mime_type: str) -> VoiceResult:
        if not self.settings.llm_api_key:
            raise HTTPException(status_code=503, detail="Voice AI is not configured")
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self.settings.llm_api_key)
        cfg = types.GenerateContentConfig(
            response_mime_type="application/json", response_schema=VoiceResult, temperature=0.0
        )
        try:
            resp = client.models.generate_content(
                model=self.settings.llm_model,
                contents=[types.Part.from_bytes(data=audio, mime_type=mime_type), PROMPT],
                config=cfg,
            )
            return VoiceResult.model_validate_json(resp.text)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail="Voice AI request failed") from e
