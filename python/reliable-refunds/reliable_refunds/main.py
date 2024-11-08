# In this app, we use DBOS and LlamaIndex to build and serverlessly deploy a chat agent that can index PDF documents and answer questions about them.

# First, let's do imports and initialize DBOS.

import os

from dbos import DBOS, load_config
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from llama_index.core import Settings, StorageContext, VectorStoreIndex
from llama_index.vector_stores.postgres import PGVectorStore
from pydantic import BaseModel

from .schema import chat_history

app = FastAPI()
DBOS(fastapi=app)


# Next, let's initialize LlamaIndex to use Postgres with pgvector as its vector store.


def configure_index():
    Settings.chunk_size = 512
    dbos_config = load_config()
    db = dbos_config["database"]
    vector_store = PGVectorStore.from_params(
        database=db["app_db_name"],
        host=db["hostname"],
        password=db["password"],
        port=db["port"],
        user=db["username"],
        perform_setup=False,  # Set up during migration step
    )
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    index = VectorStoreIndex([], storage_context=storage_context)
    chat_engine = index.as_chat_engine()
    return index, chat_engine


index, chat_engine = configure_index()


# Now, let's chat!

# Each time we get a chat message, we call this workflow with three steps:
# 1. Store the incoming chat message in Postgres.
# 2. Query LlamaIndex to respond to the message using RAG.
# 3. Store the response in Postgres.


class ChatSchema(BaseModel):
    message: str


@app.post("/chat")
@DBOS.workflow()
def chat_workflow(chat: ChatSchema):
    insert_chat(chat.message, True)
    response = query_model(chat.message)
    insert_chat(response, False)
    return {"content": response, "isUser": True}


@DBOS.transaction()
def insert_chat(content: str, is_user: bool):
    DBOS.sql_session.execute(
        chat_history.insert().values(content=content, is_user=is_user)
    )


@DBOS.step()
def query_model(message: str) -> str:
    return str(chat_engine.chat(message))


# Let's also write a history endpoint that retrieves all past chats
# from the database.

# This function is called when we open up the chatbot so it
# can display your chat history.


@app.get("/history")
def history_endpoint():
    return get_chats()


@DBOS.transaction()
def get_chats():
    stmt = chat_history.select().order_by(chat_history.c.created_at.asc())
    result = DBOS.sql_session.execute(stmt)
    return [{"content": row.content, "isUser": row.is_user} for row in result]


# Finally, let's serve the app's frontend from an HTML file using FastAPI.
# In production, we recommend using DBOS primarily for the backend,
# with your frontend deployed elsewhere.


@app.get("/")
def frontend():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)
