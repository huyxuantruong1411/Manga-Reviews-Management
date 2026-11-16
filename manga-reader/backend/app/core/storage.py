"""MinIO Object Storage Wrapper (Zero-Copy Media URLs, WebP Avatar Upload, Data Lake Sync)."""

from __future__ import annotations

import hashlib
import io
import logging
import uuid
from typing import Iterable

from minio import Minio
from PIL import Image, UnidentifiedImageError

from app.core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_AVATAR_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB (UC-6.1)


class StorageService:
    """Encapsulates MinIO object storage operations and Zero-Copy URL generation."""

    def __init__(self) -> None:
        self._client: Minio | None = None
        self._source_client: Minio | None = None

    @property
    def client(self) -> Minio:
        if self._client is None:
            self._client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ROOT_USER,
                secret_key=settings.MINIO_ROOT_PASSWORD,
                secure=settings.MINIO_SECURE,
            )
        return self._client

    @property
    def source_client(self) -> Minio:
        if self._source_client is None:
            self._source_client = Minio(
                settings.SOURCE_MINIO_ENDPOINT,
                access_key=settings.SOURCE_MINIO_ACCESS_KEY,
                secret_key=settings.SOURCE_MINIO_SECRET_KEY,
                secure=settings.SOURCE_MINIO_SECURE,
            )
        return self._source_client

    def ensure_buckets(self) -> None:
        """Ensure all 3 required MinIO buckets exist."""
        for bucket in (
            settings.MINIO_BUCKET_LIBRARY,
            settings.MINIO_BUCKET_AVATARS,
            settings.MINIO_BUCKET_STAGING,
        ):
            if not self.client.bucket_exists(bucket):
                self.client.make_bucket(bucket)

    def build_media_url(self, bucket: str | None, object_key: str | None) -> str | None:
        """Build public/CDN URL or backend proxy URL for a Zero-Copy media pointer (UC-4.3 NFR1)."""
        if not bucket or not object_key:
            return None
        clean_key = object_key.lstrip("/")
        if settings.MINIO_PUBLIC_BASE_URL:
            base = settings.MINIO_PUBLIC_BASE_URL.rstrip("/")
            return f"{base}/{bucket}/{clean_key}"
        return f"/api/v1/media/{bucket}/{clean_key}"

    def is_public_bucket(self, bucket: str) -> bool:
        """Return True if the bucket is safe for public media proxy reads."""
        return bucket in {settings.MINIO_BUCKET_LIBRARY, settings.MINIO_BUCKET_AVATARS}

    def read_public_object(self, bucket: str, object_key: str) -> tuple[bytes, str | None] | None:
        """Fetch raw bytes and declared content type from primary or source MinIO bucket."""
        clean_key = object_key.lstrip("/")
        clients = [self.client]
        if (
            bucket == settings.MINIO_BUCKET_LIBRARY
            and settings.SOURCE_MINIO_ENDPOINT
            and settings.SOURCE_MINIO_ENDPOINT != settings.MINIO_ENDPOINT
        ):
            clients.append(self.source_client)

        for cli in clients:
            resp = None
            try:
                resp = cli.get_object(bucket, clean_key)
                data = resp.read()
                content_type = resp.headers.get("Content-Type") if resp.headers else None
                return data, content_type
            except Exception:
                continue
            finally:
                if resp is not None:
                    resp.close()
                    resp.release_conn()
        return None

    def object_exists(self, bucket: str, object_key: str) -> bool:
        """Check if object exists in reader MinIO storage."""
        try:
            self.client.stat_object(bucket, object_key)
            return True
        except Exception:
            return False

    def put_bytes(
        self,
        bucket: str,
        object_key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> dict[str, str | int]:
        """Upload raw bytes to MinIO bucket and return metadata."""
        if not self.client.bucket_exists(bucket):
            self.client.make_bucket(bucket)
        stream = io.BytesIO(data)
        self.client.put_object(
            bucket_name=bucket,
            object_name=object_key,
            data=stream,
            length=len(data),
            content_type=content_type,
        )
        return {
            "bucket": bucket,
            "object_key": object_key,
            "file_size": len(data),
            "md5_hash": hashlib.md5(data).hexdigest(),
            "sha256": hashlib.sha256(data).hexdigest(),
        }

    def sync_or_create_placeholder_media(
        self,
        bucket: str,
        object_key: str,
        width: int | None = None,
        height: int | None = None,
    ) -> bool:
        """Ensure media object exists in reader MinIO; pull from source Data Lake MinIO or create valid WebP."""
        if self.object_exists(bucket, object_key):
            return True

        # Try copying from Source Data Lake MinIO if reachable
        try:
            resp = self.source_client.get_object(bucket, object_key)
            try:
                raw_bytes = resp.read()
            finally:
                resp.close()
                resp.release_conn()
            self.put_bytes(bucket, object_key, raw_bytes, content_type="image/webp")
            return True
        except Exception:
            pass

        # Fallback: generate a valid deterministic .webp sample image for offline/test seeding
        img = Image.new("RGB", (min(width or 320, 640), min(height or 480, 960)), color=(32, 36, 48))
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=80)
        self.put_bytes(bucket, object_key, buf.getvalue(), content_type="image/webp")
        return True

    def upload_user_avatar(
        self,
        user_id: str,
        file_bytes: bytes,
        content_type: str | None,
        crop_box: tuple[int, int, int, int] | None = None,
        old_bucket: str | None = None,
        old_object_key: str | None = None,
    ) -> tuple[str, str]:
        """Validate, crop, convert to WebP, upload to user-avatars bucket, and delete old avatar (UC-6.1)."""
        if content_type not in ALLOWED_AVATAR_MIME_TYPES:
            raise ValueError("Unsupported image format. Allowed: image/jpeg, image/png, image/webp")
        if len(file_bytes) == 0 or len(file_bytes) > MAX_AVATAR_BYTES:
            raise ValueError("Avatar file size must be between 1 byte and 5 MB")

        try:
            with Image.open(io.BytesIO(file_bytes)) as img:
                img.verify()
            with Image.open(io.BytesIO(file_bytes)) as img:
                rgb_img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")
                w, h = rgb_img.size
                if crop_box is not None:
                    left, top, right, bottom = crop_box
                    left = max(0, min(left, w - 1))
                    top = max(0, min(top, h - 1))
                    right = max(left + 1, min(right, w))
                    bottom = max(top + 1, min(bottom, h))
                    rgb_img = rgb_img.crop((left, top, right, bottom))
                else:
                    # Center square crop
                    side = min(w, h)
                    left = (w - side) // 2
                    top = (h - side) // 2
                    rgb_img = rgb_img.crop((left, top, left + side, top + side))

                rgb_img = rgb_img.resize((256, 256), Image.Resampling.LANCZOS)
                out_buf = io.BytesIO()
                rgb_img.save(out_buf, format="WEBP", quality=85)
                webp_bytes = out_buf.getvalue()
        except (UnidentifiedImageError, OSError, SyntaxError) as exc:
            raise ValueError("Corrupted or invalid image file") from exc

        bucket = settings.MINIO_BUCKET_AVATARS
        object_key = f"avatars/{user_id}/{uuid.uuid4().hex}.webp"
        self.put_bytes(bucket, object_key, webp_bytes, content_type="image/webp")

        if old_bucket and old_object_key and old_bucket == bucket:
            try:
                self.client.remove_object(old_bucket, old_object_key)
            except Exception as exc:
                logger.debug("Could not remove old avatar %s/%s: %s", old_bucket, old_object_key, exc)

        return bucket, object_key

    def delete_objects(self, bucket: str, object_keys: Iterable[str]) -> int:
        """Delete multiple objects from a bucket (used in background cleanup UC-2.4 NFR1)."""
        removed = 0
        for key in object_keys:
            if not key:
                continue
            try:
                self.client.remove_object(bucket, key)
                removed += 1
            except Exception as exc:
                logger.debug("Failed removing %s/%s: %s", bucket, key, exc)
        return removed


storage_service = StorageService()
