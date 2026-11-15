from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy import update as sql_update

from app.auth import CurrentUser
from app.database import DbSession
from app.models import Folder, WorkspaceMember
from app.schemas import FolderCreate, FolderResponse, FolderUpdate
from app.utils.queries import get_folder_by_id

router = APIRouter(tags=["folders"])


@router.post("", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
def create_folder(data: FolderCreate, current_user: CurrentUser, db: DbSession):
    if data.parent_id is not None:
        # 404 whether the parent is missing or someone else's - don't leak which
        get_folder_by_id(data.parent_id, current_user.id, db)

    folder = Folder(
        owner_id=current_user.id,
        name=data.name,
        color=data.color,
        parent_id=data.parent_id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.get("", response_model=list[FolderResponse])
def list_folders(current_user: CurrentUser, db: DbSession):
    folders = (
        db.execute(
            select(Folder).where(Folder.owner_id == current_user.id).order_by(Folder.id)
        )
        .scalars().all()
    )
    return folders


@router.patch("/{folder_id}", response_model=FolderResponse)
def update_folder(folder_id: int, data: FolderUpdate, current_user: CurrentUser, db: DbSession):
    folder = _get_owned_folder(folder_id, current_user.id, db)

    update = data.model_dump(exclude_unset=True)

    # parent_id is the only field where an explicit null means something
    # (move to top level); a null name/color is just "not provided".
    for field in ("name", "color"):
        if update.get(field) is None:
            update.pop(field, None)

    new_parent_id = update.get("parent_id")
    if new_parent_id is not None and new_parent_id != folder.parent_id:
        _validate_move(folder, new_parent_id, current_user.id, db)

    for field, value in update.items():
        setattr(folder, field, value)

    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(folder_id: int, current_user: CurrentUser, db: DbSession):
    folder = _get_owned_folder(folder_id, current_user.id, db)

    # Least destructive: only this one folder goes away. Its direct subfolders
    # and the workspaces filed directly in it move up one level, to this
    # folder's parent (or to the top level if it had none). Deeper descendants
    # are untouched, so the rest of the subtree keeps its shape.
    new_parent_id = folder.parent_id

    db.execute(
        sql_update(Folder)
        .where(Folder.parent_id == folder_id, Folder.owner_id == current_user.id)
        .values(parent_id=new_parent_id)
    )
    db.execute(
        sql_update(WorkspaceMember)
        .where(WorkspaceMember.folder_id == folder_id)
        .values(folder_id=new_parent_id)
    )
    db.delete(folder)
    db.commit()


def _validate_move(folder: Folder, new_parent_id: int, user_id: int, db: DbSession) -> None:
    """Reject a move that would put a folder inside itself or its own subtree."""
    if new_parent_id == folder.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A folder cannot be its own parent",
        )

    # 404 whether the target is missing or someone else's - don't leak which
    get_folder_by_id(new_parent_id, user_id, db)

    # Walk up from the target: if we reach the folder being moved, the target
    # is one of its descendants. One query for the whole (per-user) tree, and
    # the seen-set makes the walk terminate even on already-corrupt data.
    parent_of = dict(
        db.execute(
            select(Folder.id, Folder.parent_id).where(Folder.owner_id == user_id)
        ).all()
    )
    seen: set[int] = set()
    cursor: int | None = new_parent_id
    while cursor is not None and cursor not in seen:
        if cursor == folder.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A folder cannot be moved into one of its own subfolders",
            )
        seen.add(cursor)
        cursor = parent_of.get(cursor)


def _get_owned_folder(folder_id: int, user_id: int, db: DbSession) -> Folder:
    folder = db.execute(
        select(Folder).where(Folder.id == folder_id)
    ).scalars().first()

    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    if folder.owner_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your folder")

    return folder
