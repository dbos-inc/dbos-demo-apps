
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from dbos import DBOS

app = FastAPI()
DBOS(fastapi=app)


@app.get("/")
def endpoint() -> str:
    return "hello"
