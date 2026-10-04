import asyncio
import base64
import io
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from PIL import Image

from backend.database.connection import get_db
from backend.models.chapter import (
    DetectedChapter,
    FolderScanResponse,
    PageItem,
    StorageDuplicateGroup,
    StorageDuplicateItem,
)
from backend.services.audit_service import audit_service
from backend.services.minio_service import minio_service
from backend.utils.file_utils import normalize_windows_path

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}


def parse_chapter_numeric(chapter_str: str) -> float:
    """Extract float from chapter number string, or return fallback."""
    if not chapter_str:
        return 0.0
    clean = chapter_str.strip().lower()
    if clean in ("oneshot", "one-shot", "extra", "special"):
        return 0.0
    if clean in ("prologue", "intro"):
        return -1.0
    # Try finding digits and optional decimal
    match = re.search(r"(\d+(?:\.\d+)?)", clean)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return 0.0
    return 0.0


def parse_folder_name(folder_name: str) -> Dict[str, Any]:
    """
    Intelligently parses folder name to extract volume, chapter number, title, and group.
    Handles conventions like:
      - Chapter 1 - Title [Group]
      - Chapter 1.5 - Title (Group)
      - Vol. 1 Chapter 2
      - Ch 05
      - Chap 12
      - 01 - First Chapter
      - Oneshot - Title
    """
    name = folder_name.strip()
    result = {"volume": None, "chapter_number": "1", "chapter_numeric": 1.0, "title": "", "scanlation_group": None}

    # Extract scanlation group from brackets [Group] or parentheses at end
    group_match = re.search(r"\[([^\]]+)\]\s*$", name)
    if group_match:
        result["scanlation_group"] = group_match.group(1).strip()
        name = name[: group_match.start()].strip()
    else:
        group_match2 = re.search(r"\(([^)]+)\)\s*$", name)
        if group_match2:
            potential_group = group_match2.group(1).strip()
            # If not a number, likely a group
            if not re.match(r"^\d+(\.\d+)?$", potential_group):
                result["scanlation_group"] = potential_group
                name = name[: group_match2.start()].strip()

    # Extract volume if present e.g. Vol. 1 or Volume 02
    vol_match = re.search(r"(?:vol(?:ume)?\.?\s*(\d+))", name, re.IGNORECASE)
    if vol_match:
        result["volume"] = vol_match.group(1)
        # Remove volume part from name
        name = name[: vol_match.start()] + name[vol_match.end() :]
        name = name.strip()

    # Check for oneshot
    if re.search(r"\b(oneshot|one-shot)\b", name, re.IGNORECASE):
        result["chapter_number"] = "oneshot"
        result["chapter_numeric"] = 0.0
        # Title might be after dash
        parts = re.split(r"[-–:]", name, maxsplit=1)
        if len(parts) > 1:
            result["title"] = parts[1].strip()
        return result

    # Match Chapter number e.g. Chapter 1.5, Ch. 2, Chap 3, or leading numbers
    chap_match = re.search(r"(?:ch(?:apter)?\.?|chap\.?|c)\s*([0-9]+(?:\.[0-9]+)?)", name, re.IGNORECASE)
    if chap_match:
        c_num = chap_match.group(1)
        result["chapter_number"] = c_num
        result["chapter_numeric"] = parse_chapter_numeric(c_num)

        # Remaining text might be title
        remainder = name[chap_match.end() :].strip()
        # Strip leading dash/colon
        remainder = re.sub(r"^[-–:]\s*", "", remainder).strip()
        if remainder:
            result["title"] = remainder
    else:
        # Check if folder starts with numbers e.g. "01 - The Beginning"
        lead_num = re.match(r"^([0-9]+(?:\.[0-9]+)?)(?:\s*[-–:]\s*(.*))?$", name)
        if lead_num:
            c_num = lead_num.group(1)
            result["chapter_number"] = c_num
            result["chapter_numeric"] = parse_chapter_numeric(c_num)
            if lead_num.group(2):
                result["title"] = lead_num.group(2).strip()
        else:
            # Fallback to whole folder name as title
            result["chapter_number"] = "1"
            result["chapter_numeric"] = 1.0
            result["title"] = name

    return result


