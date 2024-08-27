from typing import List
import requests
import uuid
import base64
from io import BytesIO
from dbos import DBOS, SetWorkflowUUID
from fastapi import FastAPI
from PyPDF2 import PdfReader
from sqlalchemy.engine import create_engine
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_together import TogetherEmbeddings, ChatTogether
from langchain_postgres.vectorstores import PGVector
from langchain_community.vectorstores import DistanceStrategy
from langchain_core.runnables import RunnablePassthrough
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from schema import papers_metadata

app = FastAPI()
dbos = DBOS(fastapi=app)

embeddings = TogetherEmbeddings(
    model="togethercomputer/m2-bert-80M-8k-retrieval",
)
db_url = dbos.app_db.engine.url
db_engine = create_engine(db_url)
vector_store = PGVector(
    embeddings=embeddings,
    collection_name="pdf_tokens",
    connection=db_engine,
    use_jsonb=True,
    distance_strategy=DistanceStrategy.COSINE,
    create_extension=True,
)

model = ChatTogether(
    model="mistralai/Mixtral-8x7B-Instruct-v0.1",
)

#### UPLOAD PAPERS #### 
@app.get("/uploadPaper")
def upload_paper(paper_url: str, paper_title: str):
    paper_id = uuid.uuid4()
    with SetWorkflowUUID(str(paper_id)):
        dbos.start_workflow(upload_paper_workflow, paper_url, paper_title, paper_id)
    return {"paper_id": paper_id}

@dbos.workflow()
def upload_paper_workflow(paper_url: str, paper_title: str, paper_id: uuid.UUID):
    # Decode URL from base64. Ensure the string is properly padded
    missing_padding = len(paper_url) % 4
    if missing_padding:
        paper_url += '=' * (4 - missing_padding)
    decoded_url = base64.urlsafe_b64decode(paper_url).decode('utf-8')

    # Create a record in the database for the paper
    record_paper_metadata(paper_title, decoded_url, paper_id)

    # Download the paper
    paper_blob = BytesIO(download_paper(decoded_url))
    reader = PdfReader(paper_blob)
    pages = [page.extract_text() for page in reader.pages]

    # Retrieve the embeddings using together.ai and store them in our vector store
    store_paper_embeddings(pages, paper_id)

@dbos.transaction()
def record_paper_metadata(paper_title: str, paper_url: str, paper_id: uuid.UUID):
    DBOS.sql_session.execute(
        papers_metadata.insert().values(
            uuid=paper_id,
            name=paper_title,
            url=paper_url,
        )
    )
    DBOS.logger.info(f"Recorded metadata for {paper_title}")

@dbos.communicator()
def download_paper(paper_url: str) -> bytes:
    return requests.get(paper_url).content

# FIXME: this should be a transaction, but PGVector managers its own connections
@dbos.communicator()
def store_paper_embeddings(pages: List[str], paper_id: uuid.UUID):
    # Create large enough chunks to avoid beeing rate limited by together.ai
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=3000,
        chunk_overlap=200,
        length_function=len
    )

    # Set the paper_id in the Document metadata
    DBOS.logger.info(f"Chunking {len(pages)} pages")
    metadatas = [{"id": str(paper_id)} for _ in pages]
    documents = text_splitter.create_documents(pages, metadatas=metadatas)
    split_pages = text_splitter.split_documents(documents) 

    # Feed our vector store
    DBOS.logger.info(f"Storing {len(split_pages)} chunks of length 3000 with overlap 200")
    vector_store.add_documents(split_pages)
    DBOS.logger.info("Fed vector store")


#### QUERY PAPERS ####
summarize_template = """ <s>[INST]
    You are an accomplished computer scientists would wants to help new doctoral students
    understand queuing theory applied to systems research. Answer the question based only on the following context:
    {context}

    Question: {question} [/INST]
"""
summarize_prompt = ChatPromptTemplate.from_template(summarize_template)

@app.get("/summarizePaper")
def summarize_paper(paper_id: str):
    retriever = vector_store.as_retriever(
        filter={"id": paper_id}
    )

    chain = (
        {"context": retriever, "question": RunnablePassthrough()}
        | summarize_prompt
        | model
        | StrOutputParser()
    )

    return chain.invoke("Summarize this paper")