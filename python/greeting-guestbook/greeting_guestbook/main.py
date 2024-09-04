import json
import os

import requests
from dbos import DBOS
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from .schema import greetings

app = FastAPI()
DBOS(fastapi=app)


@app.get("/")
def readme() -> HTMLResponse:
    readme = """<html><body><p>
      Welcome! Visit the route /greeting/:name to be greeted!<br>
      For example, visit <a href="/greeting/dbos">/greeting/dbos</a>.<br>
      </p></body></html>
      """
    return HTMLResponse(readme)


@app.get("/greetings")
@DBOS.transaction()
def get_greetings():
    rows = DBOS.sql_session.execute(greetings.select())
    return [dict(row) for row in rows.mappings()]


@DBOS.step()
def sign_guestbook(name: str):
    key = os.environ.get("GUESTBOOK_KEY", None)
    if key is None or len(key) != 36:
        raise Exception("Please set the guestbook key in dbos-config.yaml")

    url = "https://demo-guestbook.cloud.dbos.dev/record_greeting"
    headers = {"Content-Type": "application/json"}
    payload = {"key": key, "name": name}

    response = requests.post(url, headers=headers, json=payload)
    response_str = json.dumps(response.json())
    if not response.ok:
        raise Exception(f"Error signing guestbook: {response_str}")

    DBOS.logger.info(f">>> STEP 1: Signed the Guestbook: {response_str}")


@DBOS.transaction()
def insert_greeting(name: str, note: str):
    DBOS.sql_session.execute(greetings.insert().values(name=name, note=note))
    DBOS.logger.info(f">>> STEP 2: Greeting to {name} recorded in the database!")


@DBOS.workflow()
def greeting_workflow(name: str, note: str):
    sign_guestbook(name)
    for _ in range(5):
        DBOS.logger.info("Press Control + C to stop the app...")
        DBOS.sleep(1)
    insert_greeting(name, note)


@app.get("/greeting/{name}")
def greet(name: str) -> str:
    note = f"Thank you for being awesome, {name}!"
    DBOS.start_workflow(greeting_workflow, name, note)
    return note
