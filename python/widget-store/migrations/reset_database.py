# Each time the app is re-deployed, reset the database.

from sqlalchemy import URL
from widget_store import schema
from dbos.dbos_config import load_config
from sqlalchemy import create_engine, Table, MetaData, delete, insert
from decimal import Decimal


dbos_config = load_config("dbos-config.yaml")
db_url = URL.create(
    "postgresql",
    username=dbos_config["database"]["username"],
    password=dbos_config["database"]["password"],
    host=dbos_config["database"]["hostname"],
    port=dbos_config["database"]["port"],
    database=dbos_config["database"]["app_db_name"],
)
engine = create_engine(db_url)

with engine.connect() as connection:
    # Delete all existing entries
    connection.execute(delete(schema.orders))
    connection.execute(delete(schema.products))

    # Insert seed entry
    connection.execute(insert(schema.products).values(
        product="Premium Quality Widget",
        description="Enhance your productivity with our top-rated widgets!",
        inventory=100,
        price=Decimal('99.99')
    ))

    # Commit the transaction
    connection.commit()

