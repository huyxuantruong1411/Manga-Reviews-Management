import logging
import re
import unicodedata
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from backend.database.connection import get_db
from backend.services.mangadex_service import mangadex_service

logger = logging.getLogger(__name__)

UUID_PATTERN = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
IGNORED_CREATOR_NAMES = {"unknown", "n/a", "", "various", "various creators"}


def slugify_creator_name(name: Optional[str]) -> str:
    """Convert a creator display name into a URL-friendly slug (e.g. 'Nakamura Moto' -> 'nakamura-moto')."""
    if not name or not isinstance(name, str):
        return "creator"
    normalized = unicodedata.normalize("NFKD", name.strip())
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    if slug:
        return slug
    # Fallback for pure CJK/non-Latin names: keep word characters separated by hyphens
    unicode_slug = re.sub(r"[^\w]+", "-", name.strip().lower(), flags=re.UNICODE).strip("-_")
    return unicode_slug or "creator"


def deterministic_creator_uuid(name: Optional[str], mangadex_id: Optional[str] = None) -> str:
    """Return mangadex_id if present, otherwise generate a stable UUIDv5 from the normalized creator name."""
    if mangadex_id and isinstance(mangadex_id, str) and mangadex_id.strip():
        return mangadex_id.strip()
    clean_name = (name or "unknown").strip().lower()
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"manga-creator:{clean_name}"))


