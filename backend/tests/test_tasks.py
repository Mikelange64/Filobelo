import pytest
from httpx import AsyncClient

from tests.auth_helpers import (
    add_workspace_member,
    auth_header,
    create_task,
    create_test_user,
    create_workspace,
    login_user,
    verify_user_in_db,
)

taskprefix = "/api/workspaces"


# ========================================================================================
# ASSERTION HELPERS
# ========================================================================================


def assert_task_created(response, expected_title, expected_content):
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == expected_title
    assert data["content"] == expected_content
    assert data["status"] == "TODO"
    assert "id" in data
    assert "date_created" in data


def assert_updated_task(response, expected_checks):
    assert response.status_code == 200
    for key, value in expected_checks.items():
        assert response.json()[key] == value
    return response.json()


def assert_forbidden(response):
    assert response.status_code == 403


def assert_unauthorized(response):
    assert response.status_code == 401


# ========================================================================================
# FILE-SCOPED FIXTURES
# ========================================================================================


@pytest.fixture
async def task(client, user_token, workspace):
    """Create and return a task owned by the default user in their workspace."""
    return await create_task(client, user_token, workspace["id"])


# ========================================================================================
# CREATE TASK
# ========================================================================================


@pytest.mark.anyio
async def test_create_task_as_admin_success(client: AsyncClient, user_auth_headers, workspace):
    response = await client.post(
        f"{taskprefix}/{workspace['id']}/tasks/",
        json={
            "title": "My Task",
            "content": "Task content here.",
            "creator_id": 1,
            "workspace_id": workspace["id"],
        },
        headers=user_auth_headers,
    )
    assert_task_created(response, "My Task", "Task content here.")
    assert response.json()["workspace_id"] == workspace["id"]
    assert response.json()["creator_id"] is not None


@pytest.mark.anyio
async def test_create_task_as_regular_member_success(
    client: AsyncClient, user_token, user_auth_headers, workspace, second_user
):
    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    member_token = await login_user(client, email="user2@example.com")
    response = await client.post(
        f"{taskprefix}/{workspace['id']}/tasks/",
        json={
            "title": "Member Task",
            "content": "Created by a regular member.",
            "creator_id": 1,
            "workspace_id": workspace["id"],
        },
        headers=auth_header(member_token),
    )
    assert response.status_code == 201
    assert response.json()["creator_id"] == second_user["id"]
    # owner_id is omitted from the request - tasks default to their creator
    # unless a different assignee is explicitly chosen at creation.
    assert response.json()["owner_id"] == second_user["id"]


@pytest.mark.anyio
@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(
            {"content": "No title here.", "creator_id": 1, "owner_id": 1},
            id="missing_title",
        ),
    ],
)
async def test_create_task_validation_error(
    client: AsyncClient, user_token, workspace, payload
):
    payload["workspace_id"] = workspace["id"]
    response = await client.post(
        f"{taskprefix}/{workspace['id']}/tasks/",
        json=payload,
        headers=auth_header(user_token),
    )
    assert response.status_code == 422


@pytest.mark.anyio
@pytest.mark.parametrize(
    "token,expected_status",
    [
        pytest.param("outsider", 403, id="non_member"),
        pytest.param(None, 401, id="no_auth"),
    ],
)
async def test_create_task_auth_failures(
    client: AsyncClient, db_session, user_token, workspace, token, expected_status
):
    headers = None
    if token == "outsider":
        await create_test_user(client, username="outsider", email="outsider@example.com")
        await verify_user_in_db(db_session, "outsider@example.com")
        token = await login_user(client, email="outsider@example.com")
        headers = auth_header(token)
    kwargs = {"headers": headers} if headers else {}
    response = await client.post(
        f"{taskprefix}/{workspace['id']}/tasks/",
        json={
            "title": "Hacker",
            "content": "Hack.",
            "creator_id": 1,
            "owner_id": 1,
            "workspace_id": workspace["id"],
        },
        **kwargs,
    )
    assert response.status_code == expected_status


@pytest.mark.anyio
async def test_create_task_nonexistent_workspace(client: AsyncClient, user_auth_headers):
    response = await client.post(
        f"{taskprefix}/99999/tasks/",
        json={
            "title": "Ghost",
            "content": "Ghost.",
            "creator_id": 1,
            "owner_id": 1,
            "workspace_id": 99999,
        },
        headers=user_auth_headers,
    )
    assert_forbidden(response)


# ========================================================================================
# GET TASKS (LIST)
# ========================================================================================


