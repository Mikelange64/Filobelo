import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.database import DbSession
from app.dependencies import require_superuser
from app.models import User
from app.schemas import PaginatedSuperUserResponse, SuperUserResponse
from app.utils import get_user_by_id

router = APIRouter(tags=["superusers"])

# Who performed the action is the "user=" field at the start of the log line.
logger = logging.getLogger(__name__)


@router.get(
    "/all",
    response_model=PaginatedSuperUserResponse,
    dependencies=[Depends(require_superuser)],
)
async def get_all_users(
    db: DbSession,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
):
    result = await db.execute(select(func.count()).select_from(User))
    result_count = result.scalar()
    total = result_count or 0

    result = await db.execute(
        select(User).order_by(User.joined_at.desc()).offset(skip).limit(limit)
    )
    users = result.scalars().all()

    has_more = skip + len(users) < total

    response = PaginatedSuperUserResponse(
        users=[SuperUserResponse.model_validate(u) for u in users],
        total=total,
        skip=skip,
        limit=limit,
        has_more=has_more,
    )
    return response


@router.get(
    "/{user_id}",
    response_model=SuperUserResponse,
    dependencies=[Depends(require_superuser)],
)
async def get_user(user_id: int, db: DbSession):
    user = await get_user_by_id(user_id, db)
    return user


@router.patch(
    "/{user_id}/make-superuser",
    response_model=SuperUserResponse,
    dependencies=[Depends(require_superuser)],
)
async def make_superuser(user_id: int, db: DbSession):
    user = await get_user_by_id(user_id, db)
    user.is_superuser = True
    await db.commit()
    logger.info("Superuser granted target_user_id=%s", user_id)
    await db.refresh(user)
    return user


@router.patch(
    "/{user_id}/remove-superuser",
    response_model=SuperUserResponse,
    dependencies=[Depends(require_superuser)],
)
async def remove_superuser(
    user_id: int,
    db: DbSession,
    current_user: Annotated[User, Depends(require_superuser)],
):
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Cannot demote self"
        )
    user = await get_user_by_id(user_id, db)
    user.is_superuser = False
    await db.commit()
    logger.info("Superuser revoked target_user_id=%s", user_id)
    await db.refresh(user)
    return user
