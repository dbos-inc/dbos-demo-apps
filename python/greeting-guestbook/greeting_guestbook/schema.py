from sqlalchemy import Column, Integer, MetaData, Table, Text

metadata = MetaData()

greetings = Table(
    "greetings",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("name", Text),
    Column("note", Text),
)