@pytest.mark.anyio
async def test_get_tasks_empty(client: AsyncClient, user_auth_headers, workspace):
    response = await client.get(
        f"{taskprefix}/{workspace['id']}/tasks/", headers=user_auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["tasks"] == []
    assert data["total"] == 0
    assert data["has_more"] is False


@pytest.mark.anyio
async def test_get_tasks_multiple(
    client: AsyncClient, user_token, user_auth_headers, workspace
):
    await create_task(client, user_token, workspace["id"], title="Task One")
    await create_task(client, user_token, workspace["id"], title="Task Two")
    response = await client.get(
        f"{taskprefix}/{workspace['id']}/tasks/", headers=user_auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["tasks"]) == 2
    assert {t["title"] for t in data["tasks"]} == {"Task One", "Task Two"}


@pytest.mark.anyio
@pytest.mark.parametrize(
    "token,expected_status",
    [
        pytest.param("outsider", 403, id="non_member"),
        pytest.param(None, 401, id="no_auth"),
    ],
)
async def test_get_tasks_auth_failures(client: AsyncClient, db_session, workspace, token, expected_status):
    headers = None
    if token == "outsider":
        await create_test_user(client, username="outsider", email="outsider@example.com")
        await verify_user_in_db(db_session, "outsider@example.com")
        token = await login_user(client, email="outsider@example.com")
        headers = auth_header(token)
    kwargs = {"headers": headers} if headers else {}
    response = await client.get(f"{taskprefix}/{workspace['id']}/tasks/", **kwargs)
    assert response.status_code == expected_status


@pytest.mark.anyio
async def test_get_tasks_nonexistent_workspace(client: AsyncClient, user_auth_headers):
    response = await client.get(f"{taskprefix}/99999/tasks/", headers=user_auth_headers)
    assert_forbidden(response)


# ========================================================================================
# GET SINGLE TASK
# ========================================================================================


@pytest.mark.anyio
async def test_get_task_success(client: AsyncClient, user_auth_headers, task):
    response = await client.get(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}",
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["id"] == task["id"]


@pytest.mark.anyio
async def test_get_task_nonexistent(client: AsyncClient, user_auth_headers, workspace):
    response = await client.get(
        f"{taskprefix}/{workspace['id']}/tasks/99999", headers=user_auth_headers
    )
    assert response.status_code == 404


@pytest.mark.anyio
@pytest.mark.parametrize(
    "token,expected_status",
    [
        pytest.param("outsider", 403, id="non_member"),
        pytest.param(None, 401, id="no_auth"),
    ],
)
async def test_get_task_auth_failures(client: AsyncClient, db_session, task, token, expected_status):
    headers = None
    if token == "outsider":
        await create_test_user(client, username="outsider", email="outsider@example.com")
        await verify_user_in_db(db_session, "outsider@example.com")
        token = await login_user(client, email="outsider@example.com")
        headers = auth_header(token)
    kwargs = {"headers": headers} if headers else {}
    response = await client.get(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}", **kwargs
    )
    assert response.status_code == expected_status


# ========================================================================================
# UPDATE TASK PARTIAL  (PATCH)
# ========================================================================================


@pytest.mark.anyio
@pytest.mark.parametrize(
    "payload,expected",
    [
        pytest.param(
            {"title": "Updated Title"}, {"title": "Updated Title"}, id="update_title"
        ),
        pytest.param(
            {"content": "Updated content."},
            {"content": "Updated content."},
            id="update_content",
        ),
        pytest.param(
            {"title": "Completely New", "content": "Completely new content."},
            {"title": "Completely New", "content": "Completely new content."},
            id="update_all_fields",
        ),
    ],
)
async def test_update_task_success(
    client: AsyncClient, user_auth_headers, task, payload, expected
):
    response = await client.patch(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}/",
        json=payload,
        headers=user_auth_headers,
    )
    assert_updated_task(response, expected)


@pytest.mark.anyio
async def test_update_task_empty_body_noop(client: AsyncClient, user_auth_headers, task):
    response = await client.patch(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}/",
        json={},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == task["title"]


@pytest.mark.anyio
async def test_update_task_nonexistent(client: AsyncClient, user_auth_headers, workspace):
    response = await client.patch(
        f"{taskprefix}/{workspace['id']}/tasks/99999/",
        json={"title": "Ghost"},
        headers=user_auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.anyio
@pytest.mark.parametrize(
    "token,expected_status",
    [
        pytest.param("outsider", 403, id="non_member"),
        pytest.param(None, 401, id="no_auth"),
    ],
)
async def test_update_task_auth_failures(client: AsyncClient, db_session, task, token, expected_status):
    headers = None
    if token == "outsider":
        await create_test_user(client, username="outsider", email="outsider@example.com")
        await verify_user_in_db(db_session, "outsider@example.com")
        token = await login_user(client, email="outsider@example.com")
        headers = auth_header(token)
    kwargs = {"headers": headers} if headers else {}
    response = await client.patch(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}/",
        json={"title": "Hacked!"},
        **kwargs,
    )
    assert response.status_code == expected_status


