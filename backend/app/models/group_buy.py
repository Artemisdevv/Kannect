"""Group buying: shops pool packs of one supplier product to unlock lower price tiers."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

ID_TYPE = UUID(as_uuid=True)
MONEY_TYPE = Numeric(10, 2)


class GroupBuy(Base):
    __tablename__ = "group_buy"

    id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("supplier.id", ondelete="RESTRICT"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("product.id", ondelete="RESTRICT"), nullable=False
    )
    pack_size: Mapped[int] = mapped_column(Integer, nullable=False)
    # Regular price per pack when no tier is reached (the supplier's list price if it has one)
    base_price: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    # [{"min_packs": 20, "price": 95.0}, ...] sorted by min_packs ascending, price descending
    tiers: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'open'"))
    final_price: Mapped[Decimal | None] = mapped_column(MONEY_TYPE)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    members: Mapped[list["GroupBuyMember"]] = relationship(back_populates="group_buy")

    __table_args__ = (
        CheckConstraint("status IN ('open', 'confirmed', 'failed')", name="ck_group_buy_status"),
        CheckConstraint("pack_size > 0", name="ck_group_buy_pack_size_positive"),
        Index("ix_group_buy_status_deadline", "status", "deadline"),
        Index("ix_group_buy_supplier", "supplier_id"),
    )


class GroupBuyMember(Base):
    __tablename__ = "group_buy_member"

    group_buy_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("group_buy.id", ondelete="CASCADE"), primary_key=True
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        ID_TYPE, ForeignKey("shop.id", ondelete="RESTRICT"), primary_key=True
    )
    packs: Mapped[int] = mapped_column(Integer, nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    group_buy: Mapped[GroupBuy] = relationship(back_populates="members")

    __table_args__ = (
        CheckConstraint("packs > 0", name="ck_group_buy_member_packs_positive"),
        Index("ix_group_buy_member_shop", "shop_id"),
    )
