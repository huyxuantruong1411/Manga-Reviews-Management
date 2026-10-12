import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from backend.database.connection import get_db
from backend.services.datasources.url_utils import normalize_chapter_candidate

logger = logging.getLogger(__name__)


class ChapterSlotService:
    """
    Manages logical chapter slots, providing unified reading coverage,
    edition/numbering scope grouping, and preferred release pointers.
    """

    def _get_slots_col(self):
        return get_db().chapter_slots

    def _get_chapters_col(self):
        return get_db().chapters

    async def get_or_create_slot(
        self,
        manga_id: str,
        chapter_number: str,
        language: str = "en",
        unit_kind: str = "chapter",
        numbering_scope_id: str = "scope_default",
        title: Optional[str] = "",
        volume: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Gets an existing slot or creates a new logical slot for a chapter number.
        Uses normalize_chapter_candidate to ensure 14, 014, and 14.0 map to the same slot key.
        """
        chapter_key, numeric_hint, is_special = normalize_chapter_candidate(chapter_number)
        now = datetime.now(timezone.utc)

        query = {
            "manga_id": str(manga_id),
            "language": language.lower(),
            "numbering_scope_id": numbering_scope_id,
            "unit_kind": unit_kind,
            "chapter_key": chapter_key,
        }

        existing = await self._get_slots_col().find_one(query)
        if existing:
            existing["_id"] = str(existing["_id"])
            return existing

        doc = {
            "manga_id": str(manga_id),
            "language": language.lower(),
            "unit_kind": unit_kind,
            "numbering_scope_id": numbering_scope_id,
            "chapter_key": chapter_key,
            "chapter_display": str(chapter_number).strip(),
            "title": title or "",
            "volume": volume,
            "preferred_chapter_id": None,
            "mapping_state": "verified",
            "is_excluded": False,
            "created_at": now,
            "updated_at": now,
        }

        res = await self._get_slots_col().insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        return doc

    async def bind_chapter_to_slot(self, chapter_id: str, chapter_doc: Dict[str, Any]) -> str:
        """
        Ensures a stored chapter document is bound to a logical slot.
        If the slot has no preferred chapter or the preferred chapter is invalid,
        sets this chapter as preferred.
        """
        manga_id = str(chapter_doc["manga_id"])
        c_num = str(chapter_doc.get("chapter_number", "1"))
        lang = str(chapter_doc.get("language", "en")).lower()
        title = chapter_doc.get("title", "")
        vol = chapter_doc.get("volume")

        slot = await self.get_or_create_slot(
            manga_id=manga_id,
            chapter_number=c_num,
            language=lang,
            title=title,
            volume=vol,
        )

        slot_id = str(slot["_id"])

        # Update slot preferred_chapter_id if not set
        if not slot.get("preferred_chapter_id"):
            db_slot_id = ObjectId(slot_id) if ObjectId.is_valid(slot_id) else slot_id
            await self._get_slots_col().update_one(
                {"_id": db_slot_id},
                {"$set": {"preferred_chapter_id": str(chapter_id), "updated_at": datetime.now(timezone.utc)}},
            )

        # Update chapter document's logical_chapter_id if missing
        db_chap_id = ObjectId(chapter_id) if ObjectId.is_valid(chapter_id) else chapter_id
        await self._get_chapters_col().update_one(
            {"_id": db_chap_id},
            {"$set": {"logical_chapter_id": slot_id}},
        )

        return slot_id

    async def set_preferred_chapter(self, slot_id: str, chapter_id: str) -> bool:
        """
        Updates the preferred release pointer for a logical slot.
        """
        db_slot_id = ObjectId(slot_id) if ObjectId.is_valid(slot_id) else slot_id
        res = await self._get_slots_col().update_one(
            {"_id": db_slot_id},
            {"$set": {"preferred_chapter_id": str(chapter_id), "updated_at": datetime.now(timezone.utc)}},
        )
        return res.modified_count > 0

    async def get_manga_slots(self, manga_id: str, language: str = "en") -> List[Dict[str, Any]]:
        """
        Returns all logical slots for a manga with attached stored releases and ready states.
        """
        query = {"manga_id": str(manga_id), "language": language.lower()}
        cursor = self._get_slots_col().find(query)
        slots = []
        async for s in cursor:
            s["_id"] = str(s["_id"])
            slots.append(s)

        # Natural sort helper by chapter_key
        def sort_key(s):
            key = s.get("chapter_key", "0")
            try:
                return (0, float(key))
            except ValueError:
                return (1, key)

        slots.sort(key=sort_key)

        # For each slot, fetch stored releases
        for s in slots:
            slot_id = s["_id"]
            # Find chapters pointing to this slot or matching (manga_id, c_num, lang)
            c_cursor = self._get_chapters_col().find(
                {
                    "manga_id": str(manga_id),
                    "$or": [
                        {"logical_chapter_id": slot_id},
                        {"chapter_number": s["chapter_display"], "language": s["language"]},
                    ],
                }
            )
            releases = []
            async for ch in c_cursor:
                ch["_id"] = str(ch["_id"])
                releases.append(
                    {
                        "id": ch["_id"],
                        "source": ch.get("source", "mangadex"),
                        "source_id": ch.get("source_id"),
                        "source_release_type": ch.get("source_release_type"),
                        "page_count": ch.get("page_count", len(ch.get("pages", []))),
                        "state": ch.get("state", "ready"),
                        "created_at": ch.get("created_at"),
                    }
                )
            s["stored_releases"] = releases
            s["stored_releases_count"] = len(releases)
            s["is_ready"] = any(r["state"] == "ready" for r in releases)

        return slots

    async def get_coverage_summary(self, manga_id: str, language: str = "en") -> Dict[str, Any]:
        """
        Calculates library coverage for a manga in a specific language.
        """
        slots = await self.get_manga_slots(manga_id, language=language)
        total_slots = len(slots)
        ready_slots = sum(1 for s in slots if s.get("is_ready", False))
        missing = [s["chapter_display"] for s in slots if not s.get("is_ready", False)]

        return {
            "manga_id": str(manga_id),
            "language": language,
            "total_slots": total_slots,
            "ready_slots": ready_slots,
            "missing_slots": missing,
            "coverage_percent": round((ready_slots / total_slots * 100), 1) if total_slots > 0 else 0.0,
        }


chapter_slot_service = ChapterSlotService()
