# A script to set up the vector store schema in the app's database

from dbos import load_config
from llama_index.vector_stores.postgres import PGVectorStore

dbos_config = load_config()

db = dbos_config["database"]
vector_store = PGVectorStore.from_params(
    database=db["app_db_name"],
    host=db["hostname"],
    password=db["password"],
    port=db["port"],
    user=db["username"],
    perform_setup=True,  # Set up during migration step
)

vector_store._initialize()
