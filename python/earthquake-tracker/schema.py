from sqlalchemy import Table, Column, Integer, String, Float, MetaData

metadata = MetaData()

earthquake_tracker = Table(
    "earthquake_tracker",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("place", String, nullable=False),
    Column("magnitude", Float, nullable=False),
    Column("timestamp", String, nullable=False),
)
