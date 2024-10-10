# In this app, we use DBOS and LangChain to build a chatbot and serverlessly deploy it to the cloud.

# First, let's do imports and initialize DBOS.

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

# Next, let's set up LangChain. We'll use LangChain to
# answer each chat message using OpenAI's gpt-3.5-turbo.
# We'll configure LangChain to store message history
# in Postgres so it persists across app restarts.

# For fun, let's also instruct our chatbot to talk like a pirate.


def create_langchain():
    # We use gpt-3.5-turbo as our model.
    model = ChatOpenAI(model="gpt-3.5-turbo")

    # This prompt instructs the model how to act. We'll tell it to talk like a pirate!
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You talk like a pirate. Answer all questions to the best of your ability.",
            ),
            MessagesPlaceholder(variable_name="messages"),
        ]
    )

    # This function tells LangChain to invoke our model with our prompt.
    def call_model(state: MessagesState):
        chain = prompt | model
        response = chain.invoke(state)
        return {"messages": response}

    # Create a checkpointer LangChain can use to store message history in Postgres.
    db = DBOS.config["database"]
    connection_string = f"postgresql://{db['username']}:{db['password']}@{db['hostname']}:{db['port']}/{db['app_db_name']}"
    pool = ConnectionPool(connection_string)
    checkpointer = PostgresSaver(pool)

    # Finally, construct and return the graph LangChain uses to respond to each message.
    # This chatbot uses a simple one-node graph that just calls the model.
    graph = StateGraph(state_schema=MessagesState)
    graph.add_node("model", call_model)
    graph.add_edge(START, "model")
    return graph.compile(checkpointer=checkpointer)


chain = create_langchain()

# Now, let's chat! We'll first write the endpoint
# that handles each chat request.

# This endpoint is a DBOS workflow with three steps:
# 1. Store the incoming chat message in Postgres.
# 2. Use LangChain to query the LLM to respond to the chat message.
# 3. Store the response in Postgres.

# It also records the total duration of each request in an in-memory buffer.


class ChatSchema(BaseModel):
    message: str
    username: str


@app.post("/chat")
@DBOS.workflow()
def chat_workflow(chat: ChatSchema):
    start_time = time.time()
    insert_chat(chat.username, chat.message, True)
    response = query_model(chat.message, chat.username)
    insert_chat(chat.username, response, False)
    elapsed_time = time.time() - start_time
    wallclock_times_buffer.append((time.time(), elapsed_time))
    return {"content": response, "isUser": True}


# Next, let's write the function that actually queries LangChain
# for each new message and returns its response.
# It uses your username as a thread_id so different users can have different
# threads of conversation.

# We annotate this function with DBOS.step() to mark it as a step in our chat workflow.


@DBOS.step()
def query_model(message: str, username: str) -> str:
    config = {"configurable": {"thread_id": username}}
    input_messages = [HumanMessage(message)]
    output = chain.invoke({"messages": input_messages}, config)
    return output["messages"][-1].content


# Let's also write a history endpoint that retrieves all past chats
# from the database for a particular user.

# This function is called when we open up the chatbot so it
# can display your chat history.


@app.get("/history/{username}")
def history_endpoint(username: str):
    return get_chats(username)


# Next, let's write the database operations that read and write chats
# using SQLAlchemy.

# We annotate them with @DBOS.transaction to each of them to use a
# pre-configured database connection.


@DBOS.transaction()
def insert_chat(username: str, content: str, is_user: bool):
    DBOS.sql_session.execute(
        chat_history.insert().values(
            username=username, content=content, is_user=is_user
        )
    )


@DBOS.transaction()
def get_chats(username: str):
    stmt = (
        chat_history.select()
        .where(chat_history.c.username == username)
        .order_by(chat_history.c.created_at.asc())
    )
    result = DBOS.sql_session.execute(stmt)
    return [{"content": row.content, "isUser": row.is_user} for row in result]


# Let's also serve the app's frontend from an HTML file using FastAPI.
# In production, we recommend using DBOS primarily for the backend,
# with your frontend deployed elsewhere.


@app.get("/")
def frontend():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)


# Finally, let's write some code to track the CPU time and wall-clock
# time consumed by your requests. This code runs once a second in a
# background thread.

# As you chat, you'll quickly notice that
# while your requests may take a long time, they consume very little CPU
# because they spend most of their time waiting for the LLM to respond.
# This gap explains why DBOS is 50x cheaper than other serverless platforms
# for AI workloads! DBOS bills only for the CPU time you actually consume,
# while other platforms bill for the total request duration,
# most of which is spent idly waiting for an LLM to respond.

# We track the CPU consumption of this process using psutil.
# We track wall-clock time by recording the duration of each
# request in chat_workflow.


last_cpu_time_ms = 0
cpu_times_buffer = deque()
wallclock_times_buffer = deque()


def update_cpu_usage():
    while True:
        time.sleep(1)
        global last_cpu_time_ms
        # Every second, record CPU time consumed by this process
        # in the last second.
        process = psutil.Process()
        cpu_times = process.cpu_times()
        cpu_time = cpu_times.system + cpu_times.user
        time_consumed = cpu_time - last_cpu_time_ms
        if last_cpu_time_ms > 0:
            cpu_times_buffer.append((time.time(), time_consumed))
        last_cpu_time_ms = cpu_time
        # We only track usage in the last minute, so
        # pop measurements more than 60 seconds old.
        for buf in [cpu_times_buffer, wallclock_times_buffer]:
            while buf and time.time() - buf[0][0] > 60:
                buf.popleft()


threading.Thread(target=update_cpu_usage).start()


@app.get("/times")
def times_endpoint():
    return {
        "cpu_time": sum([t for _, t in cpu_times_buffer]),
        "wall_clock_time": sum([t for _, t in wallclock_times_buffer]),
    }
