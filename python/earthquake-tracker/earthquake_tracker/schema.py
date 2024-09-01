from sqlalchemy import Column, Float, MetaData, String, Table

metadata = MetaData()

earthquake_tracker = Table(
    "earthquake_tracker",
    metadata,
    Column("id", String, primary_key=True),
    Column("place", String, nullable=False),
    Column("magnitude", Float, nullable=False),
    Column("timestamp", String, nullable=False),
)
