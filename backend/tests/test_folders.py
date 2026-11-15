import pytest
from httpx import AsyncClient

from tests.auth_helpers import auth_header, create_folder, create_test_user, login_user

folderprefix = "/api/folders"


# ========================================================================================
# FIXTURES
# ========================================================================================


@pytest.fixture
async def folder(client, user_token):
    """Create and return a folder owned by the default user."""
    return await create_folder(client, user_token)


# ========================================================================================
# ASSERTION HELPERS
# ========================================================================================


def assert_folder(response, expected_name, expected_color):
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == expected_name
    assert data["color"] == expected_color
    assert "id" in data
    assert "owner_id" in data
    assert "created_at" in data


# ========================================================================================
# CREATE  (POST /api/folders)
# ========================================================================================


@pytest.mark.anyio
async def test_create_folder_success(client: AsyncClient, user_auth_headers):
    response = await client.post(
        folderprefix, json={"name": "Design", "color": "#6366F1"}, headers=user_auth_headers
    )
    assert_folder(response, "Design", "#6366F1")


@pytest.mark.anyio
async def test_create_folder_records_owner(client: AsyncClient, user, user_auth_headers):
    response = await client.post(
        folderprefix, json={"name": "My Folder", "color": "#red"}, headers=user_auth_headers
    )
    assert response.status_code == 201
    assert response.json()["owner_id"] == user["id"]


@pytest.mark.anyio
@pytest.mark.parametrize(
    "payload",
    [
        pytest.param({"color": "#FF0000"}, id="missing_name"),
        pytest.param({"name": "Folder"}, id="missing_color"),
        pytest.param({"name": "", "color": "#FF0000"}, id="empty_name"),
        pytest.param({"name": "Folder", "color": ""}, id="empty_color"),
    ],
)
async def test_create_folder_validation_error(client: AsyncClient, user_auth_headers, payload):
    response = await client.post(folderprefix, json=payload, headers=user_auth_headers)
    assert response.status_code == 422


@pytest.mark.anyio
async def test_create_folder_no_auth(client: AsyncClient):
    response = await client.post(folderprefix, json={"name": "Folder", "color": "#red"})
    assert response.status_code == 401


# ========================================================================================
# LIST  (GET /api/folders)
# ========================================================================================


@pytest.mark.anyio
async def test_list_folders_empty(client: AsyncClient, user_auth_headers):
    response = await client.get(folderprefix, headers=user_auth_headers)
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.anyio
async def test_list_folders_returns_own(client: AsyncClient, user_token, user_auth_headers):
    await create_folder(client, user_token, name="A")
    await create_folder(client, user_token, name="B")
    response = await client.get(folderprefix, headers=user_auth_headers)
    assert response.status_code == 200
    names = {f["name"] for f in response.json()}
    assert names == {"A", "B"}


@pytest.mark.anyio
async def test_list_folders_isolation(client: AsyncClient, user_token, user_auth_headers, second_user_token):
    """Each user only sees their own folders."""
    await create_folder(client, user_token, name="Owner Folder")
    await create_folder(client, second_user_token, name="Other Folder")
    response = await client.get(folderprefix, headers=user_auth_headers)
    names = {f["name"] for f in response.json()}
    assert "Owner Folder" in names
    assert "Other Folder" not in names


@pytest.mark.anyio
async def test_list_folders_no_auth(client: AsyncClient):
    response = await client.get(folderprefix)
    assert response.status_code == 401


# ========================================================================================
# UPDATE  (PATCH /api/folders/{id})
# ========================================================================================


@pytest.mark.anyio
@pytest.mark.parametrize(
    "payload,expected",
    [
        pytest.param({"name": "Renamed"}, {"name": "Renamed"}, id="update_name"),
        pytest.param({"color": "#00FF00"}, {"color": "#00FF00"}, id="update_color"),
        pytest.param({"name": "New", "color": "#000"}, {"name": "New", "color": "#000"}, id="update_both"),
    ],
)
async def test_update_folder_success(client: AsyncClient, user_auth_headers, folder, payload, expected):
    response = await client.patch(
        f"{folderprefix}/{folder['id']}", json=payload, headers=user_auth_headers
    )
    assert response.status_code == 200
    for key, value in expected.items():
        assert response.json()[key] == value


