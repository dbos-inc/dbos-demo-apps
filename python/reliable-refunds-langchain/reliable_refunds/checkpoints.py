from collections.abc import Iterator
from contextlib import contextmanager

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.checkpoint.sqlite import SqliteSaver
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from sqlalchemy import Connection, create_engine, make_url, text
from sqlalchemy.orm import Session


@contextmanager
def open_checkpointer(database_url: str) -> Iterator[BaseCheckpointSaver]:
    """Keep the checkpoint connection open for the lifetime of the agent."""
    url = make_url(database_url)
    if url.get_backend_name() == "sqlite":
        if url.database in (None, "", ":memory:") or url.query.get("mode") == "memory":
            raise ValueError("This app requires a SQLite file, e.g. sqlite:///app_db.sqlite")
        # Use the same SQLAlchemy URL handling as purchases and DBOS, including
        # SQLite URI query parameters. FastAPI may use different worker threads.
        engine = create_engine(url, connect_args={"check_same_thread": False})
        try:
            with engine.connect() as connection:
                saver = SqliteSaver(connection.connection.driver_connection)
                saver.setup()
                yield saver
        finally:
            engine.dispose()
    else:
        connection_string = url.set(drivername="postgresql").render_as_string(
            hide_password=False
        )
        with ConnectionPool(
            connection_string,
            kwargs={
                "autocommit": True,
                "prepare_threshold": 0,
                "row_factory": dict_row,
            },
        ) as pool:
            yield PostgresSaver(pool)


def clear_checkpoints(connection: Connection | Session) -> None:
    """Clear chat history using the tables belonging to each checkpoint backend."""
    bind = connection.get_bind() if isinstance(connection, Session) else connection
    # LangGraph's savers define different schemas: SqliteSaver uses "writes"
    # and stores checkpoint data in "checkpoints"; PostgresSaver uses
    # "checkpoint_writes" and a separate "checkpoint_blobs" table.
    if bind.dialect.name == "sqlite":
        tables = ["writes", "checkpoints"]
    else:
        tables = ["checkpoint_writes", "checkpoint_blobs", "checkpoints"]
    for table in tables:
        connection.execute(text(f"DELETE FROM {table}"))
