from sqlalchemy import Column, MetaData, String, Table, Numeric, TIMESTAMP, func, UniqueConstraint

metadata = MetaData()

stock_prices = Table(
    "stock_prices",
    metadata,
    Column("stock_symbol", String(10), nullable=False),
    Column("stock_price", Numeric(10,2), nullable=False),
    Column("timestamp", TIMESTAMP, server_default=func.current_timestamp(), nullable=False),
)

alerts = Table(
    "alerts",
    metadata,
    Column("stock_symbol", String(10), nullable=False),
    Column("price_threshold", Numeric(10,2), nullable=False),
    Column("phone_number", String(20), nullable=False),
    Column("created_at", TIMESTAMP, server_default=func.current_timestamp(), nullable=False),
    UniqueConstraint("stock_symbol", name="unique_stock_symbol")
)
