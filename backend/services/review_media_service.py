"""Stable review media URLs backed by private object storage.

Persist the same-origin resolver URL, never an expiring signature. Legacy local
MinIO URLs are adapted on read so existing review documents need no migration.
"""

import asyncio
import copy
import io
from datetime import timedelta
from urllib.parse import quote, unquote, urlsplit

from bson import ObjectId
from fastapi import HTTPException, UploadFile
from minio.error import S3Error
from PIL import Image, UnidentifiedImageError

from backend.config import settings
from backend.database.connection import get_db
from backend.services.minio_service import minio_service

REVIEW_BUCKETS = frozenset({"review-images", "review-videos", "review-media"})
MAX_IMAGE_UPLOAD = 20 * 1024 * 1024


async def read_bounded_upload(upload: UploadFile, limit: int) -> bytes:
    """Stop at limit + 1 instead of materializing an unbounded upload in memory."""
    buffer = bytearray()
    while True:
        chunk = await upload.read(min(64 * 1024, limit + 1 - len(buffer)))
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > limit:
            raise HTTPException(413, "File exceeds the upload size limit")
    if not buffer:
        raise HTTPException(422, "Uploaded file is empty")
    return bytes(buffer)


def validate_image_upload(content: bytes) -> tuple[str, str]:
    formats = {
        "JPEG": ("image/jpeg", "jpg"),
        "PNG": ("image/png", "png"),
        "WEBP": ("image/webp", "webp"),
        "GIF": ("image/gif", "gif"),
        "BMP": ("image/bmp", "bmp"),
        "TIFF": ("image/tiff", "tiff"),
    }
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format not in formats or image.width * image.height > 40_000_000:
                raise ValueError("Unsupported image format or pixel count")
            result = formats[image.format]
            image.verify()
            return result
    except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise HTTPException(415, "Invalid image; use a raster image of at most 40 million pixels") from error


def build_media_url(bucket: str, object_key: str) -> str:
    manga_id, separator, filename = object_key.partition("/")
    if bucket not in REVIEW_BUCKETS or not separator or not ObjectId.is_valid(manga_id):
        raise ValueError("Invalid review media identity")
    parts = filename.split("/")
    allowed_shape = len(parts) == 1 or (
        bucket == "review-media" and len(parts) == 2 and parts[0] in {"image", "audio", "attachment"}
    )
    if not allowed_shape or any(not part or ".." in part or "\\" in part for part in parts):
        raise ValueError("Invalid review media filename")
    return f"/api/manga/{manga_id}/reviews/media/{bucket}/{quote(filename, safe='/')}"


def adapt_review_media(document: dict) -> dict:
    """Only rewrite local storage URLs belonging to this review's manga."""
    doc = copy.deepcopy(document)
    endpoint = settings.minio_endpoint
    host = urlsplit(endpoint if "://" in endpoint else f"http://{endpoint}").netloc

    def visit(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in {"src", "url", "href"} and isinstance(item, str):
                    parsed = urlsplit(item)
                    if parsed.scheme in {"http", "https"} and parsed.netloc == host:
                        bucket, _, object_key = unquote(parsed.path.lstrip("/")).partition("/")
                        if object_key.startswith(f"{doc.get('manga_id')}/"):
                            try:
                                value[key] = build_media_url(bucket, object_key)
                            except ValueError:
                                pass
                else:
                    visit(item)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(doc.get("content_json"))
    return doc


async def resolve_media(manga_id: str, bucket: str, filename: str) -> str:
    try:
        build_media_url(bucket, f"{manga_id}/{filename}")
    except ValueError as exc:
        raise HTTPException(404, "Review media not found") from exc
    if not await get_db().mangas.find_one({"_id": ObjectId(manga_id)}, {"_id": 1}):
        raise HTTPException(404, "Manga not found")
    key = f"{manga_id}/{filename}"
    try:
        await asyncio.to_thread(minio_service.client.stat_object, bucket, key)
        return await asyncio.to_thread(
            minio_service.client.presigned_get_object,
            bucket,
            key,
            expires=timedelta(minutes=30),
            response_headers={"response-content-disposition": "attachment"}
            if bucket == "review-media" and filename.startswith("attachment/")
            else None,
        )
    except S3Error as exc:
        if exc.code in {"NoSuchKey", "NoSuchObject", "NoSuchBucket"}:
            raise HTTPException(404, "Review media not found") from exc
        raise HTTPException(503, "Review media storage is unavailable") from exc
