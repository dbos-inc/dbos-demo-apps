import logging

import requests
from dbos import DBOS
from fastapi import FastAPI

from .schema import dbos_hello

app = FastAPI()
DBOS(fastapi=app)

logging.basicConfig(level=logging.INFO)


@DBOS.step()
def sign_guestbook(name: str):
    requests.post(
        "https://demo-guest-book.cloud.dbos.dev/record_greeting",
        headers={"Content-Type": "application/json"},
        json={"name": name},
    )
    logging.info(f">>> STEP 1: Signed the guestbook for {name}")


@DBOS.transaction()
def insert_greeting(name: str) -> str:
    query = dbos_hello.insert().values(name=name)
    DBOS.sql_session.execute(query)
    logging.info(f">>> STEP 2: Greeting to {name} recorded in the database!")


@app.get("/greeting/{name}")
@DBOS.workflow()
def greeting_endpoint(name: str):
    sign_guestbook(name)
    for _ in range(5):
        logging.info("Press Control + C to stop the app...")
        DBOS.sleep(1)
    insert_greeting(name)
    return f"Thank you for being awesome, {name}!"
