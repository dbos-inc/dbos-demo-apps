import datetime
import html
import os
import re
from typing import List, Dict
import requests
import uuid
from io import BytesIO
from PyPDF2 import PdfReader
from sqlalchemy.engine import create_engine
from sqlalchemy import URL
from pydantic import BaseModel

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_postgres.vectorstores import PGVector
from langchain_community.vectorstores import DistanceStrategy
from langchain_core.runnables import RunnablePassthrough
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from utils import decode_paper_url

# Import FastAPI to serve requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse

# Import Together Python SDK and the Langchain Together.ai integration
from langchain_together import TogetherEmbeddings, ChatTogether
from together import Together

# Import DBOS lightweight annotations
from dbos import DBOS, SetWorkflowID, load_config

# Import the sqlalchemy schema representing papers metadata
from schema import papers_metadata

# First, we'll create a FastAPI app and a DBOS instance
# The app will expose endpoints to upload and search for papers
# The DBOS instance will manage durable execution
app = FastAPI()
dbos = DBOS(fastapi=app)
dbos_config = load_config()
print(dbos_config["database"]["password"])

# Now, let's setup a vector store to store embeddings
# We will use BERT, served by Together.ai, and postgres/pgvector as a vector store
embeddings = TogetherEmbeddings(
    model="togethercomputer/m2-bert-80M-8k-retrieval",
)
db_url = URL.create(
    "postgresql",
    username=dbos_config["database"]["username"],
    password=dbos_config["database"]["password"],
    host=dbos_config["database"]["hostname"],
    port=dbos_config["database"]["port"],
    database=dbos_config["database"]["app_db_name"],
)
db_engine = create_engine(db_url)
vector_store = PGVector(
    embeddings=embeddings,
    collection_name="pdf_tokens",
    connection=db_engine,
    use_jsonb=True,
    distance_strategy=DistanceStrategy.COSINE,
    create_extension=True,
)

#######################
#### UPLOAD PAPERS ####
#######################

# Let's program an endpoint to upload papers
# @app.get() is a FastAPI decorator that maps a URL to `upload_paper()`
# `upload_paper()` will synchronously invoke a DBOS workflow (upload_paper_workflow), then return its result
@app.get("/uploadPaper")
def upload_paper(paper_url: str, paper_title: str):
    paper_id = uuid.uuid4()
    with SetWorkflowID(str(uuid.uuid4())):
        handle = dbos.start_workflow(upload_paper_workflow, paper_url, paper_title, paper_id)
    return handle.get_result()

# Let's register a DBOS workflow. It does three things:
# 1. Record the paper metadata in the database (exactly once, using a DBOS 'transaction')
# 2. Download the paper (at least once, using a DBOS 'step')
# 3. Store the paper embeddings in the vector store (at least once, using a DBOS 'step'
# DBOS workflows are resilient to failure: if an error occurs, the workflow will resume exactly where it left off
@dbos.workflow()
def upload_paper_workflow(paper_url: str, paper_title: str, paper_id: uuid.UUID) -> str:
    compensation_actions = []

    # We expect URLs in base64
    decoded_url = decode_paper_url(paper_url)

    # Create a record in the database for the paper. If this fails, record a compensation action
    record_paper_metadata(paper_title, decoded_url, paper_id)
    compensation_actions.append(lambda: delete_paper_metadata(paper_id))

    # Download the paper and breaks it down into pages.
    try:
        paper_blob = download_paper(decoded_url)
        reader = PdfReader(BytesIO(paper_blob))
        pages = [page.extract_text() for page in reader.pages]
    except Exception as e:
        DBOS.logger.error(f"Failed to download or parse the paper: {e}")
        for action in compensation_actions:
            action()
        raise e

    # Retrieve the embeddings using Together.ai and store them in our vector store
    try:
        store_paper_embeddings(pages, paper_id)
    except Exception as e:
        DBOS.logger.error(f"Failed to store the embeddings: {e}")
        for action in compensation_actions:
            action()
        raise e

    return {"title": paper_title, "url": decoded_url, "id": paper_id}

# Record the paper metadata in the database using a DBOS Transaction. Note the usage of `DBOS.sql_session` to execute SQL queries
# Using this session, DBOS will automatically bundle the database queries in a transaction
# It will also insert metadata for this step in the same transaction to provide exactly-once execution
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

