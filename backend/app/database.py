from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


def _async_database_url(url: str) -> str:
    """The async engine needs the driver spelled out ("postgresql+psycopg://").
    A plain "postgresql://" URL (the default in app/config.py, and a common
    way to write it in a .env) is rewritten here, so no .env has to change."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url.removeprefix(prefix)
    return url


# Default back to sqlite ONLY if the .env variable is missing
SQLALCHEMY_DATABASE_URL = _async_database_url(settings.database_url)

# No 'check_same_thread' because we are on Postgres now!
engine = create_async_engine(SQLALCHEMY_DATABASE_URL)

# expire_on_commit=False: after a commit the objects keep the values they
# already have. With the default (True) they would be reloaded on the next
# attribute access, and an async session cannot run that hidden query.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


DbSession = Annotated[AsyncSession, Depends(get_db)]
