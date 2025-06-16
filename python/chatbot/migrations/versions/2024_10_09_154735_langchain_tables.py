"""langchain_tables

Revision ID: f4e458725794
Revises: c6b516e182b2
Create Date: 2024-10-09 15:47:35.834817

"""

from typing import Sequence, Union
import os
import sqlalchemy as sa
from alembic import op
from langgraph.checkpoint.postgres import PostgresSaver
from sqlalchemy.engine.url import make_url

# revision identifiers, used by Alembic.
revision: str = "f4e458725794"
down_revision: Union[str, None] = "c6b516e182b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection_string = os.environ.get("DBOS_DATABASE_URL", "postgresql//postgres:dbos@localhost:5432/chatbot?connect_timeout=5")
    db_url = make_url(connection_string).set(drivername="postgres").render_as_string(hide_password=False)
    with PostgresSaver.from_conn_string(db_url) as c:
        c.setup()


def downgrade() -> None:
    pass
