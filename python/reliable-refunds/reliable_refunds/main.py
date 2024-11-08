import json
import os
from typing import Optional

from dbos import DBOS, DBOSConfiguredInstance
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from swarm import Agent, Swarm
from swarm.repl.repl import pretty_print_messages

from .schema import Purchase, chat_history, purchases

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


@DBOS.transaction()
def get_purchase_by_id(order_id: int) -> Optional[Purchase]:
    query = purchases.select().where(purchases.c.order_id == order_id)
    result = DBOS.sql_session.execute(query)
    row = result.first()

    if row is None:
        return None

    return Purchase.from_row(row)


refund_agent = Agent(
    name="Refund Agent",
    instructions="""
    You are a helpful refund agent. You always speak in fluent, natural, conversational language.
    Take these steps when someone asks for a refund:
    1. Ask for their order_id
    2. Look up their order and retrieve the item, order date, and price.
    Ask them to confirm they want to refund this item.
    """,
    functions=[get_purchase_by_id],
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
        if m["content"]
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
        if m["content"]
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
