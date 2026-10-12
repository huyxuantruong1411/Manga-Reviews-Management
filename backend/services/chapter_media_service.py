import hashlib
import inspect
import io
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from bson import ObjectId
from PIL import Image

from backend.database.connection import get_db
from backend.models.chapter import PageItem
from backend.models.datasource import SourcePage, SourcePageManifest
from backend.services.minio_service import minio_service

logger = logging.getLogger(__name__)


class ChapterMediaService:
    def __init__(self, minio_client=None):
        self._minio_service = minio_client or minio_service

    def _get_chapters_col(self):
        return get_db().chapters

    def validate_image_bytes(self, data: bytes) -> Tuple[str, int, int]:
        """
        Validates image magic bytes, Pillow structural integrity, and dimensions.
        Rejects HTML errors, scripts, corrupt byte streams, or unsupported formats.
        Returns (content_type, width, height).
        """
        if not data or len(data) < 12:
            raise ValueError("Invalid image bytes: empty or truncated stream")

        # Magic bytes preliminary inspection
        is_jpeg = data.startswith(b"\xff\xd8\xff")
        is_png = data.startswith(b"\x89PNG\r\n\x1a\n")
        is_webp = data.startswith(b"RIFF") and b"WEBP" in data[8:16]

        if not (is_jpeg or is_png or is_webp):
            # Check for HTML / error pages
            stripped = data[:100].strip().lower()
            if stripped.startswith((b"<!doctype html", b"<html", b"<?xml", b"error", b"forbidden")):
                raise ValueError("Invalid image bytes: received HTML error response instead of image")
            raise ValueError("Invalid image bytes: unsupported image format")

        try:
            with Image.open(io.BytesIO(data)) as img:
                img.verify()
                width, height = img.size
                fmt = (img.format or "").upper()
        except Exception as e:
            raise ValueError(f"Corrupted or invalid image structure: {e}") from e

        if width <= 0 or height <= 0:
            raise ValueError(f"Invalid image dimensions: {width}x{height}")

        # Protect against decompression bomb
        if width * height > Image.MAX_IMAGE_PIXELS:
            raise ValueError(f"Image dimensions exceed safe pixel limit ({width * height} pixels)")

        content_type = "image/jpeg"
        if fmt == "PNG" or is_png:
            content_type = "image/png"
        elif fmt == "WEBP" or is_webp:
            content_type = "image/webp"

        return content_type, width, height

    def compute_hashes(self, data: bytes) -> Tuple[str, str]:
        """Returns (sha256_hex, md5_hex)."""
        sha256_h = hashlib.sha256(data).hexdigest()
        md5_h = hashlib.md5(data).hexdigest()
        return sha256_h, md5_h

    async def stage_and_verify_chapter(
        self,
        manga_id: str,
        chapter_id: str,
        media_revision_id: str,
        manifest: SourcePageManifest,
        fetcher: Callable[[SourcePage], Any],
        disk_target_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Stages each page to MinIO under immutable revision keys:
        chapters/{manga_id}/{chapter_id}/revisions/{media_revision_id}/0001.ext
        Validates contiguous ordering 1..N and uploads canonical manifest.json.
        """
        if not manifest.pages:
            raise ValueError("Manifest contains no pages to stage")

        pages = sorted(manifest.pages, key=lambda p: p.page_number)
        expected_numbers = list(range(1, len(pages) + 1))
        actual_numbers = [p.page_number for p in pages]
        if actual_numbers != expected_numbers:
            raise ValueError(
                f"Non-sequential or duplicate page numbers in manifest: expected {expected_numbers}, got {actual_numbers}"
            )

        staged_page_items: List[PageItem] = []

        if disk_target_dir:
            os.makedirs(disk_target_dir, exist_ok=True)

        for p in pages:
            if inspect.iscoroutinefunction(fetcher):
                img_bytes = await fetcher(p)
            else:
                img_bytes = fetcher(p)
                if inspect.isawaitable(img_bytes):
                    img_bytes = await img_bytes

            content_type, width, height = self.validate_image_bytes(img_bytes)
            sha256_h, md5_h = self.compute_hashes(img_bytes)

            ext = ".jpg"
            if content_type == "image/png":
                ext = ".png"
            elif content_type == "image/webp":
                ext = ".webp"

            filename = f"{p.page_number:04d}{ext}"

            # Upload to MinIO revision path
            res = self._minio_service.upload_chapter_page_revision(
                manga_id=manga_id,
                chapter_id=chapter_id,
                media_revision_id=media_revision_id,
                filename=filename,
                data=img_bytes,
                content_type=content_type,
            )
            obj_key = res[0]
            fsize = res[1]

            # Optional disk mirror: write to .part first, verify hash, then rename
            if disk_target_dir:
                part_path = os.path.join(disk_target_dir, f"{filename}.part")
                final_path = os.path.join(disk_target_dir, filename)
                with open(part_path, "wb") as f:
                    f.write(img_bytes)
                with open(part_path, "rb") as f:
                    written_hash = hashlib.sha256(f.read()).hexdigest()
                if written_hash != sha256_h:
                    os.remove(part_path)
                    raise IOError(f"Disk staging hash mismatch for page {p.page_number}")
                os.replace(part_path, final_path)

            page_item = PageItem(
                page_uid=str(uuid.uuid4()),
                page_number=p.page_number,
                filename=filename,
                object_key=obj_key,
                content_type=content_type,
                file_size=fsize,
                width=width,
                height=height,
                sha256=sha256_h,
                md5_hash=md5_h,
            )
            staged_page_items.append(page_item)

        # Assemble Schema v2 Manifest
        observed_iso = (
            manifest.observed_at.isoformat()
            if hasattr(manifest.observed_at, "isoformat")
            else str(manifest.observed_at)
        )
        manifest_v2_dict = {
            "schema_version": 2,
            "manga_id": manga_id,
            "chapter_id": chapter_id,
            "logical_chapter_id": getattr(manifest, "logical_chapter_id", None),
            "media_revision_id": media_revision_id,
            "pages_revision": 1,
            "source": {
                "provider": manifest.provider,
                "work_id": manifest.work_id,
                "release_id": manifest.release_id,
                "language": manifest.language,
                "unit_kind": manifest.unit_kind,
                "chapter_number_raw": manifest.chapter_number_raw,
                "numbering_scope_id": getattr(manifest, "numbering_scope_id", None),
            },
            "page_count": len(staged_page_items),
            "pages": [
                {
                    "page_uid": pi.page_uid,
                    "page_number": pi.page_number,
                    "filename": pi.filename,
                    "object_key": pi.object_key,
                    "content_type": pi.content_type,
                    "file_size": pi.file_size,
                    "width": pi.width,
                    "height": pi.height,
                    "sha256": pi.sha256,
                }
                for pi in staged_page_items
            ],
            "adapter_version": manifest.adapter_version,
            "observed_at": observed_iso,
        }

        canonical_json_bytes = json.dumps(manifest_v2_dict, sort_keys=True, separators=(",", ":")).encode("utf-8")
        manifest_sha256 = hashlib.sha256(canonical_json_bytes).hexdigest()
        manifest_v2_dict["manifest_sha256"] = manifest_sha256

        # Upload manifest.json to MinIO
        manifest_obj_key = f"chapters/{manga_id}/{chapter_id}/revisions/{media_revision_id}/manifest.json"
        self._minio_service.put_object_bytes(
            object_name=manifest_obj_key,
            data=canonical_json_bytes,
            content_type="application/json",
        )

        return {
            "page_count": len(staged_page_items),
            "pages": staged_page_items,
            "manifest_sha256": manifest_sha256,
            "manifest_v2": manifest_v2_dict,
        }

    async def claim_chapter_for_download(
        self, chapter_id: str, operation_id: str, lease_seconds: int = 120
    ) -> Optional[Tuple[int, int]]:
        """
        Attempts CAS claim on a chapter document.
        Returns (new_fence, lifecycle_epoch) if claimed successfully, None if active lease exists.
        """
        now = datetime.now(timezone.utc)
        doc = await self._get_chapters_col().find_one({"_id": ObjectId(chapter_id)})
        if not doc:
            return None

        current_fence = doc.get("media_write_fence", 0)
        current_epoch = doc.get("lifecycle_epoch", 1)
        new_fence = current_fence + 1

        res = await self._get_chapters_col().update_one(
            {
                "_id": ObjectId(chapter_id),
                "lifecycle_epoch": current_epoch,
                "$or": [
                    {"pending_operation_id": None},
                    {"pending_operation_id": operation_id},
                    {"lease_until": {"$lt": now}},
                    {"lease_until": None},
                ],
            },
            {
                "$set": {
                    "pending_operation_id": operation_id,
                    "media_write_fence": new_fence,
                    "lease_until": now + timedelta(seconds=lease_seconds),
                    "updated_at": now,
                }
            },
        )
        if getattr(res, "modified_count", 0) > 0:
            return new_fence, current_epoch
        return None

    async def commit_chapter_media(
        self,
        chapter_id: str,
        operation_id: str,
        expected_fence: int,
        expected_epoch: int,
        media_revision_id: str,
        manifest_sha256: str,
        pages: List[PageItem],
        schema_version: int = 2,
    ) -> bool:
        """
        Executes Compare-And-Swap (CAS) commit on chapter document.
        Ensures that only the authorized operation with valid fence and epoch can commit 'ready'.
        """
        now = datetime.now(timezone.utc)
        pages_payload = [
            p.model_dump() if hasattr(p, "model_dump") else (p.dict() if hasattr(p, "dict") else p) for p in pages
        ]

        res = await self._get_chapters_col().update_one(
            {
                "_id": ObjectId(chapter_id),
                "pending_operation_id": operation_id,
                "media_write_fence": expected_fence,
                "lifecycle_epoch": expected_epoch,
            },
            {
                "$set": {
                    "state": "ready",
                    "media_revision_id": media_revision_id,
                    "manifest_sha256": manifest_sha256,
                    "pages": pages_payload,
                    "page_count": len(pages),
                    "schema_version": schema_version,
                    "committed_at": now,
                    "pending_operation_id": None,
                    "lease_until": None,
                    "updated_at": now,
                },
                "$inc": {"pages_revision": 1},
            },
        )
        success = getattr(res, "modified_count", 0) > 0
        if success:
            logger.info(
                f"Successfully committed chapter media {chapter_id} (rev: {media_revision_id}, pages: {len(pages)})"
            )
        else:
            logger.warning(
                f"CAS commit failed for chapter {chapter_id}: fence {expected_fence} or epoch {expected_epoch} mismatch"
            )
        return success


chapter_media_service = ChapterMediaService()
