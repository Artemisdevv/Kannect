"""Create core shop, catalogue, inventory, stock and billing tables.

Revision ID: 0001_core_domain
Revises:
Create Date: 2026-10-11
"""

import geoalchemy2
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0001_core_domain"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "shop",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("owner_name", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column(
            "location",
            geoalchemy2.types.Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column("language", sa.String(length=8), server_default="ml", nullable=False),
        sa.Column("shop_type", sa.String(length=32), nullable=True),
        sa.CheckConstraint("language IN ('ml', 'en')", name="ck_shop_language"),
        sa.CheckConstraint(
            "shop_type IS NULL OR shop_type IN "
            "('grocery', 'provision', 'vegetable', 'stationery', 'bakery', 'general')",
            name="ck_shop_type",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_shop_location_gist", "shop", ["location"], postgresql_using="gist")

    op.create_table(
        "product",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("barcode", sa.String(length=128), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("name_ml", sa.String(length=255), nullable=True),
        sa.Column("brand", sa.String(length=255), nullable=True),
        sa.Column("size", sa.String(length=128), nullable=True),
        sa.Column("category", sa.String(length=128), nullable=True),
        sa.Column("unit", sa.String(length=16), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("mrp", sa.Numeric(10, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("merged_into_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.CheckConstraint("unit IN ('piece', 'gram')", name="ck_product_unit"),
        sa.CheckConstraint(
            "merged_into_id IS NULL OR merged_into_id <> id", name="ck_product_not_self_merged"
        ),
        sa.ForeignKeyConstraint(["merged_into_id"], ["product.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("barcode"),
    )
    op.create_index("ix_product_name", "product", ["name"])
    op.create_index("ix_product_active", "product", ["is_active"])

    op.create_table(
        "bill",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("shop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
        sa.Column("payment_mode", sa.String(length=16), nullable=False),
        sa.Column("customer_contact", sa.String(length=64), nullable=True),
        sa.CheckConstraint(
            "payment_mode IN ('cash', 'upi', 'card', 'other')", name="ck_bill_payment_mode"
        ),
        sa.ForeignKeyConstraint(["shop_id"], ["shop.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "client_id", name="uq_bill_shop_client"),
    )
    op.create_index("ix_bill_shop_created", "bill", ["shop_id", "created_at"])

    op.create_table(
        "shop_product",
        sa.Column("shop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("cost_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("low_threshold", sa.Integer(), nullable=False),
        sa.Column("needs_recount", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("pinned", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("low_threshold >= 0", name="ck_shop_product_threshold_nonnegative"),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["shop_id"], ["shop.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("shop_id", "product_id"),
    )
    op.create_index("ix_shop_product_product_id", "shop_product", ["product_id"])

    op.create_table(
        "bill_line",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("bill_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=16), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(10, 2), nullable=False),
        sa.CheckConstraint("position >= 0", name="ck_bill_line_position_nonnegative"),
        sa.CheckConstraint("unit IN ('piece', 'gram')", name="ck_bill_line_unit"),
        sa.ForeignKeyConstraint(["bill_id"], ["bill.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bill_id", "position", name="uq_bill_line_position"),
    )
    op.create_index("ix_bill_line_product_id", "bill_line", ["product_id"])

    op.create_table(
        "stock_event",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("shop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("count_source", sa.String(length=24), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("type IN ('restock', 'correction', 'sale')", name="ck_stock_event_type"),
        sa.CheckConstraint(
            "count_source IS NULL OR count_source IN "
            "('owner_exact', 'photo_estimate', 'level_guess')",
            name="ck_stock_event_count_source",
        ),
        sa.ForeignKeyConstraint(
            ["shop_id", "product_id"],
            ["shop_product.shop_id", "shop_product.product_id"],
            ondelete="RESTRICT",
            name="fk_stock_event_shop_product",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "client_id", name="uq_stock_event_shop_client"),
    )
    op.create_index(
        "ix_stock_event_shop_product_created",
        "stock_event",
        ["shop_id", "product_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_stock_event_shop_product_created", table_name="stock_event")
    op.drop_table("stock_event")
    op.drop_index("ix_bill_line_product_id", table_name="bill_line")
    op.drop_table("bill_line")
    op.drop_index("ix_shop_product_product_id", table_name="shop_product")
    op.drop_table("shop_product")
    op.drop_index("ix_bill_shop_created", table_name="bill")
    op.drop_table("bill")
    op.drop_index("ix_product_active", table_name="product")
    op.drop_index("ix_product_name", table_name="product")
    op.drop_table("product")
    op.drop_index("ix_shop_location_gist", table_name="shop")
    op.drop_table("shop")
