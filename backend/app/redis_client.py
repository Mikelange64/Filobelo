import logging
import time

from fastapi import HTTPException, status
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import func, or_, select

from app.auth import LoginForm
from app.config import settings
from app.database import DbSession
from app.models import User
from app.schemas import ForgotPasswordRequest, ResendVerificationRequest, UserCreate

logger = logging.getLogger(__name__)
redis_client = Redis.from_url(
    settings.redis_url,
    decode_responses=True,
    socket_connect_timeout=0.2,
    socket_timeout=0.2,
)


async def _check_rate_limit(identifier: str, kind: str, window: int, max_num: int) -> None:
    key = f"ratelimit:{kind}:{identifier}"
    now = time.time()

    try:
        await redis_client.zadd(key, {str(now): now})
        await redis_client.zremrangebyscore(key, 0, now - window)
        count = await redis_client.zcard(key)
        await redis_client.expire(
            key, window
        )  # so inactive keys eventually clean themselves up
    except RedisError:
        logger.warning("Redis unavailable, skipping rate limit for kind=%s", kind)
        return

    if count > max_num:
        # identifier is a user id when the account exists, otherwise the
        # email/username that was typed (%r escapes it - see logging_config.py).
        logger.warning(
            "Rate limit hit kind=%s identifier=%r count=%s limit=%s window_s=%s",
            kind, identifier, count, max_num, window,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests, please try again later.",
        )


async def _resolve_identity(identifier: str, db: DbSession) -> str:
    identifier = identifier.lower()
    result = await db.execute(
        select(User).where(
            or_(
                func.lower(User.email) == identifier,
                func.lower(User.username) == identifier,
            )
        )
    )
    user = result.scalars().first()
    return str(user.id) if user else identifier


async def login_limiter(data: LoginForm, db: DbSession) -> None:
    identifier = await _resolve_identity(data.username, db)
    await _check_rate_limit(identifier, kind="login", window=60, max_num=5)


async def register_limiter(data: UserCreate, db: DbSession) -> None:
    await _check_rate_limit(data.email.lower(), kind="register", window=60, max_num=3)


async def password_reset_limiter(data: ForgotPasswordRequest, db: DbSession) -> None:
    await _check_rate_limit(data.email.lower(), kind="password_reset", window=300, max_num=3)


async def resend_verification_limiter(data: ResendVerificationRequest, db: DbSession) -> None:
    identifier = await _resolve_identity(data.identifier, db)
    await _check_rate_limit(identifier, kind="resend_verification", window=300, max_num=3)
