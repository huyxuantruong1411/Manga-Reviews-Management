"""Service Layer for Module 2 (ETL Data Contract v2.0, CDC Webhook, Hide/Show/Delete, Analytics)."""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import HTTPException, status
from sqlalchemy import asc, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BASE_DIR, settings
from app.core.redis import redis_delete_prefix
from app.core.storage import storage_service
from app.models import (
    AdminAuditLog,
    Chapter,
    ChapterPage,
    ContentRating,
    Creator,
    CreatorRole,
    EtlSyncJob,
    Manga,
    MangaCoverArt,
    MangaCreator,
    MangaDailyMetric,
    MangaTag,
    MangaVisibilityStatus,
    PublicationDemographic,
    PublicationStatus,
    Tag,
    TagGroup,
    User,
)
from app.modules.mod2_manga_management.schemas import (
    CdcChaptersWebhookRequest,
    EtlIngestRequest,
)
from app.schemas.contract_v2 import MangaReaderPackage, ReaderChapter
from app.workers.recsys_engine import update_manga_content_vector


def _parse_optional_uuid(val: str | None) -> uuid.UUID | None:
    if not val:
        return None
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        return None


class MangaManagementService:
    """Domain service for Module 2 use cases (UC-2.1 -> UC-2.5)."""

    async def list_etl_sources(self, db: AsyncSession) -> dict[str, Any]:
        """List available manga packages from Manga Data Lake & Storage Pool API, MinIO staging, and local contracts."""
        existing_rows = (await db.execute(select(Manga.pool_manga_id, Manga.pool_revision, Manga.cdc_enabled))).all()
        ingested_map = {r[0]: {"pool_revision": r[1], "cdc_enabled": r[2]} for r in existing_rows}

        datalake_items: list[dict[str, Any]] = []
        datalake_online = False
        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                resp = await client.get(
                    f"{settings.DATA_LAKE_API_URL.rstrip('/')}/mangas",
                    params={"pool_state": "published", "is_etl_ready": "true", "page_size": 50},
                )
                if resp.status_code == 200:
                    datalake_online = True
                    body = resp.json()
                    for item in body.get("items", []):
                        pmid = item.get("pool_manga_id")
                        datalake_items.append(
                            {
                                "pool_manga_id": pmid,
                                "title": item.get("title"),
                                "slug": item.get("slug"),
                                "pool_revision": (item.get("lineage") or {}).get("pool_revision", 1),
                                "already_ingested": pmid in ingested_map,
                                "local_revision": ingested_map.get(pmid, {}).get("pool_revision"),
                            }
                        )
        except Exception:
            datalake_online = False

        local_contracts: list[dict[str, Any]] = []
        contracts_dir = BASE_DIR / "contracts"
        if contracts_dir.exists():
            for jf in sorted(contracts_dir.glob("*example*.json")):
                try:
                    raw = json.loads(jf.read_text(encoding="utf-8"))
                    m_info = raw.get("manga") or {}
                    pmid = m_info.get("pool_manga_id")
                    local_contracts.append(
                        {
                            "filename": jf.name,
                            "pool_manga_id": pmid,
                            "title": m_info.get("title"),
                            "already_ingested": pmid in ingested_map,
                        }
                    )
                except Exception:
                    pass

        return {
            "datalake_pool_api": settings.DATA_LAKE_API_URL,
            "datalake_online": datalake_online,
            "datalake_packages": datalake_items,
            "local_contracts": local_contracts,
            "ingested_count": len(ingested_map),
        }

    async def fetch_package_from_datalake_or_local(self, pool_manga_id: str) -> MangaReaderPackage:
        """Fetch MangaReaderPackage v2.0 from Manga Data Lake Pool API or local contract file."""
        # 1. Try live Manga Data Lake & Storage Pool API
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                url = f"{settings.DATA_LAKE_API_URL.rstrip('/')}/mangas/{pool_manga_id}/etl-manifest"
                resp = await client.get(url)
                if resp.status_code == 200:
                    return MangaReaderPackage.model_validate(resp.json())
        except Exception:
            pass

        # 2. Fallback to local contracts directory
        contracts_dir = BASE_DIR / "contracts"
        for jf in contracts_dir.glob("*.json"):
            if jf.name.endswith(".schema.json"):
                continue
            raw = json.loads(jf.read_text(encoding="utf-8"))
            if (raw.get("manga") or {}).get("pool_manga_id") == pool_manga_id:
                return MangaReaderPackage.model_validate(raw)

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy gói ETL cho pool_manga_id='{pool_manga_id}' trên Data Lake Pool hoặc kho lưu trữ.",
        )

    async def _upsert_chapters(
        self,
        db: AsyncSession,
        pool_manga_id: str,
        chapters: list[ReaderChapter],
    ) -> datetime | None:
        latest_pub: datetime | None = None

        for ch_dto in chapters:
            existing_ch = (
                await db.execute(select(Chapter).where(Chapter.pool_chapter_id == ch_dto.pool_chapter_id))
            ).scalar_one_or_none()

            pub_at = ch_dto.publish_at
            if pub_at and (latest_pub is None or pub_at > latest_pub):
                latest_pub = pub_at

            if existing_ch is None:
                existing_ch = Chapter(
                    pool_chapter_id=ch_dto.pool_chapter_id,
                    manga_id=pool_manga_id,
                    source_chapter_id=ch_dto.source_chapter_id,
                    chapter_number=ch_dto.chapter_number,
                    chapter_numeric=float(ch_dto.chapter_numeric),
                    volume=ch_dto.volume,
                    title=ch_dto.title,
                    language=ch_dto.language,
                    scanlation_group=ch_dto.scanlation_group,
                    publish_at=ch_dto.publish_at,
                    source=ch_dto.source,
                    source_id=ch_dto.source_id,
                    page_count=len(ch_dto.pages) or ch_dto.page_count,
                    total_size_bytes=ch_dto.total_size_bytes,
                    pages_revision=ch_dto.pages_revision,
                    manifest_sha256=ch_dto.manifest_sha256,
                    source_updated_at=ch_dto.updated_at,
                )
                db.add(existing_ch)
            else:
                existing_ch.source_chapter_id = ch_dto.source_chapter_id
                existing_ch.chapter_number = ch_dto.chapter_number
                existing_ch.chapter_numeric = float(ch_dto.chapter_numeric)
                existing_ch.volume = ch_dto.volume
                existing_ch.title = ch_dto.title
                existing_ch.language = ch_dto.language
                existing_ch.scanlation_group = ch_dto.scanlation_group
                existing_ch.publish_at = ch_dto.publish_at
                existing_ch.source = ch_dto.source
                existing_ch.source_id = ch_dto.source_id
                existing_ch.page_count = len(ch_dto.pages) or ch_dto.page_count
                existing_ch.total_size_bytes = ch_dto.total_size_bytes
                existing_ch.pages_revision = ch_dto.pages_revision
                existing_ch.manifest_sha256 = ch_dto.manifest_sha256
                existing_ch.source_updated_at = ch_dto.updated_at

            await db.flush()

            # Replace chapter pages cleanly for idempotency
            await db.execute(delete(ChapterPage).where(ChapterPage.chapter_id == ch_dto.pool_chapter_id))
            for pg_dto in ch_dto.pages:
                storage_service.sync_or_create_placeholder_media(
                    bucket=pg_dto.media.bucket,
                    object_key=pg_dto.media.object_key,
                    width=pg_dto.media.width,
                    height=pg_dto.media.height,
                )
                db.add(
                    ChapterPage(
                        page_uid=pg_dto.page_uid,
                        chapter_id=ch_dto.pool_chapter_id,
                        page_number=pg_dto.page_number,
                        filename=pg_dto.filename,
                        bucket=pg_dto.media.bucket,
                        object_key=pg_dto.media.object_key,
                        file_size=pg_dto.media.file_size,
                        width=pg_dto.media.width,
                        height=pg_dto.media.height,
                        content_type=pg_dto.media.content_type,
                        md5_hash=pg_dto.media.md5_hash,
                        sha256=pg_dto.media.sha256,
                    )
                )

        return latest_pub

    async def ingest_package(
        self,
        db: AsyncSession,
        admin: User | None,
        payload: EtlIngestRequest,
    ) -> dict[str, Any]:
        """Validate and idempotently ingest a MangaReaderPackage v2.0 into PostgreSQL and MinIO (UC-2.3)."""
        pkg = payload.package
        if pkg is None:
            if not payload.pool_manga_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Phải cung cấp 'package' (JSON v2.0) hoặc 'pool_manga_id'.",
                )
            pkg = await self.fetch_package_from_datalake_or_local(payload.pool_manga_id)

        m_dto = pkg.manga
        now = datetime.now(timezone.utc)

        job = EtlSyncJob(
            triggered_by=admin.user_id if admin else None,
            job_type="manual_batch_etl",
            pool_manga_id=m_dto.pool_manga_id,
            package_revision=m_dto.lineage.pool_revision,
            manifest_sha256=m_dto.lineage.manifest_sha256[:64] if m_dto.lineage.manifest_sha256 else "",
            status="running",
            started_at=now,
        )
        db.add(job)
        await db.flush()

        # Sync primary cover to MinIO if present
        if m_dto.primary_cover:
            storage_service.sync_or_create_placeholder_media(
                bucket=m_dto.primary_cover.bucket,
                object_key=m_dto.primary_cover.object_key,
                width=m_dto.primary_cover.width,
                height=m_dto.primary_cover.height,
            )

        manga = (await db.execute(select(Manga).where(Manga.pool_manga_id == m_dto.pool_manga_id))).scalar_one_or_none()

        pc = m_dto.primary_cover
        links_json = [{"site": lnk.site, "url": lnk.url} for lnk in m_dto.links]

        if manga is None:
            manga = Manga(
                pool_manga_id=m_dto.pool_manga_id,
                slug=m_dto.slug,
                source_manga_id=m_dto.source_manga_id,
                mangadex_id=_parse_optional_uuid(m_dto.mangadex_id),
                title=m_dto.title,
                alt_titles=m_dto.alt_titles,
                description=m_dto.description,
                status=PublicationStatus(m_dto.status),
                content_rating=ContentRating(m_dto.content_rating),
                publication_demographic=PublicationDemographic(m_dto.publication_demographic),
                original_language=m_dto.original_language,
                year=m_dto.year,
                published_start_date=m_dto.published_start_date,
                published_end_date=m_dto.published_end_date,
                official_volumes=m_dto.official_volumes,
                official_chapters=m_dto.official_chapters,
                cover_bucket=pc.bucket if pc else None,
                cover_object_key=pc.object_key if pc else None,
                cover_file_size=pc.file_size if pc else 0,
                cover_width=pc.width if pc else None,
                cover_height=pc.height if pc else None,
                cover_content_type=pc.content_type if pc else None,
                cover_md5_hash=pc.md5_hash if pc else None,
                cover_sha256=pc.sha256 if pc else None,
                external_links=links_json,
                chapter_count=m_dto.stats.chapter_count,
                page_count=m_dto.stats.page_count,
                total_size_bytes=m_dto.stats.total_size_bytes,
                available_languages=m_dto.stats.languages,
                pool_revision=m_dto.lineage.pool_revision,
                source_metadata_revision=m_dto.lineage.source_metadata_revision,
                manifest_sha256=m_dto.lineage.manifest_sha256[:64],
                pool_published_at=m_dto.lineage.published_at,
                pool_updated_at=m_dto.lineage.updated_at,
                cdc_enabled=payload.cdc_enabled,
            )
            db.add(manga)
        else:
            manga.slug = m_dto.slug
            manga.source_manga_id = m_dto.source_manga_id
            manga.mangadex_id = _parse_optional_uuid(m_dto.mangadex_id)
            manga.title = m_dto.title
            manga.alt_titles = m_dto.alt_titles
            manga.description = m_dto.description
            manga.status = PublicationStatus(m_dto.status)
            manga.content_rating = ContentRating(m_dto.content_rating)
            manga.publication_demographic = PublicationDemographic(m_dto.publication_demographic)
            manga.original_language = m_dto.original_language
            manga.year = m_dto.year
            manga.published_start_date = m_dto.published_start_date
            manga.published_end_date = m_dto.published_end_date
            manga.official_volumes = m_dto.official_volumes
            manga.official_chapters = m_dto.official_chapters
            manga.cover_bucket = pc.bucket if pc else None
            manga.cover_object_key = pc.object_key if pc else None
            manga.cover_file_size = pc.file_size if pc else 0
            manga.cover_width = pc.width if pc else None
            manga.cover_height = pc.height if pc else None
            manga.cover_content_type = pc.content_type if pc else None
            manga.cover_md5_hash = pc.md5_hash if pc else None
            manga.cover_sha256 = pc.sha256 if pc else None
            manga.external_links = links_json
            manga.chapter_count = m_dto.stats.chapter_count
            manga.page_count = m_dto.stats.page_count
            manga.total_size_bytes = m_dto.stats.total_size_bytes
            manga.available_languages = m_dto.stats.languages
            manga.pool_revision = m_dto.lineage.pool_revision
            manga.source_metadata_revision = m_dto.lineage.source_metadata_revision
            manga.manifest_sha256 = m_dto.lineage.manifest_sha256[:64]
            manga.pool_published_at = m_dto.lineage.published_at
            manga.pool_updated_at = m_dto.lineage.updated_at
            manga.cdc_enabled = payload.cdc_enabled

        await db.flush()

        # Upsert Cover Arts
        await db.execute(delete(MangaCoverArt).where(MangaCoverArt.manga_id == m_dto.pool_manga_id))
        for ca in m_dto.cover_arts:
            storage_service.sync_or_create_placeholder_media(
                bucket=ca.media.bucket,
                object_key=ca.media.object_key,
                width=ca.media.width,
                height=ca.media.height,
            )
            db.add(
                MangaCoverArt(
                    manga_id=m_dto.pool_manga_id,
                    cover_id=ca.cover_id,
                    volume=ca.volume,
                    locale=ca.locale,
                    description=ca.description,
                    bucket=ca.media.bucket,
                    object_key=ca.media.object_key,
                    content_type=ca.media.content_type,
                    width=ca.media.width,
                    height=ca.media.height,
                    file_size=ca.media.file_size,
                    md5_hash=ca.media.md5_hash,
                    sha256=ca.media.sha256,
                )
            )

        # Upsert Creators & MangaCreator
        await db.execute(delete(MangaCreator).where(MangaCreator.manga_id == m_dto.pool_manga_id))
        creator_ids: list[str] = []
        seen_creator_roles: set[tuple[str, str]] = set()
        for cr_dto in m_dto.creators:
            creator = (
                await db.execute(select(Creator).where(Creator.creator_id == cr_dto.creator_id))
            ).scalar_one_or_none()
            if creator is None:
                creator = Creator(
                    creator_id=cr_dto.creator_id,
                    slug=cr_dto.slug,
                    name=cr_dto.name,
                    mangadex_id=_parse_optional_uuid(cr_dto.mangadex_id),
                    biography=cr_dto.biography,
                    links=cr_dto.links,
                )
                db.add(creator)
            else:
                creator.slug = cr_dto.slug
                creator.name = cr_dto.name
                creator.biography = cr_dto.biography
                creator.links = cr_dto.links
            await db.flush()

            if (cr_dto.creator_id, cr_dto.role) not in seen_creator_roles:
                seen_creator_roles.add((cr_dto.creator_id, cr_dto.role))
                creator_ids.append(cr_dto.creator_id)
                db.add(
                    MangaCreator(
                        manga_id=m_dto.pool_manga_id,
                        creator_id=cr_dto.creator_id,
                        role=CreatorRole(cr_dto.role),
                    )
                )

        # Upsert Tags & MangaTag
        await db.execute(delete(MangaTag).where(MangaTag.manga_id == m_dto.pool_manga_id))
        tag_slugs: list[str] = []
        for tg_dto in m_dto.tags:
            tag = (await db.execute(select(Tag).where(Tag.slug == tg_dto.slug))).scalar_one_or_none()
            if tag is None:
                tag = Tag(
                    slug=tg_dto.slug,
                    source_tag_id=tg_dto.source_tag_id,
                    mangadex_id=_parse_optional_uuid(tg_dto.mangadex_id),
                    tag_group=TagGroup(tg_dto.group),
                    name=tg_dto.name,
                )
                db.add(tag)
                await db.flush()
            else:
                tag.name = tg_dto.name
                tag.tag_group = TagGroup(tg_dto.group)

            if tg_dto.slug not in tag_slugs:
                tag_slugs.append(tg_dto.slug)
                db.add(MangaTag(manga_id=m_dto.pool_manga_id, tag_id=tag.id))

        # Upsert Chapters & Pages
        latest_pub = await self._upsert_chapters(db, m_dto.pool_manga_id, pkg.chapters)
        manga.latest_chapter_published_at = latest_pub or now
        manga.chapter_count = len(pkg.chapters)
        manga.page_count = sum(len(c.pages) for c in pkg.chapters)
        manga.total_size_bytes = sum(c.total_size_bytes for c in pkg.chapters)

        # Update Content-Based Recommendation Feature Vector immediately (UC-3.9 NFR1)
        await update_manga_content_vector(db, manga, tag_slugs=tag_slugs, creator_ids=creator_ids)

        job.status = "completed"
        job.finished_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(manga)
        await redis_delete_prefix("catalog:")

        return {
            "job_id": str(job.job_id),
            "pool_manga_id": manga.pool_manga_id,
            "slug": manga.slug,
            "title": manga.title,
            "pool_revision": manga.pool_revision,
            "chapter_count": manga.chapter_count,
            "page_count": manga.page_count,
            "cdc_enabled": manga.cdc_enabled,
            "visibility_status": manga.visibility_status.value,
        }

    async def process_cdc_chapters_webhook(
        self,
        db: AsyncSession,
        payload: CdcChaptersWebhookRequest,
    ) -> dict[str, Any]:
        """Handle CDC Chapter Webhook updates (UC-2.3)."""
        manga = (
            await db.execute(select(Manga).where(Manga.pool_manga_id == payload.pool_manga_id))
        ).scalar_one_or_none()
        if manga is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ truyện.")
        if not manga.cdc_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bộ truyện này chưa bật chế độ tự động đồng bộ CDC.",
            )

        now = datetime.now(timezone.utc)
        manga.is_syncing = True
        job = EtlSyncJob(
            job_type="cdc_webhook_sync",
            pool_manga_id=manga.pool_manga_id,
            package_revision=payload.pool_revision or (manga.pool_revision + 1),
            status="running",
            started_at=now,
        )
        db.add(job)
        await db.flush()

        try:
            latest_pub = await self._upsert_chapters(db, manga.pool_manga_id, payload.chapters)
            all_ch = (await db.execute(select(Chapter).where(Chapter.manga_id == manga.pool_manga_id))).scalars().all()
            manga.chapter_count = len(all_ch)
            manga.page_count = sum(c.page_count for c in all_ch)
            manga.total_size_bytes = sum(c.total_size_bytes for c in all_ch)
            manga.available_languages = sorted({c.language for c in all_ch})
            if payload.pool_revision:
                manga.pool_revision = payload.pool_revision
            if latest_pub and (
                manga.latest_chapter_published_at is None or latest_pub > manga.latest_chapter_published_at
            ):
                manga.latest_chapter_published_at = latest_pub
            else:
                manga.latest_chapter_published_at = now

            job.status = "completed"
            job.finished_at = datetime.now(timezone.utc)
        finally:
            manga.is_syncing = False

        await db.commit()
        await db.refresh(manga)
        await redis_delete_prefix("catalog:")

        return {
            "job_id": str(job.job_id),
            "pool_manga_id": manga.pool_manga_id,
            "chapter_count": manga.chapter_count,
            "page_count": manga.page_count,
            "pool_revision": manga.pool_revision,
            "status": "synced",
        }

    async def hide_manga(
        self,
        db: AsyncSession,
        admin: User,
        manga_id: str,
        reason: str,
    ) -> dict[str, Any]:
        """UC-2.1: Hide manga from public discovery and invalidate search/catalog cache immediately."""
        manga = (await db.execute(select(Manga).where(Manga.pool_manga_id == manga_id))).scalar_one_or_none()
        if manga is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ truyện.")

        now = datetime.now(timezone.utc)
        manga.visibility_status = MangaVisibilityStatus.hidden
        manga.hidden_reason = reason.strip()
        manga.hidden_by = admin.user_id
        manga.hidden_at = now

        db.add(
            AdminAuditLog(
                admin_id=admin.user_id,
                action_type="hide_manga",
                target_type="manga",
                target_id=manga.pool_manga_id,
                reason=manga.hidden_reason,
                details={"title": manga.title},
            )
        )
        await db.commit()
        await db.refresh(manga)
        await redis_delete_prefix("catalog:")

        return {
            "pool_manga_id": manga.pool_manga_id,
            "visibility_status": manga.visibility_status.value,
            "hidden_reason": manga.hidden_reason,
            "hidden_at": manga.hidden_at.isoformat() if manga.hidden_at else None,
        }

    async def show_manga(
        self,
        db: AsyncSession,
        admin: User,
        manga_id: str,
        reason: str,
    ) -> dict[str, Any]:
        """UC-2.2: Restore hidden manga to public visibility after verifying metadata integrity."""
        manga = (await db.execute(select(Manga).where(Manga.pool_manga_id == manga_id))).scalar_one_or_none()
        if manga is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ truyện.")

        if not manga.title or not manga.slug:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Metadata của truyện không đầy đủ (thiếu title hoặc slug), không thể hiển thị công khai.",
            )

        manga.visibility_status = MangaVisibilityStatus.public
        manga.hidden_reason = None
        manga.hidden_by = None
        manga.hidden_at = None

        db.add(
            AdminAuditLog(
                admin_id=admin.user_id,
                action_type="show_manga",
                target_type="manga",
                target_id=manga.pool_manga_id,
                reason=reason.strip(),
                details={"title": manga.title},
            )
        )
        await db.commit()
        await db.refresh(manga)
        await redis_delete_prefix("catalog:")

        return {
            "pool_manga_id": manga.pool_manga_id,
            "visibility_status": manga.visibility_status.value,
        }

    async def delete_manga(
        self,
        db: AsyncSession,
        admin: User,
        manga_id: str,
        reason: str,
    ) -> dict[str, Any]:
        """UC-2.4: Delete manga from reader system, locking operation if manga.is_syncing is True."""
        manga = (await db.execute(select(Manga).where(Manga.pool_manga_id == manga_id))).scalar_one_or_none()
        if manga is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ truyện.")

        # Activity Diagram UC-2.4: Block deletion if currently syncing chapters
        if manga.is_syncing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Truyện đang trong tiến trình đồng bộ chapter mới, vui lòng thử lại sau.",
            )

        # Collect reader MinIO objects for cleanup (never touches external source system)
        objects_by_bucket: dict[str, list[str]] = {}
        if manga.cover_bucket and manga.cover_object_key:
            objects_by_bucket.setdefault(manga.cover_bucket, []).append(manga.cover_object_key)

        covers = (
            (await db.execute(select(MangaCoverArt).where(MangaCoverArt.manga_id == manga.pool_manga_id)))
            .scalars()
            .all()
        )
        for c in covers:
            objects_by_bucket.setdefault(c.bucket, []).append(c.object_key)

        pages = (
            await db.execute(
                select(ChapterPage.bucket, ChapterPage.object_key)
                .join(Chapter, Chapter.pool_chapter_id == ChapterPage.chapter_id)
                .where(Chapter.manga_id == manga.pool_manga_id)
            )
        ).all()
        for b, k in pages:
            objects_by_bucket.setdefault(b, []).append(k)

        title = manga.title
        manga.cdc_enabled = False
        await db.execute(delete(Manga).where(Manga.pool_manga_id == manga_id))

        db.add(
            AdminAuditLog(
                admin_id=admin.user_id,
                action_type="delete_manga",
                target_type="manga",
                target_id=manga_id,
                reason=reason.strip(),
                details={"title": title, "cleaned_object_count": sum(len(v) for v in objects_by_bucket.values())},
            )
        )
        await db.commit()
        await redis_delete_prefix("catalog:")

        for bucket, keys in objects_by_bucket.items():
            storage_service.delete_objects(bucket, keys)

        return {"deleted": True, "pool_manga_id": manga_id, "title": title}

    async def get_manga_analytics(
        self,
        db: AsyncSession,
        period: str = "month",
        from_date: date | None = None,
        to_date: date | None = None,
        tag_slug: str | None = None,
        manga_id: str | None = None,
    ) -> dict[str, Any]:
        """UC-2.5: View manga interaction analytics by day/week/month/custom period, tag, or manga."""
        today = datetime.now(timezone.utc).date()
        end_default = today + timedelta(days=1)
        if period == "day":
            start_d = today - timedelta(days=1)
            end_d = end_default
        elif period == "week":
            start_d = today - timedelta(days=7)
            end_d = end_default
        elif period == "custom" and from_date and to_date:
            start_d = from_date
            end_d = to_date
        else:
            start_d = today - timedelta(days=30)
            end_d = end_default

        manga_stmt = select(Manga)
        if manga_id:
            manga_stmt = manga_stmt.where(Manga.pool_manga_id == manga_id)
        if tag_slug:
            manga_stmt = (
                manga_stmt.join(MangaTag, MangaTag.manga_id == Manga.pool_manga_id)
                .join(Tag, Tag.id == MangaTag.tag_id)
                .where(Tag.slug == tag_slug)
            )

        mangas = (await db.execute(manga_stmt)).scalars().all()
        target_ids = [m.pool_manga_id for m in mangas]

        metric_conditions = [
            MangaDailyMetric.metric_date >= start_d,
            MangaDailyMetric.metric_date <= end_d,
        ]
        if target_ids:
            metric_conditions.append(MangaDailyMetric.manga_id.in_(target_ids))

        metric_rows = (
            (
                await db.execute(
                    select(MangaDailyMetric).where(*metric_conditions).order_by(asc(MangaDailyMetric.metric_date))
                )
            )
            .scalars()
            .all()
        )

        daily_trend: dict[str, dict[str, int]] = {}
        for mr in metric_rows:
            d_key = mr.metric_date.isoformat()
            slot = daily_trend.setdefault(
                d_key,
                {"views": 0, "list_adds": 0, "ratings_count": 0, "comments_count": 0},
            )
            slot["views"] += int(mr.views)
            slot["list_adds"] += int(mr.list_adds)
            slot["ratings_count"] += int(mr.ratings_count)
            slot["comments_count"] += int(mr.comments_count)

        total_views = sum(s["views"] for s in daily_trend.values()) or sum(int(m.view_count) for m in mangas)
        total_list_adds = sum(s["list_adds"] for s in daily_trend.values()) or sum(
            int(m.list_add_count) for m in mangas
        )
        total_ratings = sum(s["ratings_count"] for s in daily_trend.values()) or sum(
            int(m.rating_count) for m in mangas
        )
        total_comments = sum(s["comments_count"] for s in daily_trend.values()) or sum(
            int(m.comment_count) for m in mangas
        )
        avg_rating = round(sum(float(m.average_rating) for m in mangas) / len(mangas), 2) if mangas else 0.0

        ranked = sorted(
            mangas,
            key=lambda m: (int(m.view_count), float(m.average_rating), int(m.comment_count)),
            reverse=True,
        )

        def _fmt(m: Manga) -> dict[str, Any]:
            return {
                "pool_manga_id": m.pool_manga_id,
                "slug": m.slug,
                "title": m.title,
                "view_count": int(m.view_count),
                "average_rating": float(m.average_rating),
                "rating_count": int(m.rating_count),
                "comment_count": int(m.comment_count),
                "list_add_count": int(m.list_add_count),
            }

        return {
            "period": period,
            "from_date": start_d.isoformat(),
            "to_date": end_d.isoformat(),
            "summary": {
                "total_mangas": len(mangas),
                "total_views": total_views,
                "total_list_adds": total_list_adds,
                "total_ratings": total_ratings,
                "average_rating": avg_rating,
                "total_comments": total_comments,
            },
            "trend": [{"date": k, **v} for k, v in sorted(daily_trend.items())],
            "top_mangas": [_fmt(m) for m in ranked[:10]],
            "bottom_mangas": [_fmt(m) for m in list(reversed(ranked))[:10]],
        }


manga_management_service = MangaManagementService()