@pytest.mark.anyio
async def test_update_task_validation_error(client: AsyncClient, user_auth_headers, task):
    response = await client.patch(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}/",
        json={"content": ""},
        headers=user_auth_headers,
    )
    assert response.status_code == 422


# ========================================================================================
# UPDATE TASK FULL  (PUT)
# ========================================================================================


@pytest.mark.anyio
async def test_full_update_task_as_owner_success(
    client: AsyncClient, user, user_auth_headers, task
):
    response = await client.put(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}",
        json={
            "title": "Full Update",
            "content": "Fully updated.",
            "creator_id": user["id"],
            "owner_id": user["id"],
            "workspace_id": task["workspace_id"],
        },
        headers=user_auth_headers,
    )
    assert_updated_task(response, {"title": "Full Update", "content": "Fully updated."})


@pytest.mark.anyio
async def test_full_update_task_as_owner_all_fields(
    client: AsyncClient, user, user_auth_headers, task
):
    response = await client.put(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}",
        json={
            "title": "Complete",
            "content": "Complete.",
            "creator_id": user["id"],
            "owner_id": user["id"],
            "workspace_id": task["workspace_id"],
            "due_date": None,
        },
        headers=user_auth_headers,
    )
    assert response.status_code == 200


@pytest.mark.anyio
async def test_full_update_task_non_owner_member(
    client: AsyncClient, db_session, user_token, user_auth_headers, task
):
    other_user = await create_test_user(client, username="other", email="other@example.com")
    await add_workspace_member(client, user_token, task["workspace_id"], other_user["id"])
    await verify_user_in_db(db_session, "other@example.com")
    other_token = await login_user(client, email="other@example.com")
    response = await client.put(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}",
        json={
            "title": "Nope",
            "content": "Nope.",
            "creator_id": 1,
            "owner_id": 1,
            "workspace_id": task["workspace_id"],
        },
        headers=auth_header(other_token),
    )
    assert response.status_code == 401
    assert "not authorized" in response.json()["message"].lower()


@pytest.mark.anyio
@pytest.mark.parametrize(
    "token,expected_status",
    [
        pytest.param("outsider", 403, id="non_member"),
        pytest.param(None, 401, id="no_auth"),
    ],
)
async def test_full_update_task_auth_failures(
    client: AsyncClient, db_session, task, token, expected_status
):
    headers = None
    if token == "outsider":
        await create_test_user(client, username="outsider", email="outsider@example.com")
        await verify_user_in_db(db_session, "outsider@example.com")
        token = await login_user(client, email="outsider@example.com")
        headers = auth_header(token)
    kwargs = {"headers": headers} if headers else {}
    response = await client.put(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}",
        json={
            "title": "Hack",
            "content": "Hack.",
            "creator_id": 1,
            "owner_id": 1,
            "workspace_id": task["workspace_id"],
        },
        **kwargs,
    )
    assert response.status_code == expected_status


@pytest.mark.anyio
async def test_full_update_task_missing_fields(client: AsyncClient, user_auth_headers, task):
    response = await client.put(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}",
        json={"title": "Missing Content"},
        headers=user_auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_full_update_task_nonexistent(client: AsyncClient, user_auth_headers, workspace):
    response = await client.put(
        f"{taskprefix}/{workspace['id']}/tasks/99999",
        json={
            "title": "Ghost",
            "content": "Ghost.",
            "creator_id": 1,
            "owner_id": 1,
            "workspace_id": workspace["id"],
        },
        headers=user_auth_headers,
    )
    assert response.status_code == 404


# ========================================================================================
# DELETE TASK
# ========================================================================================


@pytest.mark.anyio
async def test_delete_task_as_admin_success(client: AsyncClient, user_auth_headers, task):
    response = await client.delete(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}",
        headers=user_auth_headers,
    )
    assert response.status_code == 204


@pytest.mark.anyio
async def test_delete_task_removes_task(client: AsyncClient, user_auth_headers, task):
    await client.delete(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}",
        headers=user_auth_headers,
    )
    response = await client.get(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}",
        headers=user_auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.anyio
