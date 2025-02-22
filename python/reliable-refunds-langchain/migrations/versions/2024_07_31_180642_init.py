"""
Initialize application database.

Revision ID: c6b516e182b2
Revises: 
Create Date: 2024-07-31 18:06:42.500040
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c6b516e182b2"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "purchases",
        sa.Column("order_id", sa.Integer, primary_key=True),
        sa.Column("item", sa.String, nullable=False),
        sa.Column("order_date", sa.String, nullable=False),
        sa.Column("price", sa.DECIMAL(10, 2), nullable=False),
        sa.Column("order_status", sa.String, nullable=False),
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table("purchases")
    # ### end Alembic commands ###
