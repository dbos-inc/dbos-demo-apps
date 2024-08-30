from dbos import load_config
from langchain_postgres import PGVector
from langchain_postgres.vectorstores import PGVector
from langchain_together import TogetherEmbeddings
from langchain_community.vectorstores import DistanceStrategy
from sqlalchemy.engine.url import URL
from sqlalchemy.engine import create_engine

dbos_config = load_config()

db_url = URL.create(
    "postgresql",
    username=dbos_config["database"]["username"],
    password=dbos_config["database"]["password"],
    host=dbos_config["database"]["hostname"],
    port=dbos_config["database"]["port"],
    database=dbos_config["database"]["app_db_name"],
)
db_engine = create_engine(db_url)

embeddings = TogetherEmbeddings(
    model="togethercomputer/m2-bert-80M-8k-retrieval",
)

vector_store = PGVector(
    embeddings=embeddings,
    collection_name="pdf_tokens",
    connection=db_engine,
    use_jsonb=True,
    distance_strategy=DistanceStrategy.COSINE,
    create_extension=True,
)
