from dbos import DBOS
from fastapi import FastAPI

from schema import example_table

app = FastAPI()
DBOS(fastapi=app)

@DBOS.transaction()
def insert_row():
        DBOS.sql_session.execute(example_table.insert().values(name="dbos"))

@DBOS.transaction()
def count_rows():
    count = DBOS.sql_session.execute(example_table.select()).rowcount
    print(f"Row count: {count}")

@app.get("/")
@DBOS.workflow()
def dbos_workflow():
    insert_row()
    count_rows()