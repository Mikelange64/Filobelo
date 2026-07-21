"""add_resource_updated_at

Revision ID: 9c18f1c708c0
Revises: 2f7e3cec20fb
Create Date: 2026-07-21 14:47:39.188309

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c18f1c708c0'
down_revision: Union[str, Sequence[str], None] = '2f7e3cec20fb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('resources', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))
    # Backfill from created_at - no prior resource had a tracked edit, so its
    # "last updated" is just when it was created.
    op.execute("UPDATE resources SET updated_at = created_at")
    op.alter_column(
        'resources', 'updated_at', nullable=False, server_default=sa.text('now()')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('resources', 'updated_at')
