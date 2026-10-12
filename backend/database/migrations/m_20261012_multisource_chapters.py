"""Migration: m_20261012_multisource_chapters.py
Description: Backfills manga_sources from existing mangas with mangadex_id,
ensures source-scoped identity and state='ready' on legacy chapters,
and initializes logical chapter_slots and multi-source indexes.
"""

import logging
import uuid
from datetime import datetime, timezone

from backend.database.connection import get_db
from backend.database.indexes import init_db_indexes
from backend.services.datasources.url_utils import normalize_chapter_candidate

logger = logging.getLogger(__name__)


async def upgrade() -> dict:
    """Applies migration (UP): backfills manga_sources and chapter_slots, sets state='ready'."""
    db = get_db()
    logger.info("Starting UP migration: multi-source schema evolution...")
    now = datetime.now(timezone.utc)
    report = {
        "manga_sources_created": 0,
        "chapters_migrated": 0,
        "slots_created": 0,
    }

    # 1. Backfill manga_sources from mangas with mangadex_id
    mangas_cursor = db.mangas.find({"mangadex_id": {"$exists": True, "$ne": None}})
    async for manga in mangas_cursor:
        m_id = str(manga["_id"])
        md_id = str(manga["mangadex_id"]).strip().lower()
        if not md_id:
            continue

        existing_source = await db.manga_sources.find_one({"source": "mangadex", "source_work_id": md_id})
        if not existing_source:
            await db.manga_sources.insert_one(
                {
                    "manga_id": m_id,
                    "source": "mangadex",
                    "source_work_id": md_id,
                    "canonical_url": f"https://mangadex.org/title/{md_id}",
                    "title": manga.get("title", ""),
                    "link_state": "verified",
                    "evidence": {"migrated_from": "mangas.mangadex_id"},
                    "numbering_scope_id": "scope_default",
                    "created_at": now,
                    "updated_at": now,
                }
            )
            report["manga_sources_created"] += 1

    # 2. Backfill chapters: ensure source, state='ready', schema_version, and slot binding
    chapters_cursor = db.chapters.find({})
    async for ch in chapters_cursor:
        ch_id = ch["_id"]
        update_fields = {}

        if "source" not in ch or not ch["source"]:
            update_fields["source"] = "mangadex" if ch.get("source_id") else "local_import"

        if "state" not in ch or not ch["state"]:
            update_fields["state"] = "ready"

        if "schema_version" not in ch:
            update_fields["schema_version"] = 2

        if "media_revision_id" not in ch or not ch["media_revision_id"]:
            update_fields["media_revision_id"] = str(uuid.uuid4())

        # Ensure slot exists
        m_id = str(ch.get("manga_id"))
        c_num = str(ch.get("chapter_number", "1"))
        lang = str(ch.get("language", "en")).lower()
        c_key, _, _ = normalize_chapter_candidate(c_num)

        slot_query = {
            "manga_id": m_id,
            "language": lang,
            "numbering_scope_id": "scope_default",
            "unit_kind": "chapter",
            "chapter_key": c_key,
        }
        slot = await db.chapter_slots.find_one(slot_query)
        if not slot:
            slot_doc = {
                "manga_id": m_id,
                "language": lang,
                "unit_kind": "chapter",
                "numbering_scope_id": "scope_default",
                "chapter_key": c_key,
                "chapter_display": c_num,
                "title": ch.get("title", ""),
                "volume": ch.get("volume"),
                "preferred_chapter_id": str(ch_id),
                "mapping_state": "verified",
                "is_excluded": False,
                "created_at": now,
                "updated_at": now,
            }
            res = await db.chapter_slots.insert_one(slot_doc)
            slot_id = str(res.inserted_id)
            report["slots_created"] += 1
        else:
            slot_id = str(slot["_id"])
            if not slot.get("preferred_chapter_id"):
                await db.chapter_slots.update_one(
                    {"_id": slot["_id"]},
                    {"$set": {"preferred_chapter_id": str(ch_id), "updated_at": now}},
                )

        if "logical_chapter_id" not in ch or ch.get("logical_chapter_id") != slot_id:
            update_fields["logical_chapter_id"] = slot_id

        if update_fields:
            await db.chapters.update_one({"_id": ch_id}, {"$set": update_fields})
            report["chapters_migrated"] += 1

    # 3. Create all updated database indexes
    await init_db_indexes()

    logger.info(f"UP migration finished: {report}")
    return report


async def downgrade() -> None:
    """Rolls back migration (DOWN): cleans up logical_chapter_id and slot structures."""
    db = get_db()
    logger.info("Starting DOWN rollback for multi-source schema...")
    await db.chapters.update_many(
        {"logical_chapter_id": {"$exists": True}},
        {"$unset": {"logical_chapter_id": "", "media_revision_id": ""}},
    )
    await db.chapter_slots.delete_many({})
    await db.manga_sources.delete_many({"evidence.migrated_from": "mangas.mangadex_id"})
    logger.info("DOWN rollback finished.")
