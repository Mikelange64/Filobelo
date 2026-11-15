from datetime import UTC, datetime

import pytest
from app.models import Message as MessageModel
from fastapi.testclient import TestClient

from tests.auth_helpers import (
    add_workspace_member,
    auth_header,
    create_test_user,
    create_workspace,
    login_user,
    verify_user_in_db,
)

convoprefix = "/api/workspaces"


# ========================================================================================
# FIXTURES / HELPERS
# ========================================================================================


def conversation_path(workspace_id: int, suffix: str = "") -> str:
    return f"{convoprefix}/{workspace_id}/conversations{suffix}"


def create_conversation(
    client: TestClient,
    token: str,
    workspace_id: int,
    title: str = "General",
    type: str | None = None,
) -> dict:
    body = {"title": title}
    if type is not None:
        body["type"] = type
    response = client.post(
        conversation_path(workspace_id, "/"),
        json=body,
        headers=auth_header(token),
    )
    assert response.status_code == 201, (
        f"Failed to create conversation: {response.text}"
    )
    return response.json()


def create_message(
    client: TestClient,
    token: str,
    workspace_id: int,
    conversation_id: int,
    content: str = "hi",
) -> dict:
    response = client.post(
        conversation_path(workspace_id, f"/{conversation_id}/messages"),
        json={"content": content},
        headers=auth_header(token),
    )
    assert response.status_code == 201, f"Failed to send message: {response.text}"
    return response.json()


def promote_to_admin(
    client: TestClient, token: str, workspace_id: int, user_id: int
) -> None:
    response = client.patch(
        f"/api/workspaces/{workspace_id}/members/{user_id}/admin",
        headers=auth_header(token),
    )
    assert response.status_code == 200, f"Failed to promote to admin: {response.text}"


def outsider_headers(client: TestClient, db_session) -> dict:
    create_test_user(client, username="outsider", email="outsider@example.com")
    verify_user_in_db(db_session, "outsider@example.com")
    token = login_user(client, email="outsider@example.com")
    return auth_header(token)


def assert_forbidden(response):
    assert response.status_code == 403


def assert_unauthorized(response):
    assert response.status_code == 401


@pytest.fixture
def conversation(client, user_token, workspace):
    """Create and return a conversation owned by the default user in their workspace."""
    return create_conversation(client, user_token, workspace["id"])


# ========================================================================================
# CREATE CONVERSATION
# ========================================================================================


