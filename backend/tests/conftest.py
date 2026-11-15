import os
from collections.abc import AsyncGenerator
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import boto3
import pytest
from httpx import ASGITransport, AsyncClient
from moto import mock_aws
from PIL import Image
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

# The test database and Redis index are created, flushed and dropped by each
# pytest session, so two sessions pointed at the same ones corrupt each other.
# Set TEST_DATABASE_URL / TEST_REDIS_URL to give a second checkout its own:
#
#   TEST_DATABASE_URL=postgresql+psycopg://mikelange64@localhost/test_workspaceapp_async \
#   TEST_REDIS_URL=redis://localhost:6379/14 uv run pytest
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://mikelange64@localhost/test_workspaceapp",
)
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["S3_BUCKET_NAME"] = "test-bucket"
os.environ["S3_ACCESS_KEY_ID"] = "testing"
os.environ["S3_SECRET_ACCESS_KEY"] = "testing"
os.environ["S3_REGION"] = "us-east-2"
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["AWS_DEFAULT_REGION"] = "us-east-2"
os.environ["MAIL_HOST"] = "localhost"
os.environ["MAIL_PORT"] = "587"
os.environ["MAIL_USERNAME"] = ""
os.environ["MAIL_PASSWORD"] = ""
os.environ["MAIL_FROM"] = "test@example.com"
os.environ["MAIL_USE_TLS"] = "False"
os.environ["FRONTEND_URL"] = "http://localhost:3000"
os.environ["REDIS_URL"] = os.environ.get(
    "TEST_REDIS_URL", "redis://localhost:6379/15"
)

from app.database import Base, get_db
from app.main import app
from app.redis_client import redis_client
from tests.auth_helpers import (
    auth_header,
    create_test_user,
    create_workspace,
    login_user,
)


# Lets pytest run `async def` tests: each one is marked @pytest.mark.anyio and
# runs inside an event loop. The plugin ships with anyio (a Starlette
# dependency), so there is nothing extra to install.
pytest_plugins = ["anyio"]


# anyio supports several async backends; the app runs on asyncio. Session
# scoped so the session-scoped async fixtures below can use it, and so every
# test shares one event loop.
@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


# NullPool: no connection is kept between uses, so none can outlive the test
# that opened it.
@pytest.fixture(scope="session")
def test_engine():
    engine = create_async_engine(os.environ["DATABASE_URL"], poolclass=NullPool)
    return engine


@pytest.fixture(scope="session")
async def setup_database(test_engine):
    async with test_engine.begin() as conn:
        # create_all is a sync operation, so it goes through run_sync()
        await conn.run_sync(Base.metadata.create_all)
    yield

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await test_engine.dispose()


# ----------------------------------------------------------------------------------------
# TRANSITIONAL (async rewrite): removed in the cleanup phase.
#
# While the routers are converted one at a time, some requests use the sync
# session and some the async one. Those are two different database
# connections, and one connection cannot see another's uncommitted rows, so
# the usual "wrap the test in a transaction and roll it back" isolation cannot
# work yet. Until every router is async, each request commits for real (as in
# production) and the tables are emptied after every test instead. The
# rollback fixture from the reference project replaces this at the end.
# ----------------------------------------------------------------------------------------


@pytest.fixture(scope="session")
def sync_test_engine():
    engine = create_engine(os.environ["DATABASE_URL"], poolclass=NullPool)
    yield engine
    engine.dispose()


async def _empty_all_tables(engine) -> None:
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        # Fail instead of hanging forever if a test left a transaction open.
        await conn.execute(text("SET LOCAL lock_timeout = '10s'"))
        await conn.execute(text(f"TRUNCATE TABLE {tables} CASCADE"))


@pytest.fixture
def sync_db_session(setup_database, sync_test_engine):
    """A sync session for the few tests that call a not-yet-converted sync
    function directly (the bot service)."""
    with sessionmaker(bind=sync_test_engine)() as session:
        yield session


@pytest.fixture
async def db_session(test_engine, setup_database) -> AsyncGenerator[AsyncSession]:
    test_async_session = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with test_async_session() as session:
        # Requests run on their own connections for now (see the note above),
        # so a row this session has only flushed would be invisible to them
        # and would hold a lock they wait on. Committing instead makes a
        # test's own setup visible, which is what flush gave it before.
        session.flush = session.commit
        try:
            yield session
        finally:
            await session.close()
            await _empty_all_tables(test_engine)


