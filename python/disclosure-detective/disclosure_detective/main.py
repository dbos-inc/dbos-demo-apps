import os
from tempfile import TemporaryDirectory
from typing import List
from dbos import DBOS, load_config

import requests
from llama_index.core import VectorStoreIndex, StorageContext, Settings, Document
from llama_index.readers.file import PDFReader
from llama_index.vector_stores.postgres import PGVectorStore

Settings.chunk_size = 512

apple_2024_10K_url = "https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/faab4555-c69b-438a-aaf7-e09305f87ca3.pdf"


def fetch_and_read_document(
    document_url,
) -> List[Document]:
    with TemporaryDirectory() as temp_dir:
        temp_file_path = os.path.join(temp_dir, "file.pdf")
        with open(temp_file_path, "wb") as temp_file:
            with requests.get(document_url, stream=True) as r:
                r.raise_for_status()
                for chunk in r.iter_content(chunk_size=8192):
                    temp_file.write(chunk)
            temp_file.seek(0)
            reader = PDFReader()
            return reader.load_data(temp_file_path)


apple_doc = fetch_and_read_document(apple_2024_10K_url)

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
index = VectorStoreIndex.from_documents(apple_doc, storage_context=storage_context)

query_engine = index.as_chat_engine()

response = query_engine.chat("My name is steve")

print(response)

response = query_engine.chat("How much did Apple make in 2023?")

print(response)

response = query_engine.chat("What is my name?  How much did Apple make in 2022?")

print(response)