# Delete the paper metadata in the database using a DBOS Transaction
@dbos.transaction()
def delete_paper_metadata(paper_id: uuid.UUID):
    DBOS.sql_session.execute(
        papers_metadata.delete().where(
            papers_metadata.c.uuid == paper_id
        )
    )
    DBOS.logger.info(f"Deleted metadata for {paper_id}")

# Download the paper using a DBOS Step. This function will execute at least once
# You can configure the retry behavior of the step. See https://docs.dbos.dev/
@dbos.step()
def download_paper(paper_url: str) -> bytes:
    DBOS.logger.info(f"Downloading paper from {paper_url}")
    response = requests.get(paper_url.rstrip())
    if response.status_code != 200:
        raise Exception(f"Failed to download paper: {response.status_code}")
    return response.content

# Store the paper embeddings in the vector store using a DBOS step. This function will execute at least once
@dbos.step()
def store_paper_embeddings(pages: List[str], paper_id: uuid.UUID):
    # Create large enough chunks to avoid rate limits from together.ai
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

###################################
#### ASK A QUESTION TO A PAPER ####
###################################

# ChatTogether will let us query Together.ai for interacting with a paper
model = ChatTogether(
    model="mistralai/Mixtral-8x7B-Instruct-v0.1",
)

# We will now expose an endpoint to ask a question about a paper
# First let's define a prompt template for questionning a paper
ask_paper_template = """ <s>[INST]
    You are the author of this research paper: {context}
    Someone asks you the following question about the paper:

    Question: {question}

    Support your answer with excerpts from the paper.
    Excerpts should not include figures captions.

    [/INST]
"""
ask_paper_prompt = ChatPromptTemplate.from_template(ask_paper_template)

# Then let's declare the endpoint.
# This is a one-shot operation that does require durability, so we don't mark it as a DBOS operation
class PaperQuestion(BaseModel):
    question: str
    paper_name: str

@app.post("/askPaper")
@dbos.workflow()
def ask_paper_endpoint(q: PaperQuestion):
    # First retrieve the paper's metadata
    paper = get_paper(q.paper_name)
    if paper is None:
        raise HTTPException(status_code=404, detail=f"Paper {q.paper_name} not found")
    DBOS.logger.debug(f"Retrieved paper metadata: {paper}")

    # Then ask the question to the paper
    DBOS.logger.info(f"Asked question: '{q.question}' to paper {q.paper_name}")
    try:
        # Use our vector store to retrieve the paper embeddings
        retriever = vector_store.as_retriever(
            filter={"id": paper.uuid}
        )
        # The chain simply invokes the model with the question and parses the output
        chain = (
            {"context": retriever, "question": RunnablePassthrough()}
            | ask_paper_prompt
            | model
            | StrOutputParser()
        )
        answer = chain.invoke(q.question)
    except Exception as e:
        msg = f"Failed to retrieve answer from the paper: {e}"
        DBOS.logger.error(msg)
        raise HTTPException(status_code=500, detail=msg)

    return answer

########################################
#### SEARCH FOR RELATED HD COMMENTS ####
########################################

# Now, we will expose an endpoint to search for HN comments related to a paper
# This is a multi-agent workflow that requires durability, so we will use DBOS

# Prompt template for identifying topics in a paper
topics_search_template = """ <s>[INST]
    You are the author of this research paper: {context}

    List the {question} most important topics addressed by the paper.

    Format your answer as a list of at most 2 words strings. Do not add any additional information. For example:
    Topic 1
    Topic 2
    Topic 3

    Do not number items in the list.

    [/INST]
"""
topics_search_prompt = ChatPromptTemplate.from_template(topics_search_template)

# The handler invokes a DBOS workflow, block until the workflow completes, then return its result
@app.get("/startSearch")
def search_paper(paper_name: str):
    DBOS.logger.info(f"Searching for comments on paper {paper_name}")
    with SetWorkflowID(str(uuid.uuid4())):
        handle = dbos.start_workflow(search_paper_workflow, paper_name)
    comments = handle.get_result()
    return comments

