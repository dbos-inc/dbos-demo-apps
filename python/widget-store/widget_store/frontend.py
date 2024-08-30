# Here we implement a simple frontend, serving app.html from FastAPI.
# In production, we recommend using DBOS primarily for the backend,
# with your frontend deployed elsewhere.


from fastapi import APIRouter
from fastapi.responses import HTMLResponse

frontend_router = APIRouter()


@frontend_router.get("/")
def frontend():
    with open("html/app.html") as file:
        html = file.read()
    return HTMLResponse(html)
