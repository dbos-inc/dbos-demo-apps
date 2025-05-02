# A script to set up the vector store schema in the app's database

import os
from sqlalchemy.engine import make_url
from llama_index.vector_stores.postgres import PGVectorStore

connection_string = os.environ.get("DBOS_DATABASE_URL", "postgres://postgres:dbos@localhost:5432/document_detective?connect_timeout=5")
db = make_url(connection_string)

vector_store = PGVectorStore.from_params(
    database=db.database,
    host=db.host,
    password=db.password,
    port=db.port,
    user=db.username,
    perform_setup=True,  # Set up during migration step
)

vector_store._initialize()