class ChapterService:
    def _get_chapters_col(self):
        return get_db().chapters

    def _get_mangas_col(self):
        return get_db().mangas

    def _get_reading_col(self):
        return get_db().reading_progress

    async def get_manga_chapters(
        self, manga_id: str, language: Optional[str] = None, group: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List all stored chapters for a manga, sorted naturally by chapter number."""
        query: Dict[str, Any] = {"manga_id": manga_id}
        if language:
            query["language"] = language
        if group:
            query["scanlation_group"] = group

        cursor = (
            self._get_chapters_col()
            .find(query)
            .sort([("chapter_numeric", 1), ("chapter_number", 1), ("created_at", 1)])
        )

        chapters = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            doc.pop("_id", None)
            chapters.append(doc)
        return chapters

    async def get_chapter_by_id(self, chapter_id: str, include_presigned_urls: bool = True) -> Optional[Dict[str, Any]]:
        """Retrieve chapter details and optionally inject 24h presigned URLs for all pages."""
        filter_query = {}
        if ObjectId.is_valid(chapter_id):
            filter_query = {"$or": [{"_id": ObjectId(chapter_id)}, {"_id": chapter_id}]}
        else:
            filter_query = {"_id": chapter_id}

        chapter = await self._get_chapters_col().find_one(filter_query)
        if not chapter:
            return None

        chapter["id"] = str(chapter["_id"])
        chapter.pop("_id", None)

        if "pages" in chapter:
            has_missing_uid = False
            for page in chapter["pages"]:
                if not page.get("page_uid"):
                    page["page_uid"] = str(uuid.uuid4())
                    has_missing_uid = True

            if has_missing_uid:
                db_id = ObjectId(chapter["id"]) if ObjectId.is_valid(chapter["id"]) else chapter["id"]
                cleaned_pages = [{k: v for k, v in p.items() if k != "url"} for p in chapter["pages"]]
                update_fields: Dict[str, Any] = {"pages": cleaned_pages}
                if "pages_revision" not in chapter:
                    update_fields["pages_revision"] = 1
                await self._get_chapters_col().update_one({"_id": db_id}, {"$set": update_fields})

            if include_presigned_urls:
                for page in chapter["pages"]:
                    object_key = page.get("object_key")
                    if object_key:
                        page["url"] = minio_service.get_presigned_url(object_key)

        return chapter

    async def create_or_update_chapter(self, chapter_data: Dict[str, Any]) -> str:
        """Create or update a chapter document."""
        c_num = str(chapter_data.get("chapter_number", "1"))
        c_numeric = parse_chapter_numeric(c_num)

        pages = chapter_data.get("pages", [])
        page_count = len(pages)

        # Clean volume
        raw_vol = chapter_data.get("volume")
        vol_clean = None
        if raw_vol is not None:
            s_vol = str(raw_vol).strip()
            if s_vol and s_vol.lower() not in ("none", "null", "no volume"):
                vol_clean = s_vol

        now = datetime.utcnow()
        doc = {
            "manga_id": str(chapter_data["manga_id"]),
            "chapter_number": c_num,
            "chapter_numeric": c_numeric,
            "volume": vol_clean,
            "title": chapter_data.get("title", ""),
            "language": chapter_data.get("language", "en"),
            "scanlation_group": chapter_data.get("scanlation_group"),
            "uploader": chapter_data.get("uploader"),
            "publish_at": chapter_data.get("publish_at"),
            "readable_at": chapter_data.get("readable_at"),
            "external_url": chapter_data.get("external_url"),
            "source": chapter_data.get("source", "mangadex"),
            "source_id": chapter_data.get("source_id"),
            "local_path": chapter_data.get("local_path"),
            "pages": pages,
            "page_count": page_count,
            "updated_at": now,
        }

        # Check if existing chapter matches (manga_id, source_id) or (manga_id, chapter_number, language, scanlation_group)
        existing = None
        if doc.get("source_id"):
            existing = await self._get_chapters_col().find_one(
                {"manga_id": doc["manga_id"], "source_id": doc["source_id"]}
            )
        if not existing and not doc.get("source_id"):
            existing = await self._get_chapters_col().find_one(
                {
                    "manga_id": doc["manga_id"],
                    "chapter_number": doc["chapter_number"],
                    "language": doc["language"],
                    "scanlation_group": doc["scanlation_group"],
                    "volume": doc["volume"],
                    "source_id": None,
                }
            )

        if existing:
            old_pages = existing.get("pages", [])
            old_uid_map = {
                p.get("page_number"): p.get("page_uid") for p in old_pages if isinstance(p, dict) and p.get("page_uid")
            }
            for p in pages:
                if isinstance(p, dict) and not p.get("page_uid"):
                    p["page_uid"] = old_uid_map.get(p.get("page_number")) or str(uuid.uuid4())
            doc["pages_revision"] = existing.get("pages_revision", 1) + (1 if pages != old_pages else 0)
            await self._get_chapters_col().update_one({"_id": existing["_id"]}, {"$set": doc})
            return str(existing["_id"])
        else:
            for p in pages:
                if isinstance(p, dict) and not p.get("page_uid"):
                    p["page_uid"] = str(uuid.uuid4())
            doc["pages_revision"] = 1
            doc["created_at"] = now
            result = await self._get_chapters_col().insert_one(doc)
            return str(result.inserted_id)

    async def sync_chapters_metadata_from_mangadex(self, manga_id: str) -> Dict[str, Any]:
        """
        Synchronizes / backfills missing chapter metadata (volume, group_name, uploader, publish_at)
        from MangaDex for all stored chapters of this manga.
        """
        from backend.services.mangadex_service import mangadex_service

        filter_query = {"_id": ObjectId(manga_id)} if ObjectId.is_valid(manga_id) else {"_id": manga_id}
        manga = await self._get_mangas_col().find_one(filter_query)
        if not manga or not manga.get("mangadex_id"):
            return {"updated_count": 0, "message": "Manga không liên kết với MangaDex."}

        mangadex_id = manga["mangadex_id"]

        # Get all distinct languages among existing stored chapters
        languages = await self._get_chapters_col().distinct("language", {"manga_id": manga_id})
        if not languages:
            languages = ["vi", "en"]

        updated_count = 0
        now = datetime.utcnow()

        for lang in languages:
            try:
                md_chapters = await mangadex_service.get_manga_chapters(mangadex_id, lang)
            except Exception as e:
                logger.error(f"Error fetching MangaDex feed for lang {lang}: {e}")
                continue

            # Index by source_id (MangaDex UUID) and by chapter_number
            by_source_id = {c["id"]: c for c in md_chapters if c.get("id")}
            by_chap_num = {str(c["chapter"]).strip().lower(): c for c in md_chapters if c.get("chapter")}

            # Fetch all stored chapters for this manga and language
            stored_cursor = self._get_chapters_col().find({"manga_id": manga_id, "language": lang})
            async for doc in stored_cursor:
                matched_md = None
                if doc.get("source_id") and doc["source_id"] in by_source_id:
                    matched_md = by_source_id[doc["source_id"]]
                elif str(doc.get("chapter_number", "")).strip().lower() in by_chap_num:
                    matched_md = by_chap_num[str(doc.get("chapter_number", "")).strip().lower()]

                if matched_md:
                    updates: Dict[str, Any] = {}
                    # Update volume
                    md_vol = matched_md.get("volume")
                    if md_vol is not None and doc.get("volume") != md_vol:
                        updates["volume"] = md_vol
                    elif (
                        md_vol is None
                        and doc.get("volume") is not None
                        and str(doc.get("volume")).lower() in ("", "none", "null")
                    ):
                        updates["volume"] = None

                    # Update group
                    md_group = matched_md.get("group_name")
                    if md_group and (
                        not doc.get("scanlation_group") or doc.get("scanlation_group") in ("No Group", "")
                    ):
                        updates["scanlation_group"] = md_group

                    # Update uploader
                    md_uploader = matched_md.get("uploader")
                    if md_uploader and not doc.get("uploader"):
                        updates["uploader"] = md_uploader

                    # Update dates
                    md_pub = matched_md.get("publish_at")
                    if md_pub and not doc.get("publish_at"):
                        try:
                            # parse ISO if string
                            if isinstance(md_pub, str):
                                dt = datetime.fromisoformat(md_pub.replace("Z", "+00:00"))
                                updates["publish_at"] = dt
                            else:
                                updates["publish_at"] = md_pub
                        except Exception:
                            pass

                    if updates:
                        updates["updated_at"] = now
                        await self._get_chapters_col().update_one({"_id": doc["_id"]}, {"$set": updates})
                        updated_count += 1

        return {
            "success": True,
            "updated_count": updated_count,
            "message": f"Đã đồng bộ và cập nhật metadata cho {updated_count} chapter(s) từ MangaDex.",
        }

    async def delete_chapter(self, chapter_id: str) -> bool:
        """Delete an entire chapter and remove all its pages from MinIO storage."""
        filter_query = {"_id": ObjectId(chapter_id)} if ObjectId.is_valid(chapter_id) else {"_id": chapter_id}
        chapter = await self._get_chapters_col().find_one(filter_query)
        if not chapter:
            return False

        manga_id = chapter["manga_id"]
        c_id_str = str(chapter["_id"])

        # Downloaded MangaDex pages use source UUIDs, not the Mongo chapter ID.
        # Delete the recorded objects and keep metadata if storage reports a failure.
        for page in chapter.get("pages", []):
            key = page.get("object_key")
            if key and not await asyncio.to_thread(minio_service.delete_chapter_page, key):
                raise RuntimeError("Không xóa được ảnh chương trong kho lưu trữ; hãy thử lại.")

        # Delete document from MongoDB
        await self._get_chapters_col().delete_one(filter_query)
        await self._get_reading_col().update_many({"manga_id": manga_id}, {"$pull": {"read_chapter_ids": c_id_str}})
        await self._get_reading_col().update_many(
            {"manga_id": manga_id, "last_read_chapter_id": c_id_str},
            {
                "$set": {
                    "last_read_chapter_id": None,
                    "last_read_chapter_number": None,
                    "last_read_page": 1,
                    "updated_at": datetime.utcnow(),
                }
            },
        )

        # Cascading delete extracted panels and vision features
        try:
            from backend.services.panel_scanner_service import panel_scanner_service

            await panel_scanner_service.delete_panels_for_chapter(c_id_str)
        except Exception as pe:
            logger.warning(f"Error cascading delete panels for chapter {c_id_str}: {pe}")

        # Log audit event
        try:
            manga_doc = await self._get_mangas_col().find_one({"_id": ObjectId(manga_id)})
            manga_title = manga_doc.get("title") if manga_doc else None
            await audit_service.log_event(
                entity_type="manga",
                entity_id=manga_id,
                entity_title=manga_title,
                action="delete_chapter",
                field="chapters",
                old_value=f"Ch. {chapter.get('chapter_number')}",
                new_value=None,
                actor="user",
                note=f"Deleted Chapter {chapter.get('chapter_number')} ({chapter.get('page_count', 0)} pages) from storage",
                details={"chapter_id": c_id_str, "chapter_number": chapter.get("chapter_number")},
            )
        except Exception as e:
            logger.error(f"Error logging audit for chapter deletion: {e}")

        return True

    async def delete_pages(self, chapter_id: str, page_numbers: List[int]) -> Dict[str, Any]:
        """Delete specific pages from a chapter, renumbering remaining pages."""
        filter_query = {"_id": ObjectId(chapter_id)} if ObjectId.is_valid(chapter_id) else {"_id": chapter_id}
        chapter = await self._get_chapters_col().find_one(filter_query)
        if not chapter:
            raise ValueError("Chapter not found")

        current_pages = chapter.get("pages", [])
        pages_to_keep = []
        deleted_count = 0

        target_set = set(page_numbers)
        for p in current_pages:
            if p["page_number"] in target_set:
                # Remove from MinIO
                obj_key = p.get("object_key")
                if obj_key:
                    minio_service.delete_chapter_page(obj_key)
                deleted_count += 1
            else:
                pages_to_keep.append(p)

        # Renumber remaining pages strictly 1..N and build mapping while preserving page_uid
        old_to_new = {}
        for idx, p in enumerate(pages_to_keep):
            old_num = p["page_number"]
            new_num = idx + 1
            p["page_number"] = new_num
            if not p.get("page_uid"):
                p["page_uid"] = str(uuid.uuid4())
            old_to_new[old_num] = new_num

        # Cascading delete panels for deleted pages and renumber remaining
        try:
            from backend.services.panel_scanner_service import panel_scanner_service

            await panel_scanner_service.delete_panels_for_pages(str(chapter["_id"]), list(page_numbers))
            await panel_scanner_service.renumber_panels_for_chapter(str(chapter["_id"]), old_to_new)
        except Exception as pe:
            logger.warning(f"Error cascading delete/renumber panels: {pe}")

        await self._get_chapters_col().update_one(
            filter_query,
            {
                "$set": {
                    "pages": pages_to_keep,
                    "page_count": len(pages_to_keep),
                    "updated_at": datetime.utcnow(),
                },
                "$inc": {"pages_revision": 1},
            },
        )

        progress = await self._get_reading_col().find_one(
            {"manga_id": chapter["manga_id"], "last_read_chapter_id": chapter_id}
        )
        if progress:
            old_page = progress.get("last_read_page", 1)
            new_page = old_to_new.get(old_page, max(1, min(old_page, len(pages_to_keep))))
            fields = {"last_read_page": new_page}
            if not pages_to_keep:
                fields.update({"last_read_chapter_id": None, "last_read_chapter_number": None})
            await self._get_reading_col().update_one(
                {"manga_id": chapter["manga_id"], "last_read_chapter_id": chapter_id, "last_read_page": old_page},
                {"$set": fields},
            )

        return {
            "chapter_id": chapter_id,
            "deleted_pages_count": deleted_count,
            "remaining_pages_count": len(pages_to_keep),
        }

    async def scan_local_folder(self, folder_path: str, manga_id: str) -> FolderScanResponse:
        """
        Scans a local directory for chapters to import.
        Analyzes subfolders, matches chapter patterns, counts image files, and checks duplicates.
        """
        clean_path = normalize_windows_path(folder_path.strip())
        if not os.path.exists(clean_path) or not os.path.isdir(clean_path):
            return FolderScanResponse(
                folder_path=clean_path,
                is_valid=False,
                message=f"Directory not found or inaccessible: {clean_path}",
                total_folders=0,
                detected_chapters=[],
                unrecognized_folders=[],
            )

        entries = os.listdir(clean_path)
        subdirs = [e for e in entries if os.path.isdir(os.path.join(clean_path, e))]
        direct_images = [e for e in entries if os.path.splitext(e)[1].lower() in IMAGE_EXTENSIONS]

        detected_chapters: List[DetectedChapter] = []
        unrecognized: List[str] = []

        # Fetch existing chapters for duplicate detection
        existing_chapters = await self.get_manga_chapters(manga_id)
        existing_map = {}
        for ec in existing_chapters:
            key = (str(ec["chapter_number"]).strip().lower(), (ec.get("scanlation_group") or "").strip().lower())
            existing_map[key] = ec["id"]

        # Case 1: Folder directly contains images (single chapter / oneshot)
        if direct_images and len(direct_images) > 0:
            parsed = parse_folder_name(os.path.basename(clean_path))
            dup_key = (
                str(parsed["chapter_number"]).strip().lower(),
                (parsed.get("scanlation_group") or "").strip().lower(),
            )
            is_dup = dup_key in existing_map

            detected_chapters.append(
                DetectedChapter(
                    folder_name=os.path.basename(clean_path),
                    folder_path=clean_path,
                    chapter_number=parsed["chapter_number"],
                    chapter_numeric=parsed["chapter_numeric"],
                    volume=parsed["volume"],
                    title=parsed["title"],
                    scanlation_group=parsed["scanlation_group"],
                    page_count=len(direct_images),
                    image_files=sorted(direct_images),
                    is_duplicate=is_dup,
                    existing_chapter_id=existing_map.get(dup_key),
                )
            )

        # Case 2: Subdirectories containing chapters
        for sub in sorted(subdirs):
            sub_full = os.path.join(clean_path, sub)
            try:
                sub_files = os.listdir(sub_full)
                images = [f for f in sub_files if os.path.splitext(f)[1].lower() in IMAGE_EXTENSIONS]
                if not images:
                    unrecognized.append(sub)
                    continue

                parsed = parse_folder_name(sub)
                dup_key = (
                    str(parsed["chapter_number"]).strip().lower(),
                    (parsed.get("scanlation_group") or "").strip().lower(),
                )
                is_dup = dup_key in existing_map

                detected_chapters.append(
                    DetectedChapter(
                        folder_name=sub,
                        folder_path=sub_full,
                        chapter_number=parsed["chapter_number"],
                        chapter_numeric=parsed["chapter_numeric"],
                        volume=parsed["volume"],
                        title=parsed["title"],
                        scanlation_group=parsed["scanlation_group"],
                        page_count=len(images),
                        image_files=sorted(images),
                        is_duplicate=is_dup,
                        existing_chapter_id=existing_map.get(dup_key),
                    )
                )
            except Exception as e:
                logger.warning(f"Error scanning folder '{sub}': {e}")
                unrecognized.append(sub)

        # Sort detected chapters naturally
        detected_chapters.sort(key=lambda c: (c.chapter_numeric, c.chapter_number))

        return FolderScanResponse(
            folder_path=clean_path,
            is_valid=True,
            message=f"Found {len(detected_chapters)} valid chapter folder(s).",
            total_folders=len(subdirs) if subdirs else 1,
            detected_chapters=detected_chapters,
            unrecognized_folders=unrecognized,
        )

    async def import_local_folder(
        self,
        manga_id: str,
        folder_path: str,
        conflict_strategy: str = "skip",
        default_language: str = "en",
        default_group: Optional[str] = None,
        selected_folders: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Imports detected chapters and image files into MinIO storage and creates MongoDB records.
        """
        scan_res = await self.scan_local_folder(folder_path, manga_id)
        if not scan_res.is_valid:
            raise ValueError(scan_res.message)

        target_chapters = scan_res.detected_chapters
        if selected_folders is not None and len(selected_folders) > 0:
            selected_set = set(selected_folders)
            target_chapters = [c for c in target_chapters if c.folder_name in selected_set]

        imported_count = 0
        skipped_count = 0
        total_pages_imported = 0
        errors = []

        for ch in target_chapters:
            try:
                # Conflict resolution
                if ch.is_duplicate:
                    if conflict_strategy == "skip":
                        skipped_count += 1
                        continue
                    elif conflict_strategy == "overwrite" and ch.existing_chapter_id:
                        await self.delete_chapter(ch.existing_chapter_id)
                    elif conflict_strategy == "keep_both":
                        # Append imported identifier to title or group
                        ch.title = f"{ch.title} (Imported)" if ch.title else "Imported"

                chapter_id = str(uuid.uuid4())
                page_items: List[PageItem] = []

                # Upload each image file
                for idx, img_file in enumerate(ch.image_files):
                    img_path = os.path.join(ch.folder_path, img_file)
                    with open(img_path, "rb") as f:
                        file_data = f.read()

                    ext = os.path.splitext(img_file)[1].lower()
                    target_filename = f"{idx + 1:03d}{ext}"
                    content_type = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"

                    obj_key, fsize, width, height, md5_h = minio_service.upload_chapter_page(
                        manga_id=manga_id,
                        chapter_id=chapter_id,
                        filename=target_filename,
                        data=file_data,
                        content_type=content_type,
                    )

                    page_items.append(
                        PageItem(
                            page_number=idx + 1,
                            filename=target_filename,
                            object_key=obj_key,
                            file_size=fsize,
                            width=width,
                            height=height,
                            md5_hash=md5_h,
                        )
                    )

                # Insert Chapter to DB
                now = datetime.utcnow()
                group_val = ch.scanlation_group or default_group or None
                chapter_doc = {
                    "_id": ObjectId(chapter_id) if ObjectId.is_valid(chapter_id) else chapter_id,
                    "manga_id": manga_id,
                    "chapter_number": ch.chapter_number,
                    "chapter_numeric": ch.chapter_numeric,
                    "volume": ch.volume,
                    "title": ch.title,
                    "language": default_language,
                    "scanlation_group": group_val,
                    "source": "local_import",
                    "pages": [p.dict() for p in page_items],
                    "page_count": len(page_items),
                    "pages_revision": 1,
                    "created_at": now,
                    "updated_at": now,
                }

                await self._get_chapters_col().insert_one(chapter_doc)
                imported_count += 1
                total_pages_imported += len(page_items)

            except Exception as e:
                logger.error(f"Failed to import chapter '{ch.folder_name}': {e}")
                errors.append({"folder": ch.folder_name, "error": str(e)})

        # Log audit event
        try:
            manga_doc = await self._get_mangas_col().find_one({"_id": ObjectId(manga_id)})
            manga_title = manga_doc.get("title") if manga_doc else None
            await audit_service.log_event(
                entity_type="manga",
                entity_id=manga_id,
                entity_title=manga_title,
                action="import_chapters",
                field="chapters",
                old_value=None,
                new_value=f"Imported {imported_count} chapter(s)",
                actor="user",
                note=f"Imported {imported_count} chapters ({total_pages_imported} pages) from {folder_path}",
                details={
                    "folder_path": folder_path,
                    "imported_count": imported_count,
                    "total_pages": total_pages_imported,
                    "skipped_count": skipped_count,
                },
            )
        except Exception as e:
            logger.error(f"Error logging import audit: {e}")

        return {
            "success": True,
            "imported_chapters": imported_count,
            "skipped_chapters": skipped_count,
            "total_pages_imported": total_pages_imported,
            "errors": errors,
        }

    async def stream_import_local_folder(
        self,
        manga_id: str,
        folder_path: str,
        conflict_strategy: str = "skip",
        default_language: str = "en",
        default_group: Optional[str] = None,
        selected_folders: Optional[List[str]] = None,
    ):
        """
        Async generator yielding SSE events with real-time granular progress for folder import.
        """
        start_time = time.time()
        scan_res = await self.scan_local_folder(folder_path, manga_id)
        if not scan_res.is_valid:
            yield f"data: {json.dumps({'type': 'error', 'error': scan_res.message})}\n\n"
            return

        target_chapters = scan_res.detected_chapters
        if selected_folders is not None and len(selected_folders) > 0:
            selected_set = set(selected_folders)
            target_chapters = [c for c in target_chapters if c.folder_name in selected_set]

        total_chapters = len(target_chapters)
        total_pages_overall = sum(len(c.image_files) for c in target_chapters)

        yield f"data: {json.dumps({'type': 'init', 'total_chapters': total_chapters, 'total_pages': total_pages_overall, 'manga_id': manga_id})}\n\n"

        imported_count = 0
        skipped_count = 0
        total_pages_imported = 0
        total_bytes_uploaded = 0
        errors = []

        for chap_idx, ch in enumerate(target_chapters, 1):
            try:
                # Check conflict
                if ch.is_duplicate:
                    if conflict_strategy == "skip":
                        skipped_count += 1
                        yield f"data: {json.dumps({'type': 'chapter_skipped', 'chapter_number': ch.chapter_number, 'chapter_title': ch.title, 'folder_name': ch.folder_name, 'reason': 'Đã có sẵn trong hệ thống (Skip)', 'chapter_index': chap_idx, 'total_chapters': total_chapters})}\n\n"
                        continue
                    elif conflict_strategy == "overwrite" and ch.existing_chapter_id:
                        await self.delete_chapter(ch.existing_chapter_id)
                    elif conflict_strategy == "keep_both":
                        ch.title = f"{ch.title} (Imported)" if ch.title else "Imported"

                chapter_id = str(uuid.uuid4())
                page_items: List[PageItem] = []
                chap_pages_count = len(ch.image_files)

                yield f"data: {json.dumps({'type': 'chapter_start', 'chapter_number': ch.chapter_number, 'chapter_title': ch.title, 'folder_name': ch.folder_name, 'chapter_index': chap_idx, 'total_chapters': total_chapters, 'chapter_page_count': chap_pages_count})}\n\n"

                for page_idx, img_file in enumerate(ch.image_files, 1):
                    img_path = os.path.join(ch.folder_path, img_file)
                    with open(img_path, "rb") as f:
                        file_data = f.read()

                    ext = os.path.splitext(img_file)[1].lower()
                    target_filename = f"{page_idx:03d}{ext}"
                    content_type = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"

                    obj_key, fsize, width, height, md5_h = minio_service.upload_chapter_page(
                        manga_id=manga_id,
                        chapter_id=chapter_id,
                        filename=target_filename,
                        data=file_data,
                        content_type=content_type,
                    )

                    page_items.append(
                        PageItem(
                            page_number=page_idx,
                            filename=target_filename,
                            object_key=obj_key,
                            file_size=fsize,
                            width=width,
                            height=height,
                            md5_hash=md5_h,
                        )
                    )

                    total_pages_imported += 1
                    total_bytes_uploaded += fsize
                    elapsed = max(0.05, time.time() - start_time)
                    speed = total_pages_imported / elapsed
                    remaining_pages = max(0, total_pages_overall - total_pages_imported)
                    eta = remaining_pages / max(0.1, speed)
                    overall_percent = (total_pages_imported / max(1, total_pages_overall)) * 100

                    preview_base64 = None
                    if page_idx == 1 or page_idx % 3 == 0:
                        try:
                            with Image.open(io.BytesIO(file_data)) as thumb_img:
                                thumb_img.thumbnail((140, 190), Image.Resampling.LANCZOS)
                                if thumb_img.mode in ("RGBA", "P"):
                                    thumb_img = thumb_img.convert("RGB")
                                buf = io.BytesIO()
                                thumb_img.save(buf, format="JPEG", quality=70)
                                preview_base64 = (
                                    f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
                                )
                        except Exception:
                            pass

                    yield f"data: {
                        json.dumps(
                            {
                                'type': 'page_progress',
                                'chapter_number': ch.chapter_number,
                                'chapter_title': ch.title,
                                'chapter_index': chap_idx,
                                'total_chapters': total_chapters,
                                'remaining_chapters': max(0, total_chapters - chap_idx),
                                'page_number': page_idx,
                                'chapter_page_count': chap_pages_count,
                                'total_pages_done': total_pages_imported,
                                'total_pages_overall': total_pages_overall,
                                'remaining_pages': remaining_pages,
                                'filename': img_file,
                                'file_size': fsize,
                                'total_bytes_uploaded': total_bytes_uploaded,
                                'speed_pages_per_sec': round(speed, 1),
                                'speed_mb_per_sec': round((total_bytes_uploaded / (1024 * 1024)) / elapsed, 2),
                                'elapsed_seconds': round(elapsed, 1),
                                'eta_seconds': round(eta, 1),
                                'percent': round(overall_percent, 1),
                                'preview_base64': preview_base64,
                            }
                        )
                    }\n\n"

                # Insert Chapter to DB
                now = datetime.utcnow()
                group_val = ch.scanlation_group or default_group or None
                chapter_doc = {
                    "_id": ObjectId(chapter_id) if ObjectId.is_valid(chapter_id) else chapter_id,
                    "manga_id": manga_id,
                    "chapter_number": ch.chapter_number,
                    "chapter_numeric": ch.chapter_numeric,
                    "volume": ch.volume,
                    "title": ch.title,
                    "language": default_language,
                    "scanlation_group": group_val,
                    "source": "local_import",
                    "pages": [p.dict() for p in page_items],
                    "page_count": len(page_items),
                    "pages_revision": 1,
                    "created_at": now,
                    "updated_at": now,
                }

                await self._get_chapters_col().insert_one(chapter_doc)
                imported_count += 1

                yield f"data: {
                    json.dumps(
                        {
                            'type': 'chapter_done',
                            'chapter_number': ch.chapter_number,
                            'chapter_title': ch.title,
                            'chapter_index': chap_idx,
                            'total_chapters': total_chapters,
                            'page_count': len(page_items),
                            'message': f'Hoàn thành Chapter {ch.chapter_number} ({len(page_items)} trang)',
                        }
                    )
                }\n\n"

            except Exception as e:
                logger.error(f"Error importing chapter '{ch.folder_name}': {e}")
                errors.append({"folder": ch.folder_name, "error": str(e)})
                yield f"data: {
                    json.dumps(
                        {
                            'type': 'chapter_error',
                            'chapter_number': ch.chapter_number,
                            'folder_name': ch.folder_name,
                            'error': str(e),
                        }
                    )
                }\n\n"

        # Log audit event
        try:
            manga_doc = await self._get_mangas_col().find_one({"_id": ObjectId(manga_id)})
            manga_title = manga_doc.get("title") if manga_doc else None
            await audit_service.log_event(
                entity_type="manga",
                entity_id=manga_id,
                entity_title=manga_title,
                action="import_chapters",
                field="chapters",
                old_value=None,
                new_value=f"Imported {imported_count} chapter(s)",
                actor="user",
                note=f"Imported {imported_count} chapters ({total_pages_imported} pages) from {folder_path}",
                details={
                    "folder_path": folder_path,
                    "imported_count": imported_count,
                    "total_pages": total_pages_imported,
                    "skipped_count": skipped_count,
                },
            )
        except Exception as e:
            logger.error(f"Error logging import audit: {e}")

        total_elapsed = round(time.time() - start_time, 1)
        yield f"data: {
            json.dumps(
                {
                    'type': 'complete',
                    'imported_chapters': imported_count,
                    'total_pages_imported': total_pages_imported,
                    'skipped_chapters': skipped_count,
                    'total_bytes_uploaded': total_bytes_uploaded,
                    'elapsed_seconds': total_elapsed,
                    'errors': errors,
                }
            )
        }\n\n"

    async def scan_storage_duplicates(
        self, manga_id: str, chapter_id: Optional[str] = None
    ) -> List[StorageDuplicateGroup]:
        """
        Scans all stored pages for duplicate image content using MD5 hashes.
        Returns groups of duplicate pages with preview URLs for side-by-side inspection.
        """
        query: Dict[str, Any] = {"manga_id": manga_id}
        if chapter_id:
            if ObjectId.is_valid(chapter_id):
                query["_id"] = {"$in": [ObjectId(chapter_id), chapter_id]}
            else:
                query["_id"] = chapter_id

        cursor = self._get_chapters_col().find(query)
        hash_map: Dict[str, List[StorageDuplicateItem]] = {}

        async for ch in cursor:
            c_id = str(ch["_id"])
            c_num = str(ch.get("chapter_number", ""))
            c_title = ch.get("title", "")
            pages = ch.get("pages", [])

            for p in pages:
                md5_val = p.get("md5_hash")
                if not md5_val:
                    continue

                obj_key = p.get("object_key", "")
                url = minio_service.get_presigned_url(obj_key) if obj_key else None

                item = StorageDuplicateItem(
                    chapter_id=c_id,
                    chapter_number=c_num,
                    chapter_title=c_title,
                    page_number=p.get("page_number", 1),
                    filename=p.get("filename", ""),
                    object_key=obj_key,
                    file_size=p.get("file_size", 0),
                    url=url,
                )
                hash_map.setdefault(md5_val, []).append(item)

        # Filter to only hashes that appear more than once
        duplicate_groups: List[StorageDuplicateGroup] = []
        for h, items in hash_map.items():
            if len(items) > 1:
                duplicate_groups.append(StorageDuplicateGroup(md5_hash=h, file_size=items[0].file_size, items=items))

        # Sort by wasted size desc
        duplicate_groups.sort(key=lambda g: g.file_size * (len(g.items) - 1), reverse=True)
        return duplicate_groups

    async def delete_storage_duplicate_pages(self, manga_id: str, object_keys_to_delete: List[str]) -> Dict[str, Any]:
        """
        Deletes specified duplicate page keys from MinIO and updates the chapter pages array in MongoDB.
        """
        if not object_keys_to_delete:
            return {"deleted_count": 0}

        target_keys = set(object_keys_to_delete)
        deleted_count = 0

        # Find chapters containing these keys
        cursor = self._get_chapters_col().find({"manga_id": manga_id, "pages.object_key": {"$in": list(target_keys)}})

        async for ch in cursor:
            ch_id = ch["_id"]
            updated_pages = []
            modified = False

            for p in ch.get("pages", []):
                if p.get("object_key") in target_keys:
                    minio_service.delete_chapter_page(p["object_key"])
                    deleted_count += 1
                    modified = True
                else:
                    updated_pages.append(p)

            if modified:
                # Renumber remaining pages while preserving page_uid
                for idx, p in enumerate(updated_pages):
                    p["page_number"] = idx + 1
                    if not p.get("page_uid"):
                        p["page_uid"] = str(uuid.uuid4())

                await self._get_chapters_col().update_one(
                    {"_id": ch_id},
                    {
                        "$set": {
                            "pages": updated_pages,
                            "page_count": len(updated_pages),
                            "updated_at": datetime.utcnow(),
                        },
                        "$inc": {"pages_revision": 1},
                    },
                )

        return {"deleted_count": deleted_count}

    async def get_reading_progress(self, manga_id: str) -> Dict[str, Any]:
        """Get user reading state for a manga."""
        doc = await self._get_reading_col().find_one({"manga_id": manga_id})
        if not doc:
            return {
                "manga_id": manga_id,
                "last_read_chapter_id": None,
                "last_read_chapter_number": None,
                "last_read_page": 1,
                "read_chapter_ids": [],
                "reading_mode": "long_strip",
                "fit_mode": "width",
            }
        doc["_id"] = str(doc["_id"])
        return doc

    async def save_reading_progress(
        self,
        manga_id: str,
        chapter_id: str,
        chapter_number: str,
        page: int = 1,
        reading_mode: str = "long_strip",
        fit_mode: str = "width",
        mark_as_read: bool = False,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Save user reading position and settings."""
        key = ObjectId(chapter_id) if ObjectId.is_valid(chapter_id) else chapter_id
        chapter = await self._get_chapters_col().find_one({"_id": key, "manga_id": manga_id})
        if not chapter:
            raise ValueError("Chapter does not belong to this manga or no longer exists")
        page_count = len(chapter.get("pages", []))
        if not 1 <= page <= page_count:
            raise ValueError("Page is outside the stored chapter")
        if reading_mode not in {"long_strip", "single", "double_ltr", "double_rtl"} or fit_mode not in {
            "width",
            "height",
            "original",
        }:
            raise ValueError("Invalid reader settings")
        now = datetime.utcnow()
        update_data = {
            "manga_id": manga_id,
            "last_read_chapter_id": chapter_id,
            "last_read_chapter_number": chapter.get("chapter_number", chapter_number),
            "last_read_page": max(1, page),
            "reading_mode": reading_mode,
            "fit_mode": fit_mode,
            "updated_at": now,
        }
        chapter_language = chapter.get("language") or language
        if chapter_language:
            update_data["last_read_language"] = chapter_language.lower()
        update = {"$set": update_data}
        if mark_as_read:
            update["$addToSet"] = {"read_chapter_ids": chapter_id}
        else:
            update["$setOnInsert"] = {"read_chapter_ids": []}
        await self._get_reading_col().update_one({"manga_id": manga_id}, update, upsert=True)

        # Also auto-update manga status to 'reading' if currently 'unread' or 'plan_to_read'
        try:
            manga = await self._get_mangas_col().find_one({"_id": ObjectId(manga_id)})
            if manga and manga.get("read_status") in ["unread", "plan_to_read"]:
                await self._get_mangas_col().update_one(
                    {"_id": ObjectId(manga_id)},
                    {"$set": {"read_status": "reading", "reading_at": now, "updated_at": now}},
                )
        except Exception as e:
            logger.warning(f"Failed to auto-update manga status on reading: {e}")

        return update_data

    async def delete_latest_chapter(self, manga_id: str, language: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Find and delete the most recently downloaded / highest chapter for a manga,
        optionally filtered by language, cleaning it up from MongoDB, MinIO, and local disk.
        """
        query: Dict[str, Any] = {"manga_id": manga_id}
        if language:
            query["language"] = language.lower()

        cursor = self._get_chapters_col().find(query).sort([("chapter_numeric", -1), ("created_at", -1)]).limit(1)

        latest_chap = None
        async for doc in cursor:
            latest_chap = doc
            break

        if not latest_chap:
            return None

        c_id = str(latest_chap["_id"])
        c_num = latest_chap.get("chapter_number", "")
        c_title = latest_chap.get("title", "")
        c_lang = latest_chap.get("language", "")

        # 1. Delete from MinIO & MongoDB via delete_chapter
        await self.delete_chapter(c_id)

        # Only remove the exact path recorded for this chapter. Guessing a
        # directory from chapter number can delete another language/group.
        local_path = latest_chap.get("local_path")
        if local_path:
            manga_key = ObjectId(manga_id) if ObjectId.is_valid(manga_id) else manga_id
            manga = await self._get_mangas_col().find_one({"_id": manga_key})
            root = os.path.realpath(manga.get("download_path", "")) if manga and manga.get("download_path") else None
            target = os.path.realpath(local_path)
            if root and target != root and os.path.commonpath([root, target]) == root and os.path.isdir(target):
                import shutil

                await asyncio.to_thread(shutil.rmtree, target)

        return {"chapter_id": c_id, "chapter_number": c_num, "title": c_title, "language": c_lang}


chapter_service = ChapterService()
