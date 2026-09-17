import logging
import asyncio
from datetime import datetime
from bson import ObjectId
from typing import List, Dict, Any, Optional
from backend.database.connection import get_db
from backend.services.manga_service import manga_service, serialize_doc
from backend.services.cover_art_service import cover_art_service
from backend.services.recommendation_service import recommendation_service
from backend.services.minio_service import minio_service

logger = logging.getLogger(__name__)

def build_filter_query(filters: Dict[str, Any]) -> Dict[str, Any]:
    """
    Constructs a MongoDB query from sync pool filters.
    """
    query = {}
    clauses = []
    
    # Only sync mangas that actually have a MangaDex ID!
    clauses.append({"mangadex_id": {"$ne": None}})
    
    if filters.get("read_statuses"):
        clauses.append({"read_status": {"$in": filters["read_statuses"]}})
    if filters.get("exclude_read_statuses"):
        clauses.append({"read_status": {"$nin": filters["exclude_read_statuses"]}})
        
    if filters.get("publish_statuses"):
        clauses.append({"status": {"$in": filters["publish_statuses"]}})
        
    if filters.get("content_ratings"):
        clauses.append({"content_rating": {"$in": filters["content_ratings"]}})
        
    if filters.get("demographics"):
        clauses.append({"publication_demographic": {"$in": filters["demographics"]}})
        
    tag_clause = {}
    if filters.get("tags"):
        tag_clause["$all"] = filters["tags"]
    if filters.get("exclude_tags"):
        tag_clause["$nin"] = filters["exclude_tags"]
    if tag_clause:
        clauses.append({"tag_ids": tag_clause})
        
    if filters.get("original_languages"):
        clauses.append({"original_language": {"$in": filters["original_languages"]}})
        
    if clauses:
        if len(clauses) == 1:
            query = clauses[0]
        else:
            query = {"$and": clauses}
    return query

