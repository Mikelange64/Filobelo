import pytest
from fastapi.testclient import TestClient

from tests.auth_helpers import auth_header, create_folder, create_test_user, login_user

folderprefix = "/api/folders"


# ========================================================================================
# FIXTURES
# ========================================================================================


@pytest.fixture
def folder(client, user_token):
    """Create and return a folder owned by the default user."""
    return create_folder(client, user_token)


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


def test_create_folder_success(client: TestClient, user_auth_headers):
    response = client.post(
        folderprefix, json={"name": "Design", "color": "#6366F1"}, headers=user_auth_headers
    )
    assert_folder(response, "Design", "#6366F1")


def test_create_folder_records_owner(client: TestClient, user, user_auth_headers):
    response = client.post(
        folderprefix, json={"name": "My Folder", "color": "#red"}, headers=user_auth_headers
    )
    assert response.status_code == 201
    assert response.json()["owner_id"] == user["id"]


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param({"color": "#FF0000"}, id="missing_name"),
        pytest.param({"name": "Folder"}, id="missing_color"),
        pytest.param({"name": "", "color": "#FF0000"}, id="empty_name"),
        pytest.param({"name": "Folder", "color": ""}, id="empty_color"),
    ],
)
def test_create_folder_validation_error(client: TestClient, user_auth_headers, payload):
    response = client.post(folderprefix, json=payload, headers=user_auth_headers)
    assert response.status_code == 422


def test_create_folder_no_auth(client: TestClient):
    response = client.post(folderprefix, json={"name": "Folder", "color": "#red"})
    assert response.status_code == 401


# ========================================================================================
# LIST  (GET /api/folders)
# ========================================================================================


def test_list_folders_empty(client: TestClient, user_auth_headers):
    response = client.get(folderprefix, headers=user_auth_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_list_folders_returns_own(client: TestClient, user_token, user_auth_headers):
    create_folder(client, user_token, name="A")
    create_folder(client, user_token, name="B")
    response = client.get(folderprefix, headers=user_auth_headers)
    assert response.status_code == 200
    names = {f["name"] for f in response.json()}
    assert names == {"A", "B"}


def test_list_folders_isolation(client: TestClient, user_token, user_auth_headers, second_user_token):
    """Each user only sees their own folders."""
    create_folder(client, user_token, name="Owner Folder")
    create_folder(client, second_user_token, name="Other Folder")
    response = client.get(folderprefix, headers=user_auth_headers)
    names = {f["name"] for f in response.json()}
    assert "Owner Folder" in names
    assert "Other Folder" not in names


def test_list_folders_no_auth(client: TestClient):
    response = client.get(folderprefix)
    assert response.status_code == 401


# ========================================================================================
# UPDATE  (PATCH /api/folders/{id})
# ========================================================================================


@pytest.mark.parametrize(
    "payload,expected",
    [
        pytest.param({"name": "Renamed"}, {"name": "Renamed"}, id="update_name"),
        pytest.param({"color": "#00FF00"}, {"color": "#00FF00"}, id="update_color"),
        pytest.param({"name": "New", "color": "#000"}, {"name": "New", "color": "#000"}, id="update_both"),
    ],
)
def test_update_folder_success(client: TestClient, user_auth_headers, folder, payload, expected):
    response = client.patch(
        f"{folderprefix}/{folder['id']}", json=payload, headers=user_auth_headers
    )
    assert response.status_code == 200
    for key, value in expected.items():
        assert response.json()[key] == value


def test_update_folder_empty_body_noop(client: TestClient, user_auth_headers, folder):
    response = client.patch(
        f"{folderprefix}/{folder['id']}", json={}, headers=user_auth_headers
    )
    assert response.status_code == 200
    assert response.json()["name"] == folder["name"]
    assert response.json()["color"] == folder["color"]


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param({"name": ""}, id="empty_name"),
        pytest.param({"color": ""}, id="empty_color"),
    ],
)
def test_update_folder_validation_error(client: TestClient, user_auth_headers, folder, payload):
    response = client.patch(
        f"{folderprefix}/{folder['id']}", json=payload, headers=user_auth_headers
    )
    assert response.status_code == 422


def test_update_folder_not_found(client: TestClient, user_auth_headers):
    response = client.patch(
        f"{folderprefix}/99999", json={"name": "Ghost"}, headers=user_auth_headers
    )
    assert response.status_code == 404


def test_update_folder_other_users_folder(
    client: TestClient, user_auth_headers, second_user_token
):
    other_folder = create_folder(client, second_user_token, name="Theirs")
    response = client.patch(
        f"{folderprefix}/{other_folder['id']}",
        json={"name": "Stolen"},
        headers=user_auth_headers,
    )
    assert response.status_code == 403


def test_update_folder_no_auth(client: TestClient, folder):
    response = client.patch(f"{folderprefix}/{folder['id']}", json={"name": "No auth"})
    assert response.status_code == 401


# ========================================================================================
# DELETE  (DELETE /api/folders/{id})
# ========================================================================================


def test_delete_folder_success(client: TestClient, user_auth_headers, folder):
    response = client.delete(f"{folderprefix}/{folder['id']}", headers=user_auth_headers)
    assert response.status_code == 204


