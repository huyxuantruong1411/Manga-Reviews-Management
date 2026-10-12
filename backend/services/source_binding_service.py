import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.database.connection import get_db
from backend.models.datasource import IdentityConflictError

logger = logging.getLogger(__name__)


class SourceBindingService:
    """
    Manages bindings between internal Manga entities and external datasource works.
    Ensures that a remote work is not ambiguously bound to multiple mangas,
    and maintains upstream links and metadata freshness states.
    """

    def _get_sources_col(self):
        return get_db().manga_sources

    def _get_mangas_col(self):
        return get_db().mangas

    async def link_source_to_manga(
        self,
        manga_id: str,
        source: str,
        source_work_id: str,
        canonical_url: str,
        title: Optional[str] = None,
        evidence: Optional[Dict[str, Any]] = None,
        link_state: str = "verified",
        numbering_scope_id: str = "scope_default",
    ) -> Dict[str, Any]:
        """
        Links an external datasource work to a local manga.
        Raises IdentityConflictError if (source, source_work_id) is already linked to another manga.
        """
        clean_source = source.lower()
        clean_work_id = str(source_work_id).strip()
        now = datetime.now(timezone.utc)

        # Conflict check: is this source work already bound to another manga?
        existing_conflict = await self._get_sources_col().find_one(
            {"source": clean_source, "source_work_id": clean_work_id}
        )
        if existing_conflict and str(existing_conflict.get("manga_id")) != str(manga_id):
            conflict_manga_id = existing_conflict.get("manga_id")
            raise IdentityConflictError(
                f"Source '{clean_source}' work '{clean_work_id}' is already linked to manga '{conflict_manga_id}'"
            )

        binding_doc = {
            "manga_id": str(manga_id),
            "source": clean_source,
            "source_work_id": clean_work_id,
            "canonical_url": canonical_url,
            "title": title or "",
            "link_state": link_state,
            "evidence": evidence or {},
            "numbering_scope_id": numbering_scope_id,
            "updated_at": now,
        }

        if existing_conflict:
            await self._get_sources_col().update_one(
                {"_id": existing_conflict["_id"]},
                {"$set": binding_doc},
            )
            binding_doc["_id"] = str(existing_conflict["_id"])
        else:
            binding_doc["created_at"] = now
            result = await self._get_sources_col().insert_one(binding_doc)
            binding_doc["_id"] = str(result.inserted_id)

        # Invalidate cache if needed
        try:
            from backend.core.redis import delete_cache

            await delete_cache(f"manga:detail:{manga_id}")
        except Exception:
            pass

        return binding_doc

    async def get_manga_sources(self, manga_id: str) -> List[Dict[str, Any]]:
        """
        Returns all source bindings for a manga.
        """
        cursor = self._get_sources_col().find({"manga_id": str(manga_id)})
        results = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            results.append(doc)
        return results

    async def unlink_source(self, manga_id: str, source: str) -> bool:
        """
        Unlinks or disables a source from a manga without deleting downloaded offline media.
        """
        res = await self._get_sources_col().update_one(
            {"manga_id": str(manga_id), "source": source.lower()},
            {"$set": {"link_state": "disabled", "updated_at": datetime.now(timezone.utc)}},
        )
        return res.modified_count > 0


source_binding_service = SourceBindingService()
