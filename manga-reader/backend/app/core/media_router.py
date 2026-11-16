"""Thin media proxy router streaming public MinIO assets safely over FastAPI."""

from __future__ import annotations

import asyncio
import mimetypes
from pathlib import PurePosixPath

from fastapi import APIRouter, HTTPException, Response, status

from app.core.storage import storage_service

router = APIRouter(prefix="/api/v1", tags=["Media Proxy"])

_MEDIA_MIME_BY_EXT: dict[str, str] = {
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
}


def _resolve_media_type(object_key: str, minio_content_type: str | None) -> str:
    ext = PurePosixPath(object_key.lower()).suffix
    if ext in _MEDIA_MIME_BY_EXT:
        return _MEDIA_MIME_BY_EXT[ext]
    if minio_content_type and minio_content_type != "application/octet-stream":
        return minio_content_type
    guessed, _ = mimetypes.guess_type(object_key)
    return guessed or "application/octet-stream"


@router.get("/media/{bucket}/{object_key:path}", status_code=status.HTTP_200_OK)
async def proxy_media_object(bucket: str, object_key: str) -> Response:
    """Stream manga cover, chapter page, or user avatar from MinIO through backend."""
    if not storage_service.is_public_bucket(bucket):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bucket access is forbidden via public media proxy.",
        )

    clean_key = object_key.lstrip("/")
    if not clean_key or "\\" in clean_key or ".." in PurePosixPath(clean_key).parts:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid object key.",
        )

    result = await asyncio.to_thread(storage_service.read_public_object, bucket, clean_key)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media object not found.",
        )

    data, declared_ct = result
    media_type = _resolve_media_type(clean_key, declared_ct)
    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
