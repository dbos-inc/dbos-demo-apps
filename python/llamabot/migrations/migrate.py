# A script to set up the vector store schema in the app's database

import os
from llama_index.vector_stores.postgres import PGVectorStore
from sqlalchemy import make_url

db_url = os.environ.get("DBOS_DATABASE_URL", "")
db_url_config = make_url(db_url)

vector_store = PGVectorStore.from_params(
    database=db_url_config.database,
    host=db_url_config.host,
    password=db_url_config.password,
    port=str(db_url_config.port),
    user=db_url_config.username,
    perform_setup=True,  # Set up the schema and tables
)

vector_store._initialize()
