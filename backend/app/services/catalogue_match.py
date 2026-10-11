"""Fuzzy-match text read from a shelf photo to catalogue products.

Pretrained image retrieval was tested and rejected (docs/vision-experiment.md); we match the
brand/name/size text the vision model reads. A match is only accepted when the brand agrees and
most of the name's words are present, otherwise the item becomes `needs_scan`.
"""

import re
from dataclasses import dataclass

from rapidfuzz import fuzz, process

from app.models import Product

STRONG = 85  # auto-accept as the suggested match
WEAK = 60  # offer as an alternative, but still ask the owner to scan
SHORTLIST = 25


def norm(text: str | None) -> str:
    text = re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower())
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class Match:
    product: Product
    score: float


class CatalogueIndex:
    def __init__(self, products: list[Product]):
        self.products = products
        self.keys = [norm(f"{p.brand} {p.name} {p.size}") for p in products]

    def match(self, brand: str, name: str, size: str, limit: int = 3) -> list[Match]:
        if not self.products:
            return []
        query = norm(f"{brand} {name} {size}")
        if not query:
            return []
        brand_n = norm(brand)
        words = {w for w in norm(name).split() if len(w) > 2 and w != brand_n}

        shortlist = process.extract(query, self.keys, scorer=fuzz.token_set_ratio, limit=SHORTLIST)
        scored: list[Match] = []
        for key, score, idx in shortlist:
            if len(brand_n) > 2 and fuzz.partial_ratio(brand_n, key) < 85:
                score = min(score, 50)  # a different brand is never a strong match
            if words:
                present = sum(any(fuzz.ratio(w, k) >= 85 for k in key.split()) for w in words)
                score *= 0.5 + 0.5 * present / len(words)
            if not brand_n:
                # No readable brand: can be offered as an alternative, never auto-accepted
                score = min(score, STRONG - 1)
            scored.append(Match(self.products[idx], float(score)))
        scored.sort(key=lambda m: -m.score)
        return scored[:limit]


def classify(matches: list[Match]) -> tuple[Match | None, list[Match], bool]:
    """Return (suggested match, alternatives, needs_scan)."""
    if not matches or matches[0].score < WEAK:
        return None, [], True
    best = matches[0]
    alternatives = [m for m in matches[1:] if m.score >= WEAK]
    if best.score >= STRONG:
        return best, alternatives, False
    return None, [best, *alternatives], True
