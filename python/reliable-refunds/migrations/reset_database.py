# Each time the app is re-deployed, reset the database.

from datetime import datetime, timedelta
from decimal import Decimal
import json

from dbos import get_dbos_database_url
from sqlalchemy import create_engine, delete

from reliable_refunds import schema

base_date = datetime.now()

# Sample data
sample_purchases = [
    {
        "order_id": 1,
        "item": "Laptop Pro X1",
        "order_date": base_date.strftime("%Y-%m-%d"),
        "price": Decimal("1299.99"),
        "order_status": schema.OrderStatus.PURCHASED.value,
    },
    {
        "order_id": 2,
        "item": "Wireless Headphones",
        "order_date": (base_date - timedelta(days=1)).strftime("%Y-%m-%d"),
        "price": Decimal("89.99"),
        "order_status": schema.OrderStatus.PURCHASED.value,
    },
    {
        "order_id": 3,
        "item": "Samsung QLED 4K TV ",
        "order_date": (base_date - timedelta(days=2)).strftime("%Y-%m-%-d"),
        "price": Decimal("1199.99"),
        "order_status": schema.OrderStatus.PURCHASED.value,
    },
    {
        "order_id": 4,
        "item": "Smart Watch Series 5",
        "order_date": (base_date - timedelta(days=3)).strftime("%Y-%m-%d"),
        "price": Decimal("349.99"),
        "order_status": schema.OrderStatus.PURCHASED.value,
    },
    {
        "order_id": 5,
        "item": "Phone Case",
        "order_date": (base_date - timedelta(days=4)).strftime("%Y-%m-%d"),
        "price": Decimal("19.99"),
        "order_status": schema.OrderStatus.PURCHASED.value,
    },
]

# Initial chat message
initial_chat = {
    "role": "assistant",
    "content": "Hi there! Do you need help refunding an order?",
}

engine = create_engine(get_dbos_database_url())

with engine.connect() as connection:
    # Delete chat history
    connection.execute(delete(schema.chat_history))
    connection.execute(delete(schema.purchases))

    # Create the insert statement
    insert_stmt = schema.purchases.insert().values(sample_purchases)
    connection.execute(insert_stmt)

    # Insert the initial chat message
    insert_stmt = schema.chat_history.insert().values(
        message_json=json.dumps(initial_chat)
    )
    connection.execute(insert_stmt)

    # Commit the transaction
    connection.commit()
