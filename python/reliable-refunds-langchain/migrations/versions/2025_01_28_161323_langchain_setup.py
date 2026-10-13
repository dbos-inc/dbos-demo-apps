"""Langchain setup

Revision ID: fc6545615e90
Revises: c6b516e182b2
Create Date: 2025-01-28 16:13:23.849114

"""

import os
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.checkpoint.sqlite import SqliteSaver

# revision identifiers, used by Alembic.
revision: str = "fc6545615e90"
down_revision: Union[str, None] = "c6b516e182b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()
    if connection.dialect.name == "sqlite":
        # SqliteSaver.setup() uses executescript(), which commits implicitly.
        # Let Alembic manage that boundary and avoid a second SQLite writer.
        with op.get_context().autocommit_block():
            SqliteSaver(connection.connection.driver_connection).setup()
        return
    connection_string = (
        sa.make_url(os.environ.get("DBOS_DATABASE_URL"))
        .set(drivername="postgres")
        .render_as_string(hide_password=False)
    )
    with PostgresSaver.from_conn_string(connection_string) as c:
        c.setup()


def downgrade() -> None:
    pass
