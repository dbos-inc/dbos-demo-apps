import os
from tempfile import TemporaryDirectory
from typing import List

import requests
from llama_index.core import Document as LlamaIndexDocument
from llama_index.core import VectorStoreIndex
from llama_index.readers.file import PDFReader

apple_2024_10K_url = "https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/faab4555-c69b-438a-aaf7-e09305f87ca3.pdf"


def fetch_and_read_document(
    document_url,
) -> List[LlamaIndexDocument]:
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
print(apple_doc)

index = VectorStoreIndex.from_documents(apple_doc)
