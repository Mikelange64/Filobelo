import pytest
from httpx import AsyncClient

from tests.auth_helpers import (
    add_workspace_member,
    auth_header,
    create_test_user,
    create_workspace,
    login_user,
    verify_user_in_db,
)

prefix = "/api/users"

# ========================================================================================
# ASSERTION HELPERS
# ========================================================================================


def assert_user_private_shape(response, expected_username=None, expected_email=None):
    """Assert a 200/201 response body has the UserPrivate shape."""
    data = response.json()
    assert "id" in data
    assert "image_path" in data
    assert "joined_at" in data
    assert "last_login" in data
    assert "password" not in data
    assert "password_hash" not in data
    if expected_username is not None:
        assert data["username"] == expected_username
    if expected_email is not None:
        assert data["email"] == expected_email
    return data


def assert_login_success_shape(response):
    """Assert a successful login response has a token."""
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def assert_auth_error(response, expected_message=None):
    """Assert a 401 authentication error, optionally checking the message."""
    assert response.status_code == 401
    if expected_message:
        assert expected_message in response.text


# ========================================================================================
# CREATE USER
# ========================================================================================


@pytest.mark.anyio
async def test_create_user_success(client: AsyncClient):
    response = await client.post(
        prefix,
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "testpassword",
        },
    )

    assert response.status_code == 201
    assert_user_private_shape(response, "testuser", "test@example.com")


@pytest.mark.anyio
async def test_create_user_validation_error(client: AsyncClient):
    response = await client.post(
        prefix,
        json={"username": "testuser"},
    )

    assert response.status_code == 422
    assert "email" in response.text
    assert "password" in response.text


@pytest.mark.anyio
async def test_create_user_duplicate_email(client: AsyncClient):
    await create_test_user(client)

    response = await client.post(
        prefix,
        json={
            "username": "different_user",
            "email": "test@example.com",
            "password": "testpassword",
        },
    )

    assert response.status_code == 400
    assert response.json()["message"] == "Email already registered"


@pytest.mark.anyio
async def test_create_user_duplicate_username(client: AsyncClient):
    await create_test_user(client)

    response = await client.post(
        prefix,
        json={
            "username": "testuser",
            "email": "different@example.com",
            "password": "testpassword",
        },
    )

    assert response.status_code == 400
    assert response.json()["message"] == "Username already registered"


# ========================================================================================
# LOGIN
# ========================================================================================


@pytest.mark.anyio
@pytest.mark.parametrize(
    "create_kwargs,login_username",
    [
        pytest.param({}, "test@example.com", id="by_email"),
        pytest.param({}, "testuser", id="by_username"),
        pytest.param(
            {"email": "Test@Example.com"},
            "test@example.com",
            id="case_insensitive_email",
        ),
        pytest.param(
            {"username": "TestUser"}, "testuser", id="case_insensitive_username"
        ),
    ],
)
async def test_login_success(client: AsyncClient, db_session, create_kwargs, login_username):
    await create_test_user(client, password="testpassword123", **create_kwargs)
    await verify_user_in_db(db_session, create_kwargs.get("email", "test@example.com"))

    response = await client.post(
        f"{prefix}/login",
        data={"username": login_username, "password": "testpassword123"},
    )

    assert_login_success_shape(response)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "precreate_kwargs,login_data",
    [
        pytest.param(
            {"password": "correctpassword"},
            {"username": "test@example.com", "password": "wrongpassword"},
            id="wrong_password",
        ),
        pytest.param(
            None,
            {"username": "nonexistent@example.com", "password": "somepassword"},
            id="nonexistent_email",
        ),
        pytest.param(
            None,
            {"username": "unknownuser", "password": "somepassword"},
            id="nonexistent_username",
        ),
    ],
)
async def test_login_failure_401(client: AsyncClient, precreate_kwargs, login_data):
    if precreate_kwargs is not None:
        await create_test_user(client, **precreate_kwargs)

    response = await client.post(f"{prefix}/login", data=login_data)

    assert response.status_code == 401
    assert response.json()["message"] == "Incorrect password or email/username"


@pytest.mark.anyio
@pytest.mark.parametrize(
    "login_data",
    [
        pytest.param({"username": "test@example.com"}, id="missing_password"),
        pytest.param({"password": "testpassword123"}, id="missing_username"),
    ],
)
async def test_login_validation_error(client: AsyncClient, login_data):
    response = await client.post(f"{prefix}/login", data=login_data)

    assert response.status_code == 422


# ========================================================================================
# GET CURRENT USER  (GET /me)
# ========================================================================================


@pytest.mark.anyio
async def test_get_me_success(client: AsyncClient, user_auth_headers):
    response = await client.get(f"{prefix}/me", headers=user_auth_headers)

    assert response.status_code == 200
    assert_user_private_shape(response, "testuser", "test@example.com")


@pytest.mark.anyio
async def test_get_me_no_token(client: AsyncClient):
    response = await client.get(f"{prefix}/me")

    assert_auth_error(response, "Not authenticated")


