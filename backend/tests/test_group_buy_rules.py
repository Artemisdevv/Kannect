from decimal import Decimal

import pytest

from app.models.group_buy import GroupBuy
from app.services.group_buys import best_tier, current_price, next_tier, normalise_tiers

TIERS = [{"min_packs": 20, "price": 95.0}, {"min_packs": 50, "price": 90.0}]


def test_normalise_sorts_and_validates():
    out = normalise_tiers([{"min_packs": 50, "price": 90}, {"min_packs": 20, "price": 95}])
    assert out == TIERS


@pytest.mark.parametrize(
    "tiers",
    [
        [],
        [{"min_packs": 0, "price": 10}],
        [{"min_packs": 5, "price": 0}],
        [{"min_packs": 10, "price": 90}, {"min_packs": 10, "price": 80}],  # same quantity
        [{"min_packs": 10, "price": 90}, {"min_packs": 20, "price": 95}],  # dearer at more packs
        [{"min_packs": 10, "price": 90}, {"min_packs": 20, "price": 90}],  # no saving
    ],
)
def test_normalise_rejects_bad_tiers(tiers):
    with pytest.raises(ValueError):
        normalise_tiers(tiers)


def test_best_and_next_tier():
    assert best_tier(TIERS, 19) is None
    assert best_tier(TIERS, 20)["price"] == 95.0
    assert best_tier(TIERS, 49)["price"] == 95.0
    assert best_tier(TIERS, 50)["price"] == 90.0
    assert best_tier(TIERS, 500)["price"] == 90.0
    assert next_tier(TIERS, 0) == {"min_packs": 20, "price": 95.0, "packs_needed": 20}
    assert next_tier(TIERS, 20)["packs_needed"] == 30
    assert next_tier(TIERS, 50) is None


def test_current_price_falls_back_to_the_regular_price():
    gb = GroupBuy(tiers=TIERS, base_price=Decimal("100.00"))
    assert current_price(gb, 3) == 100.0  # no tier reached yet: regular price
    assert current_price(gb, 20) == 95.0
    assert current_price(gb, 60) == 90.0
