import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from PIL import UnidentifiedImageError
from sqlalchemy import delete as sql_delete
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.concurrency import run_in_threadpool

from app.auth import (
    create_access_token,
    CurrentUser,
    generate_reset_tokens,
    get_current_user,
    hash_password,
    hash_reset_token,
    LoginForm,
    verify_password,
)
from app.config import settings
from app.database import DbSession
from app.dependencies import handle_membership_departure
from app.models import (
    PasswordResetToken,
    RefreshToken,
    User,
    VerificationToken,
    Workspace,
    WorkspaceMember,
)
from app.redis_client import (
    login_limiter,
    password_reset_limiter,
    register_limiter,
    resend_verification_limiter,
)
from app.schemas import (
    ChangePasswordRequest,
    EmailVerification,
    ForgotPasswordRequest,
    RefreshRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserPrivate,
    UserPublic,
    UserUpdate,
    WorkspaceResponse,
)
from app.utils import (
    delete_profile_image,
    get_user_by_id,
    process_profile_image,
    send_password_reset_email,
    send_verification_email,
    upload_profile_image,
)

router = APIRouter(tags=["users"])
logger = logging.getLogger(__name__)


# =======================================================================================
# CRUD ON USERS
# =======================================================================================


async def _read_profile_image(file: UploadFile) -> tuple[bytes, str]:
    """Reads an uploaded picture, enforces the size limit and re-encodes it
    as a 300x300 JPEG. Returns (bytes, new_filename). Raises 400 on a file
    that is too large or is not an image."""
    # Read one byte past the limit: enough to know it is too big without
    # pulling an arbitrarily large upload into memory.
    content = await file.read(settings.max_upload_size_bytes + 1)

    if len(content) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {settings.max_upload_size_bytes // (1024 * 1024)}MB",
        )

    try:
        # Pillow is CPU-bound: run it in a worker thread, off the event loop.
        return await run_in_threadpool(process_profile_image, content)
    except (UnidentifiedImageError, ValueError) as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image file. Please upload a valid image(JPEG, PNG, GIF, WebP).",
        ) from err


@router.post("", response_model=UserPrivate, status_code=status.HTTP_201_CREATED)
async def create_user(user: UserCreate, db: DbSession):
    return await _register_user(user, db)


# Same registration, sent as a multipart form so it can carry a profile
# picture. This is the only way to set a picture at signup: PATCH /me/picture
# needs a signed-in user, and a new account cannot sign in until its email is
# verified. The JSON route above is unchanged.
@router.post(
    "/with-picture", response_model=UserPrivate, status_code=status.HTTP_201_CREATED
)
async def create_user_with_picture(
    user: Annotated[UserCreate, Form()],
    db: DbSession,
    file: UploadFile | None = None,
):
    return await _register_user(user, db, picture=file)


async def _register_user(
    user: UserCreate, db: AsyncSession, picture: UploadFile | None = None
):
    await register_limiter(user, db)

    # Validated and re-encoded before anything is written, so a bad picture
    # rejects the signup instead of leaving an account behind.
    processed_picture = (
        await _read_profile_image(picture) if picture is not None else None
    )

    result = await db.execute(
        select(User).where(func.lower(User.email) == user.email.lower())
    )
    email_exists = result.scalars().first()

    result = await db.execute(
        select(User).where(func.lower(User.username) == user.username)
    )
    username_exists = result.scalars().first()

    if email_exists:
        raise HTTPException(status_code=400, detail="Email already registered")

    if username_exists:
        raise HTTPException(status_code=400, detail="Username already registered")

    # Argon2 costs tens of milliseconds of CPU: run it in a worker thread so
    # the event loop keeps serving other requests meanwhile.
    hashed_password = await run_in_threadpool(hash_password, user.password)

    new_user = User(
        username=user.username, email=user.email, password_hash=hashed_password
    )

    db.add(new_user)
    await db.flush()

    token = generate_reset_tokens()
    token_hash = hash_reset_token(token)
    expires_at = datetime.now(UTC) + timedelta(hours=24)

    db.add(
        VerificationToken(
            user_id=new_user.id, token_hash=token_hash, expires_at=expires_at
        )
    )
    await db.commit()
    await db.refresh(new_user)

    logger.info("User registered user_id=%s email=%s", new_user.id, new_user.email)

    # Uploaded only after the account exists, so a failed signup never leaves
    # a file in the bucket. A storage failure does not undo the signup: the
    # account is created without a picture and one can be set later.
    if processed_picture is not None:
        picture_bytes, picture_filename = processed_picture
        try:
            await upload_profile_image(picture_bytes, picture_filename)
        except Exception:
            logger.exception(
                "Profile picture upload failed on signup for user_id=%s", new_user.id
            )
        else:
            new_user.image_file = picture_filename
            await db.commit()
            await db.refresh(new_user)

    try:
        await send_verification_email(
            to_email=new_user.email, username=new_user.username, token=token
        )
    except Exception:
        logger.exception(
            "Failed to send verification email on signup for user_id=%s", new_user.id
        )

    return new_user


