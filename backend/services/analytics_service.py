import asyncio
import hashlib
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from backend.core.redis import delete_cache_pattern, get_cache, set_cache
from backend.database.connection import get_db

logger = logging.getLogger(__name__)

ANALYTICS_CACHE_TTL = 180
READ_STATUS_ORDER = (
    "unread",
    "reading",
    "completed",
    "dropped",
    "on_hold",
    "plan_to_read",
    "re_reading",
)
READ_STATUS_LABELS = {
    "unread": "Unread",
    "reading": "Reading",
    "completed": "Completed",
    "dropped": "Dropped",
    "on_hold": "On Hold",
    "plan_to_read": "Plan to Read",
    "re_reading": "Re-Reading",
}
LANGUAGE_NAMES = {
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "en": "English",
    "vi": "Vietnamese",
    "ru": "Russian",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "Unknown": "Unknown",
}
COMPLETED_AUDIT_VALUES = ["completed", "ReadStatus.COMPLETED"]


def _resolve_date_format(group_by: str) -> str:
    formats = {
        "hour": "%Y-%m-%d %H:00",
        "day": "%Y-%m-%d",
        "week": "%G-W%V",
        "month": "%Y-%m",
        "year": "%Y",
    }
    return formats.get(group_by, "%Y-%m")


def _build_date_range_query(start_date: Optional[datetime], end_date: Optional[datetime]) -> Dict[str, Any]:
    date_query: Dict[str, Any] = {}
    if start_date:
        date_query["$gte"] = start_date
    if end_date:
        date_query["$lte"] = end_date
    return date_query


def _extract_tag_display_name(names: Any, default: str = "Unknown") -> str:
    if isinstance(names, dict):
        return names.get("en") or (list(names.values())[0] if names else default)
    if isinstance(names, str) and names:
        return names
    return default


def _format_iso(dt: Any) -> Optional[str]:
    if isinstance(dt, datetime):
        return dt.isoformat()
    return None


async def _collect_cursor(cursor: Any) -> List[Dict[str, Any]]:
    docs: List[Dict[str, Any]] = []
    async for doc in cursor:
        docs.append(doc)
    return docs


