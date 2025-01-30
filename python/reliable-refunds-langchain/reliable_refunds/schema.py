from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Any, Dict

import sqlalchemy as sa

metadata = sa.MetaData()

purchases = sa.Table(
    "purchases",
    metadata,
    sa.Column("order_id", sa.Integer, primary_key=True),
    sa.Column("item", sa.String, nullable=False),
    sa.Column("order_date", sa.String, nullable=False),
    sa.Column("price", sa.DECIMAL(10, 2), nullable=False),
    sa.Column("order_status", sa.String, nullable=False),
)

class OrderStatus(Enum):
    PURCHASED = "PURCHASED"
    PENDING_REFUND = "PENDING_REFUND"
    REFUNDED = "REFUNDED"
    REFUND_REJECTED = "REFUND_REJECTED"


@dataclass
class Purchase:
    order_id: int
    item: str
    order_date: str
    price: Decimal
    order_status: OrderStatus

    @classmethod
    def from_row(cls, row) -> "Purchase":
        """Create a Purchase from a SQLAlchemy result row"""
        return cls(
            order_id=row.order_id,
            item=row.item,
            order_date=row.order_date,
            price=row.price,
            order_status=OrderStatus(row.order_status).value,
        )

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Purchase":
        """Create a Purchase from a dictionary"""
        return cls(
            order_id=int(data["order_id"]),
            item=str(data["item"]),
            order_date=str(data["order_date"]),
            price=Decimal(str(data["price"])),
            order_status=OrderStatus(data["order_status"]).value,
        )
