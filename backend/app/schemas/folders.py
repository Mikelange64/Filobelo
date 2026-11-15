from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FolderCreate(BaseModel):
    name:      str = Field(min_length=1, max_length=50)
    color:     str = Field(min_length=1, max_length=50)
    parent_id: int | None = None


class FolderUpdate(BaseModel):
    name:  str | None = Field(min_length=1, max_length=50, default=None)
    color: str | None = Field(min_length=1, max_length=50, default=None)
    # Omitted = leave where it is; explicit null = move to top level.
    parent_id: int | None = None


class FolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:         int
    owner_id:   int
    parent_id:  int | None
    name:       str
    color:      str
    created_at: datetime
