import logging
from datetime import datetime

from backend.database.connection import get_db

logger = logging.getLogger(__name__)

# Existing fields used by deletion ownership and dependency lookups.
DELETION_REFERENCE_INDEXES = (
    ("chapters", "pages.object_key", "deletion_page_object_key"),
    ("mangas", "minio_cover_key", "deletion_manga_cover_key"),
    ("cover_arts", "minio_key", "deletion_cover_art_key"),
    ("panel_scan_pages", "chapter_id", "deletion_scan_chapter"),
    ("panel_scan_pages", "manga_id", "deletion_scan_manga"),
    ("translation_jobs", "source_manifest.chapter_id", "deletion_job_chapter"),
    ("translation_jobs", "source_manifest.manga_id", "deletion_job_manga"),
)


async def ensure_deletion_reference_indexes(db):
    for collection, field, name in DELETION_REFERENCE_INDEXES:
        await db[collection].create_index(field, name=name)


async def backfill_manga_status_timestamps(dry_run: bool = True) -> dict:
    logger.info(f"Checking manga read status timestamps (dry_run={dry_run})...")
    db = get_db()
    report = {
        "dry_run": dry_run,
        "total_candidates": 0,
        "applied": 0,
        "conflicts": [],
        "changes": [],
    }
    valid_statuses = {"unread", "reading", "completed", "dropped", "on_hold", "plan_to_read", "re_reading"}
    try:
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

        async for manga in cursor:
            report["total_candidates"] += 1
            manga_id_str = str(manga["_id"])
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
                if not isinstance(timestamp, datetime):
                    continue

                if action == "create":
                    init_status = manga.get("read_status", "unread")
                    if isinstance(init_status, str):
                        init_status_clean = init_status.lower()
                        if init_status_clean.startswith("readstatus."):
                            init_status_clean = init_status_clean.split(".", 1)[1]
                        if init_status_clean == "unread":
                            timestamps["unread_at"] = timestamp
                elif action == "update_status" and log.get("field") == "read_status":
                    new_val = log.get("new_value")
                    if isinstance(new_val, str):
                        new_val_clean = new_val.lower()
                        if new_val_clean.startswith("readstatus."):
                            new_val_clean = new_val_clean.split(".", 1)[1]
                        if new_val_clean in valid_statuses:
                            key = f"{new_val_clean}_at"
                            if key in timestamps:
                                timestamps[key] = timestamp

            report["changes"].append(
                {
                    "manga_id": manga_id_str,
                    "fields": timestamps,
                }
            )

            fields_to_set = {k: v for k, v in timestamps.items() if manga.get(k) is None}

            if not dry_run and fields_to_set:
                query = {"_id": manga["_id"]}
                if "read_status" in manga:
                    query["read_status"] = manga["read_status"]
                if "updated_at" in manga:
                    query["updated_at"] = manga["updated_at"]
                else:
                    query["updated_at"] = {"$exists": False}

                for field in fields_to_set:
                    query[field] = {"$exists": False}

                res = await db.mangas.update_one(query, {"$set": fields_to_set})
                if getattr(res, "matched_count", 0) > 0:
                    report["applied"] += 1
                else:
                    report["conflicts"].append(manga_id_str)

        return report
    except Exception as e:
        logger.error(f"Error backfilling manga status timestamps: {e}")
        return report


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

        await ensure_deletion_reference_indexes(db)

        logger.info("Database indexes initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing indexes: {e}")
