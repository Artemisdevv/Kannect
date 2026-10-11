"""Shared stock-ledger calculations used by retailer and billing routes."""

from collections.abc import Iterable

from app.models import Product, ShopProduct, StockEvent

DEFAULT_LOW_THRESHOLDS = {"piece": 5, "gram": 1000}


def default_low_threshold(unit: str) -> int:
    """Return the documented unit-based low-stock threshold."""
    return DEFAULT_LOW_THRESHOLDS[unit]


def stock_quantity(events: Iterable[StockEvent]) -> int:
    """Return stock after the most recent absolute correction and later movements."""
    ordered = sorted(events, key=lambda event: (event.created_at, str(event.id)), reverse=True)
    movement = 0
    for event in ordered:
        if event.type == "correction":
            return event.quantity + movement
        if event.type == "restock":
            movement += event.quantity
        elif event.type == "sale":
            movement -= event.quantity
    return movement


def stock_status(quantity: int, low_threshold: int) -> str:
    if quantity <= 0:
        return "out"
    if quantity < low_threshold:
        return "low"
    return "in_stock"


def shop_product_payload(
    shop_product: ShopProduct, product: Product, quantity: int
) -> dict:
    product_data = {
        "id": str(product.id),
        "barcode": product.barcode,
        "name": product.name,
        "name_ml": product.name_ml,
        "brand": product.brand,
        "size": product.size,
        "category": product.category,
        "unit": product.unit,
        "image_url": product.image_url,
        "mrp": float(product.mrp) if product.mrp is not None else None,
        "is_active": product.is_active,
    }
    return {
        "product": product_data,
        "price": float(shop_product.price),
        "cost_price": (
            float(shop_product.cost_price) if shop_product.cost_price is not None else None
        ),
        "stock_qty": quantity,
        "low_threshold": shop_product.low_threshold,
        "stock_status": stock_status(quantity, shop_product.low_threshold),
        "needs_recount": shop_product.needs_recount,
        "pinned": shop_product.pinned,
    }
