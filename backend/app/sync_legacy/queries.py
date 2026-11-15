from collections.abc import Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.sync_legacy.database import DbSession
from app.models import Conversation, Folder, Resource, Task, User
from app.models.workspaces import Workspace


def get_user_by_id(user_id: int, db: DbSession) -> User:
    user = db.execute(select(User).where(User.id == user_id)).scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    return user


def get_task_by_id(task_id: int, workspace_id: int, db: DbSession) -> Task:
    # scoped to workspace_id so a member of one workspace can't reach another
    # workspace's task by guessing its id - membership is only ever checked
    # against the workspace_id in the URL, so the lookup has to be tied to it
    task = (
        db.execute(
            select(Task).where(Task.id == task_id, Task.workspace_id == workspace_id)
        )
        .scalars()
        .first()
    )

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )

    return task


def get_resource_by_id(resource_id: int, task_id: int, db: DbSession) -> Resource:
    # scoped to task_id for the same reason get_task_by_id is scoped to
    # workspace_id. The task itself is tied to the workspace by
    # require_task_in_workspace on the resources router, which completes the
    # chain resource -> task -> workspace -> membership.
    resource = (
        db.execute(
            select(Resource).where(
                Resource.id == resource_id, Resource.task_id == task_id
            )
        )
        .scalars()
        .first()
    )

    if not resource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found"
        )

    return resource


def get_conversation_by_id(
    conversation_id: int, workspace_id: int, db: DbSession
) -> Conversation:
    # scoped to workspace_id so a member of one workspace can't reach another
    # workspace's conversation by guessing its id
    conversation = (
        db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.workspace_id == workspace_id,
            )
        )
        .scalars()
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    return conversation


def get_conversation_by_id_with_messages(
    conversation_id: int, workspace_id: int, db: DbSession
) -> Conversation:
    # scoped to workspace_id so a member of one workspace can't reach another
    # workspace's conversation by guessing its id
    conversation = (
        db.execute(
            select(Conversation)
            .options(joinedload(Conversation.messages))
            .where(
                Conversation.id == conversation_id,
                Conversation.workspace_id == workspace_id,
            )
        )
        .scalars()
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    return conversation


def get_workspace_task_index(workspace_id: int, db: DbSession) -> Sequence[Task]:
    # unique() is required here: joinedload against Task.resources (a
    # collection) produces one raw row per resource, so a task with 3
    # resources comes back as 3 duplicate Task rows before dedup.
    return (
        db.execute(
            select(Task)
            .options(joinedload(Task.resources))
            .where(Task.workspace_id == workspace_id)
        )
        .unique()
        .scalars()
        .all()
    )


def get_workspace_by_id(workspace_id: int, db: DbSession) -> Workspace:
    workspace = (
        db.execute(
            select(Workspace)
            .options(joinedload(Workspace.members), joinedload(Workspace.tasks))
            .where(Workspace.id == workspace_id)
        )
        .scalars()
        .first()
    )

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    return workspace


def get_folder_by_id(folder_id: int, owner_id: int, db: DbSession) -> Folder:
    # scoped to owner_id so one user can never reach (or learn the existence
    # of) another user's folder by guessing its id - both cases are a 404
    folder = (
        db.execute(
            select(Folder).where(Folder.id == folder_id, Folder.owner_id == owner_id)
        )
        .scalars()
        .first()
    )

    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
        )

    return folder
