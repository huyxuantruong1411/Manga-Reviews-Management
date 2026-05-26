import logging
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

    def build_match_stage(self, 
                          search: Optional[str] = None, 
                          read_status: Optional[str] = None,
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
            clauses.append({"$or": [
                {"title": {"$regex": search, "$options": "i"}},
                {"alt_titles": {"$regex": search, "$options": "i"}},
                {"author": {"$regex": search, "$options": "i"}},
                {"artist": {"$regex": search, "$options": "i"}}
            ]})
            
        if read_status:
            clauses.append({"read_status": read_status})
            
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
                words = [w.strip() for w in name.split() if w.strip()]
                if not words:
                    continue
                if len(words) == 1:
                    or_clauses.append({field: {"$regex": words[0], "$options": "i"}})
                else:
                    or_clauses.append({"$and": [{field: {"$regex": w, "$options": "i"}} for w in words]})
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
        res = await mangas_coll.aggregate(pipeline).to_list(200)
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
        res = await reviews_coll.aggregate(pipeline).to_list(200)
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
        lang_names = {"ja": "Japanese", "ko": "Korean", "zh": "Chinese", "en": "English", "Unknown": "Unknown"}
        
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

    async def get_all_analytics(self, filter_query: Dict[str, Any], group_by: str = "month",
                                added_start: Optional[datetime] = None, added_end: Optional[datetime] = None,
                                review_start: Optional[datetime] = None, review_end: Optional[datetime] = None) -> Dict[str, Any]:
        mangas_coll = self._get_mangas_collection()
        
        overview = await self.get_overview_stats(filter_query)
        score_distribution = await self.get_score_distribution(filter_query)
        top_tags = await self.get_top_tags(filter_query)
        
        manga_timeline = await self.get_manga_added_timeline(filter_query, group_by, added_start, added_end)
        
        manga_ids = [str(mid) for mid in await mangas_coll.find(filter_query).distinct("_id")]
        review_timeline = await self.get_review_activity_timeline(manga_ids, group_by, review_start, review_end)
        
        metadata_distributions = await self.get_metadata_distributions(filter_query)
        top_creators = await self.get_top_creators(filter_query)
        rating_insights = await self.get_rating_insights(filter_query)
        
        return {
            "overview": overview,
            "score_distribution": score_distribution,
            "top_tags": top_tags,
            "manga_timeline": manga_timeline,
            "review_timeline": review_timeline,
            "metadata_distributions": metadata_distributions,
            "top_creators": top_creators,
            "rating_insights": rating_insights
        }

analytics_service = AnalyticsService()
