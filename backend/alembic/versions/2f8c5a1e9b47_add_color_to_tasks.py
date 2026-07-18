"""add color to tasks

Revision ID: 2f8c5a1e9b47
Revises: 9b1e4a7c3f5d
Create Date: 2026-07-13 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f8c5a1e9b47'
down_revision: Union[str, Sequence[str], None] = '9b1e4a7c3f5d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'tasks',
        sa.Column('color', sa.String(length=50), nullable=False, server_default='#6bc4d4'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tasks', 'color')
