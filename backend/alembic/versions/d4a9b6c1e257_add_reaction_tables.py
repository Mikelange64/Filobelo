"""add comment_reactions and message_reactions

Revision ID: d4a9b6c1e257
Revises: c3e8f5a2b194
Create Date: 2026-11-17 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4a9b6c1e257'
down_revision: Union[str, Sequence[str], None] = 'c3e8f5a2b194'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create(table: str, target_col: str, target_table: str, constraint: str) -> None:
    op.create_table(
        table,
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column(target_col, sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('emoji', sa.String(length=16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint([target_col], [f'{target_table}.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(target_col, 'user_id', 'emoji', name=constraint),
    )
    op.create_index(op.f(f'ix_{table}_{target_col}'), table, [target_col], unique=False)
    op.create_index(op.f(f'ix_{table}_user_id'), table, ['user_id'], unique=False)


def upgrade() -> None:
    """Upgrade schema."""
    _create('comment_reactions', 'comment_id', 'comments', 'uq_comment_reaction')
    _create('message_reactions', 'message_id', 'messages', 'uq_message_reaction')


def downgrade() -> None:
    """Downgrade schema."""
    for table, col in (('message_reactions', 'message_id'), ('comment_reactions', 'comment_id')):
        op.drop_index(op.f(f'ix_{table}_user_id'), table_name=table)
        op.drop_index(op.f(f'ix_{table}_{col}'), table_name=table)
        op.drop_table(table)
