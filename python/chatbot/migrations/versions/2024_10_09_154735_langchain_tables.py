"""langchain_tables

Revision ID: f4e458725794
Revises: c6b516e182b2
Create Date: 2024-10-09 15:47:35.834817

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from dbos import load_config
from langgraph.checkpoint.postgres import PostgresSaver

# revision identifiers, used by Alembic.
revision: str = "f4e458725794"
down_revision: Union[str, None] = "c6b516e182b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    db = load_config()["database"]
    connection_string = f"postgresql://{db['username']}:{db['password']}@{db['hostname']}:{db['port']}/{db['app_db_name']}"
    with PostgresSaver.from_conn_string(connection_string) as c:
        c.setup()


def downgrade() -> None:
    pass
