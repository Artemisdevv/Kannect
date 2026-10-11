"""Add supplier catalogue, ordering, tracking and invoice persistence.

Revision ID: 0005_supplier_procurement
Revises: 0004_owner_identity_role
Create Date: 2026-10-11
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0005_supplier_procurement"
down_revision = "0004_owner_identity_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "supplier_product",
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("pack_size", sa.Integer(), nullable=False),
        sa.Column("min_order_packs", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("available", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.CheckConstraint("pack_size > 0", name="ck_supplier_product_pack_size_positive"),
        sa.CheckConstraint("min_order_packs > 0", name="ck_supplier_product_min_order_positive"),
        sa.ForeignKeyConstraint(
            ["supplier_id"],
            ["supplier.id"],
            ondelete="CASCADE",
            name="fk_supplier_product_supplier",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"], ["product.id"], ondelete="RESTRICT", name="fk_supplier_product_product"
        ),
        sa.PrimaryKeyConstraint("supplier_id", "product_id"),
    )
    op.create_index("ix_supplier_product_product_id", "supplier_product", ["product_id"])

    op.create_table(
        "order",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("shop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "status", sa.String(length=16), server_default=sa.text("'placed'"), nullable=False
        ),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
        sa.Column("group_buy_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('placed', 'accepted', 'rejected', 'dispatched', 'delivered', 'cancelled')",
            name="ck_order_status",
        ),
        sa.ForeignKeyConstraint(["shop_id"], ["shop.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["supplier_id"], ["supplier.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "client_id", name="uq_order_shop_client"),
    )
    op.create_index("ix_order_shop_created", "order", ["shop_id", "created_at"])
    op.create_index("ix_order_supplier_created", "order", ["supplier_id", "created_at"])

    op.create_table(
        "order_line",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("packs", sa.Integer(), nullable=False),
        sa.Column("pack_size", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(10, 2), nullable=False),
        sa.CheckConstraint("position >= 0", name="ck_order_line_position_nonnegative"),
        sa.CheckConstraint("packs > 0", name="ck_order_line_packs_positive"),
        sa.CheckConstraint("pack_size > 0", name="ck_order_line_pack_size_positive"),
        sa.ForeignKeyConstraint(["order_id"], ["order.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", "position", name="uq_order_line_position"),
    )
    op.create_index("ix_order_line_product_id", "order_line", ["product_id"])

    op.create_table(
        "order_tracking",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("eta", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('placed', 'accepted', 'rejected', 'dispatched', 'delivered', 'cancelled')",
            name="ck_order_tracking_status",
        ),
        sa.ForeignKeyConstraint(["order_id"], ["order.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_tracking_order_at", "order_tracking", ["order_id", "at"])

    op.create_table(
        "invoice",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("number", sa.String(length=64), nullable=False),
        sa.Column(
            "issued_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("subtotal", sa.Numeric(10, 2), nullable=False),
        sa.Column("gst", sa.Numeric(10, 2), nullable=False),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "status", sa.String(length=16), server_default=sa.text("'unpaid'"), nullable=False
        ),
        sa.CheckConstraint("status IN ('unpaid', 'paid')", name="ck_invoice_status"),
        sa.ForeignKeyConstraint(["order_id"], ["order.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("number", name="uq_invoice_number"),
        sa.UniqueConstraint("order_id", name="uq_invoice_order"),
    )

    # Explicit RLS keeps the new tables protected even where event triggers are unavailable.
    for table in ("supplier_product", "order", "order_line", "order_tracking", "invoice"):
        op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_table("invoice")
    op.drop_index("ix_order_tracking_order_at", table_name="order_tracking")
    op.drop_table("order_tracking")
    op.drop_index("ix_order_line_product_id", table_name="order_line")
    op.drop_table("order_line")
    op.drop_index("ix_order_supplier_created", table_name="order")
    op.drop_index("ix_order_shop_created", table_name="order")
    op.drop_table("order")
    op.drop_index("ix_supplier_product_product_id", table_name="supplier_product")
    op.drop_table("supplier_product")
