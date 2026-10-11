# ruff: noqa: E501
import pytest
from pydantic import ValidationError

from app.routers.shop import ShopProfileInput, ShopProfilePatch


def test_text_is_trimmed_and_spaces_collapsed():
    p = ShopProfileInput(name="  Adnan   Stores ", owner_name=" Muhammed  Adnan", address=" Palamukku,  Kannanalloor ")
    assert (p.name, p.owner_name, p.address) == ("Adnan Stores", "Muhammed Adnan", "Palamukku, Kannanalloor")


def test_blank_optional_text_becomes_not_given():
    p = ShopProfileInput(name="Shop", owner_name="   ", address="")
    assert p.owner_name is None and p.address is None


@pytest.mark.parametrize("name", ["A", " x "])
def test_name_must_have_two_characters(name):
    with pytest.raises(ValidationError):
        ShopProfileInput(name=name)


def test_blank_name_is_treated_as_not_given():
    assert ShopProfileInput(name="   ").name is None


def test_length_limits():
    with pytest.raises(ValidationError):
        ShopProfileInput(name="x" * 121)
    with pytest.raises(ValidationError):
        ShopProfileInput(name="Shop", address="x" * 501)


def test_patch_uses_the_same_rules():
    assert ShopProfilePatch(name=" Mart  One ").name == "Mart One"
    with pytest.raises(ValidationError):
        ShopProfilePatch(name="Q")