class AnalyticsService:
    def _get_mangas_collection(self):
        return get_db().mangas

    def _get_reviews_collection(self):
        return get_db().reviews

    def _get_tags_collection(self):
        return get_db().tags

    def _get_audit_collection(self):
        return get_db().audit_logs

    def _should_use_cache(self, use_cache: Optional[bool] = None) -> bool:
        """Skip Redis reads/writes automatically when collection hooks are monkeypatched in unit tests."""
        if use_cache is not None:
            return bool(use_cache)
        patched_hooks = (
            "_get_mangas_collection",
            "_get_reviews_collection",
            "_get_tags_collection",
            "_get_audit_collection",
        )
        return not any(attr in self.__dict__ for attr in patched_hooks)

    def _build_cache_key(self, endpoint: str, payload: Any) -> str:
        serialized = json.dumps(payload, default=str, sort_keys=True, ensure_ascii=True)
        digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:24]
        return f"analytics:{endpoint}:{digest}"

    async def _try_get_cache(self, key: str, use_cache: Optional[bool] = None) -> Optional[Any]:
        if not self._should_use_cache(use_cache):
            return None
        return await get_cache(key)

    async def _try_set_cache(
        self,
        key: str,
        value: Any,
        ttl: int = ANALYTICS_CACHE_TTL,
        use_cache: Optional[bool] = None,
    ) -> None:
        if self._should_use_cache(use_cache):
            await set_cache(key, value, ttl=ttl)

    async def invalidate_cache(self) -> int:
        """Invalidate all cached analytics responses after library, review, or tag mutations."""
        return await delete_cache_pattern("analytics:*")

    def build_match_stage(
        self,
        search: Optional[str] = None,
        read_status: Optional[str] = None,
        read_statuses: Optional[List[str]] = None,
        exclude_read_statuses: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        exclude_tags: Optional[List[str]] = None,
        tag_mode: str = "all",
        content_ratings: Optional[List[str]] = None,
        demographics: Optional[List[str]] = None,
        statuses: Optional[List[str]] = None,
        original_languages: Optional[List[str]] = None,
        authors: Optional[List[str]] = None,
        artists: Optional[List[str]] = None,
        rating_min: Optional[float] = None,
        rating_max: Optional[float] = None,
        year_start: Optional[str] = None,
        year_end: Optional[str] = None,
    ) -> Dict[str, Any]:
        clauses = []

        if search:
            escaped = re.escape(search)
            full_match = {
                "$or": [
                    {"title": {"$regex": escaped, "$options": "i"}},
                    {"alt_titles": {"$regex": escaped, "$options": "i"}},
                    {"author": {"$regex": escaped, "$options": "i"}},
                    {"artist": {"$regex": escaped, "$options": "i"}},
                ]
            }
            words = [w.strip() for w in search.split() if w.strip()]
            if len(words) > 1:
                word_patterns = []
                for word in words:
                    ew = re.escape(word)
                    word_patterns.append(
                        {
                            "$or": [
                                {"title": {"$regex": ew, "$options": "i"}},
                                {"alt_titles": {"$regex": ew, "$options": "i"}},
                                {"author": {"$regex": ew, "$options": "i"}},
                                {"artist": {"$regex": ew, "$options": "i"}},
                            ]
                        }
                    )
                clauses.append({"$or": [full_match, {"$and": word_patterns}]})
            else:
                clauses.append(full_match)

        status_include = []
        if read_status:
            status_include.append(read_status)
        if read_statuses:
            status_include.extend(read_statuses)
        status_include = list({s for s in status_include if s})

        if status_include:
            clauses.append({"read_status": {"$in": status_include}})

        if exclude_read_statuses:
            clauses.append({"read_status": {"$nin": exclude_read_statuses}})

        tag_clause: Dict[str, Any] = {}
        if tags:
            if tag_mode == "any":
                tag_clause["$in"] = tags
            else:
                tag_clause["$all"] = tags

        if exclude_tags:
            tag_clause["$nin"] = exclude_tags

        if tag_clause:
            clauses.append({"tag_ids": tag_clause})

        if content_ratings:
            clauses.append({"content_rating": {"$in": content_ratings}})

        if demographics:
            clauses.append({"publication_demographic": {"$in": demographics}})

        if statuses:
            clauses.append({"status": {"$in": statuses}})

        if original_languages:
            clauses.append({"original_language": {"$in": original_languages}})

        def build_creator_match_clause(field: str, names: List[str]):
            or_clauses = []
            for name in names:
                stripped = name.strip()
                if not stripped:
                    continue
                escaped = re.escape(stripped)
                pattern = f"(^|,\\s*){escaped}(\\s*,|$)"
                or_clauses.append({field: {"$regex": pattern, "$options": "i"}})
            return {"$or": or_clauses} if or_clauses else None

        if authors:
            all_authors = list({a.strip() for a in authors if a and a.strip()})
            if all_authors:
                clause = build_creator_match_clause("author", all_authors)
                if clause:
                    clauses.append(clause)

        if artists:
            all_artists = list({a.strip() for a in artists if a and a.strip()})
            if all_artists:
                clause = build_creator_match_clause("artist", all_artists)
                if clause:
                    clauses.append(clause)

        if rating_min is not None or rating_max is not None:
            rating_query: Dict[str, Any] = {}
            if rating_min is not None:
                rating_query["$gte"] = rating_min
            if rating_max is not None:
                rating_query["$lte"] = rating_max
            clauses.append({"personal_rating": rating_query})

        year_clause: Dict[str, Any] = {}
        if year_start:
            year_clause["$gte"] = year_start
        if year_end:
            year_clause["$lte"] = year_end
        if year_clause:
            year_clause["$regex"] = "^[0-9]{4}$"
            clauses.append({"year": year_clause})

        if clauses:
            return clauses[0] if len(clauses) == 1 else {"$and": clauses}
        return {}

    async def _fetch_tag_metadata(self) -> Dict[str, Dict[str, Any]]:
        tags_coll = self._get_tags_collection()
        tag_metadata: Dict[str, Dict[str, Any]] = {}
        async for doc in tags_coll.find({}):
            tag_id_str = str(doc["_id"])
            tag_metadata[tag_id_str] = {
                "name": _extract_tag_display_name(doc.get("name", {})),
                "color": doc.get("color"),
            }
        return tag_metadata

    def _build_overview_payload(
        self,
        total_manga: int,
        total_reviews: int,
        average_rating: float,
        status_dist: Dict[str, int],
        rated_count: int,
        completed_last_7d: int,
        completed_prev_7d: int,
        completed_last_30d: int,
        completed_prev_30d: int,
        added_last_7d: int,
        added_prev_7d: int,
        added_last_30d: int,
        added_prev_30d: int,
    ) -> Dict[str, Any]:
        normalized_status = dict(status_dist)
        for status in READ_STATUS_ORDER:
            normalized_status.setdefault(status, 0)

        completed_count = normalized_status.get("completed", 0)
        backlog_count = normalized_status.get("unread", 0) + normalized_status.get("plan_to_read", 0)
        in_progress_count = normalized_status.get("reading", 0) + normalized_status.get("re_reading", 0)

        completion_rate = round((completed_count / total_manga * 100), 1) if total_manga > 0 else 0.0
        backlog_rate = round((backlog_count / total_manga * 100), 1) if total_manga > 0 else 0.0
        review_coverage_rate = round((total_reviews / completed_count * 100), 1) if completed_count > 0 else 0.0
        unrated_count = max(0, total_manga - rated_count)

        return {
            "total_manga": total_manga,
            "total_reviews": total_reviews,
            "average_rating": average_rating,
            "status_distribution": normalized_status,
            "velocity": {
                "completed_last_7d": completed_last_7d,
                "completed_prev_7d": completed_prev_7d,
                "completed_last_30d": completed_last_30d,
                "completed_prev_30d": completed_prev_30d,
                "added_last_7d": added_last_7d,
                "added_prev_7d": added_prev_7d,
                "added_last_30d": added_last_30d,
                "added_prev_30d": added_prev_30d,
                "completion_rate": completion_rate,
                "backlog_count": backlog_count,
                "backlog_rate": backlog_rate,
                "in_progress_count": in_progress_count,
                "review_coverage_rate": review_coverage_rate,
                "rated_count": rated_count,
                "unrated_count": unrated_count,
            },
        }

    async def get_overview_stats(
        self, filter_query: Dict[str, Any], use_cache: Optional[bool] = None
    ) -> Dict[str, Any]:
        cache_key = self._build_cache_key("overview", filter_query)
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()
        reviews_coll = self._get_reviews_collection()
        audit_coll = self._get_audit_collection()

        now = datetime.now(timezone.utc)
        seven_days_ago = now - timedelta(days=7)
        fourteen_days_ago = now - timedelta(days=14)
        thirty_days_ago = now - timedelta(days=30)
        sixty_days_ago = now - timedelta(days=60)

        avg_pipeline = [
            {"$match": filter_query},
            {"$match": {"personal_rating": {"$ne": None}}},
            {"$group": {"_id": None, "avg_rating": {"$avg": "$personal_rating"}}},
        ]
        status_pipeline = [{"$match": filter_query}, {"$group": {"_id": "$read_status", "count": {"$sum": 1}}}]

        # Run independent manga counts & pipelines concurrently while preserving deterministic call order.
        (
            total_manga,
            m_comp_7d,
            m_comp_30d,
            added_last_7d,
            added_prev_7d,
            added_last_30d,
            added_prev_30d,
            rated_count,
            raw_manga_ids,
            avg_res,
            status_res,
        ) = await asyncio.gather(
            mangas_coll.count_documents(filter_query),
            mangas_coll.count_documents({**filter_query, "completed_at": {"$gte": seven_days_ago, "$lte": now}}),
            mangas_coll.count_documents({**filter_query, "completed_at": {"$gte": thirty_days_ago, "$lte": now}}),
            mangas_coll.count_documents({**filter_query, "added_at": {"$gte": seven_days_ago, "$lte": now}}),
            mangas_coll.count_documents(
                {**filter_query, "added_at": {"$gte": fourteen_days_ago, "$lt": seven_days_ago}}
            ),
            mangas_coll.count_documents({**filter_query, "added_at": {"$gte": thirty_days_ago, "$lte": now}}),
            mangas_coll.count_documents({**filter_query, "added_at": {"$gte": sixty_days_ago, "$lt": thirty_days_ago}}),
            mangas_coll.count_documents({**filter_query, "personal_rating": {"$ne": None}}),
            mangas_coll.find(filter_query).distinct("_id"),
            mangas_coll.aggregate(avg_pipeline).to_list(1),
            mangas_coll.aggregate(status_pipeline).to_list(10),
        )

        manga_ids = [str(mid) for mid in raw_manga_ids]
        average_rating = (
            round(avg_res[0]["avg_rating"], 2) if avg_res and avg_res[0].get("avg_rating") is not None else 0.0
        )
        status_dist = {s["_id"]: s["count"] for s in status_res}

        # An empty filtered library is still a scope, never permission to scan reviews or audit logs.
        if not manga_ids:
            total_reviews = 0
            completed_last_7d = 0
            completed_prev_7d = 0
            completed_last_30d = 0
            completed_prev_30d = 0
        else:
            base_audit_filter = {
                "entity_type": "manga",
                "action": "update_status",
                "field": "read_status",
                "new_value": {"$in": COMPLETED_AUDIT_VALUES},
                "entity_id": {"$in": manga_ids},
            }
            (
                total_reviews,
                completed_last_7d,
                completed_prev_7d,
                completed_last_30d,
                completed_prev_30d,
            ) = await asyncio.gather(
                reviews_coll.count_documents({"is_deleted": {"$ne": True}, "manga_id": {"$in": manga_ids}}),
                audit_coll.count_documents({**base_audit_filter, "timestamp": {"$gte": seven_days_ago, "$lte": now}}),
                audit_coll.count_documents(
                    {**base_audit_filter, "timestamp": {"$gte": fourteen_days_ago, "$lt": seven_days_ago}}
                ),
                audit_coll.count_documents({**base_audit_filter, "timestamp": {"$gte": thirty_days_ago, "$lte": now}}),
                audit_coll.count_documents(
                    {**base_audit_filter, "timestamp": {"$gte": sixty_days_ago, "$lt": thirty_days_ago}}
                ),
            )

        completed_last_7d = max(completed_last_7d, m_comp_7d)
        completed_last_30d = max(completed_last_30d, m_comp_30d)

        result = self._build_overview_payload(
            total_manga=total_manga,
            total_reviews=total_reviews,
            average_rating=average_rating,
            status_dist=status_dist,
            rated_count=rated_count,
            completed_last_7d=completed_last_7d,
            completed_prev_7d=completed_prev_7d,
            completed_last_30d=completed_last_30d,
            completed_prev_30d=completed_prev_30d,
            added_last_7d=added_last_7d,
            added_prev_7d=added_prev_7d,
            added_last_30d=added_last_30d,
            added_prev_30d=added_prev_30d,
        )
        await self._try_set_cache(cache_key, result, use_cache=use_cache)
        return result

    async def get_score_distribution(
        self, filter_query: Dict[str, Any], use_cache: Optional[bool] = None
    ) -> List[Dict[str, Any]]:
        cache_key = self._build_cache_key("score_distribution", filter_query)
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()
        pipeline = [
            {"$match": filter_query},
            {"$match": {"personal_rating": {"$ne": None}}},
            {"$group": {"_id": "$personal_rating", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]
        res = await mangas_coll.aggregate(pipeline).to_list(50)
        formatted = [{"score": item["_id"], "count": item["count"]} for item in res]
        await self._try_set_cache(cache_key, formatted, use_cache=use_cache)
        return formatted

    async def get_top_tags(
        self, filter_query: Dict[str, Any], use_cache: Optional[bool] = None
    ) -> List[Dict[str, Any]]:
        cache_key = self._build_cache_key("top_tags", filter_query)
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()
        pipeline = [
            {"$match": filter_query},
            {"$unwind": "$tag_ids"},
            {"$group": {"_id": "$tag_ids", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
            {"$addFields": {"tag_obj_id": {"$toObjectId": "$_id"}}},
            {"$lookup": {"from": "tags", "localField": "tag_obj_id", "foreignField": "_id", "as": "tag_info"}},
            {"$unwind": "$tag_info"},
            {"$project": {"_id": 1, "count": 1, "name": "$tag_info.name", "color": "$tag_info.color"}},
        ]
        res = await mangas_coll.aggregate(pipeline).to_list(10)

        formatted = [
            {
                "tag_id": item["_id"],
                "name": _extract_tag_display_name(item.get("name", {})),
                "count": item["count"],
                "color": item.get("color"),
            }
            for item in res
        ]
        await self._try_set_cache(cache_key, formatted, use_cache=use_cache)
        return formatted

    async def get_tags_details(
        self, filter_query: Dict[str, Any], use_cache: Optional[bool] = None
    ) -> List[Dict[str, Any]]:
        cache_key = self._build_cache_key("tags_details", filter_query)
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()
        pipeline = [
            {"$match": filter_query},
            {"$unwind": "$tag_ids"},
            {
                "$group": {
                    "_id": {
                        "tag_id": "$tag_ids",
                        "demographic": "$publication_demographic",
                        "content_rating": "$content_rating",
                        "status": "$status",
                        "read_status": "$read_status",
                        "rating": "$personal_rating",
                    },
                    "count": {"$sum": 1},
                }
            },
        ]

        tag_metadata, agg_items = await asyncio.gather(
            self._fetch_tag_metadata(),
            _collect_cursor(mangas_coll.aggregate(pipeline)),
        )

        tag_analytics: Dict[str, Dict[str, Any]] = {}
        for item in agg_items:
            group_info = item["_id"]
            tag_id = group_info["tag_id"]
            count = item["count"]

            if tag_id not in tag_analytics:
                meta = tag_metadata.get(tag_id, {"name": "Unknown", "color": None})
                tag_analytics[tag_id] = {
                    "tag_id": tag_id,
                    "name": meta["name"],
                    "color": meta["color"],
                    "count": 0,
                    "demographics": {},
                    "content_ratings": {},
                    "statuses": {},
                    "read_statuses": {},
                    "ratings": {},
                }

            stats = tag_analytics[tag_id]
            stats["count"] += count

            demo = (group_info.get("demographic") or "Unknown").capitalize()
            stats["demographics"][demo] = stats["demographics"].get(demo, 0) + count

            cr = (group_info.get("content_rating") or "Unknown").capitalize()
            stats["content_ratings"][cr] = stats["content_ratings"].get(cr, 0) + count

            pub_status = (group_info.get("status") or "Unknown").capitalize()
            stats["statuses"][pub_status] = stats["statuses"].get(pub_status, 0) + count

            rs_raw = group_info.get("read_status") or "unread"
            rs_formatted = READ_STATUS_LABELS.get(rs_raw.lower(), rs_raw.capitalize())
            stats["read_statuses"][rs_formatted] = stats["read_statuses"].get(rs_formatted, 0) + count

            rating = group_info.get("rating")
            if rs_raw in ["completed", "ReadStatus.COMPLETED"] and rating is not None:
                rating_int = int(rating)
                stats["ratings"][rating_int] = stats["ratings"].get(rating_int, 0) + count

        formatted_list = sorted(tag_analytics.values(), key=lambda x: x["count"], reverse=True)
        for stats in formatted_list:
            stats["demographics"] = [{"name": k, "value": v} for k, v in stats["demographics"].items()]
            stats["content_ratings"] = [{"name": k, "value": v} for k, v in stats["content_ratings"].items()]
            stats["statuses"] = [{"name": k, "value": v} for k, v in stats["statuses"].items()]
            stats["read_statuses"] = [{"name": k, "value": v} for k, v in stats["read_statuses"].items()]
            stats["ratings"] = [{"score": k, "count": v} for k, v in sorted(stats["ratings"].items())]

        await self._try_set_cache(cache_key, formatted_list, use_cache=use_cache)
        return formatted_list

    async def get_creators_details(
        self, filter_query: Dict[str, Any], use_cache: Optional[bool] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        cache_key = self._build_cache_key("creators_details", filter_query)
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()

        def build_pipeline(creator_field: str, other_creator_field: str):
            return [
                {"$match": filter_query},
                {"$match": {creator_field: {"$ne": None, "$nin": ["Unknown", "N/A"]}}},
                {
                    "$group": {
                        "_id": {
                            "creator": f"${creator_field}",
                            "demographic": "$publication_demographic",
                            "content_rating": "$content_rating",
                            "read_status": "$read_status",
                            "rating": "$personal_rating",
                            "other_creator": f"${other_creator_field}",
                        },
                        "tag_ids": {"$push": "$tag_ids"},
                        "count": {"$sum": 1},
                    }
                },
            ]

        tag_metadata, author_items, artist_items = await asyncio.gather(
            self._fetch_tag_metadata(),
            _collect_cursor(mangas_coll.aggregate(build_pipeline("author", "artist"))),
            _collect_cursor(mangas_coll.aggregate(build_pipeline("artist", "author"))),
        )

        def format_creators(agg_items: List[Dict[str, Any]], is_author_list: bool) -> List[Dict[str, Any]]:
            creator_analytics: Dict[str, Dict[str, Any]] = {}
            sole_role = "Author only" if is_author_list else "Artist only"

            for item in agg_items:
                group_info = item["_id"]
                creator = group_info["creator"]
                other_creator = group_info.get("other_creator")
                count = item["count"]
                pushed_tags = item.get("tag_ids", [])

                if creator not in creator_analytics:
                    creator_analytics[creator] = {
                        "name": creator,
                        "count": 0,
                        "demographics": {},
                        "content_ratings": {},
                        "read_statuses": {},
                        "ratings": {},
                        "tag_counts": {},
                        "roles": {sole_role: 0, "Both": 0},
                    }

                stats = creator_analytics[creator]
                stats["count"] += count

                if other_creator == creator:
                    stats["roles"]["Both"] = stats["roles"].get("Both", 0) + count
                else:
                    stats["roles"][sole_role] = stats["roles"].get(sole_role, 0) + count

                demo = (group_info.get("demographic") or "Unknown").capitalize()
                stats["demographics"][demo] = stats["demographics"].get(demo, 0) + count

                cr = (group_info.get("content_rating") or "Unknown").capitalize()
                stats["content_ratings"][cr] = stats["content_ratings"].get(cr, 0) + count

                rs_raw = group_info.get("read_status") or "unread"
                rs_formatted = READ_STATUS_LABELS.get(rs_raw.lower(), rs_raw.capitalize())
                stats["read_statuses"][rs_formatted] = stats["read_statuses"].get(rs_formatted, 0) + count

                rating = group_info.get("rating")
                if rs_raw in ["completed", "ReadStatus.COMPLETED"] and rating is not None:
                    rating_int = int(rating)
                    stats["ratings"][rating_int] = stats["ratings"].get(rating_int, 0) + count

                for tag_list in pushed_tags:
                    if isinstance(tag_list, list):
                        for tid in tag_list:
                            if tid:
                                stats["tag_counts"][str(tid)] = stats["tag_counts"].get(str(tid), 0) + 1
                    elif tag_list:
                        stats["tag_counts"][str(tag_list)] = stats["tag_counts"].get(str(tag_list), 0) + 1

            formatted_creators = []
            for name, stats in creator_analytics.items():
                top_tags = []
                for tid, tcnt in stats["tag_counts"].items():
                    meta = tag_metadata.get(tid, {"name": "Unknown", "color": None})
                    top_tags.append({"name": meta["name"], "count": tcnt, "color": meta["color"]})
                top_tags.sort(key=lambda x: x["count"], reverse=True)

                formatted_creators.append(
                    {
                        "name": name,
                        "count": stats["count"],
                        "roles": [{"name": k, "value": v} for k, v in stats["roles"].items()],
                        "demographics": [{"name": k, "value": v} for k, v in stats["demographics"].items()],
                        "content_ratings": [{"name": k, "value": v} for k, v in stats["content_ratings"].items()],
                        "read_statuses": [{"name": k, "value": v} for k, v in stats["read_statuses"].items()],
                        "ratings": [{"score": k, "count": v} for k, v in sorted(stats["ratings"].items())],
                        "tags": top_tags[:8],
                    }
                )

            formatted_creators.sort(key=lambda x: x["count"], reverse=True)
            return formatted_creators

        result = {
            "authors": format_creators(author_items, is_author_list=True),
            "artists": format_creators(artist_items, is_author_list=False),
        }
        await self._try_set_cache(cache_key, result, use_cache=use_cache)
        return result

    async def get_manga_added_timeline(
        self,
        filter_query: Dict[str, Any],
        group_by: str = "month",
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        use_cache: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        cache_key = self._build_cache_key(
            "manga_timeline",
            {"filter": filter_query, "group_by": group_by, "start": start_date, "end": end_date},
        )
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()
        match_query = dict(filter_query)
        date_query = _build_date_range_query(start_date, end_date)
        if date_query:
            match_query["added_at"] = date_query

        date_format = _resolve_date_format(group_by)
        pipeline = [
            {"$match": match_query},
            {"$project": {"period": {"$dateToString": {"format": date_format, "date": "$added_at"}}}},
            {"$group": {"_id": "$period", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]
        res = await mangas_coll.aggregate(pipeline).to_list(None)
        formatted = [{"period": item["_id"], "count": item["count"]} for item in res if item.get("_id") is not None]
        await self._try_set_cache(cache_key, formatted, use_cache=use_cache)
        return formatted

    async def get_manga_completed_timeline(
        self,
        manga_ids: List[str],
        group_by: str = "month",
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        use_cache: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        if not manga_ids:
            return []

        cache_key = self._build_cache_key(
            "completed_timeline",
            {"manga_ids": manga_ids, "group_by": group_by, "start": start_date, "end": end_date},
        )
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        audit_coll = self._get_audit_collection()
        match_query: Dict[str, Any] = {
            "entity_type": "manga",
            "entity_id": {"$in": manga_ids},
            "action": "update_status",
            "field": "read_status",
            "new_value": {"$in": COMPLETED_AUDIT_VALUES},
        }
        date_query = _build_date_range_query(start_date, end_date)
        if date_query:
            match_query["timestamp"] = date_query

        date_format = _resolve_date_format(group_by)
        pipeline = [
            {"$match": match_query},
            {"$project": {"period": {"$dateToString": {"format": date_format, "date": "$timestamp"}}}},
            {"$group": {"_id": "$period", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]
        res = await audit_coll.aggregate(pipeline).to_list(None)
        formatted = [{"period": item["_id"], "count": item["count"]} for item in res if item.get("_id") is not None]
        await self._try_set_cache(cache_key, formatted, use_cache=use_cache)
        return formatted

    async def get_review_activity_timeline(
        self,
        manga_ids: List[str],
        group_by: str = "month",
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        use_cache: Optional[bool] = None,
    ) -> List[Dict[str, Any]]:
        if not manga_ids:
            return []

        cache_key = self._build_cache_key(
            "review_timeline",
            {"manga_ids": manga_ids, "group_by": group_by, "start": start_date, "end": end_date},
        )
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        reviews_coll = self._get_reviews_collection()
        match_query: Dict[str, Any] = {"is_deleted": {"$ne": True}, "manga_id": {"$in": manga_ids}}
        date_query = _build_date_range_query(start_date, end_date)
        if date_query:
            match_query["created_at"] = date_query

        date_format = _resolve_date_format(group_by)
        pipeline = [
            {"$match": match_query},
            {"$project": {"period": {"$dateToString": {"format": date_format, "date": "$created_at"}}}},
            {"$group": {"_id": "$period", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]
        res = await reviews_coll.aggregate(pipeline).to_list(None)
        formatted = [{"period": item["_id"], "count": item["count"]} for item in res if item.get("_id") is not None]
        await self._try_set_cache(cache_key, formatted, use_cache=use_cache)
        return formatted

    def _format_metadata_distributions(self, facet_doc: Dict[str, Any]) -> Dict[str, Any]:
        demo_dist = {d["_id"] or "Unknown": d["count"] for d in facet_doc.get("demographic", [])}
        status_dist = {s["_id"] or "Unknown": s["count"] for s in facet_doc.get("publishing_status", [])}
        lang_dist = {item["_id"] or "Unknown": item["count"] for item in facet_doc.get("original_language", [])}
        content_rating_dist = {c["_id"] or "Unknown": c["count"] for c in facet_doc.get("content_rating", [])}

        return {
            "demographic": [{"name": k.capitalize(), "value": v} for k, v in demo_dist.items()],
            "publishing_status": [{"name": k.capitalize(), "value": v} for k, v in status_dist.items()],
            "original_language": [{"name": LANGUAGE_NAMES.get(k, k.upper()), "value": v} for k, v in lang_dist.items()],
            "content_rating": [{"name": k.capitalize(), "value": v} for k, v in content_rating_dist.items()],
        }

    async def get_metadata_distributions(
        self, filter_query: Dict[str, Any], use_cache: Optional[bool] = None
    ) -> Dict[str, Any]:
        cache_key = self._build_cache_key("metadata_distributions", filter_query)
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()
        pipeline = [
            {"$match": filter_query},
            {
                "$facet": {
                    "demographic": [{"$group": {"_id": "$publication_demographic", "count": {"$sum": 1}}}],
                    "publishing_status": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}],
                    "original_language": [{"$group": {"_id": "$original_language", "count": {"$sum": 1}}}],
                    "content_rating": [{"$group": {"_id": "$content_rating", "count": {"$sum": 1}}}],
                }
            },
        ]
        res = await mangas_coll.aggregate(pipeline).to_list(1)
        result = self._format_metadata_distributions(res[0] if res else {})
        await self._try_set_cache(cache_key, result, use_cache=use_cache)
        return result

    async def get_top_creators(self, filter_query: Dict[str, Any], use_cache: Optional[bool] = None) -> Dict[str, Any]:
        cache_key = self._build_cache_key("top_creators", filter_query)
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()
        pipeline = [
            {"$match": filter_query},
            {
                "$facet": {
                    "authors": [
                        {"$match": {"author": {"$ne": None, "$nin": ["Unknown", "N/A"]}}},
                        {"$group": {"_id": "$author", "count": {"$sum": 1}}},
                        {"$sort": {"count": -1}},
                        {"$limit": 5},
                    ],
                    "artists": [
                        {"$match": {"artist": {"$ne": None, "$nin": ["Unknown", "N/A"]}}},
                        {"$group": {"_id": "$artist", "count": {"$sum": 1}}},
                        {"$sort": {"count": -1}},
                        {"$limit": 5},
                    ],
                }
            },
        ]
        res = await mangas_coll.aggregate(pipeline).to_list(1)
        doc = res[0] if res else {}
        result = {
            "authors": [{"name": a["_id"], "count": a["count"]} for a in doc.get("authors", [])],
            "artists": [{"name": a["_id"], "count": a["count"]} for a in doc.get("artists", [])],
        }
        await self._try_set_cache(cache_key, result, use_cache=use_cache)
        return result

    def _format_rating_insights(
        self, demo_res: List[Dict[str, Any]], status_res: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        return {
            "demographic_ratings": [
                {"name": d["_id"].capitalize(), "avg_rating": round(d["avg_rating"], 2)}
                for d in demo_res
                if d.get("_id") is not None and d.get("avg_rating") is not None
            ],
            "status_ratings": [
                {"name": s["_id"].capitalize(), "avg_rating": round(s["avg_rating"], 2)}
                for s in status_res
                if s.get("_id") is not None and s.get("avg_rating") is not None
            ],
        }

    async def get_rating_insights(
        self, filter_query: Dict[str, Any], use_cache: Optional[bool] = None
    ) -> Dict[str, Any]:
        cache_key = self._build_cache_key("rating_insights", filter_query)
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()
        pipeline = [
            {"$match": filter_query},
            {"$match": {"personal_rating": {"$ne": None}}},
            {
                "$facet": {
                    "demo_ratings": [
                        {"$match": {"publication_demographic": {"$ne": None}}},
                        {"$group": {"_id": "$publication_demographic", "avg_rating": {"$avg": "$personal_rating"}}},
                        {"$sort": {"avg_rating": -1}},
                    ],
                    "status_ratings": [
                        {"$match": {"status": {"$ne": None}}},
                        {"$group": {"_id": "$status", "avg_rating": {"$avg": "$personal_rating"}}},
                        {"$sort": {"avg_rating": -1}},
                    ],
                }
            },
        ]
        res = await mangas_coll.aggregate(pipeline).to_list(1)
        doc = res[0] if res else {}
        result = self._format_rating_insights(doc.get("demo_ratings", []), doc.get("status_ratings", []))
        await self._try_set_cache(cache_key, result, use_cache=use_cache)
        return result

    def _format_year_distribution(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        formatted_results = []
        for item in results:
            demo_val = item.get("demographic")
            status_val = item.get("status")
            read_status_val = item.get("read_status")

            formatted_results.append(
                {
                    "year": item["year"],
                    "demographic": demo_val.capitalize() if demo_val else "Unknown",
                    "status": status_val.capitalize() if status_val else "Unknown",
                    "read_status": read_status_val if read_status_val else "unread",
                    "count": item["count"],
                }
            )

        years = [int(item["year"]) for item in formatted_results if str(item.get("year", "")).isdigit()]
        return {
            "data": formatted_results,
            "min_year": min(years) if years else None,
            "max_year": max(years) if years else None,
        }

    async def get_year_distribution(
        self, filter_query: Dict[str, Any], use_cache: Optional[bool] = None
    ) -> Dict[str, Any]:
        cache_key = self._build_cache_key("year_distribution", filter_query)
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()
        year_filter = {**filter_query, "original_language": "ja", "year": {"$regex": "^[0-9]{4}$"}}
        pipeline = [
            {"$match": year_filter},
            {
                "$group": {
                    "_id": {
                        "year": "$year",
                        "demographic": "$publication_demographic",
                        "status": "$status",
                        "read_status": "$read_status",
                    },
                    "count": {"$sum": 1},
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "year": "$_id.year",
                    "demographic": "$_id.demographic",
                    "status": "$_id.status",
                    "read_status": "$_id.read_status",
                    "count": "$count",
                }
            },
            {"$sort": {"year": 1}},
        ]
        results = await mangas_coll.aggregate(pipeline).to_list(1000)
        formatted = self._format_year_distribution(results)
        await self._try_set_cache(cache_key, formatted, use_cache=use_cache)
        return formatted

    async def get_timeline_date_range(
        self, filter_query: Dict[str, Any], use_cache: Optional[bool] = None
    ) -> Dict[str, Any]:
        """Get earliest and latest dates for all 3 timeline data sources."""
        cache_key = self._build_cache_key("timeline_date_range", filter_query)
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()
        reviews_coll = self._get_reviews_collection()
        audit_coll = self._get_audit_collection()

        added_pipeline = [
            {"$match": {**filter_query, "added_at": {"$ne": None}}},
            {"$group": {"_id": None, "earliest": {"$min": "$added_at"}, "latest": {"$max": "$added_at"}}},
        ]

        added_res, raw_manga_ids = await asyncio.gather(
            mangas_coll.aggregate(added_pipeline).to_list(1),
            mangas_coll.find(filter_query).distinct("_id"),
        )
        manga_ids = [str(mid) for mid in raw_manga_ids]

        if not manga_ids:
            review_res, completed_res = [], []
        else:
            review_pipeline = [
                {"$match": {"is_deleted": {"$ne": True}, "manga_id": {"$in": manga_ids}, "created_at": {"$ne": None}}},
                {"$group": {"_id": None, "earliest": {"$min": "$created_at"}, "latest": {"$max": "$created_at"}}},
            ]
            completed_pipeline = [
                {
                    "$match": {
                        "entity_type": "manga",
                        "entity_id": {"$in": manga_ids},
                        "action": "update_status",
                        "field": "read_status",
                        "new_value": {"$in": COMPLETED_AUDIT_VALUES},
                        "timestamp": {"$ne": None},
                    }
                },
                {"$group": {"_id": None, "earliest": {"$min": "$timestamp"}, "latest": {"$max": "$timestamp"}}},
            ]
            review_res, completed_res = await asyncio.gather(
                reviews_coll.aggregate(review_pipeline).to_list(1),
                audit_coll.aggregate(completed_pipeline).to_list(1),
            )

        result = {
            "earliest_added_at": _format_iso(added_res[0]["earliest"]) if added_res else None,
            "latest_added_at": _format_iso(added_res[0]["latest"]) if added_res else None,
            "earliest_review": _format_iso(review_res[0]["earliest"]) if review_res else None,
            "latest_review": _format_iso(review_res[0]["latest"]) if review_res else None,
            "earliest_completed": _format_iso(completed_res[0]["earliest"]) if completed_res else None,
            "latest_completed": _format_iso(completed_res[0]["latest"]) if completed_res else None,
        }
        await self._try_set_cache(cache_key, result, use_cache=use_cache)
        return result

    def _build_mangas_all_facet_pipeline(
        self,
        filter_query: Dict[str, Any],
        now: datetime,
        date_format: str,
        added_start: Optional[datetime],
        added_end: Optional[datetime],
    ) -> List[Dict[str, Any]]:
        seven_days_ago = now - timedelta(days=7)
        fourteen_days_ago = now - timedelta(days=14)
        thirty_days_ago = now - timedelta(days=30)
        sixty_days_ago = now - timedelta(days=60)

        added_date_query = _build_date_range_query(added_start, added_end)
        manga_timeline_branch: List[Dict[str, Any]] = []
        if added_date_query:
            manga_timeline_branch.append({"$match": {"added_at": added_date_query}})
        else:
            manga_timeline_branch.append({"$match": {"added_at": {"$ne": None}}})
        manga_timeline_branch.extend(
            [
                {"$project": {"period": {"$dateToString": {"format": date_format, "date": "$added_at"}}}},
                {"$group": {"_id": "$period", "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}},
            ]
        )

        # Year chart always scopes to Japanese works matching the active filter.
        year_match = {"original_language": "ja", "year": {"$regex": "^[0-9]{4}$"}}

        facets = {
            "summary": [
                {
                    "$group": {
                        "_id": None,
                        "total_manga": {"$sum": 1},
                        "rated_count": {
                            "$sum": {
                                "$cond": [
                                    {
                                        "$and": [
                                            {"$ne": ["$personal_rating", None]},
                                            {"$ne": [{"$type": "$personal_rating"}, "missing"]},
                                        ]
                                    },
                                    1,
                                    0,
                                ]
                            }
                        },
                        "avg_rating": {"$avg": "$personal_rating"},
                        "m_comp_7d": {
                            "$sum": {
                                "$cond": [
                                    {
                                        "$and": [
                                            {"$ne": ["$completed_at", None]},
                                            {"$gte": ["$completed_at", seven_days_ago]},
                                            {"$lte": ["$completed_at", now]},
                                        ]
                                    },
                                    1,
                                    0,
                                ]
                            }
                        },
                        "m_comp_30d": {
                            "$sum": {
                                "$cond": [
                                    {
                                        "$and": [
                                            {"$ne": ["$completed_at", None]},
                                            {"$gte": ["$completed_at", thirty_days_ago]},
                                            {"$lte": ["$completed_at", now]},
                                        ]
                                    },
                                    1,
                                    0,
                                ]
                            }
                        },
                        "added_last_7d": {
                            "$sum": {
                                "$cond": [
                                    {
                                        "$and": [
                                            {"$ne": ["$added_at", None]},
                                            {"$gte": ["$added_at", seven_days_ago]},
                                            {"$lte": ["$added_at", now]},
                                        ]
                                    },
                                    1,
                                    0,
                                ]
                            }
                        },
                        "added_prev_7d": {
                            "$sum": {
                                "$cond": [
                                    {
                                        "$and": [
                                            {"$ne": ["$added_at", None]},
                                            {"$gte": ["$added_at", fourteen_days_ago]},
                                            {"$lt": ["$added_at", seven_days_ago]},
                                        ]
                                    },
                                    1,
                                    0,
                                ]
                            }
                        },
                        "added_last_30d": {
                            "$sum": {
                                "$cond": [
                                    {
                                        "$and": [
                                            {"$ne": ["$added_at", None]},
                                            {"$gte": ["$added_at", thirty_days_ago]},
                                            {"$lte": ["$added_at", now]},
                                        ]
                                    },
                                    1,
                                    0,
                                ]
                            }
                        },
                        "added_prev_30d": {
                            "$sum": {
                                "$cond": [
                                    {
                                        "$and": [
                                            {"$ne": ["$added_at", None]},
                                            {"$gte": ["$added_at", sixty_days_ago]},
                                            {"$lt": ["$added_at", thirty_days_ago]},
                                        ]
                                    },
                                    1,
                                    0,
                                ]
                            }
                        },
                        "earliest_added_at": {"$min": "$added_at"},
                        "latest_added_at": {"$max": "$added_at"},
                    }
                }
            ],
            "status_distribution": [{"$group": {"_id": "$read_status", "count": {"$sum": 1}}}],
            "score_distribution": [
                {"$match": {"personal_rating": {"$ne": None}}},
                {"$group": {"_id": "$personal_rating", "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}},
                {"$limit": 50},
            ],
            "top_tags_raw": [
                {"$unwind": "$tag_ids"},
                {"$group": {"_id": "$tag_ids", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 10},
            ],
            "manga_timeline": manga_timeline_branch,
            "demographic": [{"$group": {"_id": "$publication_demographic", "count": {"$sum": 1}}}],
            "publishing_status": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}],
            "original_language": [{"$group": {"_id": "$original_language", "count": {"$sum": 1}}}],
            "content_rating": [{"$group": {"_id": "$content_rating", "count": {"$sum": 1}}}],
            "top_authors": [
                {"$match": {"author": {"$ne": None, "$nin": ["Unknown", "N/A"]}}},
                {"$group": {"_id": "$author", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 5},
            ],
            "top_artists": [
                {"$match": {"artist": {"$ne": None, "$nin": ["Unknown", "N/A"]}}},
                {"$group": {"_id": "$artist", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 5},
            ],
            "demo_ratings": [
                {"$match": {"personal_rating": {"$ne": None}, "publication_demographic": {"$ne": None}}},
                {"$group": {"_id": "$publication_demographic", "avg_rating": {"$avg": "$personal_rating"}}},
                {"$sort": {"avg_rating": -1}},
            ],
            "status_ratings": [
                {"$match": {"personal_rating": {"$ne": None}, "status": {"$ne": None}}},
                {"$group": {"_id": "$status", "avg_rating": {"$avg": "$personal_rating"}}},
                {"$sort": {"avg_rating": -1}},
            ],
            "year_distribution": [
                {"$match": year_match},
                {
                    "$group": {
                        "_id": {
                            "year": "$year",
                            "demographic": "$publication_demographic",
                            "status": "$status",
                            "read_status": "$read_status",
                        },
                        "count": {"$sum": 1},
                    }
                },
                {
                    "$project": {
                        "_id": 0,
                        "year": "$_id.year",
                        "demographic": "$_id.demographic",
                        "status": "$_id.status",
                        "read_status": "$_id.read_status",
                        "count": "$count",
                    }
                },
                {"$sort": {"year": 1}},
                {"$limit": 1000},
            ],
        }

        pipeline: List[Dict[str, Any]] = []
        if filter_query:
            pipeline.append({"$match": filter_query})
        pipeline.append({"$facet": facets})
        return pipeline

    def _build_reviews_facet_pipeline(
        self,
        manga_ids: List[str],
        date_format: str,
        review_start: Optional[datetime],
        review_end: Optional[datetime],
    ) -> List[Dict[str, Any]]:
        date_query = _build_date_range_query(review_start, review_end)
        timeline_branch: List[Dict[str, Any]] = []
        if date_query:
            timeline_branch.append({"$match": {"created_at": date_query}})
        else:
            timeline_branch.append({"$match": {"created_at": {"$ne": None}}})
        timeline_branch.extend(
            [
                {"$project": {"period": {"$dateToString": {"format": date_format, "date": "$created_at"}}}},
                {"$group": {"_id": "$period", "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}},
            ]
        )

        return [
            {"$match": {"is_deleted": {"$ne": True}, "manga_id": {"$in": manga_ids}}},
            {
                "$facet": {
                    "summary": [
                        {
                            "$group": {
                                "_id": None,
                                "total_reviews": {"$sum": 1},
                                "earliest": {"$min": "$created_at"},
                                "latest": {"$max": "$created_at"},
                            }
                        }
                    ],
                    "timeline": timeline_branch,
                }
            },
        ]

    def _build_audit_facet_pipeline(
        self,
        manga_ids: List[str],
        now: datetime,
        date_format: str,
        completed_start: Optional[datetime],
        completed_end: Optional[datetime],
    ) -> List[Dict[str, Any]]:
        seven_days_ago = now - timedelta(days=7)
        fourteen_days_ago = now - timedelta(days=14)
        thirty_days_ago = now - timedelta(days=30)
        sixty_days_ago = now - timedelta(days=60)

        date_query = _build_date_range_query(completed_start, completed_end)
        timeline_branch: List[Dict[str, Any]] = []
        if date_query:
            timeline_branch.append({"$match": {"timestamp": date_query}})
        else:
            timeline_branch.append({"$match": {"timestamp": {"$ne": None}}})
        timeline_branch.extend(
            [
                {"$project": {"period": {"$dateToString": {"format": date_format, "date": "$timestamp"}}}},
                {"$group": {"_id": "$period", "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}},
            ]
        )

        return [
            {
                "$match": {
                    "entity_type": "manga",
                    "entity_id": {"$in": manga_ids},
                    "action": "update_status",
                    "field": "read_status",
                    "new_value": {"$in": COMPLETED_AUDIT_VALUES},
                }
            },
            {
                "$facet": {
                    "velocity_and_range": [
                        {
                            "$group": {
                                "_id": None,
                                "completed_last_7d": {
                                    "$sum": {
                                        "$cond": [
                                            {
                                                "$and": [
                                                    {"$ne": ["$timestamp", None]},
                                                    {"$gte": ["$timestamp", seven_days_ago]},
                                                    {"$lte": ["$timestamp", now]},
                                                ]
                                            },
                                            1,
                                            0,
                                        ]
                                    }
                                },
                                "completed_prev_7d": {
                                    "$sum": {
                                        "$cond": [
                                            {
                                                "$and": [
                                                    {"$ne": ["$timestamp", None]},
                                                    {"$gte": ["$timestamp", fourteen_days_ago]},
                                                    {"$lt": ["$timestamp", seven_days_ago]},
                                                ]
                                            },
                                            1,
                                            0,
                                        ]
                                    }
                                },
                                "completed_last_30d": {
                                    "$sum": {
                                        "$cond": [
                                            {
                                                "$and": [
                                                    {"$ne": ["$timestamp", None]},
                                                    {"$gte": ["$timestamp", thirty_days_ago]},
                                                    {"$lte": ["$timestamp", now]},
                                                ]
                                            },
                                            1,
                                            0,
                                        ]
                                    }
                                },
                                "completed_prev_30d": {
                                    "$sum": {
                                        "$cond": [
                                            {
                                                "$and": [
                                                    {"$ne": ["$timestamp", None]},
                                                    {"$gte": ["$timestamp", sixty_days_ago]},
                                                    {"$lt": ["$timestamp", thirty_days_ago]},
                                                ]
                                            },
                                            1,
                                            0,
                                        ]
                                    }
                                },
                                "earliest": {"$min": "$timestamp"},
                                "latest": {"$max": "$timestamp"},
                            }
                        }
                    ],
                    "timeline": timeline_branch,
                }
            },
        ]

    async def get_all_analytics(
        self,
        filter_query: Dict[str, Any],
        group_by: str = "month",
        added_start: Optional[datetime] = None,
        added_end: Optional[datetime] = None,
        review_start: Optional[datetime] = None,
        review_end: Optional[datetime] = None,
        completed_start: Optional[datetime] = None,
        completed_end: Optional[datetime] = None,
        use_cache: Optional[bool] = None,
    ) -> Dict[str, Any]:
        cache_key = self._build_cache_key(
            "all",
            {
                "filter": filter_query,
                "group_by": group_by,
                "added_start": added_start,
                "added_end": added_end,
                "review_start": review_start,
                "review_end": review_end,
                "completed_start": completed_start,
                "completed_end": completed_end,
            },
        )
        cached = await self._try_get_cache(cache_key, use_cache=use_cache)
        if cached is not None:
            return cached

        mangas_coll = self._get_mangas_collection()
        reviews_coll = self._get_reviews_collection()
        audit_coll = self._get_audit_collection()
        tags_coll = self._get_tags_collection()

        now = datetime.now(timezone.utc)
        date_format = _resolve_date_format(group_by)

        manga_facet_pipeline = self._build_mangas_all_facet_pipeline(
            filter_query=filter_query,
            now=now,
            date_format=date_format,
            added_start=added_start,
            added_end=added_end,
        )

        # Phase 1: Single consolidated scan on `mangas` + single ID distinct lookup concurrently.
        manga_facet_list, raw_manga_ids = await asyncio.gather(
            mangas_coll.aggregate(manga_facet_pipeline).to_list(1),
            mangas_coll.find(filter_query).distinct("_id"),
        )
        manga_facet = manga_facet_list[0] if manga_facet_list else {}
        manga_ids = [str(mid) for mid in raw_manga_ids]

        top_tags_raw = manga_facet.get("top_tags_raw", [])
        tag_obj_ids = [
            ObjectId(str(item["_id"])) for item in top_tags_raw if ObjectId.is_valid(str(item.get("_id", "")))
        ]

        async def _empty_facet() -> List[Dict[str, Any]]:
            return []

        async def _empty_tags() -> List[Dict[str, Any]]:
            return []

        tag_coro = _collect_cursor(tags_coll.find({"_id": {"$in": tag_obj_ids}})) if tag_obj_ids else _empty_tags()
        if manga_ids:
            reviews_coro = reviews_coll.aggregate(
                self._build_reviews_facet_pipeline(manga_ids, date_format, review_start, review_end)
            ).to_list(1)
            audit_coro = audit_coll.aggregate(
                self._build_audit_facet_pipeline(manga_ids, now, date_format, completed_start, completed_end)
            ).to_list(1)
        else:
            reviews_coro = _empty_facet()
            audit_coro = _empty_facet()

        # Phase 2: Concurrently resolve tag names + consolidated reviews/audit facets (short-circuited if empty).
        tag_docs, review_facet_list, audit_facet_list = await asyncio.gather(tag_coro, reviews_coro, audit_coro)

        summary = (manga_facet.get("summary") or [{}])[0]
        total_manga = int(summary.get("total_manga", 0) or 0)
        rated_count = int(summary.get("rated_count", 0) or 0)
        avg_val = summary.get("avg_rating")
        average_rating = round(float(avg_val), 2) if avg_val is not None else 0.0
        status_dist = {s["_id"]: s["count"] for s in manga_facet.get("status_distribution", []) if s.get("_id")}

        review_facet = review_facet_list[0] if review_facet_list else {}
        review_summary = (review_facet.get("summary") or [{}])[0]
        total_reviews = int(review_summary.get("total_reviews", 0) or 0)

        audit_facet = audit_facet_list[0] if audit_facet_list else {}
        audit_summary = (audit_facet.get("velocity_and_range") or [{}])[0]

        completed_last_7d = max(
            int(audit_summary.get("completed_last_7d", 0) or 0),
            int(summary.get("m_comp_7d", 0) or 0),
        )
        completed_last_30d = max(
            int(audit_summary.get("completed_last_30d", 0) or 0),
            int(summary.get("m_comp_30d", 0) or 0),
        )

        overview = self._build_overview_payload(
            total_manga=total_manga,
            total_reviews=total_reviews,
            average_rating=average_rating,
            status_dist=status_dist,
            rated_count=rated_count,
            completed_last_7d=completed_last_7d,
            completed_prev_7d=int(audit_summary.get("completed_prev_7d", 0) or 0),
            completed_last_30d=completed_last_30d,
            completed_prev_30d=int(audit_summary.get("completed_prev_30d", 0) or 0),
            added_last_7d=int(summary.get("added_last_7d", 0) or 0),
            added_prev_7d=int(summary.get("added_prev_7d", 0) or 0),
            added_last_30d=int(summary.get("added_last_30d", 0) or 0),
            added_prev_30d=int(summary.get("added_prev_30d", 0) or 0),
        )

        tag_doc_map = {str(doc["_id"]): doc for doc in tag_docs}
        top_tags = []
        for item in top_tags_raw:
            tid = str(item.get("_id", ""))
            tag_info = tag_doc_map.get(tid)
            if not tag_info:
                continue
            top_tags.append(
                {
                    "tag_id": item["_id"],
                    "name": _extract_tag_display_name(tag_info.get("name", {})),
                    "count": item["count"],
                    "color": tag_info.get("color"),
                }
            )

        score_distribution = [
            {"score": item["_id"], "count": item["count"]} for item in manga_facet.get("score_distribution", [])
        ]
        manga_timeline = [
            {"period": item["_id"], "count": item["count"]}
            for item in manga_facet.get("manga_timeline", [])
            if item.get("_id") is not None
        ]
        review_timeline = [
            {"period": item["_id"], "count": item["count"]}
            for item in review_facet.get("timeline", [])
            if item.get("_id") is not None
        ]
        completed_timeline = [
            {"period": item["_id"], "count": item["count"]}
            for item in audit_facet.get("timeline", [])
            if item.get("_id") is not None
        ]

        metadata_distributions = self._format_metadata_distributions(manga_facet)
        top_creators = {
            "authors": [{"name": a["_id"], "count": a["count"]} for a in manga_facet.get("top_authors", [])],
            "artists": [{"name": a["_id"], "count": a["count"]} for a in manga_facet.get("top_artists", [])],
        }
        rating_insights = self._format_rating_insights(
            manga_facet.get("demo_ratings", []),
            manga_facet.get("status_ratings", []),
        )
        year_distribution = self._format_year_distribution(manga_facet.get("year_distribution", []))
        timeline_date_range = {
            "earliest_added_at": _format_iso(summary.get("earliest_added_at")),
            "latest_added_at": _format_iso(summary.get("latest_added_at")),
            "earliest_review": _format_iso(review_summary.get("earliest")),
            "latest_review": _format_iso(review_summary.get("latest")),
            "earliest_completed": _format_iso(audit_summary.get("earliest")),
            "latest_completed": _format_iso(audit_summary.get("latest")),
        }

        result = {
            "overview": overview,
            "score_distribution": score_distribution,
            "top_tags": top_tags,
            "manga_timeline": manga_timeline,
            "review_timeline": review_timeline,
            "completed_timeline": completed_timeline,
            "metadata_distributions": metadata_distributions,
            "top_creators": top_creators,
            "rating_insights": rating_insights,
            "year_distribution": year_distribution,
            "timeline_date_range": timeline_date_range,
        }
        await self._try_set_cache(cache_key, result, use_cache=use_cache)
        return result


analytics_service = AnalyticsService()
