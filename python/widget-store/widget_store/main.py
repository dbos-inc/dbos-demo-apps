from typing import Optional

from dbos import DBOS, SetWorkflowUUID
from fastapi import FastAPI, Response

from . import schema
from .frontend import router

app = FastAPI()
app.include_router(router)

dbos = DBOS(app)

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


@app.post("/checkout/{key}")
def checkoutEndpoint(key: str) -> Response:
    with SetWorkflowUUID(key):
        handle = dbos.start_workflow(paymentWorkflow)
    payment_url = dbos.get_event(handle.workflow_uuid, PAYMENT_URL_EVENT)
    if payment_url is None:
        return Response("/error")
    return Response(payment_url)


@app.post("/payment_webhook/{key}/{status}")
def paymentEndpoint(key: str, status: str) -> Response:
    dbos.send(key, status, PAYMENT_TOPIC)
    order_url = dbos.get_event(key, ORDER_URL_EVENT)
    if order_url is None:
        return Response("/error")
    return Response(order_url)


@dbos.workflow()
def paymentWorkflow():
    dbos.set_event(PAYMENT_URL_EVENT, f"/payment/{DBOS.workflow_id}")
    dbos.recv(PAYMENT_TOPIC)
    order_id = 1
    dbos.set_event(ORDER_URL_EVENT, f"/order/{order_id}")
