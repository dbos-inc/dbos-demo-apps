import uuid

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from liquid import Template

from .schema import OrderStatus

router = APIRouter()


def render(file, context={}):
    with open(f"html/{file}") as file:
        template_string = file.read()
    template = Template(template_string)
    return template.render(context)


@router.get("/")
def frontend():
    from .main import getProduct

    product = getProduct()
    context = {
        "uuid": str(uuid.uuid4()),
        "inventory": product["inventory"],
        "product": product["product"],
        "description": product["description"],
        "price": str(product["price"]),
    }
    return HTMLResponse(render("purchase.liquid", context))


@router.get("/payment/{key}")
def payment(key: str):
    return HTMLResponse(render("payment.liquid", {"uuid": key}))


@router.get("/error")
def error():
    return HTMLResponse(render("error.liquid"))


@router.get("/crash")
def crash():
    return HTMLResponse(render("crash.liquid"))


@router.get("/order/{order_id}")
def order(order_id: int):
    from .main import getOrder

    order = getOrder(order_id)
    context = {
        "order_id": order["order_id"],
        "status": OrderStatus(order["order_status"]).name,
        "time": str(order["last_update_time"]),
    }
    return HTMLResponse(render("order_status.liquid"), context)
