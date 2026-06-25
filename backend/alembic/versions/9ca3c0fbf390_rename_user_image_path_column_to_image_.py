"""rename user image_path column to image_file

Revision ID: 9ca3c0fbf390
Revises: 161ee5426717
Create Date: 2026-06-24 19:59:25.831939

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9ca3c0fbf390'
down_revision: Union[str, Sequence[str], None] = '161ee5426717'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('users', 'image_path', new_column_name='image_file')


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('users', 'image_file', new_column_name='image_path')
