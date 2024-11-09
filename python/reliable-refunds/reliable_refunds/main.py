import json
import os
from typing import Optional

from dbos import DBOS, DBOSConfiguredInstance
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from swarm import Agent, Swarm
from swarm.repl.repl import pretty_print_messages

from .schema import OrderStatus, Purchase, chat_history, purchases

app = FastAPI()
DBOS(fastapi=app)


@DBOS.dbos_class()
class DurableSwarm(Swarm, DBOSConfiguredInstance):
    def __init__(self, client=None):
        Swarm.__init__(self, client)
        DBOSConfiguredInstance.__init__(self, "openai_client")

    @DBOS.step()
    def get_chat_completion(self, *args, **kwargs):
        return super().get_chat_completion(*args, **kwargs)

    @DBOS.workflow()
    def run(self, *args, **kwargs):
        response = super().run(*args, **kwargs)
        pretty_print_messages(response.messages)
        return response


sg_api_key = os.environ.get("SENDGRID_API_KEY", None)
if sg_api_key is None:
    raise Exception("Error: SENDGRID_API_KEY is not set")

from_email = os.environ.get("SENDGRID_FROM_EMAIL", None)
if from_email is None:
    raise Exception("Error: SENDGRID_FROM_EMAIL is not set")

admin_email = os.environ.get("ADMIN_EMAIL", None)
if admin_email is None:
    raise Exception("Error: ADMIN_EMAIL is not set")


@DBOS.transaction()
def get_purchase_by_id(order_id: int) -> Optional[Purchase]:
    query = purchases.select().where(purchases.c.order_id == order_id)
    result = DBOS.sql_session.execute(query)
    row = result.first()

    if row is None:
        return None

    return Purchase.from_row(row)


@DBOS.transaction()
def update_purchase_status(order_id: int, status: OrderStatus):
    query = (
        purchases.update()
        .where(purchases.c.order_id == order_id)
        .values(order_status=status)
    )
    DBOS.sql_session.execute(query)


admin_email = os.environ.get("ADMIN_EMAIL", None)
if admin_email is None:
    raise Exception("Error: ADMIN_EMAIL is not set")

callback_domain = os.environ.get("CALLBACK_DOMAIN", None)
if callback_domain is None:
    raise Exception("Error: CALLBACK_DOMAIN is not set")


@DBOS.workflow()
def approval_workflow(purchase: Purchase):
    send_email(purchase)
    status = DBOS.recv(timeout_seconds=120)
    if status == "approve":
        DBOS.logger.info("Refund approved :)")
        update_purchase_status(purchase.order_id, OrderStatus.REFUNDED)
        return "Approved"
    else:
        DBOS.logger.info("Refund rejected :/")
        update_purchase_status(purchase.order_id, OrderStatus.REFUND_REJECTED)
        return "Rejected"


@DBOS.step()
def send_email(purchase: Purchase):
    content = f"{callback_domain}/approval/{DBOS.workflow_id}"
    msg = f"""
    <p>
        Can you approve or deny this refund request? <br />
        Order ID: {purchase.order_id} <br />
        Item: {purchase.item} <br />
        Order Date: {purchase.order_date} <br />
        Price: {purchase.price} <br />
        Click <a href='{content}/approve'>approve</a> or <a href='{content}/reject'>reject</a>.
    </p>
    """
    message = Mail(
        from_email=from_email,
        to_emails=admin_email,
        subject="Refund Validation",
        html_content=msg,
    )
    email_client = SendGridAPIClient(sg_api_key)
    email_client.send(message)
    DBOS.logger.info(f"Message sent from {from_email} to {admin_email}")


@DBOS.workflow()
def process_refund(purchase_json: str):
    try:
        purchase = Purchase.from_dict(json.loads(purchase_json))
    except Exception as e:
        DBOS.logger.error(f"Input validation failed for {purchase_json}: {e}")
        return "We're unable to process your refund. Please check your input and try again."
    if purchase.price > 1000:
        update_purchase_status(purchase.order_id, OrderStatus.PENDING_REFUND.value)
        DBOS.start_workflow(approval_workflow, purchase)
        return f"Because order_id {purchase.order_id} exceeds our cost threshold, your refund request must undergo manual review. Please check your order status later."
    else:
        update_purchase_status(purchase.order_id, OrderStatus.REFUNDED)
        return f"Your refund for order_id {purchase.order_id} has been approved."


refund_agent = Agent(
    name="Refund Agent",
    instructions="""
    You are a helpful refund agent. You always speak in fluent, natural, conversational language.
    Take these steps when someone asks for a refund:
    1. Ask for their order_id if they haven't provided it.
    2. Look up their order and retrieve the item, order date, and price.
    3. Ask them to confirm they want to refund this item.
    4. If they confirm, process the refund with their full purchase information.
    If the customer asks for the status of a refund, look up their order and retrieve the item, order date, and price.
    """,
    functions=[get_purchase_by_id, process_refund],
)


client = DurableSwarm()


class ChatSchema(BaseModel):
    message: str


@app.post("/chat")
@DBOS.workflow()
def chat_workflow(chat: ChatSchema):
    message = {"role": "user", "content": chat.message}
    insert_chat(message)
    messages = get_chats()
    response = client.run(agent=refund_agent, messages=messages)
    for m in response.messages:
        insert_chat(m)
    return [
        {"content": m["content"], "isUser": m["role"] == "user"}
        for m in response.messages
        if m["content"] and m["role"] != "tool"
    ]


@DBOS.transaction()
def insert_chat(message: dict):
    DBOS.sql_session.execute(
        chat_history.insert().values(message_json=json.dumps(message))
    )


@app.get("/history")
def history_endpoint():
    messages = get_chats()
    return [
        {"content": m["content"], "isUser": m["role"] == "user"}
        for m in messages
        if m["content"] and m["role"] != "tool"
    ]


@DBOS.transaction()
def get_chats():
    stmt = chat_history.select().order_by(chat_history.c.created_at.asc())
    result = DBOS.sql_session.execute(stmt)
    return [json.loads(row.message_json) for row in result]


@app.get("/")
def frontend():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)


@app.get("/approval/{workflow_id}/{status}")
def approval_endpoint(workflow_id: str, status: str):
    DBOS.send(workflow_id, status)
    return {"message": "Refund validation complete"}
