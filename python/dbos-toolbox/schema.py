from sqlalchemy import Column, Integer, MetaData, String, Table

metadata = MetaData()

example_table = Table(
    "example_table",
    metadata,
    Column("count", Integer, primary_key=True, autoincrement=True),
    Column("name", String, nullable=False),
)