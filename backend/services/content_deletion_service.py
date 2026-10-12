"""Dependency cleanup for source content. Parent records are the retry anchors.

These operations are idempotent, but not a transaction across MongoDB and S3.
Concurrent import/scanner writes still require a durable deletion fence.
"""

from datetime import datetime, timezone


class DeletionBusyError(RuntimeError):
    """A dependent task must finish cancelling before its source can be removed."""


class DeletionStorageError(RuntimeError):
    """Storage did not confirm removal; retained metadata allows a later retry."""


async def source_object_is_shared(db, key: str, *, chapter_id=None, manga_id=None) -> bool:
    """Exclude only the owner being deleted, not other owners in the same manga."""
    chapters = {"pages.object_key": key}
    mangas = {"minio_cover_key": key}
    covers = {"minio_key": key}
    if chapter_id is not None:
        chapters["_id"] = {"$ne": chapter_id}
    if manga_id is not None:
        mangas["_id"] = {"$ne": manga_id}
        covers["manga_id"] = {"$ne": str(manga_id)}
    for collection, query in ((db.chapters, chapters), (db.mangas, mangas), (db.cover_arts, covers)):
        if await collection.find_one(query, {"_id": 1}):
            return True
    return False


async def cancel_source_jobs(db, source: dict) -> None:
    """Cancel waiting jobs; keep history/results and refuse deletion during execution."""
    query = {
        "scope": "local",
        "state": {"$in": ["queued", "running"]},
        **{f"source_manifest.{key}": value for key, value in source.items()},
    }
    async for job in db.translation_jobs.find(query):
        job_id = job["job_id"]
        await db.translation_jobs.update_many(
            {"job_id": job_id},
            {"$set": {"cancel_requested": True, "updated_at": datetime.now(timezone.utc)}},
        )
        await db.translation_job_pages.update_many(
            {"job_id": job_id, "state": {"$in": ["queued", "preparing"]}},
            {"$set": {"state": "cancelled", "stage": None}},
        )
        if await db.translation_job_pages.find_one({"job_id": job_id, "state": "running"}):
            raise DeletionBusyError("Đã yêu cầu dừng tác vụ dịch; hãy chờ tác vụ dừng rồi thử xóa lại.")
        await db.translation_jobs.update_many(
            {"job_id": job_id, "state": {"$in": ["queued", "running"]}},
            {"$set": {"state": "cancelled"}},
        )


async def delete_vision_metadata(db, query: dict) -> None:
    # Remove children first. If any deletion fails, their analysis IDs remain discoverable.
    async for analysis in db.vision_page_analyses.find(query, {"_id": 1}):
        analysis_id = analysis["_id"]
        await db.vision_regions.delete_many({"page_analysis_id": {"$in": [analysis_id, str(analysis_id)]}})
    await db.vision_page_analyses.delete_many(query)
    await db.manga_panels.delete_many(query)
    await db.panel_scan_pages.delete_many(query)


async def delete_chapter_dependencies(db, chapter_id: str) -> None:
    await delete_vision_metadata(db, {"chapter_id": chapter_id})
    # Results/assets are retained as job history; only publication links are removed.
    await db.translation_page_bindings.delete_many({"scope": "local", "chapter_id": chapter_id})
