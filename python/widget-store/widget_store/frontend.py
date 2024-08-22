from fastapi import APIRouter
from liquid import Template
from fastapi.responses import HTMLResponse
import uuid

router = APIRouter()

def render(file, context={}):
    with open(f'html/{file}') as file:
        template_string = file.read()
    template = Template(template_string)
    return template.render(context)

@router.get("/")
def frontend():
    context = {
        "uuid": str(uuid.uuid4()),
        "inventory": 1,
        "product": "Widgets",
        "description": "Good widgets",
        "price": "99.99"

    }
    return HTMLResponse(render('purchase.liquid', context))