"""Translation Editor and Re-render Service.

Provides region text updating with optimistic revision locking (preventing 409 conflicts),
pure-canvas re-rendering (rendering text directly onto clean image with ZERO LLM calls),
and publishing verified results into chapter page bindings.
"""

import io
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from PIL import Image, ImageDraw, ImageFont

import backend.database.connection as db_conn
from backend.models.translation import RegionData
from backend.services.translation.storage_service import translation_storage_service

logger = logging.getLogger("backend.translation.editor")


class TranslationEditorService:
    async def save_regions(
        self,
        result_id: str,
        regions: List[Union[RegionData, Dict[str, Any]]],
        expected_revision: int,
    ) -> Dict[str, Any]:
        """Updates region annotations and increments active_revision with conflict checking."""
        db = db_conn.get_db()
        result = await db["translation_results"].find_one({"result_id": result_id})
        if not result:
            raise KeyError(f"Translation result '{result_id}' not found")

        current_revision = result.get("active_revision", 1)
        if current_revision != expected_revision:
            raise ValueError(f"Revision conflict: current revision is {current_revision}, expected {expected_revision}")

        new_revision = expected_revision + 1

        serialized_regions = []
        for r in regions:
            if hasattr(r, "model_dump"):
                serialized_regions.append(r.model_dump())
            elif isinstance(r, dict):
                serialized_regions.append(r)
            else:
                serialized_regions.append(dict(r))

        now = datetime.now(timezone.utc)
        await db["translation_results"].update_one(
            {"result_id": result_id},
            {
                "$set": {
                    "active_revision": new_revision,
                    "regions": serialized_regions,
                    "updated_at": now,
                }
            },
        )

        result["active_revision"] = new_revision
        result["regions"] = serialized_regions
        result["updated_at"] = now
        result.pop("_id", None)
        return result

    async def rerender_result(
        self,
        result_id: str,
        font_path: Optional[str] = None,
        font_bytes: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        """Re-renders text regions onto the clean image canvas with ZERO external LLM provider calls."""
        db = db_conn.get_db()
        result = await db["translation_results"].find_one({"result_id": result_id})
        if not result:
            raise KeyError(f"Translation result '{result_id}' not found")

        source_key = result.get("clean_object_key") or result.get("output_object_key")
        img_bytes = b""
        if source_key:
            try:
                img_bytes = await translation_storage_service.get_object_bytes(source_key)
            except Exception as e:
                logger.warning(f"Failed to fetch image bytes for rerender: {e}")

        if img_bytes:
            try:
                img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            except Exception:
                img = Image.new("RGB", (800, 1200), color=(255, 255, 255))
        else:
            w = result.get("width") or 800
            h = result.get("height") or 1200
            img = Image.new("RGB", (w, h), color=(255, 255, 255))

        draw = ImageDraw.Draw(img)

        # Load font if available, fallback to default
        font = None
        if font_bytes:
            try:
                font = ImageFont.truetype(io.BytesIO(font_bytes), size=24)
            except Exception as e:
                logger.warning(f"Could not load font from bytes: {e}")
        elif font_path:
            try:
                font = ImageFont.truetype(font_path, size=24)
            except Exception as e:
                logger.warning(f"Could not load specified font '{font_path}': {e}")
        if not font:
            font = ImageFont.load_default()

        # Render regions
        regions = result.get("regions", [])
        for region in regions:
            bbox = region.get("bounding_box", {})
            rx = int(bbox.get("x", 0) * img.width)
            ry = int(bbox.get("y", 0) * img.height)
            rw = max(int(bbox.get("width", 0) * img.width), 20)
            rh = max(int(bbox.get("height", 0) * img.height), 20)

            text = region.get("translated_text", "")
            if not text:
                continue

            # Draw white bubble background
            draw.rectangle([rx, ry, rx + rw, ry + rh], fill=(255, 255, 255), outline=(220, 220, 220))

            # Simple text wrap into the box
            words = text.split()
            lines = []
            cur_line = []
            for w_word in words:
                cur_line.append(w_word)
                if len(" ".join(cur_line)) > max(rw // 12, 10):
                    lines.append(" ".join(cur_line[:-1]))
                    cur_line = [w_word]
            if cur_line:
                lines.append(" ".join(cur_line))

            text_y = ry + 4
            for line in lines:
                draw.text((rx + 4, text_y), line, fill=(0, 0, 0), font=font)
                text_y += 18
                if text_y > ry + rh - 10:
                    break

        # Save composited image to bytes
        out_buf = io.BytesIO()
        img.save(out_buf, format="JPEG", quality=92)
        new_image_bytes = out_buf.getvalue()

        # Upload and update active revision
        cur_rev = result.get("active_revision", 1)
        new_output_key = f"translation/outputs/{result_id}_rev{cur_rev}.jpg"
        await translation_storage_service.upload_file(new_output_key, new_image_bytes, "image/jpeg")

        now = datetime.now(timezone.utc)
        await db["translation_results"].update_one(
            {"result_id": result_id},
            {
                "$set": {
                    "output_object_key": new_output_key,
                    "updated_at": now,
                }
            },
        )

        result["output_object_key"] = new_output_key
        result["updated_at"] = now
        result.pop("_id", None)
        return result

    async def publish_result(
        self,
        chapter_id: str,
        page_uid: str,
        result_id: str,
        revision: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Binds a chosen translation result to a specific chapter page."""
        db = db_conn.get_db()
        result = await db["translation_results"].find_one({"result_id": result_id})
        if not result:
            raise KeyError(f"Translation result '{result_id}' not found")

        active_rev = revision or result.get("active_revision", 1)
        output_key = result.get("output_object_key", "")
        source_hash = result.get("source_sha256", "")
        target_lang = result.get("target_language", "vi")

        now = datetime.now(timezone.utc)
        query = {
            "chapter_id": chapter_id,
            "page_uid": page_uid,
            "target_language": target_lang,
        }
        update = {
            "$set": {
                "chapter_id": chapter_id,
                "page_uid": page_uid,
                "target_language": target_lang,
                "chosen_result_id": result_id,
                "chosen_revision": active_rev,
                "output_object_key": output_key,
                "validated_source_hash": source_hash,
                "updated_at": now,
            }
        }
        await db["translation_page_bindings"].update_one(query, update, upsert=True)

        return {
            "status": "published",
            "chapter_id": chapter_id,
            "page_uid": page_uid,
            "chosen_result_id": result_id,
            "chosen_revision": active_rev,
            "output_object_key": output_key,
        }


translation_editor_service = TranslationEditorService()
