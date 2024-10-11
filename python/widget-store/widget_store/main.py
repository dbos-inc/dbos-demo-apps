# Widget Store

# This app uses DBOS to deploy an online storefront that's resilient to any failure.
# The focus of this app is on the checkout workflow, which durably manages order status,
# product inventory, and payment to ensure every checkout completes correctly.

# First, let's do imports and create a DBOS app.

import os

from dbos import DBOS, SetWorkflowID
from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import HTMLResponse

from .schema import OrderStatus, orders, products

app = FastAPI()

DBOS(fastapi=app)

WIDGET_ID = 1
PAYMENT_STATUS = "payment_status"
PAYMENT_ID = "payment_id"
ORDER_ID = "order_id"

# Next, let's write the checkout workflow.
# This workflow is triggered whenever a customer buys a widget.
# It creates a new order, then reserves inventory, then processes payment,
# then marks the order as paid. If any step fails, it backs out,
# returning reserved inventory and marking the order as cancelled.

# DBOS durably executes this workflow: each of its steps executes exactly-once and
# if it's ever interrupted, it automatically resumes from where it left off.
# You can try this yourself--start an order and press the crash button at any time.
# Within seconds, your app will recover to exactly the state it was in before the crash
# and continue as if nothing happened.


@DBOS.workflow()
def checkout_workflow():
    # Create a new order
    order_id = create_order()

    # Attempt to reserve inventory, cancelling the order if no inventory remains.
    inventory_reserved = reserve_inventory()
    if not inventory_reserved:
        DBOS.logger.error(f"Failed to reserve inventory for order {order_id}")
        update_order_status(order_id=order_id, status=OrderStatus.CANCELLED.value)
        DBOS.set_event(PAYMENT_ID, None)
        return

    # Send a unique payment ID to the checkout endpoint so it
    # can redirect the customer to the payments page.
    DBOS.set_event(PAYMENT_ID, DBOS.workflow_id)

    # Wait for a message that the customer has completed payment.
    payment_status = DBOS.recv(PAYMENT_STATUS)

    # If payment succeeded, mark the order as paid and start the order dispatch workflow.
    # Otherwise, return reserved inventory and cancel the order.
    if payment_status == "paid":
        DBOS.logger.info(f"Payment successful for order {order_id}")
        update_order_status(order_id=order_id, status=OrderStatus.PAID.value)
        DBOS.start_workflow(dispatch_order_workflow, order_id)
    else:
        DBOS.logger.warning(f"Payment failed for order {order_id}")
        undo_reserve_inventory()
        update_order_status(order_id=order_id, status=OrderStatus.CANCELLED.value)

    # Finally, send the order ID to the payment endpoint so it
    # can redirect the customer to the order status page.
    DBOS.set_event(ORDER_ID, str(order_id))


# Now, let's use FastAPI to write the HTTP endpoint for checkout.

# This endpoint receives a request when a customer presses the "Buy Now" button.
# It starts the checkout workflow in the background, then waits for the workflow
# to generate and send it a unique payment ID. It then returns the payment ID
# so the browser can redirect the customer to the payments page.

# The endpoint accepts an idempotency key so that even if the customer presses
# "buy now" multiple times, only one checkout workflow is started.


@app.post("/checkout/{idempotency_key}")
def checkout_endpoint(idempotency_key: str) -> Response:
    # Idempotently start the checkout workflow in the background.
    with SetWorkflowID(idempotency_key):
        handle = DBOS.start_workflow(checkout_workflow)
    # Wait for the checkout workflow to send a payment ID, then return it.
    payment_id = DBOS.get_event(handle.workflow_id, PAYMENT_ID)
    if payment_id is None:
        raise HTTPException(status_code=404, detail="Checkout failed to start")
    return Response(payment_id)


# This is the HTTP endpoint for payments. It uses the payment ID to signal
# the checkout workflow whether the payment succeeded or failed.
# It then retrieves the order ID from the checkout workflow
# so the browser can redirect the customer to the order status page.


@app.post("/payment_webhook/{payment_id}/{payment_status}")
def payment_endpoint(payment_id: str, payment_status: str) -> Response:
    # Send the payment status to the checkout workflow.
    DBOS.send(payment_id, payment_status, PAYMENT_STATUS)
    # Wait for the checkout workflow to send an order ID, then return it.
    order_url = DBOS.get_event(payment_id, ORDER_ID)
    if order_url is None:
        raise HTTPException(status_code=404, detail="Payment failed to process")
    return Response(order_url)


# Next, let's write some database operations. Each of these functions performs a simple
# CRUD operation. We apply the @DBOS.transaction() decorator to each of them to give them
# access to a SQLAlchemy database connection. We also make some of these functions
# HTTP endpoints with FastAPI so the frontend can access them.


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
def get_order(order_id: int):
    return (
        DBOS.sql_session.execute(orders.select().where(orders.c.order_id == order_id))
        .mappings()
        .first()
    )


@DBOS.transaction()
def update_order_status(order_id: int, status: int) -> None:
    DBOS.sql_session.execute(
        orders.update().where(orders.c.order_id == order_id).values(order_status=status)
    )


@app.get("/product")
@DBOS.transaction()
def get_product():
    return DBOS.sql_session.execute(products.select()).mappings().first()


@app.get("/orders")
@DBOS.transaction()
def get_orders():
    rows = DBOS.sql_session.execute(orders.select())
    return [dict(row) for row in rows.mappings()]


@app.post("/restock")
@DBOS.transaction()
def restock():
    DBOS.sql_session.execute(products.update().values(inventory=100))


# Now, let's write a workflow to dispatch orders that have been paid for.
# Every second, it updates the progress of a paid order,
# then dispatches orders that are fully progressed.
@DBOS.workflow()
def dispatch_order_workflow(order_id):
    for _ in range(10):
        DBOS.sleep(1)
        update_order_progress(order_id)


@DBOS.transaction()
def update_order_progress(order_id):
    # Update the progress of paid orders.
    progress_remaining = DBOS.sql_session.execute(
        orders.update()
        .where(orders.c.order_id == order_id)
        .values(progress_remaining=orders.c.progress_remaining - 1)
        .returning(orders.c.progress_remaining)
    ).scalar_one()

    # Dispatch if the order is fully-progressed.
    if progress_remaining == 0:
        DBOS.sql_session.execute(
            orders.update()
            .where(orders.c.order_id == order_id)
            .values(order_status=OrderStatus.DISPATCHED.value)
        )


# Next, let's serve the app's frontend from an HTML file using FastAPI.
# In production, we recommend using DBOS primarily for the backend,
# with your frontend deployed elsewhere.


@app.get("/")
def frontend():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)


# Finally, here is the crash endpoint. It crashes your app. For demonstration purposes only. :)


@app.post("/crash_application")
def crash_application():
    os._exit(1)


# To deploy this app to the cloud, run `dbos-cloud app deploy`.
# Visit its URL to see it in action!
