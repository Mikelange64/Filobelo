from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import InstrumentedAttribute

from app.database import DbSession
from app.models.reactions import CommentReaction, MessageReaction
from app.schemas.reactions import ReactionSummary

# Both reaction tables share the same shape, so one pair of helpers serves
# comments and messages.
ReactionModel = type[CommentReaction] | type[MessageReaction]
# The column pointing at the thing reacted to: CommentReaction.comment_id or
# MessageReaction.message_id. Accessed on the class, so it is an
# InstrumentedAttribute, not a plain int.
ReactionTarget = InstrumentedAttribute[int]


async def summarize_reactions(
    model: ReactionModel, fk: ReactionTarget, target_ids: list[int], user_id: int, db: DbSession
) -> dict[int, list[ReactionSummary]]:
    """{target_id: [ReactionSummary, ...]} for every target that has reactions.

    One query for the whole page of targets. Emojis are ordered by who got
    there first, so the chips don't reshuffle as counts change.
    """
    if not target_ids:
        return {}

    result = await db.execute(
        select(fk, model.emoji, model.user_id)
        .where(fk.in_(target_ids))
        .order_by(model.id)
    )

    grouped: dict[int, dict[str, list[int]]] = {}
    for target_id, emoji, reactor_id in result.all():
        grouped.setdefault(target_id, {}).setdefault(emoji, []).append(reactor_id)

    return {
        target_id: [
            ReactionSummary(emoji=emoji, count=len(users), reacted_by_me=user_id in users)
            for emoji, users in emojis.items()
        ]
        for target_id, emojis in grouped.items()
    }


async def toggle_reaction(
    model: ReactionModel, fk: ReactionTarget, target_id: int, user_id: int, emoji: str, db: DbSession
) -> None:
    """Add the user's reaction, or remove it if they already left it."""
    result = await db.execute(
        select(model).where(fk == target_id, model.user_id == user_id, model.emoji == emoji)
    )
    existing = result.scalars().first()

    if existing:
        await db.delete(existing)
        await db.commit()
        return

    db.add(model(**{fk.key: target_id}, user_id=user_id, emoji=emoji))
    try:
        await db.commit()
    except IntegrityError:
        # A double-click raced us and the unique constraint caught it. The
        # reaction exists either way, which is what the user asked for.
        await db.rollback()
