import hashlib
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from backend.database.connection import get_db, get_pool_db
from backend.models.datalake_pool import (
    PoolBatchChapterUpdateRequest,
    PoolCandidateItem,
    PoolChapterInDB,
    PoolCoverArtEmbedded,
    PoolCreatorCatalogItem,
    PoolCreatorDetailResponse,
    PoolCreatorEmbedded,
    PoolCreatorListResponse,
    PoolDuplicateGroup,
    PoolDuplicateItem,
    PoolDuplicateTarget,
    PoolIntegrityReport,
    PoolLineageInfo,
    PoolMangaStats,
    PoolMediaPointer,
    PoolPageItem,
    PoolStatsResponse,
    PoolTagEmbedded,
    PublishItemResult,
    PublishToPoolRequest,
    PublishToPoolResponse,
)
from backend.services.creator_service import (
    deterministic_creator_uuid,
    extract_creator_links,
    slugify_creator_name,
    split_creator_names,
)
from backend.services.minio_service import minio_service
from backend.services.reader_contract_service import build_reader_package

logger = logging.getLogger(__name__)


def slugify(text: str) -> str:
    """Create a URL-friendly slug from text."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text or "manga"


def _compute_chapter_manifest_sha256(
    chapter_number: str,
    language: str,
    title: str,
    volume: Optional[str],
    pages: List[Dict[str, Any]],
) -> str:
    """Deterministic SHA-256 hash over chapter metadata and ordered page identities."""
    page_sig = [
        f"{p.get('page_number')}:{p.get('page_uid')}:{p.get('object_key')}:{p.get('file_size', 0)}:{p.get('sha256') or p.get('md5_hash') or ''}"
        for p in pages
        if p.get("included", True) is not False
    ]
    raw = "|".join([str(chapter_number), str(language), str(title or ""), str(volume or ""), *page_sig])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _compute_manga_manifest_sha256(
    pool_manga_id: str,
    chapters: List[Dict[str, Any]],
) -> str:
    """Deterministic SHA-256 hash over pooled manga chapter revisions and manifests."""
    chapter_sigs = sorted(
        f"{c.get('pool_chapter_id')}:{c.get('pages_revision', 1)}:{c.get('manifest_sha256', '')}"
        for c in chapters
        if c.get("included", True) is not False
    )
    raw = "|".join([pool_manga_id, *chapter_sigs])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class DatalakePoolService:
    def _get_source_db(self):
        return get_db()

    def _get_pool_db(self):
        return get_pool_db()

    async def _build_denormalized_creators_for_manga(
        self, manga: Dict[str, Any], source_db: Any
    ) -> List[Dict[str, Any]]:
        """
        Resolve and encapsulate all creators (authors & artists) for a manga into PoolCreatorEmbedded dicts.
        - Splits comma/semicolon-separated author & artist strings.
        - Preserves homonymous creators with distinct creator_ids / mangadex_ids.
        - Pulls biography and social links (twitter, pixiv, youtube, website, links) from source_db.creators.
        - Guarantees every author and artist is included even if not previously stored in source_db.creators.
        """
        raw_refs = [c for c in (manga.get("creators") or []) if isinstance(c, dict) and c.get("name")]

        # Gather all candidate names and IDs to look up in source_db.creators
        candidate_names: set[str] = set()
        candidate_ids: set[str] = set()

        for r in raw_refs:
            r_name = str(r.get("name") or "").strip()
            if r_name:
                candidate_names.add(r_name)
            for id_field in ("creator_id", "mangadex_id"):
                val = r.get(id_field)
                if isinstance(val, str) and val.strip():
                    candidate_ids.add(val.strip())

        for role in ("author", "artist"):
            for name in split_creator_names(manga.get(role)):
                candidate_names.add(name)

        by_creator_id: Dict[str, Dict[str, Any]] = {}
        by_dex_id: Dict[str, Dict[str, Any]] = {}
        by_name_lower: Dict[str, List[Dict[str, Any]]] = {}

        if (candidate_names or candidate_ids) and hasattr(source_db, "creators"):
            or_clauses: List[Dict[str, Any]] = []
            if candidate_names:
                or_clauses.append({"name": {"$in": list(candidate_names)}})
            if candidate_ids:
                or_clauses.append({"creator_id": {"$in": list(candidate_ids)}})
                or_clauses.append({"mangadex_id": {"$in": list(candidate_ids)}})

            find_query = {"$or": or_clauses} if len(or_clauses) > 1 else (or_clauses[0] if or_clauses else {})
            creators_cursor = source_db.creators.find(find_query)
            async for c_doc in creators_cursor:
                if not isinstance(c_doc, dict):
                    continue
                c_name = str(c_doc.get("name") or "").strip()
                c_dex = str(c_doc.get("mangadex_id") or "").strip() or None
                c_id = str(c_doc.get("creator_id") or "").strip() or (
                    deterministic_creator_uuid(c_name, c_dex) if c_name else ""
                )
                if c_id:
                    by_creator_id[c_id] = c_doc
                if c_dex:
                    by_dex_id[c_dex] = c_doc
                if c_name:
                    by_name_lower.setdefault(c_name.lower(), []).append(c_doc)

        refs_by_name_role: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
        refs_by_name_any: Dict[str, List[Dict[str, Any]]] = {}
        for r in raw_refs:
            r_name = str(r.get("name") or "").strip()
            if not r_name:
                continue
            r_name_lower = r_name.lower()
            refs_by_name_any.setdefault(r_name_lower, []).append(r)
            r_role = str(r.get("role") or "").strip().lower()
            if r_role in ("author", "artist"):
                refs_by_name_role.setdefault((r_name_lower, r_role), []).append(r)

        denormalized: List[Dict[str, Any]] = []
        seen_id_role: set[tuple[str, str]] = set()

        def _emit_creator(
            name_str: str,
            role_str: str,
            ref_dict: Optional[Dict[str, Any]] = None,
            source_doc: Optional[Dict[str, Any]] = None,
        ) -> None:
            ref_dict = ref_dict or {}
            source_doc = source_doc or {}
            dex_id = str(ref_dict.get("mangadex_id") or source_doc.get("mangadex_id") or "").strip() or None
            cid = str(
                ref_dict.get("creator_id") or source_doc.get("creator_id") or ""
            ).strip() or deterministic_creator_uuid(name_str, dex_id)
            if (cid, role_str) in seen_id_role:
                return
            seen_id_role.add((cid, role_str))

            c_slug = str(ref_dict.get("slug") or source_doc.get("slug") or "").strip() or slugify_creator_name(name_str)
            src_id = (
                str(source_doc["_id"])
                if "_id" in source_doc and source_doc["_id"] is not None
                else (str(ref_dict.get("source_creator_id") or "").strip() or None)
            )
            bio_raw = source_doc.get("biography") or ref_dict.get("biography") or {}
            bio = {str(k): str(v) for k, v in bio_raw.items() if v} if isinstance(bio_raw, dict) else {}
            merged_links = {**extract_creator_links(ref_dict), **extract_creator_links(source_doc)}

            denormalized.append(
                PoolCreatorEmbedded(
                    creator_id=cid,
                    slug=c_slug,
                    source_creator_id=src_id,
                    name=name_str,
                    role=role_str,
                    mangadex_id=dex_id,
                    biography=bio,
                    links=merged_links,
                ).model_dump()
            )

        for role in ("author", "artist"):
            covered_names: set[str] = set()

            # 1. Process explicit refs on manga["creators"] for this role
            for (r_name_lower, r_role), r_list in refs_by_name_role.items():
                if r_role != role:
                    continue
                for r_item in r_list:
                    r_name = str(r_item["name"]).strip()
                    r_cid = str(r_item.get("creator_id") or "").strip()
                    r_dex = str(r_item.get("mangadex_id") or "").strip()
                    matched_doc = (
                        by_creator_id.get(r_cid) or by_dex_id.get(r_dex) or (by_name_lower.get(r_name_lower, [None])[0])
                    )
                    _emit_creator(r_name, role, ref_dict=r_item, source_doc=matched_doc)
                covered_names.add(r_name_lower)

            # 2. Process comma/semicolon-separated names from manga[role]
            for name in split_creator_names(manga.get(role)):
                name_lower = name.lower()
                if name_lower in covered_names:
                    continue
                covered_names.add(name_lower)

                any_refs = refs_by_name_any.get(name_lower)
                db_docs = by_name_lower.get(name_lower)
                if any_refs:
                    for r_item in any_refs:
                        r_cid = str(r_item.get("creator_id") or "").strip()
                        r_dex = str(r_item.get("mangadex_id") or "").strip()
                        matched_doc = (
                            by_creator_id.get(r_cid) or by_dex_id.get(r_dex) or (db_docs[0] if db_docs else None)
                        )
                        _emit_creator(name, role, ref_dict=r_item, source_doc=matched_doc)
                elif db_docs:
                    for db_doc in db_docs:
                        _emit_creator(str(db_doc.get("name") or name).strip(), role, source_doc=db_doc)
                else:
                    _emit_creator(name, role)

        return denormalized

    async def _sync_pool_creators_catalog(self) -> int:
        """
        Aggregate distinct creators across all pooled mangas in pool_db.pool_mangas
        and synchronize them into pool_db.pool_creators (keyed by creator_id UUID).
        """
        pool_db = self._get_pool_db()
        if not hasattr(pool_db, "pool_creators"):
            return 0

        catalog: Dict[str, Dict[str, Any]] = {}
        now = datetime.now(timezone.utc)

        mangas_cursor = pool_db.pool_mangas.find({})
        async for m in mangas_cursor:
            if not isinstance(m, dict):
                continue
            pm_id = str(m.get("pool_manga_id") or "")
            pm_title = str(m.get("title") or "Untitled")
            pm_slug = str(m.get("slug") or slugify(pm_title))

            m_creators = [c for c in (m.get("creators") or []) if isinstance(c, dict) and c.get("name")]
            if not m_creators:
                # Fallback for legacy pooled mangas without embedded creators array
                for role in ("author", "artist"):
                    for name in split_creator_names(m.get(role)):
                        m_creators.append(
                            {
                                "creator_id": deterministic_creator_uuid(name, None),
                                "slug": slugify_creator_name(name),
                                "name": name,
                                "role": role,
                            }
                        )

            for c in m_creators:
                c_name = str(c.get("name") or "").strip()
                if not c_name:
                    continue
                dex_id = str(c.get("mangadex_id") or "").strip() or None
                cid = str(c.get("creator_id") or "").strip() or deterministic_creator_uuid(c_name, dex_id)
                c_slug = str(c.get("slug") or "").strip() or slugify_creator_name(c_name)
                role = "artist" if str(c.get("role") or "").strip().lower() == "artist" else "author"

                entry = catalog.get(cid)
                if not entry:
                    entry = {
                        "creator_id": cid,
                        "slug": c_slug,
                        "name": c_name,
                        "mangadex_id": dex_id,
                        "source_creator_id": c.get("source_creator_id"),
                        "roles": [],
                        "biography": {},
                        "links": {},
                        "pool_manga_ids": [],
                        "sample_mangas": [],
                        "manga_count": 0,
                        "updated_at": now,
                    }
                    catalog[cid] = entry

                if dex_id and not entry.get("mangadex_id"):
                    entry["mangadex_id"] = dex_id
                if c.get("source_creator_id") and not entry.get("source_creator_id"):
                    entry["source_creator_id"] = c.get("source_creator_id")
                if role not in entry["roles"]:
                    entry["roles"].append(role)
                    entry["roles"].sort()

                bio = c.get("biography")
                if isinstance(bio, dict):
                    for k, v in bio.items():
                        if v and k not in entry["biography"]:
                            entry["biography"][str(k)] = str(v)

                c_links = extract_creator_links(c)
                for k, v in c_links.items():
                    if v and k not in entry["links"]:
                        entry["links"][k] = v

                if pm_id and pm_id not in entry["pool_manga_ids"]:
                    entry["pool_manga_ids"].append(pm_id)
                    entry["manga_count"] = len(entry["pool_manga_ids"])
                    if len(entry["sample_mangas"]) < 6:
                        entry["sample_mangas"].append(
                            {
                                "pool_manga_id": pm_id,
                                "title": pm_title,
                                "slug": pm_slug,
                            }
                        )

        try:
            await pool_db.pool_creators.delete_many({"creator_id": {"$nin": list(catalog.keys())}})
            for cid, c_doc in catalog.items():
                await pool_db.pool_creators.update_one(
                    {"creator_id": cid},
                    {"$set": c_doc},
                    upsert=True,
                )
        except Exception as e:
            logger.warning(f"Could not sync pool_creators collection: {e}")

        return len(catalog)

    async def list_pool_creators(
        self,
        search: Optional[str] = None,
        role: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> PoolCreatorListResponse:
        """
        Return the distinct creators catalog across all pooled mangas in the Data Lake Pool.
        """
        pool_db = self._get_pool_db()
        await self._sync_pool_creators_catalog()

        items_raw: List[Dict[str, Any]] = []
        if hasattr(pool_db, "pool_creators"):
            cursor = pool_db.pool_creators.find({})
            if hasattr(cursor, "to_list"):
                items_raw = await cursor.to_list(length=5000)
            else:
                async for doc in cursor:
                    items_raw.append(doc)

        filtered: List[PoolCreatorCatalogItem] = []
        search_q = search.strip().lower() if search and search.strip() else None
        role_q = role.strip().lower() if role and role.strip() else None

        for doc in items_raw:
            if not isinstance(doc, dict) or not doc.get("creator_id"):
                continue
            if role_q and role_q not in (doc.get("roles") or []):
                continue
            if search_q:
                haystack = f"{doc.get('name', '')} {doc.get('slug', '')} {doc.get('creator_id', '')}".lower()
                if search_q not in haystack:
                    continue
            filtered.append(PoolCreatorCatalogItem.model_validate(doc))

        filtered.sort(key=lambda x: (-x.manga_count, x.name.lower(), x.creator_id))
        total = len(filtered)
        skip = max(0, (page - 1) * page_size)
        paged = filtered[skip : skip + page_size]

        return PoolCreatorListResponse(
            items=paged,
            total=total,
            page=page,
            page_size=page_size,
        )

    async def get_pool_creator_detail(self, creator_id: str) -> Optional[PoolCreatorDetailResponse]:
        """
        Get full profile of a distinct pooled creator by creator_id (or mangadex_id) along with their pooled mangas.
        """
        await self._sync_pool_creators_catalog()
        pool_db = self._get_pool_db()

        creator_doc = None
        if hasattr(pool_db, "pool_creators"):
            creator_doc = await pool_db.pool_creators.find_one(
                {"$or": [{"creator_id": creator_id}, {"mangadex_id": creator_id}, {"slug": creator_id.lower()}]}
            )
        if not creator_doc:
            return None

        catalog_item = PoolCreatorCatalogItem.model_validate(creator_doc)
        mangas_list: List[Dict[str, Any]] = []
        if catalog_item.pool_manga_ids:
            cursor = pool_db.pool_mangas.find({"pool_manga_id": {"$in": catalog_item.pool_manga_ids}})
            raw_mangas = await cursor.to_list(length=500) if hasattr(cursor, "to_list") else [d async for d in cursor]
            for m in raw_mangas:
                if "_id" in m:
                    m["_id"] = str(m["_id"])
                pc = m.get("primary_cover")
                if pc and pc.get("object_key"):
                    pc["url"] = minio_service.get_presigned_url(pc["object_key"])
                mangas_list.append(m)

        return PoolCreatorDetailResponse(
            creator=catalog_item,
            mangas=mangas_list,
        )

    async def list_eligible_candidates(
        self,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
        has_pages_only: bool = False,
        not_in_pool_only: bool = False,
    ) -> Dict[str, Any]:
        """
        List candidate mangas from review database with eligibility details.
        Only mangas with at least 1 stored chapter with pages are eligible.
        """
        source_db = self._get_source_db()
        pool_db = self._get_pool_db()

        query: Dict[str, Any] = {}
        if search:
            query["title"] = {"$regex": re.escape(search), "$options": "i"}

        skip = (page - 1) * page_size
        cursor = source_db.mangas.find(query).sort("added_at", -1)
        raw_mangas = await cursor.to_list(length=200 if (has_pages_only or not_in_pool_only) else skip + page_size)

        candidates: List[PoolCandidateItem] = []
        for m in raw_mangas:
            m_id = str(m["_id"])

            # Check chapters in source
            chapters_cursor = source_db.chapters.find({"manga_id": m_id})
            chapters = await chapters_cursor.to_list(length=1000)

            stored_chapters = [
                c
                for c in chapters
                if (c.get("page_count", 0) > 0 or (isinstance(c.get("pages"), list) and len(c.get("pages", [])) > 0))
            ]
            total_pages = sum(
                c.get("page_count", 0) or (len(c.get("pages", [])) if isinstance(c.get("pages"), list) else 0)
                for c in stored_chapters
            )
            languages = sorted(list({c.get("language", "en") for c in stored_chapters if c.get("language")}))

            is_eligible = len(stored_chapters) > 0
            reason = None if is_eligible else "Chưa có dữ liệu trang truyện"

            if has_pages_only and not is_eligible:
                continue

            # Check if already in pool
            existing_pool = await pool_db.pool_mangas.find_one({"source_manga_id": m_id})
            already_in_pool = existing_pool is not None
            pool_manga_id = existing_pool.get("pool_manga_id") if existing_pool else None

            if not_in_pool_only and already_in_pool:
                continue

            needs_sync = False
            if already_in_pool and existing_pool:
                source_rev = m.get("metadata_revision", 1)
                pool_source_rev = existing_pool.get("lineage", {}).get("source_metadata_revision", 1)
                pool_ch_count = existing_pool.get("stats", {}).get("total_chapters", 0)
                if source_rev > pool_source_rev or len(stored_chapters) != pool_ch_count:
                    needs_sync = True

            cover_url = None
            if m.get("minio_cover_key"):
                cover_url = minio_service.get_presigned_url(m["minio_cover_key"])

            candidates.append(
                PoolCandidateItem(
                    source_manga_id=m_id,
                    title=m.get("title", ""),
                    cover_url=cover_url,
                    author=m.get("author"),
                    status=m.get("status"),
                    ready_chapters_count=len(stored_chapters),
                    total_pages_count=total_pages,
                    available_languages=languages,
                    is_eligible=is_eligible,
                    eligibility_reason=reason,
                    already_in_pool=already_in_pool,
                    pool_manga_id=pool_manga_id,
                    needs_sync=needs_sync,
                )
            )

        total = len(candidates)
        paged_candidates = candidates[skip : skip + page_size]

        return {
            "items": [c.model_dump() for c in paged_candidates],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def publish_mangas_to_pool(self, request: PublishToPoolRequest) -> PublishToPoolResponse:
        """
        Encapsulate and publish selected mangas into the isolated pool database.
        Zero-Copy: only creates references to MinIO object keys, never duplicates media files.
        """
        source_db = self._get_source_db()
        pool_db = self._get_pool_db()

        results: List[PublishItemResult] = []
        success_count = 0
        error_count = 0

        for s_id in request.source_manga_ids:
            try:
                m_filter = {"_id": ObjectId(s_id)} if ObjectId.is_valid(s_id) else {"_id": s_id}
                manga = await source_db.mangas.find_one(m_filter)
                if not manga:
                    results.append(
                        PublishItemResult(
                            source_manga_id=s_id,
                            success=False,
                            title=s_id,
                            error="Không tìm thấy manga trong hệ thống nguồn.",
                        )
                    )
                    error_count += 1
                    continue

                title = manga.get("title", "Untitled")

                # Fetch stored chapters
                ch_query: Dict[str, Any] = {"manga_id": s_id}
                if request.languages:
                    ch_query["language"] = {"$in": request.languages}
                raw_chapters = await source_db.chapters.find(ch_query).to_list(length=1000)

                # Filter valid stored chapters
                stored_chapters = [
                    c
                    for c in raw_chapters
                    if (
                        c.get("page_count", 0) > 0 or (isinstance(c.get("pages"), list) and len(c.get("pages", [])) > 0)
                    )
                ]

                if not stored_chapters:
                    results.append(
                        PublishItemResult(
                            source_manga_id=s_id,
                            success=False,
                            title=title,
                            error="Manga chưa có dữ liệu trang truyện hợp lệ để đưa vào Pool.",
                        )
                    )
                    error_count += 1
                    continue

                # Denormalize tags
                tag_ids = manga.get("tag_ids", [])
                denormalized_tags: List[Dict[str, Any]] = []
                if tag_ids:
                    obj_ids = [ObjectId(t) for t in tag_ids if ObjectId.is_valid(t)]
                    tag_query = (
                        {"$or": [{"_id": {"$in": obj_ids}}, {"_id": {"$in": tag_ids}}]}
                        if obj_ids
                        else {"_id": {"$in": tag_ids}}
                    )
                    tags_cursor = source_db.tags.find(tag_query)
                    async for t_doc in tags_cursor:
                        raw_name = t_doc.get("name")
                        name_dict = raw_name if isinstance(raw_name, dict) else {"en": str(raw_name)}
                        denormalized_tags.append(
                            PoolTagEmbedded(
                                source_tag_id=str(t_doc["_id"]),
                                mangadex_id=t_doc.get("mangadex_id"),
                                name=name_dict,
                                group=t_doc.get("group", "genre"),
                                color=t_doc.get("color"),
                            ).model_dump()
                        )

                # Denormalize creators (splits multi-creators, preserves homonyms via creator_id UUID, includes social links)
                denormalized_creators = await self._build_denormalized_creators_for_manga(manga, source_db)

                # Denormalize cover arts
                cover_arts_cursor = source_db.cover_arts.find({"manga_id": s_id})
                denormalized_covers: List[Dict[str, Any]] = []
                async for cv_doc in cover_arts_cursor:
                    if cv_doc.get("minio_key"):
                        denormalized_covers.append(
                            PoolCoverArtEmbedded(
                                cover_id=str(cv_doc["_id"]),
                                volume=cv_doc.get("volume"),
                                locale=cv_doc.get("locale"),
                                description=cv_doc.get("description"),
                                minio_bucket="manga-library",
                                object_key=cv_doc["minio_key"],
                            ).model_dump()
                        )

                # Primary cover
                primary_cover = None
                if manga.get("minio_cover_key"):
                    primary_cover = PoolMediaPointer(
                        minio_bucket="manga-library",
                        object_key=manga["minio_cover_key"],
                    ).model_dump()

                # Determine pool_manga_id and revision
                existing_manga = await pool_db.pool_mangas.find_one({"source_manga_id": s_id})
                existing_pool_chapters: List[Dict[str, Any]] = []
                prev_ch_by_source_id: Dict[str, Dict[str, Any]] = {}
                prev_ch_by_num_lang: Dict[tuple[str, str], Dict[str, Any]] = {}
                if existing_manga:
                    pool_manga_id = existing_manga["pool_manga_id"]
                    pool_revision = existing_manga.get("lineage", {}).get("pool_revision", 1) + 1
                    slug = existing_manga.get("slug") or slugify(title)
                    prev_cursor = pool_db.pool_chapters.find({"pool_manga_id": pool_manga_id})
                    if hasattr(prev_cursor, "to_list"):
                        existing_pool_chapters = await prev_cursor.to_list(length=5000)
                    else:
                        existing_pool_chapters = [doc async for doc in prev_cursor]
                    for prev_ch in existing_pool_chapters:
                        if not isinstance(prev_ch, dict):
                            continue
                        src_cid = str(prev_ch.get("source_chapter_id") or "")
                        if src_cid:
                            prev_ch_by_source_id[src_cid] = prev_ch
                        num_lang = (str(prev_ch.get("chapter_number") or ""), str(prev_ch.get("language") or "en"))
                        prev_ch_by_num_lang.setdefault(num_lang, prev_ch)
                else:
                    pool_manga_id = f"pm_{uuid.uuid4().hex[:12]}"
                    pool_revision = 1
                    slug = slugify(title)

                now = datetime.now(timezone.utc)

                # Process chapters & pages (Zero-Copy)
                pool_chapters_to_insert: List[Dict[str, Any]] = []
                total_pages_count = 0
                total_size_bytes = 0
                languages_set = set()

                for ch in stored_chapters:
                    raw_pages = ch.get("pages", [])
                    mapped_pages: List[Dict[str, Any]] = []
                    seen_hashes = set()
                    ch_size = 0

                    for p in raw_pages:
                        if not isinstance(p, dict):
                            continue
                        obj_key = p.get("object_key")
                        if not obj_key:
                            continue

                        md5_hash = p.get("md5_hash")
                        if request.auto_deduplicate_pages and md5_hash:
                            if md5_hash in seen_hashes:
                                continue
                            seen_hashes.add(md5_hash)

                        f_size = p.get("file_size", 0)
                        ch_size += f_size
                        mapped_pages.append(
                            PoolPageItem(
                                page_uid=p.get("page_uid") or str(uuid.uuid4()),
                                page_number=len(mapped_pages) + 1,
                                filename=p.get("filename", f"{len(mapped_pages) + 1:03d}.jpg"),
                                minio_bucket="manga-library",
                                object_key=obj_key,
                                file_size=f_size,
                                width=p.get("width"),
                                height=p.get("height"),
                                md5_hash=md5_hash,
                                sha256=p.get("sha256"),
                                content_type=p.get("content_type"),
                            ).model_dump()
                        )

                    if not mapped_pages:
                        continue

                    ch_id_str = str(ch["_id"])
                    ch_num_str = str(ch.get("chapter_number", "1"))
                    ch_lang = ch.get("language", "en")
                    ch_title = ch.get("title", "")
                    ch_vol = ch.get("volume")
                    languages_set.add(ch_lang)
                    total_pages_count += len(mapped_pages)
                    total_size_bytes += ch_size

                    # Deterministic content hash & stable pool_chapter_id preservation across re-syncs
                    ch_sha256 = _compute_chapter_manifest_sha256(ch_num_str, ch_lang, ch_title, ch_vol, mapped_pages)
                    prev_ch = prev_ch_by_source_id.get(ch_id_str) or prev_ch_by_num_lang.get((ch_num_str, ch_lang))
                    if prev_ch and prev_ch.get("pool_chapter_id"):
                        stable_chapter_id = str(prev_ch["pool_chapter_id"])
                        prev_rev = max(1, int(prev_ch.get("pages_revision") or 1))
                        prev_hash = str(prev_ch.get("manifest_sha256") or "")
                        pages_rev = prev_rev if prev_hash == ch_sha256 else prev_rev + 1
                        ch_created_at = prev_ch.get("created_at") or now
                    else:
                        stable_chapter_id = f"pch_{uuid.uuid4().hex[:12]}"
                        pages_rev = 1
                        ch_created_at = now

                    pool_chapter = PoolChapterInDB(
                        pool_chapter_id=stable_chapter_id,
                        pool_manga_id=pool_manga_id,
                        source_manga_id=s_id,
                        source_chapter_id=ch_id_str,
                        chapter_number=ch_num_str,
                        chapter_numeric=float(ch.get("chapter_numeric", 0.0)),
                        volume=ch_vol,
                        title=ch_title,
                        language=ch_lang,
                        scanlation_group=ch.get("scanlation_group"),
                        uploader=ch.get("uploader"),
                        publish_at=ch.get("publish_at"),
                        source=ch.get("source", "mangadex"),
                        source_id=ch.get("source_id"),
                        pages=mapped_pages,
                        page_count=len(mapped_pages),
                        total_size_bytes=ch_size,
                        pages_revision=pages_rev,
                        manifest_sha256=ch_sha256,
                        included=True,
                        created_at=ch_created_at,
                        updated_at=now,
                    ).model_dump(by_alias=True, exclude={"id"})

                    pool_chapters_to_insert.append(pool_chapter)

                if not pool_chapters_to_insert:
                    results.append(
                        PublishItemResult(
                            source_manga_id=s_id,
                            success=False,
                            title=title,
                            error="Không tìm thấy trang truyện có khóa object_key hợp lệ.",
                        )
                    )
                    error_count += 1
                    continue

                # Compute deterministic manifest sha256 for manga package
                manifest_sha256 = _compute_manga_manifest_sha256(pool_manga_id, pool_chapters_to_insert)

                stats = PoolMangaStats(
                    total_chapters=len(pool_chapters_to_insert),
                    total_pages=total_pages_count,
                    total_size_bytes=total_size_bytes,
                    available_languages=sorted(list(languages_set)),
                ).model_dump()

                lineage = PoolLineageInfo(
                    source_metadata_revision=manga.get("metadata_revision", 1),
                    pool_revision=pool_revision,
                    manifest_sha256=manifest_sha256,
                    published_at=existing_manga.get("lineage", {}).get("published_at", now) if existing_manga else now,
                    last_synced_from_source_at=now,
                    updated_at=now,
                    has_upstream_changes=False,
                ).model_dump()

                pool_manga_doc = {
                    "pool_manga_id": pool_manga_id,
                    "source_manga_id": s_id,
                    "mangadex_id": manga.get("mangadex_id"),
                    "slug": slug,
                    "title": title,
                    "alt_titles": manga.get("alt_titles", []),
                    "description": manga.get("description", ""),
                    "author": manga.get("author"),
                    "artist": manga.get("artist"),
                    "creators": denormalized_creators,
                    "year": manga.get("year"),
                    "status": manga.get("status"),
                    "content_rating": manga.get("content_rating", "safe"),
                    "publication_demographic": manga.get("publication_demographic"),
                    "original_language": manga.get("original_language"),
                    "published_start_date": manga.get("published_start_date"),
                    "published_end_date": manga.get("published_end_date"),
                    "volumes": manga.get("volumes"),
                    "chapters": manga.get("chapters"),
                    "tags": denormalized_tags,
                    "links": [link if isinstance(link, dict) else link.model_dump() for link in manga.get("links", [])],
                    "tracker_metadata": manga.get("tracker_metadata"),
                    "primary_cover": primary_cover,
                    "cover_arts": denormalized_covers,
                    "pool_state": "published",
                    "is_etl_ready": request.mark_etl_ready,
                    "stats": stats,
                    "lineage": lineage,
                }

                # Save manga to pool DB
                await pool_db.pool_mangas.update_one(
                    {"source_manga_id": s_id},
                    {"$set": pool_manga_doc},
                    upsert=True,
                )

                # Replace pool chapters
                await pool_db.pool_chapters.delete_many({"pool_manga_id": pool_manga_id})
                if pool_chapters_to_insert:
                    await pool_db.pool_chapters.insert_many(pool_chapters_to_insert)

                # Record audit log
                await pool_db.pool_audit_logs.insert_one(
                    {
                        "pool_manga_id": pool_manga_id,
                        "source_manga_id": s_id,
                        "action": "publish_to_pool",
                        "chapters_count": len(pool_chapters_to_insert),
                        "pages_count": total_pages_count,
                        "timestamp": now,
                    }
                )

                # Emit CDC events for downstream Reader subscribers (failure-isolated)
                try:
                    from backend.services.connector_service import connector_service

                    await connector_service.emit_pool_sync_events(
                        pool_manga_doc=pool_manga_doc,
                        new_chapters=pool_chapters_to_insert,
                        previous_chapters=existing_pool_chapters,
                        is_new_manga=existing_manga is None,
                    )
                except Exception as cdc_exc:
                    logger.debug(f"Skipping CDC sync event emission: {cdc_exc}")

                results.append(
                    PublishItemResult(
                        source_manga_id=s_id,
                        pool_manga_id=pool_manga_id,
                        success=True,
                        title=title,
                        chapters_count=len(pool_chapters_to_insert),
                        pages_count=total_pages_count,
                    )
                )
                success_count += 1
            except Exception as e:
                logger.error(f"Error publishing manga {s_id} to pool: {e}", exc_info=True)
                results.append(
                    PublishItemResult(
                        source_manga_id=s_id,
                        success=False,
                        title=s_id,
                        error=str(e),
                    )
                )
                error_count += 1

        if success_count > 0:
            await self._sync_pool_creators_catalog()

        return PublishToPoolResponse(
            success_count=success_count,
            error_count=error_count,
            results=results,
        )

    async def list_pool_mangas(
        self,
        search: Optional[str] = None,
        pool_state: Optional[str] = None,
        is_etl_ready: Optional[bool] = None,
        language: Optional[str] = None,
        creator_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "lineage.updated_at",
        sort_order: int = -1,
    ) -> Dict[str, Any]:
        """Query mangas in the pool with search, filters, pagination, and dynamic presigned cover URLs."""
        pool_db = self._get_pool_db()
        query: Dict[str, Any] = {}

        if search:
            query["title"] = {"$regex": re.escape(search), "$options": "i"}
        if pool_state:
            query["pool_state"] = pool_state
        if is_etl_ready is not None:
            query["is_etl_ready"] = is_etl_ready
        if language:
            query["stats.available_languages"] = language
        if creator_id:
            query["creators.creator_id"] = creator_id

        total = await pool_db.pool_mangas.count_documents(query)
        skip = (page - 1) * page_size

        cursor = pool_db.pool_mangas.find(query).sort(sort_by, sort_order).skip(skip).limit(page_size)
        raw_items = await cursor.to_list(length=page_size)

        items = []
        for doc in raw_items:
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
            pc = doc.get("primary_cover")
            if pc and pc.get("object_key"):
                pc["url"] = minio_service.get_presigned_url(pc["object_key"])
            items.append(doc)

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def get_pool_manga_detail(self, pool_manga_id: str) -> Optional[Dict[str, Any]]:
        """Fetch detailed pooled manga document with dynamically signed cover URLs and upstream change detection."""
        pool_db = self._get_pool_db()
        source_db = self._get_source_db()

        doc = await pool_db.pool_mangas.find_one({"pool_manga_id": pool_manga_id})
        if not doc:
            return None

        if "_id" in doc:
            doc["_id"] = str(doc["_id"])

        pc = doc.get("primary_cover")
        if pc and pc.get("object_key"):
            pc["url"] = minio_service.get_presigned_url(pc["object_key"])

        covers = doc.get("cover_arts", [])
        for cv in covers:
            if cv.get("object_key"):
                cv["url"] = minio_service.get_presigned_url(cv["object_key"])

        # Detect upstream changes
        s_id = doc.get("source_manga_id")
        if s_id:
            try:
                m_filter = {"_id": ObjectId(s_id)} if ObjectId.is_valid(s_id) else {"_id": s_id}
                res = source_db.mangas.find_one(m_filter)
                source_manga = await res if hasattr(res, "__await__") else res
                if source_manga:
                    curr_rev = source_manga.get("metadata_revision", 1)
                    pool_source_rev = doc.get("lineage", {}).get("source_metadata_revision", 1)
                    if curr_rev > pool_source_rev:
                        doc["lineage"]["has_upstream_changes"] = True
            except Exception as e:
                logger.warning(f"Failed to check upstream changes for {s_id}: {e}")

        return doc

    async def update_pool_manga(self, pool_manga_id: str, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update metadata on the isolated pool database without mutating review DB."""
        pool_db = self._get_pool_db()
        source_db = self._get_source_db()

        existing = await pool_db.pool_mangas.find_one({"pool_manga_id": pool_manga_id})
        if not existing:
            return None

        clean_update: Dict[str, Any] = {}
        for k, v in update_data.items():
            if v is not None and k not in ("_id", "pool_manga_id", "source_manga_id", "stats", "lineage"):
                clean_update[k] = v

        if "primary_cover_key" in clean_update:
            clean_update["primary_cover"] = {
                "minio_bucket": "manga-library",
                "object_key": clean_update.pop("primary_cover_key"),
            }

        # Re-synchronize embedded creators if author or artist was modified
        if "author" in clean_update or "artist" in clean_update:
            merged_doc = dict(existing)
            merged_doc.update(clean_update)
            clean_update["creators"] = await self._build_denormalized_creators_for_manga(merged_doc, source_db)

        now = datetime.now(timezone.utc)
        clean_update["lineage.updated_at"] = now
        clean_update["lineage.pool_revision"] = existing.get("lineage", {}).get("pool_revision", 1) + 1

        await pool_db.pool_mangas.update_one(
            {"pool_manga_id": pool_manga_id},
            {"$set": clean_update},
        )

        if "creators" in clean_update:
            await self._sync_pool_creators_catalog()

        await pool_db.pool_audit_logs.insert_one(
            {
                "pool_manga_id": pool_manga_id,
                "action": "update_metadata",
                "fields": list(clean_update.keys()),
                "timestamp": now,
            }
        )

        try:
            from backend.services.connector_service import connector_service

            await connector_service.emit_manga_metadata_updated(pool_manga_id)
        except Exception as cdc_exc:
            logger.debug(f"Skipping CDC metadata event: {cdc_exc}")

        return await self.get_pool_manga_detail(pool_manga_id)

    async def remove_manga_from_pool(self, pool_manga_id: str) -> bool:
        """
        Remove manga and chapters strictly from pool database.
        NEVER deletes MinIO files and NEVER alters source review DB.
        """
        pool_db = self._get_pool_db()
        existing = await pool_db.pool_mangas.find_one({"pool_manga_id": pool_manga_id})
        pool_rev = int((existing or {}).get("lineage", {}).get("pool_revision", 1))
        res = await pool_db.pool_mangas.delete_one({"pool_manga_id": pool_manga_id})
        await pool_db.pool_chapters.delete_many({"pool_manga_id": pool_manga_id})

        await self._sync_pool_creators_catalog()

        await pool_db.pool_audit_logs.insert_one(
            {
                "pool_manga_id": pool_manga_id,
                "action": "remove_from_pool",
                "timestamp": datetime.now(timezone.utc),
            }
        )
        if res.deleted_count > 0:
            try:
                from backend.services.connector_service import connector_service

                await connector_service.emit_manga_removed(pool_manga_id, pool_revision=pool_rev + 1)
            except Exception as cdc_exc:
                logger.debug(f"Skipping CDC remove event: {cdc_exc}")
        return res.deleted_count > 0

    async def get_pool_manga_chapters(self, pool_manga_id: str, language: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch chapters for a pooled manga sorted naturally by chapter_numeric."""
        pool_db = self._get_pool_db()
        query: Dict[str, Any] = {"pool_manga_id": pool_manga_id}
        if language:
            query["language"] = language

        cursor = pool_db.pool_chapters.find(query).sort([("chapter_numeric", 1), ("language", 1)])
        raw_chapters = await cursor.to_list(length=1000)

        results = []
        for ch in raw_chapters:
            if "_id" in ch:
                ch["_id"] = str(ch["_id"])
            results.append(ch)
        return results

    async def get_pool_chapter_detail(
        self, pool_chapter_id: str, include_presigned_urls: bool = True
    ) -> Optional[Dict[str, Any]]:
        """Fetch a single chapter with pages and optional dynamic presigned preview URLs."""
        pool_db = self._get_pool_db()
        ch = await pool_db.pool_chapters.find_one({"pool_chapter_id": pool_chapter_id})
        if not ch:
            return None

        if "_id" in ch:
            ch["_id"] = str(ch["_id"])
        if include_presigned_urls:
            for page in ch.get("pages", []):
                if page.get("object_key"):
                    page["url"] = minio_service.get_presigned_url(page["object_key"])

        return ch

    async def update_pool_chapter_metadata(
        self, pool_chapter_id: str, update_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update chapter attributes (volume, number, title, group, included) in pool DB."""
        pool_db = self._get_pool_db()
        clean_update = {
            k: v
            for k, v in update_data.items()
            if v is not None and k not in ("_id", "pool_chapter_id", "pool_manga_id", "pages")
        }
        clean_update["updated_at"] = datetime.now(timezone.utc)

        await pool_db.pool_chapters.update_one(
            {"pool_chapter_id": pool_chapter_id},
            {"$set": clean_update},
        )
        updated = await self.get_pool_chapter_detail(pool_chapter_id, include_presigned_urls=False)
        if updated and updated.get("pool_manga_id"):
            await self._recalculate_pool_manga_stats(str(updated["pool_manga_id"]))
            try:
                from backend.services.connector_service import connector_service

                await connector_service.emit_chapter_updated(str(updated["pool_manga_id"]), pool_chapter_id)
            except Exception as cdc_exc:
                logger.debug(f"Skipping CDC chapter update event: {cdc_exc}")
        return updated

    async def batch_update_pool_chapters(self, request: PoolBatchChapterUpdateRequest) -> int:
        """Batch update chapters in pool DB."""
        pool_db = self._get_pool_db()
        updated_count = 0

        for idx, ch_id in enumerate(request.pool_chapter_ids):
            fields: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
            if request.volume is not None:
                fields["volume"] = request.volume
            if request.scanlation_group is not None:
                fields["scanlation_group"] = request.scanlation_group
            if request.language is not None:
                fields["language"] = request.language
            if request.renumber_start is not None:
                step = request.renumber_step if request.renumber_step is not None else 1.0
                new_num = request.renumber_start + (idx * step)
                fields["chapter_numeric"] = new_num
                fields["chapter_number"] = f"{new_num:g}"

            res = await pool_db.pool_chapters.update_one({"pool_chapter_id": ch_id}, {"$set": fields})
            if res.modified_count > 0:
                updated_count += 1

        return updated_count

    async def delete_pool_chapter(self, pool_chapter_id: str) -> bool:
        """Delete a chapter from the pool database. Never touches MinIO."""
        pool_db = self._get_pool_db()
        ch = await pool_db.pool_chapters.find_one({"pool_chapter_id": pool_chapter_id})
        if not ch:
            return False

        pool_manga_id = ch["pool_manga_id"]
        res = await pool_db.pool_chapters.delete_one({"pool_chapter_id": pool_chapter_id})
        if res.deleted_count > 0:
            await self._recalculate_pool_manga_stats(pool_manga_id)
            try:
                from backend.services.connector_service import connector_service

                await connector_service.emit_chapter_deleted(pool_manga_id, pool_chapter_id)
            except Exception as cdc_exc:
                logger.debug(f"Skipping CDC chapter delete event: {cdc_exc}")
            return True
        return False

    async def delete_pool_chapter_pages(
        self, pool_chapter_id: str, page_numbers: List[int]
    ) -> Optional[Dict[str, Any]]:
        """
        Delete specified page items from a chapter in the pool DB.
        Renumbers remaining pages 1..N and updates chapter stats.
        NEVER calls minio_service.delete_chapter_page.
        """
        pool_db = self._get_pool_db()
        ch = await pool_db.pool_chapters.find_one({"pool_chapter_id": pool_chapter_id})
        if not ch:
            return None

        pages_to_remove = set(page_numbers)
        remaining_pages = [p for p in ch.get("pages", []) if p.get("page_number") not in pages_to_remove]

        total_size = 0
        for i, p in enumerate(remaining_pages):
            p["page_number"] = i + 1
            total_size += p.get("file_size", 0)

        now = datetime.now(timezone.utc)
        new_ch_hash = _compute_chapter_manifest_sha256(
            str(ch.get("chapter_number") or ""),
            str(ch.get("language") or "en"),
            str(ch.get("title") or ""),
            ch.get("volume"),
            remaining_pages,
        )
        await pool_db.pool_chapters.update_one(
            {"pool_chapter_id": pool_chapter_id},
            {
                "$set": {
                    "pages": remaining_pages,
                    "page_count": len(remaining_pages),
                    "total_size_bytes": total_size,
                    "pages_revision": ch.get("pages_revision", 1) + 1,
                    "manifest_sha256": new_ch_hash,
                    "updated_at": now,
                }
            },
        )

        await self._recalculate_pool_manga_stats(ch["pool_manga_id"])
        try:
            from backend.services.connector_service import connector_service

            await connector_service.emit_chapter_updated(str(ch["pool_manga_id"]), pool_chapter_id)
        except Exception as cdc_exc:
            logger.debug(f"Skipping CDC chapter page edit event: {cdc_exc}")
        return await self.get_pool_chapter_detail(pool_chapter_id, include_presigned_urls=False)

    async def scan_pool_duplicates(
        self, pool_manga_id: str, pool_chapter_id: Optional[str] = None
    ) -> List[PoolDuplicateGroup]:
        """Scan for duplicate pages across chapters of a pooled manga by MD5/SHA256."""
        pool_db = self._get_pool_db()
        query: Dict[str, Any] = {"pool_manga_id": pool_manga_id}
        if pool_chapter_id:
            query["pool_chapter_id"] = pool_chapter_id

        cursor = pool_db.pool_chapters.find(query)
        chapters = await cursor.to_list(length=1000)

        hash_map: Dict[str, List[PoolDuplicateItem]] = {}
        size_map: Dict[str, int] = {}

        for ch in chapters:
            ch_id = ch["pool_chapter_id"]
            ch_num = ch.get("chapter_number", "")
            ch_title = ch.get("title")

            for p in ch.get("pages", []):
                md5 = p.get("md5_hash")
                if not md5:
                    continue

                f_size = p.get("file_size", 0)
                size_map[md5] = f_size
                url = minio_service.get_presigned_url(p["object_key"]) if p.get("object_key") else None

                item = PoolDuplicateItem(
                    pool_chapter_id=ch_id,
                    chapter_number=ch_num,
                    chapter_title=ch_title,
                    page_number=p.get("page_number", 0),
                    page_uid=p.get("page_uid", ""),
                    filename=p.get("filename", ""),
                    object_key=p.get("object_key", ""),
                    file_size=f_size,
                    url=url,
                )
                hash_map.setdefault(md5, []).append(item)

        groups: List[PoolDuplicateGroup] = []
        for h_val, items in hash_map.items():
            if len(items) > 1:
                groups.append(
                    PoolDuplicateGroup(
                        hash_type="md5",
                        hash_value=h_val,
                        file_size=size_map.get(h_val, 0),
                        items=items,
                    )
                )

        return groups

    async def cleanup_pool_duplicates(self, pool_manga_id: str, targets: List[PoolDuplicateTarget]) -> Dict[str, Any]:
        """
        Remove target duplicate pages from chapters in pool DB.
        Renumbers remaining pages and recalculates stats.
        Never calls MinIO delete.
        """
        targets_by_ch: Dict[str, List[int]] = {}
        for t in targets:
            targets_by_ch.setdefault(t.pool_chapter_id, []).append(t.page_number)

        modified_chapters = 0
        removed_pages_count = 0

        for ch_id, page_nums in targets_by_ch.items():
            res = await self.delete_pool_chapter_pages(ch_id, page_nums)
            if res:
                modified_chapters += 1
                removed_pages_count += len(page_nums)

        await self._recalculate_pool_manga_stats(pool_manga_id)
        return {
            "success": True,
            "modified_chapters": modified_chapters,
            "removed_pages_count": removed_pages_count,
        }

    async def verify_pool_manga_integrity(self, pool_manga_id: str) -> PoolIntegrityReport:
        """Verify physical existence of all MinIO objects mapped in the pool manga."""
        pool_db = self._get_pool_db()
        manga = await pool_db.pool_mangas.find_one({"pool_manga_id": pool_manga_id})
        if not manga:
            return PoolIntegrityReport(
                pool_manga_id=pool_manga_id,
                is_healthy=False,
                total_checked=0,
                missing_keys=["Manga not found in pool"],
            )

        keys_to_check: List[str] = []
        if manga.get("primary_cover", {}).get("object_key"):
            keys_to_check.append(manga["primary_cover"]["object_key"])
        for cv in manga.get("cover_arts", []):
            if cv.get("object_key"):
                keys_to_check.append(cv["object_key"])

        chapters_cursor = pool_db.pool_chapters.find({"pool_manga_id": pool_manga_id})
        async for ch in chapters_cursor:
            for p in ch.get("pages", []):
                if p.get("object_key"):
                    keys_to_check.append(p["object_key"])

        missing_keys: List[str] = []
        for key in keys_to_check:
            if not minio_service.object_exists(key):
                missing_keys.append(key)

        return PoolIntegrityReport(
            pool_manga_id=pool_manga_id,
            is_healthy=len(missing_keys) == 0,
            total_checked=len(keys_to_check),
            missing_keys=missing_keys,
        )

    async def export_etl_package_manifest(self, pool_manga_id: str) -> Optional[Dict[str, Any]]:
        """Export a self-contained Manga Reader Data Contract v2 package for downstream ETL ingestion."""
        pool_db = self._get_pool_db()
        manga = await pool_db.pool_mangas.find_one({"pool_manga_id": pool_manga_id})
        if not manga:
            return None

        chapters = await self.get_pool_manga_chapters(pool_manga_id)
        return build_reader_package(manga, chapters).model_dump(mode="json")

    async def get_pool_stats(self) -> PoolStatsResponse:
        """Calculate overall KPI deck stats for the data lake pool."""
        pool_db = self._get_pool_db()
        total_mangas = await pool_db.pool_mangas.count_documents({})
        total_etl_ready = await pool_db.pool_mangas.count_documents({"is_etl_ready": True})
        total_creators = await self._sync_pool_creators_catalog()

        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_chapters": {"$sum": "$stats.total_chapters"},
                    "total_pages": {"$sum": "$stats.total_pages"},
                    "total_size_bytes": {"$sum": "$stats.total_size_bytes"},
                }
            }
        ]
        agg_res = await pool_db.pool_mangas.aggregate(pipeline).to_list(length=1)

        tot_ch = agg_res[0]["total_chapters"] if agg_res else 0
        tot_pg = agg_res[0]["total_pages"] if agg_res else 0
        tot_sz = agg_res[0]["total_size_bytes"] if agg_res else 0

        return PoolStatsResponse(
            total_mangas=total_mangas,
            total_etl_ready=total_etl_ready,
            total_creators=total_creators,
            total_chapters=tot_ch,
            total_pages=tot_pg,
            total_size_bytes=tot_sz,
            saved_storage_bytes=tot_sz,  # 100% saved via Zero-Copy MinIO pointer
        )

    async def _recalculate_pool_manga_stats(self, pool_manga_id: str) -> None:
        """Internal helper to recalculate stats and manifest hash after chapter/page deletions."""
        pool_db = self._get_pool_db()
        chapters = await pool_db.pool_chapters.find({"pool_manga_id": pool_manga_id}).to_list(length=1000)

        included_chapters = [ch for ch in chapters if ch.get("included", True) is not False]
        tot_ch = len(included_chapters)
        tot_pg = sum(ch.get("page_count", 0) for ch in included_chapters)
        tot_sz = sum(ch.get("total_size_bytes", 0) for ch in included_chapters)
        langs = sorted(list({ch.get("language", "en") for ch in included_chapters if ch.get("language")}))

        now = datetime.now(timezone.utc)
        manifest_sha256 = _compute_manga_manifest_sha256(pool_manga_id, included_chapters)

        await pool_db.pool_mangas.update_one(
            {"pool_manga_id": pool_manga_id},
            {
                "$set": {
                    "stats.total_chapters": tot_ch,
                    "stats.total_pages": tot_pg,
                    "stats.total_size_bytes": tot_sz,
                    "stats.available_languages": langs,
                    "lineage.manifest_sha256": manifest_sha256,
                    "lineage.updated_at": now,
                },
                "$inc": {"lineage.pool_revision": 1},
            },
        )


datalake_pool_service = DatalakePoolService()
