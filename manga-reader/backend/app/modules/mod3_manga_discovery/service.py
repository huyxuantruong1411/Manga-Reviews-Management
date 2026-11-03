"""Service Layer for Module 3 (Catalog, Filter, Fuzzy/Unaccent Search, Creators, 3 RecSys Models, History)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import asc, delete, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sanitization import strip_accents
from app.core.storage import storage_service
from app.models import (
    Chapter,
    ContentRating,
    Creator,
    Manga,
    MangaCoverArt,
    MangaCreator,
    MangaRating,
    MangaTag,
    MangaVisibilityStatus,
    PublicationDemographic,
    PublicationStatus,
    ReadingStatusType,
    Tag,
    User,
    UserChapterRead,
    UserMangaReadingHistory,
    UserReadingStatus,
    UserRole,
)
from app.workers.recsys_engine import (
    get_content_based_recommendations,
    get_item_based_recommendations,
    get_user_based_recommendations,
)


def _serialize_manga_summary(m: Manga, tags: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "pool_manga_id": m.pool_manga_id,
        "slug": m.slug,
        "title": m.title,
        "alt_titles": m.alt_titles,
        "status": m.status.value,
        "content_rating": m.content_rating.value,
        "publication_demographic": m.publication_demographic.value,
        "original_language": m.original_language,
        "year": m.year,
        "cover_url": storage_service.build_media_url(m.cover_bucket, m.cover_object_key),
        "chapter_count": m.chapter_count,
        "view_count": int(m.view_count),
        "average_rating": float(m.average_rating),
        "rating_count": int(m.rating_count),
        "comment_count": int(m.comment_count),
        "latest_chapter_published_at": (
            m.latest_chapter_published_at.isoformat() if m.latest_chapter_published_at else None
        ),
        "tags": tags or [],
    }


def _check_age_restriction(caller: User | None, rating: ContentRating | None) -> None:
    """UC-6.2 BR3 & UC-3.2: Require age >= 18 for erotica/pornographic content rating filter."""
    if rating not in (ContentRating.erotica, ContentRating.pornographic):
        return
    if caller is None or caller.birth_date is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vui lòng đăng nhập và cập nhật ngày sinh (đủ 18 tuổi) để xem nội dung giới hạn độ tuổi.",
        )
    today = datetime.now(timezone.utc).date()
    bdate = caller.birth_date
    age = today.year - bdate.year - ((today.month, today.day) < (bdate.month, bdate.day))
    if age < 18:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn chưa đủ 18 tuổi để truy cập nội dung này.",
        )


class MangaDiscoveryService:
    """Domain service for Module 3 use cases (UC-3.1 -> UC-3.11)."""

    async def list_and_filter_mangas(
        self,
        db: AsyncSession,
        caller: User | None,
        page: int = 1,
        sort_by: str = "latest_update",
        include_tags: str | None = None,
        include_mode: str = "AND",
        exclude_tags: str | None = None,
        demographic: PublicationDemographic | None = None,
        pub_status: PublicationStatus | None = None,
        original_language: str | None = None,
        year: int | None = None,
        content_rating: ContentRating | None = None,
    ) -> dict[str, Any]:
        """UC-3.1 & UC-3.2: Fixed 24 items/page catalog with multi-criteria AND/OR/NOT tag filtering."""
        _check_age_restriction(caller, content_rating)
        page_size = 24  # UC-3.1 BR1: Fixed 24 mangas per page

        conditions = [Manga.visibility_status == MangaVisibilityStatus.public]
        if demographic is not None:
            conditions.append(Manga.publication_demographic == demographic)
        if pub_status is not None:
            conditions.append(Manga.status == pub_status)
        if original_language:
            conditions.append(Manga.original_language == original_language.lower())
        if year is not None:
            conditions.append(Manga.year == year)
        if content_rating is not None:
            conditions.append(Manga.content_rating == content_rating)

        inc_list = [s.strip().lower() for s in (include_tags or "").split(",") if s.strip()]
        exc_list = [s.strip().lower() for s in (exclude_tags or "").split(",") if s.strip()]

        if inc_list:
            if include_mode.upper() == "OR":
                subq_inc = select(MangaTag.manga_id).join(Tag, Tag.id == MangaTag.tag_id).where(Tag.slug.in_(inc_list))
                conditions.append(Manga.pool_manga_id.in_(subq_inc))
            else:
                # AND mode: manga must have all included tags
                subq_inc = (
                    select(MangaTag.manga_id)
                    .join(Tag, Tag.id == MangaTag.tag_id)
                    .where(Tag.slug.in_(inc_list))
                    .group_by(MangaTag.manga_id)
                    .having(func.count(func.distinct(Tag.slug)) == len(set(inc_list)))
                )
                conditions.append(Manga.pool_manga_id.in_(subq_inc))

        if exc_list:
            subq_exc = select(MangaTag.manga_id).join(Tag, Tag.id == MangaTag.tag_id).where(Tag.slug.in_(exc_list))
            conditions.append(Manga.pool_manga_id.not_in(subq_exc))

        total = int((await db.execute(select(func.count(Manga.pool_manga_id)).where(*conditions))).scalar_one() or 0)

        stmt = select(Manga).where(*conditions)
        if sort_by == "views":
            stmt = stmt.order_by(desc(Manga.view_count), desc(Manga.pool_manga_id))
        elif sort_by == "rating":
            stmt = stmt.order_by(desc(Manga.average_rating), desc(Manga.rating_count))
        elif sort_by == "title_asc":
            stmt = stmt.order_by(asc(Manga.title))
        else:
            stmt = stmt.order_by(desc(Manga.latest_chapter_published_at), desc(Manga.updated_at))

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        rows = (await db.execute(stmt)).scalars().all()

        return {
            "items": [_serialize_manga_summary(m) for m in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def search_mangas(
        self,
        db: AsyncSession,
        query_str: str,
        limit: int = 24,
    ) -> dict[str, Any]:
        """UC-3.3: Accent-insensitive & Fuzzy Trigram search across title and alt_titles."""
        q_clean = query_str.strip()
        if not q_clean:
            return {"query": "", "items": []}

        q_unaccent = strip_accents(q_clean.lower())
        public_mangas = (
            (await db.execute(select(Manga).where(Manga.visibility_status == MangaVisibilityStatus.public)))
            .scalars()
            .all()
        )

        scored: list[tuple[float, Manga]] = []
        q_tokens = set(q_unaccent.split())

        for m in public_mangas:
            candidates = [m.title] + [str(t) for t in (m.alt_titles or [])]
            best_score = 0.0
            for text_val in candidates:
                norm = strip_accents(text_val.lower())
                if q_unaccent == norm:
                    best_score = max(best_score, 1.0)
                elif q_unaccent in norm:
                    best_score = max(best_score, 0.85)
                else:
                    # Token & trigram overlap
                    c_tokens = set(norm.split())
                    if q_tokens and q_tokens.issubset(c_tokens):
                        best_score = max(best_score, 0.78)
                    else:
                        # Character 3-gram Jaccard similarity for typo tolerance
                        s1 = f"  {q_unaccent} "
                        s2 = f"  {norm} "
                        g1 = {s1[i : i + 3] for i in range(max(1, len(s1) - 2))}
                        g2 = {s2[i : i + 3] for i in range(max(1, len(s2) - 2))}
                        inter = len(g1 & g2)
                        union = len(g1 | g2)
                        sim = inter / union if union else 0.0
                        if sim >= 0.22:
                            best_score = max(best_score, round(sim, 3))

            if best_score > 0:
                scored.append((best_score, m))

        scored.sort(key=lambda x: (x[0], int(x[1].view_count), float(x[1].average_rating)), reverse=True)
        return {
            "query": q_clean,
            "items": [
                {
                    **_serialize_manga_summary(m),
                    "match_score": sc,
                }
                for sc, m in scored[:limit]
            ],
        }

    async def list_creators(
        self,
        db: AsyncSession,
        q: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """UC-3.4: Search authors/artists by name or slug."""
        all_creators = (await db.execute(select(Creator).order_by(asc(Creator.name)))).scalars().all()
        if q and q.strip():
            q_norm = strip_accents(q.strip().lower())
            all_creators = [
                c for c in all_creators if q_norm in strip_accents(c.name.lower()) or q_norm in c.slug.lower()
            ]
        total = len(all_creators)
        sliced = all_creators[(page - 1) * page_size : page * page_size]
        return {
            "items": [
                {
                    "creator_id": c.creator_id,
                    "slug": c.slug,
                    "name": c.name,
                    "biography": c.biography,
                    "links": c.links,
                }
                for c in sliced
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def get_creator_detail(
        self,
        db: AsyncSession,
        creator_id: str,
        tag_slug: str | None = None,
        pub_status: PublicationStatus | None = None,
        sort_by: str = "latest_update",
        page: int = 1,
        page_size: int = 24,
    ) -> dict[str, Any]:
        """UC-3.6: Get author/artist profile and their public works (filtered & paginated)."""
        creator = (
            await db.execute(select(Creator).where(or_(Creator.creator_id == creator_id, Creator.slug == creator_id)))
        ).scalar_one_or_none()
        if creator is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tác giả / họa sĩ.")

        mc_rows = (
            (await db.execute(select(MangaCreator).where(MangaCreator.creator_id == creator.creator_id)))
            .scalars()
            .all()
        )
        roles_by_manga: dict[str, list[str]] = {}
        for mc in mc_rows:
            roles_by_manga.setdefault(mc.manga_id, []).append(mc.role.value)

        manga_ids = list(roles_by_manga.keys())
        works: list[dict[str, Any]] = []
        if manga_ids:
            conds = [
                Manga.pool_manga_id.in_(manga_ids),
                Manga.visibility_status == MangaVisibilityStatus.public,
            ]
            if pub_status is not None:
                conds.append(Manga.status == pub_status)
            if tag_slug:
                subq = (
                    select(MangaTag.manga_id).join(Tag, Tag.id == MangaTag.tag_id).where(Tag.slug == tag_slug.lower())
                )
                conds.append(Manga.pool_manga_id.in_(subq))

            stmt = select(Manga).where(*conds)
            if sort_by == "rating":
                stmt = stmt.order_by(desc(Manga.average_rating))
            elif sort_by == "views":
                stmt = stmt.order_by(desc(Manga.view_count))
            else:
                stmt = stmt.order_by(desc(Manga.latest_chapter_published_at))

            m_rows = (await db.execute(stmt)).scalars().all()
            for m in m_rows[(page - 1) * page_size : page * page_size]:
                item = _serialize_manga_summary(m)
                item["creator_roles"] = sorted(set(roles_by_manga.get(m.pool_manga_id, [])))
                works.append(item)

        return {
            "creator_id": creator.creator_id,
            "slug": creator.slug,
            "name": creator.name,
            "mangadex_id": str(creator.mangadex_id) if creator.mangadex_id else None,
            "biography": creator.biography,
            "links": creator.links,
            "works": works,
            "total_works": len(works),
        }

    async def get_manga_detail(
        self,
        db: AsyncSession,
        id_or_slug: str,
        caller: User | None,
    ) -> dict[str, Any]:
        """UC-3.5: Get full manga metadata, creators, tags, covers, and caller's personal status/rating."""
        manga = (
            await db.execute(select(Manga).where(or_(Manga.pool_manga_id == id_or_slug, Manga.slug == id_or_slug)))
        ).scalar_one_or_none()
        if manga is None or (
            manga.visibility_status == MangaVisibilityStatus.hidden
            and (caller is None or caller.role != UserRole.admin)
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "MANGA_HIDDEN_OR_NOT_FOUND",
                    "message": "Truyện tạm ngừng hiển thị hoặc không tồn tại.",
                },
            )

        # Creators
        cr_rows = (
            await db.execute(
                select(Creator, MangaCreator.role)
                .join(MangaCreator, MangaCreator.creator_id == Creator.creator_id)
                .where(MangaCreator.manga_id == manga.pool_manga_id)
            )
        ).all()
        creators_out = [
            {
                "creator_id": c.creator_id,
                "slug": c.slug,
                "name": c.name,
                "role": role.value,
                "biography": c.biography,
                "links": c.links,
            }
            for c, role in cr_rows
        ]

        # Tags
        tg_rows = (
            (
                await db.execute(
                    select(Tag)
                    .join(MangaTag, MangaTag.tag_id == Tag.id)
                    .where(MangaTag.manga_id == manga.pool_manga_id)
                )
            )
            .scalars()
            .all()
        )
        tags_out = [{"slug": t.slug, "group": t.tag_group.value, "name": t.name} for t in tg_rows]

        # Cover Arts
        ca_rows = (
            (await db.execute(select(MangaCoverArt).where(MangaCoverArt.manga_id == manga.pool_manga_id)))
            .scalars()
            .all()
        )
        covers_out = [
            {
                "cover_id": ca.cover_id,
                "volume": ca.volume,
                "locale": ca.locale,
                "url": storage_service.build_media_url(ca.bucket, ca.object_key),
            }
            for ca in ca_rows
        ]

        my_reading_status: str | None = None
        my_rating: int | None = None
        my_last_read_chapter: dict[str, Any] | None = None

        if caller is not None:
            st_row = (
                await db.execute(
                    select(UserReadingStatus).where(
                        UserReadingStatus.user_id == caller.user_id,
                        UserReadingStatus.manga_id == manga.pool_manga_id,
                    )
                )
            ).scalar_one_or_none()
            if st_row:
                my_reading_status = st_row.status.value

            rt_row = (
                await db.execute(
                    select(MangaRating).where(
                        MangaRating.user_id == caller.user_id,
                        MangaRating.manga_id == manga.pool_manga_id,
                    )
                )
            ).scalar_one_or_none()
            if rt_row:
                my_rating = int(rt_row.score)

            hist_row = (
                await db.execute(
                    select(UserMangaReadingHistory).where(
                        UserMangaReadingHistory.user_id == caller.user_id,
                        UserMangaReadingHistory.manga_id == manga.pool_manga_id,
                    )
                )
            ).scalar_one_or_none()
            if hist_row:
                my_last_read_chapter = {
                    "chapter_id": hist_row.last_read_chapter_id,
                    "page_number": hist_row.last_read_page_number,
                    "is_chapter_completed": hist_row.is_chapter_completed,
                    "last_read_at": hist_row.last_read_at.isoformat(),
                }

        return {
            **_serialize_manga_summary(manga, tags=tags_out),
            "description": manga.description,
            "official_volumes": manga.official_volumes,
            "official_chapters": manga.official_chapters,
            "available_languages": manga.available_languages,
            "external_links": manga.external_links,
            "creators": creators_out,
            "cover_arts": covers_out,
            "visibility_status": manga.visibility_status.value,
            "my_reading_status": my_reading_status,
            "my_rating": my_rating,
            "my_last_read_chapter": my_last_read_chapter,
        }

    async def get_manga_for_recsys(self, db: AsyncSession, manga_id: str) -> Manga:
        manga = (
            await db.execute(select(Manga).where(or_(Manga.pool_manga_id == manga_id, Manga.slug == manga_id)))
        ).scalar_one_or_none()
        if manga is None or manga.visibility_status != MangaVisibilityStatus.public:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ truyện.")
        return manga

    async def set_reading_status(
        self,
        db: AsyncSession,
        user: User,
        manga_id: str,
        status_str: str,
    ) -> dict[str, Any]:
        """UC-3.10: Upsert single reading status per (user, manga)."""
        manga = (await db.execute(select(Manga).where(Manga.pool_manga_id == manga_id))).scalar_one_or_none()
        if manga is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ truyện.")

        st_enum = ReadingStatusType(status_str)
        existing = (
            await db.execute(
                select(UserReadingStatus).where(
                    UserReadingStatus.user_id == user.user_id,
                    UserReadingStatus.manga_id == manga_id,
                )
            )
        ).scalar_one_or_none()

        now = datetime.now(timezone.utc)
        if existing is None:
            existing = UserReadingStatus(
                user_id=user.user_id,
                manga_id=manga_id,
                status=st_enum,
                updated_at=now,
            )
            db.add(existing)
        else:
            existing.status = st_enum
            existing.updated_at = now

        await db.commit()
        return {"user_id": str(user.user_id), "manga_id": manga_id, "status": st_enum.value}

    async def delete_reading_status(
        self,
        db: AsyncSession,
        user: User,
        manga_id: str,
    ) -> dict[str, Any]:
        """UC-3.10: Remove reading status for a manga."""
        await db.execute(
            delete(UserReadingStatus).where(
                UserReadingStatus.user_id == user.user_id,
                UserReadingStatus.manga_id == manga_id,
            )
        )
        await db.commit()
        return {"deleted": True, "manga_id": manga_id}

    async def get_reading_history(
        self,
        db: AsyncSession,
        user: User,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """UC-3.11: Grouped reading history by manga ordered by last_read_at DESC."""
        stmt = (
            select(UserMangaReadingHistory, Manga, Chapter)
            .join(Manga, Manga.pool_manga_id == UserMangaReadingHistory.manga_id)
            .join(Chapter, Chapter.pool_chapter_id == UserMangaReadingHistory.last_read_chapter_id)
            .where(UserMangaReadingHistory.user_id == user.user_id)
            .order_by(desc(UserMangaReadingHistory.last_read_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await db.execute(stmt)).all()

        items: list[dict[str, Any]] = []
        for hist, manga, ch in rows:
            read_ch_ids = (
                (
                    await db.execute(
                        select(UserChapterRead.chapter_id).where(
                            UserChapterRead.user_id == user.user_id,
                            UserChapterRead.manga_id == manga.pool_manga_id,
                        )
                    )
                )
                .scalars()
                .all()
            )
            items.append(
                {
                    "manga_id": manga.pool_manga_id,
                    "slug": manga.slug,
                    "title": manga.title,
                    "is_hidden": manga.visibility_status == MangaVisibilityStatus.hidden,
                    "last_read_chapter_id": ch.pool_chapter_id,
                    "last_read_chapter_number": ch.chapter_number,
                    "last_read_page_number": hist.last_read_page_number,
                    "is_chapter_completed": hist.is_chapter_completed,
                    "last_read_at": hist.last_read_at.isoformat(),
                    "read_chapter_ids": list(read_ch_ids),
                }
            )
        return {"items": items, "page": page, "page_size": page_size}


manga_discovery_service = MangaDiscoveryService()
export_recsys = (
    get_content_based_recommendations,
    get_item_based_recommendations,
    get_user_based_recommendations,
)
