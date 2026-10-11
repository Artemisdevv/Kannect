"""Add ordered product membership for onboarding starter packs.

Revision ID: 0007_starter_pack_items
Revises: 0006_group_buys
Create Date: 2026-10-11
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0007_starter_pack_items"
down_revision = "0006_group_buys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "starter_pack_item",
        sa.Column("shop_type", sa.String(length=32), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "shop_type IN ('grocery', 'provision', 'vegetable', 'stationery', 'bakery', 'general')",
            name="ck_starter_pack_shop_type",
        ),
        sa.CheckConstraint("position >= 0", name="ck_starter_pack_position_nonnegative"),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("shop_type", "product_id"),
        sa.UniqueConstraint("shop_type", "position", name="uq_starter_pack_type_position"),
    )


def downgrade() -> None:
    op.drop_table("starter_pack_item")
