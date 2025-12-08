from llama_index.core import Settings, StorageContext, VectorStoreIndex
from llama_index.vector_stores.postgres import PGVectorStore
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url


def configure_index(database_url: str):
    Settings.chunk_size = 512
    db = make_url(database_url)

    # First, connect to the default 'postgres' database to create the target database if needed
    default_db_url = db.set(database="postgres")
    engine = create_engine(default_db_url, isolation_level="AUTOCOMMIT")

    try:
        with engine.connect() as conn:
            # Check if the database exists
            result = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :dbname"),
                {"dbname": db.database},
            )
            database_exists = result.fetchone() is not None

            if not database_exists:
                print(f"Database '{db.database}' does not exist. Creating it...")
                # Create the database
                conn.execute(text(f'CREATE DATABASE "{db.database}"'))
                print(f"Database '{db.database}' created successfully.")
            else:
                print(f"Database '{db.database}' already exists.")
    finally:
        engine.dispose()

    # Now set up the vector store schema in the database
    vector_store = PGVectorStore.from_params(
        database=db.database,
        host=db.host,
        password=db.password,
        port=db.port,
        user=db.username,
        perform_setup=True,  # Set up during migration step
    )

    vector_store._initialize()
    print("Vector store initialized successfully!")

    # Return a vector index using pgvector
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    index = VectorStoreIndex([], storage_context=storage_context)
    chat_engine = index.as_chat_engine()
    return index, chat_engine
