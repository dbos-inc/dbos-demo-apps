import os
import threading
import time
from collections import deque

import psutil
from dbos import DBOS
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.graph import START, MessagesState, StateGraph
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

from .schema import chat_history

app = FastAPI()
dbos = DBOS(fastapi=app)


def create_langchain():
    model = ChatOpenAI(model="gpt-3.5-turbo")
    workflow = StateGraph(state_schema=MessagesState)
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You talk like a pirate. Answer all questions to the best of your ability.",
            ),
            MessagesPlaceholder(variable_name="messages"),
        ]
    )

    def call_model(state: MessagesState):
        chain = prompt | model
        response = chain.invoke(state)
        return {"messages": response}

    workflow.add_edge(START, "model")
    workflow.add_node("model", call_model)
    db = DBOS.config["database"]
    connection_string = f"postgresql://{db['username']}:{db['password']}@{db['hostname']}:{db['port']}/{db['app_db_name']}"
    pool = ConnectionPool(connection_string)
    checkpointer = PostgresSaver(pool)
    return workflow.compile(checkpointer=checkpointer)


chain = create_langchain()


class ChatSchema(BaseModel):
    query: str


@DBOS.step()
def query_model(query: str) -> str:
    config = {"configurable": {"thread_id": "default_thread"}}
    input_messages = [HumanMessage(query)]
    output = chain.invoke({"messages": input_messages}, config)
    return output["messages"][-1].content


@app.post("/chat")
@DBOS.workflow()
def chat_workflow(chat: ChatSchema):
    start_time = time.time()
    insert_chat(chat.query, True)
    response = query_model(chat.query)
    insert_chat(response, False)
    elapsed_time_ms = (time.time() - start_time) * 1000
    wallclock_times_buffer.append((time.time(), elapsed_time_ms))
    return {"content": response, "isUser": True}


@app.get("/history")
def history_endpoint():
    return get_chats()


@DBOS.transaction()
def insert_chat(content, is_user):
    DBOS.sql_session.execute(
        chat_history.insert().values(content=content, is_user=is_user)
    )


@DBOS.transaction()
def get_chats():
    stmt = chat_history.select().order_by(chat_history.c.created_at.asc())
    result = DBOS.sql_session.execute(stmt)
    return [{"content": row.content, "isUser": row.is_user} for row in result]


@app.get("/")
def frontend():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)


last_cpu_time_ms = 0
cpu_times_buffer = deque()
wallclock_times_buffer = deque()


def update_cpu_usage():
    while True:
        time.sleep(2)
        global last_cpu_time_ms
        process = psutil.Process()
        cpu_times = process.cpu_times()
        cpu_time_ms = (cpu_times.system + cpu_times.user) * 1000
        time_consumed = cpu_time_ms - last_cpu_time_ms
        if last_cpu_time_ms > 0:
            cpu_times_buffer.append((time.time(), time_consumed))
        last_cpu_time_ms = cpu_time_ms
        for buf in [cpu_times_buffer, wallclock_times_buffer]:
            while buf and time.time() - buf[0][0] > 60:
                buf.popleft()


threading.Thread(target=update_cpu_usage).start()


@app.get("/times")
def get_cpu_time():
    return {
        "cpu_time": sum([t for _, t in cpu_times_buffer]),
        "wall_clock_time": sum([t for _, t in wallclock_times_buffer]),
    }


@app.get("/wall_clock_time")
def get_cpu_time():
    return {"wall_clock_time": sum([t for _, t in wallclock_times_buffer])}
