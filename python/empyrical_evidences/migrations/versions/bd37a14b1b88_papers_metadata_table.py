"""papers metadata table

Revision ID: bd37a14b1b88
Revises: 
Create Date: 2024-08-26 15:19:14.329396

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bd37a14b1b88'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        "papers_metadata",
        sa.Column("uuid", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), unique=True, nullable=False),
        sa.Column("url", sa.Text, nullable=False),
    )

def downgrade() -> None:
    op.drop_table("papers_metadata")

