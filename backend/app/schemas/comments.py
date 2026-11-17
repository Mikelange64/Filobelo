from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.reactions import ReactionSummary


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class CommentUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class CommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:        int
    task_id:   int
    author_id: int | None
    content:   str
    left_at:   datetime
    edited_at: datetime | None
    reactions: list[ReactionSummary] = []
