from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WorkspaceMember(Base):
    __tablename__ = "workspace_member"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), primary_key=True
    )
    workspace_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    role      : Mapped[str] = mapped_column(String(50), nullable=False, default="member")
    joined_at : Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    # Pinned/archived/folder are each member's own view of a shared workspace,
    # not a property of the workspace itself - one member archiving it must
    # not hide it from everyone else.
    is_pinned   : Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_archived : Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    folder_id   : Mapped[int | None] = mapped_column(
        Integer, ForeignKey("folders.id"), nullable=True, default=None
    )
