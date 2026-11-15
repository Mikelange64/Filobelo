import logging

from fastapi import HTTPException, status

from sqlalchemy import select

from app.sync_legacy.database import DbSession
from app.models import Task, User, Workspace, WorkspaceMember
from app.sync_legacy.auth import CurrentUser

# The 403s below are logged at WARNING. One of them now and then is a stale
# browser tab; a run of them from one user across many workspace ids is
# someone probing workspaces they do not belong to.
logger = logging.getLogger(__name__)


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
        logger.warning(
            "Forbidden: admin required user_id=%s workspace_id=%s",
            current_user.id, workspace_id,
        )
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
        # Also fires when the workspace id does not exist at all.
        logger.warning(
            "Forbidden: not a member user_id=%s workspace_id=%s",
            current_user.id, workspace_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="User is not a member of this workspace"
        )

    return is_member


def require_task_in_workspace(workspace_id: int, task_id: int, db: DbSession) -> Task:
    """404s unless task_id belongs to the workspace_id in the same URL.

    require_membership only proves the caller belongs to the URL's workspace;
    it says nothing about the task. Any route nested under
    /{workspace_id}/tasks/{task_id}/... needs this too, or a member of one
    workspace could reach another workspace's task (and everything hanging
    off it) just by putting its id in the path.
    """
    # Deferred import: app.utils.queries imports nothing from here, but
    # app.utils.__init__ pulls in modules that do.
    from app.sync_legacy.queries import get_task_by_id

    return get_task_by_id(task_id, workspace_id, db)


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



def handle_membership_departure(membership: WorkspaceMember, db: DbSession) -> None:
    """Call whenever a WorkspaceMember row is about to go away (leave, kick,
    or the user's whole account being deleted), before committing.

    A workspace has no single owner - it belongs to whoever's still in it.
    If this leaves nobody, the workspace goes with them. If it removes the
    last admin but other members remain, adminship passes automatically to
    whoever's been there longest rather than leaving the workspace stuck
    with no admin.

    Known edge cases (deliberately deferred, not fixed):
    - Not race-safe: this is check-then-act with no row locking, so two
      near-simultaneous departures from the same workspace (e.g. both
      admins leaving at once) could both read "other admins exist" before
      either commits, leaving the workspace briefly (or permanently)
      admin-less. Needs a SELECT ... FOR UPDATE on the workspace's
      membership rows, or an application-level lock, to close properly.
    - Successor tie-breaking on identical joined_at is arbitrary: if two
      members joined at the exact same timestamp, `min()` just returns
      whichever Postgres happens to return first - not a deliberate
      choice. A secondary sort key (e.g. user_id) would make it
      deterministic.
    Both are low-probability enough that they're being tracked rather than
    fixed right now.
    """
    other_members = db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == membership.workspace_id,
            WorkspaceMember.user_id != membership.user_id,
        )
    ).scalars().all()

    # Note for both log lines below: the caller commits after this returns, so
    # they describe what is about to be saved.
    if not other_members:
        workspace = db.get(Workspace, membership.workspace_id)
        logger.info(
            "Workspace deleted: last member departed workspace_id=%s last_member_user_id=%s",
            membership.workspace_id, membership.user_id,
        )
        db.delete(workspace)
        return

    if membership.role == "admin" and not any(m.role == "admin" for m in other_members):
        successor = min(other_members, key=lambda m: m.joined_at)
        successor.role = "admin"
        logger.info(
            "Workspace admin passed on automatically workspace_id=%s "
            "departing_user_id=%s new_admin_user_id=%s",
            membership.workspace_id, membership.user_id, successor.user_id,
        )

    db.delete(membership)


def require_superuser(current_user: CurrentUser) -> User:
    if not current_user.is_superuser:
        logger.warning(
            "Forbidden: superuser required user_id=%s", current_user.id
        )
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "User not allowed to perform this action"
        )
        
    return current_user


