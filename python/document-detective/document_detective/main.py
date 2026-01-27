import os
from tempfile import TemporaryDirectory
from typing import List

import requests
import uvicorn
from dbos import DBOS, DBOSConfig, Queue, WorkflowHandle
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from llama_index.core import Document
from llama_index.readers.file import PDFReader
from pydantic import BaseModel, HttpUrl

from .index import configure_index

database_url = os.environ.get("DBOS_SYSTEM_DATABASE_URL")
if not database_url:
    raise Exception("DBOS_SYSTEM_DATABASE_URL not set")

app = FastAPI()
config: DBOSConfig = {
    "name": "document-detective",
    "system_database_url": database_url,
    "conductor_key": os.environ.get("CONDUCTOR_KEY"),
    "application_version": "0.1.0",
}
DBOS(config=config)


# First, let's initialize LlamaIndex to use Postgres with pgvector as its vector store.

index, chat_engine = configure_index(database_url)

# Now, let's write the document ingestion pipeline. Because ingesting and indexing documents may
# take a long time, we need to build a pipeline that's both concurrent and reliable.
# It needs to process multiple documents at once and it needs to be resilient to failures,
# so if the application is interrupted or restarted, or encounters an error, it can
# recover from where it left off instead of restarting from the beginning or losing
# some documents entirely.

# We'll build a concurrent, reliable data ingestion pipeline using DBOS workflows and queues.
# This workflow takes in a batch of document URLs and enqueues
# them for indexing. It then waits for them all to complete and counts how
# many total documents and pages were indexed. If it's ever interrupted or restarted,
# it recovers the indexing of each document from the last completed step, guaranteeing
# that every document gets indexed and none are lost.

queue = Queue("indexing_queue")


@DBOS.workflow()
def index_documents(urls: List[HttpUrl]):
    handles: List[WorkflowHandle] = []
    # Enqueue each document for indexing
    for url in urls:
        handle = queue.enqueue(index_document, url)
        handles.append(handle)
    # Wait for all documents to finish indexing, count the total number of indexed pages
    indexed_pages = 0
    for handle in handles:
        indexed_pages += handle.get_result()
    print(f"Indexed {len(urls)} documents totaling {indexed_pages} pages")


# This workflow indexes a document from a URL.
# First, it downloads the document and parses it into pages.
# Then, it adds each page to the vector index.


@DBOS.workflow()
def index_document(document_url: HttpUrl) -> int:
    pages = download_document(document_url)
    for page in pages:
        index_page(page)
    return len(pages)


@DBOS.step()
def download_document(document_url: HttpUrl):
    # Download the document to a temporary file
    print(f"Downloading document from {document_url}")
    with TemporaryDirectory() as temp_dir:
        temp_file_path = os.path.join(temp_dir, "document.pdf")
        with open(temp_file_path, "wb") as temp_file:
            with requests.get(document_url, stream=True) as r:
                r.raise_for_status()
                for page in r.iter_content(chunk_size=8192):
                    temp_file.write(page)
        # Parse the document into pages
        reader = PDFReader()
        pages = reader.load_data(temp_file_path)
    return pages


@DBOS.step()
def index_page(page: Document):
    # Insert a page into the vector index
    try:
        index.insert(page)
    except Exception as e:
        print("Error indexing page:", page, e)


# This is the endpoint for indexing. It starts the indexing workflow in the background
# on a batch of documents.

# For example, try this cURL command to index Apple's SEC 10-K filings for 2020-2024:

"""
curl -X POST "http://localhost:8000/index" \
     -H "Content-Type: application/json" \
     -d '{"urls": [
        "https://dbos-hackathon.s3.us-east-1.amazonaws.com/apple-filings/apple-10k-2020.pdf",
        "https://dbos-hackathon.s3.us-east-1.amazonaws.com/apple-filings/apple-10k-2021.pdf",
        "https://dbos-hackathon.s3.us-east-1.amazonaws.com/apple-filings/apple-10k-2022.pdf",
        "https://dbos-hackathon.s3.us-east-1.amazonaws.com/apple-filings/apple-10k-2023.pdf",
        "https://dbos-hackathon.s3.us-east-1.amazonaws.com/apple-filings/apple-10k-2024.pdf"
]}'
"""


class URLList(BaseModel):
    urls: List[HttpUrl]


@app.post("/index")
def index_endpoint(urls: URLList):
    DBOS.start_workflow(index_documents, urls.urls)


# Now, let's chat! We'll build a simple chat interface that stores history in memory.
# Every time it gets a question, it answers using a RAG chat engine powered by the vector store.


class ChatSchema(BaseModel):
    message: str


class ChatHistoryItem(BaseModel):
    content: str
    isUser: bool


class ChatHistory(BaseModel):
    history: List[ChatHistoryItem]


chat_history: List[ChatHistoryItem] = []


@app.post("/chat")
def chat(chat: ChatSchema) -> ChatHistoryItem:
    query = ChatHistoryItem(content=chat.message, isUser=False)
    chat_history.append(query)
    responseMessage = str(chat_engine.chat(chat.message))
    response = ChatHistoryItem(content=responseMessage, isUser=True)
    chat_history.append(response)
    return response


# Let's also write a history endpoint.
# This function is called when we open up the chatbot so it
# can display your chat history.


@app.get("/history")
def history_endpoint() -> ChatHistory:
    return ChatHistory(history=chat_history)


@app.get("/")
def frontend():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)


if __name__ == "__main__":
    DBOS.launch()
    uvicorn.run(app, host="0.0.0.0", port=8000)
