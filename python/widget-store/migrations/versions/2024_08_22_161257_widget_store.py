"""widget_store

Revision ID: 45dd7d40a046
Revises: 
Create Date: 2024-08-22 16:12:57.361428

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "45dd7d40a046"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "orders",
        sa.Column("order_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_status", sa.Integer(), nullable=False),
        sa.Column(
            "last_update_time",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("order_id"),
    )
    op.create_table(
        "products",
        sa.Column("product_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("product", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("inventory", sa.Integer(), nullable=False),
        sa.Column("price", sa.DECIMAL(precision=10, scale=2), nullable=False),
        sa.PrimaryKeyConstraint("product_id"),
        sa.UniqueConstraint("product"),
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table("products")
    op.drop_table("orders")
    # ### end Alembic commands ###
