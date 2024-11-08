from enum import Enum

import sqlalchemy as sa

metadata = sa.MetaData()

chat_history = sa.Table(
    "chat_history",
    metadata,
    sa.Column("message_id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("message_json", sa.String, nullable=False),
    sa.Column(
        "created_at",
        sa.BigInteger,
        nullable=False,
        server_default=sa.text("(EXTRACT(epoch FROM now()) * 1000::numeric)::bigint"),
    ),
)

purchases = sa.Table(
    "purchases",
    metadata,
    sa.Column("order_id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("item", sa.String, nullable=False),
    sa.Column("order_date", sa.String, nullable=False),
    sa.Column("price", sa.DECIMAL(10, 2), nullable=False),
    sa.Column("order_status", sa.String, nullable=False),
)


class OrderStatus(Enum):
    PURCHASED = "PURCHASED"
    PENDING_REFUND = "PENDING_REFUND"
    REFUNDED = "REFUNDED"
