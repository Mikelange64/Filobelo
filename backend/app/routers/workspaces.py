import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.auth import CurrentUser
from app.config import settings
from app.database import DbSession
from app.dependencies import (
    get_target_membership,
    handle_membership_departure,
    require_admin,
    require_membership,
)
from app.models import Folder, User, Workspace, WorkspaceMember
from app.schemas import (
    InviteExternalRequest,
    PaginatedWorkspaceResponse,
    UserPublic,
    WorkspaceCreate,
    WorkspaceMemberPrefsUpdate,
    WorkspaceMemberPublic,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from app.utils import get_workspace_by_id
from app.utils.email_utils import send_join_invite_email, send_member_added_email

router = APIRouter(tags=["workspaces"])

# Ids only in these log lines - no workspace titles, usernames or emails.
# Who did it is the "user=" field at the start of each line.
logger = logging.getLogger(__name__)


def _workspace_response(
    workspace: Workspace, member: WorkspaceMember | None
) -> WorkspaceResponse:
    """Merges a Workspace with the requesting user's own WorkspaceMember row.

    Pin/archive/folder are per-member preferences on a shared workspace, so
    they never live on the Workspace row itself - every response has to be
    stitched together from both models this way.
    """
    return WorkspaceResponse.model_validate(workspace).model_copy(
        update={
            "current_user_role": member.role if member else None,
            "is_pinned": member.is_pinned if member else False,
            "is_archived": member.is_archived if member else False,
            "folder_id": member.folder_id if member else None,
        }
    )


async def _refresh_workspace(workspace: Workspace, db: DbSession) -> None:
    """Reloads a workspace after a commit, ready for _workspace_response.

    db.refresh(obj) on its own only re-reads the columns: a relationship
    that was never loaded (always the case for a workspace created a moment
    ago) stays unloaded, and an async session cannot load it later on first
    access. WorkspaceResponse reads members and tasks, so they are refreshed
    by name as well.
    """
    await db.refresh(workspace)
    await db.refresh(workspace, attribute_names=["members", "tasks"])


# ========================================================================================
# WORKSPACE CRUD
# ========================================================================================


@router.get("", response_model=PaginatedWorkspaceResponse)
async def get_my_workspaces(
    current_user: CurrentUser,
    db: DbSession,
    skip: int = 0,
    limit: int = 20,
):
    base = (
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == current_user.id)
    )

    result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = result.scalar() or 0

    # offset/limit without a deterministic order lets Postgres hand back rows
    # in any order it likes, so pages could overlap or skip workspaces. id
    # breaks ties between identical timestamps.
    result = await db.execute(
        base.options(selectinload(Workspace.members), selectinload(Workspace.tasks))
        .order_by(Workspace.date_created.desc(), Workspace.id.desc())
        .offset(skip)
        .limit(limit)
    )
    workspaces = result.scalars().all()

    workspace_ids = [ws.id for ws in workspaces]
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id.in_(workspace_ids),
            WorkspaceMember.user_id == current_user.id,
        )
    )
    member_map = {m.workspace_id: m for m in result.scalars()}

    return PaginatedWorkspaceResponse(
        workspaces=[
            _workspace_response(ws, member_map.get(ws.id)) for ws in workspaces
        ],
        total=total,
        skip=skip,
        limit=limit,
        has_more=skip + limit < total,
    )


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    current_user: CurrentUser, workspace: WorkspaceCreate, db: DbSession
):
    new_workspace = Workspace(
        creator_id=current_user.id,
        title=workspace.title,
        description=workspace.description,
        max_number=workspace.max_number,
        due_date=workspace.due_date,
    )
    db.add(new_workspace)
    await db.flush()

    new_member = WorkspaceMember(
        user_id=current_user.id, workspace_id=new_workspace.id, role="admin"
    )
    db.add(new_member)
    await db.commit()
    await _refresh_workspace(new_workspace, db)

    logger.info(
        "Workspace created workspace_id=%s creator_user_id=%s",
        new_workspace.id, new_workspace.creator_id,
    )

    return _workspace_response(new_workspace, new_member)


