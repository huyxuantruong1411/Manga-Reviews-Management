"""Domain Service for Module 8: Reading List Items Search/Filter, Batch Add/Remove & Analytics."""

from __future__ import annotations

import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import asc, desc, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sanitization import pick_localized_text, sanitize_plain_text, strip_accents
from app.core.storage import storage_service
from app.models import (
    Creator,
    Manga,
    MangaCreator,
    MangaDailyMetric,
    MangaTag,
    MangaVisibilityStatus,
    ReadingList,
    ReadingListItem,
    Tag,
    User,
    UserActivityLog,
)
from app.modules.mod7_reading_lists.service import ReadingListService
from app.modules.mod8_list_items.schemas import (
    BatchAddMangaRequest,
    BatchAddMangaResponse,
    CreatorDistributionItem,
    ListItemMangaResponse,
    ListItemsCollectionResponse,
    ReadingListAnalyticsResponse,
    TagDistributionItem,
)


class ListItemsService:
    """Pure business logic for Module 8 (UC-8.1 -> UC-8.5)."""

    @staticmethod
    def _build_cover_url(manga: Manga) -> str | None:
        if manga.cover_bucket and manga.cover_object_key:
            return storage_service.build_media_url(manga.cover_bucket, manga.cover_object_key)
        return None

    @staticmethod
    async def list_items_in_reading_list(
        db: AsyncSession,
        list_id: uuid.UUID,
        viewer: User,
        q: str | None = None,
        tag_slug: str | None = None,
        pub_status: str | None = None,
        sort_by: str = "added_desc",
    ) -> ListItemsCollectionResponse:
        """UC-8.1 & UC-8.2: List, search, and filter mangas strictly inside a specific reading list."""
        await ReadingListService.get_owned_list(db, list_id, viewer)

        stmt = (
            select(ReadingListItem, Manga)
            .join(Manga, Manga.pool_manga_id == ReadingListItem.manga_id)
            .where(ReadingListItem.list_id == list_id)
        )
        if sort_by == "title_asc":
            stmt = stmt.order_by(asc(Manga.title))
        elif sort_by == "rating_desc":
            stmt = stmt.order_by(desc(Manga.average_rating), desc(ReadingListItem.added_at))
        else:
            stmt = stmt.order_by(desc(ReadingListItem.added_at))

        rows = (await db.execute(stmt)).all()
        manga_ids = [m.pool_manga_id for _item, m in rows]

        tag_map: dict[str, list[str]] = {mid: [] for mid in manga_ids}
        all_tags_set: set[str] = set()
        if manga_ids:
            tag_rows = (
                await db.execute(
                    select(MangaTag.manga_id, Tag.slug)
                    .join(Tag, Tag.id == MangaTag.tag_id)
                    .where(MangaTag.manga_id.in_(manga_ids))
                )
            ).all()
            for mid, t_slug in tag_rows:
                tag_map.setdefault(mid, []).append(t_slug)
                all_tags_set.add(t_slug)

        q_norm = strip_accents(q.strip().lower()) if q else None
        tag_filter = tag_slug.strip().lower() if tag_slug else None
        status_filter = pub_status.strip().lower() if pub_status else None

        items: list[ListItemMangaResponse] = []
        for item, m in rows:
            m_tags = sorted(tag_map.get(m.pool_manga_id, []))
            if tag_filter and tag_filter not in m_tags:
                continue
            if status_filter and m.status.value != status_filter:
                continue
            if q_norm:
                title_norm = strip_accents(m.title.lower())
                alt_norm = " ".join(strip_accents(a.lower()) for a in (m.alt_titles or []))
                if q_norm not in title_norm and q_norm not in alt_norm:
                    continue

            items.append(
                ListItemMangaResponse(
                    pool_manga_id=m.pool_manga_id,
                    slug=m.slug,
                    title=m.title,
                    status=m.status.value,
                    content_rating=m.content_rating.value,
                    cover_url=ListItemsService._build_cover_url(m),
                    chapter_count=m.chapter_count,
                    average_rating=float(m.average_rating),
                    is_hidden=(m.visibility_status == MangaVisibilityStatus.hidden),
                    tags=m_tags,
                    added_at=item.added_at,
                )
            )

        return ListItemsCollectionResponse(
            list_id=list_id,
            total=len(items),
            available_tags_in_list=sorted(all_tags_set),
            items=items,
        )

    @staticmethod
    async def batch_add_manga_to_lists(
        db: AsyncSession,
        viewer: User,
        payload: BatchAddMangaRequest,
    ) -> BatchAddMangaResponse:
        """UC-8.3: Batch add a manga to multiple personal lists + optional inline new list creation."""
        manga = await db.get(Manga, payload.manga_id)
        if manga is None or manga.visibility_status == MangaVisibilityStatus.hidden:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Truyện không tồn tại hoặc đang tạm ẩn.",
            )

        target_list_ids = list(dict.fromkeys(payload.list_ids))
        if payload.new_list_name and payload.new_list_name.strip():
            clean_new_name = sanitize_plain_text(payload.new_list_name)
            existing_named = (
                await db.execute(
                    select(ReadingList).where(
                        ReadingList.owner_id == viewer.user_id,
                        func.lower(ReadingList.name) == clean_new_name.lower(),
                    )
                )
            ).scalar_one_or_none()
            if existing_named is not None:
                if existing_named.list_id not in target_list_ids:
                    target_list_ids.append(existing_named.list_id)
            else:
                inline_list = ReadingList(
                    owner_id=viewer.user_id,
                    name=clean_new_name,
                    description="",
                    visibility="private",
                    manga_count=0,
                )
                db.add(inline_list)
                await db.flush()
                target_list_ids.append(inline_list.list_id)

        if not target_list_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vui lòng chọn ít nhất một danh sách.",
            )

        added_count = 0
        for lid in target_list_ids:
            r_list = await ReadingListService.get_owned_list(db, lid, viewer)
            existing_item = (
                await db.execute(
                    select(ReadingListItem).where(
                        ReadingListItem.list_id == lid,
                        ReadingListItem.manga_id == payload.manga_id,
                    )
                )
            ).scalar_one_or_none()
            if existing_item is None:
                db.add(ReadingListItem(list_id=lid, manga_id=payload.manga_id))
                r_list.manga_count += 1
                added_count += 1

        if added_count > 0:
            manga.list_add_count += added_count
            today = datetime.now(timezone.utc).date()
            metric_stmt = (
                pg_insert(MangaDailyMetric)
                .values(
                    manga_id=manga.pool_manga_id,
                    metric_date=today,
                    views=0,
                    list_adds=added_count,
                    ratings_count=0,
                    comments_count=0,
                )
                .on_conflict_do_update(
                    index_elements=["metric_date", "manga_id"],
                    set_={"list_adds": MangaDailyMetric.list_adds + added_count},
                )
            )
            await db.execute(metric_stmt)

        db.add(
            UserActivityLog(
                user_id=viewer.user_id,
                action_type="reading_list_add_manga",
                target_type="manga",
                target_id=payload.manga_id,
                metadata_={"list_ids": [str(x) for x in target_list_ids], "added_count": added_count},
            )
        )
        await db.commit()

        return BatchAddMangaResponse(
            manga_id=payload.manga_id,
            added_count=added_count,
            list_ids=target_list_ids,
        )

    @staticmethod
    async def remove_manga_from_list(
        db: AsyncSession,
        list_id: uuid.UUID,
        manga_id: str,
        viewer: User,
    ) -> dict[str, Any]:
        """UC-8.4: Remove manga from reading list without deleting reading history or ratings."""
        r_list = await ReadingListService.get_owned_list(db, list_id, viewer)
        item = (
            await db.execute(
                select(ReadingListItem).where(
                    ReadingListItem.list_id == list_id,
                    ReadingListItem.manga_id == manga_id,
                )
            )
        ).scalar_one_or_none()
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Truyện không nằm trong danh sách này.",
            )

        await db.delete(item)
        r_list.manga_count = max(0, r_list.manga_count - 1)
        await db.commit()
        return {
            "list_id": str(list_id),
            "manga_id": manga_id,
            "manga_count": r_list.manga_count,
            "removed": True,
        }

    @staticmethod
    async def get_list_analytics(
        db: AsyncSession,
        list_id: uuid.UUID,
        viewer: User,
    ) -> ReadingListAnalyticsResponse:
        """UC-8.5: Compute metadata analytics for a personal reading list."""
        await ReadingListService.get_owned_list(db, list_id, viewer)

        mangas = (
            (
                await db.execute(
                    select(Manga)
                    .join(ReadingListItem, ReadingListItem.manga_id == Manga.pool_manga_id)
                    .where(ReadingListItem.list_id == list_id)
                )
            )
            .scalars()
            .all()
        )

        total_mangas = len(mangas)
        if total_mangas == 0:
            return ReadingListAnalyticsResponse(
                list_id=list_id,
                total_mangas=0,
                total_chapters=0,
                average_rating=0.0,
                status_distribution={},
                tag_distribution=[],
                top_creators=[],
            )

        total_chapters = sum(m.chapter_count for m in mangas)
        avg_rating = round(sum(float(m.average_rating) for m in mangas) / total_mangas, 2)
        status_counter = Counter(m.status.value for m in mangas)
        manga_ids = [m.pool_manga_id for m in mangas]

        tag_rows = (
            await db.execute(
                select(Tag.slug, Tag.name, func.count(MangaTag.manga_id))
                .join(MangaTag, MangaTag.tag_id == Tag.id)
                .where(MangaTag.manga_id.in_(manga_ids))
                .group_by(Tag.slug, Tag.name)
                .order_by(desc(func.count(MangaTag.manga_id)), asc(Tag.slug))
            )
        ).all()

        tag_dist = [
            TagDistributionItem(
                slug=slug,
                name=pick_localized_text(name_json, slug),
                count=int(cnt),
                percentage=round((int(cnt) / total_mangas) * 100.0, 1),
            )
            for slug, name_json, cnt in tag_rows
        ]

        creator_rows = (
            await db.execute(
                select(Creator.creator_id, Creator.name, func.count(func.distinct(MangaCreator.manga_id)))
                .join(MangaCreator, MangaCreator.creator_id == Creator.creator_id)
                .where(MangaCreator.manga_id.in_(manga_ids))
                .group_by(Creator.creator_id, Creator.name)
                .order_by(desc(func.count(func.distinct(MangaCreator.manga_id))), asc(Creator.name))
                .limit(10)
            )
        ).all()

        top_creators = [
            CreatorDistributionItem(
                creator_id=cid,
                name=cname,
                count=int(cnt),
            )
            for cid, cname, cnt in creator_rows
        ]

        return ReadingListAnalyticsResponse(
            list_id=list_id,
            total_mangas=total_mangas,
            total_chapters=total_chapters,
            average_rating=avg_rating,
            status_distribution=dict(status_counter),
            tag_distribution=tag_dist,
            top_creators=top_creators,
        )