@pytest.fixture
async def _flush_test_redis():
    """Isolated DB index (15) from dev/prod, flushed before every test so the
    rate limiters (register/login/password-reset) never bleed state across tests."""
    redis_client.flushdb()
    yield


@pytest.fixture
async def client(
    db_session: AsyncSession, sync_test_engine, _flush_test_redis
) -> AsyncGenerator[AsyncClient]:
    sync_session_factory = sessionmaker(bind=sync_test_engine)

    # Each request gets its own session, exactly as in production.
    def override_get_db():
        with sync_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    # ASGITransport calls the app in memory, with no network involved.
    # follow_redirects matches what the previous TestClient did by default.
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        follow_redirects=True,
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ========================================================================================
# SHARED FIXTURES
# ========================================================================================


@pytest.fixture
async def user(client, db_session):
    """Create and return a default test user (pre-verified to bypass email flow)."""
    from app.models import User as UserModel
    user_data = await create_test_user(client)
    u = await db_session.get(UserModel, user_data["id"])
    u.is_verified = True
    await db_session.flush()
    return user_data


@pytest.fixture
async def premium_user(user, db_session):
    """Upgrade the default test user to premium (needed for Filobelo bot access)."""
    from app.models import User as UserModel
    u = await db_session.get(UserModel, user["id"])
    u.is_premium = True
    await db_session.flush()
    return user


@pytest.fixture
async def non_premium_user(user, db_session):
    """Downgrade the default test user to non-premium - new users default to
    premium (portfolio project, every signup should be able to try Filobelo),
    so tests exercising the premium gate itself need this explicitly."""
    from app.models import User as UserModel
    u = await db_session.get(UserModel, user["id"])
    u.is_premium = False
    await db_session.flush()
    return user


@pytest.fixture
async def user_token(client, user):
    """Return a valid auth token for the default user."""
    return await login_user(client)


@pytest.fixture
def user_auth_headers(user_token):
    """Return Authorization headers for the default user."""
    return auth_header(user_token)


@pytest.fixture
async def workspace(client, user_token):
    """Create and return a workspace owned by the default user."""
    return await create_workspace(client, user_token)


@pytest.fixture
async def second_user(client, db_session):
    """Create and return a second user (pre-verified to bypass email flow)."""
    from app.models import User as UserModel
    user_data = await create_test_user(client, username="user2", email="user2@example.com")
    u = await db_session.get(UserModel, user_data["id"])
    u.is_verified = True
    await db_session.flush()
    return user_data


@pytest.fixture
async def second_user_token(client, second_user):
    """Return a valid auth token for the second user."""
    return await login_user(client, email="user2@example.com")


@pytest.fixture
def mocked_s3():
    """Create an in-memory mock S3 bucket for testing."""
    with mock_aws():
        s3 = boto3.client("s3", region_name=os.environ["S3_REGION"])
        s3.create_bucket(
            Bucket=os.environ["S3_BUCKET_NAME"],
            CreateBucketConfiguration={"LocationConstraint": os.environ["S3_REGION"]},
        )
        yield s3


@pytest.fixture
def test_image() -> bytes:
    """Generate a small valid JPEG image in memory."""
    img = Image.new("RGB", (100, 100), color="red")
    buf = BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


class FakeCompletions:
    """Stands in for client.chat.completions - records every create() call and
    lets a test control the response (or force an error) without touching
    the real DeepSeek API."""

    def __init__(self):
        self.output_text = "This is Filobelo's reply."
        self.exception: Exception | None = None
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.exception is not None:
            raise self.exception
        message = SimpleNamespace(content=self.output_text, tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


@pytest.fixture
def fake_bot_client(monkeypatch):
    """Swaps filobelo_bot's real OpenAI-compatible client for a fake one for
    the duration of the test. monkeypatch reverts this automatically on
    teardown."""
    from app.bot_service import filobelo_bot

    fake = FakeCompletions()
    monkeypatch.setattr(
        filobelo_bot, "client", SimpleNamespace(chat=SimpleNamespace(completions=fake))
    )
    return fake
