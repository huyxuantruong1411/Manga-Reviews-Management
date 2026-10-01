import logging
from datetime import datetime
from typing import Any, Dict, List

from bson import ObjectId

from backend.database.connection import get_db
from backend.services.manga_service import serialize_doc
from backend.services.mangadex_service import mangadex_service
from backend.services.minio_service import minio_service

logger = logging.getLogger(__name__)


class CoverArtService:
    async def sync_covers_for_manga(self, manga_id: str) -> Dict[str, Any]:
        """
        Sync all cover arts for a manga from MangaDex.
        Downloads the files, uploads them to MinIO, and saves metadata in MongoDB.
        """
        db = get_db()
        if not ObjectId.is_valid(manga_id):
            raise ValueError(f"Invalid manga ID format: {manga_id}")

        manga = await db.mangas.find_one({"_id": ObjectId(manga_id)})
        if not manga:
            raise ValueError(f"Manga with ID {manga_id} not found")

        mangadex_id = manga.get("mangadex_id")
        if not mangadex_id:
            logger.warning(f"Manga {manga_id} does not have a MangaDex ID. Skipping cover sync.")
            return {"covers_synced": 0, "covers_failed": 0, "errors": ["No MangaDex ID"]}

        # Retrieve cover art resolution settings (defaulting to original)
        settings_doc = await db.settings.find_one({"key": "system_settings"})
        resolution = "original"
        if settings_doc and "value" in settings_doc:
            resolution = settings_doc["value"].get("cover_resolution", "original")

        logger.info(f"Syncing cover arts for manga '{manga.get('title')}' ({manga_id}) with resolution: {resolution}")

        try:
            covers_metadata = await mangadex_service.get_manga_covers(mangadex_id)
        except Exception as e:
            logger.error(f"Error fetching covers from MangaDex for {mangadex_id}: {e}")
            return {"covers_synced": 0, "covers_failed": 0, "errors": [str(e)]}

        synced_count = 0
        failed_count = 0
        errors = []

        for cover in covers_metadata:
            try:
                file_name = cover["file_name"]
                cover_id = cover["mangadex_cover_id"]

                # Determine source URL according to resolution setting
                if resolution == "512":
                    source_url = f"https://uploads.mangadex.org/covers/{mangadex_id}/{file_name}.512.jpg"
                elif resolution == "256":
                    source_url = f"https://uploads.mangadex.org/covers/{mangadex_id}/{file_name}.256.jpg"
                else:
                    source_url = f"https://uploads.mangadex.org/covers/{mangadex_id}/{file_name}"

                minio_key = f"cover-arts/{mangadex_id}/{cover_id}.jpg"

                # Download image
                image_bytes = await mangadex_service.download_image_bytes(source_url)

                # If chosen resolution is not found, fallback to original as a safety measure
                if not image_bytes and resolution in ["512", "256"]:
                    logger.warning(f"Failed to fetch {resolution} cover. Falling back to original resolution.")
                    source_url = f"https://uploads.mangadex.org/covers/{mangadex_id}/{file_name}"
                    image_bytes = await mangadex_service.download_image_bytes(source_url)

                if not image_bytes:
                    raise ValueError(f"Failed to download image bytes from {source_url}")

                # Upload to MinIO
                minio_service.upload_cover(minio_key, image_bytes)

                # Save cover art document in MongoDB
                created_dt = None
                if cover.get("created_at"):
                    try:
                        created_dt = datetime.fromisoformat(cover["created_at"].replace("Z", "+00:00"))
                    except Exception:
                        created_dt = datetime.utcnow()
                else:
                    created_dt = datetime.utcnow()

                updated_dt = None
                if cover.get("updated_at"):
                    try:
                        updated_dt = datetime.fromisoformat(cover["updated_at"].replace("Z", "+00:00"))
                    except Exception:
                        updated_dt = datetime.utcnow()
                else:
                    updated_dt = datetime.utcnow()

                cover_doc = {
                    "manga_id": manga_id,
                    "mangadex_manga_id": mangadex_id,
                    "mangadex_cover_id": cover_id,
                    "volume": cover["volume"],
                    "description": cover["description"],
                    "locale": cover["locale"],
                    "file_name": file_name,
                    "minio_key": minio_key,
                    "source_url": source_url,
                    "version": cover["version"],
                    "created_at": created_dt,
                    "updated_at": updated_dt,
                    "synced_at": datetime.utcnow(),
                }

                await db.cover_arts.update_one(
                    {"manga_id": manga_id, "mangadex_cover_id": cover_id}, {"$set": cover_doc}, upsert=True
                )
                synced_count += 1
            except Exception as e:
                logger.error(f"Failed to sync cover {cover.get('mangadex_cover_id')} for manga {manga_id}: {e}")
                failed_count += 1
                errors.append(f"Cover {cover.get('mangadex_cover_id')}: {str(e)}")

        return {"covers_synced": synced_count, "covers_failed": failed_count, "errors": errors}

    async def get_covers_for_manga(self, manga_id: str) -> List[Dict[str, Any]]:
        """
        Retrieve all synced covers for a manga, generating presigned URLs for each.
        """
        db = get_db()
        cursor = db.cover_arts.find({"manga_id": manga_id})
        covers = []
        async for doc in cursor:
            if doc.get("minio_key"):
                doc["cover_url"] = minio_service.get_presigned_url(doc["minio_key"])
            covers.append(serialize_doc(doc))

        # Sort covers by volume number (using float-compatible sorting if possible)
        def get_volume_sort_key(c):
            vol = c.get("volume")
            if not vol:
                return 999999.0
            try:
                return float(vol)
            except ValueError:
                return 999998.0

        covers.sort(key=get_volume_sort_key)
        return covers

    async def delete_covers_for_manga(self, manga_id: str) -> bool:
        """
        Deletes all cover art files in MinIO and metadata documents in MongoDB.
        """
        db = get_db()
        cursor = db.cover_arts.find({"manga_id": manga_id})
        async for doc in cursor:
            if doc.get("minio_key"):
                minio_service.delete_cover(doc["minio_key"])
        await db.cover_arts.delete_many({"manga_id": manga_id})
        return True


cover_art_service = CoverArtService()