@pytest.mark.anyio
@pytest.mark.parametrize(
    "token",
    [
        pytest.param("this.is.a.bad.token", id="invalid_token"),
        pytest.param("not-even-a-jwt", id="malformed_token"),
    ],
)
async def test_get_me_bad_token(client: AsyncClient, token):
    response = await client.get(f"{prefix}/me", headers=auth_header(token))

    assert_auth_error(response, "Invalid or expired token")


# ========================================================================================
# GET USER BY ID  (GET /{user_id})
# ========================================================================================


@pytest.mark.anyio
async def test_get_user_by_id_success(client: AsyncClient):
    created = await create_test_user(client)

    response = await client.get(f"{prefix}/{created['id']}")

    assert response.status_code == 200
    data = response.json()
    assert data["username"] == created["username"]
    assert data["id"] == created["id"]
    assert "email" not in data
    assert "last_login" not in data


@pytest.mark.anyio
@pytest.mark.parametrize(
    "user_id",
    [
        pytest.param(99999, id="nonexistent"),
        pytest.param(-1, id="negative_id"),
    ],
)
async def test_get_user_by_id_not_found(client: AsyncClient, user_id):
    response = await client.get(f"{prefix}/{user_id}")

    assert response.status_code == 404
    assert response.json()["message"] == "User not found"


# ========================================================================================
# GET CURRENT USER'S WORKSPACES  (GET /me/workspaces)
# ========================================================================================


