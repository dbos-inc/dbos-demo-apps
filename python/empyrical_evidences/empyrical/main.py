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

# We will use FastAPI to expose the application to the web
app = FastAPI()
# Configure a DBOS instance
dbos = DBOS(fastapi=app)

# Configure a Postgres vector store to use BERT embeddings, served by Together.ai
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

# ChatTogether will let us query Together.ai for exploring a paper's topics.
model = ChatTogether(
    model="mistralai/Mixtral-8x7B-Instruct-v0.1",
)

#######################
#### UPLOAD PAPERS ####
#######################

# Expose an endpoint to upload a paper. @app.get() is a FastAPI decorator that maps a URL to a function.
# The handler will invoke a DBOS workflow (upload_paper_workflow) block until the workflow completes, then return its result.
@app.get("/uploadPaper")
def upload_paper(paper_url: str, paper_title: str):
    paper_id = uuid.uuid4()
    with SetWorkflowUUID(str(uuid.uuid4())):
        handle = dbos.start_workflow(upload_paper_workflow, paper_url, paper_title, paper_id)
    return handle.get_result()

# Register a DBOS workflow. The workflow does three things:
# 1. Record the paper metadata in the database (exactly once, using a DBOS 'transaction')
# 2. Download the paper from the URL (at least once, using a DBOS 'communicator')
# 3. Store the paper embeddings in the vector store (at least once, using a DBOS 'communicator'. Note this could be an exactly-once transaction if we could manage the PGVector connection.)
# DBOS workflows are resilient to failure: if an error occurs, the workflow will resume exactly where it left off.
@dbos.workflow()
def upload_paper_workflow(paper_url: str, paper_title: str, paper_id: uuid.UUID):
    compensation_actions = []

    # Decode URL from base64. We expect base64 because we encode the paper URL in the endpoint's URL.
    # Ensure the string is properly padded and replace + and / with - and _
    # Note: this fails for some PDFs. Turns out parsing PDFs has a bunch of corner cases.
    missing_padding = len(paper_url) % 4
    if missing_padding:
        paper_url += '=' * (4 - missing_padding)
    paper_url = paper_url.replace('+', '-')
    paper_url = paper_url.replace('/', '_')
    decoded_url = base64.urlsafe_b64decode(paper_url).decode('utf-8')

    # Create a record in the database for the paper. Note: if this fail, record a compensation action.
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
        return

    # Retrieve the embeddings using Together.ai and store them in our vector store
    try:
        store_paper_embeddings(pages, paper_id)
    except Exception as e:
        DBOS.logger.error(f"Failed to store the embeddings: {e}")
        for action in compensation_actions:
            action()

# Record the paper metadata in the database using a DBOS Transaction. Note the usage of `DBOS.sql_session` to execute SQL queries.
# Using this session, DBOS will automatically bundle the database queries in a transaction.
# It will also insert metadata for this step in the same transaction, this guaranteeing extactly-once execution.
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

# Delete the paper metadata in the database using a DBOS Transaction.
@dbos.transaction()
def delete_paper_metadata(paper_id: uuid.UUID):
    DBOS.sql_session.execute(
        papers_metadata.delete().where(
            papers_metadata.c.uuid == paper_id
        )
    )
    DBOS.logger.info(f"Deleted metadata for {paper_id}")

# Download the paper from the URL using a DBOS Communicator. This function will execute at least once.
# You can configure the retry behavior of the communicator. See https://docs.dbos.dev/.
@dbos.communicator()
def download_paper(paper_url: str) -> bytes:
    DBOS.logger.info(f"Downloading paper from {paper_url}")
    response = requests.get(paper_url.rstrip())
    if response.status_code != 200:
        raise Exception(f"Failed to download paper: {response.status_code}")
    return response.content

# Store the paper embeddings in the vector store using a DBOS Communicator. This function will execute at least once.
# This could be a DBOS transaction, but PGVector managers its own connections
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

######################
#### QUERY PAPERS ####
######################

# Prompt template for searching a paper.
search_template = """ <s>[INST]
    You are the author of this research paper: {context}

    Question: {question}

    Format your answer as a list of at most 2 words strings. Do not add any additional information. For example:
    1. Topic 1
    2. Topic 2
    3. Topic 3

    [/INST]
"""
search_prompt = ChatPromptTemplate.from_template(search_template)

# Expose an endpoint to search for comments on a paper. The handler will invoke a DBOS workflow (search_paper_workflow) block until the workflow completes, then return its result.
@app.get("/startSearch")
def search_paper(paper_id: str):
    with SetWorkflowUUID(str(uuid.uuid4())):
        handle = dbos.start_workflow(search_paper_workflow, paper_id)
    comments = handle.get_result()
    return comments

# Register a DBOS workflow to search for comments on a paper. The workflow does three things:
# 1. Query the paper for a list of main topics in the paper
# 2. Search for comments on these topics on Hackernews
# 3. Rank each topic's comment and select the most relevant one
@dbos.workflow()
def search_paper_workflow(paper_id: str):
    # Query the paper for a list of topics
    retriever = vector_store.as_retriever(
        filter={"id": paper_id}
    )
    chain = (
        {"context": retriever, "question": RunnablePassthrough()}
        | search_prompt
        | model
        | StrOutputParser()
    )
    question = "List the 5 most meaningful topics that represent this paper's contribution."
    try:
        topics = chain.invoke(question).split("\n")
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

# Search for comments on a list of topics using a DBOS Communicator
@dbos.communicator()
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
            "query_topic": topic,
            "comment": comment,
            "url": url,
            "story_title": hit["story_title"],
        })
    return hits

# Rank the comments using Together.ai and Salesforce Llama-Rank
@dbos.communicator()
def rank_comments(comments: Dict[str, List[Dict]]) -> Dict[str, Dict]:
    results = {}
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
            results[topic] = most_relevant_comment
    return results
