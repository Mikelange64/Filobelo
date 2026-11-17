import pytest
from httpx import AsyncClient

from tests.auth_helpers import (
    add_workspace_member,
    auth_header,
    create_task,
    create_workspace,
)


def comments_path(workspace_id: int, task_id: int, suffix: str = "") -> str:
    return f"/api/workspaces/{workspace_id}/tasks/{task_id}/comments{suffix}"


@pytest.fixture
async def task(client, user_token, workspace):
    return await create_task(client, user_token, workspace["id"])


async def leave_comment(
    client: AsyncClient, token: str, workspace_id: int, task_id: int, content: str = "Looks good"
) -> dict:
    response = await client.post(
        comments_path(workspace_id, task_id),
        json={"content": content},
        headers=auth_header(token),
    )
    assert response.status_code == 201, f"Failed to leave comment: {response.text}"
    return response.json()


@pytest.mark.anyio
async def test_leave_comment_records_author(client, user, user_token, workspace, task):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"], "First!")
    assert comment["content"] == "First!"
    assert comment["task_id"] == task["id"]
    assert comment["author_id"] == user["id"]
    assert comment["left_at"]


@pytest.mark.anyio
@pytest.mark.parametrize("content", ["", "x" * 2001])
async def test_leave_comment_rejects_bad_content(client, user_token, workspace, task, content):
    response = await client.post(
        comments_path(workspace["id"], task["id"]),
        json={"content": content},
        headers=auth_header(user_token),
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_list_comments_oldest_first(client, user_token, workspace, task):
    await leave_comment(client, user_token, workspace["id"], task["id"], "one")
    await leave_comment(client, user_token, workspace["id"], task["id"], "two")
    response = await client.get(
        comments_path(workspace["id"], task["id"]), headers=auth_header(user_token)
    )
    assert response.status_code == 200
    assert [c["content"] for c in response.json()] == ["one", "two"]


@pytest.mark.anyio
async def test_comments_are_per_task(client, user_token, workspace, task):
    other_task = await create_task(client, user_token, workspace["id"], title="Other")
    await leave_comment(client, user_token, workspace["id"], task["id"])
    response = await client.get(
        comments_path(workspace["id"], other_task["id"]), headers=auth_header(user_token)
    )
    assert response.json() == []


@pytest.mark.anyio
async def test_comments_require_authentication(client, workspace, task):
    response = await client.get(comments_path(workspace["id"], task["id"]))
    assert response.status_code == 401


@pytest.mark.anyio
async def test_non_member_cannot_comment_or_list(
    client, workspace, task, second_user_token
):
    post = await client.post(
        comments_path(workspace["id"], task["id"]),
        json={"content": "hi"},
        headers=auth_header(second_user_token),
    )
    get = await client.get(
        comments_path(workspace["id"], task["id"]), headers=auth_header(second_user_token)
    )
    assert post.status_code == 403
    assert get.status_code == 403


@pytest.mark.anyio
async def test_comments_not_reachable_through_another_workspace(
    client, user_token, workspace, task, second_user_token
):
    """A member of workspace B must not reach workspace A's task by id."""
    await leave_comment(client, user_token, workspace["id"], task["id"])
    other_ws = await create_workspace(client, second_user_token, title="Other WS")

    get = await client.get(
        comments_path(other_ws["id"], task["id"]), headers=auth_header(second_user_token)
    )
    post = await client.post(
        comments_path(other_ws["id"], task["id"]),
        json={"content": "sneaky"},
        headers=auth_header(second_user_token),
    )
    assert get.status_code == 404
    assert post.status_code == 404


@pytest.mark.anyio
async def test_author_can_delete_own_comment(client, user_token, workspace, task):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    response = await client.delete(
        comments_path(workspace["id"], task["id"], f"/{comment['id']}"),
        headers=auth_header(user_token),
    )
    assert response.status_code == 204
    listing = await client.get(
        comments_path(workspace["id"], task["id"]), headers=auth_header(user_token)
    )
    assert listing.json() == []


@pytest.mark.anyio
async def test_member_cannot_delete_someone_elses_comment(
    client, user_token, workspace, task, second_user, second_user_token
):
    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    response = await client.delete(
        comments_path(workspace["id"], task["id"], f"/{comment['id']}"),
        headers=auth_header(second_user_token),
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_admin_can_delete_members_comment(
    client, user_token, workspace, task, second_user, second_user_token
):
    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    comment = await leave_comment(client, second_user_token, workspace["id"], task["id"])
    response = await client.delete(
        comments_path(workspace["id"], task["id"], f"/{comment['id']}"),
        headers=auth_header(user_token),  # workspace creator is admin
    )
    assert response.status_code == 204


@pytest.mark.anyio
async def test_delete_missing_comment_404(client, user_token, workspace, task):
    response = await client.delete(
        comments_path(workspace["id"], task["id"], "/9999"), headers=auth_header(user_token)
    )
    assert response.status_code == 404


@pytest.mark.anyio
async def test_deleting_task_deletes_its_comments(client, user_token, workspace, task):
    await leave_comment(client, user_token, workspace["id"], task["id"])
    response = await client.delete(
        f"/api/workspaces/{workspace['id']}/tasks/{task['id']}",
        headers=auth_header(user_token),
    )
    assert response.status_code == 204


@pytest.mark.anyio
async def test_author_can_edit_comment_and_it_is_marked_edited(
    client, user_token, workspace, task
):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"], "typo")
    assert comment["edited_at"] is None
    response = await client.patch(
        comments_path(workspace["id"], task["id"], f"/{comment['id']}"),
        json={"content": "fixed"},
        headers=auth_header(user_token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["content"] == "fixed"
    assert body["edited_at"] is not None
    assert body["left_at"] == comment["left_at"]


@pytest.mark.anyio
async def test_admin_cannot_edit_members_comment(
    client, user_token, workspace, task, second_user, second_user_token
):
    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    comment = await leave_comment(client, second_user_token, workspace["id"], task["id"], "mine")
    response = await client.patch(
        comments_path(workspace["id"], task["id"], f"/{comment['id']}"),
        json={"content": "rewritten"},
        headers=auth_header(user_token),  # workspace creator is admin
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_edit_rejects_empty_and_missing(client, user_token, workspace, task):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    empty = await client.patch(
        comments_path(workspace["id"], task["id"], f"/{comment['id']}"),
        json={"content": ""},
        headers=auth_header(user_token),
    )
    missing = await client.patch(
        comments_path(workspace["id"], task["id"], "/9999"),
        json={"content": "x"},
        headers=auth_header(user_token),
    )
    assert empty.status_code == 422
    assert missing.status_code == 404


@pytest.mark.anyio
async def test_edit_not_reachable_through_another_workspace(
    client, user_token, workspace, task, second_user_token
):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    other_ws = await create_workspace(client, second_user_token, title="Other WS")
    response = await client.patch(
        comments_path(other_ws["id"], task["id"], f"/{comment['id']}"),
        json={"content": "sneaky"},
        headers=auth_header(second_user_token),
    )
    assert response.status_code == 404
