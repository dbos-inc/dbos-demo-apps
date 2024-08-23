# Here we implement a simple frontend, rendering some Liquid HTML templates
# and serving them via FastAPI HTTP handlers.  In production, we recommend using
# DBOS primarily for the backend, with your frontend deployed elsewhere.

import uuid

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from liquid import Template

from .schema import OrderStatus

frontend_router = APIRouter()


def render(file, context={}):
    with open(f"html/{file}") as file:
        template_string = file.read()
    template = Template(template_string)
    return template.render(context)


@frontend_router.get("/")
def frontend():
    from .main import get_product

    product = get_product()
    context = {
        "uuid": str(uuid.uuid4()),
        "inventory": product["inventory"],
        "product": product["product"],
        "description": product["description"],
        "price": str(product["price"]),
    }
    return HTMLResponse(render("purchase.liquid", context))


@frontend_router.get("/payment/{key}")
def payment(key: str):
    return HTMLResponse(render("payment.liquid", {"uuid": key}))


@frontend_router.get("/error")
def error():
    return HTMLResponse(render("error.liquid"))


@frontend_router.get("/crash")
def crash():
    return HTMLResponse(render("crash.liquid"))


@frontend_router.get("/order/{order_id}")
def order(order_id: int):
    from .main import get_order

    order = get_order(order_id)
    if order is None:
        return HTMLResponse(render("error.liquid"))
    context = {
        "order_id": order["order_id"],
        "status": OrderStatus(order["order_status"]).name,
        "time": str(order["last_update_time"]),
    }
    return HTMLResponse(render("order_status.liquid", context))
