import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal, engine
from app.models import User


async def promote_user(username: str):
    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.username == username)
        result = await db.execute(stmt)
        user = result.scalars().first()

        if not user:
            print(f"User '{username}' not found.")
            return

        user.is_premium = True
        await db.commit()
        print(f"Success! {username} is now premium.")


async def main(username: str):
    await promote_user(username)
    await engine.dispose()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        asyncio.run(main(sys.argv[1]))
    else:
        print("Usage: python make_premium.py <username>")
