import logging
import re
from datetime import datetime
from bson import ObjectId
from typing import Dict, Any, List, Optional
from backend.database.connection import get_db

logger = logging.getLogger(__name__)

class AnalyticsService:
    def _get_mangas_collection(self):
        return get_db().mangas

    def _get_reviews_collection(self):
        return get_db().reviews

    def _get_tags_collection(self):
        return get_db().tags

    def _get_audit_collection(self):
        return get_db().audit_logs

    def build_match_stage(self, 
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
                          year_end: Optional[str] = None) -> Dict[str, Any]:
        clauses = []
        
        if search:
            escaped = re.escape(search)
            # Full escaped-string match (exact substring)
            full_match = {"$or": [
                {"title": {"$regex": escaped, "$options": "i"}},
                {"alt_titles": {"$regex": escaped, "$options": "i"}},
                {"author": {"$regex": escaped, "$options": "i"}},
                {"artist": {"$regex": escaped, "$options": "i"}}
            ]}
            # Multi-word AND match: each word must appear somewhere in any searchable field
            words = [w.strip() for w in search.split() if w.strip()]
            if len(words) > 1:
                word_patterns = []
                for word in words:
                    ew = re.escape(word)
                    word_patterns.append({"$or": [
                        {"title": {"$regex": ew, "$options": "i"}},
                        {"alt_titles": {"$regex": ew, "$options": "i"}},
                        {"author": {"$regex": ew, "$options": "i"}},
                        {"artist": {"$regex": ew, "$options": "i"}}
                    ]})
                multi_word_match = {"$and": word_patterns}
                clauses.append({"$or": [full_match, multi_word_match]})
            else:
                clauses.append(full_match)
            
        # Read status include
        status_include = []
        if read_status:
            status_include.append(read_status)
        if read_statuses:
            status_include.extend(read_statuses)
        status_include = list(set([s for s in status_include if s]))
        
        if status_include:
            clauses.append({"read_status": {"$in": status_include}})
            
        if exclude_read_statuses:
            clauses.append({"read_status": {"$nin": exclude_read_statuses}})
            
        tag_clause = {}
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
                # Match the exact name as a standalone entry in a comma-separated list:
                #   - ^name$ (only entry)
                #   - ^name\s*, (first entry)
                #   - ,\s*name\s*, (middle entry)
                #   - ,\s*name$ (last entry)
                pattern = f"(^|,\\s*){escaped}(\\s*,|$)"
                or_clauses.append({field: {"$regex": pattern, "$options": "i"}})
            if or_clauses:
                return {"$or": or_clauses}
            return None

        if authors:
            all_authors = list(set([a.strip() for a in authors if a and a.strip()]))
            if all_authors:
                clause = build_creator_match_clause("author", all_authors)
                if clause:
                    clauses.append(clause)

        if artists:
            all_artists = list(set([a.strip() for a in artists if a and a.strip()]))
            if all_artists:
                clause = build_creator_match_clause("artist", all_artists)
                if clause:
                    clauses.append(clause)
            
        if rating_min is not None or rating_max is not None:
            rating_query = {}
            if rating_min is not None:
                rating_query["$gte"] = rating_min
            if rating_max is not None:
                rating_query["$lte"] = rating_max
            clauses.append({"personal_rating": rating_query})
            
        year_clause = {}
        if year_start:
            year_clause["$gte"] = year_start
        if year_end:
            year_clause["$lte"] = year_end
        if year_clause:
            year_clause["$regex"] = "^[0-9]{4}$"
            clauses.append({"year": year_clause})

        if clauses:
            if len(clauses) == 1:
                return clauses[0]
            else:
                return {"$and": clauses}
        return {}

    async def get_overview_stats(self, filter_query: Dict[str, Any]) -> Dict[str, Any]:
        mangas_coll = self._get_mangas_collection()
        reviews_coll = self._get_reviews_collection()

        total_manga = await mangas_coll.count_documents(filter_query)
        
        manga_ids = [str(mid) for mid in await mangas_coll.find(filter_query).distinct("_id")]
        total_reviews = await reviews_coll.count_documents({
            "is_deleted": {"$ne": True},
            "manga_id": {"$in": manga_ids}
        })

        pipeline = [
            {"$match": filter_query},
            {"$match": {"personal_rating": {"$ne": None}}},
            {"$group": {"_id": None, "avg_rating": {"$avg": "$personal_rating"}}}
        ]
        avg_res = await mangas_coll.aggregate(pipeline).to_list(1)
        average_rating = round(avg_res[0]["avg_rating"], 2) if avg_res else 0.0

        status_pipeline = [
            {"$match": filter_query},
            {"$group": {"_id": "$read_status", "count": {"$sum": 1}}}
        ]
        status_res = await mangas_coll.aggregate(status_pipeline).to_list(10)
        status_dist = {s["_id"]: s["count"] for s in status_res}

        for status in ["unread", "reading", "completed", "dropped", "on_hold", "plan_to_read", "re_reading"]:
            if status not in status_dist:
                status_dist[status] = 0

        return {
            "total_manga": total_manga,
            "total_reviews": total_reviews,
            "average_rating": average_rating,
            "status_distribution": status_dist
        }

    async def get_score_distribution(self, filter_query: Dict[str, Any]) -> List[Dict[str, Any]]:
        mangas_coll = self._get_mangas_collection()
        pipeline = [
            {"$match": filter_query},
            {"$match": {"personal_rating": {"$ne": None}}},
            {"$group": {"_id": "$personal_rating", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
        res = await mangas_coll.aggregate(pipeline).to_list(50)
        return [{"score": item["_id"], "count": item["count"]} for item in res]

    async def get_top_tags(self, filter_query: Dict[str, Any]) -> List[Dict[str, Any]]:
        mangas_coll = self._get_mangas_collection()
        
        pipeline = [
            {"$match": filter_query},
            {"$unwind": "$tag_ids"},
            {"$group": {"_id": "$tag_ids", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
            {"$addFields": {"tag_obj_id": {"$toObjectId": "$_id"}}},
            {
                "$lookup": {
                    "from": "tags",
                    "localField": "tag_obj_id",
                    "foreignField": "_id",
                    "as": "tag_info"
                }
            },
            {"$unwind": "$tag_info"},
            {
                "$project": {
                    "_id": 1,
                    "count": 1,
                    "name": "$tag_info.name",
                    "color": "$tag_info.color"
                }
            }
        ]
        res = await mangas_coll.aggregate(pipeline).to_list(10)
        
        formatted = []
        for item in res:
            names = item.get("name", {})
            name = names.get("en") or (list(names.values())[0] if names else "Unknown")
            formatted.append({
                "tag_id": item["_id"],
                "name": name,
                "count": item["count"],
                "color": item.get("color")
            })
        return formatted

    async def get_tags_details(self, filter_query: Dict[str, Any]) -> List[Dict[str, Any]]:
        mangas_coll = self._get_mangas_collection()
        tags_coll = self._get_tags_collection()
        
        # 1. Fetch all tags for metadata (names & colors)
        tag_metadata = {}
        async for doc in tags_coll.find({}):
            tag_id_str = str(doc["_id"])
            names = doc.get("name", {})
            name_en = names.get("en") or (list(names.values())[0] if names else "Unknown")
            tag_metadata[tag_id_str] = {
                "name": name_en,
                "color": doc.get("color")
            }
            
        # 2. Run MongoDB aggregation
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
                        "rating": "$personal_rating"
                    },
                    "count": {"$sum": 1}
                }
            }
        ]
        
        # 3. Post-process the results
        tag_analytics = {}
        async for item in mangas_coll.aggregate(pipeline):
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
                    "ratings": {}
                }
                
            stats = tag_analytics[tag_id]
            stats["count"] += count
            
            # Demographic
            demo = group_info.get("demographic") or "Unknown"
            demo = demo.capitalize()
            stats["demographics"][demo] = stats["demographics"].get(demo, 0) + count
            
            # Content Rating
            cr = group_info.get("content_rating") or "Unknown"
            cr = cr.capitalize()
            stats["content_ratings"][cr] = stats["content_ratings"].get(cr, 0) + count
            
            # Publication Status
            status = group_info.get("status") or "Unknown"
            status = status.capitalize()
            stats["statuses"][status] = stats["statuses"].get(status, 0) + count
            
            # Read Status
            read_status_labels = {
                "unread": "Unread",
                "reading": "Reading",
                "completed": "Completed",
                "dropped": "Dropped",
                "on_hold": "On Hold",
                "plan_to_read": "Plan to Read",
                "re_reading": "Re-Reading"
            }
            rs_raw = group_info.get("read_status") or "unread"
            rs_formatted = read_status_labels.get(rs_raw.lower(), rs_raw.capitalize())
            stats["read_statuses"][rs_formatted] = stats["read_statuses"].get(rs_formatted, 0) + count
            
            # Personal rating for completed mangas
            read_status = group_info.get("read_status") or "unread"
            rating = group_info.get("rating")
            if read_status in ["completed", "ReadStatus.COMPLETED"] and rating is not None:
                rating_int = int(rating)
                stats["ratings"][rating_int] = stats["ratings"].get(rating_int, 0) + count
                
        # 4. Format outputs as sorted list by total manga count descending
        formatted_list = list(tag_analytics.values())
        formatted_list.sort(key=lambda x: x["count"], reverse=True)
        
        # Format mapping dicts into Recharts-friendly lists
        for stats in formatted_list:
            stats["demographics"] = [{"name": k, "value": v} for k, v in stats["demographics"].items()]
            stats["content_ratings"] = [{"name": k, "value": v} for k, v in stats["content_ratings"].items()]
            stats["statuses"] = [{"name": k, "value": v} for k, v in stats["statuses"].items()]
            stats["read_statuses"] = [{"name": k, "value": v} for k, v in stats["read_statuses"].items()]
            stats["ratings"] = [{"score": k, "count": v} for k, v in sorted(stats["ratings"].items())]
            
        return formatted_list

    async def get_creators_details(self, filter_query: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
        mangas_coll = self._get_mangas_collection()
        tags_coll = self._get_tags_collection()
        
        # 1. Fetch all tags for metadata (names & colors)
        tag_metadata = {}
        async for doc in tags_coll.find({}):
            tag_id_str = str(doc["_id"])
            names = doc.get("name", {})
            name_en = names.get("en") or (list(names.values())[0] if names else "Unknown")
            tag_metadata[tag_id_str] = {
                "name": name_en,
                "color": doc.get("color")
            }
            
        read_status_labels = {
            "unread": "Unread",
            "reading": "Reading",
            "completed": "Completed",
            "dropped": "Dropped",
            "on_hold": "On Hold",
            "plan_to_read": "Plan to Read",
            "re_reading": "Re-Reading"
        }
        
        async def run_pipeline(creator_field: str, other_creator_field: str, is_author_list: bool):
            pipeline = [
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
                            "other_creator": f"${other_creator_field}"
                        },
                        "tag_ids": {"$push": "$tag_ids"},
                        "count": {"$sum": 1}
                    }
                }
            ]
            
            creator_analytics = {}
            async for item in mangas_coll.aggregate(pipeline):
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
                        "roles": {
                            "Author only" if is_author_list else "Artist only": 0,
                            "Both": 0
                        }
                    }
                    
                stats = creator_analytics[creator]
                stats["count"] += count
                
                # Role count
                if other_creator == creator:
                    stats["roles"]["Both"] = stats["roles"].get("Both", 0) + count
                else:
                    sole_role = "Author only" if is_author_list else "Artist only"
                    stats["roles"][sole_role] = stats["roles"].get(sole_role, 0) + count
                
                # Demographic
                demo = group_info.get("demographic") or "Unknown"
                demo = demo.capitalize()
                stats["demographics"][demo] = stats["demographics"].get(demo, 0) + count
                
                # Content Rating
                cr = group_info.get("content_rating") or "Unknown"
                cr = cr.capitalize()
                stats["content_ratings"][cr] = stats["content_ratings"].get(cr, 0) + count
                
                # Read Status
                rs_raw = group_info.get("read_status") or "unread"
                rs_formatted = read_status_labels.get(rs_raw.lower(), rs_raw.capitalize())
                stats["read_statuses"][rs_formatted] = stats["read_statuses"].get(rs_formatted, 0) + count
                
                # Personal rating for completed mangas
                read_status = group_info.get("read_status") or "unread"
                rating = group_info.get("rating")
                if read_status in ["completed", "ReadStatus.COMPLETED"] and rating is not None:
                    rating_int = int(rating)
                    stats["ratings"][rating_int] = stats["ratings"].get(rating_int, 0) + count
                    
                # Tags accumulation
                for tag_list in pushed_tags:
                    if isinstance(tag_list, list):
                        for tid in tag_list:
                            if tid:
                                stats["tag_counts"][str(tid)] = stats["tag_counts"].get(str(tid), 0) + 1
                    elif tag_list:
                        stats["tag_counts"][str(tag_list)] = stats["tag_counts"].get(str(tag_list), 0) + 1
                        
            # Format and map tags
            formatted_creators = []
            for name, stats in creator_analytics.items():
                top_tags = []
                for tid, tcnt in stats["tag_counts"].items():
                    meta = tag_metadata.get(tid, {"name": "Unknown", "color": None})
                    top_tags.append({
                        "name": meta["name"],
                        "count": tcnt,
                        "color": meta["color"]
                    })
                top_tags.sort(key=lambda x: x["count"], reverse=True)
                
                formatted_creators.append({
                    "name": name,
                    "count": stats["count"],
                    "roles": [{"name": k, "value": v} for k, v in stats["roles"].items()],
                    "demographics": [{"name": k, "value": v} for k, v in stats["demographics"].items()],
                    "content_ratings": [{"name": k, "value": v} for k, v in stats["content_ratings"].items()],
                    "read_statuses": [{"name": k, "value": v} for k, v in stats["read_statuses"].items()],
                    "ratings": [{"score": k, "count": v} for k, v in sorted(stats["ratings"].items())],
                    "tags": top_tags[:8]
                })
                
            formatted_creators.sort(key=lambda x: x["count"], reverse=True)
            return formatted_creators
            
        authors_details = await run_pipeline("author", "artist", is_author_list=True)
        artists_details = await run_pipeline("artist", "author", is_author_list=False)
        
        return {
            "authors": authors_details,
            "artists": artists_details
        }

    async def get_manga_added_timeline(self, filter_query: Dict[str, Any], group_by: str = "month",
                                        start_date: Optional[datetime] = None,
                                        end_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
        mangas_coll = self._get_mangas_collection()
        
        match_query = dict(filter_query)
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date
        if date_query:
            match_query["added_at"] = date_query

        date_format = "%Y-%m"
        if group_by == "hour":
            date_format = "%Y-%m-%d %H:00"
        elif group_by == "day":
            date_format = "%Y-%m-%d"
        elif group_by == "week":
            date_format = "%G-W%V"
        elif group_by == "year":
            date_format = "%Y"

        pipeline = [
            {"$match": match_query},
            {
                "$project": {
                    "period": {
                        "$dateToString": {"format": date_format, "date": "$added_at"}
                    }
                }
            },
            {"$group": {"_id": "$period", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
        res = await mangas_coll.aggregate(pipeline).to_list(None)
        return [{"period": item["_id"], "count": item["count"]} for item in res]

    async def get_manga_completed_timeline(self, manga_ids: List[str], group_by: str = "month",
                                            start_date: Optional[datetime] = None,
                                            end_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
        audit_coll = self._get_audit_collection()
        
        match_query = {
            "entity_type": "manga",
            "entity_id": {"$in": manga_ids},
            "action": "update_status",
            "field": "read_status",
            "new_value": {"$in": ["completed", "ReadStatus.COMPLETED"]}
        }
        
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date
        if date_query:
            match_query["timestamp"] = date_query

        date_format = "%Y-%m"
        if group_by == "hour":
            date_format = "%Y-%m-%d %H:00"
        elif group_by == "day":
            date_format = "%Y-%m-%d"
        elif group_by == "week":
            date_format = "%G-W%V"
        elif group_by == "year":
            date_format = "%Y"

        pipeline = [
            {"$match": match_query},
            {
                "$project": {
                    "period": {
                        "$dateToString": {"format": date_format, "date": "$timestamp"}
                    }
                }
            },
            {"$group": {"_id": "$period", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
        res = await audit_coll.aggregate(pipeline).to_list(None)
        return [{"period": item["_id"], "count": item["count"]} for item in res]

    async def get_review_activity_timeline(self, manga_ids: List[str], group_by: str = "month",
                                            start_date: Optional[datetime] = None,
                                            end_date: Optional[datetime] = None) -> List[Dict[str, Any]]:
        reviews_coll = self._get_reviews_collection()
        
        match_query = {"is_deleted": {"$ne": True}, "manga_id": {"$in": manga_ids}}
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date
        if date_query:
            match_query["created_at"] = date_query

        date_format = "%Y-%m"
        if group_by == "hour":
            date_format = "%Y-%m-%d %H:00"
        elif group_by == "day":
            date_format = "%Y-%m-%d"
        elif group_by == "week":
            date_format = "%G-W%V"
        elif group_by == "year":
            date_format = "%Y"

        pipeline = [
            {"$match": match_query},
            {
                "$project": {
                    "period": {
                        "$dateToString": {"format": date_format, "date": "$created_at"}
                    }
                }
            },
            {"$group": {"_id": "$period", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
        res = await reviews_coll.aggregate(pipeline).to_list(None)
        return [{"period": item["_id"], "count": item["count"]} for item in res]

    async def get_metadata_distributions(self, filter_query: Dict[str, Any]) -> Dict[str, Any]:
        mangas_coll = self._get_mangas_collection()
        
        # Demographic
        demo_pipeline = [
            {"$match": filter_query},
            {"$group": {"_id": "$publication_demographic", "count": {"$sum": 1}}}
        ]
        demo_res = await mangas_coll.aggregate(demo_pipeline).to_list(10)
        demo_dist = {d["_id"] or "Unknown": d["count"] for d in demo_res}

        # Status
        status_pipeline = [
            {"$match": filter_query},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_res = await mangas_coll.aggregate(status_pipeline).to_list(10)
        status_dist = {s["_id"] or "Unknown": s["count"] for s in status_res}

        # Original Language
        lang_pipeline = [
            {"$match": filter_query},
            {"$group": {"_id": "$original_language", "count": {"$sum": 1}}}
        ]
        lang_res = await mangas_coll.aggregate(lang_pipeline).to_list(50)
        lang_dist = {l["_id"] or "Unknown": l["count"] for l in lang_res}

        # Pretty language names
        lang_names = {
            "ja": "Japanese",
            "ko": "Korean",
            "zh": "Chinese",
            "en": "English",
            "vi": "Vietnamese",
            "ru": "Russian",
            "fr": "French",
            "de": "German",
            "es": "Spanish",
            "Unknown": "Unknown"
        }
        
        # Content Rating
        content_rating_pipeline = [
            {"$match": filter_query},
            {"$group": {"_id": "$content_rating", "count": {"$sum": 1}}}
        ]
        content_rating_res = await mangas_coll.aggregate(content_rating_pipeline).to_list(10)
        content_rating_dist = {c["_id"] or "Unknown": c["count"] for c in content_rating_res}

        return {
            "demographic": [{"name": k.capitalize(), "value": v} for k, v in demo_dist.items()],
            "publishing_status": [{"name": k.capitalize(), "value": v} for k, v in status_dist.items()],
            "original_language": [{"name": lang_names.get(k, k.upper()), "value": v} for k, v in lang_dist.items()],
            "content_rating": [{"name": k.capitalize(), "value": v} for k, v in content_rating_dist.items()]
        }

    async def get_top_creators(self, filter_query: Dict[str, Any]) -> Dict[str, Any]:
        mangas_coll = self._get_mangas_collection()
        
        author_pipeline = [
            {"$match": filter_query},
            {"$match": {"author": {"$ne": None, "$nin": ["Unknown", "N/A"]}}},
            {"$group": {"_id": "$author", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5}
        ]
        author_res = await mangas_coll.aggregate(author_pipeline).to_list(5)
        
        artist_pipeline = [
            {"$match": filter_query},
            {"$match": {"artist": {"$ne": None, "$nin": ["Unknown", "N/A"]}}},
            {"$group": {"_id": "$artist", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5}
        ]
        artist_res = await mangas_coll.aggregate(artist_pipeline).to_list(5)

        return {
            "authors": [{"name": a["_id"], "count": a["count"]} for a in author_res],
            "artists": [{"name": a["_id"], "count": a["count"]} for a in artist_res]
        }

    async def get_rating_insights(self, filter_query: Dict[str, Any]) -> Dict[str, Any]:
        mangas_coll = self._get_mangas_collection()
        
        demo_pipeline = [
            {"$match": filter_query},
            {"$match": {"personal_rating": {"$ne": None}, "publication_demographic": {"$ne": None}}},
            {"$group": {"_id": "$publication_demographic", "avg_rating": {"$avg": "$personal_rating"}}},
            {"$sort": {"avg_rating": -1}}
        ]
        demo_res = await mangas_coll.aggregate(demo_pipeline).to_list(10)
        
        status_pipeline = [
            {"$match": filter_query},
            {"$match": {"personal_rating": {"$ne": None}, "status": {"$ne": None}}},
            {"$group": {"_id": "$status", "avg_rating": {"$avg": "$personal_rating"}}},
            {"$sort": {"avg_rating": -1}}
        ]
        status_res = await mangas_coll.aggregate(status_pipeline).to_list(10)

        return {
            "demographic_ratings": [{"name": d["_id"].capitalize(), "avg_rating": round(d["avg_rating"], 2)} for d in demo_res],
            "status_ratings": [{"name": s["_id"].capitalize(), "avg_rating": round(s["avg_rating"], 2)} for s in status_res]
        }

    async def get_year_distribution(self, filter_query: Dict[str, Any]) -> Dict[str, Any]:
        mangas_coll = self._get_mangas_collection()
        
        year_filter = {
            **filter_query,
            "original_language": "ja",
            "year": {"$regex": "^[0-9]{4}$"}
        }
        
        pipeline = [
            {"$match": year_filter},
            {
                "$group": {
                    "_id": {
                        "year": "$year",
                        "demographic": "$publication_demographic",
                        "status": "$status",
                        "read_status": "$read_status"
                    },
                    "count": {"$sum": 1}
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "year": "$_id.year",
                    "demographic": "$_id.demographic",
                    "status": "$_id.status",
                    "read_status": "$_id.read_status",
                    "count": "$count"
                }
            },
            {"$sort": {"year": 1}}
        ]
        
        results = await mangas_coll.aggregate(pipeline).to_list(1000)
        
        formatted_results = []
        for item in results:
            demo_val = item.get("demographic")
            status_val = item.get("status")
            read_status_val = item.get("read_status")
            
            formatted_results.append({
                "year": item["year"],
                "demographic": (demo_val.capitalize() if demo_val else "Unknown"),
                "status": (status_val.capitalize() if status_val else "Unknown"),
                "read_status": (read_status_val if read_status_val else "unread"),
                "count": item["count"]
            })
            
        years = [int(item["year"]) for item in formatted_results if item["year"].isdigit()]
        min_year = min(years) if years else None
        max_year = max(years) if years else None
        
        return {
            "data": formatted_results,
            "min_year": min_year,
            "max_year": max_year
        }

    async def get_timeline_date_range(self, filter_query: Dict[str, Any]) -> Dict[str, Any]:
        """Get earliest and latest dates for all 3 timeline data sources.
        Used by frontend to compute valid lookback ranges and date picker limits."""
        mangas_coll = self._get_mangas_collection()
        reviews_coll = self._get_reviews_collection()
        audit_coll = self._get_audit_collection()
        
        # Earliest/latest added_at from mangas
        added_pipeline = [
            {"$match": {**filter_query, "added_at": {"$ne": None}}},
            {"$group": {
                "_id": None,
                "earliest": {"$min": "$added_at"},
                "latest": {"$max": "$added_at"}
            }}
        ]
        added_res = await mangas_coll.aggregate(added_pipeline).to_list(1)
        
        # Get manga_ids for review and audit queries
        manga_ids = [str(mid) for mid in await mangas_coll.find(filter_query).distinct("_id")]
        
        # Earliest/latest review created_at
        review_pipeline = [
            {"$match": {"is_deleted": {"$ne": True}, "manga_id": {"$in": manga_ids}, "created_at": {"$ne": None}}},
            {"$group": {
                "_id": None,
                "earliest": {"$min": "$created_at"},
                "latest": {"$max": "$created_at"}
            }}
        ]
        review_res = await reviews_coll.aggregate(review_pipeline).to_list(1)
        
        # Earliest/latest completed timestamp from audit_logs
        completed_pipeline = [
            {"$match": {
                "entity_type": "manga",
                "entity_id": {"$in": manga_ids},
                "action": "update_status",
                "field": "read_status",
                "new_value": {"$in": ["completed", "ReadStatus.COMPLETED"]},
                "timestamp": {"$ne": None}
            }},
            {"$group": {
                "_id": None,
                "earliest": {"$min": "$timestamp"},
                "latest": {"$max": "$timestamp"}
            }}
        ]
        completed_res = await audit_coll.aggregate(completed_pipeline).to_list(1)
        
        def fmt(dt):
            return dt.isoformat() if dt else None
        
        return {
            "earliest_added_at": fmt(added_res[0]["earliest"]) if added_res else None,
            "latest_added_at": fmt(added_res[0]["latest"]) if added_res else None,
            "earliest_review": fmt(review_res[0]["earliest"]) if review_res else None,
            "latest_review": fmt(review_res[0]["latest"]) if review_res else None,
            "earliest_completed": fmt(completed_res[0]["earliest"]) if completed_res else None,
            "latest_completed": fmt(completed_res[0]["latest"]) if completed_res else None
        }

    async def get_all_analytics(self, filter_query: Dict[str, Any], group_by: str = "month",
                                added_start: Optional[datetime] = None, added_end: Optional[datetime] = None,
                                review_start: Optional[datetime] = None, review_end: Optional[datetime] = None,
                                completed_start: Optional[datetime] = None, completed_end: Optional[datetime] = None) -> Dict[str, Any]:
        mangas_coll = self._get_mangas_collection()
        
        overview = await self.get_overview_stats(filter_query)
        score_distribution = await self.get_score_distribution(filter_query)
        top_tags = await self.get_top_tags(filter_query)
        
        manga_timeline = await self.get_manga_added_timeline(filter_query, group_by, added_start, added_end)
        
        manga_ids = [str(mid) for mid in await mangas_coll.find(filter_query).distinct("_id")]
        review_timeline = await self.get_review_activity_timeline(manga_ids, group_by, review_start, review_end)
        completed_timeline = await self.get_manga_completed_timeline(manga_ids, group_by, completed_start, completed_end)
        
        metadata_distributions = await self.get_metadata_distributions(filter_query)
        top_creators = await self.get_top_creators(filter_query)
        rating_insights = await self.get_rating_insights(filter_query)
        year_distribution = await self.get_year_distribution(filter_query)
        timeline_date_range = await self.get_timeline_date_range(filter_query)
        
        return {
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
            "timeline_date_range": timeline_date_range
        }

analytics_service = AnalyticsService()

