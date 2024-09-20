from dbos import DBOS
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI()
DBOS(fastapi=app)


@app.get("/")
def endpoint() -> str:
    return "hello"
