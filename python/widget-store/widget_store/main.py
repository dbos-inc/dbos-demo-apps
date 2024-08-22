from dbos import DBOS
from fastapi import FastAPI

from . import schema
from .frontend import router

app = FastAPI()
app.include_router(router)

dbos = DBOS(app)


@dbos.transaction()
def getProduct() -> schema.product:
    row = DBOS.sql_session.execute(schema.products.select()).fetchone()
    return schema.product(
        product_id=row.product_id,
        product=row.product,
        description=row.description,
        inventory=row.inventory,
        price=row.price,
    )


def getOrder(order_id: str) -> schema.order:
    row = DBOS.sql_session.execute(
        schema.orders.select().where(schema.orders.c.id == order_id)
    ).fetchone()
    return schema.order(
        order_id=row.order_id,
        order_status=row.order_status,
        last_update_time=row.last_update_time,
    )