def test_create_conversation_success(
    client: TestClient, user, user_auth_headers, workspace
):
    response = client.post(
        conversation_path(workspace["id"], "/"),
        json={"title": "Design discussion"},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Design discussion"
    assert data["workspace_id"] == workspace["id"]
    assert data["creator_id"] == user["id"]
    assert data["is_pinned"] is False
    assert data["is_archived"] is False
    assert data["last_opened_at"] is not None
    assert data["last_message_at"] is None


def test_create_conversation_validation_error(
    client: TestClient, user_auth_headers, workspace
):
    response = client.post(
        conversation_path(workspace["id"], "/"),
        json={"title": ""},
        headers=user_auth_headers,
    )
    assert response.status_code == 422


def test_create_conversation_non_member(client: TestClient, db_session, workspace):
    response = client.post(
        conversation_path(workspace["id"], "/"),
        json={"title": "Intruder"},
        headers=outsider_headers(client, db_session),
    )
    assert_forbidden(response)


def test_create_conversation_no_auth(client: TestClient, workspace):
    response = client.post(
        conversation_path(workspace["id"], "/"), json={"title": "No auth"}
    )
    assert_unauthorized(response)


def test_create_conversation_nonexistent_workspace(
    client: TestClient, user_auth_headers
):
    response = client.post(
        conversation_path(99999, "/"),
        json={"title": "Ghost"},
        headers=user_auth_headers,
    )
    assert_forbidden(response)


def test_create_conversation_defaults_to_workspace_type(
    client: TestClient, user_auth_headers, workspace
):
    response = client.post(
        conversation_path(workspace["id"], "/"),
        json={"title": "No type given"},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["type"] == "WORKSPACE"


def test_create_conversation_bot_type(
    client: TestClient, premium_user, user_auth_headers, workspace
):
    response = client.post(
        conversation_path(workspace["id"], "/"),
        json={"title": "Filobelo", "type": "BOT"},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["type"] == "BOT"


def test_create_conversation_bot_type_requires_premium(
    client: TestClient, non_premium_user, user_auth_headers, workspace
):
    response = client.post(
        conversation_path(workspace["id"], "/"),
        json={"title": "Filobelo", "type": "BOT"},
        headers=user_auth_headers,
    )
    assert response.status_code == 403


def test_create_conversation_invalid_type_rejected(
    client: TestClient, user_auth_headers, workspace
):
    response = client.post(
        conversation_path(workspace["id"], "/"),
        json={"title": "Bogus", "type": "NOT_A_TYPE"},
        headers=user_auth_headers,
    )
    assert response.status_code == 422


# ========================================================================================
# LIST CONVERSATIONS
# ========================================================================================


def test_list_conversations_empty(client: TestClient, user_auth_headers, workspace):
    response = client.get(
        conversation_path(workspace["id"], "/"), headers=user_auth_headers
    )
    assert response.status_code == 200
    assert response.json() == []


def test_list_conversations_pinned_first(
    client: TestClient, user_auth_headers, user_token, workspace
):
    create_conversation(client, user_token, workspace["id"], title="First")
    second = create_conversation(client, user_token, workspace["id"], title="Second")

    client.patch(
        conversation_path(workspace["id"], f"/{second['id']}"),
        json={"is_pinned": True},
        headers=user_auth_headers,
    )

    response = client.get(
        conversation_path(workspace["id"], "/"), headers=user_auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["id"] == second["id"]
    assert data[0]["is_pinned"] is True


def test_list_conversations_orders_by_last_message(
    client: TestClient, user_auth_headers, user_token, workspace
):
    first = create_conversation(client, user_token, workspace["id"], title="First")
    second = create_conversation(client, user_token, workspace["id"], title="Second")

    # Neither has a message yet — falls back to created_at desc, so the newer one leads.
    response = client.get(
        conversation_path(workspace["id"], "/"), headers=user_auth_headers
    )
    assert response.json()[0]["id"] == second["id"]

    # Sending a message in the older conversation bumps it to the front.
    create_message(client, user_token, workspace["id"], first["id"])

    response = client.get(
        conversation_path(workspace["id"], "/"), headers=user_auth_headers
    )
    data = response.json()
    assert data[0]["id"] == first["id"]


def test_list_conversations_pinned_first_even_with_more_recent_message(
    client: TestClient, user_auth_headers, user_token, workspace
):
    first = create_conversation(client, user_token, workspace["id"], title="First")
    second = create_conversation(client, user_token, workspace["id"], title="Second")

    client.patch(
        conversation_path(workspace["id"], f"/{first['id']}"),
        json={"is_pinned": True},
        headers=user_auth_headers,
    )
    # The unpinned conversation gets the more recent message.
    create_message(client, user_token, workspace["id"], second["id"])

    response = client.get(
        conversation_path(workspace["id"], "/"), headers=user_auth_headers
    )
    data = response.json()
    assert data[0]["id"] == first["id"]
    assert data[0]["is_pinned"] is True


def test_list_conversations_pinned_group_ordered_by_last_message(
    client: TestClient, user_auth_headers, user_token, workspace
):
    first = create_conversation(client, user_token, workspace["id"], title="First")
    second = create_conversation(client, user_token, workspace["id"], title="Second")

    for conv in (first, second):
        client.patch(
            conversation_path(workspace["id"], f"/{conv['id']}"),
            json={"is_pinned": True},
            headers=user_auth_headers,
        )

    # Both pinned — message recency should still decide the order within the group.
    create_message(client, user_token, workspace["id"], first["id"])

    response = client.get(
        conversation_path(workspace["id"], "/"), headers=user_auth_headers
    )
    data = response.json()
    assert data[0]["id"] == first["id"]
    assert data[1]["id"] == second["id"]


def test_list_conversations_non_member(client: TestClient, db_session, workspace):
    response = client.get(
        conversation_path(workspace["id"], "/"),
        headers=outsider_headers(client, db_session),
    )
    assert_forbidden(response)


def test_list_conversations_includes_last_message_preview(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    create_message(
        client, user_token, workspace["id"], conversation["id"], content="first"
    )
    create_message(
        client, user_token, workspace["id"], conversation["id"], content="second"
    )

    response = client.get(
        conversation_path(workspace["id"], "/"), headers=user_auth_headers
    )
    assert response.status_code == 200
    data = response.json()[0]
    assert data["last_message"] == "second"
    assert data["last_message_at"] is not None


def test_list_conversations_last_message_truncated(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    long_content = "x" * 150
    create_message(
        client, user_token, workspace["id"], conversation["id"], content=long_content
    )

    response = client.get(
        conversation_path(workspace["id"], "/"), headers=user_auth_headers
    )
    data = response.json()[0]
    assert data["last_message"] == "x" * 100 + "…"


def test_conversation_without_messages_has_no_last_message(
    client: TestClient, user_auth_headers, workspace, conversation
):
    response = client.get(
        conversation_path(workspace["id"], "/"), headers=user_auth_headers
    )
    data = response.json()[0]
    assert data["last_message"] is None


# ========================================================================================
# GET CONVERSATION
# ========================================================================================


def test_get_conversation_success(
    client: TestClient, user_auth_headers, conversation, workspace
):
    response = client.get(
        conversation_path(workspace["id"], f"/{conversation['id']}"),
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["id"] == conversation["id"]


def test_get_conversation_not_found(client: TestClient, user_auth_headers, workspace):
    response = client.get(
        conversation_path(workspace["id"], "/99999"), headers=user_auth_headers
    )
    assert response.status_code == 404


def test_get_conversation_cross_workspace_scoping(
    client: TestClient, user_token, user_auth_headers, workspace, conversation
):
    """A conversation must not be reachable through a different workspace's path,
    even for a user who is a member of both workspaces."""
    other_workspace = create_workspace(client, user_token, title="Other Workspace")
    response = client.get(
        conversation_path(other_workspace["id"], f"/{conversation['id']}"),
        headers=user_auth_headers,
    )
    assert response.status_code == 404


# ========================================================================================
# UPDATE CONVERSATION
# ========================================================================================


def test_update_conversation_as_creator_success(
    client: TestClient, user_auth_headers, conversation, workspace
):
    response = client.patch(
        conversation_path(workspace["id"], f"/{conversation['id']}"),
        json={"title": "Renamed"},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Renamed"


def test_update_conversation_pin_and_archive(
    client: TestClient, user_auth_headers, conversation, workspace
):
    response = client.patch(
        conversation_path(workspace["id"], f"/{conversation['id']}"),
        json={"is_pinned": True, "is_archived": True},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["is_pinned"] is True
    assert data["is_archived"] is True


def test_update_conversation_as_admin_success(
    client: TestClient,
    user_token,
    user_auth_headers,
    workspace,
    conversation,
    second_user,
    second_user_token,
):
    add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    promote_to_admin(client, user_token, workspace["id"], second_user["id"])

    response = client.patch(
        conversation_path(workspace["id"], f"/{conversation['id']}"),
        json={"title": "Renamed by admin"},
        headers=auth_header(second_user_token),
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Renamed by admin"


def test_update_conversation_as_regular_member_forbidden(
    client: TestClient,
    user_token,
    workspace,
    conversation,
    second_user,
    second_user_token,
):
    add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    response = client.patch(
        conversation_path(workspace["id"], f"/{conversation['id']}"),
        json={"title": "Hijacked"},
        headers=auth_header(second_user_token),
    )
    assert_forbidden(response)


def test_update_conversation_not_found(
    client: TestClient, user_auth_headers, workspace
):
    response = client.patch(
        conversation_path(workspace["id"], "/99999"),
        json={"title": "Ghost"},
        headers=user_auth_headers,
    )
    assert response.status_code == 404


# ========================================================================================
# DELETE CONVERSATION
# ========================================================================================


def test_delete_conversation_as_creator_success(
    client: TestClient, user_auth_headers, conversation, workspace
):
    response = client.delete(
        conversation_path(workspace["id"], f"/{conversation['id']}"),
        headers=user_auth_headers,
    )
    assert response.status_code == 204

    get_response = client.get(
        conversation_path(workspace["id"], f"/{conversation['id']}"),
        headers=user_auth_headers,
    )
    assert get_response.status_code == 404


def test_delete_conversation_as_regular_member_forbidden(
    client: TestClient,
    user_token,
    workspace,
    conversation,
    second_user,
    second_user_token,
):
    add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    response = client.delete(
        conversation_path(workspace["id"], f"/{conversation['id']}"),
        headers=auth_header(second_user_token),
    )
    assert_forbidden(response)


def test_delete_conversation_cascades_messages(
    client: TestClient,
    db_session,
    user_token,
    user_auth_headers,
    workspace,
    conversation,
):
    message = create_message(client, user_token, workspace["id"], conversation["id"])

    response = client.delete(
        conversation_path(workspace["id"], f"/{conversation['id']}"),
        headers=user_auth_headers,
    )
    assert response.status_code == 204

    from app.models import Message as MessageModel

    assert db_session.get(MessageModel, message["id"]) is None


def test_delete_conversation_no_auth(client: TestClient, conversation, workspace):
    response = client.delete(
        conversation_path(workspace["id"], f"/{conversation['id']}")
    )
    assert_unauthorized(response)


# ========================================================================================
# SEND MESSAGE
# ========================================================================================


def test_send_message_success(
    client: TestClient, user, user_auth_headers, workspace, conversation
):
    response = client.post(
        conversation_path(workspace["id"], f"/{conversation['id']}/messages"),
        json={"content": "Hello team"},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["content"] == "Hello team"
    assert data["conversation_id"] == conversation["id"]
    assert data["sender_id"] == user["id"]


def test_send_message_empty_content_rejected(
    client: TestClient, user_auth_headers, workspace, conversation
):
    response = client.post(
        conversation_path(workspace["id"], f"/{conversation['id']}/messages"),
        json={"content": ""},
        headers=user_auth_headers,
    )
    assert response.status_code == 422


def test_send_message_non_member_forbidden(
    client: TestClient, db_session, workspace, conversation
):
    response = client.post(
        conversation_path(workspace["id"], f"/{conversation['id']}/messages"),
        json={"content": "Intruder"},
        headers=outsider_headers(client, db_session),
    )
    assert_forbidden(response)


def test_send_message_conversation_not_found(
    client: TestClient, user_auth_headers, workspace
):
    response = client.post(
        conversation_path(workspace["id"], "/99999/messages"),
        json={"content": "Ghost"},
        headers=user_auth_headers,
    )
    assert response.status_code == 404


def test_send_message_cross_workspace_scoping(
    client: TestClient, user_token, user_auth_headers, workspace, conversation
):
    other_workspace = create_workspace(client, user_token, title="Other Workspace")
    response = client.post(
        conversation_path(other_workspace["id"], f"/{conversation['id']}/messages"),
        json={"content": "Should not land here"},
        headers=user_auth_headers,
    )
    assert response.status_code == 404


# ========================================================================================
# SEND MESSAGE - BOT CONVERSATIONS
# ========================================================================================


def test_send_message_bot_conversation_returns_bot_reply(
    client: TestClient,
    premium_user,
    user_token,
    user_auth_headers,
    workspace,
    fake_bot_client,
):
    bot_conversation = create_conversation(
        client, user_token, workspace["id"], type="BOT"
    )
    fake_bot_client.output_text = "Sure, here's what I found."

    response = client.post(
        conversation_path(workspace["id"], f"/{bot_conversation['id']}/messages"),
        json={"content": "What's on my plate today?"},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["content"] == "Sure, here's what I found."
    assert data["sender_type"] == "BOT"
    assert data["sender_id"] is None


def test_send_message_bot_conversation_keeps_users_own_message(
    client: TestClient,
    premium_user,
    user_token,
    user_auth_headers,
    workspace,
    fake_bot_client,
):
    bot_conversation = create_conversation(
        client, user_token, workspace["id"], type="BOT"
    )

    client.post(
        conversation_path(workspace["id"], f"/{bot_conversation['id']}/messages"),
        json={"content": "What's on my plate today?"},
        headers=user_auth_headers,
    )

    response = client.get(
        conversation_path(workspace["id"], f"/{bot_conversation['id']}/messages"),
        headers=user_auth_headers,
    )
    data = response.json()
    assert data["total"] == 2
    assert data["messages"][0]["content"] == "What's on my plate today?"
    assert data["messages"][0]["sender_type"] == "USER"
    assert data["messages"][1]["sender_type"] == "BOT"


def test_send_message_bot_conversation_service_error_still_keeps_user_message(
    client: TestClient,
    premium_user,
    user_token,
    user_auth_headers,
    workspace,
    fake_bot_client,
):
    bot_conversation = create_conversation(
        client, user_token, workspace["id"], type="BOT"
    )
    fake_bot_client.exception = RuntimeError("Gemini is down")

    response = client.post(
        conversation_path(workspace["id"], f"/{bot_conversation['id']}/messages"),
        json={"content": "Hello?"},
        headers=user_auth_headers,
    )
    assert response.status_code == 503

    # The user's own message was already committed before the bot call failed.
    list_response = client.get(
        conversation_path(workspace["id"], f"/{bot_conversation['id']}/messages"),
        headers=user_auth_headers,
    )
    data = list_response.json()
    assert data["total"] == 1
    assert data["messages"][0]["content"] == "Hello?"


def test_send_message_workspace_conversation_unaffected_by_bot_wiring(
    client: TestClient, user_auth_headers, workspace, conversation
):
    """A plain WORKSPACE conversation should never touch the bot, even though
    both conversation types now share the same send_message endpoint."""
    response = client.post(
        conversation_path(workspace["id"], f"/{conversation['id']}/messages"),
        json={"content": "Hello team"},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["content"] == "Hello team"
    assert data["sender_type"] == "USER"


# ========================================================================================
# LIST MESSAGES
# ========================================================================================


def test_list_messages_empty(
    client: TestClient, user_auth_headers, workspace, conversation
):
    response = client.get(
        conversation_path(workspace["id"], f"/{conversation['id']}/messages"),
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["messages"] == []
    assert data["total"] == 0


def test_list_messages_marks_conversation_opened(
    client: TestClient, user_auth_headers, workspace, conversation
):
    opened_at_creation = conversation["last_opened_at"]

    client.get(
        conversation_path(workspace["id"], f"/{conversation['id']}/messages"),
        headers=user_auth_headers,
    )

    response = client.get(
        conversation_path(workspace["id"], f"/{conversation['id']}"),
        headers=user_auth_headers,
    )
    assert response.json()["last_opened_at"] > opened_at_creation


def test_list_messages_ordered_oldest_first(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    create_message(
        client, user_token, workspace["id"], conversation["id"], content="first"
    )
    create_message(
        client, user_token, workspace["id"], conversation["id"], content="second"
    )

    response = client.get(
        conversation_path(workspace["id"], f"/{conversation['id']}/messages"),
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert [m["content"] for m in data["messages"]] == ["first", "second"]


def test_list_messages_non_member_forbidden(
    client: TestClient, db_session, workspace, conversation
):
    response = client.get(
        conversation_path(workspace["id"], f"/{conversation['id']}/messages"),
        headers=outsider_headers(client, db_session),
    )
    assert_forbidden(response)


def test_list_messages_cross_workspace_scoping(
    client: TestClient, user_token, user_auth_headers, workspace, conversation
):
    other_workspace = create_workspace(client, user_token, title="Other Workspace")
    response = client.get(
        conversation_path(other_workspace["id"], f"/{conversation['id']}/messages"),
        headers=user_auth_headers,
    )
    assert response.status_code == 404


def list_messages(
    client: TestClient, headers: dict, workspace_id: int, conversation_id: int, **params
):
    return client.get(
        conversation_path(workspace_id, f"/{conversation_id}/messages"),
        params=params,
        headers=headers,
    )


def test_list_messages_default_returns_newest_page_in_chronological_order(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    for i in range(5):
        create_message(
            client, user_token, workspace["id"], conversation["id"], content=f"m{i}"
        )

    response = list_messages(
        client, user_auth_headers, workspace["id"], conversation["id"], limit=3
    )
    assert response.status_code == 200
    data = response.json()
    assert [m["content"] for m in data["messages"]] == ["m2", "m3", "m4"]
    assert data["total"] == 5
    assert data["has_more"] is True


def test_list_messages_skip_keeps_legacy_offset_paging(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    for i in range(5):
        create_message(
            client, user_token, workspace["id"], conversation["id"], content=f"m{i}"
        )

    first = list_messages(
        client, user_auth_headers, workspace["id"], conversation["id"], skip=0, limit=3
    ).json()
    assert [m["content"] for m in first["messages"]] == ["m0", "m1", "m2"]
    assert first["skip"] == 0
    assert first["has_more"] is True

    second = list_messages(
        client, user_auth_headers, workspace["id"], conversation["id"], skip=3, limit=3
    ).json()
    assert [m["content"] for m in second["messages"]] == ["m3", "m4"]
    assert second["has_more"] is False


def test_list_messages_before_id_walks_back_without_gaps_or_duplicates(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    sent = [
        create_message(
            client, user_token, workspace["id"], conversation["id"], content=f"m{i}"
        )
        for i in range(7)
    ]

    pages = []
    params = {"limit": 3}
    for _ in range(10):  # more than enough; guards against an endless loop
        data = list_messages(
            client, user_auth_headers, workspace["id"], conversation["id"], **params
        ).json()
        pages.append(data)
        if not data["has_more"]:
            break
        params = {"limit": 3, "before_id": data["messages"][0]["id"]}

    assert [[m["content"] for m in p["messages"]] for p in pages] == [
        ["m4", "m5", "m6"],
        ["m1", "m2", "m3"],
        ["m0"],
    ]
    seen = [m["id"] for p in reversed(pages) for m in p["messages"]]
    assert seen == [m["id"] for m in sent]


def test_list_messages_has_more_at_exact_boundary(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    sent = [
        create_message(
            client, user_token, workspace["id"], conversation["id"], content=f"m{i}"
        )
        for i in range(4)
    ]
    args = (client, user_auth_headers, workspace["id"], conversation["id"])

    # exactly `limit` messages exist: nothing older
    assert list_messages(*args, limit=4).json()["has_more"] is False
    # one more than `limit`
    assert list_messages(*args, limit=3).json()["has_more"] is True

    # exactly `limit` messages older than the cursor
    data = list_messages(*args, limit=3, before_id=sent[3]["id"]).json()
    assert [m["id"] for m in data["messages"]] == [m["id"] for m in sent[:3]]
    assert data["has_more"] is False
    data = list_messages(*args, limit=2, before_id=sent[3]["id"]).json()
    assert [m["id"] for m in data["messages"]] == [sent[1]["id"], sent[2]["id"]]
    assert data["has_more"] is True

    # nothing older than the oldest message
    data = list_messages(*args, limit=3, before_id=sent[0]["id"]).json()
    assert data["messages"] == []
    assert data["has_more"] is False


def test_list_messages_after_id_returns_only_newer_messages(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    sent = [
        create_message(
            client, user_token, workspace["id"], conversation["id"], content=f"m{i}"
        )
        for i in range(5)
    ]
    args = (client, user_auth_headers, workspace["id"], conversation["id"])

    data = list_messages(*args, after_id=sent[1]["id"], limit=2).json()
    assert [m["content"] for m in data["messages"]] == ["m2", "m3"]
    assert data["has_more"] is True

    data = list_messages(*args, after_id=sent[3]["id"], limit=2).json()
    assert [m["content"] for m in data["messages"]] == ["m4"]
    assert data["has_more"] is False

    data = list_messages(*args, after_id=sent[4]["id"]).json()
    assert data["messages"] == []
    assert data["has_more"] is False

    # after_id=0: from the very first message
    data = list_messages(*args, after_id=0, limit=2).json()
    assert [m["content"] for m in data["messages"]] == ["m0", "m1"]
    assert data["has_more"] is True


def test_list_messages_after_id_zero_on_empty_conversation(
    client: TestClient, user_auth_headers, workspace, conversation
):
    response = list_messages(
        client, user_auth_headers, workspace["id"], conversation["id"], after_id=0
    )
    assert response.status_code == 200
    assert response.json()["messages"] == []
    assert response.json()["has_more"] is False


def test_list_messages_identical_timestamps_page_stably_by_id(
    client: TestClient, db_session, user, user_auth_headers, workspace, conversation
):
    same_instant = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    rows = [
        MessageModel(
            conversation_id=conversation["id"],
            sender_id=user["id"],
            sender_type="USER",
            content=f"m{i}",
            created_at=same_instant,
        )
        for i in range(5)
    ]
    db_session.add_all(rows)
    db_session.commit()
    ids = sorted(r.id for r in rows)
    args = (client, user_auth_headers, workspace["id"], conversation["id"])

    newest = list_messages(*args, limit=2).json()
    assert [m["id"] for m in newest["messages"]] == ids[3:]
    older = list_messages(*args, limit=2, before_id=ids[3]).json()
    assert [m["id"] for m in older["messages"]] == ids[1:3]
    assert older["has_more"] is True
    newer = list_messages(*args, limit=10, after_id=ids[1]).json()
    assert [m["id"] for m in newer["messages"]] == ids[2:]


def test_list_messages_cursor_from_another_conversation_rejected(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    other = create_conversation(client, user_token, workspace["id"], title="Other")
    create_message(client, user_token, workspace["id"], other["id"], content="other-1")
    foreign = create_message(
        client, user_token, workspace["id"], other["id"], content="other-2"
    )
    create_message(
        client, user_token, workspace["id"], conversation["id"], content="mine"
    )

    for param in ("before_id", "after_id"):
        response = list_messages(
            client,
            user_auth_headers,
            workspace["id"],
            conversation["id"],
            **{param: foreign["id"]},
        )
        assert response.status_code == 404, param
        assert "other-" not in response.text


def test_list_messages_cursor_cannot_cross_workspaces(
    client: TestClient, user_token, user_auth_headers, workspace, conversation
):
    message = create_message(client, user_token, workspace["id"], conversation["id"])
    other_workspace = create_workspace(client, user_token, title="Other Workspace")
    other_conversation = create_conversation(client, user_token, other_workspace["id"])
    create_message(
        client,
        user_token,
        other_workspace["id"],
        other_conversation["id"],
        content="secret",
    )

    # the conversation id belongs to a different workspace than the path
    response = list_messages(
        client,
        user_auth_headers,
        other_workspace["id"],
        conversation["id"],
        before_id=message["id"],
    )
    assert response.status_code == 404
    # a valid conversation, but the cursor is a message from another workspace
    response = list_messages(
        client,
        user_auth_headers,
        other_workspace["id"],
        other_conversation["id"],
        after_id=message["id"],
    )
    assert response.status_code == 404


def test_list_messages_rejects_combined_paging_modes(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    message = create_message(client, user_token, workspace["id"], conversation["id"])
    response = list_messages(
        client,
        user_auth_headers,
        workspace["id"],
        conversation["id"],
        before_id=message["id"],
        after_id=message["id"],
    )
    assert response.status_code == 400


def test_list_messages_cursor_reads_do_not_mark_conversation_opened(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    message = create_message(client, user_token, workspace["id"], conversation["id"])
    path = conversation_path(workspace["id"], f"/{conversation['id']}")
    opened_before = client.get(path, headers=user_auth_headers).json()["last_opened_at"]

    for param in ("before_id", "after_id"):
        response = list_messages(
            client,
            user_auth_headers,
            workspace["id"],
            conversation["id"],
            **{param: message["id"]},
        )
        assert response.status_code == 200

    assert (
        client.get(path, headers=user_auth_headers).json()["last_opened_at"]
        == opened_before
    )


# ========================================================================================
# DELETE MESSAGE
# ========================================================================================


def test_delete_message_as_sender_success(
    client: TestClient, user_auth_headers, user_token, workspace, conversation
):
    message = create_message(client, user_token, workspace["id"], conversation["id"])
    response = client.delete(
        conversation_path(
            workspace["id"], f"/{conversation['id']}/messages/{message['id']}"
        ),
        headers=user_auth_headers,
    )
    assert response.status_code == 204


def test_delete_message_as_admin_success(
    client: TestClient,
    user_token,
    workspace,
    conversation,
    second_user,
    second_user_token,
):
    add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    promote_to_admin(client, user_token, workspace["id"], second_user["id"])
    message = create_message(client, user_token, workspace["id"], conversation["id"])

    response = client.delete(
        conversation_path(
            workspace["id"], f"/{conversation['id']}/messages/{message['id']}"
        ),
        headers=auth_header(second_user_token),
    )
    assert response.status_code == 204


def test_delete_message_as_other_member_forbidden(
    client: TestClient,
    user_token,
    workspace,
    conversation,
    second_user,
    second_user_token,
):
    add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    message = create_message(client, user_token, workspace["id"], conversation["id"])

    response = client.delete(
        conversation_path(
            workspace["id"], f"/{conversation['id']}/messages/{message['id']}"
        ),
        headers=auth_header(second_user_token),
    )
    assert_forbidden(response)


def test_delete_message_not_found(
    client: TestClient, user_auth_headers, workspace, conversation
):
    response = client.delete(
        conversation_path(workspace["id"], f"/{conversation['id']}/messages/99999"),
        headers=user_auth_headers,
    )
    assert response.status_code == 404


# ========================================================================================
# SURVIVAL ACROSS ACCOUNT DELETION (conversations/messages are workspace data, not personal)
# ========================================================================================


def test_conversation_survives_creator_account_deletion(
    client: TestClient,
    user_token,
    user_auth_headers,
    workspace,
    second_user,
    second_user_token,
):
    add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    convo = create_conversation(client, second_user_token, workspace["id"])

    response = client.delete("/api/users/me", headers=auth_header(second_user_token))
    assert response.status_code == 204

    response = client.get(
        conversation_path(workspace["id"], f"/{convo['id']}"), headers=user_auth_headers
    )
    assert response.status_code == 200
    assert response.json()["creator_id"] is None


def test_message_survives_sender_account_deletion(
    client: TestClient,
    user_token,
    user_auth_headers,
    workspace,
    conversation,
    second_user,
    second_user_token,
):
    add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    message = create_message(
        client, second_user_token, workspace["id"], conversation["id"]
    )

    response = client.delete("/api/users/me", headers=auth_header(second_user_token))
    assert response.status_code == 204

    response = client.get(
        conversation_path(workspace["id"], f"/{conversation['id']}/messages"),
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    sent = next(m for m in response.json()["messages"] if m["id"] == message["id"])
    assert sent["sender_id"] is None


# ========================================================================================
# RECENT CONVERSATIONS (cross-workspace, Home page widget)
# ========================================================================================


def test_recent_conversations_spans_workspaces(
    client: TestClient, user_token, user_auth_headers
):
    ws_a = create_workspace(client, user_token, title="Workspace A")
    ws_b = create_workspace(client, user_token, title="Workspace B")
    convo_a = create_conversation(client, user_token, ws_a["id"], title="Alpha")
    convo_b = create_conversation(client, user_token, ws_b["id"], title="Beta")

    response = client.get("/api/conversations/recent", headers=user_auth_headers)
    assert response.status_code == 200
    ids = {c["id"] for c in response.json()}
    assert convo_a["id"] in ids
    assert convo_b["id"] in ids

    by_id = {c["id"]: c for c in response.json()}
    assert by_id[convo_a["id"]]["workspace_title"] == "Workspace A"
    assert by_id[convo_b["id"]]["workspace_title"] == "Workspace B"


def test_recent_conversations_excludes_other_users_workspaces(
    client: TestClient, user_auth_headers, second_user, second_user_token
):
    other_ws = create_workspace(client, second_user_token, title="Not Yours")
    other_convo = create_conversation(client, second_user_token, other_ws["id"])

    response = client.get("/api/conversations/recent", headers=user_auth_headers)
    assert response.status_code == 200
    ids = {c["id"] for c in response.json()}
    assert other_convo["id"] not in ids


def test_recent_conversations_ordered_by_last_activity(
    client: TestClient, user_token, user_auth_headers, workspace
):
    older = create_conversation(client, user_token, workspace["id"], title="Older")
    newer = create_conversation(client, user_token, workspace["id"], title="Newer")

    # Bump the older conversation with a fresh message - it should now sort first.
    create_message(client, user_token, workspace["id"], older["id"])

    response = client.get("/api/conversations/recent", headers=user_auth_headers)
    ids = [c["id"] for c in response.json()]
    assert ids.index(older["id"]) < ids.index(newer["id"])


def test_recent_conversations_respects_limit(
    client: TestClient, user_token, user_auth_headers, workspace
):
    for i in range(5):
        create_conversation(client, user_token, workspace["id"], title=f"Convo {i}")

    response = client.get(
        "/api/conversations/recent?limit=2", headers=user_auth_headers
    )
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_recent_conversations_auth_required(client: TestClient):
    response = client.get("/api/conversations/recent")
    assert response.status_code == 401