@router.post("/login", response_model=Token, dependencies=[Depends(login_limiter)])
async def login(db: DbSession, form_data: LoginForm,):
    # here we use the form data username field to accept either email or username, so the user has a choice
    email_or_username = form_data.username.lower()
    result = await db.execute(
        select(User).where(
            or_(
                func.lower(User.email) == email_or_username,
                func.lower(User.username) == email_or_username,
            )
        )
    )
    user = result.scalars().first()

    if not user or not await run_in_threadpool(
        verify_password, form_data.password, user.password_hash
    ):
        # Only the identifier that was typed is logged, never the password.
        # %r escapes control characters so the value cannot fake a log line.
        logger.warning(
            "Login failed identifier=%r reason=%s user_id=%s",
            email_or_username[:254],
            "bad_password" if user else "unknown_account",
            user.id if user else None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password or email/username",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_verified:
        logger.warning(
            "Login failed identifier=%r reason=email_not_verified user_id=%s",
            email_or_username[:254],
            user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in",
        )

    access_token = create_access_token(
        data={"sub": str(user.id)},
        expired_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )

    # rotate refresh token: delete old ones, issue a fresh one
    await db.execute(sql_delete(RefreshToken).where(RefreshToken.user_id == user.id))
    raw_refresh = generate_reset_tokens()

    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_reset_token(raw_refresh),
            expires_at=datetime.now(UTC)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )

    user.last_login = datetime.now(UTC)
    user_id = user.id  # read before commit: reading it after would cost a query
    await db.commit()

    logger.info("Login succeeded user_id=%s", user_id)

    return Token(
        access_token=access_token, refresh_token=raw_refresh, token_type="bearer"
    )


@router.post("/refresh", response_model=Token)
async def refresh_access_token(body: RefreshRequest, db: DbSession):
    token_hash = hash_reset_token(body.refresh_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    stored = result.scalars().first()

    if not stored or stored.expires_at < datetime.now(UTC):
        # Refresh tokens are single-use: each refresh deletes the old one.
        # So "unknown_token" covers both a made-up token and a REUSED one
        # (already rotated, or wiped by a newer login) - the two cannot be
        # told apart here. A burst of these is worth a look either way.
        # The token itself is never logged.
        if stored:
            logger.warning(
                "Refresh rejected reason=expired_token user_id=%s", stored.user_id
            )
        else:
            logger.warning("Refresh rejected reason=unknown_token (invalid or reused)")
        if stored:
            await db.delete(stored)
            await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    result = await db.execute(select(User).where(User.id == stored.user_id))
    user = result.scalars().first()

    if not user:
        logger.warning(
            "Refresh rejected reason=user_not_found user_id=%s", stored.user_id
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    access_token = create_access_token(
        data={"sub": str(user.id)},
        expired_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )

    # rotate: delete old refresh token, issue a new one
    await db.delete(stored)
    raw_refresh = generate_reset_tokens()

    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_reset_token(raw_refresh),
            expires_at=datetime.now(UTC)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    await db.commit()

    return Token(
        access_token=access_token, refresh_token=raw_refresh, token_type="bearer"
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, db: DbSession):
    token_hash = hash_reset_token(body.refresh_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    stored = result.scalars().first()
    if stored:
        user_id = stored.user_id
        await db.delete(stored)
        await db.commit()
        logger.info("Logout user_id=%s", user_id)


@router.get("/me", response_model=UserPrivate)
async def get_me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserPrivate)
async def update_user(current_user: CurrentUser, user_data: UserUpdate, db: DbSession):
    # checks if the user updated their username (not blank or some as before) and if the new username is already taken
    if (
        user_data.username is not None
        and user_data.username.lower() != current_user.username.lower()
    ):
        result = await db.execute(
            select(User).where(User.username == user_data.username)
        )
        existing_username = result.scalars().first()

        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already registered",
            )

    # checks if the user updated their email (not blank or some as before) address and if the new address is already taken
    if (
        user_data.email is not None
        and user_data.email.lower() != current_user.email.lower()
    ):
        result = await db.execute(select(User).where(User.email == user_data.email))
        existing_email = result.scalars().first()

        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
            )

    if user_data.email:
        user_data.email = user_data.email.lower()

    update = user_data.model_dump(exclude_unset=True)
    for field, value in update.items():
        setattr(current_user, field, value)

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(current_user: CurrentUser, db: DbSession):
    old_filename = current_user.image_file
    user_id = current_user.id  # kept for the log line: unreadable after delete

    result = await db.execute(
        select(WorkspaceMember).where(WorkspaceMember.user_id == current_user.id)
    )
    memberships = result.scalars().all()

    for membership in memberships:
        await handle_membership_departure(membership, db)

    await db.delete(current_user)
    await db.commit()

    logger.info(
        "Account deleted user_id=%s memberships_removed=%s", user_id, len(memberships)
    )

    if old_filename:
        await delete_profile_image(old_filename)


