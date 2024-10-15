import os
from tempfile import TemporaryDirectory
from typing import List

from pydantic import BaseModel, HttpUrl
import requests
from fastapi import FastAPI
from dbos import load_config
from llama_index.core import Settings, StorageContext, VectorStoreIndex
from llama_index.readers.file import PDFReader
from llama_index.vector_stores.postgres import PGVectorStore

apple_2024_10K_url = "https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/faab4555-c69b-438a-aaf7-e09305f87ca3.pdf"

app = FastAPI()

def construct_index():
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
    return VectorStoreIndex([], storage_context=storage_context)


index = construct_index()


def index_document(document_url) -> int:
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


class URLList(BaseModel):
    urls: List[HttpUrl]

"""
curl -X POST "http://localhost:8000/index" \
     -H "Content-Type: application/json" \
     -d '{"urls": ["https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/faab4555-c69b-438a-aaf7-e09305f87ca3.pdf"]}'
"""

@app.post("/index")
async def index_endpoint(urls: URLList):
    indexed_pages = 0
    for url in urls.urls:
        indexed_pages += index_document(url)
    return {"indexed_pages": indexed_pages}

query_engine = index.as_chat_engine()

response = query_engine.chat("What was Apple's total revenue in 2023?")

print(response)

response = query_engine.chat("What was Apple's total revenue in 2022?")

print(response)
