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
    PoolCreatorEmbedded,
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
from backend.services.minio_service import minio_service

logger = logging.getLogger(__name__)


def slugify(text: str) -> str:
    """Create a URL-friendly slug from text."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text or "manga"


class DatalakePoolService:
    def _get_source_db(self):
        return get_db()

    def _get_pool_db(self):
        return get_pool_db()

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
        # Apply pagination after in-memory filtering if has_pages_only or not_in_pool_only
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

                # Denormalize creators
                creator_names = set()
                if manga.get("author"):
                    creator_names.add(manga["author"])
                if manga.get("artist"):
                    creator_names.add(manga["artist"])
                denormalized_creators: List[Dict[str, Any]] = []
                if creator_names:
                    creators_cursor = source_db.creators.find({"name": {"$in": list(creator_names)}})
                    async for c_doc in creators_cursor:
                        denormalized_creators.append(
                            PoolCreatorEmbedded(
                                name=c_doc.get("name", ""),
                                role=c_doc.get("role", "author"),
                                mangadex_id=c_doc.get("mangadex_id"),
                                biography=c_doc.get("biography", {}),
                                links=c_doc.get("links", {}),
                            ).model_dump()
                        )

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
                if existing_manga:
                    pool_manga_id = existing_manga["pool_manga_id"]
                    pool_revision = existing_manga.get("lineage", {}).get("pool_revision", 1) + 1
                    slug = existing_manga.get("slug") or slugify(title)
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
                    ch_lang = ch.get("language", "en")
                    languages_set.add(ch_lang)
                    total_pages_count += len(mapped_pages)
                    total_size_bytes += ch_size

                    # Hash chapter content
                    ch_content_str = f"{ch.get('chapter_number')}:{ch_lang}:{len(mapped_pages)}:{ch_size}"
                    ch_sha256 = hashlib.sha256(ch_content_str.encode("utf-8")).hexdigest()

                    pool_chapter = PoolChapterInDB(
                        pool_chapter_id=f"pch_{uuid.uuid4().hex[:12]}",
                        pool_manga_id=pool_manga_id,
                        source_manga_id=s_id,
                        source_chapter_id=ch_id_str,
                        chapter_number=str(ch.get("chapter_number", "1")),
                        chapter_numeric=float(ch.get("chapter_numeric", 0.0)),
                        volume=ch.get("volume"),
                        title=ch.get("title", ""),
                        language=ch_lang,
                        scanlation_group=ch.get("scanlation_group"),
                        uploader=ch.get("uploader"),
                        publish_at=ch.get("publish_at"),
                        source=ch.get("source", "mangadex"),
                        source_id=ch.get("source_id"),
                        pages=mapped_pages,
                        page_count=len(mapped_pages),
                        total_size_bytes=ch_size,
                        pages_revision=1,
                        manifest_sha256=ch_sha256,
                        included=True,
                        created_at=now,
                        updated_at=now,
                    )
                    pool_chapters_to_insert.append(pool_chapter.model_dump())

                # Overall manifest SHA-256
                manifest_payload = f"{pool_manga_id}:{title}:{total_pages_count}:{total_size_bytes}:{pool_revision}"
                manifest_sha256 = hashlib.sha256(manifest_payload.encode("utf-8")).hexdigest()

                # Stats & Lineage
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
                    published_at=now,
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

        total = await pool_db.pool_mangas.count_documents(query)
        skip = (page - 1) * page_size

        cursor = pool_db.pool_mangas.find(query).sort(sort_by, sort_order).skip(skip).limit(page_size)
        raw_items = await cursor.to_list(length=page_size)

        items = []
        for doc in raw_items:
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
            # Generate temporary presigned URLs for primary cover
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

        # Presign primary cover
        pc = doc.get("primary_cover")
        if pc and pc.get("object_key"):
            pc["url"] = minio_service.get_presigned_url(pc["object_key"])

        # Presign cover arts
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

        now = datetime.now(timezone.utc)
        clean_update["lineage.updated_at"] = now
        clean_update["lineage.pool_revision"] = existing.get("lineage", {}).get("pool_revision", 1) + 1

        await pool_db.pool_mangas.update_one(
            {"pool_manga_id": pool_manga_id},
            {"$set": clean_update},
        )

        await pool_db.pool_audit_logs.insert_one(
            {
                "pool_manga_id": pool_manga_id,
                "action": "update_metadata",
                "fields": list(clean_update.keys()),
                "timestamp": now,
            }
        )

        return await self.get_pool_manga_detail(pool_manga_id)

    async def remove_manga_from_pool(self, pool_manga_id: str) -> bool:
        """
        Remove manga and chapters strictly from pool database.
        NEVER deletes MinIO files and NEVER alters source review DB.
        """
        pool_db = self._get_pool_db()
        res = await pool_db.pool_mangas.delete_one({"pool_manga_id": pool_manga_id})
        await pool_db.pool_chapters.delete_many({"pool_manga_id": pool_manga_id})

        await pool_db.pool_audit_logs.insert_one(
            {
                "pool_manga_id": pool_manga_id,
                "action": "remove_from_pool",
                "timestamp": datetime.now(timezone.utc),
            }
        )
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
        return await self.get_pool_chapter_detail(pool_chapter_id, include_presigned_urls=False)

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

        # Renumber remaining pages 1..N
        total_size = 0
        for i, p in enumerate(remaining_pages):
            p["page_number"] = i + 1
            total_size += p.get("file_size", 0)

        now = datetime.now(timezone.utc)
        await pool_db.pool_chapters.update_one(
            {"pool_chapter_id": pool_chapter_id},
            {
                "$set": {
                    "pages": remaining_pages,
                    "page_count": len(remaining_pages),
                    "total_size_bytes": total_size,
                    "pages_revision": ch.get("pages_revision", 1) + 1,
                    "updated_at": now,
                }
            },
        )

        await self._recalculate_pool_manga_stats(ch["pool_manga_id"])
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
        # Group targets by pool_chapter_id
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
        """Export a self-contained JSON data contract package for downstream ETL ingestion."""
        manga = await self.get_pool_manga_detail(pool_manga_id)
        if not manga:
            return None

        chapters = await self.get_pool_manga_chapters(pool_manga_id)
        return {
            "contract_version": "1.0",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "manga": manga,
            "chapters": chapters,
        }

    async def get_pool_stats(self) -> PoolStatsResponse:
        """Calculate overall KPI deck stats for the data lake pool."""
        pool_db = self._get_pool_db()
        total_mangas = await pool_db.pool_mangas.count_documents({})
        total_etl_ready = await pool_db.pool_mangas.count_documents({"is_etl_ready": True})

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
            total_chapters=tot_ch,
            total_pages=tot_pg,
            total_size_bytes=tot_sz,
            saved_storage_bytes=tot_sz,  # 100% saved via Zero-Copy MinIO pointer
        )

    async def _recalculate_pool_manga_stats(self, pool_manga_id: str) -> None:
        """Internal helper to recalculate stats and manifest hash after chapter/page deletions."""
        pool_db = self._get_pool_db()
        chapters = await pool_db.pool_chapters.find({"pool_manga_id": pool_manga_id}).to_list(length=1000)

        tot_ch = len(chapters)
        tot_pg = sum(ch.get("page_count", 0) for ch in chapters)
        tot_sz = sum(ch.get("total_size_bytes", 0) for ch in chapters)
        langs = sorted(list({ch.get("language", "en") for ch in chapters if ch.get("language")}))

        now = datetime.now(timezone.utc)
        manifest_payload = f"{pool_manga_id}:{tot_ch}:{tot_pg}:{tot_sz}:{now.isoformat()}"
        manifest_sha256 = hashlib.sha256(manifest_payload.encode("utf-8")).hexdigest()

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