# ========================================================================================
# EMAIL VERIFICATION
# ========================================================================================


@router.post("/verify-email", status_code=status.HTTP_200_OK)
async def verify_email(request_data: EmailVerification, db: DbSession):
    token_hash = hash_reset_token(request_data.token)

    result = await db.execute(
        select(VerificationToken).where(VerificationToken.token_hash == token_hash)
    )
    verification_token = result.scalars().first()

    if not verification_token:
        logger.info("Email verification rejected reason=unknown_token")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link",
        )

    if verification_token.expires_at < datetime.now(UTC):
        logger.info(
            "Email verification rejected reason=expired_token user_id=%s",
            verification_token.user_id,
        )
        await db.delete(verification_token)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link",
        )

    result = await db.execute(
        select(User).where(User.id == verification_token.user_id)
    )
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link",
        )

    user.is_verified = True
    user_id = user.id  # read before commit: reading it after would cost a query
    await db.delete(verification_token)
    await db.commit()

    logger.info("Email verified user_id=%s", user_id)

    return {"message": "Email verified successfully"}


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification_email(
    db: DbSession, request_data: ResendVerificationRequest
):
    await resend_verification_limiter(request_data, db)

    email_or_username = request_data.identifier.lower()
    result = await db.execute(
        select(User).where(
            or_(
                func.lower(User.email) == email_or_username,
                func.lower(User.username) == email_or_username,
            )
        )
    )
    user = result.scalars().first()

    if user and not user.is_verified:
        await db.execute(
            sql_delete(VerificationToken).where(VerificationToken.user_id == user.id)
        )

        token = generate_reset_tokens()
        token_hash = hash_reset_token(token)
        expires_at = datetime.now(UTC) + timedelta(hours=24)

        db.add(
            VerificationToken(
                user_id=user.id, token_hash=token_hash, expires_at=expires_at
            )
        )
        await db.commit()

        logger.info("Verification email re-requested user_id=%s", user.id)

        try:
            await send_verification_email(
                to_email=user.email, username=user.username, token=token
            )
        except Exception:
            logger.exception(
                "Failed to resend verification email for user_id=%s", user.id
            )

    return {
        "message": "If an account exists and isn't verified yet, a new verification link has been sent"
    }


# ========================================================================================
# PASSWORD RESET
# ========================================================================================


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(db: DbSession, request_data: ForgotPasswordRequest):
    await password_reset_limiter(request_data, db)

    result = await db.execute(
        select(User).where(func.lower(User.email) == request_data.email.lower())
    )
    user = result.scalars().first()

    if user:
        await db.execute(
            sql_delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )

        token = generate_reset_tokens()
        token_hash = hash_reset_token(token)
        expires_at = datetime.now(UTC) + timedelta(
            minutes=settings.reset_token_expire_minutes
        )

        db.add(
            PasswordResetToken(
                user_id=user.id, token_hash=token_hash, expires_at=expires_at
            )
        )
        await db.commit()

        logger.info("Password reset requested user_id=%s", user.id)

        try:
            await send_password_reset_email(
                to_email=user.email, username=user.username, token=token
            )
        except Exception:
            logger.exception(
                "Failed to send password reset email for user_id=%s", user.id
            )
    else:
        # The response is identical either way (so callers cannot tell which
        # emails have accounts); only the log shows the difference.
        logger.info(
            "Password reset requested for unknown email=%r", request_data.email[:254]
        )

    return {
        "message": "If an account exists with this email, you will receive password reset instructions"
    }


