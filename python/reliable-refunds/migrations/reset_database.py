# Each time the app is re-deployed, reset the database.

from dbos import get_dbos_database_url
from sqlalchemy import create_engine, delete

from reliable_refunds import schema

engine = create_engine(get_dbos_database_url())

with engine.connect() as connection:
    # Delete chat history
    connection.execute(delete(schema.chat_history))

    # Commit the transaction
    connection.commit()
