import pytest
from fastapi import HTTPException

from app.bot_service import BASE_SYSTEM_PROMPT, filobelo_bot
from app.models import Message, Resource, ResourceType, SenderType
from tests.auth_helpers import auth_header, create_task

# ========================================================================================
# FIXTURES / HELPERS
# ========================================================================================


def create_bot_conversation(client, token, workspace_id, title="Filobelo"):
    response = client.post(
        f"/api/workspaces/{workspace_id}/conversations/",
        json={"title": title, "type": "BOT"},
        headers=auth_header(token),
    )
    assert response.status_code == 201, f"Failed to create bot conversation: {response.text}"
    return response.json()


def add_message(db_session, conversation_id, content, sender_type=SenderType.USER, sender_id=None):
    """Inserts a message directly via the ORM, bypassing the send_message endpoint -
    that endpoint triggers a bot reply itself for BOT conversations, which would
    confuse tests that want precise control over the history reply() sees."""
    message = Message(
        conversation_id=conversation_id,
        sender_id=sender_id,
        sender_type=sender_type,
        content=content,
    )
    db_session.add(message)
    db_session.flush()
    return message


# ========================================================================================
# FilobeloBot.reply()
# ========================================================================================


def test_reply_creates_bot_message(client, db_session, user, premium_user, user_token, workspace, fake_bot_client):
    conversation = create_bot_conversation(client, user_token, workspace["id"])
    add_message(db_session, conversation["id"], "Hello Filobelo", sender_id=user["id"])
    fake_bot_client.output_text = "Hi there, how can I help?"

    reply = filobelo_bot.reply(conversation["id"], workspace["id"], db_session)

    assert reply.content == "Hi there, how can I help?"
    assert reply.sender_type == SenderType.BOT
    assert reply.sender_id is None
    assert reply.conversation_id == conversation["id"]


def test_reply_updates_conversation_last_message_at(
    client, db_session, user, premium_user, user_token, workspace, fake_bot_client
):
    conversation = create_bot_conversation(client, user_token, workspace["id"])
    assert conversation["last_message_at"] is None
    add_message(db_session, conversation["id"], "Hello", sender_id=user["id"])

    filobelo_bot.reply(conversation["id"], workspace["id"], db_session)

    response = client.get(
        f"/api/workspaces/{workspace['id']}/conversations/{conversation['id']}",
        headers=auth_header(user_token),
    )
    assert response.json()["last_message_at"] is not None


def test_reply_rejects_non_bot_conversation(
    client, db_session, user_token, workspace, fake_bot_client
):
    response = client.post(
        f"/api/workspaces/{workspace['id']}/conversations/",
        json={"title": "Team chat"},
        headers=auth_header(user_token),
    )
    conversation = response.json()

    with pytest.raises(HTTPException) as exc_info:
        filobelo_bot.reply(conversation["id"], workspace["id"], db_session)
    assert exc_info.value.status_code == 404


def test_reply_raises_503_on_client_error(
    client, db_session, premium_user, user_token, workspace, fake_bot_client
):
    conversation = create_bot_conversation(client, user_token, workspace["id"])
    fake_bot_client.exception = RuntimeError("network blip")

    with pytest.raises(HTTPException) as exc_info:
        filobelo_bot.reply(conversation["id"], workspace["id"], db_session)
    assert exc_info.value.status_code == 503


def test_reply_raises_503_on_empty_output_text(
    client, db_session, premium_user, user_token, workspace, fake_bot_client
):
    conversation = create_bot_conversation(client, user_token, workspace["id"])
    fake_bot_client.output_text = ""

    with pytest.raises(HTTPException) as exc_info:
        filobelo_bot.reply(conversation["id"], workspace["id"], db_session)
    assert exc_info.value.status_code == 503


def test_reply_calls_deepseek_with_expected_model(
    client, db_session, premium_user, user_token, workspace, fake_bot_client
):
    conversation = create_bot_conversation(client, user_token, workspace["id"])

    filobelo_bot.reply(conversation["id"], workspace["id"], db_session)

    assert len(fake_bot_client.calls) == 1
    call = fake_bot_client.calls[0]
    assert call["model"] == "deepseek-v4-flash"
    assert call["messages"][0]["role"] == "system"
    assert "Filobelo" in call["messages"][0]["content"]


def test_reply_sends_prior_messages_as_history(
    client, db_session, user, premium_user, user_token, workspace, fake_bot_client
):
    conversation = create_bot_conversation(client, user_token, workspace["id"])
    add_message(db_session, conversation["id"], "First question", sender_id=user["id"])
    add_message(
        db_session, conversation["id"], "First answer",
        sender_type=SenderType.BOT, sender_id=None,
    )
    add_message(db_session, conversation["id"], "Follow-up question", sender_id=user["id"])

    filobelo_bot.reply(conversation["id"], workspace["id"], db_session)

    # First message is the system prompt - history is everything after it.
    sent_history = fake_bot_client.calls[0]["messages"][1:]
    assert sent_history == [
        {"role": "user", "content": "First question"},
        {"role": "assistant", "content": "First answer"},
        {"role": "user", "content": "Follow-up question"},
    ]


# ========================================================================================
# _build_history
# ========================================================================================


def test_build_history_maps_turn_types():
    messages = [
        Message(sender_type=SenderType.USER, content="hi"),
        Message(sender_type=SenderType.BOT, content="hello"),
    ]

    history = filobelo_bot._build_history(messages)

    assert history == [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]


def test_build_history_empty_for_no_messages():
    assert filobelo_bot._build_history([]) == []


# ========================================================================================
# _build_system_prompt
# ========================================================================================


def test_build_system_prompt_no_tasks(db_session, workspace):
    prompt = filobelo_bot._build_system_prompt(workspace["id"], db_session)

    assert prompt.startswith(BASE_SYSTEM_PROMPT)
    assert "no tasks" in prompt.lower()


def test_build_system_prompt_includes_task_and_resource_index(
    client, db_session, user, user_token, workspace
):
    task = create_task(client, user_token, workspace["id"], title="Plan launch")
    resource = Resource(
        task_id=task["id"],
        created_by=user["id"],
        type=ResourceType.LINK,
        title="Marketing brief",
        url="https://example.com",
    )
    db_session.add(resource)
    db_session.flush()

    prompt = filobelo_bot._build_system_prompt(workspace["id"], db_session)

    assert f'Task #{task["id"]} "Plan launch"' in prompt
    assert f'LINK #{resource.id} "Marketing brief"' in prompt


def test_build_system_prompt_lists_task_with_no_resources(
    client, db_session, user_token, workspace
):
    task = create_task(client, user_token, workspace["id"], title="Empty task")

    prompt = filobelo_bot._build_system_prompt(workspace["id"], db_session)

    assert f'Task #{task["id"]} "Empty task"' in prompt