@router.post("/reset-password")
async def reset_password(request_data: ResetPasswordRequest, db: DbSession):
    token_hash = hash_reset_token(request_data.token)

    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    reset_token = result.scalars().first()

    # if the token doesn't exist
    if not reset_token:
        logger.warning("Password reset rejected reason=unknown_token")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # if the token is expired
    if reset_token.expires_at < datetime.now(UTC):
        logger.warning(
            "Password reset rejected reason=expired_token user_id=%s",
            reset_token.user_id,
        )
        await db.delete(reset_token)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    result = await db.execute(select(User).where(User.id == reset_token.user_id))
    user = result.scalars().first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    user.password_hash = await run_in_threadpool(
        hash_password, request_data.new_password
    )
    user_id = user.id  # read before commit: reading it after would cost a query

    await db.execute(
        sql_delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id),
    )
    await db.commit()

    logger.info("Password reset completed user_id=%s", user_id)

    return {"message": "Password changed successfully"}


@router.patch("/me/password")
async def change_password(
    current_user: CurrentUser, password_data: ChangePasswordRequest, db: DbSession
):
    if not await run_in_threadpool(
        verify_password, password_data.current_password, current_user.password_hash
    ):
        logger.warning(
            "Password change rejected reason=wrong_current_password user_id=%s",
            current_user.id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Current password is incorrect",
        )

    new_password_hash = await run_in_threadpool(
        hash_password, password_data.new_password
    )
    current_user.password_hash = new_password_hash
    user_id = current_user.id  # read before commit: reading it after would cost a query

    await db.execute(
        sql_delete(PasswordResetToken).where(
            PasswordResetToken.user_id == current_user.id
        )
    )

    await db.commit()
    logger.info("Password changed user_id=%s", user_id)
    return {"message": "Password changed successfully"}


# ========================================================================================
# OPERATIONS ON SUBRESOURCES
# ========================================================================================


@router.get("/me/workspaces", response_model=list[WorkspaceResponse])
async def get_user_workspaces(current_user: CurrentUser, db: DbSession):
    # WorkspaceResponse reads members and tasks (the lists, and the counts /
    # progress properties built on them), so both are loaded here.
    result = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.members), selectinload(Workspace.tasks))
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == current_user.id)
    )
    workspaces = result.scalars().all()

    return workspaces


@router.get("/search", response_model=UserPublic, dependencies=[Depends(get_current_user)])
async def search_user(q: Annotated[str, Query(min_length=1)], db: DbSession):
    result = await db.execute(
        select(User).where(
            or_(
                func.lower(User.username) == q.strip().lower(),
                func.lower(User.email) == q.strip().lower(),
            )
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user found with that username or email",
        )

    return user


@router.get("/{user_id}", response_model=UserPublic)
async def get_user(user_id: int, db: DbSession):
    user = await get_user_by_id(user_id, db)
    return user


@router.patch("/me/picture", response_model=UserPrivate)
async def upload_profile_picture(
    file: UploadFile, current_user: CurrentUser, db: DbSession
):
    processed_bytes, new_filename = await _read_profile_image(file)

    try:
        await upload_profile_image(processed_bytes, new_filename)
    except ClientError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to upload image. Please try again",
        ) from err

    old_filename = current_user.image_file  # store the old filename
    current_user.image_file = new_filename

    await db.commit()
    await db.refresh(current_user)

    if old_filename:
        await delete_profile_image(old_filename)

    return current_user


@router.delete("/me/picture", response_model=UserPrivate)
async def delete_profile_picture(current_user: CurrentUser, db: DbSession,):
    old_filename = current_user.image_file

    if old_filename is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No profile picture to delete",
        )

    current_user.image_file = None
    await db.commit()
    await db.refresh(current_user)

    await delete_profile_image(old_filename)
    return current_user
