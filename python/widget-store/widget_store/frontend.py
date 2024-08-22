import uuid

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from liquid import Template

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
