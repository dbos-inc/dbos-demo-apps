"""earthquake_tracker

Revision ID: 1168f0ce22f8
Revises: 
Create Date: 2024-08-21 11:36:22.298114

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1168f0ce22f8'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('earthquake_tracker',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('place', sa.String(), nullable=False),
    sa.Column('magnitude', sa.Float(), nullable=False),
    sa.Column('timestamp', sa.String(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('earthquake_tracker')
    # ### end Alembic commands ###