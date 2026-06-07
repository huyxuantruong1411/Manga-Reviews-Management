import logging
import re
from datetime import datetime
from typing import Any, Dict, Optional, List
from backend.database.connection import get_db
from backend.services.mangadex_service import mangadex_service

logger = logging.getLogger(__name__)

def serialize_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc

class CreatorService:
    def _get_creators_collection(self):
        return get_db().creators

    async def get_creator_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get creator details from local database or fetch/cache from MangaDex.
        Case-insensitive match on name.
        """
        coll = self._get_creators_collection()
        # Case insensitive search in local MongoDB
        existing = await coll.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
        if existing:
            return serialize_doc(existing)

        # If not found locally, query MangaDex API
        logger.info(f"Creator '{name}' not found locally. Querying MangaDex...")
        try:
            details = await mangadex_service.get_creator_by_name(name)
            if details:
                # Cache it locally
                creator_doc = {
                    "mangadex_id": details["mangadex_id"],
                    "name": details["name"],
                    "biography": details["biography"],
                    "twitter": details["twitter"],
                    "pixiv": details["pixiv"],
                    "youtube": details["youtube"],
                    "website": details["website"],
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                # Double-check case-insensitive before inserting, to avoid race conditions
                race_check = await coll.find_one({"name": {"$regex": f"^{re.escape(details['name'])}$", "$options": "i"}})
                if not race_check:
                    await coll.insert_one(creator_doc)
                else:
                    creator_doc = race_check
                return serialize_doc(creator_doc)
        except Exception as e:
            logger.error(f"Error fetching creator from MangaDex by name '{name}': {e}")

        # If completely not found or error, insert a placeholder in MongoDB to avoid repeatedly hitting MangaDex API
        placeholder_doc = {
            "mangadex_id": None,
            "name": name,
            "biography": {"en": f"No biography found for {name}."},
            "twitter": None,
            "pixiv": None,
            "youtube": None,
            "website": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        await coll.insert_one(placeholder_doc)
        return serialize_doc(placeholder_doc)

    async def sync_creator_by_dex_id(self, dex_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch from MangaDex and save to local creators cache.
        """
        coll = self._get_creators_collection()
        existing = await coll.find_one({"mangadex_id": dex_id})
        
        try:
            details = await mangadex_service.get_creator_by_id(dex_id)
            if not details:
                return serialize_doc(existing) if existing else None

            creator_doc = {
                "mangadex_id": details["mangadex_id"],
                "name": details["name"],
                "biography": details["biography"],
                "twitter": details["twitter"],
                "pixiv": details["pixiv"],
                "youtube": details["youtube"],
                "website": details["website"],
                "updated_at": datetime.utcnow()
            }

            if existing:
                await coll.update_one({"_id": existing["_id"]}, {"$set": creator_doc})
                creator_doc["_id"] = existing["_id"]
                creator_doc["created_at"] = existing.get("created_at", datetime.utcnow())
            else:
                creator_doc["created_at"] = datetime.utcnow()
                res = await coll.insert_one(creator_doc)
                creator_doc["_id"] = res.inserted_id

            return serialize_doc(creator_doc)
        except Exception as e:
            logger.error(f"Error syncing creator by MangaDex ID '{dex_id}': {e}")
            return serialize_doc(existing) if existing else None

    async def get_suggestions(self, query: Optional[str] = None, role: Optional[str] = None) -> List[str]:
        """
        Get suggestions for authors/artists.
        If role is 'author', suggestions will be fetched from distinct authors in mangas,
        plus any cached creators. Same for 'artist'.
        Supports name-swapping / word-independent matches.
        """
        mangas_coll = get_db().mangas
        creators_coll = self._get_creators_collection()
        
        names_set = set()
        
        # 1. Fetch from mangas collection based on role
        if role == "author":
            authors_raw = await mangas_coll.distinct("author")
            self._add_split_names(authors_raw, names_set)
        elif role == "artist":
            artists_raw = await mangas_coll.distinct("artist")
            self._add_split_names(artists_raw, names_set)
        else:
            authors_raw = await mangas_coll.distinct("author")
            artists_raw = await mangas_coll.distinct("artist")
            self._add_split_names(authors_raw, names_set)
            self._add_split_names(artists_raw, names_set)
            
        # 2. Fetch from creators collection
        async for creator in creators_coll.find({}, {"name": 1}):
            name = creator.get("name")
            if name:
                clean = name.strip()
                if clean and clean.lower() not in ["unknown", "n/a", ""]:
                    names_set.add(clean)
                    
        # 3. Filter using name-swapping logic
        result = list(names_set)
        if query:
            query_words = [w.lower() for w in query.strip().split() if w]
            if query_words:
                result = [
                    name for name in result 
                    if all(qw in name.lower() for qw in query_words)
                ]
                
        # Sort alphabetically
        result.sort()
        return result

    def _add_split_names(self, raw_list: List[str], names_set: set):
        for raw_val in raw_list:
            if not raw_val:
                continue
            # Split by comma or semicolon
            parts = re.split(r'[,;]', raw_val)
            for p in parts:
                clean = p.strip()
                if clean and clean.lower() not in ["unknown", "n/a", "", "various", "various creators"]:
                    names_set.add(clean)

creator_service = CreatorService()
