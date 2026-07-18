"""conversations last_message_at column and last_opened_at not null

Revision ID: 16ef8cb1881f
Revises: 49125c2736be
Create Date: 2026-07-09 13:10:51.667404

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '16ef8cb1881f'
down_revision: Union[str, Sequence[str], None] = '49125c2736be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('conversations', sa.Column('last_message_at', sa.DateTime(timezone=True), nullable=True))
    # Backfill from real message history rather than defaulting every existing
    # conversation to "now", which would flatten their relative ordering.
    op.execute(
        """
        UPDATE conversations
        SET last_message_at = COALESCE(
            (SELECT MAX(created_at) FROM messages WHERE messages.conversation_id = conversations.id),
            conversations.created_at
        )
        """
    )
    op.alter_column(
        'conversations', 'last_message_at', nullable=False, server_default=sa.text('now()')
    )

    op.execute("UPDATE conversations SET last_opened_at = created_at WHERE last_opened_at IS NULL")
    op.alter_column(
        'conversations', 'last_opened_at',
        existing_type=postgresql.TIMESTAMP(timezone=True),
        nullable=False,
        server_default=sa.text('now()'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        'conversations', 'last_opened_at',
        existing_type=postgresql.TIMESTAMP(timezone=True),
        nullable=True,
        server_default=None,
    )
    op.drop_column('conversations', 'last_message_at')
