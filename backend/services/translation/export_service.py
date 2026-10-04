"""Translation Chapter Export Service.

Packages translated manga chapters (incorporating original fallback pages for untranslated ones)
into standardized ZIP / CBZ archives with sequential filenames and a manifest.json descriptor.
"""

import io
import json
import logging
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List

import backend.database.connection as db_conn
from backend.services.translation.storage_service import translation_storage_service

logger = logging.getLogger("backend.translation.export")


class TranslationExportService:
    async def _fetch_object_bytes(self, object_key: str) -> bytes:
        """Fetches raw image bytes from storage for packaging."""
        if not object_key:
            return b""
        return await translation_storage_service.get_object_bytes(object_key)

    async def export_chapter(
        self,
        chapter_id: str,
        target_language: str = "vi",
        format: str = "zip",
    ) -> bytes:
        """Exports a chapter into a ZIP archive with translated pages and manifest.json."""
        db = db_conn.get_db()
        chapter = await db["chapters"].find_one({"id": chapter_id})
        if not chapter:
            # Fallback check for MongoDB ObjectId or string id
            chapter = await db["chapters"].find_one({"_id": chapter_id})
        if not chapter:
            raise KeyError(f"Chapter '{chapter_id}' not found")

        # Fetch active bindings
        bindings_cursor = db["translation_page_bindings"].find({"chapter_id": chapter_id})
        bindings_list = await bindings_cursor.to_list(length=2000)
        bindings_map = {b.get("page_uid"): b for b in bindings_list if b.get("page_uid")}

        raw_pages = chapter.get("pages", [])
        # Sort pages sequentially
        sorted_pages = sorted(raw_pages, key=lambda p: p.get("page_number", 0))

        zip_buf = io.BytesIO()
        manifest_pages: List[Dict[str, Any]] = []

        with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for idx, page in enumerate(sorted_pages):
                page_num = page.get("page_number", idx + 1)
                page_uid = page.get("page_uid", str(idx + 1))
                filename = f"{page_num:03d}.jpg"

                binding = bindings_map.get(page_uid)
                if binding and binding.get("output_object_key"):
                    target_key = binding["output_object_key"]
                    status = "translated"
                else:
                    target_key = page.get("object_key", "")
                    status = "original_fallback"

                data = await self._fetch_object_bytes(target_key)
                zf.writestr(filename, data)

                manifest_pages.append(
                    {
                        "page_number": page_num,
                        "page_uid": page_uid,
                        "filename": filename,
                        "status": status,
                        "object_key": target_key,
                        "size_bytes": len(data),
                    }
                )

            # Write manifest.json
            manifest = {
                "chapter_id": chapter_id,
                "chapter_number": chapter.get("chapter_number"),
                "title": chapter.get("title", ""),
                "target_language": target_language,
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "total_pages": len(manifest_pages),
                "pages": manifest_pages,
            }
            zf.writestr("manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False))

        return zip_buf.getvalue()


translation_export_service = TranslationExportService()