async def test_delete_task_as_non_admin_member(
    client: AsyncClient, user_token, user_auth_headers, task, second_user
):
    await add_workspace_member(client, user_token, task["workspace_id"], second_user["id"])
    member_token = await login_user(client, email="user2@example.com")
    response = await client.delete(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}",
        headers=auth_header(member_token),
    )
    assert_forbidden(response)


@pytest.mark.anyio
async def test_delete_task_as_owner_non_admin(
    client: AsyncClient, user_token, workspace, second_user
):
    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    member_token = await login_user(client, email="user2@example.com")
    own_task = await create_task(client, member_token, workspace["id"])
    response = await client.delete(
        f"{taskprefix}/{workspace['id']}/tasks/{own_task['id']}",
        headers=auth_header(member_token),
    )
    assert response.status_code == 204


@pytest.mark.anyio
@pytest.mark.parametrize(
    "token,expected_status",
    [
        pytest.param("outsider", 403, id="non_member"),
        pytest.param(None, 401, id="no_auth"),
    ],
)
async def test_delete_task_auth_failures(client: AsyncClient, db_session, task, token, expected_status):
    headers = None
    if token == "outsider":
        await create_test_user(client, username="outsider", email="outsider@example.com")
        await verify_user_in_db(db_session, "outsider@example.com")
        token = await login_user(client, email="outsider@example.com")
        headers = auth_header(token)
    kwargs = {"headers": headers} if headers else {}
    response = await client.delete(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}", **kwargs
    )
    assert response.status_code == expected_status


@pytest.mark.anyio
async def test_delete_task_nonexistent(client: AsyncClient, user_auth_headers, workspace):
    response = await client.delete(
        f"{taskprefix}/{workspace['id']}/tasks/99999", headers=user_auth_headers
    )
    assert response.status_code == 404


# ========================================================================================
# UPDATE TASK STATUS
# ========================================================================================


@pytest.mark.anyio
async def test_update_task_status_as_owner_success(client: AsyncClient, user_auth_headers, task):
    response = await client.patch(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}/status",
        json={"status": "DONE"},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "DONE"


@pytest.mark.anyio
async def test_update_task_status_as_admin_success(
    client: AsyncClient, db_session, user_token, user_auth_headers, workspace
):
    """Admin (non-owner) can also change task status."""
    other_user = await create_test_user(client, username="other", email="other@example.com")
    await add_workspace_member(client, user_token, workspace["id"], other_user["id"])
    await verify_user_in_db(db_session, "other@example.com")
    other_token = await login_user(client, email="other@example.com")
    task = await create_task(client, other_token, workspace["id"])
    response = await client.patch(
        f"{taskprefix}/{workspace['id']}/tasks/{task['id']}/status",
        json={"status": "DONE"},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "DONE"


@pytest.mark.anyio
async def test_update_task_status_any_member_allowed(
    client: AsyncClient, db_session, user_token, user_auth_headers, task
):
    other_user = await create_test_user(client, username="other", email="other@example.com")
    await add_workspace_member(client, user_token, task["workspace_id"], other_user["id"])
    await verify_user_in_db(db_session, "other@example.com")
    other_token = await login_user(client, email="other@example.com")
    response = await client.patch(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}/status",
        json={"status": "IN_PROGRESS"},
        headers=auth_header(other_token),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "IN_PROGRESS"


@pytest.mark.anyio
async def test_update_task_status_nonexistent(client: AsyncClient, user_auth_headers, workspace):
    response = await client.patch(
        f"{taskprefix}/{workspace['id']}/tasks/99999/status",
        json={"status": "DONE"},
        headers=user_auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.anyio
@pytest.mark.parametrize(
    "token,expected_status",
    [
        pytest.param("outsider", 403, id="non_member"),
        pytest.param(None, 401, id="no_auth"),
    ],
)
async def test_update_task_status_auth_failures(client: AsyncClient, db_session, task, token, expected_status):
    headers = None
    if token == "outsider":
        await create_test_user(client, username="outsider", email="outsider@example.com")
        await verify_user_in_db(db_session, "outsider@example.com")
        token = await login_user(client, email="outsider@example.com")
        headers = auth_header(token)
    kwargs = {"headers": headers} if headers else {}
    response = await client.patch(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}/status",
        json={"status": "DONE"},
        **kwargs,
    )
    assert response.status_code == expected_status


# ========================================================================================
# CHANGE TASK OWNER
# ========================================================================================


@pytest.mark.anyio
async def test_make_owner_success(
    client: AsyncClient, user_token, user_auth_headers, task, second_user
):
    await add_workspace_member(client, user_token, task["workspace_id"], second_user["id"])
    response = await client.patch(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}/owner",
        params={"user_id": second_user["id"]},
        headers=user_auth_headers,
    )
    assert response.status_code == 200


