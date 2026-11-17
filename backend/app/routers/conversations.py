from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import selectinload

from app.auth import CurrentUser
from app.bot_service import filobelo_bot
from app.database import DbSession
from app.dependencies import require_membership
from app.models import (
    Conversation,
    ConversationType,
    Message,
    MessageReaction,
    Workspace,
    WorkspaceMember,
)
from app.schemas import (
    ConversationCreate,
    ConversationResponse,
    ConversationUpdate,
    ConversationWithWorkspace,
    MessageCreate,
    MessageResponse,
    PaginatedMessageResponse,
    ReactionSummary,
    ReactionToggle,
)
from app.utils import get_conversation_by_id, get_conversation_by_id_with_messages
from app.utils.reactions import summarize_reactions, toggle_reaction

router = APIRouter(prefix="/{workspace_id}/conversations", tags=["conversations"])

# Not workspace-scoped like the router above - aggregates across every
# workspace the user belongs to, for the Home page conversations widget.
recent_router = APIRouter(prefix="/conversations", tags=["conversations"])


@recent_router.get("/recent", response_model=list[ConversationWithWorkspace])
async def list_recent_conversations(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = 4,
):
    member_workspace_ids = select(WorkspaceMember.workspace_id).where(
        WorkspaceMember.user_id == current_user.id
    )
    result = await db.execute(
        select(Conversation, Workspace.title)
        .options(selectinload(Conversation.messages))
        .join(Workspace, Workspace.id == Conversation.workspace_id)
        .where(Conversation.workspace_id.in_(member_workspace_ids))
        .order_by(
            func.coalesce(Conversation.last_message_at, Conversation.created_at).desc()
        )
        .limit(limit)
    )
    rows = result.all()

    return [
        ConversationWithWorkspace(
            **ConversationResponse.model_validate(conversation).model_dump(),
            workspace_title=title,
        )
        for conversation, title in rows
    ]


async def _refresh_conversation(conversation: Conversation, db: DbSession) -> None:
    """Reloads a conversation after a commit, ready to be returned.

    ConversationResponse.last_message is read from conversation.messages. A
    plain db.refresh() only re-reads the columns, and an async session cannot
    load the messages later on first access, so they are refreshed by name.
    """
    await db.refresh(conversation)
    await db.refresh(conversation, attribute_names=["messages"])


def _require_creator_or_admin(
    conversation: Conversation, member: WorkspaceMember
) -> None:
    if conversation.creator_id != member.user_id and member.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the conversation creator or an admin can perform this action",
        )


@router.post(
    "/", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED
)
async def create_conversation(
    workspace_id: int,
    data: ConversationCreate,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
    current_user: CurrentUser,
):
    if data.type == ConversationType.BOT and not current_user.is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Filobelo is a premium feature",
        )

    new_conversation = Conversation(
        workspace_id=workspace_id,
        creator_id=member.user_id,
        type=data.type,
        title=data.title,
    )
    db.add(new_conversation)
    await db.commit()
    await _refresh_conversation(new_conversation, db)
    return new_conversation


@router.get(
    "/",
    response_model=list[ConversationResponse],
    dependencies=[Depends(require_membership)],
)
async def list_conversations(workspace_id: int, db: DbSession):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.workspace_id == workspace_id)
        .order_by(
            Conversation.is_pinned.desc(),
            func.coalesce(
                Conversation.last_message_at, Conversation.created_at
            ).desc(),
        )
    )
    return result.scalars().all()


@router.get(
    "/{conversation_id}",
    response_model=ConversationResponse,
    dependencies=[Depends(require_membership)],
)
async def get_conversation(conversation_id: int, workspace_id: int, db: DbSession):
    return await get_conversation_by_id_with_messages(conversation_id, workspace_id, db)


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: int,
    workspace_id: int,
    data: ConversationUpdate,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    conversation = await get_conversation_by_id(conversation_id, workspace_id, db)
    _require_creator_or_admin(conversation, member)

    update = data.model_dump(exclude_unset=True)
    for field, value in update.items():
        setattr(conversation, field, value)

    await db.commit()
    await _refresh_conversation(conversation, db)
    return conversation


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: int,
    workspace_id: int,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    conversation = await get_conversation_by_id(conversation_id, workspace_id, db)
    _require_creator_or_admin(conversation, member)

    await db.delete(conversation)
    await db.commit()


# =============================================== MESSAGES ===================================================


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: int,
    workspace_id: int,
    data: MessageCreate,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
    current_user: CurrentUser,
):
    conversation = await get_conversation_by_id(conversation_id, workspace_id, db)

    if conversation.type == ConversationType.BOT and not current_user.is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Filobelo is a premium feature",
        )

    now = datetime.now(UTC)
    new_message = Message(
        conversation_id=conversation_id,
        sender_id=member.user_id,
        sender_type=data.sender_type,
        content=data.content,
        created_at=now,
    )
    conversation.last_message_at = now
    db.add(new_message)
    await db.commit()
    await db.refresh(new_message)

    if conversation.type == ConversationType.BOT:
        return await filobelo_bot.reply(conversation_id, workspace_id, db)

    return new_message