def extract_creator_links(doc: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """Normalize top-level social fields (twitter, pixiv, youtube, website) and nested links dict."""
    if not doc or not isinstance(doc, dict):
        return {}
    links: Dict[str, str] = {}
    raw_links = doc.get("links")
    if isinstance(raw_links, dict):
        for k, v in raw_links.items():
            if k and isinstance(v, str) and v.strip():
                links[str(k).strip()] = v.strip()
    for platform in ("twitter", "pixiv", "youtube", "website"):
        val = doc.get(platform)
        if isinstance(val, str) and val.strip():
            links[platform] = val.strip()
    return links


def split_creator_names(raw: Any) -> List[str]:
    """Split comma/semicolon-separated creator names while ignoring placeholders."""
    if not raw or not isinstance(raw, str):
        return []
    result: List[str] = []
    for part in re.split(r"[,;]", raw):
        clean = part.strip()
        if clean and clean.lower() not in IGNORED_CREATOR_NAMES:
            result.append(clean)
    return result


def serialize_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    name = doc.get("name") or "Unknown"
    mangadex_id = doc.get("mangadex_id")
    doc["creator_id"] = doc.get("creator_id") or deterministic_creator_uuid(name, mangadex_id)
    doc["slug"] = doc.get("slug") or slugify_creator_name(name)
    doc["links"] = extract_creator_links(doc)
    if "created_at" not in doc or not doc["created_at"]:
        doc["created_at"] = doc.get("updated_at") or datetime.utcnow()
    if "updated_at" not in doc or not doc["updated_at"]:
        doc["updated_at"] = doc["created_at"]
    return doc


class CreatorService:
    def _get_creators_collection(self):
        return get_db().creators

    def _get_collection(self):
        return self._get_creators_collection()

    async def get_creator_by_id_or_name(self, identifier: str) -> Optional[Dict[str, Any]]:
        """
        Resolve a creator by canonical UUID (creator_id / mangadex_id) first,
        then fallback to display name or slug.
        """
        if not identifier or not identifier.strip():
            return None
        clean_id = identifier.strip()
        coll = self._get_creators_collection()

        # 1. Exact match by creator_id or mangadex_id
        by_id = await coll.find_one(
            {
                "$or": [
                    {"creator_id": clean_id},
                    {"mangadex_id": clean_id},
                ]
            }
        )
        if by_id:
            return serialize_doc(by_id)

        # 2. If identifier is a valid UUID and not cached locally yet, try syncing from MangaDex by ID
        if UUID_PATTERN.match(clean_id):
            synced = await self.sync_creator_by_dex_id(clean_id)
            if synced:
                return synced

        # 3. Fallback to name or slug lookup
        by_slug = await coll.find_one({"slug": clean_id.lower()})
        if by_slug:
            return serialize_doc(by_slug)

        return await self.get_creator_by_name(clean_id)

    async def get_creator_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get creator details from local database or fetch/cache from MangaDex.
        Case-insensitive match on name.
        """
        coll = self._get_creators_collection()
        existing = await coll.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
        if existing:
            return serialize_doc(existing)

        logger.info(f"Creator '{name}' not found locally. Querying MangaDex...")
        try:
            details = await mangadex_service.get_creator_by_name(name)
            if details:
                dex_id = details.get("mangadex_id")
                creator_id = deterministic_creator_uuid(details["name"], dex_id)
                slug = slugify_creator_name(details["name"])
                creator_doc = {
                    "creator_id": creator_id,
                    "slug": slug,
                    "mangadex_id": dex_id,
                    "name": details["name"],
                    "biography": details.get("biography") or {},
                    "twitter": details.get("twitter"),
                    "pixiv": details.get("pixiv"),
                    "youtube": details.get("youtube"),
                    "website": details.get("website"),
                    "links": extract_creator_links(details),
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
                race_query = (
                    {"$or": [{"creator_id": creator_id}, {"mangadex_id": dex_id}]}
                    if dex_id
                    else {"name": {"$regex": f"^{re.escape(details['name'])}$", "$options": "i"}}
                )
                race_check = await coll.find_one(race_query)
                if not race_check:
                    await coll.insert_one(creator_doc)
                else:
                    creator_doc = race_check
                return serialize_doc(creator_doc)
        except Exception as e:
            logger.error(f"Error fetching creator from MangaDex by name '{name}': {e}")

        creator_id = deterministic_creator_uuid(name, None)
        placeholder_doc = {
            "creator_id": creator_id,
            "slug": slugify_creator_name(name),
            "mangadex_id": None,
            "name": name,
            "biography": {"en": f"No biography found for {name}."},
            "twitter": None,
            "pixiv": None,
            "youtube": None,
            "website": None,
            "links": {},
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        await coll.insert_one(placeholder_doc)
        return serialize_doc(placeholder_doc)

    async def sync_creator_by_dex_id(self, dex_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch from MangaDex by author/artist UUID and save to local creators cache.
        Keyed by mangadex_id / creator_id so homonymous creators with different UUIDs
        never overwrite each other.
        """
        coll = self._get_creators_collection()
        existing = await coll.find_one({"$or": [{"mangadex_id": dex_id}, {"creator_id": dex_id}]})

        try:
            fetch_fn = getattr(mangadex_service, "get_creator_by_id", None) or getattr(
                mangadex_service, "get_author_details", None
            )
            details = await fetch_fn(dex_id) if fetch_fn else None
            if not details:
                return serialize_doc(existing) if existing else None

            resolved_dex_id = details.get("mangadex_id") or dex_id
            creator_id = deterministic_creator_uuid(details["name"], resolved_dex_id)
            slug = slugify_creator_name(details["name"])
            creator_doc = {
                "creator_id": creator_id,
                "slug": slug,
                "mangadex_id": resolved_dex_id,
                "name": details["name"],
                "biography": details.get("biography") or {},
                "twitter": details.get("twitter"),
                "pixiv": details.get("pixiv"),
                "youtube": details.get("youtube"),
                "website": details.get("website"),
                "links": extract_creator_links(details),
                "updated_at": datetime.utcnow(),
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

    async def resolve_or_create_creators_for_manga(
        self,
        author_str: Optional[str] = None,
        artist_str: Optional[str] = None,
        authors_meta: Optional[List[Dict[str, Any]]] = None,
        artists_meta: Optional[List[Dict[str, Any]]] = None,
        existing_creators: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Build canonical creator references for a manga document:
        [{"creator_id": ..., "mangadex_id": ..., "name": ..., "slug": ..., "role": "author"|"artist"}]
        Preserves homonymous creators with distinct creator_ids and ensures local creators collection entries.
        """
        coll = self._get_creators_collection()
        refs: List[Dict[str, Any]] = []
        seen_id_role: set[tuple[str, str]] = set()
        covered_names_by_role: Dict[str, set[str]] = {"author": set(), "artist": set()}

        existing_by_name_role: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
        for ec in existing_creators or []:
            if not isinstance(ec, dict):
                continue
            ec_name = (ec.get("name") or "").strip()
            ec_role = (ec.get("role") or "author").strip().lower()
            if ec_name and ec_role in ("author", "artist"):
                existing_by_name_role.setdefault((ec_name.lower(), ec_role), []).append(ec)

        # 1. Process explicit MangaDex metadata (authors_meta / artists_meta) first
        for role, meta_list in (("author", authors_meta or []), ("artist", artists_meta or [])):
            for meta in meta_list:
                if not isinstance(meta, dict):
                    continue
                dex_id = (meta.get("id") or meta.get("mangadex_id") or meta.get("creator_id") or "").strip()
                name = (meta.get("name") or "").strip()
                if not name:
                    continue
                creator_id = deterministic_creator_uuid(name, dex_id or None)
                slug = slugify_creator_name(name)
                key = (creator_id, role)
                if key in seen_id_role:
                    continue
                seen_id_role.add(key)
                covered_names_by_role[role].add(name.lower())
                refs.append(
                    {
                        "creator_id": creator_id,
                        "mangadex_id": dex_id or None,
                        "name": name,
                        "slug": slug,
                        "role": role,
                    }
                )

        # 2. Process comma/semicolon-separated author_str and artist_str for any names not yet covered
        for role, raw_str in (("author", author_str), ("artist", artist_str)):
            for name in split_creator_names(raw_str):
                name_lower = name.lower()
                if name_lower in covered_names_by_role[role]:
                    continue

                # Check if existing_creators on the manga already had creator_id(s) for this name+role
                prev_matches = existing_by_name_role.get((name_lower, role))
                if prev_matches:
                    for pm in prev_matches:
                        cid = pm.get("creator_id") or deterministic_creator_uuid(name, pm.get("mangadex_id"))
                        key = (cid, role)
                        if key not in seen_id_role:
                            seen_id_role.add(key)
                            refs.append(
                                {
                                    "creator_id": cid,
                                    "mangadex_id": pm.get("mangadex_id"),
                                    "name": pm.get("name") or name,
                                    "slug": pm.get("slug") or slugify_creator_name(name),
                                    "role": role,
                                }
                            )
                    covered_names_by_role[role].add(name_lower)
                    continue

                # Look up in db.creators by case-insensitive name
                db_doc = await coll.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
                if db_doc:
                    dex_id = db_doc.get("mangadex_id")
                    cid = db_doc.get("creator_id") or deterministic_creator_uuid(db_doc.get("name") or name, dex_id)
                    slug = db_doc.get("slug") or slugify_creator_name(db_doc.get("name") or name)
                else:
                    dex_id = None
                    cid = deterministic_creator_uuid(name, None)
                    slug = slugify_creator_name(name)
                    await coll.insert_one(
                        {
                            "creator_id": cid,
                            "slug": slug,
                            "mangadex_id": None,
                            "name": name,
                            "biography": {},
                            "twitter": None,
                            "pixiv": None,
                            "youtube": None,
                            "website": None,
                            "links": {},
                            "created_at": datetime.utcnow(),
                            "updated_at": datetime.utcnow(),
                        }
                    )

                key = (cid, role)
                if key not in seen_id_role:
                    seen_id_role.add(key)
                    covered_names_by_role[role].add(name_lower)
                    refs.append(
                        {
                            "creator_id": cid,
                            "mangadex_id": dex_id,
                            "name": name,
                            "slug": slug,
                            "role": role,
                        }
                    )

        return refs

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
                result = [name for name in result if all(qw in name.lower() for qw in query_words)]

        # Sort alphabetically
        result.sort()
        return result

    def _add_split_names(self, raw_list: List[str], names_set: set):
        for raw_val in raw_list:
            if not raw_val:
                continue
            parts = re.split(r"[,;]", raw_val)
            for p in parts:
                clean = p.strip()
                if clean and clean.lower() not in ["unknown", "n/a", "", "various", "various creators"]:
                    names_set.add(clean)


creator_service = CreatorService()
