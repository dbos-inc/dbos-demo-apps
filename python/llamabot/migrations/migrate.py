from dbos import load_config
from llama_index.vector_stores.postgres import PGVectorStore
from sqlalchemy import URL

dbos_config = load_config()

db_url = URL.create(
    "postgresql",
    username=dbos_config["database"]["username"],
    password=dbos_config["database"]["password"],
    host=dbos_config["database"]["hostname"],
    port=dbos_config["database"]["port"],
    database=dbos_config["database"]["app_db_name"],
)

vector_store = PGVectorStore.from_params(
    database=db_url.database,
    host=db_url.host,
    password=db_url.password,
    port=str(db_url.port),
    user=db_url.username,
    embed_dim=1536,  # openai embedding dimension
    perform_setup=True,  # Set up the schema and tables
)

vector_store._initialize()
