"""Elasticsearch service for audit logs indexing and fast search with MongoDB fallback."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from backend.config import settings
from backend.core.elasticsearch import get_es_client
from backend.core.log_redaction import redact

logger = logging.getLogger("services.audit_search")


class AuditSearchService:
    """Handles audit logs indexing and search against Elasticsearch."""

    async def index_audit_doc(self, doc: dict[str, Any]) -> bool:
        """Index a single audit log document into Elasticsearch.

        Redacts sensitive fields before persisting to ES.
        Returns True on success, False on failure.
        """
        client = get_es_client()
        if client is None:
            return False

        try:
            doc_id = str(doc.get("_id") or doc.get("id"))
            clean_doc = dict(doc)
            clean_doc.pop("_id", None)

            # Ensure datetime is serialized
            if isinstance(clean_doc.get("timestamp"), datetime):
                clean_doc["timestamp"] = clean_doc["timestamp"].isoformat()

            # Redact string fields
            for k in ("note", "old_value", "new_value", "entity_title"):
                if isinstance(clean_doc.get(k), str):
                    clean_doc[k] = redact(clean_doc[k])

            await client.index(
                index=settings.audit_es_index,
                id=doc_id,
                document=clean_doc,
            )
            return True
        except Exception as e:
            logger.warning(f"Failed to index audit log into Elasticsearch: {e}")
            return False

    async def search_audit_logs(
        self,
        entity_type: str | None = None,
        entity_id: str | None = None,
        action: str | None = None,
        actions: list[str] | None = None,
        actor: str | None = None,
        search: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        skip: int = 0,
        limit: int = 20,
        sort_order: str = "desc",
    ) -> dict[str, Any] | None:
        """Search audit logs in Elasticsearch.

        Returns search result dict with source_engine="elasticsearch",
        or None if ES is unavailable or query fails (triggering fallback).
        """
        client = get_es_client()
        if client is None:
            return None

        try:
            must_clauses: list[dict[str, Any]] = []
            filter_clauses: list[dict[str, Any]] = []

            if entity_type:
                filter_clauses.append({"term": {"entity_type": entity_type}})
            if entity_id:
                filter_clauses.append({"term": {"entity_id": str(entity_id)}})
            if action:
                filter_clauses.append({"term": {"action": action}})
            elif actions:
                filter_clauses.append({"terms": {"action": actions}})
            if actor:
                filter_clauses.append({"term": {"actor": actor}})

            if start_date or end_date:
                range_query: dict[str, Any] = {}
                if start_date:
                    range_query["gte"] = start_date.isoformat()
                if end_date:
                    range_query["lte"] = end_date.isoformat()
                filter_clauses.append({"range": {"timestamp": range_query}})

            if search and search.strip():
                must_clauses.append(
                    {
                        "multi_match": {
                            "query": search.strip(),
                            "fields": [
                                "entity_title^2",
                                "note",
                                "field",
                                "action",
                                "entity_id",
                                "old_value",
                                "new_value",
                            ],
                        }
                    }
                )

            bool_query: dict[str, Any] = {}
            if must_clauses:
                bool_query["must"] = must_clauses
            if filter_clauses:
                bool_query["filter"] = filter_clauses
            if not bool_query:
                bool_query["must"] = [{"match_all": {}}]

            res = await client.search(
                index=settings.audit_es_index,
                query={"bool": bool_query},
                sort=[{"timestamp": {"order": sort_order}}],
                from_=skip,
                size=limit,
            )

            hits = res.get("hits", {})
            total = hits.get("total", {}).get("value", 0)
            items = []
            for hit in hits.get("hits", []):
                item = hit.get("_source", {})
                item["_id"] = hit.get("_id")
                items.append(item)

            return {
                "total": total,
                "items": items,
                "skip": skip,
                "limit": limit,
                "source_engine": "elasticsearch",
            }
        except Exception as e:
            logger.warning(f"Error querying Elasticsearch for audit logs: {e}")
            return None


audit_search_service = AuditSearchService()
