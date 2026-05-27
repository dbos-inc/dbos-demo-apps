import json
import os
import time
from pathlib import Path

import sqlalchemy as sa
import uvicorn
from dbos import DBOS, DBOSConfig, SQLAlchemyDatasource
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI()

if os.environ.get("DBOS_DATABASE_URL") is None:
    raise Exception("DBOS_DATABASE_URL not provided")
ds = SQLAlchemyDatasource.create(os.environ.get("DBOS_DATABASE_URL"))

# Workflows enqueued from the order transaction run on this queue.
NOTIFICATION_QUEUE = "notification_queue"

# ---------------------------------------------------------------------------
# Table definition and creation
# ---------------------------------------------------------------------------
metadata = sa.MetaData()

orders = sa.Table(
    "orders",
    metadata,
    sa.Column("order_id", sa.Integer, primary_key=True, autoincrement=True),
    sa.Column("customer", sa.Text, nullable=False),
    sa.Column("item", sa.Text, nullable=False),
    sa.Column("quantity", sa.Integer, nullable=False),
    sa.Column("notification_status", sa.Text, nullable=False, server_default="PENDING"),
    sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
)


@ds.transaction()
def create_orders_table() -> None:
    """Ensure the orders table exists."""
    metadata.create_all(ds.sql_session().connection())


# ---------------------------------------------------------------------------
# Database operations
# ---------------------------------------------------------------------------


@ds.transaction()
def insert_order(customer: str, item: str, quantity: int) -> int:
    """Insert an order and transactionally enqueue its notification workflow.

    This is the classic transactional outbox: instead of writing to an outbox
    table that a poller scans, we call DBOS's `dbos.enqueue_workflow` PL/pgSQL
    function inside the SAME transaction that inserts the order. The order row
    and the enqueued workflow commit (or roll back) together, so the
    notification is durably scheduled if and only if the order is created.
    """
    session = ds.sql_session()
    result = session.execute(
        orders.insert().values(customer=customer, item=item, quantity=quantity)
    )
    order_id: int = result.inserted_primary_key[0]

    # Enqueue the notification workflow as part of this transaction. Arguments
    # must be supplied in JSON format (each positional argument is a JSON
    # value), so we json.dumps each one. The `AS json` cast is needed only
    # because psycopg sends bind parameters as an untyped value.
    session.execute(
        sa.text(
            """
            SELECT dbos.enqueue_workflow(
                workflow_name => :workflow_name,
                queue_name => :queue_name,
                positional_args => ARRAY[
                    CAST(:arg_order_id AS json),
                    CAST(:arg_customer AS json),
                    CAST(:arg_item AS json)
                ]
            )
            """
        ),
        {
            "workflow_name": "send_notification_workflow",
            "queue_name": NOTIFICATION_QUEUE,
            "arg_order_id": json.dumps(order_id),
            "arg_customer": json.dumps(customer),
            "arg_item": json.dumps(item),
        },
    )

    DBOS.logger.info(f"Inserted order {order_id}: {quantity}x {item} for {customer}")
    return order_id


@ds.transaction()
def update_notification_status(order_id: int, status: str) -> None:
    """Mark an order's notification as sent."""
    ds.sql_session().execute(
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
    this.  Here the enqueued workflow calls it directly and DBOS guarantees it
    will be retried until it succeeds.
    """
    DBOS.logger.info(
        f"Sending notification for order {order_id}: {item} for {customer}"
    )
    time.sleep(3)  # simulate network latency
    DBOS.logger.info(f"Notification sent for order {order_id}: {item} for {customer}")


# ---------------------------------------------------------------------------
# Workflow (the enqueued "consumer" of the outbox)
# ---------------------------------------------------------------------------


@DBOS.workflow()
def send_notification_workflow(order_id: int, customer: str, item: str) -> None:
    """Send a notification for an order, then mark it sent.

    Because this workflow was transactionally enqueued alongside the order,
    DBOS guarantees it runs exactly once for every committed order, recovering
    automatically if this process crashes partway through.
    """
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
    # The order is inserted and its notification workflow enqueued atomically.
    order_id = insert_order(request.customer, request.item, request.quantity)
    return {"order_id": order_id}


@app.get("/orders")
@ds.transaction()
def list_orders() -> list[dict]:
    """Return all orders, newest first."""
    rows = (
        ds.sql_session().execute(orders.select().order_by(orders.c.order_id.desc()))
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
        "system_database_url": os.environ.get("DBOS_DATABASE_URL"),
    }
    DBOS(config=config)
    DBOS.launch()

    DBOS.register_queue(NOTIFICATION_QUEUE)

    create_orders_table()

    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
