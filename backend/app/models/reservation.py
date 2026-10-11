"""Pickup reservations: a shopper asks a shop to set items aside. No payment, no delivery."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

ID_TYPE = UUID(as_uuid=True)
MONEY_TYPE = Numeric(10, 2)

# requested -> accepted -> collected, or declined / cancelled at any point before collection.
# "expired" is not stored: an accepted reservation past hold_until is reported as expired.
RESERVATION_STATUSES = ("requested", "accepted", "declined", "cancelled", "collected")


class Reservation(Base):
    __tablename__ = "reservation"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("shop.id", ondelete="RESTRICT"), nullable=False
    )
    client_id: Mapped[uuid.UUID] = mapped_column(ID_TYPE, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(80), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(16), nullable=False)
    note: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(
        String(12), nullable=False, server_default=text("'requested'")
    )
    decline_reason: Mapped[str | None] = mapped_column(String(200))
    # Secret the shopper's device keeps to look at / cancel this reservation (no shopper account)
    access_token: Mapped[str] = mapped_column(String(64), nullable=False)
    total: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    hold_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collected_bill_id: Mapped[uuid.UUID | None] = mapped_column(
        ID_TYPE, ForeignKey("bill.id", ondelete="SET NULL")
    )

    lines: Mapped[list["ReservationLine"]] = relationship(
        back_populates="reservation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ReservationLine.position",
    )

    __table_args__ = (
        UniqueConstraint("shop_id", "client_id", name="uq_reservation_shop_client"),
        CheckConstraint(
            "status IN ('requested', 'accepted', 'declined', 'cancelled', 'collected')",
            name="ck_reservation_status",
        ),
        Index("ix_reservation_shop_status", "shop_id", "status", "created_at"),
        Index("ix_reservation_phone", "customer_phone", "status"),
    )


class ReservationLine(Base):
    __tablename__ = "reservation_line"

    reservation_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("reservation.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("product.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str] = mapped_column(String(8), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)  # base units: pieces or grams
    unit_price: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)

    reservation: Mapped[Reservation] = relationship(back_populates="lines")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_reservation_line_quantity_positive"),
        Index("ix_reservation_line_product", "product_id"),
    )
