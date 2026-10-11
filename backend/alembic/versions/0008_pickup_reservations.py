"""Add pickup reservations (a shopper asks a shop to set items aside).

Revision ID: 0008_pickup_reservations
Revises: 0007_starter_pack_items
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0008_pickup_reservations"
down_revision = "0007_starter_pack_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reservation",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("shop_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_name", sa.String(80), nullable=False),
        sa.Column("customer_phone", sa.String(16), nullable=False),
        sa.Column("note", sa.String(300), nullable=True),
        sa.Column("status", sa.String(12), server_default=sa.text("'requested'"), nullable=False),
        sa.Column("decline_reason", sa.String(200), nullable=True),
        sa.Column("access_token", sa.String(64), nullable=False),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
        sa.Column("hold_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("collected_bill_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('requested', 'accepted', 'declined', 'cancelled', 'collected')",
            name="ck_reservation_status",
        ),
        sa.ForeignKeyConstraint(
            ["shop_id"], ["shop.id"], ondelete="RESTRICT", name="fk_reservation_shop"
        ),
        sa.ForeignKeyConstraint(
            ["collected_bill_id"], ["bill.id"], ondelete="SET NULL", name="fk_reservation_bill"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_reservation"),
        sa.UniqueConstraint("shop_id", "client_id", name="uq_reservation_shop_client"),
    )
    op.create_index(
        "ix_reservation_shop_status", "reservation", ["shop_id", "status", "created_at"]
    )
    op.create_index("ix_reservation_phone", "reservation", ["customer_phone", "status"])

    op.create_table(
        "reservation_line",
        sa.Column("reservation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("unit", sa.String(8), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(10, 2), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_reservation_line_quantity_positive"),
        sa.ForeignKeyConstraint(
            ["reservation_id"], ["reservation.id"], ondelete="CASCADE",
            name="fk_reservation_line_reservation",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"], ["product.id"], ondelete="RESTRICT", name="fk_reservation_line_product"
        ),
        sa.PrimaryKeyConstraint("reservation_id", "position", name="pk_reservation_line"),
    )
    op.create_index("ix_reservation_line_product", "reservation_line", ["product_id"])

    # The project keeps Row Level Security on every table with no policies (the API connects as a
    # privileged role). The event trigger from migration 0002 does this for new tables too.
    op.execute("ALTER TABLE reservation ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE reservation_line ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("reservation_line")
    op.drop_table("reservation")