class SyncManagerService:
    def __init__(self):
        self.active_tasks = {}

    async def get_sync_pools(self) -> List[Dict[str, Any]]:
        db = get_db()
        cursor = db.sync_configs.find({})
        pools = []
        async for doc in cursor:
            pools.append(serialize_doc(doc))
        return pools

    async def create_sync_pool(self, pool_config: Dict[str, Any]) -> Dict[str, Any]:
        db = get_db()
        doc = {
            "name": pool_config["name"],
            "description": pool_config.get("description"),
            "enabled": pool_config.get("enabled", True),
            "filters": pool_config.get("filters", {}),
            "sync_options": pool_config.get("sync_options", {
                "sync_metadata": True,
                "sync_covers": False,
                "sync_recommendations": False,
                "sync_trackers": False
            }),

            "schedule": pool_config.get("schedule", {
                "type": "manual",
                "interval_hours": None
            }),
            "last_synced_at": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        res = await db.sync_configs.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return doc

    async def update_sync_pool(self, pool_id: str, pool_config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not ObjectId.is_valid(pool_id):
            return None
        db = get_db()
        update_doc = {
            "name": pool_config["name"],
            "description": pool_config.get("description"),
            "enabled": pool_config.get("enabled", True),
            "filters": pool_config.get("filters", {}),
            "sync_options": pool_config.get("sync_options", {}),
            "schedule": pool_config.get("schedule", {}),
            "updated_at": datetime.utcnow()
        }
        await db.sync_configs.update_one({"_id": ObjectId(pool_id)}, {"$set": update_doc})
        updated = await db.sync_configs.find_one({"_id": ObjectId(pool_id)})
        return serialize_doc(updated)

    async def delete_sync_pool(self, pool_id: str) -> bool:
        if not ObjectId.is_valid(pool_id):
            return False
        db = get_db()
        res = await db.sync_configs.delete_one({"_id": ObjectId(pool_id)})
        return res.deleted_count > 0

    async def preview_sync_pool(self, pool_id: str) -> List[Dict[str, Any]]:
        if not ObjectId.is_valid(pool_id):
            return []
        db = get_db()
        pool = await db.sync_configs.find_one({"_id": ObjectId(pool_id)})
        if not pool:
            return []
        
        query = build_filter_query(pool.get("filters", {}))
        cursor = db.mangas.find(query, {"_id": 1, "title": 1, "status": 1, "read_status": 1, "minio_cover_key": 1, "mangadex_id": 1})
        mangas = []
        async for doc in cursor:
            serialized = serialize_doc(doc)
            cover_key = doc.get("minio_cover_key")
            serialized["cover_url"] = minio_service.get_presigned_url(cover_key) if cover_key else None
            mangas.append(serialized)
        return mangas

    async def get_mangas_by_filters(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        db = get_db()
        query = build_filter_query(filters)
        cursor = db.mangas.find(query, {"_id": 1, "title": 1, "mangadex_id": 1})
        mangas = []
        async for doc in cursor:
            mangas.append(serialize_doc(doc))
        return mangas

    async def execute_single_sync(self, manga_id: str, options: Dict[str, bool], sync_config_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute sync for a single manga and log results.
        Runs synchronously.
        """
        db = get_db()
        if not ObjectId.is_valid(manga_id):
            return {"status": "failed", "errors": ["Invalid manga ID"]}

        manga = await db.mangas.find_one({"_id": ObjectId(manga_id)})
        if not manga:
            return {"status": "failed", "errors": ["Manga not found"]}

        mangadex_id = manga.get("mangadex_id")
        if not mangadex_id:
            return {"status": "failed", "errors": ["Manga has no MangaDex ID"]}

        # Create running log entry
        log_id = ObjectId()
        log_doc = {
            "_id": log_id,
            "sync_config_id": sync_config_id,
            "manga_id": manga_id,
            "mangadex_id": mangadex_id,
            "manga_title": manga.get("title", "Unknown"),
            "operation": "full" if all(options.values()) else ", ".join([k.replace("sync_", "") for k, v in options.items() if v]),
            "status": "running",
            "details": {
                "covers_synced": 0,
                "covers_failed": 0,
                "recommendations_found": 0,
                "errors": []
            },
            "started_at": datetime.utcnow(),
            "completed_at": None
        }
        await db.sync_logs.insert_one(log_doc)

        covers_synced = 0
        covers_failed = 0
        recs_found = 0
        errors = []

        try:
            # 1. Sync metadata
            if options.get("sync_metadata"):
                try:
                    await manga_service.sync_manga_metadata(manga_id)
                except Exception as e:
                    logger.error(f"Metadata sync failed for {manga_id}: {e}")
                    errors.append(f"Metadata: {str(e)}")

            # 2. Sync covers
            if options.get("sync_covers"):
                try:
                    res = await cover_art_service.sync_covers_for_manga(manga_id)
                    covers_synced = res.get("covers_synced", 0)
                    covers_failed = res.get("covers_failed", 0)
                    errors.extend(res.get("errors", []))
                except Exception as e:
                    logger.error(f"Covers sync failed for {manga_id}: {e}")
                    errors.append(f"Covers: {str(e)}")

            # 3. Sync recommendations
            if options.get("sync_recommendations"):
                try:
                    res = await recommendation_service.sync_recommendations(manga_id)
                    recs_found = res.get("recommendations_synced", 0)
                except Exception as e:
                    logger.error(f"Recommendations sync failed for {manga_id}: {e}")
                    errors.append(f"Recommendations: {str(e)}")

            # 4. Sync tracker metadata (AniList & MAL)
            if options.get("sync_trackers"):
                try:
                    await manga_service.enrich_manga_tracker_metadata(manga_id, force_refresh=True)
                except Exception as e:
                    logger.error(f"Tracker metadata sync failed for {manga_id}: {e}")
                    errors.append(f"Trackers: {str(e)}")


            status = "completed" if not errors else "failed"
            # If some items succeeded but others failed, we can mark as failed or completed depending on errors
            # Let's consider completed if at least one option succeeded and no critical errors occurred,
            # but to be strict, if there are errors, status is "failed".
            
            # Update log
            update_data = {
                "status": status,
                "details": {
                    "covers_synced": covers_synced,
                    "covers_failed": covers_failed,
                    "recommendations_found": recs_found,
                    "errors": errors
                },
                "completed_at": datetime.utcnow()
            }
            await db.sync_logs.update_one({"_id": log_id}, {"$set": update_data})
            return {"status": status, "details": update_data["details"]}
            
        except Exception as e:
            logger.error(f"Critical error in execute_single_sync for {manga_id}: {e}")
            errors.append(f"Critical: {str(e)}")
            await db.sync_logs.update_one(
                {"_id": log_id},
                {
                    "$set": {
                        "status": "failed",
                        "details": {
                            "covers_synced": 0,
                            "covers_failed": 0,
                            "recommendations_found": 0,
                            "errors": errors
                        },
                        "completed_at": datetime.utcnow()
                    }
                }
            )
            return {"status": "failed", "errors": errors}

    async def execute_batch_sync(self, manga_ids: List[str], options: Dict[str, bool], sync_config_id: Optional[str] = None):
        """
        Runs batch sync in the background.
        """
        task_id = str(ObjectId())

        async def _run_batch():
            logger.info(f"Starting background batch sync task {task_id} for {len(manga_ids)} mangas...")
            try:
                for idx, m_id in enumerate(manga_ids):
                    try:
                        await self.execute_single_sync(m_id, options, sync_config_id)
                    except Exception as e:
                        logger.error(f"Batch sync item failed for {m_id}: {e}")
                    
                    # Throttle requests: 1.5 seconds gap between mangas to avoid rate limits
                    if idx < len(manga_ids) - 1:
                        await asyncio.sleep(1.5)
                logger.info(f"Background batch sync task {task_id} completed.")
            except asyncio.CancelledError:
                logger.info(f"Background batch sync task {task_id} was cancelled.")
                try:
                    db = get_db()
                    # Mark active single sync logs as failed
                    await db.sync_logs.update_many(
                        {"status": "running", "manga_id": {"$in": manga_ids}},
                        {
                            "$set": {
                                "status": "failed",
                                "details.errors": ["Sync force aborted via system control."],
                                "completed_at": datetime.utcnow()
                            }
                        }
                    )
                except Exception as db_err:
                    logger.error(f"Failed to update sync_logs on task cancel: {db_err}")
                raise
            finally:
                self.active_tasks.pop(task_id, None)

        task = asyncio.create_task(_run_batch())
        self.active_tasks[task_id] = task
        return {"status": "queued", "count": len(manga_ids), "task_id": task_id}

    async def cancel_all_active_syncs(self) -> Dict[str, Any]:
        """
        Cancel all active background sync tasks.
        """
        cancelled_count = 0
        task_ids = list(self.active_tasks.keys())
        for task_id in task_ids:
            task = self.active_tasks.get(task_id)
            if task and not task.done():
                task.cancel()
                cancelled_count += 1
                
        # Also clean up any sync run logs in DB that are still marked as "running"
        try:
            db = get_db()
            await db.sync_runs.update_many(
                {"status": "running"},
                {
                    "$set": {
                        "status": "cancelled",
                        "completed_at": datetime.utcnow()
                    },
                    "$push": {
                        "logs": f"[{datetime.utcnow().isoformat()}] Force cancelled all background sync processes via system control."
                    }
                }
            )
            # Also clean up sync_logs
            await db.sync_logs.update_many(
                {"status": "running"},
                {
                    "$set": {
                        "status": "failed",
                        "details.errors": ["Sync force aborted via system control."],
                        "completed_at": datetime.utcnow()
                    }
                }
            )
        except Exception as e:
            logger.error(f"Error updating run status on cancel all: {e}")

        return {"cancelled_count": cancelled_count, "message": f"Successfully cancelled {cancelled_count} background tasks."}

    async def execute_sync_pool(self, pool_id: str) -> Dict[str, Any]:
        if not ObjectId.is_valid(pool_id):
            return {"status": "failed", "error": "Invalid pool ID"}
            
        db = get_db()
        pool = await db.sync_configs.find_one({"_id": ObjectId(pool_id)})
        if not pool:
            return {"status": "failed", "error": "Pool not found"}

        mangas = await self.preview_sync_pool(pool_id)
        manga_ids = [m["_id"] for m in mangas]
        
        if not manga_ids:
            return {"status": "completed", "count": 0, "message": "No mangas match pool filters"}

        # Run batch sync
        res = await self.execute_batch_sync(manga_ids, pool.get("sync_options", {}), pool_id)
        
        # Update last synced at
        await db.sync_configs.update_one(
            {"_id": ObjectId(pool_id)},
            {"$set": {"last_synced_at": datetime.utcnow()}}
        )
        
        return {
            "status": "queued",
            "count": len(manga_ids),
            "pool_name": pool.get("name")
        }

    async def get_sync_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        db = get_db()
        cursor = db.sync_logs.find({}).sort("started_at", -1).limit(limit)
        logs = []
        async for doc in cursor:
            logs.append(serialize_doc(doc))
        return logs

    async def get_sync_stats(self) -> Dict[str, Any]:
        db = get_db()
        total_synced_mangas = await db.mangas.count_documents({"mangadex_id": {"$ne": None}})
        total_covers = await db.cover_arts.count_documents({})
        total_recs_cached = await db.manga_recommendations.count_documents({})
        
        # Find last sync log
        last_log = await db.sync_logs.find_one({}, sort=[("started_at", -1)])
        last_sync_at = last_log.get("started_at") if last_log else None
        
        return {
            "total_synced_mangas": total_synced_mangas,
            "total_covers": total_covers,
            "total_recommendations_cached": total_recs_cached,
            "last_synced_at": last_sync_at
        }

sync_manager_service = SyncManagerService()
