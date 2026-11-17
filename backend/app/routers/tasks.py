from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from app.database import DbSession
from app.models import Task, TaskStatus, WorkspaceMember
from app.schemas import (
    PaginatedTaskResponse,
    TaskCreate,
    TaskResponse,
    TaskStatusUpdate,
    TaskUpdate,
)
from app.dependencies import get_target_membership, require_membership
from app.utils import get_task_by_id


router = APIRouter(prefix="/{workspace_id}/tasks", tags=["tasks"])


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    workspace_id: int,
    task: TaskCreate,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    owner_id = member.user_id
    if task.owner_id is not None:
        target = await get_target_membership(workspace_id, task.owner_id, db)
        if not target:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not a member of this workspace",
            )
        owner_id = target.user_id

    new_task = Task(
        title=task.title,
        content=task.content,
        color=task.color,
        creator_id=member.user_id,
        owner_id=owner_id,
        workspace_id=workspace_id,
        due_date=task.due_date,
    )

    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    return new_task


@router.get(
    "/", response_model=PaginatedTaskResponse, dependencies=[Depends(require_membership)]
)
async def list_tasks(
    workspace_id: int,
    db: DbSession,
    skip: int = 0,
    limit: int = 50,
):
    base = select(Task).where(Task.workspace_id == workspace_id)
    result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = result.scalar() or 0
    result = await db.execute(base.offset(skip).limit(limit))
    tasks = result.scalars().all()

    return PaginatedTaskResponse(
        tasks=tasks, # type: ignore[return-value]
        total=total,
        skip=skip,
        limit=limit,
        has_more=skip + limit < total,
    )


@router.get(
    "/{task_id}", response_model=TaskResponse, dependencies=[Depends(require_membership)]
)
async def get_task(workspace_id: int, task_id: int, db: DbSession):
    task = await get_task_by_id(task_id, workspace_id, db)
    return task


@router.patch(
    "/{task_id}/", response_model=TaskResponse, dependencies=[Depends(require_membership)]
)
async def update_task_partial(
    workspace_id: int, task_id: int, task_data: TaskUpdate, db: DbSession
):
    task = await get_task_by_id(task_id, workspace_id, db)

    update = task_data.model_dump(exclude_unset=True)
    for field, value in update.items():
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    workspace_id: int,
    task_id: int,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    task = await get_task_by_id(task_id, workspace_id, db)
    if task.owner_id != member.user_id and member.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the task owner or an admin can delete this task",
        )
    await db.delete(task)
    await db.commit()


@router.patch(
    "/{task_id}/status", response_model=TaskResponse, dependencies=[Depends(require_membership)]
)
async def update_task_status(
    workspace_id: int, task_id: int, status_data: TaskStatusUpdate, db: DbSession
):
    task = await get_task_by_id(task_id, workspace_id, db)
    task.status = status_data.status
    task.completed_at = (
        datetime.now(UTC) if status_data.status == TaskStatus.DONE else None
    )
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}/owner", response_model=TaskResponse,)
async def reassign_task(
    task_id: int,
    workspace_id: int,
    user_id: Annotated[int, Query()],
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    task = await get_task_by_id(task_id, workspace_id, db)
    if task.owner_id != member.user_id and member.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the task owner or an admin can reassign this task",
        )

    target = await get_target_membership(workspace_id, user_id, db)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this workspace",
        )

    task.owner_id = target.user_id
    await db.commit()
    await db.refresh(task)
    return task