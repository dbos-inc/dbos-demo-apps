import os
from typing import Optional

from dbos import DBOS, SetWorkflowUUID
from fastapi import FastAPI, Response

from . import schema
from .frontend import router

app = FastAPI()
app.include_router(router)

dbos = DBOS(app)

WIDGET_ID = 1
PAYMENT_TOPIC = "payment"
PAYMENT_URL_EVENT = "payment_url"
ORDER_URL_EVENT = "order_url"


@dbos.transaction()
def get_product() -> schema.product:
    row = DBOS.sql_session.execute(schema.products.select()).fetchone()
    return schema.product(
        product_id=row.product_id,
        product=row.product,
        description=row.description,
        inventory=row.inventory,
        price=row.price,
    )


@dbos.transaction()
def reserve_inventory() -> bool:
    rows_affected = DBOS.sql_session.execute(
        schema.products.update()
        .where(schema.products.c.product_id == WIDGET_ID)
        .where(schema.products.c.inventory > 0)
        .values(inventory=schema.products.c.inventory - 1)
    ).rowcount
    return rows_affected > 0


@dbos.transaction()
def undo_reserve_inventory() -> None:
    DBOS.sql_session.execute(
        schema.products.update()
        .where(schema.products.c.product_id == WIDGET_ID)
        .values(inventory=schema.products.c.inventory + 1)
    )


@dbos.transaction()
def get_order(order_id: str) -> Optional[schema.order]:
    row = DBOS.sql_session.execute(
        schema.orders.select().where(schema.orders.c.order_id == order_id)
    ).fetchone()
    if row is None:
        return None
    return schema.order(
        order_id=row.order_id,
        order_status=row.order_status,
        last_update_time=row.last_update_time,
    )


@dbos.transaction()
def create_order() -> int:
    result = DBOS.sql_session.execute(
        schema.orders.insert().values(order_status=schema.OrderStatus.PENDING.value)
    )
    return result.inserted_primary_key[0]


@dbos.transaction()
def update_order_status(order_id: str, status: int) -> None:
    DBOS.sql_session.execute(
        schema.orders.update()
        .where(schema.orders.c.order_id == order_id)
        .values(order_status=status)
    )


@app.post("/checkout/{key}")
def checkout_endpoint(key: str) -> Response:
    with SetWorkflowUUID(key):
        handle = dbos.start_workflow(payment_workflow)
    payment_url = dbos.get_event(handle.workflow_uuid, PAYMENT_URL_EVENT)
    if payment_url is None:
        return Response("/error")
    return Response(payment_url)


@app.post("/payment_webhook/{key}/{status}")
def payment_endpoint(key: str, status: str) -> Response:
    dbos.send(key, status, PAYMENT_TOPIC)
    order_url = dbos.get_event(key, ORDER_URL_EVENT)
    if order_url is None:
        return Response("/error")
    return Response(order_url)


@dbos.workflow()
def payment_workflow():
    order_id = create_order()
    inventory_reserved = reserve_inventory()
    if not inventory_reserved:
        DBOS.logger.error(f"Failed to reserve inventory for order {order_id}")
        update_order_status(
            order_id=order_id, status=schema.OrderStatus.CANCELLED.value
        )
        dbos.set_event(PAYMENT_URL_EVENT, None)
        return
    dbos.set_event(PAYMENT_URL_EVENT, f"/payment/{DBOS.workflow_id}")
    notification = dbos.recv(PAYMENT_TOPIC)
    if notification is not None and notification == "paid":
        DBOS.logger.info(f"Payment successful for order {order_id}")
        update_order_status(order_id=order_id, status=schema.OrderStatus.PAID.value)
    else:
        DBOS.logger.warn(f"Payment failed for order {order_id}")
        undo_reserve_inventory()
        update_order_status(
            order_id=order_id, status=schema.OrderStatus.CANCELLED.value
        )
    dbos.set_event(ORDER_URL_EVENT, f"/order/{order_id}")


@app.post("/crash_application")
def crash_application():
    os._exit(1)
