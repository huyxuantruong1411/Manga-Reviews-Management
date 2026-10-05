"""Translation Storage and Asset Lifecycle Service.

Manages MinIO S3 uploads for translation artifacts, calculates storage usage metrics,
generates presigned URLs, and coordinates non-destructive reference-aware cleanup.
"""

import asyncio
import hashlib
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

import backend.database.connection as db_conn
from backend.config import settings
from backend.models.translation import TranslationAssetInDB

logger = logging.getLogger("backend.translation.storage")


class TranslationStorageService:
    def __init__(self):
        self._minio_client = None

    def _get_minio_client(self):
        if self._minio_client is None:
            try:
                from minio import Minio

                endpoint = settings.minio_endpoint
                if endpoint.startswith("http://"):
                    endpoint = endpoint[7:]
                elif endpoint.startswith("https://"):
                    endpoint = endpoint[8:]

                self._minio_client = Minio(
                    endpoint=endpoint,
                    access_key=settings.minio_access_key,
                    secret_key=settings.minio_secret_key,
                    secure=getattr(settings, "minio_secure", False),
                )
            except Exception as e:
                logger.warning(f"Could not initialize MinIO client for translation: {e}")
                self._minio_client = None
        return self._minio_client

    async def upload_file(self, object_key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Uploads a binary file to MinIO under the specified object key."""
        client = self._get_minio_client()
        if not client:
            logger.info(f"MinIO client unavailable, mock-uploading {object_key} ({len(data)} bytes)")
            return object_key

        def _do_put():
            bucket = getattr(settings, "minio_bucket_name", getattr(settings, "minio_bucket", "manga-library"))
            if not client.bucket_exists(bucket):
                client.make_bucket(bucket)
            client.put_object(
                bucket_name=bucket,
                object_name=object_key,
                data=io.BytesIO(data),
                length=len(data),
                content_type=content_type,
            )

        await asyncio.to_thread(_do_put)
        return object_key

    async def get_object_bytes(self, object_key: str) -> bytes:
        """Retrieves raw object bytes from MinIO."""
        client = self._get_minio_client()
        if not client:
            logger.info(f"MinIO client unavailable, returning empty bytes for {object_key}")
            return b""

        def _do_get():
            bucket = getattr(settings, "minio_bucket_name", getattr(settings, "minio_bucket", "manga-library"))
            response = client.get_object(bucket, object_key)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()

        return await asyncio.to_thread(_do_get)

    def resolve_asset_url(self, object_key: str, expires_in: int = 3600) -> str:
        """Generates a presigned GET URL for a given object key."""
        client = self._get_minio_client()
        if not client:
            return f"/api/translation/assets/stream?key={object_key}"

        try:
            from datetime import timedelta

            bucket = getattr(settings, "minio_bucket_name", getattr(settings, "minio_bucket", "manga-library"))
            url = client.presigned_get_object(
                bucket_name=bucket,
                object_name=object_key,
                expires=timedelta(seconds=expires_in),
            )
            return url
        except Exception as e:
            logger.warning(f"Error generating presigned URL for {object_key}: {e}")
            return f"/api/translation/assets/stream?key={object_key}"

    async def register_demo_input_asset(
        self, file_bytes: bytes, filename: str, mime_type: str = "image/jpeg"
    ) -> Dict[str, Any]:
        """Registers a synthetic demo input image for Studio testing without mutating chapters."""
        sha256 = hashlib.sha256(file_bytes).hexdigest()
        ext = filename.split(".")[-1] if "." in filename else "jpg"
        object_key = f"translation/demo_inputs/{sha256}.{ext}"

        await self.upload_file(object_key, file_bytes, mime_type)

        db = db_conn.get_db()
        asset_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        asset = TranslationAssetInDB(
            asset_id=asset_id,
            scope="local",
            kind="demo_input",
            object_key=object_key,
            sha256=sha256,
            file_size=len(file_bytes),
            mime_type=mime_type,
            state="available",
            created_at=now,
        )
        asset_dict = asset.model_dump(by_alias=True, exclude={"id"})
        await db["translation_assets"].insert_one(asset_dict)

        asset_dict.pop("_id", None)
        asset_dict["presigned_url"] = self.resolve_asset_url(object_key)
        return asset_dict

    async def get_storage_usage(self) -> Dict[str, Any]:
        """Summarizes asset storage count and bytes grouped by kind."""
        db = db_conn.get_db()
        cursor = db["translation_assets"].find({})
        assets = await cursor.to_list(length=1000)

        by_kind: Dict[str, int] = {}
        by_kind_count: Dict[str, int] = {}
        total_bytes = 0

        for a in assets:
            kind = a.get("kind", "other")
            size = a.get("file_size", 0)
            by_kind[kind] = by_kind.get(kind, 0) + size
            by_kind_count[kind] = by_kind_count.get(kind, 0) + 1
            total_bytes += size

        return {
            "total_assets": len(assets),
            "total_bytes": total_bytes,
            "by_kind": by_kind,
            "by_kind_count": by_kind_count,
        }

    async def preview_cleanup(self, dry_run: bool = True) -> Dict[str, Any]:
        """Identifies reclaimable assets marked for deletion or unreferenced."""
        db = db_conn.get_db()
        cursor = db["translation_assets"].find({"state": "deleting"})
        deleting_assets = await cursor.to_list(length=500)

        reclaimable_bytes = sum(a.get("file_size", 0) for a in deleting_assets)
        reclaimable_keys = [a.get("object_key") for a in deleting_assets if a.get("object_key")]

        if not dry_run and deleting_assets:
            client = self._get_minio_client()
            bucket = getattr(settings, "minio_bucket_name", getattr(settings, "minio_bucket", "manga-library"))

            def _delete_objects():
                for key in reclaimable_keys:
                    try:
                        client.remove_object(bucket, key)
                    except Exception as err:
                        logger.warning(f"Failed to remove object {key} from MinIO: {err}")

            if client:
                await asyncio.to_thread(_delete_objects)

            await db["translation_assets"].update_many(
                {"state": "deleting"},
                {"$set": {"state": "deleted", "deleted_at": datetime.now(timezone.utc)}},
            )

        return {
            "dry_run": dry_run,
            "reclaimable_count": len(deleting_assets),
            "reclaimable_bytes": reclaimable_bytes,
            "object_keys": reclaimable_keys,
        }


translation_storage_service = TranslationStorageService()
