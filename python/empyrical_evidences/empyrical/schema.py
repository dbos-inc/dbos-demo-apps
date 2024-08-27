from sqlalchemy import Column, MetaData, String, Table, Text
from sqlalchemy.dialects.postgresql import UUID

metadata = MetaData()

papers_metadata = Table(
    "papers_metadata",
    metadata,
    Column("uuid", UUID(as_uuid=True), primary_key=True),
    Column("name", String(255), unique=True, nullable=False),
    Column("url", Text, nullable=False),
)
