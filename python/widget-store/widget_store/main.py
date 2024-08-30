# Widget Store

# This app uses DBOS to deploy an online storefront that's resilient to any failure.
# The focus of this app is on the checkout workflow that manages order status,
# product inventory, and payment.

# First, let's do imports and create a DBOS app.

import os
from typing import Optional

from dbos import DBOS, SetWorkflowID
from fastapi import FastAPI, HTTPException, Response

from .frontend import frontend_router
from .schema import OrderStatus, order, orders, product, products

app = FastAPI()
app.include_router(frontend_router)

DBOS(app)

WIDGET_ID = 1
PAYMENT_STATUS = "payment_status"
PAYMENT_ID = "payment_id"
ORDER_URL = "order_url"

# Next, let's write the checkout workflow.
# This workflow is triggered whenever a customer buys a widget.
# It creates a new order, then reserves inventory, then processes payment,
# then marks the order as paid. If any step fails, it backs out,
# returning reserved inventory and marking the order as cancelled.

# DBOS makes this workflow reliable: each of its steps executes exactly-once and
# if it's ever interrupted, it automatically resumes from where it left off.
# You can try this yourself--start an order and press the crash button at any time.
# Within seconds, your app will recover to exactly the state it was in before the crash
# and continue as if nothing happened.


@DBOS.workflow()
def checkout_workflow():
    order_id = create_order()
    inventory_reserved = reserve_inventory()
    if not inventory_reserved:
        DBOS.logger.error(f"Failed to reserve inventory for order {order_id}")
        update_order_status(order_id=order_id, status=OrderStatus.CANCELLED.value)
        DBOS.set_event(PAYMENT_ID, None)
        return
    DBOS.set_event(PAYMENT_ID, DBOS.workflow_id)
    payment_status = DBOS.recv(PAYMENT_STATUS)
    if payment_status is not None and payment_status == "paid":
        DBOS.logger.info(f"Payment successful for order {order_id}")
        update_order_status(order_id=order_id, status=OrderStatus.PAID.value)
    else:
        DBOS.logger.warn(f"Payment failed for order {order_id}")
        undo_reserve_inventory()
        update_order_status(order_id=order_id, status=OrderStatus.CANCELLED.value)
    DBOS.set_event(ORDER_URL, str(order_id))


# Next, let's use FastAPI to write the HTTP endpoints for checkout.

# This endpoint receives a request when a customer presses the "Buy Now" button.
# It starts the checkout workflow in the background, then waits for the workflow
# to generate and send it a unique payment ID. It then returns the payment ID
# so the browser can redirect the customer to the payments page.

# The request takes in an idempotency key so that even if the customer presses
# "buy now" multiple times, only one checkout workflow is started.


@app.post("/checkout/{idempotency_key}")
def checkout_endpoint(idempotency_key: str) -> Response:
    with SetWorkflowID(idempotency_key):
        handle = DBOS.start_workflow(checkout_workflow)
    payment_id = DBOS.get_event(handle.workflow_id, PAYMENT_ID)
    if payment_id is None:
        raise HTTPException(status_code=404, detail="Checkout failed to start")
    return Response(payment_id)


# This is the HTTP endpoint for payments. It uses the payment ID to signal
# the checkout workflow whether the payment succeeded or failed.


@app.post("/payment_webhook/{payment_id}/{payment_status}")
def payment_endpoint(payment_id: str, payment_status: str) -> Response:
    DBOS.send(payment_id, payment_status, PAYMENT_STATUS)
    order_url = DBOS.get_event(payment_id, ORDER_URL)
    if order_url is None:
        raise HTTPException(status_code=404, detail="Payment failed to process")
    return Response(order_url)


# This is the crash endpoint. It crashes your app. For demonstration purposes only. :)


@app.post("/crash_application")
def crash_application():
    os._exit(1)


# Finally, let's write our database operations. Each of these functions performs a simple
# CRUD operation. We apply the @DBOS.transaction() decorator to each of them to give them
# access to a SQLAlchemy database connection.


@DBOS.transaction()
def reserve_inventory() -> bool:
    rows_affected = DBOS.sql_session.execute(
        products.update()
        .where(products.c.product_id == WIDGET_ID)
        .where(products.c.inventory > 0)
        .values(inventory=products.c.inventory - 1)
    ).rowcount
    return rows_affected > 0


@DBOS.transaction()
def undo_reserve_inventory() -> None:
    DBOS.sql_session.execute(
        products.update()
        .where(products.c.product_id == WIDGET_ID)
        .values(inventory=products.c.inventory + 1)
    )


@DBOS.transaction()
def create_order() -> int:
    result = DBOS.sql_session.execute(
        orders.insert().values(order_status=OrderStatus.PENDING.value)
    )
    return result.inserted_primary_key[0]


@app.get("/order/{order_id}")
@DBOS.transaction()
def get_order(order_id: str) -> Optional[order]:
    row = DBOS.sql_session.execute(
        orders.select().where(orders.c.order_id == order_id)
    ).fetchone()
    if row is None:
        return None
    return order(
        order_id=row.order_id,
        order_status=row.order_status,
        last_update_time=row.last_update_time,
    )


@DBOS.transaction()
def update_order_status(order_id: str, status: int) -> None:
    DBOS.sql_session.execute(
        orders.update().where(orders.c.order_id == order_id).values(order_status=status)
    )


@app.get("/product")
@DBOS.transaction()
def get_product() -> product:
    row = DBOS.sql_session.execute(products.select()).fetchone()
    return product(
        product_id=row.product_id,
        product=row.product,
        description=row.description,
        inventory=row.inventory,
        price=row.price,
    )


@app.get("/orders")
@DBOS.transaction()
def get_orders():
    rows = DBOS.sql_session.execute(orders.select())
    return [dict(row) for row in rows.mappings()]


@app.post("/restock")
@DBOS.transaction()
def restock():
    DBOS.sql_session.execute(products.update().values(inventory=100))


@DBOS.scheduled("* * * * * *")
@DBOS.transaction()
def update_order_progress(scheduled_time, actual_time):
    DBOS.sql_session.execute(
        orders.update()
        .where(orders.c.order_status == OrderStatus.PAID.value)
        .values(progress_remaining=orders.c.progress_remaining - 1)
    )
    DBOS.sql_session.execute(
        orders.update()
        .where(orders.c.progress_remaining == 0)
        .values(order_status=OrderStatus.DISPATCHED.value)
    )


# To deploy this app to the cloud, run `dbos-cloud app deploy`.
# Visit its URL to see it in action!
