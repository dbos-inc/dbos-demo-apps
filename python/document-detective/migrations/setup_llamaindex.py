# A script to set up the vector store schema in the app's database

import os

from llama_index.vector_stores.postgres import PGVectorStore
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url

db = make_url(os.environ.get("DBOS_DATABASE_URL"))

# Create the database if it doesn't exist
# Connect to the default 'postgres' database to create our target database
postgres_url = db.set(database="postgres")
engine = create_engine(postgres_url, isolation_level="AUTOCOMMIT")

with engine.connect() as conn:
    # Check if database exists
    result = conn.execute(
        text("SELECT 1 FROM pg_database WHERE datname = :dbname"),
        {"dbname": db.database},
    )
    if not result.fetchone():
        # Create the database if it doesn't exist
        conn.execute(text(f'CREATE DATABASE "{db.database}"'))
        print(f"Created database: {db.database}")
    else:
        print(f"Database {db.database} already exists")

engine.dispose()

# Now set up the vector store in the database
vector_store = PGVectorStore.from_params(
    database=db.database,
    host=db.host,
    password=db.password,
    port=db.port,
    user=db.username,
    perform_setup=True,  # Set up during migration step
)

vector_store._initialize()

print("Initialized vector store")
