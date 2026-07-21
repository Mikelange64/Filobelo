from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import TaskStatus


class TaskCreate(BaseModel):
    title    : str = Field(min_length=1, max_length=100)
    content  : str = Field(default='', max_length=300)
    color    : str = Field(min_length=1, max_length=50, default="#6bc4d4")
    owner_id : int | None = None
    due_date : datetime | None = None


class TaskUpdate(BaseModel):
    title    : str | None = Field(default=None, min_length=1, max_length=100)
    content  : str | None = Field(default=None, min_length=1, max_length=300)
    color    : str | None = Field(default=None, min_length=1, max_length=50)
    due_date : datetime | None = None


class TaskFullUpdate(BaseModel):
    title    : str = Field(min_length=1, max_length=100)
    content  : str = Field(min_length=1, max_length=300)
    color    : str = Field(min_length=1, max_length=50, default="#6bc4d4")
    due_date : datetime | None = None
    status   : TaskStatus = TaskStatus.TODO


class TaskStatusUpdate(BaseModel):
    status : TaskStatus


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id           : int
    title        : str
    content      : str
    color        : str
    creator_id   : int | None
    owner_id     : int | None
    workspace_id : int
    due_date     : datetime | None
    status       : TaskStatus
    completed_at : datetime | None
    date_created : datetime


class PaginatedTaskResponse(BaseModel):
    tasks    : list[TaskResponse]
    total    : int
    skip     : int
    limit    : int
    has_more : bool


class TaskSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id           : int
    title        : str
    color        : str
    due_date     : datetime | None
    status       : TaskStatus
    owner_id     : int | None
    completed_at : datetime | None
