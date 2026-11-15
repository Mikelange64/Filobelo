"""add parent_id to folders (subfolders)

Revision ID: b7d2e4a91c63
Revises: f2a1f1d388b2
Create Date: 2026-11-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d2e4a91c63'
down_revision: Union[str, Sequence[str], None] = 'f2a1f1d388b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('folders', sa.Column('parent_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_folders_parent_id'), 'folders', ['parent_id'], unique=False)
    op.create_foreign_key(
        'fk_folders_parent_id_folders', 'folders', 'folders',
        ['parent_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_folders_parent_id_folders', 'folders', type_='foreignkey')
    op.drop_index(op.f('ix_folders_parent_id'), table_name='folders')
    op.drop_column('folders', 'parent_id')
