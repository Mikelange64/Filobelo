import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ["DATABASE_URL"] = (
    "postgresql+psycopg://mikelange64@localhost/test_workspaceapp"
)
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"

from app.database import Base, get_db
from app.main import app
from tests.auth_helpers import (
    auth_header,
    create_test_user,
    create_workspace,
    login_user,
)


@pytest.fixture(scope="session")
def test_engine():
    engine = create_engine(os.environ["DATABASE_URL"])
    return engine


@pytest.fixture(scope="session")
def setup_database(test_engine):
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


@pytest.fixture
def db_session(setup_database, test_engine):
    connection = test_engine.connect()
    transaction = connection.begin()

    session_factory = sessionmaker(bind=connection)
    session = session_factory()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


# ========================================================================================
# SHARED FIXTURES
# ========================================================================================


@pytest.fixture
def user(client):
    """Create and return a default test user."""
    return create_test_user(client)


@pytest.fixture
def user_token(client, user):
    """Return a valid auth token for the default user."""
    return login_user(client)


@pytest.fixture
def user_auth_headers(user_token):
    """Return Authorization headers for the default user."""
    return auth_header(user_token)


@pytest.fixture
def workspace(client, user_token):
    """Create and return a workspace owned by the default user."""
    return create_workspace(client, user_token)


@pytest.fixture
def second_user(client):
    """Create and return a second user with different credentials."""
    return create_test_user(client, username="user2", email="user2@example.com")


@pytest.fixture
def second_user_token(client, second_user):
    """Return a valid auth token for the second user."""
    return login_user(client, email="user2@example.com")
