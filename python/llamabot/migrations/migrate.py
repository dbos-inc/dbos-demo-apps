# A script to set up the vector store schema in the app's database

import os
from llama_index.vector_stores.postgres import PGVectorStore
from sqlalchemy.engine import make_url

connection_string = os.environ.get("DBOS_DATABASE_URL", "postgres://postgres:dbos@localhost:5432/llamabot?connect_timeout=5")
db = make_url(connection_string)

vector_store = PGVectorStore.from_params(
    database=db.database,
    host=db.host,
    password=db.password,
    port=db.port,
    user=db.username,
    perform_setup=True,  # Set up the schema and tables
)

vector_store._initialize()