@router.get("/completed", response_model=PaginatedWorkspaceResponse)
async def get_completed_workspaces(
    current_user: CurrentUser,
    db: DbSession,
    skip: int = 0,
    limit: int = 20,
):
    base = (
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == current_user.id,
            Workspace.is_completed.is_(True),
        )
        .order_by(Workspace.completed_at.desc())
    )

    result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = result.scalar() or 0

    result = await db.execute(
        base.options(selectinload(Workspace.members), selectinload(Workspace.tasks))
        .offset(skip)
        .limit(limit)
    )
    workspaces = result.scalars().all()

    workspace_ids = [ws.id for ws in workspaces]
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id.in_(workspace_ids),
            WorkspaceMember.user_id == current_user.id,
        )
    )
    member_map = {m.workspace_id: m for m in result.scalars()}

    return PaginatedWorkspaceResponse(
        workspaces=[
            _workspace_response(ws, member_map.get(ws.id)) for ws in workspaces
        ],
        total=total,
        skip=skip,
        limit=limit,
        has_more=skip + limit < total,
    )


@router.patch("/{workspace_id}/complete", response_model=WorkspaceResponse)
async def complete_workspace(
    workspace_id: int,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    result = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.members), selectinload(Workspace.tasks))
        .where(Workspace.id == workspace_id)
    )
    workspace = result.scalars().first()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    workspace.is_completed = True
    workspace.completed_at = datetime.now(UTC)
    await db.commit()
    logger.info("Workspace marked complete workspace_id=%s", workspace_id)
    await _refresh_workspace(workspace, db)

    return _workspace_response(workspace, member)


