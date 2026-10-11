import uuid

import pytest
from pydantic import ValidationError

from app.routers.recount import RecountItem, decide


def item(**kw):
    base = {"client_id": uuid.uuid4(), "product_id": uuid.uuid4()}
    return RecountItem(**{**base, **kw})


def test_exact_quantity_always_applies():
    assert decide(40, 5, item(quantity=12)) == (12, None)
    assert decide(0, 5, item(quantity=0)) == (0, None)


def test_estimate_in_same_band_changes_nothing():
    # system 40 (in_stock), photo says plenty (25): same band, keep the exact count
    assert decide(40, 5, item(stock_level="plenty", count_source="photo_estimate")) == (
        40, "unchanged"
    )  # fmt: skip


def test_estimate_that_disagrees_applies():
    # system says 40 but the photo shows few: the shelf is nearly empty, correct it
    assert decide(40, 5, item(stock_level="few", count_source="photo_estimate")) == (3, None)
    assert decide(40, 5, item(stock_level="none", count_source="photo_estimate")) == (0, None)


def test_estimate_when_system_says_out_but_photo_sees_stock():
    assert decide(0, 5, item(stock_level="some", count_source="photo_estimate")) == (10, None)


@pytest.mark.parametrize(
    "kw",
    [
        {},  # no figure
        {"quantity": 3, "stock_level": "few", "count_source": "owner_exact"},  # both
        {"stock_level": "unknown", "count_source": "photo_estimate"},
        {"quantity": 3, "count_source": "level_guess"},  # a count is never a level guess
        {"stock_level": "few", "count_source": "owner_exact"},  # estimate labelled exact
        {"quantity": -1},
    ],
)
def test_invalid_recount_items_are_rejected(kw):
    with pytest.raises(ValidationError):
        item(**kw)


def test_a_photo_count_the_owner_confirmed_applies_even_in_the_same_band():
    # the photo shows 8, the system says 40: both "in stock", but the owner chose the new number
    assert decide(40, 5, item(quantity=8, count_source="photo_estimate")) == (8, None)