def test_delete_folder_removes_folder(client: TestClient, user_token, user_auth_headers, folder):
    client.delete(f"{folderprefix}/{folder['id']}", headers=user_auth_headers)
    response = client.get(folderprefix, headers=user_auth_headers)
    assert not any(f["id"] == folder["id"] for f in response.json())


def test_delete_folder_nullifies_workspace_folder_id(
    client: TestClient, user_token, user_auth_headers, workspace, folder
):
    """Deleting a folder should unlink any workspaces assigned to it."""
    client.patch(
        f"/api/workspaces/{workspace['id']}/me",
        json={"folder_id": folder["id"]},
        headers=user_auth_headers,
    )
    client.delete(f"{folderprefix}/{folder['id']}", headers=user_auth_headers)
    response = client.get(f"/api/workspaces/{workspace['id']}", headers=user_auth_headers)
    assert response.json()["folder_id"] is None


def test_delete_folder_not_found(client: TestClient, user_auth_headers):
    response = client.delete(f"{folderprefix}/99999", headers=user_auth_headers)
    assert response.status_code == 404


def test_delete_folder_other_users_folder(
    client: TestClient, user_auth_headers, second_user_token
):
    other_folder = create_folder(client, second_user_token, name="Theirs")
    response = client.delete(
        f"{folderprefix}/{other_folder['id']}", headers=user_auth_headers
    )
    assert response.status_code == 403


def test_delete_folder_no_auth(client: TestClient, folder):
    response = client.delete(f"{folderprefix}/{folder['id']}")
    assert response.status_code == 401


# ========================================================================================
# SUBFOLDERS  (parent_id)
# ========================================================================================


