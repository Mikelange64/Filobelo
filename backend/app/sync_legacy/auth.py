from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select

from app.auth import oauth2_scheme, verify_access_token
from app.logging_config import set_user_id
from app.models.users import User
from app.sync_legacy.database import DbSession


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: DbSession,
):
    user_id = verify_access_token(token)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Lets every log line for this request show who made it (see
    # app/logging_config.py). The user is already loaded, so this is free.
    set_user_id(user.id)

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
