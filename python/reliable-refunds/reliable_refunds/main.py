import json
import os

from dbos import DBOS, DBOSConfiguredInstance
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from swarm import Agent, Swarm
from swarm.repl.repl import pretty_print_messages

from .schema import chat_history

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


def get_weather(location, time="now"):
    """Get the current weather in a given location. Location MUST be a city."""
    return json.dumps({"location": location, "temperature": "65", "time": time})


weather_agent = Agent(
    name="Weather Agent",
    instructions="You are a helpful agent.",
    functions=[get_weather],
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
    response = client.run(agent=weather_agent, messages=messages)
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
