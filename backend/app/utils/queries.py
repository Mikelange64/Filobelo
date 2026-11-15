from collections.abc import Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import DbSession
from app.models import Conversation, Folder, Resource, Task, User
from app.models.workspaces import Workspace

# An async session cannot load a relationship on first access the way a sync
# one does (that hidden query raises MissingGreenlet). So every helper here
# that returns an object whose relationships get read afterwards loads them
# in the same query, with selectinload: one extra SELECT per relationship,
# however many rows come back.


async def get_user_by_id(user_id: int, db: DbSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    return user


async def get_task_by_id(task_id: int, workspace_id: int, db: DbSession) -> Task:
    # scoped to workspace_id so a member of one workspace can't reach another
    # workspace's task by guessing its id - membership is only ever checked
    # against the workspace_id in the URL, so the lookup has to be tied to it
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.workspace_id == workspace_id)
    )
    task = result.scalars().first()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )

    return task


async def get_resource_by_id(resource_id: int, task_id: int, db: DbSession) -> Resource:
    # scoped to task_id for the same reason get_task_by_id is scoped to
    # workspace_id. The task itself is tied to the workspace by
    # require_task_in_workspace on the resources router, which completes the
    # chain resource -> task -> workspace -> membership.
    result = await db.execute(
        select(Resource).where(Resource.id == resource_id, Resource.task_id == task_id)
    )
    resource = result.scalars().first()

    if not resource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found"
        )

    return resource


async def get_conversation_by_id(
    conversation_id: int, workspace_id: int, db: DbSession
) -> Conversation:
    # scoped to workspace_id so a member of one workspace can't reach another
    # workspace's conversation by guessing its id
    #
    # Does not load Conversation.messages: use this when only the row itself
    # is needed (permission checks, deleting, posting a message). A route that
    # returns the conversation needs the _with_messages version below, because
    # the response's last_message preview is read from the messages.
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.workspace_id == workspace_id,
        )
    )
    conversation = result.scalars().first()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    return conversation


async def get_conversation_by_id_with_messages(
    conversation_id: int, workspace_id: int, db: DbSession
) -> Conversation:
    # scoped to workspace_id so a member of one workspace can't reach another
    # workspace's conversation by guessing its id
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(
            Conversation.id == conversation_id,
            Conversation.workspace_id == workspace_id,
        )
    )
    conversation = result.scalars().first()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    return conversation


async def get_workspace_task_index(workspace_id: int, db: DbSession) -> Sequence[Task]:
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.resources))
        .where(Task.workspace_id == workspace_id)
    )
    return result.scalars().all()


async def get_workspace_by_id(workspace_id: int, db: DbSession) -> Workspace:
    # members and tasks are both read by WorkspaceResponse (the lists
    # themselves, and the counts / progress / default_due_date properties on
    # the model), so they are always loaded here.
    #
    # populate_existing: if this session already holds the workspace (a route
    # that loads it, changes something, commits and then asks for it again),
    # overwrite what is held with what the database now says. Without it the
    # already-loaded members/tasks lists would be returned unchanged, missing
    # a member that was just added.
    result = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.members), selectinload(Workspace.tasks))
        .where(Workspace.id == workspace_id)
        .execution_options(populate_existing=True)
    )
    workspace = result.scalars().first()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    return workspace


async def get_folder_by_id(folder_id: int, owner_id: int, db: DbSession) -> Folder:
    # scoped to owner_id so one user can never reach (or learn the existence
    # of) another user's folder by guessing its id - both cases are a 404
    result = await db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.owner_id == owner_id)
    )
    folder = result.scalars().first()

    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
        )

    return folder
