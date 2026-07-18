"""add sender_type to messages, fix conversations.last_message_at nullability

Revision ID: 9b1e4a7c3f5d
Revises: 7a3f6b1c9d2e
Create Date: 2026-07-13 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b1e4a7c3f5d'
down_revision: Union[str, Sequence[str], None] = '7a3f6b1c9d2e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    sender_type_enum = sa.Enum('USER', 'BOT', name='sendertype')
    sender_type_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'messages',
        sa.Column('sender_type', sender_type_enum, nullable=False, server_default='USER'),
    )

    # last_message_at was wrongly given the same "always has a value,
    # defaults to now" treatment as last_opened_at. A conversation with no
    # messages has no last_message_at - it's set when the first message is
    # sent, not at conversation-creation time.
    op.alter_column('conversations', 'last_message_at', nullable=True, server_default=None)
    op.execute(
        """
        UPDATE conversations
        SET last_message_at = (
            SELECT MAX(created_at) FROM messages WHERE messages.conversation_id = conversations.id
        )
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("UPDATE conversations SET last_message_at = created_at WHERE last_message_at IS NULL")
    op.alter_column(
        'conversations', 'last_message_at', nullable=False, server_default=sa.text('now()')
    )
    op.drop_column('messages', 'sender_type')
    sa.Enum(name='sendertype').drop(op.get_bind(), checkfirst=True)
