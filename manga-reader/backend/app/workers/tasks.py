"""Background Worker Tasks for Recommendation Matrix Recomputation & Data Lake Pool ETL."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.redis import redis_delete_prefix
from app.models import Manga, MangaVisibilityStatus
from app.workers.recsys_engine import (
    get_content_based_recommendations,
    get_item_based_recommendations,
    update_manga_content_vector,
)

logger = logging.getLogger(__name__)


async def recompute_all_recommendations_task(top_k: int = 12) -> dict[str, Any]:
    """Recompute Content-Based TF-IDF Cosine and Item-Based Adjusted Cosine matrices and flush RecSys caches."""
    async with AsyncSessionLocal() as db:
        mangas = (
            (await db.execute(select(Manga).where(Manga.visibility_status == MangaVisibilityStatus.public)))
            .scalars()
            .all()
        )
        for m in mangas:
            cache_row = await update_manga_content_vector(db, m)
            cb = await get_content_based_recommendations(db, m, limit=top_k)
            ib = await get_item_based_recommendations(db, m, limit=top_k)
            cache_row.content_based_ids = cb.get("items", [])
            cache_row.item_based_ids = ib.get("items", [])
        await db.commit()
        processed_count = len(mangas)

    await redis_delete_prefix("recsys:")
    logger.info("Recomputed recommendations for %d mangas", processed_count)
    return {"status": "completed", "processed_mangas": processed_count}
