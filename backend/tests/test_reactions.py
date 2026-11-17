import pytest
from httpx import AsyncClient

from tests.auth_helpers import (
    add_workspace_member,
    auth_header,
    create_task,
    create_workspace,
)
from tests.test_comments import comments_path, leave_comment  # noqa: F401  (fixture reuse)
from tests.test_comments import task  # noqa: F401
from tests.test_conversations import conversation_path, create_conversation, create_message

THUMBS, HEART = "👍", "❤️"


def react_path(workspace_id: int, task_id: int, comment_id: int) -> str:
    return comments_path(workspace_id, task_id, f"/{comment_id}/reactions")


async def react(client, token, ws_id, task_id, comment_id, emoji=THUMBS):
    return await client.post(
        react_path(ws_id, task_id, comment_id),
        json={"emoji": emoji},
        headers=auth_header(token),
    )


async def two_member_setup(client, user_token, workspace, task, second_user):
    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    return await leave_comment(client, user_token, workspace["id"], task["id"])


# ============================================ COMMENT REACTIONS ==============================================

@pytest.mark.anyio
async def test_new_comment_has_no_reactions(client, user_token, workspace, task):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    assert comment["reactions"] == []


@pytest.mark.anyio
async def test_toggle_adds_then_removes(client, user_token, workspace, task):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    added = await react(client, user_token, workspace["id"], task["id"], comment["id"])
    assert added.status_code == 200
    assert added.json() == [{"emoji": THUMBS, "count": 1, "reacted_by_me": True}]

    removed = await react(client, user_token, workspace["id"], task["id"], comment["id"])
    assert removed.status_code == 200
    assert removed.json() == []


@pytest.mark.anyio
async def test_reactions_group_by_emoji_with_per_viewer_flag(
    client, user_token, workspace, task, second_user, second_user_token
):
    comment = await two_member_setup(client, user_token, workspace, task, second_user)
    ws, tk, cid = workspace["id"], task["id"], comment["id"]
    await react(client, user_token, ws, tk, cid, THUMBS)
    await react(client, second_user_token, ws, tk, cid, THUMBS)
    await react(client, second_user_token, ws, tk, cid, HEART)

    mine = (await client.get(comments_path(ws, tk), headers=auth_header(user_token))).json()
    theirs = (await client.get(comments_path(ws, tk), headers=auth_header(second_user_token))).json()

    assert mine[0]["reactions"] == [
        {"emoji": THUMBS, "count": 2, "reacted_by_me": True},
        {"emoji": HEART, "count": 1, "reacted_by_me": False},
    ]
    assert theirs[0]["reactions"] == [
        {"emoji": THUMBS, "count": 2, "reacted_by_me": True},
        {"emoji": HEART, "count": 1, "reacted_by_me": True},
    ]


@pytest.mark.anyio
@pytest.mark.parametrize("emoji", ["", "x", "💩", "👍👍", "👍 "])
async def test_reaction_rejects_emoji_outside_the_set(
    client, user_token, workspace, task, emoji
):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    response = await react(client, user_token, workspace["id"], task["id"], comment["id"], emoji)
    assert response.status_code == 422


@pytest.mark.anyio
async def test_non_member_cannot_react(client, user_token, workspace, task, second_user_token):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    response = await react(client, second_user_token, workspace["id"], task["id"], comment["id"])
    assert response.status_code == 403


@pytest.mark.anyio
async def test_reaction_requires_authentication(client, user_token, workspace, task):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    response = await client.post(
        react_path(workspace["id"], task["id"], comment["id"]), json={"emoji": THUMBS}
    )
    assert response.status_code == 401


@pytest.mark.anyio
async def test_reaction_not_reachable_through_another_workspace(
    client, user_token, workspace, task, second_user_token
):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    other_ws = await create_workspace(client, second_user_token, title="Other WS")
    response = await react(client, second_user_token, other_ws["id"], task["id"], comment["id"])
    assert response.status_code == 404


@pytest.mark.anyio
async def test_react_to_missing_comment_404(client, user_token, workspace, task):
    response = await react(client, user_token, workspace["id"], task["id"], 9999)
    assert response.status_code == 404


@pytest.mark.anyio
async def test_deleting_comment_removes_its_reactions(
    client, user_token, workspace, task, db_session
):
    from sqlalchemy import func, select

    from app.models import CommentReaction

    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    await react(client, user_token, workspace["id"], task["id"], comment["id"])
    await client.delete(
        comments_path(workspace["id"], task["id"], f"/{comment['id']}"),
        headers=auth_header(user_token),
    )
    remaining = await db_session.scalar(select(func.count()).select_from(CommentReaction))
    assert remaining == 0


@pytest.mark.anyio
async def test_edit_response_keeps_reactions(client, user_token, workspace, task):
    comment = await leave_comment(client, user_token, workspace["id"], task["id"])
    await react(client, user_token, workspace["id"], task["id"], comment["id"])
    edited = await client.patch(
        comments_path(workspace["id"], task["id"], f"/{comment['id']}"),
        json={"content": "changed"},
        headers=auth_header(user_token),
    )
    assert edited.json()["reactions"] == [{"emoji": THUMBS, "count": 1, "reacted_by_me": True}]


