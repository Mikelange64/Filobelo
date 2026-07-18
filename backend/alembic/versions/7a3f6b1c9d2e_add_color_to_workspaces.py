"""add color to workspaces

Revision ID: 7a3f6b1c9d2e
Revises: 16ef8cb1881f
Create Date: 2026-07-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a3f6b1c9d2e'
down_revision: Union[str, Sequence[str], None] = '16ef8cb1881f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'workspaces',
        sa.Column('color', sa.String(length=50), nullable=False, server_default='#ecf79e'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('workspaces', 'color')
