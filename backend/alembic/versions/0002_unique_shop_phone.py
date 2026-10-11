"""Require one shop per owner phone.

Revision ID: 0002_unique_shop_phone
Revises: 0001_core_domain
Create Date: 2026-10-11
"""

from alembic import op

revision = "0002_unique_shop_phone"
down_revision = "0001_core_domain"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_shop_phone", "shop", ["phone"])


def downgrade() -> None:
    op.drop_constraint("uq_shop_phone", "shop", type_="unique")
