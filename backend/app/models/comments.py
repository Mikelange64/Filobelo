from datetime import datetime, UTC

from sqlalchemy import ForeignKey, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Comment(Base):
    __tablename__ = "comments"

    id:      Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Nullable + SET NULL: a comment is part of the task's shared history, so it
    # outlives its author, same as Message.sender_id.
    author_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)

    left_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    # Null until the author edits it; the frontend shows "(edited)" off this.
    edited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    task: Mapped["Task"] = relationship(back_populates="comments")
