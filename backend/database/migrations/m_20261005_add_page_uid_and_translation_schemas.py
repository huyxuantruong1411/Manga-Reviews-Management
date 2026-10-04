"""Migration: m_20261005_add_page_uid_and_translation_schemas.py
Description: Backfills missing page_uid on chapter pages, sets pages_revision=1,
and initializes Translation Studio collection indexes.
"""

import logging
import uuid

from backend.database.connection import get_db
from backend.database.indexes import init_db_indexes

logger = logging.getLogger(__name__)


async def upgrade() -> int:
    """Applies migration (UP): assigns page_uid to all pages and initializes translation indexes."""
    db = get_db()
    logger.info("Starting UP migration: backfilling page_uid and pages_revision...")
    cursor = db.chapters.find(
        {
            "$or": [
                {"pages_revision": {"$exists": False}},
                {"pages.page_uid": {"$exists": False}},
            ]
        }
    )

    migrated_count = 0
    async for chapter in cursor:
        ch_id = chapter["_id"]
        pages = chapter.get("pages", [])
        modified = False

        for page in pages:
            if not page.get("page_uid"):
                page["page_uid"] = str(uuid.uuid4())
                modified = True

        update_fields = {}
        if modified:
            update_fields["pages"] = pages
        if "pages_revision" not in chapter:
            update_fields["pages_revision"] = 1

        if update_fields:
            await db.chapters.update_one({"_id": ch_id}, {"$set": update_fields})
            migrated_count += 1

    logger.info(f"UP migration finished: updated {migrated_count} chapter(s).")
    await init_db_indexes()
    return migrated_count


async def downgrade() -> None:
    """Rolls back migration (DOWN): non-destructive downgrade preserving generated translations."""
    db = get_db()
    logger.info("Starting DOWN rollback for translation schemas...")
    await db.chapters.update_many(
        {"pages_revision": {"$exists": True}},
        {"$unset": {"pages_revision": ""}},
    )
    logger.info("DOWN rollback finished: removed pages_revision. Preserved page_uid for data safety.")
