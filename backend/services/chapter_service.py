import os
import re
import uuid
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from bson import ObjectId

from backend.database.connection import get_db
from backend.services.minio_service import minio_service
from backend.services.audit_service import audit_service
from backend.utils.file_utils import clean_filename, normalize_windows_path
from backend.models.chapter import (
    PageItem,
    ChapterInDB,
    DetectedChapter,
    FolderScanResponse,
    ReadingProgress,
    StorageDuplicateGroup,
    StorageDuplicateItem
)

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'}

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
    match = re.search(r'(\d+(?:\.\d+)?)', clean)
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
    result = {
        "volume": None,
        "chapter_number": "1",
        "chapter_numeric": 1.0,
        "title": "",
        "scanlation_group": None
    }

    # Extract scanlation group from brackets [Group] or parentheses at end
    group_match = re.search(r'\[([^\]]+)\]\s*$', name)
    if group_match:
        result["scanlation_group"] = group_match.group(1).strip()
        name = name[:group_match.start()].strip()
    else:
        group_match2 = re.search(r'\(([^)]+)\)\s*$', name)
        if group_match2:
            potential_group = group_match2.group(1).strip()
            # If not a number, likely a group
            if not re.match(r'^\d+(\.\d+)?$', potential_group):
                result["scanlation_group"] = potential_group
                name = name[:group_match2.start()].strip()

    # Extract volume if present e.g. Vol. 1 or Volume 02
    vol_match = re.search(r'(?:vol(?:ume)?\.?\s*(\d+))', name, re.IGNORECASE)
    if vol_match:
        result["volume"] = vol_match.group(1)
        # Remove volume part from name
        name = name[:vol_match.start()] + name[vol_match.end():]
        name = name.strip()

    # Check for oneshot
    if re.search(r'\b(oneshot|one-shot)\b', name, re.IGNORECASE):
        result["chapter_number"] = "oneshot"
        result["chapter_numeric"] = 0.0
        # Title might be after dash
        parts = re.split(r'[-–:]', name, maxsplit=1)
        if len(parts) > 1:
            result["title"] = parts[1].strip()
        return result

    # Match Chapter number e.g. Chapter 1.5, Ch. 2, Chap 3, or leading numbers
    chap_match = re.search(r'(?:ch(?:apter)?\.?|chap\.?|c)\s*([0-9]+(?:\.[0-9]+)?)', name, re.IGNORECASE)
    if chap_match:
        c_num = chap_match.group(1)
        result["chapter_number"] = c_num
        result["chapter_numeric"] = parse_chapter_numeric(c_num)
        
        # Remaining text might be title
        remainder = name[chap_match.end():].strip()
        # Strip leading dash/colon
        remainder = re.sub(r'^[-–:]\s*', '', remainder).strip()
        if remainder:
            result["title"] = remainder
    else:
        # Check if folder starts with numbers e.g. "01 - The Beginning"
        lead_num = re.match(r'^([0-9]+(?:\.[0-9]+)?)(?:\s*[-–:]\s*(.*))?$', name)
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
        self,
        manga_id: str,
        language: Optional[str] = None,
        group: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List all stored chapters for a manga, sorted naturally by chapter number."""
        query: Dict[str, Any] = {"manga_id": manga_id}
        if language:
            query["language"] = language
        if group:
            query["scanlation_group"] = group

        cursor = self._get_chapters_col().find(query).sort([
            ("chapter_numeric", 1),
            ("chapter_number", 1),
            ("created_at", 1)
        ])

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

        if include_presigned_urls and "pages" in chapter:
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

        now = datetime.utcnow()
        doc = {
            "manga_id": str(chapter_data["manga_id"]),
            "chapter_number": c_num,
            "chapter_numeric": c_numeric,
            "volume": chapter_data.get("volume"),
            "title": chapter_data.get("title", ""),
            "language": chapter_data.get("language", "en"),
            "scanlation_group": chapter_data.get("scanlation_group"),
            "source": chapter_data.get("source", "mangadex"),
            "source_id": chapter_data.get("source_id"),
            "pages": pages,
            "page_count": page_count,
            "updated_at": now
        }

        # Check if existing chapter matches (manga_id, chapter_number, language, scanlation_group)
        existing = await self._get_chapters_col().find_one({
            "manga_id": doc["manga_id"],
            "chapter_number": doc["chapter_number"],
            "language": doc["language"],
            "scanlation_group": doc["scanlation_group"]
        })

        if existing:
            await self._get_chapters_col().update_one(
                {"_id": existing["_id"]},
                {"$set": doc}
            )
            return str(existing["_id"])
        else:
            doc["created_at"] = now
            result = await self._get_chapters_col().insert_one(doc)
            return str(result.inserted_id)

    async def delete_chapter(self, chapter_id: str) -> bool:
        """Delete an entire chapter and remove all its pages from MinIO storage."""
        filter_query = {"_id": ObjectId(chapter_id)} if ObjectId.is_valid(chapter_id) else {"_id": chapter_id}
        chapter = await self._get_chapters_col().find_one(filter_query)
        if not chapter:
            return False

        manga_id = chapter["manga_id"]
        c_id_str = str(chapter["_id"])

        # Delete all objects in MinIO
        minio_service.delete_chapter_folder(manga_id, c_id_str)

        # Delete document from MongoDB
        await self._get_chapters_col().delete_one(filter_query)

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
                details={"chapter_id": c_id_str, "chapter_number": chapter.get("chapter_number")}
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

        # Renumber remaining pages strictly 1..N
        for idx, p in enumerate(pages_to_keep):
            p["page_number"] = idx + 1

        await self._get_chapters_col().update_one(
            filter_query,
            {
                "$set": {
                    "pages": pages_to_keep,
                    "page_count": len(pages_to_keep),
                    "updated_at": datetime.utcnow()
                }
            }
        )

        return {
            "chapter_id": chapter_id,
            "deleted_pages_count": deleted_count,
            "remaining_pages_count": len(pages_to_keep)
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
                unrecognized_folders=[]
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
            dup_key = (str(parsed["chapter_number"]).strip().lower(), (parsed.get("scanlation_group") or "").strip().lower())
            is_dup = dup_key in existing_map

            detected_chapters.append(DetectedChapter(
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
                existing_chapter_id=existing_map.get(dup_key)
            ))

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
                dup_key = (str(parsed["chapter_number"]).strip().lower(), (parsed.get("scanlation_group") or "").strip().lower())
                is_dup = dup_key in existing_map

                detected_chapters.append(DetectedChapter(
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
                    existing_chapter_id=existing_map.get(dup_key)
                ))
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
            unrecognized_folders=unrecognized
        )

    async def import_local_folder(
        self,
        manga_id: str,
        folder_path: str,
        conflict_strategy: str = "skip",
        default_language: str = "en",
        default_group: Optional[str] = None,
        selected_folders: Optional[List[str]] = None
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
                        content_type=content_type
                    )

                    page_items.append(PageItem(
                        page_number=idx + 1,
                        filename=target_filename,
                        object_key=obj_key,
                        file_size=fsize,
                        width=width,
                        height=height,
                        md5_hash=md5_h
                    ))

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
                    "created_at": now,
                    "updated_at": now
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
                    "skipped_count": skipped_count
                }
            )
        except Exception as e:
            logger.error(f"Error logging import audit: {e}")

        return {
            "success": True,
            "imported_chapters": imported_count,
            "skipped_chapters": skipped_count,
            "total_pages_imported": total_pages_imported,
            "errors": errors
        }

    async def scan_storage_duplicates(self, manga_id: str, chapter_id: Optional[str] = None) -> List[StorageDuplicateGroup]:
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
                    url=url
                )
                hash_map.setdefault(md5_val, []).append(item)

        # Filter to only hashes that appear more than once
        duplicate_groups: List[StorageDuplicateGroup] = []
        for h, items in hash_map.items():
            if len(items) > 1:
                duplicate_groups.append(StorageDuplicateGroup(
                    md5_hash=h,
                    file_size=items[0].file_size,
                    items=items
                ))

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
                # Renumber remaining pages
                for idx, p in enumerate(updated_pages):
                    p["page_number"] = idx + 1

                await self._get_chapters_col().update_one(
                    {"_id": ch_id},
                    {
                        "$set": {
                            "pages": updated_pages,
                            "page_count": len(updated_pages),
                            "updated_at": datetime.utcnow()
                        }
                    }
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
                "fit_mode": "width"
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
        mark_as_read: bool = False
    ) -> Dict[str, Any]:
        """Save user reading position and settings."""
        now = datetime.utcnow()
        doc = await self._get_reading_col().find_one({"manga_id": manga_id})
        read_chapters = doc.get("read_chapter_ids", []) if doc else []

        if mark_as_read and chapter_id not in read_chapters:
            read_chapters.append(chapter_id)

        update_data = {
            "manga_id": manga_id,
            "last_read_chapter_id": chapter_id,
            "last_read_chapter_number": chapter_number,
            "last_read_page": max(1, page),
            "read_chapter_ids": read_chapters,
            "reading_mode": reading_mode,
            "fit_mode": fit_mode,
            "updated_at": now
        }

        await self._get_reading_col().update_one(
            {"manga_id": manga_id},
            {"$set": update_data},
            upsert=True
        )

        # Also auto-update manga status to 'reading' if currently 'unread' or 'plan_to_read'
        try:
            manga = await self._get_mangas_col().find_one({"_id": ObjectId(manga_id)})
            if manga and manga.get("read_status") in ["unread", "plan_to_read"]:
                await self._get_mangas_col().update_one(
                    {"_id": ObjectId(manga_id)},
                    {"$set": {"read_status": "reading", "reading_at": now, "updated_at": now}}
                )
        except Exception as e:
            logger.warning(f"Failed to auto-update manga status on reading: {e}")

        return update_data

chapter_service = ChapterService()
