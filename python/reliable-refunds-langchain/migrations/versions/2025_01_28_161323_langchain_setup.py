"""Langchain setup

Revision ID: fc6545615e90
Revises: c6b516e182b2
Create Date: 2025-01-28 16:13:23.849114

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from dbos import load_config
from langgraph.checkpoint.postgres import PostgresSaver


# revision identifiers, used by Alembic.
revision: str = 'fc6545615e90'
down_revision: Union[str, None] = 'c6b516e182b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    db = load_config()["database"]
    connection_string = f"postgresql://{db['username']}:{db['password']}@{db['hostname']}:{db['port']}/{db['app_db_name']}"
    with PostgresSaver.from_conn_string(connection_string) as c:
        c.setup()

def downgrade() -> None:
    pass