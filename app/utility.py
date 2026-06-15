from fastapi import HTTPException, status

from sqlalchemy import select

from app.models.workspaces import Workspace
from app.database import DbSession
from app.models import WorkspaceMember, Task, User
from app.auth import CurrentUser


def require_admin(
    workspace_id: int, current_user: CurrentUser, db: DbSession
) -> WorkspaceMember:
    query = select(WorkspaceMember).where(
        WorkspaceMember.user_id == current_user.id,
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.role == "admin"
    )
    is_admin = db.execute(query).scalars().first()

    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Only admins can perform this action"
        )

    return is_admin


def require_membership(
    workspace_id: int, current_user: CurrentUser, db: DbSession
)-> WorkspaceMember :
    query = select(WorkspaceMember).where(
        WorkspaceMember.user_id == current_user.id,
        WorkspaceMember.workspace_id == workspace_id,
    )
    is_member = db.execute(query).scalars().first()

    if not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="User is not a member of this workspace"
        )

    return is_member


def get_target_membership(
    workspace_id: int, user_id: int, db: DbSession
) -> WorkspaceMember | None :
    
    is_member = db.execute(
        select(WorkspaceMember)
        .where(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == workspace_id
        )
    ).scalars().first()

    return is_member


def require_superuser(current_user : CurrentUser):
    if not current_user.is_superuser:
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "User not allowed to perform this action"
        )

    return current_user


def get_user_by_id(user_id: int,  db: DbSession) -> User:
    user = (
        db.execute(select(User).where(User.id == user_id)).scalars().first()
    )

    if not user :
        raise HTTPException(
            status_code = status.HTTP_404_NOT_FOUND, detail = "User not found"
        )
    
    return user


def get_task_by_id(task_id: int, db: DbSession) -> Task: 
    task = (
        db.execute(select(Task).where(Task.id == task_id)).scalars().first()
    )

    if not task :
        raise HTTPException(
            status_code = status.HTTP_404_NOT_FOUND, detail = "Task not found"
        )

    return task


def get_workspace_by_id(workspace_id: int,  db: DbSession) -> Workspace : 
    workspace = (
        db.execute(select(Workspace).where(Workspace.id == workspace_id))
        .scalars().first()
    )

    if not workspace :
        raise HTTPException(
            status_code = status.HTTP_404_NOT_FOUND, detail = "Workspace not found"
        )

    return workspace