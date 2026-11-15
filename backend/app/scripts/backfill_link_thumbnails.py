import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal, engine
from app.models import Resource, ResourceType
from app.utils import fetch_oembed_thumbnail


async def backfill():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Resource).where(
                Resource.type == ResourceType.LINK,
                Resource.thumbnail_url.is_(None),
            )
        )
        links = result.scalars().all()

        updated = 0
        for link in links:
            thumbnail = await fetch_oembed_thumbnail(link.url)
            if thumbnail:
                link.thumbnail_url = thumbnail
                updated += 1

        await db.commit()
        print(f"Checked {len(links)} link(s) without a thumbnail, filled in {updated}.")


async def main():
    await backfill()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
