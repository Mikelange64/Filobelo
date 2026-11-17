from typing import Literal, get_args

from pydantic import BaseModel

# A fixed set keeps validation trivial and rendering consistent. The frontend
# hardcodes the same list for its picker. Emoji is stored as a plain string,
# so changing the set needs no migration; reactions already stored with an
# emoji that was later removed are still returned.
#
# A Literal rather than a field_validator that raises ValueError: the app's
# validation-error handler can't serialize the exception that ends up in the
# error's ctx, so a custom validator turns a 422 into a 500.
ReactionEmoji = Literal["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏", "👀"]
ALLOWED_REACTIONS: tuple[str, ...] = get_args(ReactionEmoji)


class ReactionToggle(BaseModel):
    emoji: ReactionEmoji


class ReactionSummary(BaseModel):
    emoji:         str
    count:         int
    reacted_by_me: bool