# ============================================ MESSAGE REACTIONS ==============================================

def msg_react_path(workspace_id: int, conversation_id: int, message_id: int) -> str:
    return conversation_path(workspace_id, f"/{conversation_id}/messages/{message_id}/reactions")


async def react_msg(client, token, ws_id, conv_id, msg_id, emoji=THUMBS):
    return await client.post(
        msg_react_path(ws_id, conv_id, msg_id),
        json={"emoji": emoji},
        headers=auth_header(token),
    )


@pytest.fixture
async def message(client, user_token, workspace):
    conversation = await create_conversation(client, user_token, workspace["id"])
    msg = await create_message(client, user_token, workspace["id"], conversation["id"])
    return {"conversation": conversation, "message": msg}


@pytest.mark.anyio
async def test_message_toggle_adds_then_removes(client, user_token, workspace, message):
    ws, conv, msg = workspace["id"], message["conversation"]["id"], message["message"]["id"]
    added = await react_msg(client, user_token, ws, conv, msg)
    assert added.status_code == 200
    assert added.json() == [{"emoji": THUMBS, "count": 1, "reacted_by_me": True}]
    assert (await react_msg(client, user_token, ws, conv, msg)).json() == []


@pytest.mark.anyio
async def test_message_list_includes_per_viewer_reactions(
    client, user_token, workspace, message, second_user, second_user_token
):
    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    ws, conv, msg = workspace["id"], message["conversation"]["id"], message["message"]["id"]
    await react_msg(client, user_token, ws, conv, msg, THUMBS)
    await react_msg(client, second_user_token, ws, conv, msg, THUMBS)
    await react_msg(client, second_user_token, ws, conv, msg, HEART)

    url = conversation_path(ws, f"/{conv}/messages")
    mine = (await client.get(url, headers=auth_header(user_token))).json()["messages"][0]
    theirs = (await client.get(url, headers=auth_header(second_user_token))).json()["messages"][0]

    assert mine["reactions"] == [
        {"emoji": THUMBS, "count": 2, "reacted_by_me": True},
        {"emoji": HEART, "count": 1, "reacted_by_me": False},
    ]
    assert theirs["reactions"][1] == {"emoji": HEART, "count": 1, "reacted_by_me": True}


@pytest.mark.anyio
async def test_unreacted_message_has_empty_reactions(client, user_token, workspace, message):
    ws, conv = workspace["id"], message["conversation"]["id"]
    body = (
        await client.get(conversation_path(ws, f"/{conv}/messages"), headers=auth_header(user_token))
    ).json()
    assert body["messages"][0]["reactions"] == []
    assert message["message"]["reactions"] == []


@pytest.mark.anyio
async def test_message_reaction_rejects_bad_emoji(client, user_token, workspace, message):
    ws, conv, msg = workspace["id"], message["conversation"]["id"], message["message"]["id"]
    assert (await react_msg(client, user_token, ws, conv, msg, "💩")).status_code == 422


@pytest.mark.anyio
async def test_non_member_cannot_react_to_message(
    client, workspace, message, second_user_token
):
    ws, conv, msg = workspace["id"], message["conversation"]["id"], message["message"]["id"]
    assert (await react_msg(client, second_user_token, ws, conv, msg)).status_code == 403


@pytest.mark.anyio
async def test_message_reaction_not_reachable_through_another_workspace(
    client, workspace, message, second_user_token
):
    other_ws = await create_workspace(client, second_user_token, title="Other WS")
    conv, msg = message["conversation"]["id"], message["message"]["id"]
    response = await react_msg(client, second_user_token, other_ws["id"], conv, msg)
    assert response.status_code == 404


@pytest.mark.anyio
async def test_message_reaction_message_must_belong_to_conversation(
    client, user_token, workspace, message
):
    other_conv = await create_conversation(client, user_token, workspace["id"], title="Other")
    response = await react_msg(
        client, user_token, workspace["id"], other_conv["id"], message["message"]["id"]
    )
    assert response.status_code == 404


@pytest.mark.anyio
async def test_deleting_message_removes_its_reactions(
    client, user_token, workspace, message, db_session
):
    from sqlalchemy import func, select

    from app.models import MessageReaction

    ws, conv, msg = workspace["id"], message["conversation"]["id"], message["message"]["id"]
    await react_msg(client, user_token, ws, conv, msg)
    deleted = await client.delete(
        conversation_path(ws, f"/{conv}/messages/{msg}"), headers=auth_header(user_token)
    )
    assert deleted.status_code == 204
    assert await db_session.scalar(select(func.count()).select_from(MessageReaction)) == 0


@pytest.mark.anyio
async def test_deleting_conversation_removes_message_reactions(
    client, user_token, workspace, message, db_session
):
    from sqlalchemy import func, select

    from app.models import MessageReaction

    ws, conv, msg = workspace["id"], message["conversation"]["id"], message["message"]["id"]
    await react_msg(client, user_token, ws, conv, msg)
    deleted = await client.delete(conversation_path(ws, f"/{conv}"), headers=auth_header(user_token))
    assert deleted.status_code == 204
    assert await db_session.scalar(select(func.count()).select_from(MessageReaction)) == 0
