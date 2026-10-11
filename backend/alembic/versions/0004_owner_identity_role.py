"""Persist one selected application role per owner phone.

Revision ID: 0004_owner_identity_role
Revises: 0003_supplier_profile, 0003_enable_rls
Create Date: 2026-10-11
"""

import sqlalchemy as sa

from alembic import op

revision = "0004_owner_identity_role"
down_revision = ("0003_supplier_profile", "0003_enable_rls")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "owner_identity",
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.CheckConstraint("role IN ('retailer', 'supplier')", name="ck_owner_identity_role"),
        sa.PrimaryKeyConstraint("phone"),
    )


def downgrade() -> None:
    op.drop_table("owner_identity")
