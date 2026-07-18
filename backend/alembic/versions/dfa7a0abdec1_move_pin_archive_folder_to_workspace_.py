"""move pin/archive/folder to workspace_member, drop workspace color

Revision ID: dfa7a0abdec1
Revises: 8d4c1f2a6e9b
Create Date: 2026-07-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dfa7a0abdec1'
down_revision: Union[str, Sequence[str], None] = '8d4c1f2a6e9b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('workspace_member', sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('workspace_member', sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('workspace_member', sa.Column('folder_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'workspace_member', 'folders', ['folder_id'], ['id'])

    # Carry each workspace's current pin/archive state forward as every
    # existing member's starting point - it's shared today, so this is the
    # only sensible "before" snapshot. They can diverge from here on.
    op.execute(
        """
        UPDATE workspace_member wm
        SET is_pinned = w.is_pinned,
            is_archived = w.is_archived
        FROM workspaces w
        WHERE wm.workspace_id = w.id
        """
    )
    # folder_id is scoped to the owning user's own folders - only copy it to
    # the member who actually owns that folder, not to every member (they
    # couldn't see/use a folder_id pointing at someone else's folder anyway).
    op.execute(
        """
        UPDATE workspace_member wm
        SET folder_id = w.folder_id
        FROM workspaces w
        JOIN folders f ON f.id = w.folder_id
        WHERE wm.workspace_id = w.id
          AND wm.user_id = f.owner_id
        """
    )

    op.drop_index(op.f('ix_workspaces_folder_id'), table_name='workspaces')
    op.drop_constraint('workspaces_folder_id_fkey', 'workspaces', type_='foreignkey')
    op.drop_column('workspaces', 'folder_id')
    op.drop_column('workspaces', 'is_pinned')
    op.drop_column('workspaces', 'is_archived')
    op.drop_column('workspaces', 'color')


def downgrade() -> None:
    op.add_column('workspaces', sa.Column('color', sa.String(length=50), nullable=False, server_default='#ecf79e'))
    op.add_column('workspaces', sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('workspaces', sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('workspaces', sa.Column('folder_id', sa.Integer(), nullable=True))
    op.create_foreign_key('workspaces_folder_id_fkey', 'workspaces', 'folders', ['folder_id'], ['id'])
    op.create_index(op.f('ix_workspaces_folder_id'), 'workspaces', ['folder_id'], unique=False)

    # Lossy: collapses each workspace's members back down to one shared
    # state, taking whichever member row Postgres happens to pick last.
    op.execute(
        """
        UPDATE workspaces w
        SET is_pinned = wm.is_pinned,
            is_archived = wm.is_archived,
            folder_id = wm.folder_id
        FROM workspace_member wm
        WHERE wm.workspace_id = w.id
        """
    )

    op.drop_constraint('workspace_member_folder_id_fkey', 'workspace_member', type_='foreignkey')
    op.drop_column('workspace_member', 'folder_id')
    op.drop_column('workspace_member', 'is_archived')
    op.drop_column('workspace_member', 'is_pinned')
