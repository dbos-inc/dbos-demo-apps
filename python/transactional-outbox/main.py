import os
import time

import sqlalchemy as sa
from dbos import DBOS, DBOSConfig

# ---------------------------------------------------------------------------
# Table definition and creation
# ---------------------------------------------------------------------------
metadata = sa.MetaData()

orders = sa.Table(
    "orders",
    metadata,
    sa.Column("order_id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("customer", sa.String(255), nullable=False),
    sa.Column("item", sa.String(255), nullable=False),
    sa.Column("quantity", sa.Integer, nullable=False),
    sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
)


@DBOS.transaction()
def create_orders_table() -> None:
    """Ensure the orders table exists."""
    DBOS.sql_session.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS orders (
                order_id   SERIAL PRIMARY KEY,
                customer   VARCHAR(255) NOT NULL,
                item       VARCHAR(255) NOT NULL,
                quantity   INTEGER      NOT NULL,
                created_at TIMESTAMP    DEFAULT NOW()
            )
            """))


# ---------------------------------------------------------------------------
# Database update (replace the "write to outbox" half of the pattern)
# ---------------------------------------------------------------------------


@DBOS.transaction()
def insert_order(customer: str, item: str, quantity: int) -> int:
    """Insert an order and return its ID.

    In the classic outbox pattern you would also INSERT an outbox row here.
    With DBOS the workflow itself provides that guarantee, so no outbox table
    is needed.
    """
    result = DBOS.sql_session.execute(
        orders.insert().values(customer=customer, item=item, quantity=quantity)
    )
    order_id: int = result.inserted_primary_key[0]
    DBOS.logger.info(f"Inserted order {order_id}: {quantity}x {item} for {customer}")
    return order_id


# ---------------------------------------------------------------------------
# External side-effect (replace the "poller sends messages" half)
# ---------------------------------------------------------------------------


@DBOS.step()
def send_order_notification(order_id: int, customer: str, item: str) -> None:
    """Simulate sending an order confirmation (e.g. email, Kafka, webhook).

    In the classic pattern a background poller would read the outbox and call
    this.  With DBOS the workflow calls it directly, and the step decorator
    guarantees it runs exactly once.
    """
    print(f"  -> Sending notification for order {order_id}: {item} for {customer}")
    time.sleep(1)  # simulate network latency
    print(f"  -> Notification sent for order {order_id}")


# ---------------------------------------------------------------------------
# Workflow (replaces outbox table + poller + retry logic)
# ---------------------------------------------------------------------------


@DBOS.workflow()
def place_order_workflow(customer: str, item: str, quantity: int) -> int:
    """Place an order and send a notification, exactly once.

    If this process crashes after insert_order but before
    send_order_notification, DBOS will automatically recover and complete
    the notification on restart — no outbox polling required.
    """
    order_id = insert_order(customer, item, quantity)
    send_order_notification(order_id, customer, item)
    return order_id


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    config: DBOSConfig = {
        "name": "transactional-outbox",
        "application_database_url": os.environ.get("DBOS_DATABASE_URL"),
    }
    DBOS(config=config)
    DBOS.launch()

    # Ensure the orders table exists
    create_orders_table()

    # Place three demo orders
    demo_orders = [
        ("Alice", "Widget A", 2),
        ("Bob", "Widget B", 1),
        ("Carol", "Widget C", 5),
    ]

    print("\n=== Transactional Outbox Demo (powered by DBOS) ===\n")
    for customer, item, quantity in demo_orders:
        order_id = place_order_workflow(customer, item, quantity)
        print(f"  Order {order_id} completed.\n")

    print("All orders placed and notifications sent successfully.")


if __name__ == "__main__":
    main()
