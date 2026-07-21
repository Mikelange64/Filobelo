"""replace task is_completed with status enum

Revision ID: 2f7e3cec20fb
Revises: dfa7a0abdec1
Create Date: 2026-07-20 17:03:36.686286

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f7e3cec20fb'
down_revision: Union[str, Sequence[str], None] = 'dfa7a0abdec1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    task_status_enum = sa.Enum('TODO', 'IN_PROGRESS', 'DONE', name='taskstatus')
    task_status_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'tasks',
        sa.Column('status', task_status_enum, nullable=False, server_default='TODO'),
    )

    # Carry forward whatever was already marked complete before the column
    # existed - everything else lands in TODO, since there was no
    # in-progress concept until now.
    op.execute("UPDATE tasks SET status = 'DONE' WHERE is_completed = true")

    op.drop_column('tasks', 'is_completed')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        'tasks',
        sa.Column('is_completed', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.execute("UPDATE tasks SET is_completed = true WHERE status = 'DONE'")

    op.drop_column('tasks', 'status')
    sa.Enum(name='taskstatus').drop(op.get_bind(), checkfirst=True)
