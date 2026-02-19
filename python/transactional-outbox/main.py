import os
import time
from pathlib import Path

import sqlalchemy as sa
import uvicorn
from dbos import DBOS, DBOSConfig
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI()

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
    sa.Column(
        "notification_status", sa.String(50), nullable=False, server_default="PENDING"
    ),
    sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
)

ORDER_ID_EVENT = "order_id_event"


@DBOS.transaction()
def create_orders_table() -> None:
    """Ensure the orders table exists."""
    DBOS.sql_session.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS orders (
                order_id            SERIAL PRIMARY KEY,
                customer            VARCHAR(255) NOT NULL,
                item                VARCHAR(255) NOT NULL,
                quantity            INTEGER      NOT NULL,
                notification_status VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
                created_at          TIMESTAMP    DEFAULT NOW()
            )
            """))


# ---------------------------------------------------------------------------
# Database operations
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


@DBOS.transaction()
def update_notification_status(order_id: int, status: str) -> None:
    """Mark an order's notification as sent."""
    DBOS.sql_session.execute(
        orders.update()
        .where(orders.c.order_id == order_id)
        .values(notification_status=status)
    )


# ---------------------------------------------------------------------------
# External side-effects
# ---------------------------------------------------------------------------


@DBOS.step()
def send_order_notification(order_id: int, customer: str, item: str) -> None:
    """Simulate sending an order confirmation (e.g. email, Kafka, webhook).

    In the classic pattern a background poller would read the outbox and call
    this.  With DBOS the workflow calls it directly, and the step decorator
    guarantees it runs exactly once.
    """
    DBOS.logger.info(
        f"Sending notification for order {order_id}: {item} for {customer}"
    )
    time.sleep(3)  # simulate network latency
    DBOS.logger.info(f"Notification sent for order {order_id}: {item} for {customer}")


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
    DBOS.set_event(ORDER_ID_EVENT, order_id)
    send_order_notification(order_id, customer, item)
    update_notification_status(order_id, "SENT")


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------


class OrderRequest(BaseModel):
    customer: str
    item: str
    quantity: int


@app.post("/orders")
def create_order(request: OrderRequest):
    handle = DBOS.start_workflow(
        place_order_workflow, request.customer, request.item, request.quantity
    )
    order_id = DBOS.get_event(handle.workflow_id, ORDER_ID_EVENT)
    return {"order_id": order_id}


@app.get("/orders")
@DBOS.transaction()
def list_orders() -> list[dict]:
    """Return all orders, newest first."""
    rows = (
        DBOS.sql_session.execute(orders.select().order_by(orders.c.order_id.desc()))
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


@app.get("/")
def index():
    html = (Path(__file__).parent / "static" / "index.html").read_text()
    return HTMLResponse(html)


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

    create_orders_table()

    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
