"""Add group buying tables and link orders to them.

Revision ID: 0006_group_buys
Revises: 0005_supplier_procurement
Create Date: 2026-10-11
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0006_group_buys"
down_revision = "0005_supplier_procurement"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "group_buy",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("supplier_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("pack_size", sa.Integer(), nullable=False),
        sa.Column("base_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("tiers", postgresql.JSONB(), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(16), server_default=sa.text("'open'"), nullable=False),
        sa.Column("final_price", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('open', 'confirmed', 'failed')", name="ck_group_buy_status"),
        sa.CheckConstraint("pack_size > 0", name="ck_group_buy_pack_size_positive"),
        sa.ForeignKeyConstraint(
            ["supplier_id"], ["supplier.id"], ondelete="RESTRICT", name="fk_group_buy_supplier"
        ),
        sa.ForeignKeyConstraint(
            ["product_id"], ["product.id"], ondelete="RESTRICT", name="fk_group_buy_product"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_group_buy"),
    )
    op.create_index("ix_group_buy_status_deadline", "group_buy", ["status", "deadline"])
    op.create_index("ix_group_buy_supplier", "group_buy", ["supplier_id"])

    op.create_table(
        "group_buy_member",
        sa.Column("group_buy_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("shop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("packs", sa.Integer(), nullable=False),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("packs > 0", name="ck_group_buy_member_packs_positive"),
        sa.ForeignKeyConstraint(
            ["group_buy_id"], ["group_buy.id"], ondelete="CASCADE", name="fk_gbm_group_buy"
        ),
        sa.ForeignKeyConstraint(
            ["shop_id"], ["shop.id"], ondelete="RESTRICT", name="fk_gbm_shop"
        ),
        sa.PrimaryKeyConstraint("group_buy_id", "shop_id", name="pk_group_buy_member"),
    )
    op.create_index("ix_group_buy_member_shop", "group_buy_member", ["shop_id"])

    op.create_foreign_key(
        "fk_order_group_buy", "order", "group_buy", ["group_buy_id"], ["id"], ondelete="RESTRICT"
    )


def downgrade() -> None:
    op.drop_constraint("fk_order_group_buy", "order", type_="foreignkey")
    op.drop_table("group_buy_member")
    op.drop_table("group_buy")
