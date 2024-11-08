# Each time the app is re-deployed, reset the database.

from datetime import datetime, timedelta
from decimal import Decimal

from dbos import get_dbos_database_url
from sqlalchemy import create_engine, delete

from reliable_refunds import schema

base_date = datetime.now()

# Sample data
sample_purchases = [
    {
        "item": "Laptop Pro X1",
        "order_date": base_date.strftime("%Y-%m-%d"),
        "price": Decimal("1299.99"),
        "order_status": schema.OrderStatus.PURCHASED.value,
    },
    {
        "item": "Wireless Headphones",
        "order_date": (base_date - timedelta(days=1)).strftime("%Y-%m-%d"),
        "price": Decimal("89.99"),
        "order_status": schema.OrderStatus.PURCHASED.value,
    },
    {
        "item": "USB-C Cable Pack",
        "order_date": (base_date - timedelta(days=2)).strftime("%Y-%m-%-d"),
        "price": Decimal("24.99"),
        "order_status": schema.OrderStatus.PURCHASED.value,
    },
    {
        "item": "Smart Watch Series 5",
        "order_date": (base_date - timedelta(days=3)).strftime("%Y-%m-%d"),
        "price": Decimal("349.99"),
        "order_status": schema.OrderStatus.PURCHASED.value,
    },
    {
        "item": "Phone Case",
        "order_date": (base_date - timedelta(days=4)).strftime("%Y-%m-%d"),
        "price": Decimal("19.99"),
        "order_status": schema.OrderStatus.PURCHASED.value,
    },
]

engine = create_engine(get_dbos_database_url())

with engine.connect() as connection:
    # Delete chat history
    connection.execute(delete(schema.chat_history))
    connection.execute(delete(schema.purchases))

    # Create the insert statement
    insert_stmt = schema.purchases.insert().values(sample_purchases)
    connection.execute(insert_stmt)

    # Commit the transaction
    connection.commit()
