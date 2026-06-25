import logging
import re
from datetime import datetime
from bson import ObjectId
from typing import List, Dict, Any, Optional
from backend.database.connection import get_db
from backend.models.manga import MangaCreate, MangaCreateDex, MangaUpdate, ReadStatus
from backend.services.mangadex_service import mangadex_service
from backend.services.minio_service import minio_service

logger = logging.getLogger(__name__)

def serialize_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc

def safe_int(val: Any) -> Optional[int]:
    if not val:
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None

def get_tag_default_color(name_en: str) -> str:
    name_lower = name_en.lower()
    if name_lower in ["gore", "sexual violence", "mature"]:
        return "#ef4444"
    elif name_lower in ["suggestive"]:
        return "#eab308"
    elif name_lower in ["doujinshi"]:
        return "#7c3aed"
    else:
        return "#3f3f46"

class DuplicateMangaException(ValueError):
    def __init__(self, manga_id: str, title: str):
        self.manga_id = manga_id
        self.title = title
        super().__init__(f"Manga '{title}' already exists in your library")


class MangaService:
    def _get_mangas_collection(self):
        return get_db().mangas

    def _get_tags_collection(self):
        return get_db().tags

    def _get_audit_collection(self):
        return get_db().audit_logs

    async def log_action(self, manga_id: str, action: str, field: Optional[str] = None, 
                         old_val: Any = None, new_val: Any = None, note: Optional[str] = None):
        """Helper to create an audit log entry."""
        def get_val_str(val):
            if val is None:
                return None
            if hasattr(val, "value"):
                return str(val.value)
            val_str = str(val)
            if val_str.startswith("ReadStatus."):
                return val_str.split(".", 1)[1].lower()
            return val_str

        log_doc = {
            "entity_type": "manga",
            "entity_id": manga_id,
            "action": action,
            "field": field,
            "old_value": get_val_str(old_val),
            "new_value": get_val_str(new_val),
            "timestamp": datetime.utcnow(),
            "note": note
        }
        await self._get_audit_collection().insert_one(log_doc)

    async def get_mangas(self, search: Optional[str] = None, read_status: Optional[str] = None,
                         read_statuses: Optional[List[str]] = None, exclude_read_statuses: Optional[List[str]] = None,
                         tags: Optional[List[str]] = None, exclude_tags: Optional[List[str]] = None,
                         tag_mode: str = "all", content_ratings: Optional[List[str]] = None,
                         demographics: Optional[List[str]] = None, statuses: Optional[List[str]] = None,
                         original_languages: Optional[List[str]] = None, author: Optional[str] = None,
                         artist: Optional[str] = None, authors: Optional[List[str]] = None,
                         artists: Optional[List[str]] = None, rating_min: Optional[float] = None,
                         rating_max: Optional[float] = None, year: Optional[str] = None,
                         year_start: Optional[str] = None, year_end: Optional[str] = None,
                         sort_by: str = "added_at", sort_order: str = "desc",
                         skip: int = 0, limit: int = 20) -> Dict[str, Any]:
        
        clauses = []
        
        # Filtering
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
            
        # Tag inclusion and exclusion
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
            
        # Metadata filters
        if content_ratings:
            clauses.append({"content_rating": {"$in": content_ratings}})
            
        if demographics:
            clauses.append({"publication_demographic": {"$in": demographics}})
            
        if statuses:
            clauses.append({"status": {"$in": statuses}})
            
        if original_languages:
            clauses.append({"original_language": {"$in": original_languages}})
            
        # Build creator (author / artist) clauses using exact name matching.
        # The author/artist fields store comma-separated names (e.g. "Name1, Name2"),
        # so we match the full name as a complete entry, not as a substring.
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

        # Authors
        all_authors = []
        if author:
            all_authors.append(author)
        if authors:
            all_authors.extend(authors)
        all_authors = list(set([a.strip() for a in all_authors if a and a.strip()]))
        if all_authors:
            clause = build_creator_match_clause("author", all_authors)
            if clause:
                clauses.append(clause)

        # Artists
        all_artists = []
        if artist:
            all_artists.append(artist)
        if artists:
            all_artists.extend(artists)
        all_artists = list(set([a.strip() for a in all_artists if a and a.strip()]))
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
            
        if year and year != "N/A":
            clauses.append({"year": year})
        else:
            year_clause = {}
            if year_start:
                year_clause["$gte"] = year_start
            if year_end:
                year_clause["$lte"] = year_end
            if year_clause:
                year_clause["$regex"] = "^[0-9]{4}$"
                clauses.append({"year": year_clause})

        query = {}
        if clauses:
            if len(clauses) == 1:
                query = clauses[0]
            else:
                query = {"$and": clauses}

        # Sorting
        order = -1 if sort_order == "desc" else 1
        # MongoDB sort format
        sort_query = [(sort_by, order)]
        
        # Execute query
        coll = self._get_mangas_collection()
        total = await coll.count_documents(query)
        
        cursor = coll.find(query).sort(sort_query).skip(skip).limit(limit)
        items = []
        async for doc in cursor:
            # Map cover image
            if doc.get("minio_cover_key"):
                doc["cover_url"] = minio_service.get_presigned_url(doc["minio_cover_key"])
            items.append(serialize_doc(doc))
            
        return {
            "total": total,
            "items": items,
            "skip": skip,
            "limit": limit
        }

    async def _try_recover_cover(self, manga_id: str, mangadex_id: str) -> Optional[str]:
        """Attempt to recover a missing cover image from MangaDex.
        Returns a presigned MinIO URL on success, or None on failure."""
        try:
            details = await mangadex_service.get_manga_details(mangadex_id)
            if not details or not details.get("cover_url"):
                return None
            cover_bytes = await mangadex_service.download_image_bytes(details["cover_url"])
            if not cover_bytes:
                return None
            minio_cover_key = f"covers/{manga_id}.jpg"
            minio_service.upload_cover(minio_cover_key, cover_bytes)
            await self._get_mangas_collection().update_one(
                {"_id": ObjectId(manga_id)},
                {"$set": {"minio_cover_key": minio_cover_key, "updated_at": datetime.utcnow()}}
            )
            logger.info(f"Auto-recovered missing cover for manga {manga_id} ({mangadex_id})")
            return minio_service.get_presigned_url(minio_cover_key)
        except Exception as e:
            logger.warning(f"Failed to auto-recover cover for manga {manga_id}: {e}")
            return None

    async def get_manga_by_id(self, manga_id: str) -> Optional[Dict[str, Any]]:
        if not ObjectId.is_valid(manga_id):
            return None
        doc = await self._get_mangas_collection().find_one({"_id": ObjectId(manga_id)})
        if not doc:
            return None
        if doc.get("minio_cover_key"):
            doc["cover_url"] = minio_service.get_presigned_url(doc["minio_cover_key"])
        elif doc.get("mangadex_id"):
            # Auto-recover missing cover: attempt to download in-band so the user
            # sees the cover on this request (or next refresh if it takes too long).
            recovered_url = await self._try_recover_cover(str(doc["_id"]), doc["mangadex_id"])
            if recovered_url:
                doc["cover_url"] = recovered_url
                doc["minio_cover_key"] = f"covers/{doc['_id']}.jpg"
        return serialize_doc(doc)

    async def get_manga_by_any_id(self, identifier: str) -> Optional[Dict[str, Any]]:
        coll = self._get_mangas_collection()
        doc = None
        if ObjectId.is_valid(identifier):
            doc = await coll.find_one({"_id": ObjectId(identifier)})
        else:
            doc = await coll.find_one({"mangadex_id": identifier})
        if doc and doc.get("minio_cover_key"):
            doc["cover_url"] = minio_service.get_presigned_url(doc["minio_cover_key"])
        return serialize_doc(doc)

    async def add_manga_by_dex(self, dex_data: MangaCreateDex) -> Dict[str, Any]:
        # 1. Fetch metadata from MangaDex
        details = await mangadex_service.get_manga_details(dex_data.mangadex_id)
        if not details:
            raise ValueError(f"Could not find manga details on MangaDex for ID {dex_data.mangadex_id}")
            
        # Proactively sync creators
        from backend.services.creator_service import creator_service
        for author_meta in details.get("authors_meta", []):
            try:
                await creator_service.sync_creator_by_dex_id(author_meta["id"])
            except Exception as e:
                logger.error(f"Failed to sync creator {author_meta['id']}: {e}")
        for artist_meta in details.get("artists_meta", []):
            try:
                await creator_service.sync_creator_by_dex_id(artist_meta["id"])
            except Exception as e:
                logger.error(f"Failed to sync creator {artist_meta['id']}: {e}")
            
        # 2. Check if already exists in DB
        existing = await self._get_mangas_collection().find_one({"mangadex_id": dex_data.mangadex_id})
        if existing:
            raise DuplicateMangaException(str(existing["_id"]), existing.get("title", "Unknown"))

        # 3. Resolve and create tags locally
        local_tag_ids = []
        tags_coll = self._get_tags_collection()
        tags_from_details = details.get("tags", [])
        mangadex_ids = [t["mangadex_id"] for t in tags_from_details if t.get("mangadex_id")]
        
        # Batch fetch all existing tags
        existing_tags = {}
        if mangadex_ids:
            cursor = tags_coll.find({"mangadex_id": {"$in": mangadex_ids}})
            async for doc in cursor:
                existing_tags[doc["mangadex_id"]] = doc

        for t in tags_from_details:
            tag_doc = existing_tags.get(t["mangadex_id"])
            if not tag_doc:
                # Insert tag
                new_tag = {
                    "mangadex_id": t["mangadex_id"],
                    "source": "mangadex",
                    "name": t["name"],
                    "group": t["group"],
                    "description": t["description"],
                    "color": get_tag_default_color(t["name"].get("en", "")),
                    "created_at": datetime.utcnow()
                }
                res = await tags_coll.insert_one(new_tag)
                local_tag_ids.append(str(res.inserted_id))
            else:
                local_tag_ids.append(str(tag_doc["_id"]))

        # Merge with user tags
        for utid in dex_data.tag_ids:
            if utid not in local_tag_ids:
                local_tag_ids.append(utid)

        # 4. Prepare Document
        manga_id = ObjectId()
        minio_cover_key = f"covers/{manga_id}.jpg"
        
        # Download and upload cover
        cover_url = details.get("cover_url")
        if cover_url:
            cover_bytes = await mangadex_service.download_image_bytes(cover_url)
            if cover_bytes:
                minio_service.upload_cover(minio_cover_key, cover_bytes)
            else:
                minio_cover_key = None
        else:
            minio_cover_key = None

        init_status = str(dex_data.read_status).lower()
        if init_status.startswith("readstatus."):
            init_status = init_status.split(".", 1)[1]

        manga_doc = {
            "_id": manga_id,
            "mangadex_id": dex_data.mangadex_id,
            "title": details["title"],
            "alt_titles": details["alt_titles"],
            "description": details["description"],
            "author": details["author"],
            "artist": details["artist"],
            "year": details["year"],
            "status": details["status"],
            "minio_cover_key": minio_cover_key,
            "read_status": dex_data.read_status,
            "personal_rating": dex_data.personal_rating,
            "tag_ids": local_tag_ids,
            "links": details.get("links", []),
            "content_rating": details.get("content_rating"),
            "publication_demographic": details.get("publication_demographic"),
            "original_language": details.get("original_language"),
            "published_start_date": None,
            "published_end_date": None,
            "volumes": safe_int(details.get("last_volume")),
            "chapters": safe_int(details.get("last_chapter")),
            "added_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "unread_at": datetime.utcnow() if init_status == "unread" else None,
            "reading_at": datetime.utcnow() if init_status == "reading" else None,
            "completed_at": datetime.utcnow() if init_status == "completed" else None,
            "dropped_at": datetime.utcnow() if init_status == "dropped" else None,
            "on_hold_at": datetime.utcnow() if init_status == "on_hold" else None,
            "plan_to_read_at": datetime.utcnow() if init_status == "plan_to_read" else None,
            "re_reading_at": datetime.utcnow() if init_status == "re_reading" else None,
        }

        await self._get_mangas_collection().insert_one(manga_doc)
        
        # Audit Log
        await self.log_action(str(manga_id), "create", note="Added from MangaDex UUID")
        if dex_data.read_status != ReadStatus.UNREAD:
            await self.log_action(str(manga_id), "update_status", "read_status", ReadStatus.UNREAD, dex_data.read_status)
        if dex_data.personal_rating is not None:
            await self.log_action(str(manga_id), "update_rating", "personal_rating", None, str(dex_data.personal_rating))
            
        # Proactively sync cover art gallery and recommendations
        try:
            from backend.services.cover_art_service import cover_art_service
            logger.info(f"Proactively syncing cover arts for newly imported manga {manga_id} ({details['title']})")
            await cover_art_service.sync_covers_for_manga(str(manga_id))
        except Exception as e:
            logger.error(f"Failed to sync covers for newly imported manga {manga_id}: {e}")

        try:
            from backend.services.recommendation_service import recommendation_service
            logger.info(f"Proactively syncing recommendations for newly imported manga {manga_id} ({details['title']})")
            await recommendation_service.sync_recommendations(str(manga_id))
        except Exception as e:
            logger.error(f"Failed to sync recommendations for newly imported manga {manga_id}: {e}")

        manga_doc["cover_url"] = minio_service.get_presigned_url(minio_cover_key) if minio_cover_key else None
        return serialize_doc(manga_doc)

    async def import_manga_by_dex_stream(self, dex_data: MangaCreateDex):
        # Step 1: Metadata
        yield {"step": "metadata", "message": "Fetching metadata from MangaDex...", "progress": 10}
        details = await mangadex_service.get_manga_details(dex_data.mangadex_id)
        if not details:
            raise ValueError(f"Could not find manga details on MangaDex for ID {dex_data.mangadex_id}")
            
        # Step 2: Sync creators
        yield {"step": "creators", "message": "Syncing authors and artists profiles...", "progress": 30}
        from backend.services.creator_service import creator_service
        for author_meta in details.get("authors_meta", []):
            try:
                await creator_service.sync_creator_by_dex_id(author_meta["id"])
            except Exception as e:
                logger.error(f"Failed to sync creator {author_meta['id']}: {e}")
        for artist_meta in details.get("artists_meta", []):
            try:
                await creator_service.sync_creator_by_dex_id(artist_meta["id"])
            except Exception as e:
                logger.error(f"Failed to sync creator {artist_meta['id']}: {e}")
            
        # Step 3: Resolve tags
        yield {"step": "tags", "message": "Organizing and mapping genre tags...", "progress": 50}
        existing = await self._get_mangas_collection().find_one({"mangadex_id": dex_data.mangadex_id})
        if existing:
            raise DuplicateMangaException(str(existing["_id"]), existing.get("title", "Unknown"))

        local_tag_ids = []
        tags_coll = self._get_tags_collection()
        tags_from_details = details.get("tags", [])
        mangadex_ids = [t["mangadex_id"] for t in tags_from_details if t.get("mangadex_id")]
        
        existing_tags = {}
        if mangadex_ids:
            cursor = tags_coll.find({"mangadex_id": {"$in": mangadex_ids}})
            async for doc in cursor:
                existing_tags[doc["mangadex_id"]] = doc

        for t in tags_from_details:
            tag_doc = existing_tags.get(t["mangadex_id"])
            if not tag_doc:
                new_tag = {
                    "mangadex_id": t["mangadex_id"],
                    "source": "mangadex",
                    "name": t["name"],
                    "group": t["group"],
                    "description": t["description"],
                    "color": get_tag_default_color(t["name"].get("en", "")),
                    "created_at": datetime.utcnow()
                }
                res = await tags_coll.insert_one(new_tag)
                local_tag_ids.append(str(res.inserted_id))
            else:
                local_tag_ids.append(str(tag_doc["_id"]))

        for utid in dex_data.tag_ids:
            if utid not in local_tag_ids:
                local_tag_ids.append(utid)

        # Step 4: Cover
        yield {"step": "cover", "message": "Downloading cover artwork & uploading to storage...", "progress": 70}
        manga_id = ObjectId()
        minio_cover_key = f"covers/{manga_id}.jpg"
        
        cover_url = details.get("cover_url")
        if cover_url:
            cover_bytes = await mangadex_service.download_image_bytes(cover_url)
            if cover_bytes:
                minio_service.upload_cover(minio_cover_key, cover_bytes)
            else:
                minio_cover_key = None
        else:
            minio_cover_key = None

        # Step 5: Save
        yield {"step": "save", "message": "Saving manga to local database...", "progress": 85}
        init_status = str(dex_data.read_status).lower()
        if init_status.startswith("readstatus."):
            init_status = init_status.split(".", 1)[1]

        manga_doc = {
            "_id": manga_id,
            "mangadex_id": dex_data.mangadex_id,
            "title": details["title"],
            "alt_titles": details["alt_titles"],
            "description": details["description"],
            "author": details["author"],
            "artist": details["artist"],
            "year": details["year"],
            "status": details["status"],
            "minio_cover_key": minio_cover_key,
            "read_status": dex_data.read_status,
            "personal_rating": dex_data.personal_rating,
            "tag_ids": local_tag_ids,
            "links": details.get("links", []),
            "content_rating": details.get("content_rating"),
            "publication_demographic": details.get("publication_demographic"),
            "original_language": details.get("original_language"),
            "published_start_date": None,
            "published_end_date": None,
            "volumes": safe_int(details.get("last_volume")),
            "chapters": safe_int(details.get("last_chapter")),
            "added_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "unread_at": datetime.utcnow() if init_status == "unread" else None,
            "reading_at": datetime.utcnow() if init_status == "reading" else None,
            "completed_at": datetime.utcnow() if init_status == "completed" else None,
            "dropped_at": datetime.utcnow() if init_status == "dropped" else None,
            "on_hold_at": datetime.utcnow() if init_status == "on_hold" else None,
            "plan_to_read_at": datetime.utcnow() if init_status == "plan_to_read" else None,
            "re_reading_at": datetime.utcnow() if init_status == "re_reading" else None,
        }

        await self._get_mangas_collection().insert_one(manga_doc)
        
        await self.log_action(str(manga_id), "create", note="Added from MangaDex UUID")
        if dex_data.read_status != ReadStatus.UNREAD:
            await self.log_action(str(manga_id), "update_status", "read_status", ReadStatus.UNREAD, dex_data.read_status)
        if dex_data.personal_rating is not None:
            await self.log_action(str(manga_id), "update_rating", "personal_rating", None, str(dex_data.personal_rating))
            
        # Step 6: Sync cover art and recommendations
        yield {"step": "sync_assets", "message": "Fetching alternative covers & recommendations...", "progress": 95}
        try:
            from backend.services.cover_art_service import cover_art_service
            await cover_art_service.sync_covers_for_manga(str(manga_id))
        except Exception as e:
            logger.error(f"Failed to sync covers for newly imported manga {manga_id}: {e}")

        try:
            from backend.services.recommendation_service import recommendation_service
            await recommendation_service.sync_recommendations(str(manga_id))
        except Exception as e:
            logger.error(f"Failed to sync recommendations for newly imported manga {manga_id}: {e}")

        manga_doc["cover_url"] = minio_service.get_presigned_url(minio_cover_key) if minio_cover_key else None
        
        yield {
            "step": "done",
            "message": f"Successfully imported '{details['title']}'!",
            "progress": 100,
            "manga": serialize_doc(manga_doc)
        }

    async def add_manga_manual(self, manual_data: MangaCreate, cover_file: Optional[bytes] = None) -> Dict[str, Any]:
        manga_id = ObjectId()
        minio_cover_key = None
        
        if cover_file:
            minio_cover_key = f"covers/{manga_id}.jpg"
            minio_service.upload_cover(minio_cover_key, cover_file)

        init_status = str(manual_data.read_status).lower()
        if init_status.startswith("readstatus."):
            init_status = init_status.split(".", 1)[1]

        manga_doc = {
            "_id": manga_id,
            "mangadex_id": None,
            "title": manual_data.title,
            "alt_titles": manual_data.alt_titles,
            "description": manual_data.description,
            "author": manual_data.author,
            "artist": manual_data.artist,
            "year": manual_data.year,
            "status": manual_data.status,
            "minio_cover_key": minio_cover_key,
            "read_status": manual_data.read_status,
            "personal_rating": manual_data.personal_rating,
            "tag_ids": manual_data.tag_ids,
            "links": [link.dict() for link in manual_data.links],
            "content_rating": manual_data.content_rating,
            "publication_demographic": manual_data.publication_demographic,
            "original_language": manual_data.original_language,
            "published_start_date": manual_data.published_start_date,
            "published_end_date": manual_data.published_end_date,
            "volumes": manual_data.volumes,
            "chapters": manual_data.chapters,
            "added_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "unread_at": datetime.utcnow() if init_status == "unread" else None,
            "reading_at": datetime.utcnow() if init_status == "reading" else None,
            "completed_at": datetime.utcnow() if init_status == "completed" else None,
            "dropped_at": datetime.utcnow() if init_status == "dropped" else None,
            "on_hold_at": datetime.utcnow() if init_status == "on_hold" else None,
            "plan_to_read_at": datetime.utcnow() if init_status == "plan_to_read" else None,
            "re_reading_at": datetime.utcnow() if init_status == "re_reading" else None,
        }

        await self._get_mangas_collection().insert_one(manga_doc)
        
        # Audit Log
        await self.log_action(str(manga_id), "create", note="Added manually")
        if manual_data.read_status != ReadStatus.UNREAD:
            await self.log_action(str(manga_id), "update_status", "read_status", ReadStatus.UNREAD, manual_data.read_status)
        if manual_data.personal_rating is not None:
            await self.log_action(str(manga_id), "update_rating", "personal_rating", None, str(manual_data.personal_rating))

        manga_doc["cover_url"] = minio_service.get_presigned_url(minio_cover_key) if minio_cover_key else None
        return serialize_doc(manga_doc)

    async def update_manga(self, manga_id: str, update_data: MangaUpdate, new_cover_file: Optional[bytes] = None) -> Optional[Dict[str, Any]]:
        if not ObjectId.is_valid(manga_id):
            return None
            
        coll = self._get_mangas_collection()
        existing = await coll.find_one({"_id": ObjectId(manga_id)})
        if not existing:
            return None

        update_dict = {}
        data = update_data.dict(exclude_unset=True)
        
        # Log fields that are changing
        for field, new_val in data.items():
            old_val = existing.get(field)
            if old_val != new_val:
                update_dict[field] = new_val
                
                # Create audit log entries for key updates
                if field == "read_status":
                    await self.log_action(manga_id, "update_status", "read_status", str(old_val), str(new_val))
                    new_status_str = str(new_val).lower()
                    if new_status_str.startswith("readstatus."):
                        new_status_str = new_status_str.split(".", 1)[1]
                    status_field = f"{new_status_str}_at"
                    update_dict[status_field] = datetime.utcnow()
                elif field == "personal_rating":
                    await self.log_action(manga_id, "update_rating", "personal_rating", str(old_val), str(new_val))
                else:
                    await self.log_action(manga_id, "update_metadata", field, str(old_val), str(new_val))

        # Handle cover file upload
        if new_cover_file:
            minio_cover_key = existing.get("minio_cover_key") or f"covers/{manga_id}.jpg"
            minio_service.upload_cover(minio_cover_key, new_cover_file)
            update_dict["minio_cover_key"] = minio_cover_key
            await self.log_action(manga_id, "update_cover", "minio_cover_key", existing.get("minio_cover_key"), minio_cover_key)

        if not update_dict and not new_cover_file:
            return existing

        update_dict["updated_at"] = datetime.utcnow()
        await coll.update_one({"_id": ObjectId(manga_id)}, {"$set": update_dict})
        
        updated_doc = await coll.find_one({"_id": ObjectId(manga_id)})
        if updated_doc.get("minio_cover_key"):
            updated_doc["cover_url"] = minio_service.get_presigned_url(updated_doc["minio_cover_key"])
        return serialize_doc(updated_doc)

    async def delete_manga(self, manga_id: str) -> bool:
        if not ObjectId.is_valid(manga_id):
            return False
            
        coll = self._get_mangas_collection()
        existing = await coll.find_one({"_id": ObjectId(manga_id)})
        if not existing:
            return False
            
        # Delete cover from MinIO
        if existing.get("minio_cover_key"):
            minio_service.delete_cover(existing["minio_cover_key"])
            
        # Delete synced cover arts from MinIO & DB
        db = get_db()
        cursor = db.cover_arts.find({"manga_id": manga_id})
        async for doc in cursor:
            if doc.get("minio_key"):
                minio_service.delete_cover(doc["minio_key"])
        await db.cover_arts.delete_many({"manga_id": manga_id})

        # Delete recommendations
        await db.manga_recommendations.delete_many({"manga_id": manga_id})
            
        # Delete reviews (or soft delete)
        await get_db().reviews.update_many({"manga_id": manga_id}, {"$set": {"is_deleted": True, "updated_at": datetime.utcnow()}})
        
        # Delete manga
        await coll.delete_one({"_id": ObjectId(manga_id)})
        
        # Clean up audit logs
        await self._get_audit_collection().delete_many({"entity_id": manga_id})
        
        return True

    async def sync_manga_metadata(self, manga_id: str) -> Optional[Dict[str, Any]]:
        if not ObjectId.is_valid(manga_id):
            return None
            
        coll = self._get_mangas_collection()
        manga = await coll.find_one({"_id": ObjectId(manga_id)})
        if not manga or not manga.get("mangadex_id"):
            return manga  # Can't sync if manual

        details = await mangadex_service.get_manga_details(manga["mangadex_id"])
        if not details:
            logger.warning(f"Could not fetch details from MangaDex for sync: {manga['mangadex_id']}")
            return manga

        # Proactively sync creators
        from backend.services.creator_service import creator_service
        for author_meta in details.get("authors_meta", []):
            try:
                await creator_service.sync_creator_by_dex_id(author_meta["id"])
            except Exception as e:
                logger.error(f"Failed to sync creator {author_meta['id']}: {e}")
        for artist_meta in details.get("artists_meta", []):
            try:
                await creator_service.sync_creator_by_dex_id(artist_meta["id"])
            except Exception as e:
                logger.error(f"Failed to sync creator {artist_meta['id']}: {e}")

        # Resolve tags
        local_tag_ids = list(manga.get("tag_ids", []))
        tags_coll = self._get_tags_collection()
        tags_from_details = details.get("tags", [])
        mangadex_ids = [t["mangadex_id"] for t in tags_from_details if t.get("mangadex_id")]
        
        # Batch fetch all existing tags
        existing_tags = {}
        if mangadex_ids:
            cursor = tags_coll.find({"mangadex_id": {"$in": mangadex_ids}})
            async for doc in cursor:
                existing_tags[doc["mangadex_id"]] = doc

        for t in tags_from_details:
            tag_doc = existing_tags.get(t["mangadex_id"])
            if not tag_doc:
                new_tag = {
                    "mangadex_id": t["mangadex_id"],
                    "source": "mangadex",
                    "name": t["name"],
                    "group": t["group"],
                    "description": t["description"],
                    "color": get_tag_default_color(t["name"].get("en", "")),
                    "created_at": datetime.utcnow()
                }
                res = await tags_coll.insert_one(new_tag)
                local_tag_ids.append(str(res.inserted_id))
            else:
                tag_id_str = str(tag_doc["_id"])
                if tag_id_str not in local_tag_ids:
                    local_tag_ids.append(tag_id_str)

        # Download & update cover
        minio_cover_key = manga.get("minio_cover_key") or f"covers/{manga_id}.jpg"
        cover_url = details.get("cover_url")
        if cover_url:
            cover_bytes = await mangadex_service.download_image_bytes(cover_url)
            if cover_bytes:
                minio_service.upload_cover(minio_cover_key, cover_bytes)
            else:
                minio_cover_key = manga.get("minio_cover_key")
        else:
            minio_cover_key = manga.get("minio_cover_key")

        existing_alts = manga.get("alt_titles") or []
        new_alts = details.get("alt_titles") or []
        merged_alts = list(existing_alts)
        for alt in new_alts:
            if alt not in merged_alts:
                merged_alts.append(alt)

        update_fields = {
            "title": details["title"],
            "alt_titles": merged_alts,
            "description": details["description"],
            "author": details["author"],
            "artist": details["artist"],
            "year": details["year"],
            "status": details["status"],
            "tag_ids": local_tag_ids,
            "links": details.get("links", []),
            "minio_cover_key": minio_cover_key,
            "content_rating": details.get("content_rating"),
            "publication_demographic": details.get("publication_demographic"),
            "original_language": details.get("original_language"),
            "volumes": safe_int(details.get("last_volume")) if safe_int(details.get("last_volume")) is not None else manga.get("volumes"),
            "chapters": safe_int(details.get("last_chapter")) if safe_int(details.get("last_chapter")) is not None else manga.get("chapters"),
            "updated_at": datetime.utcnow()
        }

        await coll.update_one({"_id": ObjectId(manga_id)}, {"$set": update_fields})
        await self.log_action(manga_id, "sync_metadata", note="Synced metadata from MangaDex")
        
        synced_manga = await coll.find_one({"_id": ObjectId(manga_id)})
        if synced_manga.get("minio_cover_key"):
            synced_manga["cover_url"] = minio_service.get_presigned_url(synced_manga["minio_cover_key"])
        return serialize_doc(synced_manga)

    async def get_manga_history(self, manga_id: str) -> List[Dict[str, Any]]:
        cursor = self._get_audit_collection().find({"entity_id": manga_id}).sort("timestamp", -1)
        history = []
        async for doc in cursor:
            # Convert _id
            doc["_id"] = str(doc["_id"])
            history.append(doc)
        return history

manga_service = MangaService()
