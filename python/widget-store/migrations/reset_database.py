# Each time the app is re-deployed, reset the database.

from decimal import Decimal

from dbos import get_dbos_database_url
from sqlalchemy import create_engine, delete, insert

from widget_store import schema

engine = create_engine(get_dbos_database_url())

with engine.connect() as connection:
    # Delete all existing entries
    connection.execute(delete(schema.orders))
    connection.execute(delete(schema.products))

    # Insert seed entry
    connection.execute(
        insert(schema.products).values(
            product_id=1,
            product="Premium Quality Widget",
            description="Enhance your productivity with our top-rated widgets!",
            inventory=100,
            price=Decimal("99.99"),
        )
    )

    # Commit the transaction
    connection.commit()