# The DBOS workflow. It does three things:
#   1. Query the paper for a list of main topics in the paper
#   2. Search for comments on these topics on Hackernews
#   3. Rank each topic's comment and select the most relevant one
# Durability is important for this workflow. If it fails, we want to resume exactly where we left off and not consume our together.ai credits
@dbos.workflow()
def search_paper_workflow(paper_name: str):
    # First retrieve the paper's metadata
    paper = get_paper(paper_name)
    if paper is None:
        raise HTTPException(status_code=404, detail=f"Paper {paper_name} not found")
    DBOS.logger.debug(f"Retrieved paper metadata: {paper}")

    # Query the paper for a list of topics
    topics_number = "5"
    try:
        retriever = vector_store.as_retriever(
            filter={"id": paper.uuid}
        )
        chain = (
            {"context": retriever, "question": RunnablePassthrough()}
            | topics_search_prompt
            | model
            | StrOutputParser()
        )
        topics = chain.invoke(topics_number).split("\n")
    except Exception as e:
        DBOS.logger.error(f"Failed to retrieve topics from the paper: {e}")
        return
    DBOS.logger.info(topics)

    # Search for hackernews comments on these topics
    try:
        results = search_topics(topics)
    except Exception as e:
        DBOS.logger.error(f"Failed to search for comments: {e}")
        return

    # Rank the comments
    try:
        relevant_comments = rank_comments(results)
    except Exception as e:
        DBOS.logger.error(f"Failed to rank comments: {e}")
        return
    return relevant_comments

def search_topics(topics: List[str]) -> Dict[str, List[Dict]]:
    results = {}
    for topic in topics:
        results[topic] = search_hackernews(topic, window_size_hours=730)
    return results

# Search for comments on a list of topics using a DBOS step
@dbos.step()
def search_hackernews(topic: str, window_size_hours: int) -> List[Dict[str, str]]:
    threshold = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=window_size_hours)

    params = {
        "tags": "comment",
        "query": topic,
        "numericFilters": f"created_at_i>{threshold.timestamp()}",
    }
    response = requests.get("http://hn.algolia.com/api/v1/search", params).json()
    DBOS.logger.info(f"Found {len(response['hits'])} comments on topic {topic}")

    hits = []
    for hit in response["hits"]:
        # Reformat the comment by unescaping HTML, adding newlines, and removing HTML tags
        comment = hit["comment_text"]
        comment = re.sub("<p>", "\n", html.unescape(comment))
        comment = re.sub("<[^<]+?>", "", comment)
        url = f"https://news.ycombinator.com/item?id={hit['objectID']}"
        hits.append({
            "topic": topic,
            "comment": comment,
            "url": url,
            "story_title": hit["story_title"],
        })
    return hits

# Rank the comments using Together.ai and Salesforce Llama-Rank
@dbos.step()
def rank_comments(comments: Dict[str, List[Dict]]) -> Dict[str, Dict]:
    results = []
    client = Together()
    for topic, result in comments.items():
        if len(result) > 0:
            response = client.rerank.create(
                model="Salesforce/Llama-Rank-V1",
                query="Select the comment most relevant to the topic_query",
                documents=result,
                top_n=1
            )
            most_relevant_comment = result[response.results[0].index]
            DBOS.logger.info(f"Most relevant comment for topic {topic}:")
            DBOS.logger.info(most_relevant_comment['comment'])
            DBOS.logger.info(most_relevant_comment['url'])
            results.append(most_relevant_comment)
    return results

@dbos.transaction()
def get_paper(name: str):
    return DBOS.sql_session.execute(
        papers_metadata.select().where(papers_metadata.c.name == name)
    ).mappings().first()

##################
#### FRONTEND ####
##################

# In production, we recommend using DBOS primarily for the backend, with your frontend deployed elsewhere

@app.get("/")
def frontend():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)

# Let's program an endpoint to get all papers
@app.get("/papers")
@dbos.transaction()
def get_papers():
    rows = DBOS.sql_session.execute(papers_metadata.select())
    return [dict(row) for row in rows.mappings()]

@dbos.transaction()
def get_paper(name: str):
    return DBOS.sql_session.execute(
        papers_metadata.select().where(papers_metadata.c.name == name)
    ).mappings().first()
