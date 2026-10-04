import logging
from datetime import datetime

from backend.database.connection import get_db

logger = logging.getLogger(__name__)


async def backfill_manga_status_timestamps():
    logger.info("Checking and backfilling missing manga read status timestamps...")
    db = get_db()
    try:
        # Find mangas that are missing any of the timestamp fields
        cursor = db.mangas.find(
            {
                "$or": [
                    {"unread_at": {"$exists": False}},
                    {"reading_at": {"$exists": False}},
                    {"completed_at": {"$exists": False}},
                    {"dropped_at": {"$exists": False}},
                    {"on_hold_at": {"$exists": False}},
                    {"plan_to_read_at": {"$exists": False}},
                    {"re_reading_at": {"$exists": False}},
                ]
            }
        )

        count = 0
        async for manga in cursor:
            manga_id_str = str(manga["_id"])
            # Fetch audit logs for this manga
            logs_cursor = db.audit_logs.find({"entity_type": "manga", "entity_id": manga_id_str}).sort("timestamp", 1)

            timestamps = {
                "unread_at": None,
                "reading_at": None,
                "completed_at": None,
                "dropped_at": None,
                "on_hold_at": None,
                "plan_to_read_at": None,
                "re_reading_at": None,
            }

            async for log in logs_cursor:
                action = log.get("action")
                timestamp = log.get("timestamp")
                if action == "create":
                    init_status = manga.get("read_status", "unread")
                    init_status_clean = init_status.lower()
                    if init_status_clean.startswith("readstatus."):
                        init_status_clean = init_status_clean.split(".", 1)[1]

                    key = f"{init_status_clean}_at"
                    if key in timestamps:
                        timestamps[key] = timestamp
                elif action == "update_status" and log.get("field") == "read_status":
                    new_val = log.get("new_value")
                    if new_val:
                        new_val_clean = new_val.lower()
                        if new_val_clean.startswith("readstatus."):
                            new_val_clean = new_val_clean.split(".", 1)[1]

                        key = f"{new_val_clean}_at"
                        if key in timestamps:
                            timestamps[key] = timestamp

            # Fallback for current status if it's still None
            current_status = manga.get("read_status", "unread")
            current_status_clean = current_status.lower()
            if current_status_clean.startswith("readstatus."):
                current_status_clean = current_status_clean.split(".", 1)[1]

            current_key = f"{current_status_clean}_at"
            if timestamps[current_key] is None:
                timestamps[current_key] = manga.get("added_at") or manga.get("updated_at") or datetime.utcnow()

            await db.mangas.update_one({"_id": manga["_id"]}, {"$set": timestamps})
            count += 1

        if count > 0:
            logger.info(f"Backfilled read status timestamps for {count} manga documents.")
    except Exception as e:
        logger.error(f"Error backfilling manga status timestamps: {e}")


