import time
import logging

from fastapi import HTTPException, status
from redis import Redis
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
    socket_timeout=0.2
)


def _check_rate_limit(identifier: str, kind: str, window: int, max_num: int) -> None:
    key = f"ratelimit:{kind}:{identifier}"
    now = time.time()

    try:
        redis_client.zadd(key, {str(now): now})
        redis_client.zremrangebyscore(key, 0, now - window)
        count = redis_client.zcard(key)
        redis_client.expire(key, window)  # so inactive keys eventually clean themselves up
    except RedisError:
        logger.warning("Redis unavailable, skipping rate limit for kind=%s", kind)
        return

    if count > max_num:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests, please try again later.",
        )


def _resolve_identity(identifier: str, db: DbSession) -> str:
    identifier = identifier.lower()
    user = (
        db.execute(
            select(User).where(
                or_(
                    func.lower(User.email) == identifier,
                    func.lower(User.username) == identifier,
                )
            )
        )
        .scalars()
        .first()
    )
    return str(user.id) if user else identifier


def login_limiter(data: LoginForm, db: DbSession) -> None:
    identifier = _resolve_identity(data.username, db)
    _check_rate_limit(identifier, kind="login", window=60, max_num=5)


def register_limiter(data: UserCreate, db: DbSession) -> None:
    _check_rate_limit(data.email.lower(), kind="register", window=60, max_num=3)


def password_reset_limiter(data: ForgotPasswordRequest, db: DbSession) -> None:
    _check_rate_limit(data.email.lower(), kind="password_reset", window=300, max_num=3)


def resend_verification_limiter(data: ResendVerificationRequest, db: DbSession) -> None:
    identifier = _resolve_identity(data.identifier, db)
    _check_rate_limit(identifier, kind="resend_verification", window=300, max_num=3)