def make_folder(client, headers, name="Folder", parent_id=None):
    payload = {"name": name, "color": "#6366F1"}
    if parent_id is not None:
        payload["parent_id"] = parent_id
    response = client.post(folderprefix, json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def list_by_id(client, headers):
    response = client.get(folderprefix, headers=headers)
    assert response.status_code == 200
    return {f["id"]: f for f in response.json()}


def test_create_folder_defaults_to_top_level(client: TestClient, user_auth_headers):
    folder = make_folder(client, user_auth_headers)
    assert folder["parent_id"] is None


def test_create_nested_folder(client: TestClient, user_auth_headers):
    parent = make_folder(client, user_auth_headers, "Parent")
    child = make_folder(client, user_auth_headers, "Child", parent_id=parent["id"])
    assert child["parent_id"] == parent["id"]

    listed = list_by_id(client, user_auth_headers)
    assert listed[child["id"]]["parent_id"] == parent["id"]
    assert listed[parent["id"]]["parent_id"] is None


def test_create_folder_under_missing_parent(client: TestClient, user_auth_headers):
    response = client.post(
        folderprefix,
        json={"name": "Orphan", "color": "#000", "parent_id": 99999},
        headers=user_auth_headers,
    )
    assert response.status_code == 404
    assert response.json() == {"message": "Folder not found"}


def test_create_folder_under_other_users_folder_rejected(
    client: TestClient, user_auth_headers, second_user_token
):
    theirs = create_folder(client, second_user_token, name="Theirs")
    response = client.post(
        folderprefix,
        json={"name": "Sneaky", "color": "#000", "parent_id": theirs["id"]},
        headers=user_auth_headers,
    )
    # Same response as a parent that does not exist - existence is not leaked.
    assert response.status_code == 404
    assert response.json() == {"message": "Folder not found"}
    assert list_by_id(client, user_auth_headers) == {}


def test_nesting_four_levels_deep(client: TestClient, user_auth_headers):
    chain = []
    parent_id = None
    for depth in range(5):
        folder = make_folder(client, user_auth_headers, f"Level {depth}", parent_id=parent_id)
        assert folder["parent_id"] == parent_id
        chain.append(folder)
        parent_id = folder["id"]

    listed = list_by_id(client, user_auth_headers)
    assert len(listed) == 5
    for parent, child in zip(chain, chain[1:]):
        assert listed[child["id"]]["parent_id"] == parent["id"]


def test_move_folder_into_another(client: TestClient, user_auth_headers):
    a = make_folder(client, user_auth_headers, "A")
    b = make_folder(client, user_auth_headers, "B")
    response = client.patch(
        f"{folderprefix}/{b['id']}", json={"parent_id": a["id"]}, headers=user_auth_headers
    )
    assert response.status_code == 200
    assert response.json()["parent_id"] == a["id"]
    assert list_by_id(client, user_auth_headers)[b["id"]]["parent_id"] == a["id"]


def test_move_folder_to_top_level(client: TestClient, user_auth_headers):
    a = make_folder(client, user_auth_headers, "A")
    b = make_folder(client, user_auth_headers, "B", parent_id=a["id"])
    response = client.patch(
        f"{folderprefix}/{b['id']}", json={"parent_id": None}, headers=user_auth_headers
    )
    assert response.status_code == 200
    assert response.json()["parent_id"] is None


def test_update_without_parent_id_keeps_parent(client: TestClient, user_auth_headers):
    a = make_folder(client, user_auth_headers, "A")
    b = make_folder(client, user_auth_headers, "B", parent_id=a["id"])
    response = client.patch(
        f"{folderprefix}/{b['id']}",
        json={"name": "Renamed", "color": "#fc556e"},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["parent_id"] == a["id"]
    assert response.json()["color"] == "#fc556e"


def test_move_folder_under_other_users_folder_rejected(
    client: TestClient, user_auth_headers, second_user_token
):
    mine = make_folder(client, user_auth_headers, "Mine")
    theirs = create_folder(client, second_user_token, name="Theirs")
    response = client.patch(
        f"{folderprefix}/{mine['id']}",
        json={"parent_id": theirs["id"]},
        headers=user_auth_headers,
    )
    assert response.status_code == 404
    assert list_by_id(client, user_auth_headers)[mine["id"]]["parent_id"] is None


def test_move_folder_into_itself_rejected(client: TestClient, user_auth_headers):
    a = make_folder(client, user_auth_headers, "A")
    response = client.patch(
        f"{folderprefix}/{a['id']}", json={"parent_id": a["id"]}, headers=user_auth_headers
    )
    assert response.status_code == 400
    assert "message" in response.json()
    assert list_by_id(client, user_auth_headers)[a["id"]]["parent_id"] is None


def test_move_folder_into_descendant_rejected(client: TestClient, user_auth_headers):
    a = make_folder(client, user_auth_headers, "A")
    b = make_folder(client, user_auth_headers, "B", parent_id=a["id"])
    c = make_folder(client, user_auth_headers, "C", parent_id=b["id"])

    for target in (b, c):  # direct child, then grandchild
        response = client.patch(
            f"{folderprefix}/{a['id']}",
            json={"parent_id": target["id"]},
            headers=user_auth_headers,
        )
        assert response.status_code == 400
        assert "message" in response.json()

    listed = list_by_id(client, user_auth_headers)
    assert listed[a["id"]]["parent_id"] is None
    assert listed[b["id"]]["parent_id"] == a["id"]
    assert listed[c["id"]]["parent_id"] == b["id"]


def test_delete_middle_folder_reparents_children_and_workspaces(
    client: TestClient, user_auth_headers, workspace
):
    top = make_folder(client, user_auth_headers, "Top")
    middle = make_folder(client, user_auth_headers, "Middle", parent_id=top["id"])
    child_1 = make_folder(client, user_auth_headers, "Child 1", parent_id=middle["id"])
    child_2 = make_folder(client, user_auth_headers, "Child 2", parent_id=middle["id"])
    grandchild = make_folder(client, user_auth_headers, "Grandchild", parent_id=child_1["id"])

    client.patch(
        f"/api/workspaces/{workspace['id']}/me",
        json={"folder_id": middle["id"]},
        headers=user_auth_headers,
    )

    response = client.delete(f"{folderprefix}/{middle['id']}", headers=user_auth_headers)
    assert response.status_code == 204

    listed = list_by_id(client, user_auth_headers)
    # Only the deleted folder is gone.
    assert set(listed) == {top["id"], child_1["id"], child_2["id"], grandchild["id"]}
    # Direct children moved up to the deleted folder's parent...
    assert listed[child_1["id"]]["parent_id"] == top["id"]
    assert listed[child_2["id"]]["parent_id"] == top["id"]
    # ...and the deeper subtree kept its shape.
    assert listed[grandchild["id"]]["parent_id"] == child_1["id"]

    ws = client.get(f"/api/workspaces/{workspace['id']}", headers=user_auth_headers)
    assert ws.json()["folder_id"] == top["id"]


def test_delete_top_level_folder_moves_children_to_top_level(
    client: TestClient, user_auth_headers, workspace
):
    top = make_folder(client, user_auth_headers, "Top")
    child = make_folder(client, user_auth_headers, "Child", parent_id=top["id"])
    client.patch(
        f"/api/workspaces/{workspace['id']}/me",
        json={"folder_id": top["id"]},
        headers=user_auth_headers,
    )

    response = client.delete(f"{folderprefix}/{top['id']}", headers=user_auth_headers)
    assert response.status_code == 204

    listed = list_by_id(client, user_auth_headers)
    assert set(listed) == {child["id"]}
    assert listed[child["id"]]["parent_id"] is None

    ws = client.get(f"/api/workspaces/{workspace['id']}", headers=user_auth_headers)
    assert ws.json()["folder_id"] is None


def test_delete_folder_leaves_workspace_in_subfolder_alone(
    client: TestClient, user_auth_headers, workspace
):
    top = make_folder(client, user_auth_headers, "Top")
    child = make_folder(client, user_auth_headers, "Child", parent_id=top["id"])
    client.patch(
        f"/api/workspaces/{workspace['id']}/me",
        json={"folder_id": child["id"]},
        headers=user_auth_headers,
    )

    client.delete(f"{folderprefix}/{top['id']}", headers=user_auth_headers)

    ws = client.get(f"/api/workspaces/{workspace['id']}", headers=user_auth_headers)
    assert ws.json()["folder_id"] == child["id"]