@pytest.mark.anyio
async def test_make_owner_self(client: AsyncClient, user, user_auth_headers, task):
    response = await client.patch(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}/owner",
        params={"user_id": user["id"]},
        headers=user_auth_headers,
    )
    assert response.status_code == 200


@pytest.mark.anyio
async def test_make_owner_target_not_member(client: AsyncClient, user_auth_headers, task):
    stranger = await create_test_user(
        client, username="stranger", email="stranger@example.com"
    )
    response = await client.patch(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}/owner",
        params={"user_id": stranger["id"]},
        headers=user_auth_headers,
    )
    assert_forbidden(response)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "token,expected_status",
    [
        pytest.param("regular", 403, id="non_admin"),
        pytest.param(None, 401, id="no_auth"),
    ],
)
async def test_make_owner_auth_failures(
    client: AsyncClient,
    db_session,
    user_token,
    user_auth_headers,
    task,
    second_user,
    token,
    expected_status,
):
    await add_workspace_member(client, user_token, task["workspace_id"], second_user["id"])
    headers = None
    if token == "regular":
        regular_user = await create_test_user(
            client, username="regular", email="regular@example.com"
        )
        await add_workspace_member(
            client, user_token, task["workspace_id"], regular_user["id"]
        )
        await verify_user_in_db(db_session, "regular@example.com")
        regular_token = await login_user(client, email="regular@example.com")
        headers = auth_header(regular_token)
    kwargs = {"headers": headers} if headers else {}
    response = await client.patch(
        f"{taskprefix}/{task['workspace_id']}/tasks/{task['id']}/owner",
        params={"user_id": second_user["id"]},
        **kwargs,
    )
    assert response.status_code == expected_status


@pytest.mark.anyio
async def test_make_owner_nonexistent_task(
    client: AsyncClient, user_token, second_user, user_auth_headers, workspace
):
    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    response = await client.patch(
        f"{taskprefix}/{workspace['id']}/tasks/99999/owner",
        params={"user_id": second_user["id"]},
        headers=user_auth_headers,
    )
    assert response.status_code == 404


# ========================================================================================


# ========================================================================================
# CROSS-WORKSPACE ISOLATION
# ========================================================================================
# The attacker is a legitimate member of their OWN workspace and puts that
# workspace's id in the URL (so require_membership passes) alongside a task
# id belonging to someone else's workspace.


@pytest.mark.anyio
@pytest.mark.parametrize(
    "method, suffix, body",
    [
        pytest.param("get", "", None, id="get"),
        pytest.param("patch", "/", {"title": "hijacked"}, id="patch"),
        pytest.param(
            "put",
            "",
            {"title": "hijacked", "content": "x", "color": "#000000", "status": "DONE"},
            id="put",
        ),
        pytest.param("patch", "/status", {"status": "DONE"}, id="status"),
        pytest.param("delete", "", None, id="delete"),
    ],
)
async def test_task_not_reachable_through_another_workspace(
    client, user_token, workspace, second_user_token, method, suffix, body
):
    victim_task = await create_task(client, user_token, workspace["id"])
    attacker_ws = await create_workspace(client, second_user_token, title="Attacker WS")

    response = await client.request(
        method,
        f"/api/workspaces/{attacker_ws['id']}/tasks/{victim_task['id']}{suffix}",
        json=body,
        headers=auth_header(second_user_token),
    )
    assert response.status_code == 404

    # and the task is untouched
    check = await client.get(
        f"/api/workspaces/{workspace['id']}/tasks/{victim_task['id']}",
        headers=auth_header(user_token),
    )
    assert check.status_code == 200
    assert check.json()["title"] == victim_task["title"]
    assert check.json()["status"] == victim_task["status"]


@pytest.mark.anyio
async def test_task_reassign_not_reachable_through_another_workspace(
    client, user_token, workspace, second_user, second_user_token
):
    victim_task = await create_task(client, user_token, workspace["id"])
    attacker_ws = await create_workspace(client, second_user_token, title="Attacker WS")

    response = await client.patch(
        f"/api/workspaces/{attacker_ws['id']}/tasks/{victim_task['id']}/owner"
        f"?user_id={second_user['id']}",
        headers=auth_header(second_user_token),
    )
    assert response.status_code == 404
