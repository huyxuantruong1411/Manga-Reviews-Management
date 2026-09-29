import logging
from datetime import datetime, timedelta
from bson import ObjectId
from typing import List, Dict, Any, Optional
from backend.database.connection import get_db
from backend.services.mangadex_service import mangadex_service
from backend.services.manga_service import manga_service, serialize_doc
from backend.models.manga import MangaCreateDex, ReadStatus

logger = logging.getLogger(__name__)

class RecommendationService:
    async def check_local_existence(self, mangadex_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Check which of the given MangaDex IDs exist in the local library.
        Returns a mapping of mangadex_id -> {"local_manga_id": str, "read_status": str}.
        """
        if not mangadex_ids:
            return {}
        db = get_db()
        cursor = db.mangas.find({"mangadex_id": {"$in": mangadex_ids}}, {"_id": 1, "mangadex_id": 1, "read_status": 1})
        mapping = {}
        async for doc in cursor:
            mapping[doc["mangadex_id"]] = {
                "local_manga_id": str(doc["_id"]),
                "read_status": doc.get("read_status", "unread")
            }
        return mapping

    async def get_recommendations(self, manga_id: str, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        Get recommendations for a manga. Check DB cache first, then fetch from MangaDex if expired or missing.
        Dynamically merges the current local existence status of each recommendation.
        """
        db = get_db()
        if not ObjectId.is_valid(manga_id):
            raise ValueError(f"Invalid manga ID format: {manga_id}")
            
        manga = await db.mangas.find_one({"_id": ObjectId(manga_id)})
        if not manga:
            raise ValueError(f"Manga with ID {manga_id} not found")
            
        mangadex_id = manga.get("mangadex_id")
        if not mangadex_id:
            logger.warning(f"Manga {manga_id} does not have a MangaDex ID. Skipping recommendations.")
            return []

        cache_doc = None
        if not force_refresh:
            cache_doc = await db.manga_recommendations.find_one({"manga_id": manga_id})

        now = datetime.utcnow()
        if not cache_doc or cache_doc.get("expires_at", now) <= now:
            logger.info(f"Cache miss or expired for recommendations of {manga_id}. Syncing from MangaDex...")
            try:
                await self.sync_recommendations(manga_id)
                cache_doc = await db.manga_recommendations.find_one({"manga_id": manga_id})
            except Exception as e:
                logger.error(f"Failed to fetch recommendations from MangaDex: {e}")
                if cache_doc:
                    logger.warning("Falling back to expired cache.")
                else:
                    return []

        if not cache_doc or "recommendations" not in cache_doc:
            return []

        recommendations = cache_doc["recommendations"]
        
        # Check current local existence of all recommended manga
        mangadex_ids = [rec["mangadex_id"] for rec in recommendations]
        local_mapping = await self.check_local_existence(mangadex_ids)
        
        # Merge local mapping into recommendations list
        for rec in recommendations:
            local_info = local_mapping.get(rec["mangadex_id"])
            if local_info:
                rec["local_manga_id"] = local_info["local_manga_id"]
                rec["local_read_status"] = local_info["read_status"]
            else:
                rec["local_manga_id"] = None
                rec["local_read_status"] = None
            
        return recommendations

    async def cleanup_duplicate_mangas(self) -> None:
        """
        Deprecated: Never delete user manga or reassign reviews automatically.
        Unique constraints are enforced at the database index and API levels.
        """
        logger.info("cleanup_duplicate_mangas called - no-op for data safety.")
        return

    async def sync_recommendations(self, manga_id: str) -> Dict[str, Any]:
        """
        Fetch recommendations from MangaDex, cache them in DB.
        """
        db = get_db()
        if not ObjectId.is_valid(manga_id):
            raise ValueError(f"Invalid manga ID format: {manga_id}")
            
        manga = await db.mangas.find_one({"_id": ObjectId(manga_id)})
        if not manga:
            raise ValueError(f"Manga with ID {manga_id} not found")
            
        mangadex_id = manga.get("mangadex_id")
        if not mangadex_id:
            return {"recommendations_synced": 0, "status": "no_mangadex_id"}

        logger.info(f"Fetching recommendations from MangaDex for: {manga.get('title')} ({manga_id})")
        recs = await mangadex_service.get_manga_recommendations(mangadex_id)
        
        # Deduplicate recommendations and exclude the source manga itself
        seen_ids = set()
        deduped_recs = []
        for r in recs:
            r_id = r["mangadex_id"]
            if r_id == mangadex_id:
                continue
            if r_id not in seen_ids:
                seen_ids.add(r_id)
                deduped_recs.append(r)

        # Get local existence mapping
        mangadex_ids = [r["mangadex_id"] for r in deduped_recs]
        local_mapping = await self.check_local_existence(mangadex_ids)

        recommendations_to_cache = []
        for r in deduped_recs:
            local_info = local_mapping.get(r["mangadex_id"])
            recommendations_to_cache.append({
                "mangadex_id": r["mangadex_id"],
                "score": r["score"],
                "title": r["title"],
                "author": r.get("author", "Unknown"),
                "artist": r.get("artist", "Unknown"),
                "cover_url": r.get("cover_url"),
                "status": r.get("status"),
                "year": r.get("year"),
                "local_manga_id": local_info["local_manga_id"] if local_info else None,
                "local_read_status": local_info["read_status"] if local_info else None
            })

        # Save to database
        cache_doc = {
            "manga_id": manga_id,
            "mangadex_manga_id": mangadex_id,
            "recommendations": recommendations_to_cache,
            "synced_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=7) # Cache for 7 days
        }

        await db.manga_recommendations.update_one(
            {"manga_id": manga_id},
            {"$set": cache_doc},
            upsert=True
        )

        return {
            "recommendations_synced": len(recommendations_to_cache),
            "status": "success"
        }

    async def import_manga_from_recommendation(self, mangadex_id: str) -> Dict[str, Any]:
        """
        Import a recommended manga into the system.
        """
        dex_data = MangaCreateDex(
            mangadex_id=mangadex_id,
            read_status=ReadStatus.UNREAD,
            personal_rating=None,
            tag_ids=[]
        )
        return await manga_service.add_manga_by_dex(dex_data)

recommendation_service = RecommendationService()
