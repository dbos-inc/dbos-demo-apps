# In this app, we use DBOS and LlamaIndex to build and serverlessly deploy a chat agent that can index PDF documents and answer questions about them.

# First, let's do imports and initialize DBOS.

import os
from tempfile import TemporaryDirectory
from typing import List

import requests
import uvicorn
from dbos import DBOS, DBOSConfig, Queue, WorkflowHandle
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from llama_index.core import Settings, StorageContext, VectorStoreIndex
from llama_index.readers.file import PDFReader
from llama_index.vector_stores.postgres import PGVectorStore
from pydantic import BaseModel, HttpUrl
from sqlalchemy import make_url

from .schema import chat_history

application_database_url = os.environ.get('DBOS_DATABASE_URL')
if not application_database_url:
    raise Exception("DBOS_DATABASE_URL not set")

app = FastAPI()
config: DBOSConfig = {
    "name": "document-detective",
    "application_database_url": application_database_url,
}
DBOS(fastapi=app, config=config)


# Next, let's initialize LlamaIndex to use Postgres with pgvector as its vector store.


def configure_index():
    Settings.chunk_size = 512
    db = make_url(application_database_url)
    vector_store = PGVectorStore.from_params(
        database=db.database,
        host=db.host,
        password=db.password,
        port=db.port,
        user=db.username,
        perform_setup=False,  # Set up during migration step
    )
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    index = VectorStoreIndex([], storage_context=storage_context)
    chat_engine = index.as_chat_engine()
    return index, chat_engine


index, chat_engine = configure_index()


# Now, let's write the document ingestion pipeline. Because ingesting and indexing documents may
# take a long time, we need to build a pipeline that's both concurrent and reliable.
# It needs to process multiple documents at once and it needs to be resilient to failures,
# so if the application is interrupted or restarted, or encounters an error, it can
# recover from where it left off instead of restarting from the beginning or losing
# some documents entirely.

# We'll build a concurrent, reliable data ingestion pipeline using DBOS queues and
# durable execution. This workflow takes in a batch of document URLs and enqueues
# them for ingestion. It then waits for them all to complete and counts how
# many total documents and pages were ingested. If it's ever interrupted or restarted,
# it recovers the ingestion of each document from the last completed step, guaranteeing
# that every document gets ingested and none are lost.

queue = Queue("indexing_queue")


@DBOS.workflow()
def indexing_workflow(urls: List[HttpUrl]):
    handles: List[WorkflowHandle] = []
    for url in urls:
        handle = queue.enqueue(index_document, url)
        handles.append(handle)
    indexed_pages = 0
    for handle in handles:
        indexed_pages += handle.get_result()
    DBOS.logger.info(f"Indexed {len(urls)} documents totaling {indexed_pages} pages")


# This function ingests a PDF document from a URL. It downloads it, scans it into pages,
# then uses LlamaIndex to embed it and store the embedding in Postgres.

# We annotate this function with DBOS.step() to mark it as a step in our indexing workflow.
# Additionally, in case of transient failures (for example in downloading the document), we set it
# to automatically retry indexing up to 5 times with exponential backoff.


@DBOS.step(retries_allowed=True, max_attempts=5)
def index_document(document_url: HttpUrl) -> int:
    with TemporaryDirectory() as temp_dir:
        temp_file_path = os.path.join(temp_dir, "file.pdf")
        with open(temp_file_path, "wb") as temp_file:
            with requests.get(document_url, stream=True) as r:
                r.raise_for_status()
                for page in r.iter_content(chunk_size=8192):
                    temp_file.write(page)
            temp_file.seek(0)
            reader = PDFReader()
            pages = reader.load_data(temp_file_path)
    for page in pages:
        index.insert(page)
    return len(pages)


# This is the endpoint for indexing. It starts the indexing workflow in the background
# on a batch of documents.

# To test it out, try this example cURL command to index Apple's SEC 10-K filings
# for 2021, 2022, and 2023.

"""
curl -X POST "http://localhost:8000/index" \
     -H "Content-Type: application/json" \
     -d '{"urls": ["https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/faab4555-c69b-438a-aaf7-e09305f87ca3.pdf", "https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/b4266e40-1de6-4a34-9dfb-8632b8bd57e0.pdf", "https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/42ede86f-6518-450f-bc88-60211bf39c6d.pdf"]}'
"""


class URLList(BaseModel):
    urls: List[HttpUrl]


@app.post("/index")
async def index_endpoint(urls: URLList):
    DBOS.start_workflow(indexing_workflow, urls.urls)


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

if __name__ == "__main__":
    DBOS.launch()
    uvicorn.run(app, host="0.0.0.0", port=8000)