from datetime import datetime
from decimal import Decimal
from enum import IntEnum
from typing import TypedDict

from sqlalchemy import DECIMAL, Column, DateTime, Integer, MetaData, String, Table, Text
from sqlalchemy.sql import func

metadata = MetaData()

products = Table(
    "products",
    metadata,
    Column("product_id", Integer, primary_key=True, autoincrement=True),
    Column("product", String(255), unique=True, nullable=False),
    Column("description", Text, nullable=False),
    Column("inventory", Integer, nullable=False),
    Column("price", DECIMAL(10, 2), nullable=False),
)

orders = Table(
    "orders",
    metadata,
    Column("order_id", Integer, primary_key=True, autoincrement=True),
    Column("order_status", Integer, nullable=False),
    Column("last_update_time", DateTime, nullable=False, server_default=func.now()),
    Column("progress_remaining", Integer, nullable=False, server_default="10"),
)


class product(TypedDict):
    product_id: int
    product: str
    description: str
    inventory: int
    price: Decimal


class order(TypedDict):
    order_id: int
    order_status: int
    last_update_time: datetime


class OrderStatus(IntEnum):
    CANCELLED = -1
    PENDING = 0
    DISPATCHED = 1
    PAID = 2
