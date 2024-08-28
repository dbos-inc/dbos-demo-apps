import datetime
import html
import re
from typing import List, Dict
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
from together import Together

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
    with SetWorkflowUUID(str(uuid.uuid4())):
        dbos.start_workflow(upload_paper_workflow, paper_url, paper_title, paper_id)
    return {"paper_id": paper_id}

@dbos.workflow()
def upload_paper_workflow(paper_url: str, paper_title: str, paper_id: uuid.UUID):
    compensation_actions = []

    # Decode URL from base64. Ensure the string is properly padded and replace + and / with - and _
    missing_padding = len(paper_url) % 4
    if missing_padding:
        paper_url += '=' * (4 - missing_padding)
    paper_url = paper_url.replace('+', '-')
    paper_url = paper_url.replace('/', '_')
    decoded_url = base64.urlsafe_b64decode(paper_url).decode('utf-8')

    # Create a record in the database for the paper
    record_paper_metadata(paper_title, decoded_url, paper_id)
    compensation_actions.append(lambda: delete_paper_metadata(paper_id))

    # Download the paper
    try:
        paper_blob = download_paper(decoded_url)
        reader = PdfReader(BytesIO(paper_blob))
        pages = [page.extract_text() for page in reader.pages]
    except Exception as e:
        DBOS.logger.error(f"Failed to download or parse the paper: {e}")
        for action in compensation_actions:
            action()
        return

    # Retrieve the embeddings using together.ai and store them in our vector store
    try:
        store_paper_embeddings(pages, paper_id)
    except Exception as e:
        DBOS.logger.error(f"Failed to store the embeddings: {e}")
        for action in compensation_actions:
            action()

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

@dbos.transaction()
def delete_paper_metadata(paper_id: uuid.UUID):
    DBOS.sql_session.execute(
        papers_metadata.delete().where(
            papers_metadata.c.uuid == paper_id
        )
    )
    DBOS.logger.info(f"Deleted metadata for {paper_id}")

@dbos.communicator()
def download_paper(paper_url: str) -> bytes:
    DBOS.logger.info(f"Downloading paper from {paper_url}")
    response = requests.get(paper_url.rstrip())
    if response.status_code != 200:
        raise Exception(f"Failed to download paper: {response.status_code}")
    return response.content

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
search_template = """ <s>[INST]
    You are the author of this research paper: {context}

    Question: List the {question} most meaningful topics that represent this paper's contribution.
   
    Format your answer as a list of at most 2 words strings. Do not add any additional information. For example:
    1. Topic 1
    2. Topic 2
    3. Topic 3
    
    [/INST]
"""
search_prompt = ChatPromptTemplate.from_template(search_template)

@app.get("/startSearch")
def search_paper(paper_id: str):
    retriever = vector_store.as_retriever(
        filter={"id": paper_id}
    )

    chain = (
        {"context": retriever, "question": RunnablePassthrough()}
        | search_prompt
        | model
        | StrOutputParser()
    )

    topics = chain.invoke("5").split("\n")
    DBOS.logger.info(topics)
    results = search_topics(topics)

    client = Together()
    for topic, result in results.items():
        if len(result) > 0:
            response = client.rerank.create(
                model="Salesforce/Llama-Rank-V1",
                query="Select the comment most relevant to the topic_query",
                documents=result,
                top_n=1
            )
            most_relevant_comment = result[response.results[0].index]
            DBOS.logger.info(most_relevant_comment['comment'])
            DBOS.logger.info(most_relevant_comment['url'])

    #run_hourly(scheduled_time=datetime.now(), actual_time=datetime.now(), topics=topics)

'''
@dbos.workflow()
def run_hourly(scheduled_time: datetime, actual_time: datetime, topics: List[str]):
    last_exec_time = None
    while True:
        # Run every hour
        if last_exec_time is not None and datetime.now() - last_exec_time >= timedelta(hours=1):
            for topic in topics:
                results = search_hackernews(topic, window_size_hours=1)
                for comment, url in results:
                    DBOS.logger.info(comment, url)
            DBOS.logger.info(f"Found {len(results)} comments at {str(actual_time)}")
            last_exec_time = datetime.now()

            # Call the SAlesforce model to rank the result and return the 3 most relevant
'''

def search_topics(topics: List[str]) -> Dict[str, List[Dict]]:
    results = {}
    for topic in topics:
        results[topic] = search_hackernews(topic, window_size_hours=730)
    return results

@dbos.communicator()
def search_hackernews(query: str, window_size_hours: int):
    threshold = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=window_size_hours)

    params = {
        "tags": "comment",
        "query": query,
        "numericFilters": f"created_at_i>{threshold.timestamp()}",
    }
    response = requests.get("http://hn.algolia.com/api/v1/search", params).json()
    DBOS.logger.info(f"Found {len(response['hits'])} comments on topic {query}")

    hits = []
    for hit in response["hits"]:
        # Reformat the comment by unescaping HTML, adding newlines, and removing HTML tags
        comment = hit["comment_text"]
        comment = re.sub("<p>", "\n", html.unescape(comment))
        comment = re.sub("<[^<]+?>", "", comment)
        url = f"https://news.ycombinator.com/item?id={hit['objectID']}"
        hits.append({
            "query_topic": query,
            "comment": comment,
            "url": url,
            "story_title": hit["story_title"],
        })
    return hits