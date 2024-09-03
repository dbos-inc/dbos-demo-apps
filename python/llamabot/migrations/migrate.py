# A script to set up the vector store schema in the app's database

from dbos import load_config
from llama_index.vector_stores.postgres import PGVectorStore
from sqlalchemy import URL

dbos_config = load_config()

vector_store = PGVectorStore.from_params(
    database=dbos_config["database"]["app_db_name"],
    host=dbos_config["database"]["hostname"],
    password=dbos_config["database"]["password"],
    port=str(dbos_config["database"]["port"]),
    user=dbos_config["database"]["username"],
    perform_setup=True,  # Set up the schema and tables
)

vector_store._initialize()
