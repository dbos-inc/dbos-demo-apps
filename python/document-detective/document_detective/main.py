# In this app, we use DBOS and LlamaIndex to build and serverlessly deploy a chat agent that can index PDF documents and answer questions about them.

# First, let's do imports and initialize DBOS.

import os
from collections import deque
from tempfile import TemporaryDirectory
from typing import List
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dbos import DBOS, Queue, WorkflowHandle, load_config
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from llama_index.core import Settings, StorageContext, VectorStoreIndex
from llama_index.core.node_parser import HTMLNodeParser
from llama_index.readers.file import HTMLTagReader
from llama_index.vector_stores.postgres import PGVectorStore
from pydantic import BaseModel, HttpUrl

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
def indexing_workflow(docs_url: str):
    urls = crawl_website(docs_url)
    handles: List[WorkflowHandle] = []
    for url in urls:
        DBOS.logger.info(f"Indexing URL: {url}")
        handle = queue.enqueue(index_document, url)
        handles.append(handle)
    indexed_documents = 0
    for handle in handles:
        indexed_documents += handle.get_result()
    DBOS.logger.info(
        f"Indexed {len(urls)} pages totaling {indexed_documents} documents"
    )


@DBOS.step()
def crawl_website(start_url, max_pages=1000):
    # Normalize the start URL and extract the domain
    start_url = start_url.rstrip("/")
    domain = urlparse(start_url).netloc

    # Initialize data structures
    queue = deque([start_url])
    discovered_urls = set([start_url])
    crawled_urls = set()

    # Initialize session for better performance
    session = requests.Session()

    # Set headers to mimic a browser
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    while queue and len(crawled_urls) < max_pages:
        current_url = queue.popleft()

        if current_url in crawled_urls:
            continue

        try:
            # Mark as crawled
            crawled_urls.add(current_url)

            # Fetch the page
            response = session.get(current_url, headers=headers, timeout=10)
            response.raise_for_status()

            # Parse HTML
            soup = BeautifulSoup(response.text, "html.parser")

            # Find all links
            for link in soup.find_all("a", href=True):
                href = link["href"]

                # Convert relative URL to absolute URL
                absolute_url = urljoin(current_url, href)

                # Clean the URL
                parsed = urlparse(absolute_url)
                absolute_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                if parsed.query:
                    absolute_url += f"?{parsed.query}"

                # Skip if not in the same domain or already discovered
                if (
                    parsed.netloc != domain
                    or absolute_url in discovered_urls
                    or any(
                        ext in absolute_url.lower()
                        for ext in [".pdf", ".jpg", ".png", ".gif"]
                    )
                ):
                    continue

                # Add to queue and discovered set
                queue.append(absolute_url)
                discovered_urls.add(absolute_url)

        except Exception as e:
            DBOS.logger.warning(f"Error crawling {current_url}: {str(e)}")
            discovered_urls.remove(current_url)
            continue

    return discovered_urls


# This function ingests a PDF document from a URL. It downloads it, scans it into pages,
# then uses LlamaIndex to embed it and store the embedding in Postgres.

# We annotate this function with DBOS.step() to mark it as a step in our indexing workflow.
# Additionally, in case of transient failures (for example in downloading the document), we set it
# to automatically retry indexing up to 5 times with exponential backoff.


@DBOS.step(retries_allowed=False, max_attempts=5)
def index_document(document_url: HttpUrl) -> int:
    with TemporaryDirectory() as temp_dir:
        temp_file_path = os.path.join(temp_dir, "file.html")
        with open(temp_file_path, "wb") as temp_file:
            with requests.get(document_url, stream=True) as r:
                r.raise_for_status()
                for page in r.iter_content(chunk_size=8192):
                    temp_file.write(page)
            temp_file.seek(0)
            reader = HTMLTagReader(tag="p")
            documents = reader.load_data(temp_file_path)
    for i, document in enumerate(documents):
        document.id_ = f"{document_url}-{i}"
        DBOS.logger.info(f"Indexing document: {str(document)}")
    index.refresh(documents)
    return len(documents)


# This is the endpoint for indexing. It starts the indexing workflow in the background.

docs_url = os.environ.get("DOCS_URL", None)
if docs_url is None:
    raise Exception("Error: DOCS_URL is not set")


@app.post("/index")
async def index_endpoint():
    DBOS.start_workflow(indexing_workflow, docs_url)


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