@router.patch("/{workspace_id}/reopen", response_model=WorkspaceResponse)
async def reopen_workspace(
    workspace_id: int,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    result = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.members), selectinload(Workspace.tasks))
        .where(Workspace.id == workspace_id)
    )
    workspace = result.scalars().first()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    workspace.is_completed = False
    workspace.completed_at = None
    await db.commit()
    logger.info("Workspace reopened workspace_id=%s", workspace_id)
    await _refresh_workspace(workspace, db)

    return _workspace_response(workspace, member)


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(workspace_id: int, db: DbSession, current_user: CurrentUser):
    result = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.members), selectinload(Workspace.tasks))
        .where(Workspace.id == workspace_id)
    )
    workspace = result.scalars().first()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found"
        )

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id,
        )
    )
    member = result.scalars().first()

    # Checked here rather than via Depends(require_membership) so a missing
    # workspace still 404s instead of 403ing before the lookup runs.
    if not member:
        logger.warning(
            "Forbidden: not a member user_id=%s workspace_id=%s",
            current_user.id, workspace_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this workspace",
        )

    return _workspace_response(workspace, member)


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace_partial(
    workspace_id: int,
    workspace_data: WorkspaceUpdate,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    workspace = await get_workspace_by_id(workspace_id, db)

    update = workspace_data.model_dump(exclude_unset=True)
    for field, value in update.items():
        setattr(workspace, field, value)

    await db.commit()
    await _refresh_workspace(workspace, db)
    return _workspace_response(workspace, member)


@router.put("/{workspace_id}/", response_model=WorkspaceResponse)
async def update_workspace_full(
    workspace_id: int,
    workspace_data: WorkspaceCreate,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    workspace = await get_workspace_by_id(workspace_id, db)

    workspace.title = workspace_data.title
    workspace.description = workspace_data.description
    workspace.max_number = workspace_data.max_number
    workspace.due_date = workspace_data.due_date

    await db.commit()
    await _refresh_workspace(workspace, db)
    return _workspace_response(workspace, member)


@router.patch("/{workspace_id}/me", response_model=WorkspaceResponse)
async def update_my_workspace_preferences(
    workspace_id: int,
    data: WorkspaceMemberPrefsUpdate,
    db: DbSession,
    current_user: CurrentUser,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    """Pin/archive/file this workspace for the caller only - any member can
    do this for themselves, it never touches anyone else's view."""
    workspace = await get_workspace_by_id(workspace_id, db)

    update = data.model_dump(exclude_unset=True)
    if update.get("folder_id") is not None:
        folder = await db.get(Folder, update["folder_id"])
        if not folder or folder.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
            )

    for field, value in update.items():
        setattr(member, field, value)

    await db.commit()
    await db.refresh(member)
    return _workspace_response(workspace, member)


# ========================================================================================
# MEMBER MANAGEMENT
# ========================================================================================


@router.get(
    "/{workspace_id}/members",
    response_model=list[WorkspaceMemberPublic],
    dependencies=[Depends(require_membership)],
)
async def get_members(workspace_id: int, db: DbSession):
    result = await db.execute(
        select(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == workspace_id)
    )
    rows = result.all()
    return [
        WorkspaceMemberPublic(
            id=user.id,
            username=user.username,
            image_path=user.image_path,
            role=membership.role,
        )
        for membership, user in rows
    ]


@router.patch("/{workspace_id}/members/{user_id}", response_model=WorkspaceResponse)
async def add_user(
    workspace_id: int,
    user_id: int,
    current_user: CurrentUser,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    if await get_target_membership(workspace_id, user_id, db):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="User already in the workspace"
        )

    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    workspace = await get_workspace_by_id(workspace_id, db)

    db.add(WorkspaceMember(user_id=user_id, workspace_id=workspace_id))
    await db.commit()

    logger.info(
        "Workspace member added workspace_id=%s user_id=%s", workspace_id, user_id
    )

    try:
        await send_member_added_email(
            to_email=target_user.email,
            invitee_username=target_user.username,
            inviter_username=current_user.username,
            workspace_title=workspace.title,
            workspace_url=f"{settings.frontend_url}/workspaces/{workspace_id}",
        )
    except Exception:
        # Still deliberately non-fatal (the member was added); just no
        # longer silent.
        logger.exception(
            "Failed to send member-added email workspace_id=%s user_id=%s",
            workspace_id, user_id,
        )

    return _workspace_response(await get_workspace_by_id(workspace_id, db), member)


@router.post(
    "/{workspace_id}/invite/external",
    dependencies=[Depends(require_admin)],
)
async def invite_external(
    workspace_id: int,
    body: InviteExternalRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    result = await db.execute(
        select(User).where(func.lower(User.email) == body.email.lower())
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email belongs to an existing Filobelo user. Search for them by username or email to add them.",
        )

    workspace = await get_workspace_by_id(workspace_id, db)

    try:
        await send_join_invite_email(
            to_email=body.email,
            inviter_username=current_user.username,
            workspace_title=workspace.title,
            register_url=f"{settings.frontend_url}/register",
        )
    except Exception:
        logger.exception(
            "Failed to send external invite email workspace_id=%s", workspace_id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send invitation email.",
        )

    logger.info("External invite email sent workspace_id=%s", workspace_id)

    return {"message": f"Invitation sent to {body.email}"}


@router.patch(
    "/{workspace_id}/members/{user_id}/admin", response_model=WorkspaceResponse
)
async def make_admin(
    workspace_id: int,
    user_id: int,
    db: DbSession,
    caller_member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    target_member = await get_target_membership(workspace_id, user_id, db)
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this workspace",
        )

    workspace = await get_workspace_by_id(workspace_id, db)
    if target_member.role == "admin":
        return _workspace_response(workspace, caller_member)

    target_member.role = "admin"
    await db.commit()
    logger.info(
        "Workspace member promoted to admin workspace_id=%s user_id=%s",
        workspace_id, user_id,
    )
    return _workspace_response(workspace, caller_member)


@router.delete("/{workspace_id}/members/me", status_code=status.HTTP_204_NO_CONTENT)
async def leave_workspace(
    workspace_id: int,
    db: DbSession,
    membership: Annotated[WorkspaceMember, Depends(require_membership)],
):
    user_id = membership.user_id  # read before commit: the row is gone after
    await handle_membership_departure(membership, db)
    await db.commit()
    logger.info("Workspace member left workspace_id=%s user_id=%s", workspace_id, user_id)


@router.delete("/{workspace_id}/members/{user_id}", response_model=WorkspaceResponse)
async def remove_user(
    workspace_id: int,
    user_id: int,
    db: DbSession,
    caller_member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    target_member = await get_target_membership(workspace_id, user_id, db)
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this workspace",
        )

    await handle_membership_departure(target_member, db)
    await db.commit()
    logger.info(
        "Workspace member removed workspace_id=%s user_id=%s", workspace_id, user_id
    )

    return _workspace_response(await get_workspace_by_id(workspace_id, db), caller_member)
