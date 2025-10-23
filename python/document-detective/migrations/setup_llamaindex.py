# A script to set up the vector store schema in the app's database

import os

from llama_index.vector_stores.postgres import PGVectorStore
from sqlalchemy.engine.url import make_url

db = make_url(os.environ.get("DBOS_DATABASE_URL"))
vector_store = PGVectorStore.from_params(
    database=db.database,
    host=db.host,
    password=db.password,
    port=db.port,
    user=db.username,
    perform_setup=True,  # Set up during migration step
)

vector_store._initialize()
