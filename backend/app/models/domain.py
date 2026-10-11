"""Core KadaNet persistence models."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    event,
    text,
)
from sqlalchemy.orm import Mapped, Mapper, mapped_column, relationship

from app.db import Base

ID_TYPE = Uuid(as_uuid=True)
MONEY_TYPE = Numeric(10, 2)


class Shop(Base):
    __tablename__ = "shop"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str | None] = mapped_column(String(255))
    owner_name: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[str | None] = mapped_column(Text)
    location: Mapped[Any | None] = mapped_column(Geometry("POINT", srid=4326, spatial_index=False))
    language: Mapped[str] = mapped_column(String(8), nullable=False, server_default="ml")
    shop_type: Mapped[str | None] = mapped_column(String(32))

    products: Mapped[list[ShopProduct]] = relationship(back_populates="shop")
    bills: Mapped[list[Bill]] = relationship(back_populates="shop")
    supplier_orders: Mapped[list[SupplierOrder]] = relationship(back_populates="shop")

    __table_args__ = (
        UniqueConstraint("phone", name="uq_shop_phone"),
        CheckConstraint("language IN ('ml', 'en')", name="ck_shop_language"),
        CheckConstraint(
            "shop_type IS NULL OR shop_type IN "
            "('grocery', 'provision', 'vegetable', 'stationery', 'bakery', 'general')",
            name="ck_shop_type",
        ),
        Index("ix_shop_location_gist", "location", postgresql_using="gist"),
    )


class OwnerIdentity(Base):
    """Persist the selected application role before a profile is created."""

    __tablename__ = "owner_identity"

    phone: Mapped[str] = mapped_column(String(32), primary_key=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)

    __table_args__ = (
        CheckConstraint("role IN ('retailer', 'supplier')", name="ck_owner_identity_role"),
    )


class Supplier(Base):
    __tablename__ = "supplier"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str | None] = mapped_column(String(255))
    contact_name: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[str | None] = mapped_column(Text)
    location: Mapped[Any | None] = mapped_column(Geometry("POINT", srid=4326, spatial_index=False))
    delivery_radius_m: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("10000")
    )
    gstin: Mapped[str | None] = mapped_column(String(32))

    products: Mapped[list[SupplierProduct]] = relationship(back_populates="supplier")
    orders: Mapped[list[SupplierOrder]] = relationship(back_populates="supplier")

    __table_args__ = (
        UniqueConstraint("phone", name="uq_supplier_phone"),
        Index("ix_supplier_location_gist", "location", postgresql_using="gist"),
    )


class Product(Base):
    __tablename__ = "product"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    barcode: Mapped[str | None] = mapped_column(String(128), unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    name_ml: Mapped[str | None] = mapped_column(String(255))
    brand: Mapped[str | None] = mapped_column(String(255))
    size: Mapped[str | None] = mapped_column(String(128))
    category: Mapped[str | None] = mapped_column(String(128))
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    image_url: Mapped[str | None] = mapped_column(Text)
    mrp: Mapped[Decimal | None] = mapped_column(MONEY_TYPE)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    merged_into_id: Mapped[uuid.UUID | None] = mapped_column(
        ID_TYPE, ForeignKey("product.id", ondelete="RESTRICT")
    )

    merged_into: Mapped[Product | None] = relationship(
        remote_side="Product.id", back_populates="merged_products"
    )
    merged_products: Mapped[list[Product]] = relationship(back_populates="merged_into")
    shop_products: Mapped[list[ShopProduct]] = relationship(back_populates="product")
    bill_lines: Mapped[list[BillLine]] = relationship(back_populates="product")
    supplier_products: Mapped[list[SupplierProduct]] = relationship(back_populates="product")
    order_lines: Mapped[list[OrderLine]] = relationship(back_populates="product")

    __table_args__ = (
        CheckConstraint("unit IN ('piece', 'gram')", name="ck_product_unit"),
        CheckConstraint(
            "merged_into_id IS NULL OR merged_into_id <> id", name="ck_product_not_self_merged"
        ),
        Index("ix_product_name", "name"),
        Index("ix_product_active", "is_active"),
    )


class StarterPackItem(Base):
    __tablename__ = "starter_pack_item"

    shop_type: Mapped[str] = mapped_column(String(32), primary_key=True)
    product_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE,
        ForeignKey("product.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "shop_type IN ('grocery', 'provision', 'vegetable', 'stationery', 'bakery', 'general')",
            name="ck_starter_pack_shop_type",
        ),
        CheckConstraint("position >= 0", name="ck_starter_pack_position_nonnegative"),
        UniqueConstraint("shop_type", "position", name="uq_starter_pack_type_position"),
    )


class ShopProduct(Base):
    __tablename__ = "shop_product"

    shop_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("shop.id", ondelete="CASCADE"), primary_key=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("product.id", ondelete="RESTRICT"), primary_key=True
    )
    price: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    cost_price: Mapped[Decimal | None] = mapped_column(MONEY_TYPE)
    low_threshold: Mapped[int] = mapped_column(Integer, nullable=False)
    needs_recount: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    shop: Mapped[Shop] = relationship(back_populates="products")
    product: Mapped[Product] = relationship(back_populates="shop_products")
    stock_events: Mapped[list[StockEvent]] = relationship(back_populates="shop_product")

    __table_args__ = (
        CheckConstraint("low_threshold >= 0", name="ck_shop_product_threshold_nonnegative"),
        Index("ix_shop_product_product_id", "product_id"),
    )


class StockEvent(Base):
    __tablename__ = "stock_event"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(ID_TYPE, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ID_TYPE, nullable=False)
    client_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    count_source: Mapped[str | None] = mapped_column(String(24))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    shop_product: Mapped[ShopProduct] = relationship(back_populates="stock_events")

    __table_args__ = (
        ForeignKeyConstraint(
            ["shop_id", "product_id"],
            ["shop_product.shop_id", "shop_product.product_id"],
            ondelete="RESTRICT",
            name="fk_stock_event_shop_product",
        ),
        UniqueConstraint("shop_id", "client_id", name="uq_stock_event_shop_client"),
        CheckConstraint("type IN ('restock', 'correction', 'sale')", name="ck_stock_event_type"),
        CheckConstraint(
            "count_source IS NULL OR count_source IN "
            "('owner_exact', 'photo_estimate', 'level_guess')",
            name="ck_stock_event_count_source",
        ),
        Index("ix_stock_event_shop_product_created", "shop_id", "product_id", "created_at"),
    )


class Bill(Base):
    __tablename__ = "bill"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("shop.id", ondelete="RESTRICT"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    total: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    payment_mode: Mapped[str] = mapped_column(String(16), nullable=False)
    customer_contact: Mapped[str | None] = mapped_column(String(64))

    shop: Mapped[Shop] = relationship(back_populates="bills")
    items: Mapped[list[BillLine]] = relationship(
        back_populates="bill",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="BillLine.position",
    )

    __table_args__ = (
        UniqueConstraint("shop_id", "client_id", name="uq_bill_shop_client"),
        CheckConstraint(
            "payment_mode IN ('cash', 'upi', 'card', 'other')", name="ck_bill_payment_mode"
        ),
        Index("ix_bill_shop_created", "shop_id", "created_at"),
    )


class BillLine(Base):
    __tablename__ = "bill_line"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    bill_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("bill.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("product.id", ondelete="RESTRICT"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)

    bill: Mapped[Bill] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(back_populates="bill_lines")

    __table_args__ = (
        UniqueConstraint("bill_id", "position", name="uq_bill_line_position"),
        CheckConstraint("position >= 0", name="ck_bill_line_position_nonnegative"),
        CheckConstraint("unit IN ('piece', 'gram')", name="ck_bill_line_unit"),
        Index("ix_bill_line_product_id", "product_id"),
    )


class SupplierProduct(Base):
    __tablename__ = "supplier_product"

    supplier_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("supplier.id", ondelete="CASCADE"), primary_key=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("product.id", ondelete="RESTRICT"), primary_key=True
    )
    price: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    pack_size: Mapped[int] = mapped_column(Integer, nullable=False)
    min_order_packs: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    available: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    supplier: Mapped[Supplier] = relationship(back_populates="products")
    product: Mapped[Product] = relationship(back_populates="supplier_products")

    __table_args__ = (
        CheckConstraint("pack_size > 0", name="ck_supplier_product_pack_size_positive"),
        CheckConstraint("min_order_packs > 0", name="ck_supplier_product_min_order_positive"),
        Index("ix_supplier_product_product_id", "product_id"),
    )


class SupplierOrder(Base):
    __tablename__ = "order"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("shop.id", ondelete="RESTRICT"), nullable=False
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("supplier.id", ondelete="RESTRICT"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'placed'"))
    total: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    group_buy_id: Mapped[uuid.UUID | None] = mapped_column(ID_TYPE)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    shop: Mapped[Shop] = relationship(back_populates="supplier_orders")
    supplier: Mapped[Supplier] = relationship(back_populates="orders")
    items: Mapped[list[OrderLine]] = relationship(
        back_populates="order", order_by="OrderLine.position"
    )
    tracking: Mapped[list[OrderTracking]] = relationship(
        back_populates="order", order_by="OrderTracking.at"
    )
    invoice: Mapped[Invoice | None] = relationship(back_populates="order", uselist=False)

    __table_args__ = (
        UniqueConstraint("shop_id", "client_id", name="uq_order_shop_client"),
        CheckConstraint(
            "status IN ('placed', 'accepted', 'rejected', 'dispatched', 'delivered', 'cancelled')",
            name="ck_order_status",
        ),
        Index("ix_order_shop_created", "shop_id", "created_at"),
        Index("ix_order_supplier_created", "supplier_id", "created_at"),
    )


class OrderLine(Base):
    __tablename__ = "order_line"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("order.id", ondelete="RESTRICT"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("product.id", ondelete="RESTRICT"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    packs: Mapped[int] = mapped_column(Integer, nullable=False)
    pack_size: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)

    order: Mapped[SupplierOrder] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(back_populates="order_lines")

    __table_args__ = (
        UniqueConstraint("order_id", "position", name="uq_order_line_position"),
        CheckConstraint("position >= 0", name="ck_order_line_position_nonnegative"),
        CheckConstraint("packs > 0", name="ck_order_line_packs_positive"),
        CheckConstraint("pack_size > 0", name="ck_order_line_pack_size_positive"),
        Index("ix_order_line_product_id", "product_id"),
    )


class OrderTracking(Base):
    __tablename__ = "order_tracking"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("order.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    note: Mapped[str | None] = mapped_column(Text)
    eta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[SupplierOrder] = relationship(back_populates="tracking")

    __table_args__ = (
        CheckConstraint(
            "status IN ('placed', 'accepted', 'rejected', 'dispatched', 'delivered', 'cancelled')",
            name="ck_order_tracking_status",
        ),
        Index("ix_order_tracking_order_at", "order_id", "at"),
    )


class Invoice(Base):
    __tablename__ = "invoice"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("order.id", ondelete="RESTRICT"), nullable=False
    )
    number: Mapped[str] = mapped_column(String(64), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    subtotal: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    gst: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    total: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'unpaid'"))

    order: Mapped[SupplierOrder] = relationship(back_populates="invoice")

    __table_args__ = (
        UniqueConstraint("order_id", name="uq_invoice_order"),
        UniqueConstraint("number", name="uq_invoice_number"),
        CheckConstraint("status IN ('unpaid', 'paid')", name="ck_invoice_status"),
    )


@event.listens_for(Product, "before_delete")
def _prevent_product_hard_delete(mapper: Mapper[Product], connection: Any, target: Product) -> None:
    """Catalogue entries are retired with is_active; they are never ORM-deleted."""
    raise ValueError("Products must be soft-deleted by setting is_active=False")