@pytest.mark.anyio
async def test_update_folder_empty_body_noop(client: AsyncClient, user_auth_headers, folder):
    response = await client.patch(
        f"{folderprefix}/{folder['id']}", json={}, headers=user_auth_headers
    )
    assert response.status_code == 200
    assert response.json()["name"] == folder["name"]
    assert response.json()["color"] == folder["color"]


@pytest.mark.anyio
@pytest.mark.parametrize(
    "payload",
    [
        pytest.param({"name": ""}, id="empty_name"),
        pytest.param({"color": ""}, id="empty_color"),
    ],
)
async def test_update_folder_validation_error(client: AsyncClient, user_auth_headers, folder, payload):
    response = await client.patch(
        f"{folderprefix}/{folder['id']}", json=payload, headers=user_auth_headers
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_update_folder_not_found(client: AsyncClient, user_auth_headers):
    response = await client.patch(
        f"{folderprefix}/99999", json={"name": "Ghost"}, headers=user_auth_headers
    )
    assert response.status_code == 404


@pytest.mark.anyio
async def test_update_folder_other_users_folder(
    client: AsyncClient, user_auth_headers, second_user_token
):
    other_folder = await create_folder(client, second_user_token, name="Theirs")
    response = await client.patch(
        f"{folderprefix}/{other_folder['id']}",
        json={"name": "Stolen"},
        headers=user_auth_headers,
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_update_folder_no_auth(client: AsyncClient, folder):
    response = await client.patch(f"{folderprefix}/{folder['id']}", json={"name": "No auth"})
    assert response.status_code == 401


# ========================================================================================
# DELETE  (DELETE /api/folders/{id})
# ========================================================================================


@pytest.mark.anyio
async def test_delete_folder_success(client: AsyncClient, user_auth_headers, folder):
    response = await client.delete(f"{folderprefix}/{folder['id']}", headers=user_auth_headers)
    assert response.status_code == 204


@pytest.mark.anyio
async def test_delete_folder_removes_folder(client: AsyncClient, user_token, user_auth_headers, folder):
    await client.delete(f"{folderprefix}/{folder['id']}", headers=user_auth_headers)
    response = await client.get(folderprefix, headers=user_auth_headers)
    assert not any(f["id"] == folder["id"] for f in response.json())


@pytest.mark.anyio
async def test_delete_folder_nullifies_workspace_folder_id(
    client: AsyncClient, user_token, user_auth_headers, workspace, folder
):
    """Deleting a folder should unlink any workspaces assigned to it."""
    await client.patch(
        f"/api/workspaces/{workspace['id']}/me",
        json={"folder_id": folder["id"]},
        headers=user_auth_headers,
    )
    await client.delete(f"{folderprefix}/{folder['id']}", headers=user_auth_headers)
    response = await client.get(f"/api/workspaces/{workspace['id']}", headers=user_auth_headers)
    assert response.json()["folder_id"] is None


@pytest.mark.anyio
async def test_delete_folder_not_found(client: AsyncClient, user_auth_headers):
    response = await client.delete(f"{folderprefix}/99999", headers=user_auth_headers)
    assert response.status_code == 404


@pytest.mark.anyio
async def test_delete_folder_other_users_folder(
    client: AsyncClient, user_auth_headers, second_user_token
):
    other_folder = await create_folder(client, second_user_token, name="Theirs")
    response = await client.delete(
        f"{folderprefix}/{other_folder['id']}", headers=user_auth_headers
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_delete_folder_no_auth(client: AsyncClient, folder):
    response = await client.delete(f"{folderprefix}/{folder['id']}")
    assert response.status_code == 401


# ========================================================================================
# SUBFOLDERS  (parent_id)
# ========================================================================================


async def make_folder(client, headers, name="Folder", parent_id=None):
    payload = {"name": name, "color": "#6366F1"}
    if parent_id is not None:
        payload["parent_id"] = parent_id
    response = await client.post(folderprefix, json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def list_by_id(client, headers):
    response = await client.get(folderprefix, headers=headers)
    assert response.status_code == 200
    return {f["id"]: f for f in response.json()}


@pytest.mark.anyio
async def test_create_folder_defaults_to_top_level(client: AsyncClient, user_auth_headers):
    folder = await make_folder(client, user_auth_headers)
    assert folder["parent_id"] is None


@pytest.mark.anyio
async def test_create_nested_folder(client: AsyncClient, user_auth_headers):
    parent = await make_folder(client, user_auth_headers, "Parent")
    child = await make_folder(client, user_auth_headers, "Child", parent_id=parent["id"])
    assert child["parent_id"] == parent["id"]

    listed = await list_by_id(client, user_auth_headers)
    assert listed[child["id"]]["parent_id"] == parent["id"]
    assert listed[parent["id"]]["parent_id"] is None


@pytest.mark.anyio
async def test_create_folder_under_missing_parent(client: AsyncClient, user_auth_headers):
    response = await client.post(
        folderprefix,
        json={"name": "Orphan", "color": "#000", "parent_id": 99999},
        headers=user_auth_headers,
    )
    assert response.status_code == 404
    assert response.json() == {"message": "Folder not found"}


@pytest.mark.anyio
async def test_create_folder_under_other_users_folder_rejected(
    client: AsyncClient, user_auth_headers, second_user_token
):
    theirs = await create_folder(client, second_user_token, name="Theirs")
    response = await client.post(
        folderprefix,
        json={"name": "Sneaky", "color": "#000", "parent_id": theirs["id"]},
        headers=user_auth_headers,
    )
    # Same response as a parent that does not exist - existence is not leaked.
    assert response.status_code == 404
    assert response.json() == {"message": "Folder not found"}
    assert await list_by_id(client, user_auth_headers) == {}


@pytest.mark.anyio
async def test_nesting_four_levels_deep(client: AsyncClient, user_auth_headers):
    chain = []
    parent_id = None
    for depth in range(5):
        folder = await make_folder(client, user_auth_headers, f"Level {depth}", parent_id=parent_id)
        assert folder["parent_id"] == parent_id
        chain.append(folder)
        parent_id = folder["id"]

    listed = await list_by_id(client, user_auth_headers)
    assert len(listed) == 5
    for parent, child in zip(chain, chain[1:]):
        assert listed[child["id"]]["parent_id"] == parent["id"]


@pytest.mark.anyio
async def test_move_folder_into_another(client: AsyncClient, user_auth_headers):
    a = await make_folder(client, user_auth_headers, "A")
    b = await make_folder(client, user_auth_headers, "B")
    response = await client.patch(
        f"{folderprefix}/{b['id']}", json={"parent_id": a["id"]}, headers=user_auth_headers
    )
    assert response.status_code == 200
    assert response.json()["parent_id"] == a["id"]
    assert (await list_by_id(client, user_auth_headers))[b["id"]]["parent_id"] == a["id"]


@pytest.mark.anyio
async def test_move_folder_to_top_level(client: AsyncClient, user_auth_headers):
    a = await make_folder(client, user_auth_headers, "A")
    b = await make_folder(client, user_auth_headers, "B", parent_id=a["id"])
    response = await client.patch(
        f"{folderprefix}/{b['id']}", json={"parent_id": None}, headers=user_auth_headers
    )
    assert response.status_code == 200
    assert response.json()["parent_id"] is None


@pytest.mark.anyio
async def test_update_without_parent_id_keeps_parent(client: AsyncClient, user_auth_headers):
    a = await make_folder(client, user_auth_headers, "A")
    b = await make_folder(client, user_auth_headers, "B", parent_id=a["id"])
    response = await client.patch(
        f"{folderprefix}/{b['id']}",
        json={"name": "Renamed", "color": "#fc556e"},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["parent_id"] == a["id"]
    assert response.json()["color"] == "#fc556e"


@pytest.mark.anyio
async def test_move_folder_under_other_users_folder_rejected(
    client: AsyncClient, user_auth_headers, second_user_token
):
    mine = await make_folder(client, user_auth_headers, "Mine")
    theirs = await create_folder(client, second_user_token, name="Theirs")
    response = await client.patch(
        f"{folderprefix}/{mine['id']}",
        json={"parent_id": theirs["id"]},
        headers=user_auth_headers,
    )
    assert response.status_code == 404
    assert (await list_by_id(client, user_auth_headers))[mine["id"]]["parent_id"] is None


@pytest.mark.anyio
async def test_move_folder_into_itself_rejected(client: AsyncClient, user_auth_headers):
    a = await make_folder(client, user_auth_headers, "A")
    response = await client.patch(
        f"{folderprefix}/{a['id']}", json={"parent_id": a["id"]}, headers=user_auth_headers
    )
    assert response.status_code == 400
    assert "message" in response.json()
    assert (await list_by_id(client, user_auth_headers))[a["id"]]["parent_id"] is None


@pytest.mark.anyio
async def test_move_folder_into_descendant_rejected(client: AsyncClient, user_auth_headers):
    a = await make_folder(client, user_auth_headers, "A")
    b = await make_folder(client, user_auth_headers, "B", parent_id=a["id"])
    c = await make_folder(client, user_auth_headers, "C", parent_id=b["id"])

    for target in (b, c):  # direct child, then grandchild
        response = await client.patch(
            f"{folderprefix}/{a['id']}",
            json={"parent_id": target["id"]},
            headers=user_auth_headers,
        )
        assert response.status_code == 400
        assert "message" in response.json()

    listed = await list_by_id(client, user_auth_headers)
    assert listed[a["id"]]["parent_id"] is None
    assert listed[b["id"]]["parent_id"] == a["id"]
    assert listed[c["id"]]["parent_id"] == b["id"]


@pytest.mark.anyio
async def test_delete_middle_folder_reparents_children_and_workspaces(
    client: AsyncClient, user_auth_headers, workspace
):
    top = await make_folder(client, user_auth_headers, "Top")
    middle = await make_folder(client, user_auth_headers, "Middle", parent_id=top["id"])
    child_1 = await make_folder(client, user_auth_headers, "Child 1", parent_id=middle["id"])
    child_2 = await make_folder(client, user_auth_headers, "Child 2", parent_id=middle["id"])
    grandchild = await make_folder(client, user_auth_headers, "Grandchild", parent_id=child_1["id"])

    await client.patch(
        f"/api/workspaces/{workspace['id']}/me",
        json={"folder_id": middle["id"]},
        headers=user_auth_headers,
    )

    response = await client.delete(f"{folderprefix}/{middle['id']}", headers=user_auth_headers)
    assert response.status_code == 204

    listed = await list_by_id(client, user_auth_headers)
    # Only the deleted folder is gone.
    assert set(listed) == {top["id"], child_1["id"], child_2["id"], grandchild["id"]}
    # Direct children moved up to the deleted folder's parent...
    assert listed[child_1["id"]]["parent_id"] == top["id"]
    assert listed[child_2["id"]]["parent_id"] == top["id"]
    # ...and the deeper subtree kept its shape.
    assert listed[grandchild["id"]]["parent_id"] == child_1["id"]

    ws = await client.get(f"/api/workspaces/{workspace['id']}", headers=user_auth_headers)
    assert ws.json()["folder_id"] == top["id"]


@pytest.mark.anyio
async def test_delete_top_level_folder_moves_children_to_top_level(
    client: AsyncClient, user_auth_headers, workspace
):
    top = await make_folder(client, user_auth_headers, "Top")
    child = await make_folder(client, user_auth_headers, "Child", parent_id=top["id"])
    await client.patch(
        f"/api/workspaces/{workspace['id']}/me",
        json={"folder_id": top["id"]},
        headers=user_auth_headers,
    )

    response = await client.delete(f"{folderprefix}/{top['id']}", headers=user_auth_headers)
    assert response.status_code == 204

    listed = await list_by_id(client, user_auth_headers)
    assert set(listed) == {child["id"]}
    assert listed[child["id"]]["parent_id"] is None

    ws = await client.get(f"/api/workspaces/{workspace['id']}", headers=user_auth_headers)
    assert ws.json()["folder_id"] is None


@pytest.mark.anyio
async def test_delete_folder_leaves_workspace_in_subfolder_alone(
    client: AsyncClient, user_auth_headers, workspace
):
    top = await make_folder(client, user_auth_headers, "Top")
    child = await make_folder(client, user_auth_headers, "Child", parent_id=top["id"])
    await client.patch(
        f"/api/workspaces/{workspace['id']}/me",
        json={"folder_id": child["id"]},
        headers=user_auth_headers,
    )

    await client.delete(f"{folderprefix}/{top['id']}", headers=user_auth_headers)

    ws = await client.get(f"/api/workspaces/{workspace['id']}", headers=user_auth_headers)
    assert ws.json()["folder_id"] == child["id"]