async def init_db_indexes():
    logger.info("Initializing database indexes...")
    db = get_db()
    try:
        # mangas
        await db.mangas.create_index("mangadex_id", sparse=True)
        await db.mangas.create_index("read_status")
        await db.mangas.create_index("tag_ids")
        await db.mangas.create_index("added_at")
        await db.mangas.create_index("personal_rating", sparse=True)
        await db.mangas.create_index("unread_at", sparse=True)
        await db.mangas.create_index("reading_at", sparse=True)
        await db.mangas.create_index("completed_at", sparse=True)
        await db.mangas.create_index("dropped_at", sparse=True)
        await db.mangas.create_index("on_hold_at", sparse=True)
        await db.mangas.create_index("plan_to_read_at", sparse=True)
        await db.mangas.create_index("re_reading_at", sparse=True)
        await db.mangas.create_index("updated_at")

        # reviews
        await db.reviews.create_index("manga_id")
        await db.reviews.create_index("created_at")
        await db.reviews.create_index([("is_deleted", 1), ("created_at", -1)])

        # audit_logs
        await db.audit_logs.create_index([("entity_id", 1), ("timestamp", -1)])
        await db.audit_logs.create_index([("timestamp", -1)])
        await db.audit_logs.create_index([("entity_type", 1), ("timestamp", -1)])
        await db.audit_logs.create_index([("action", 1), ("timestamp", -1)])
        await db.audit_logs.create_index([("actor", 1), ("timestamp", -1)])

        # tags
        await db.tags.create_index("mangadex_id", sparse=True)
        await db.tags.create_index("source")

        # creators
        await db.creators.create_index("mangadex_id", sparse=True)
        await db.creators.create_index("name")

        # cover_arts
        await db.cover_arts.create_index([("manga_id", 1), ("mangadex_cover_id", 1)])
        await db.cover_arts.create_index("mangadex_manga_id")

        # manga_recommendations
        await db.manga_recommendations.create_index("manga_id", unique=True)
        await db.manga_recommendations.create_index("expires_at")

        # sync_configs
        await db.sync_configs.create_index("enabled")

        # sync_logs
        await db.sync_logs.create_index([("manga_id", 1), ("started_at", -1)])
        await db.sync_logs.create_index("sync_config_id")

        # sync_runs
        await db.sync_runs.create_index([("started_at", -1)])

        # chapters
        await db.chapters.create_index([("manga_id", 1), ("chapter_numeric", 1)])
        await db.chapters.create_index([("manga_id", 1), ("chapter_number", 1)])
        await db.chapters.create_index([("manga_id", 1), ("language", 1)])
        await db.chapters.create_index("created_at")

        # reading_progress
        await db.reading_progress.create_index("manga_id", unique=True)

        # manga_panels
        await db.manga_panels.create_index([("manga_id", 1), ("chapter_id", 1), ("page_number", 1)])
        await db.manga_panels.create_index([("chapter_id", 1)])
        await db.manga_panels.create_index([("manga_id", 1)])
        await db.manga_panels.create_index([("language", 1)])
        await db.manga_panels.create_index([("scan_mode", 1)])
        await db.manga_panels.create_index([("lemmas", 1)])

        # vision_page_analyses (Vision Pipeline V3)
        await db.vision_page_analyses.create_index([("manga_id", 1), ("chapter_id", 1), ("page_number", 1)])
        await db.vision_page_analyses.create_index([("chapter_id", 1)])
        await db.vision_page_analyses.create_index([("page_hash", 1)])
        await db.vision_page_analyses.create_index([("created_at", -1)])

        # vision_regions (Vision Pipeline V3)
        await db.vision_regions.create_index([("page_analysis_id", 1), ("region_type", 1)])
        await db.vision_regions.create_index([("panel_region_id", 1)])
        await db.vision_regions.create_index([("balloon_region_id", 1)])
        await db.vision_regions.create_index([("tokens.lemma", 1)])

        # translation_profiles
        await db.translation_profiles.create_index([("scope", 1), ("profile_id", 1)], unique=True)
        await db.translation_profiles.create_index([("scope", 1), ("created_at", -1)])

        # translation_profile_revisions
        await db.translation_profile_revisions.create_index(
            [("scope", 1), ("profile_id", 1), ("revision", 1)], unique=True
        )
        await db.translation_profile_revisions.create_index([("scope", 1), ("config_hash", 1)])

        # translation_providers
        await db.translation_providers.create_index("provider_id", unique=True)

        # translation_assets
        await db.translation_assets.create_index("asset_id", unique=True)
        await db.translation_assets.create_index([("scope", 1), ("kind", 1), ("state", 1), ("created_at", -1)])
        await db.translation_assets.create_index([("scope", 1), ("sha256", 1)])

        # translation_font_packs
        await db.translation_font_packs.create_index([("scope", 1), ("font_pack_id", 1), ("revision", 1)], unique=True)

        # translation_jobs
        await db.translation_jobs.create_index("job_id", unique=True)
        await db.translation_jobs.create_index([("scope", 1), ("created_at", -1)])
        await db.translation_jobs.create_index([("state", 1), ("created_at", 1)])

        # translation_job_pages
        await db.translation_job_pages.create_index([("job_id", 1), ("page_identity", 1)], unique=True)
        await db.translation_job_pages.create_index([("job_id", 1), ("ordinal", 1)])
        await db.translation_job_pages.create_index([("state", 1), ("lease_until", 1)])

        # translation_results
        await db.translation_results.create_index([("scope", 1), ("fingerprint", 1)], unique=True)
        await db.translation_results.create_index(
            [("scope", 1), ("chapter_id", 1), ("page_uid", 1), ("target_language", 1)]
        )

        # translation_page_bindings
        await db.translation_page_bindings.create_index(
            [("scope", 1), ("chapter_id", 1), ("page_uid", 1), ("target_language", 1)], unique=True
        )

        # Run backfill
        await backfill_manga_status_timestamps()

        logger.info("Database indexes initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing indexes: {e}")
