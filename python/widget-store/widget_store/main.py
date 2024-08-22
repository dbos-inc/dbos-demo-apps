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
