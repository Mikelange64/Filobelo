from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select

from app.auth import CurrentUser
from app.bot_service import filobelo_bot
from app.database import DbSession
from app.dependencies import require_membership
from app.models import (
    Conversation,
    ConversationType,
    Message,
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
)
from app.utils import get_conversation_by_id

router = APIRouter(prefix="/{workspace_id}/conversations", tags=["conversations"])

# Not workspace-scoped like the router above - aggregates across every
# workspace the user belongs to, for the Home page conversations widget.
recent_router = APIRouter(prefix="/conversations", tags=["conversations"])


@recent_router.get("/recent", response_model=list[ConversationWithWorkspace])
def list_recent_conversations(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = 4,
):
    member_workspace_ids = select(WorkspaceMember.workspace_id).where(
        WorkspaceMember.user_id == current_user.id
    )
    rows = db.execute(
        select(Conversation, Workspace.title)
        .join(Workspace, Workspace.id == Conversation.workspace_id)
        .where(Conversation.workspace_id.in_(member_workspace_ids))
        .order_by(
            func.coalesce(Conversation.last_message_at, Conversation.created_at).desc()
        )
        .limit(limit)
    ).all()

    return [
        ConversationWithWorkspace(
            **ConversationResponse.model_validate(conversation).model_dump(),
            workspace_title=title,
        )
        for conversation, title in rows
    ]


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
def create_conversation(
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
    db.commit()
    db.refresh(new_conversation)
    return new_conversation


@router.get(
    "/",
    response_model=list[ConversationResponse],
    dependencies=[Depends(require_membership)],
)
def list_conversations(workspace_id: int, db: DbSession):
    return (
        db.execute(
            select(Conversation)
            .where(Conversation.workspace_id == workspace_id)
            .order_by(
                Conversation.is_pinned.desc(),
                func.coalesce(
                    Conversation.last_message_at, Conversation.created_at
                ).desc(),
            )
        )
        .scalars()
        .all()
    )


@router.get(
    "/{conversation_id}",
    response_model=ConversationResponse,
    dependencies=[Depends(require_membership)],
)
def get_conversation(conversation_id: int, workspace_id: int, db: DbSession):
    return get_conversation_by_id(conversation_id, workspace_id, db)


@router.patch("/{conversation_id}", response_model=ConversationResponse)
def update_conversation(
    conversation_id: int,
    workspace_id: int,
    data: ConversationUpdate,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    conversation = get_conversation_by_id(conversation_id, workspace_id, db)
    _require_creator_or_admin(conversation, member)

    update = data.model_dump(exclude_unset=True)
    for field, value in update.items():
        setattr(conversation, field, value)

    db.commit()
    db.refresh(conversation)
    return conversation


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: int,
    workspace_id: int,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    conversation = get_conversation_by_id(conversation_id, workspace_id, db)
    _require_creator_or_admin(conversation, member)

    db.delete(conversation)
    db.commit()


# =============================================== MESSAGES ===================================================


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def send_message(
    conversation_id: int,
    workspace_id: int,
    data: MessageCreate,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
    current_user: CurrentUser,
):
    conversation = get_conversation_by_id(conversation_id, workspace_id, db)

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
    db.commit()
    db.refresh(new_message)

    if conversation.type == ConversationType.BOT:
        return filobelo_bot.reply(conversation_id, workspace_id, db)

    return new_message


def _get_cursor_message(message_id: int, conversation_id: int, db: DbSession) -> Message:
    # scoped to conversation_id (itself already scoped to the workspace) so a
    # cursor can never be used to position inside, or read from, another
    # conversation by guessing a message id
    message = (
        db.execute(
            select(Message).where(
                Message.id == message_id, Message.conversation_id == conversation_id
            )
        )
        .scalars()
        .first()
    )
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
        )
    return message


@router.get(
    "/{conversation_id}/messages",
    response_model=PaginatedMessageResponse,
    dependencies=[Depends(require_membership)],
)
def list_messages(
    conversation_id: int,
    workspace_id: int,
    db: DbSession,
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

    conversation = get_conversation_by_id(conversation_id, workspace_id, db)

    base = select(Message).where(Message.conversation_id == conversation_id)
    oldest_first = (Message.created_at.asc(), Message.id.asc())
    newest_first = (Message.created_at.desc(), Message.id.desc())

    if before_id is not None or after_id is not None:
        # Cursor reads (scrolling back, polling) do not count as opening the
        # conversation, so they stay read-only - no write per poll.
        if before_id is not None:
            cursor = _get_cursor_message(before_id, conversation_id, db)
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
            cursor = _get_cursor_message(after_id, conversation_id, db)
            query = base.where(
                or_(
                    Message.created_at > cursor.created_at,
                    and_(
                        Message.created_at == cursor.created_at,
                        Message.id > cursor.id,
                    ),
                )
            ).order_by(*oldest_first)

        messages = list(db.execute(query.limit(limit + 1)).scalars().all())
        has_more = len(messages) > limit
        messages = messages[:limit]
        if before_id is not None:
            messages.reverse()
    else:
        conversation.last_opened_at = datetime.now(UTC)
        db.commit()

        if skip is not None:
            messages = list(
                db.execute(base.order_by(*oldest_first).offset(skip).limit(limit))
                .scalars()
                .all()
            )
            has_more = None  # derived from total below
        else:
            messages = list(
                db.execute(base.order_by(*newest_first).limit(limit + 1))
                .scalars()
                .all()
            )
            has_more = len(messages) > limit
            messages = messages[:limit]
            messages.reverse()

    total = db.execute(select(func.count()).select_from(base.subquery())).scalar() or 0
    if has_more is None:
        has_more = skip + limit < total

    return PaginatedMessageResponse(
        messages=messages,
        total=total,
        skip=skip,
        limit=limit,
        has_more=has_more,
    )


@router.delete(
    "/{conversation_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_message(
    conversation_id: int,
    workspace_id: int,
    message_id: int,
    db: DbSession,
    member: Annotated[WorkspaceMember, Depends(require_membership)],
):
    get_conversation_by_id(conversation_id, workspace_id, db)

    message = (
        db.execute(
            select(Message).where(
                Message.id == message_id, Message.conversation_id == conversation_id
            )
        )
        .scalars()
        .first()
    )

    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
        )

    if message.sender_id != member.user_id and member.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the sender or an admin can delete this message",
        )

    db.delete(message)
    db.commit()
