"""Add supplier identity profile for role-aware authentication.

Revision ID: 0003_supplier_profile
Revises: 0002_unique_shop_phone
Create Date: 2026-10-11
"""

import geoalchemy2
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0003_supplier_profile"
down_revision = "0002_unique_shop_phone"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "supplier",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("contact_name", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column(
            "location",
            geoalchemy2.types.Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column(
            "delivery_radius_m", sa.Integer(), server_default=sa.text("10000"), nullable=False
        ),
        sa.Column("gstin", sa.String(length=32), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("phone", name="uq_supplier_phone"),
    )
    op.create_index(
        "ix_supplier_location_gist", "supplier", ["location"], postgresql_using="gist"
    )


def downgrade() -> None:
    op.drop_index("ix_supplier_location_gist", table_name="supplier")
    op.drop_table("supplier")
