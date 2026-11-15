from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def create_test_user(
    client: AsyncClient,
    username: str = "testuser",
    email: str = "test@example.com",
    password: str = "testpassword123",
) -> dict:
    response = await client.post(
        "/api/users", json={"username": username, "email": email, "password": password}
    )
    assert response.status_code == 201, f"Failed to create user: {response.text}"
    return response.json()


async def create_superuser(
    client: AsyncClient,
    username: str = "superuser",
    email: str = "super@example.com",
    password: str = "superpassword123",
) -> dict:
    response = await client.post(
        "/api/users", json={"username": username, "email": email, "password": password}
    )
    assert response.status_code == 201, f"Failed to create superuser: {response.text}"
    return response.json()


async def create_workspace(
    client: AsyncClient,
    token: str,
    title: str = "Test Workspace",
    description: str = "A workspace for testing.",
    max_number: int | None = None,
) -> dict:
    body = {
        "title": title,
        "description": description,
    }
    if max_number is not None:
        body["max_number"] = max_number

    response = await client.post(
        "/api/workspaces",
        json=body,
        headers=auth_header(token),
    )
    assert response.status_code == 201, f"Failed to create workspace: {response.text}"
    return response.json()


async def add_workspace_member(
    client: AsyncClient,
    token: str,
    workspace_id: int,
    user_id: int,
) -> dict:
    response = await client.patch(
        f"/api/workspaces/{workspace_id}/members/{user_id}",
        headers=auth_header(token),
    )
    assert response.status_code == 200, f"Failed to add member: {response.text}"
    return response.json()


async def login_user(
    client: AsyncClient,
    email: str = "test@example.com",
    password: str = "testpassword123",
) -> str:
    response = await client.post(
        "/api/users/login", data={"username": email, "password": password}
    )
    assert response.status_code == 200, f"Failed to login: {response.text}"
    return response.json()["access_token"]


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def verify_user_in_db(db_session: AsyncSession, email: str) -> None:
    """Mark a test user as email-verified so they can log in (bypasses email flow in tests)."""
    from app.models import User as UserModel
    result = await db_session.execute(
        select(UserModel).where(func.lower(UserModel.email) == email.lower())
    )
    user = result.scalar_one()
    user.is_verified = True
    await db_session.flush()


async def create_folder(
    client: AsyncClient,
    token: str,
    name: str = "Test Folder",
    color: str = "#3B82F6",
) -> dict:
    response = await client.post(
        "/api/folders",
        json={"name": name, "color": color},
        headers=auth_header(token),
    )
    assert response.status_code == 201, f"Failed to create folder: {response.text}"
    return response.json()


async def create_task(
    client: AsyncClient,
    token: str,
    workspace_id: int,
    title: str = "Test Task",
    content: str = "Test task content.",
    due_date: str | None = None,
) -> dict:
    body = {
        "title": title,
        "content": content,
        "creator_id": 1,  # ignored by endpoint, overridden from auth
        # owner_id omitted - tasks are unassigned by default unless requested
        "workspace_id": workspace_id,
    }
    if due_date is not None:
        body["due_date"] = due_date

    response = await client.post(
        f"/api/workspaces/{workspace_id}/tasks/",
        json=body,
        headers=auth_header(token),
    )
    assert response.status_code == 201, f"Failed to create task: {response.text}"
    return response.json()
