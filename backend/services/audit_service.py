import logging
import json
import re
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from backend.database.connection import get_db

logger = logging.getLogger(__name__)

class AuditService:
    def _get_audit_collection(self):
        return get_db().audit_logs

    def _get_mangas_collection(self):
        return get_db().mangas

    def _format_value(self, val: Any) -> Optional[str]:
        """Safely format values into human-readable strings, preventing giant blobs."""
        if val is None:
            return None
        if hasattr(val, "value"):
            return str(val.value)
        if isinstance(val, (dict, list)):
            try:
                serialized = json.dumps(val, ensure_ascii=False)
                if len(serialized) > 1000:
                    return serialized[:1000] + "... (truncated)"
                return serialized
            except Exception:
                pass
        val_str = str(val)
        if val_str.startswith("ReadStatus."):
            return val_str.split(".", 1)[1].lower()
        if len(val_str) > 1000:
            return val_str[:1000] + "... (truncated)"
        return val_str

    def _serialize_log(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Format an audit log document for JSON serialization with timezone-aware ISO string."""
        if not doc:
            return doc
        res = dict(doc)
        if "_id" in res:
            res["_id"] = str(res["_id"])
        if "timestamp" in res and isinstance(res["timestamp"], datetime):
            dt = res["timestamp"]
            # Ensure UTC timezone is attached
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            # Produce standard ISO string ending with Z
            res["timestamp"] = dt.isoformat().replace("+00:00", "Z")
        return res

    async def get_audit_log_by_id(self, log_id: str):
        if not ObjectId.is_valid(log_id):
            return None
        doc = await self._get_audit_collection().find_one({"_id": ObjectId(log_id)})
        return self._serialize_log(doc) if doc else None

    async def log_event(
        self,
        entity_type: str,
        entity_id: str,
        action: str,
        entity_title: Optional[str] = None,
        field: Optional[str] = None,
        old_value: Any = None,
        new_value: Any = None,
        note: Optional[str] = None,
        actor: str = "user",
        details: Optional[Dict[str, Any]] = None,
        timestamp: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Record a comprehensive audit log entry for core system operations.
        Ensures strict time accuracy, compact storage, and human-readable context.
        """
        try:
            # Auto-resolve entity_title if missing and it's a manga
            resolved_title = entity_title
            if not resolved_title and entity_type == "manga" and ObjectId.is_valid(entity_id):
                try:
                    manga_doc = await self._get_mangas_collection().find_one(
                        {"_id": ObjectId(entity_id)},
                        {"title": 1}
                    )
                    if manga_doc:
                        resolved_title = manga_doc.get("title")
                except Exception:
                    pass

            event_timestamp = timestamp or datetime.now(timezone.utc)

            # Sanitize details dict if provided (truncate huge strings/nested lists)
            cleaned_details = None
            if details and isinstance(details, dict):
                cleaned_details = {}
                for k, v in details.items():
                    if isinstance(v, str) and len(v) > 500:
                        cleaned_details[k] = v[:500] + "... (truncated)"
                    else:
                        cleaned_details[k] = v

            log_doc = {
                "entity_type": entity_type,
                "entity_id": str(entity_id),
                "entity_title": resolved_title,
                "action": action,
                "actor": actor or "user",
                "field": field,
                "old_value": self._format_value(old_value),
                "new_value": self._format_value(new_value),
                "timestamp": event_timestamp,
                "note": note,
                "details": cleaned_details
            }

            res = await self._get_audit_collection().insert_one(log_doc)
            log_doc["_id"] = str(res.inserted_id)
            return self._serialize_log(log_doc)
        except Exception as e:
            logger.error(f"Failed to record audit log for {entity_type} {entity_id} ({action}): {e}")
            return {}

    async def get_audit_logs(
        self,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        action: Optional[str] = None,
        actions: Optional[List[str]] = None,
        actor: Optional[str] = None,
        search: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 20,
        sort_order: str = "desc"
    ) -> Dict[str, Any]:
        """
        Query audit logs with multi-field search, filtering, and pagination.
        """
        clauses = []

        if entity_type:
            clauses.append({"entity_type": entity_type})

        if entity_id:
            clauses.append({"entity_id": str(entity_id)})

        if action:
            clauses.append({"action": action})
        elif actions:
            clauses.append({"action": {"$in": actions}})

        if actor:
            clauses.append({"actor": actor})

        # Search across entity_title, note, field, action, and entity_id
        if search and search.strip():
            escaped = re.escape(search.strip())
            clauses.append({
                "$or": [
                    {"entity_title": {"$regex": escaped, "$options": "i"}},
                    {"note": {"$regex": escaped, "$options": "i"}},
                    {"field": {"$regex": escaped, "$options": "i"}},
                    {"action": {"$regex": escaped, "$options": "i"}},
                    {"entity_id": {"$regex": escaped, "$options": "i"}},
                    {"old_value": {"$regex": escaped, "$options": "i"}},
                    {"new_value": {"$regex": escaped, "$options": "i"}}
                ]
            })

        # Date range filtering
        time_query = {}
        if start_date:
            time_query["$gte"] = start_date
        if end_date:
            time_query["$lte"] = end_date
        if time_query:
            clauses.append({"timestamp": time_query})

        query = {}
        if clauses:
            if len(clauses) == 1:
                query = clauses[0]
            else:
                query = {"$and": clauses}

        coll = self._get_audit_collection()
        total = await coll.count_documents(query)

        sort_dir = -1 if sort_order == "desc" else 1
        cursor = coll.find(query).sort("timestamp", sort_dir).skip(skip).limit(limit)

        items = []
        async for doc in cursor:
            items.append(self._serialize_log(doc))

        return {
            "total": total,
            "items": items,
            "skip": skip,
            "limit": limit
        }

    async def get_entity_history(self, entity_id: str, limit: int = 200) -> List[Dict[str, Any]]:
        """
        Retrieve timeline history for a specific entity (e.g. Manga) with consistent ISO timestamps.
        """
        cursor = self._get_audit_collection().find({"entity_id": str(entity_id)}).sort("timestamp", -1).limit(limit)
        history = []
        async for doc in cursor:
            history.append(self._serialize_log(doc))
        return history

    async def get_distinct_actions(self) -> List[str]:
        """Return list of distinct action strings currently in the database."""
        try:
            return await self._get_audit_collection().distinct("action")
        except Exception as e:
            logger.error(f"Failed to fetch distinct audit actions: {e}")
            return []

    async def get_audit_stats(self) -> Dict[str, Any]:
        """
        Compute high-level audit KPIs and operational breakdowns.
        """
        try:
            coll = self._get_audit_collection()
            now = datetime.now(timezone.utc)
            start_of_today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
            twenty_four_hours_ago = now - timedelta(hours=24)

            total_logs = await coll.count_documents({})
            logs_today = await coll.count_documents({"timestamp": {"$gte": start_of_today}})
            logs_24h = await coll.count_documents({"timestamp": {"$gte": twenty_four_hours_ago}})

            # Breakdown by entity_type
            entity_pipeline = [
                {"$group": {"_id": "$entity_type", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            by_entity = {}
            async for doc in coll.aggregate(entity_pipeline):
                if doc["_id"]:
                    by_entity[str(doc["_id"])] = doc["count"]

            # Breakdown by action (top 15)
            action_pipeline = [
                {"$group": {"_id": "$action", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 15}
            ]
            by_action = {}
            async for doc in coll.aggregate(action_pipeline):
                if doc["_id"]:
                    by_action[str(doc["_id"])] = doc["count"]

            manga_logs = by_entity.get("manga", 0)
            review_logs = (
                by_action.get("create_review", 0)
                + by_action.get("update_review", 0)
                + by_action.get("delete_review", 0)
            )
            system_logs = (
                by_action.get("sync_metadata", 0)
                + by_action.get("enrich_trackers", 0)
            )

            return {
                "total_logs": total_logs,
                "logs_today": logs_today,
                "logs_24h": logs_24h,
                "last_24h_count": logs_24h,
                "manga_logs": manga_logs,
                "review_logs": review_logs,
                "system_logs": system_logs,
                "by_entity_type": by_entity,
                "by_action": by_action
            }
        except Exception as e:
            logger.error(f"Failed to compute audit stats: {e}")
            return {
                "total_logs": 0,
                "logs_today": 0,
                "logs_24h": 0,
                "last_24h_count": 0,
                "manga_logs": 0,
                "review_logs": 0,
                "system_logs": 0,
                "by_entity_type": {},
                "by_action": {}
            }

audit_service = AuditService()
