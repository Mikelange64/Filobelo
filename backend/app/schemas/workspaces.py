from pydantic import BaseModel, Field, ConfigDict, EmailStr
from datetime import datetime, timedelta
from .users import UserPublic
from .tasks import TaskSummary


class WorkspaceBase(BaseModel):
    title       : str = Field(min_length=1, max_length=50)
    description : str | None = Field(min_length=1, max_length=500, default=None)
    max_number  : int | None = None
    due_date    : datetime | None = None


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceResponse(WorkspaceBase):
    model_config = ConfigDict(from_attributes=True)

    id                : int
    creator_id        : int | None
    title             : str
    description       : str | None
    max_number        : int | None
    num_of_members    : int
    num_of_tasks      : int
    date_created      : datetime
    due_date          : datetime | None
    progress          : float
    time_remaining    : timedelta | None
    members           : list[UserPublic]
    tasks             : list[TaskSummary]
    current_user_role : str | None = None
    is_completed      : bool = False
    completed_at      : datetime | None = None
    # Sourced from the current user's own WorkspaceMember row, not the
    # Workspace itself - each member has their own pin/archive/folder state
    # for a shared workspace. Defaults here only matter until the router
    # overwrites them with the real per-member values.
    is_pinned         : bool = False
    is_archived       : bool = False
    folder_id         : int | None = None


class PaginatedWorkspaceResponse(BaseModel):
    workspaces : list[WorkspaceResponse]
    total      : int
    skip       : int
    limit      : int
    has_more   : bool


class InviteExternalRequest(BaseModel):
    email: EmailStr


class WorkspaceUpdate(WorkspaceBase):
    title        : str | None = Field(min_length=1, max_length=50, default=None)
    description  : str | None = Field(min_length=1, max_length=500, default=None)
    max_number   : int | None = None
    due_date     : datetime | None = None


class WorkspaceMemberPrefsUpdate(BaseModel):
    is_pinned   : bool | None = None
    is_archived : bool | None = None
    folder_id   : int | None = None