@pytest.mark.anyio
async def test_get_user_workspaces_success(client: AsyncClient, user_token, user_auth_headers):
    await create_workspace(client, user_token, title="My First Workspace")

    response = await client.get(f"{prefix}/me/workspaces", headers=user_auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["title"] == "My First Workspace"


@pytest.mark.anyio
async def test_get_user_workspaces_multiple(
    client: AsyncClient, user_token, user_auth_headers
):
    await create_workspace(client, user_token, title="Workspace One")
    await create_workspace(client, user_token, title="Workspace Two")

    response = await client.get(f"{prefix}/me/workspaces", headers=user_auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    titles = {w["title"] for w in data}
    assert "Workspace One" in titles
    assert "Workspace Two" in titles


@pytest.mark.anyio
async def test_get_user_workspaces_no_workspaces(client: AsyncClient, user_auth_headers):
    response = await client.get(f"{prefix}/me/workspaces", headers=user_auth_headers)

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.anyio
async def test_get_user_workspaces_no_auth(client: AsyncClient):
    response = await client.get(f"{prefix}/me/workspaces")

    assert_auth_error(response, "Not authenticated")


# ========================================================================================
# UPDATE CURRENT USER  (PATCH /me)
# ========================================================================================


@pytest.mark.anyio
@pytest.mark.parametrize(
    "payload,expected",
    [
        pytest.param(
            {"username": "updateduser"},
            {"username": "updateduser", "email": "test@example.com"},
            id="update_username",
        ),
        pytest.param(
            {"email": "updated@example.com"},
            {"username": "testuser", "email": "updated@example.com"},
            id="update_email",
        ),
        pytest.param(
            {
                "username": "brandnew",
                "email": "brandnew@example.com",
            },
            {
                "username": "brandnew",
                "email": "brandnew@example.com",
            },
            id="update_all_fields",
        ),
    ],
)
async def test_update_user_success(client: AsyncClient, user_auth_headers, payload, expected):
    response = await client.patch(f"{prefix}/me", json=payload, headers=user_auth_headers)

    assert response.status_code == 200
    data = response.json()
    for key, value in expected.items():
        assert data[key] == value


@pytest.mark.anyio
async def test_update_no_changes_is_noop(client: AsyncClient, user_auth_headers):
    response = await client.patch(
        f"{prefix}/me",
        json={"username": "testuser"},
        headers=user_auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert data["email"] == "test@example.com"


@pytest.mark.anyio
async def test_update_empty_body_is_noop(client: AsyncClient, user_auth_headers):
    response = await client.patch(
        f"{prefix}/me",
        json={},
        headers=user_auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert data["email"] == "test@example.com"


@pytest.mark.anyio
async def test_update_same_email_is_noop(client: AsyncClient, user_auth_headers):
    """Updating to the same email (same case) should not raise a conflict."""
    response = await client.patch(
        f"{prefix}/me",
        json={"email": "test@example.com"},
        headers=user_auth_headers,
    )

    assert response.status_code == 200


@pytest.mark.anyio
async def test_update_email_case_change_is_same_user(client: AsyncClient, db_session):
    """Changing only the case of the email should be treated as no change (no conflict)."""
    await create_test_user(client, email="test@example.com")
    await verify_user_in_db(db_session, "test@example.com")
    token = await login_user(client)

    response = await client.patch(
        f"{prefix}/me",
        json={"email": "TEST@EXAMPLE.COM"},
        headers=auth_header(token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"


@pytest.mark.anyio
@pytest.mark.parametrize(
    "field,conflict_value,expected_message",
    [
        pytest.param(
            "email",
            "user1@example.com",
            "Email already registered",
            id="duplicate_email",
        ),
        pytest.param(
            "username", "user1", "Username already registered", id="duplicate_username"
        ),
    ],
)
async def test_update_user_conflict(
    client: AsyncClient, db_session, field, conflict_value, expected_message
):
    await create_test_user(client, username="user1", email="user1@example.com")
    await create_test_user(client, username="user2", email="user2@example.com")
    await verify_user_in_db(db_session, "user2@example.com")
    token = await login_user(client, email="user2@example.com")

    response = await client.patch(
        f"{prefix}/me",
        json={field: conflict_value},
        headers=auth_header(token),
    )

    assert response.status_code == 409
    assert expected_message in response.json()["message"]


@pytest.mark.anyio
@pytest.mark.parametrize(
    "payload",
    [
        pytest.param({"username": "ab"}, id="username_too_short"),
        pytest.param({"email": "not-an-email"}, id="invalid_email_format"),
    ],
)
async def test_update_user_validation_error(client: AsyncClient, user_auth_headers, payload):
    response = await client.patch(f"{prefix}/me", json=payload, headers=user_auth_headers)

    assert response.status_code == 422


@pytest.mark.anyio
async def test_update_user_no_auth(client: AsyncClient):
    response = await client.patch(f"{prefix}/me", json={"username": "hacker"})

    assert_auth_error(response, "Not authenticated")


# ========================================================================================
# DELETE CURRENT USER  (DELETE /me)
# ========================================================================================


@pytest.mark.anyio
async def test_delete_user_success(client: AsyncClient, user_auth_headers):
    response = await client.delete(f"{prefix}/me", headers=user_auth_headers)

    assert response.status_code == 204


@pytest.mark.anyio
async def test_delete_user_removes_user(client: AsyncClient, user, user_auth_headers):
    await client.delete(f"{prefix}/me", headers=user_auth_headers)

    # Verify the user is actually gone
    response = await client.get(f"{prefix}/{user['id']}")
    assert response.status_code == 404


@pytest.mark.anyio
async def test_delete_user_removes_workspace_if_last_member(
    client: AsyncClient, db_session, user_auth_headers, workspace
):
    """Deleting the sole member of a workspace deletes the workspace too -
    nobody's left to hand it off to."""
    from app.models import Workspace as WorkspaceModel

    response = await client.delete(f"{prefix}/me", headers=user_auth_headers)
    assert response.status_code == 204
    assert await db_session.get(WorkspaceModel, workspace["id"]) is None


@pytest.mark.anyio
async def test_delete_user_leaves_workspace_intact_for_other_members(
    client: AsyncClient, user_token, user_auth_headers, workspace, second_user, second_user_token
):
    """If other members remain, the workspace and its data survive - the user just leaves."""
    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])

    response = await client.delete(f"{prefix}/me", headers=user_auth_headers)
    assert response.status_code == 204

    response = await client.get(
        f"/api/workspaces/{workspace['id']}", headers=auth_header(second_user_token)
    )
    assert response.status_code == 200


@pytest.mark.anyio
async def test_delete_user_promotes_oldest_remaining_member_when_last_admin_leaves(
    client: AsyncClient, user_token, user_auth_headers, workspace, second_user, second_user_token
):
    """The last admin deleting their account should hand off to the longest-tenured
    remaining member rather than leave the workspace with no admin."""
    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])

    response = await client.delete(f"{prefix}/me", headers=user_auth_headers)
    assert response.status_code == 204

    response = await client.get(
        f"/api/workspaces/{workspace['id']}/members", headers=auth_header(second_user_token)
    )
    assert response.status_code == 200
    member = next(m for m in response.json() if m["id"] == second_user["id"])
    assert member["role"] == "admin"


@pytest.mark.anyio
async def test_delete_user_does_not_reassign_when_other_admin_remains(
    client: AsyncClient, user_token, user_auth_headers, workspace, second_user, second_user_token
):
    """If another admin already exists, a departing admin shouldn't trigger any reassignment."""
    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    await client.patch(
        f"/api/workspaces/{workspace['id']}/members/{second_user['id']}/admin",
        headers=user_auth_headers,
    )

    response = await client.delete(f"{prefix}/me", headers=user_auth_headers)
    assert response.status_code == 204

    response = await client.get(
        f"/api/workspaces/{workspace['id']}/members", headers=auth_header(second_user_token)
    )
    member = next(m for m in response.json() if m["id"] == second_user["id"])
    assert member["role"] == "admin"  # unaffected, was already promoted


@pytest.mark.anyio
async def test_delete_user_no_auth(client: AsyncClient):
    response = await client.delete(f"{prefix}/me")

    assert_auth_error(response, "Not authenticated")


@pytest.mark.anyio
@pytest.mark.parametrize(
    "token",
    [
        pytest.param("some.fake.token", id="invalid_token"),
        pytest.param("not-even-a-jwt", id="malformed_token"),
    ],
)
async def test_delete_user_bad_token(client: AsyncClient, token):
    response = await client.delete(f"{prefix}/me", headers=auth_header(token))

    assert_auth_error(response, "Invalid or expired token")
