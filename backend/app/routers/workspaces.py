from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.auth import CurrentUser
from app.database import DbSession
from app.dependencies import (
    get_target_membership,
    handle_membership_departure,
    require_admin,
    require_membership,
)
from app.models import Folder, User, Workspace, WorkspaceMember
from app.config import settings
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


# ========================================================================================
# WORKSPACE CRUD
# ========================================================================================


@router.get("", response_model=PaginatedWorkspaceResponse)
def get_my_workspaces(
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

    total = db.execute(select(func.count()).select_from(base.subquery())).scalar() or 0

    workspaces = (
        db.execute(
            base.options(joinedload(Workspace.members), joinedload(Workspace.tasks))
            .offset(skip)
            .limit(limit)
        )
        .scalars()
        .unique()
        .all()
    )

    workspace_ids = [ws.id for ws in workspaces]
    member_map = {
        m.workspace_id: m
        for m in db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id.in_(workspace_ids),
                WorkspaceMember.user_id == current_user.id,
            )
        ).scalars()
    }

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
def create_workspace(
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
    db.flush()

    new_member = WorkspaceMember(
        user_id=current_user.id, workspace_id=new_workspace.id, role="admin"
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_workspace)

    return _workspace_response(new_workspace, new_member)


@router.get("/completed", response_model=PaginatedWorkspaceResponse)
def get_completed_workspaces(
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

    total = db.execute(select(func.count()).select_from(base.subquery())).scalar() or 0

    workspaces = (
        db.execute(
            base.options(joinedload(Workspace.members), joinedload(Workspace.tasks))
            .offset(skip)
            .limit(limit)
        )
        .scalars().unique().all()
    )

    workspace_ids = [ws.id for ws in workspaces]
    member_map = {
        m.workspace_id: m
        for m in db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id.in_(workspace_ids),
                WorkspaceMember.user_id == current_user.id,
            )
        ).scalars()
    }

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
def complete_workspace(
    workspace_id: int,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    workspace = db.execute(
        select(Workspace)
        .options(joinedload(Workspace.members), joinedload(Workspace.tasks))
        .where(Workspace.id == workspace_id)
    ).scalars().first()

    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    workspace.is_completed = True
    workspace.completed_at = datetime.now(UTC)
    db.commit()
    db.refresh(workspace)

    return _workspace_response(workspace, member)


@router.patch("/{workspace_id}/reopen", response_model=WorkspaceResponse)
def reopen_workspace(
    workspace_id: int,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    workspace = db.execute(
        select(Workspace)
        .options(joinedload(Workspace.members), joinedload(Workspace.tasks))
        .where(Workspace.id == workspace_id)
    ).scalars().first()

    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    workspace.is_completed = False
    workspace.completed_at = None
    db.commit()
    db.refresh(workspace)

    return _workspace_response(workspace, member)


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
def get_workspace(
    workspace_id: int, db: DbSession, current_user: CurrentUser
):
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

    member = db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id,
        )
    ).scalars().first()

    return _workspace_response(workspace, member)


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
def update_workspace_partial(
    workspace_id: int,
    workspace_data: WorkspaceUpdate,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    workspace = get_workspace_by_id(workspace_id, db)

    update = workspace_data.model_dump(exclude_unset=True)
    for field, value in update.items():
        setattr(workspace, field, value)

    db.commit()
    db.refresh(workspace)
    return _workspace_response(workspace, member)


@router.put("/{workspace_id}/", response_model=WorkspaceResponse)
def update_workspace_full(
    workspace_id: int,
    workspace_data: WorkspaceCreate,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    workspace = get_workspace_by_id(workspace_id, db)

    workspace.title = workspace_data.title
    workspace.description = workspace_data.description
    workspace.max_number = workspace_data.max_number
    workspace.due_date = workspace_data.due_date

    db.commit()
    db.refresh(workspace)
    return _workspace_response(workspace, member)


@router.patch("/{workspace_id}/me", response_model=WorkspaceResponse)
def update_my_workspace_preferences(
    workspace_id: int,
    data: WorkspaceMemberPrefsUpdate,
    db: DbSession,
    current_user: CurrentUser,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    """Pin/archive/file this workspace for the caller only - any member can
    do this for themselves, it never touches anyone else's view."""
    workspace = get_workspace_by_id(workspace_id, db)

    update = data.model_dump(exclude_unset=True)
    if update.get("folder_id") is not None:
        folder = db.get(Folder, update["folder_id"])
        if not folder or folder.owner_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found"
            )

    for field, value in update.items():
        setattr(member, field, value)

    db.commit()
    db.refresh(member)
    return _workspace_response(workspace, member)


# ========================================================================================
# MEMBER MANAGEMENT
# ========================================================================================


@router.get(
    "/{workspace_id}/members",
    response_model=list[WorkspaceMemberPublic],
    dependencies=[Depends(require_membership)],
)
def get_members(workspace_id: int, db: DbSession):
    rows = db.execute(
        select(WorkspaceMember, User)
        .join(User, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id == workspace_id)
    ).all()
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
def add_user(
    workspace_id: int,
    user_id: int,
    current_user: CurrentUser,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    if get_target_membership(workspace_id, user_id, db):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="User already in the workspace"
        )

    target_user = db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    workspace = get_workspace_by_id(workspace_id, db)

    db.add(WorkspaceMember(user_id=user_id, workspace_id=workspace_id))
    db.commit()

    try:
        send_member_added_email(
            to_email=target_user.email,
            invitee_username=target_user.username,
            inviter_username=current_user.username,
            workspace_title=workspace.title,
            workspace_url=f"{settings.frontend_url}/workspaces/{workspace_id}",
        )
    except Exception:
        pass

    return _workspace_response(get_workspace_by_id(workspace_id, db), member)


@router.post(
    "/{workspace_id}/invite/external",
    dependencies=[Depends(require_admin)],
)
def invite_external(
    workspace_id: int,
    body: InviteExternalRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    existing_user = db.execute(
        select(User).where(func.lower(User.email) == body.email.lower())
    ).scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email belongs to an existing Filobelo user. Search for them by username or email to add them.",
        )

    workspace = get_workspace_by_id(workspace_id, db)

    try:
        send_join_invite_email(
            to_email=body.email,
            inviter_username=current_user.username,
            workspace_title=workspace.title,
            register_url=f"{settings.frontend_url}/register",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send invitation email.",
        )

    return {"message": f"Invitation sent to {body.email}"}


@router.patch("/{workspace_id}/members/{user_id}/admin", response_model=WorkspaceResponse)
def make_admin(
    workspace_id: int,
    user_id: int,
    db: DbSession,
    caller_member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    target_member = get_target_membership(workspace_id, user_id, db)
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this workspace",
        )

    workspace = get_workspace_by_id(workspace_id, db)
    if target_member.role == "admin":
        return _workspace_response(workspace, caller_member)

    target_member.role = "admin"
    db.commit()
    return _workspace_response(workspace, caller_member)


@router.delete("/{workspace_id}/members/me", status_code=status.HTTP_204_NO_CONTENT)
def leave_workspace(
    workspace_id: int,
    db: DbSession,
    membership: Annotated[WorkspaceMember, Depends(require_membership)],
):
    handle_membership_departure(membership, db)
    db.commit()


@router.delete("/{workspace_id}/members/{user_id}", response_model=WorkspaceResponse)
def remove_user(
    workspace_id: int,
    user_id: int,
    db: DbSession,
    caller_member: Annotated[WorkspaceMember, Depends(require_admin)],
):
    target_member = get_target_membership(workspace_id, user_id, db)
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of this workspace",
        )

    handle_membership_departure(target_member, db)
    db.commit()

    return _workspace_response(get_workspace_by_id(workspace_id, db), caller_member)