async def _get_cursor_message(message_id: int, conversation_id: int, db: DbSession) -> Message:
    # scoped to conversation_id (itself already scoped to the workspace) so a
    # cursor can never be used to position inside, or read from, another
    # conversation by guessing a message id
    result = await db.execute(
        select(Message).where(
            Message.id == message_id, Message.conversation_id == conversation_id
        )
    )
    message = result.scalars().first()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
        )
    return message


@router.get("/{conversation_id}/messages", response_model=PaginatedMessageResponse)
async def list_messages(
    conversation_id: int,
    workspace_id: int,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
    skip: Annotated[int | None, Query(ge=0)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    before_id: int | None = None,
    after_id: Annotated[int | None, Query(ge=0)] = None,
):
    """Messages are always returned in chronological order (created_at, id).

    - no cursor: the newest `limit` messages; has_more = older ones exist
    - before_id: the `limit` messages immediately older than that message;
      has_more = even older ones exist
    - after_id: the `limit` messages immediately newer than that message;
      has_more = even newer ones exist (used for polling). after_id=0 means
      "from the very first message", for a client that has none yet
    - skip: legacy offset paging from the oldest message
    """
    if sum(p is not None for p in (skip, before_id, after_id)) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use only one of skip, before_id or after_id",
        )

    conversation = await get_conversation_by_id(conversation_id, workspace_id, db)

    base = select(Message).where(Message.conversation_id == conversation_id)
    oldest_first = (Message.created_at.asc(), Message.id.asc())
    newest_first = (Message.created_at.desc(), Message.id.desc())

    if before_id is not None or after_id is not None:
        # Cursor reads (scrolling back, polling) do not count as opening the
        # conversation, so they stay read-only - no write per poll.
        if before_id is not None:
            cursor = await _get_cursor_message(before_id, conversation_id, db)
            query = base.where(
                or_(
                    Message.created_at < cursor.created_at,
                    and_(
                        Message.created_at == cursor.created_at,
                        Message.id < cursor.id,
                    ),
                )
            ).order_by(*newest_first)
        elif after_id == 0:
            query = base.order_by(*oldest_first)
        else:
            cursor = await _get_cursor_message(after_id, conversation_id, db)
            query = base.where(
                or_(
                    Message.created_at > cursor.created_at,
                    and_(
                        Message.created_at == cursor.created_at,
                        Message.id > cursor.id,
                    ),
                )
            ).order_by(*oldest_first)

        result = await db.execute(query.limit(limit + 1))
        messages = list(result.scalars().all())
        has_more = len(messages) > limit
        messages = messages[:limit]
        if before_id is not None:
            messages.reverse()
    else:
        conversation.last_opened_at = datetime.now(UTC)
        await db.commit()

        if skip is not None:
            result = await db.execute(
                base.order_by(*oldest_first).offset(skip).limit(limit)
            )
            messages = list(result.scalars().all())
            has_more = None  # derived from total below
        else:
            result = await db.execute(base.order_by(*newest_first).limit(limit + 1))
            messages = list(result.scalars().all())
            has_more = len(messages) > limit
            messages = messages[:limit]
            messages.reverse()

    result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = result.scalar() or 0
    if has_more is None:
        has_more = skip + limit < total

    # Reactions ride along on every message in the page, so the client never
    # has to ask for them separately.
    summaries = await summarize_reactions(
        MessageReaction, MessageReaction.message_id, [m.id for m in messages], member.user_id, db
    )

    return PaginatedMessageResponse(
        messages=[
            MessageResponse.model_validate(m).model_copy(
                update={"reactions": summaries.get(m.id, [])}
            )
            for m in messages
        ],
        total=total,
        skip=skip,
        limit=limit,
        has_more=has_more,
    )


@router.post(
    "/{conversation_id}/messages/{message_id}/reactions",
    response_model=list[ReactionSummary],
)
async def toggle_message_reaction(
    conversation_id: int,
    workspace_id: int,
    message_id: int,
    data: ReactionToggle,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    """Add the caller's reaction, or remove it if they already left it.

    Returns the message's full reaction list so the client can replace its
    chips in one go. Note that polling with after_id only returns *new*
    messages, so a reaction added to an older message reaches other viewers
    on their next full load, not through polling.
    """
    await get_conversation_by_id(conversation_id, workspace_id, db)
    message = await _get_cursor_message(message_id, conversation_id, db)

    await toggle_reaction(
        MessageReaction, MessageReaction.message_id, message.id, member.user_id, data.emoji, db
    )
    summaries = await summarize_reactions(
        MessageReaction, MessageReaction.message_id, [message.id], member.user_id, db
    )
    return summaries.get(message.id, [])


@router.delete(
    "/{conversation_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_message(
    conversation_id: int,
    workspace_id: int,
    message_id: int,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    await get_conversation_by_id(conversation_id, workspace_id, db)

    result = await db.execute(
        select(Message).where(
            Message.id == message_id, Message.conversation_id == conversation_id
        )
    )
    message = result.scalars().first()

    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
        )

    if message.sender_id != member.user_id and member.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the sender or an admin can delete this message",
        )

    await db.delete(message)
    await db.commit()
