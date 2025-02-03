"""earthquake_tracker

Revision ID: 98e5b401d504
Revises:
Create Date: 2024-08-21 16:13:30.083089

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "98e5b401d504"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "earthquake_tracker",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("place", sa.String(), nullable=False),
        sa.Column("magnitude", sa.Float(), nullable=False),
        sa.Column("timestamp", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table("earthquake_tracker")
    # ### end Alembic commands ###
