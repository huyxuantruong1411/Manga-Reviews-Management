"""Domain Service for Module 4: Manga Reader, Chapter List/Filter, Continue Reading, Ratings & Reports."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import asc, desc, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import acquire_view_count_slot, check_and_increment_rate_limit
from app.core.sanitization import sanitize_plain_text
from app.core.storage import storage_service
from app.models import (
    Chapter,
    ChapterPage,
    Manga,
    MangaDailyMetric,
    MangaRating,
    MangaRatingHistory,
    MangaVisibilityStatus,
    Report,
    ReportStatus,
    ReportTargetType,
    User,
    UserActivityLog,
    UserChapterRead,
    UserMangaReadingHistory,
    UserRole,
)
from app.modules.mod4_manga_reader.schemas import (
    ChapterItemResponse,
    ChapterListResponse,
    ChapterPagesResponse,
    ContinueReadingResponse,
    MangaReportCreateRequest,
    PageRenderItem,
    RatingActionResponse,
    RatingHistoryItemResponse,
    RatingHistoryListResponse,
    RatingUpsertRequest,
    ReaderSettingsUpdateRequest,
    ReadingProgressRequest,
    ReadingProgressResponse,
)


class MangaReaderService:
    """Pure business logic for Module 4 (UC-4.1 -> UC-4.9)."""

    @staticmethod
    async def _get_accessible_manga(db: AsyncSession, manga_id: str, viewer: User | None) -> Manga:
        manga = await db.get(Manga, manga_id)
        if manga is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ truyện.")
        is_staff = viewer is not None and viewer.role in (UserRole.admin, UserRole.moderator)
        if manga.visibility_status == MangaVisibilityStatus.hidden and not is_staff:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Truyện hiện đang tạm ẩn và không thể truy cập.",
            )
        return manga

    @staticmethod
    async def list_chapters(
        db: AsyncSession,
        manga_id: str,
        viewer: User | None = None,
        sort_order: str = "desc",
        q_chapter_number: str | None = None,
        language: str | None = None,
        scanlation_group: str | None = None,
        volume: str | None = None,
        read_status: str | None = None,
    ) -> ChapterListResponse:
        """UC-4.1 & UC-4.2: List, sort, and filter chapters (including decimal chapter_number like '10.5')."""
        await MangaReaderService._get_accessible_manga(db, manga_id, viewer)

        stmt = select(Chapter).where(Chapter.manga_id == manga_id)
        if q_chapter_number:
            q_clean = q_chapter_number.strip()
            stmt = stmt.where(Chapter.chapter_number.ilike(f"%{q_clean}%"))
        if language:
            stmt = stmt.where(Chapter.language == language.strip().lower())
        if scanlation_group:
            stmt = stmt.where(Chapter.scanlation_group.ilike(f"%{scanlation_group.strip()}%"))
        if volume:
            stmt = stmt.where(Chapter.volume == volume.strip())

        order_col = asc(Chapter.chapter_numeric) if sort_order == "asc" else desc(Chapter.chapter_numeric)
        stmt = stmt.order_by(order_col, asc(Chapter.pool_chapter_id))

        chapters = (await db.execute(stmt)).scalars().all()

        read_map: dict[str, UserChapterRead] = {}
        if viewer is not None:
            reads = (
                (
                    await db.execute(
                        select(UserChapterRead).where(
                            UserChapterRead.user_id == viewer.user_id,
                            UserChapterRead.manga_id == manga_id,
                        )
                    )
                )
                .scalars()
                .all()
            )
            read_map = {r.chapter_id: r for r in reads}

        items: list[ChapterItemResponse] = []
        for ch in chapters:
            r_entry = read_map.get(ch.pool_chapter_id)
            is_read = r_entry is not None
            if read_status == "read" and not is_read:
                continue
            if read_status == "unread" and is_read:
                continue

            items.append(
                ChapterItemResponse(
                    pool_chapter_id=ch.pool_chapter_id,
                    pool_manga_id=ch.manga_id,
                    chapter_number=ch.chapter_number,
                    chapter_numeric=float(ch.chapter_numeric),
                    volume=ch.volume,
                    title=ch.title,
                    language=ch.language,
                    scanlation_group=ch.scanlation_group,
                    publish_at=ch.publish_at,
                    page_count=ch.page_count,
                    view_count=ch.view_count,
                    is_read=is_read,
                    last_read_page_number=r_entry.last_page_number if r_entry else 1,
                    is_completed=r_entry.is_completed if r_entry else False,
                )
            )

        return ChapterListResponse(manga_id=manga_id, total=len(items), items=items)

    @staticmethod
    async def read_from_beginning(
        db: AsyncSession,
        manga_id: str,
        viewer: User | None = None,
    ) -> ContinueReadingResponse:
        """UC-4.5: Return lowest chapter_numeric chapter at page 1."""
        await MangaReaderService._get_accessible_manga(db, manga_id, viewer)
        first_ch = (
            await db.execute(
                select(Chapter)
                .where(Chapter.manga_id == manga_id)
                .order_by(asc(Chapter.chapter_numeric), asc(Chapter.pool_chapter_id))
                .limit(1)
            )
        ).scalar_one_or_none()

        if first_ch is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Truyện hiện chưa có chương nào được phát hành.",
            )

        return ContinueReadingResponse(
            manga_id=manga_id,
            chapter_id=first_ch.pool_chapter_id,
            chapter_number=first_ch.chapter_number,
            page_number=1,
            caught_up=False,
        )

    @staticmethod
    async def continue_reading(
        db: AsyncSession,
        manga_id: str,
        viewer: User,
    ) -> ContinueReadingResponse:
        """UC-4.6: Smart Continue Reading state machine."""
        await MangaReaderService._get_accessible_manga(db, manga_id, viewer)

        hist = (
            await db.execute(
                select(UserMangaReadingHistory).where(
                    UserMangaReadingHistory.user_id == viewer.user_id,
                    UserMangaReadingHistory.manga_id == manga_id,
                )
            )
        ).scalar_one_or_none()

        if hist is None or hist.last_read_chapter_id is None:
            return await MangaReaderService.read_from_beginning(db, manga_id, viewer)

        last_ch = await db.get(Chapter, hist.last_read_chapter_id)
        if last_ch is None:
            return await MangaReaderService.read_from_beginning(db, manga_id, viewer)

        if not hist.is_chapter_completed:
            return ContinueReadingResponse(
                manga_id=manga_id,
                chapter_id=last_ch.pool_chapter_id,
                chapter_number=last_ch.chapter_number,
                page_number=max(1, hist.last_read_page_number),
                caught_up=False,
            )

        # Last chapter completed -> check if there is a next chapter
        next_ch = (
            await db.execute(
                select(Chapter)
                .where(
                    Chapter.manga_id == manga_id,
                    Chapter.chapter_numeric > last_ch.chapter_numeric,
                )
                .order_by(asc(Chapter.chapter_numeric), asc(Chapter.pool_chapter_id))
                .limit(1)
            )
        ).scalar_one_or_none()

        if next_ch is not None:
            return ContinueReadingResponse(
                manga_id=manga_id,
                chapter_id=next_ch.pool_chapter_id,
                chapter_number=next_ch.chapter_number,
                page_number=1,
                caught_up=False,
            )

        return ContinueReadingResponse(
            manga_id=manga_id,
            chapter_id=last_ch.pool_chapter_id,
            chapter_number=last_ch.chapter_number,
            page_number=1,
            caught_up=True,
            message="Bạn đã đọc đến chương mới nhất.",
        )

    @staticmethod
    async def get_chapter_pages(
        db: AsyncSession,
        chapter_id: str,
        viewer: User | None = None,
    ) -> ChapterPagesResponse:
        """UC-4.3: Return ordered pages with MinIO URLs and prev/next chapter navigation."""
        chapter = await db.get(Chapter, chapter_id)
        if chapter is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy chương truyện.")

        await MangaReaderService._get_accessible_manga(db, chapter.manga_id, viewer)

        pages = (
            (
                await db.execute(
                    select(ChapterPage)
                    .where(ChapterPage.chapter_id == chapter_id)
                    .order_by(asc(ChapterPage.page_number))
                )
            )
            .scalars()
            .all()
        )

        prev_ch = (
            await db.execute(
                select(Chapter.pool_chapter_id)
                .where(
                    Chapter.manga_id == chapter.manga_id,
                    Chapter.chapter_numeric < chapter.chapter_numeric,
                )
                .order_by(desc(Chapter.chapter_numeric))
                .limit(1)
            )
        ).scalar_one_or_none()

        next_ch = (
            await db.execute(
                select(Chapter.pool_chapter_id)
                .where(
                    Chapter.manga_id == chapter.manga_id,
                    Chapter.chapter_numeric > chapter.chapter_numeric,
                )
                .order_by(asc(Chapter.chapter_numeric))
                .limit(1)
            )
        ).scalar_one_or_none()

        default_settings = {
            "reading_mode": "vertical_scroll",
            "reading_direction": "ltr",
            "fit_mode": "fit_width",
            "background_color": "dark",
            "preload_pages": 3,
        }
        raw_settings = dict(viewer.reader_settings) if (viewer and viewer.reader_settings) else {}
        mode_map = {
            "vertical": "vertical_scroll",
            "paged": "single_page",
            "single": "single_page",
            "double": "double_page",
        }
        fit_map = {"width": "fit_width", "height": "fit_height"}
        raw_mode = str(raw_settings.get("reading_mode", default_settings["reading_mode"]))
        raw_dir = str(
            raw_settings.get("reading_direction")
            or raw_settings.get("direction")
            or default_settings["reading_direction"]
        )
        raw_fit = str(raw_settings.get("fit_mode", default_settings["fit_mode"]))
        reader_settings = {
            "reading_mode": mode_map.get(
                raw_mode,
                raw_mode
                if raw_mode in ("vertical_scroll", "single_page", "double_page")
                else default_settings["reading_mode"],
            ),
            "reading_direction": raw_dir if raw_dir in ("ltr", "rtl") else default_settings["reading_direction"],
            "fit_mode": fit_map.get(
                raw_fit, raw_fit if raw_fit in ("fit_width", "fit_height", "original") else default_settings["fit_mode"]
            ),
            "background_color": raw_settings.get("background_color")
            if raw_settings.get("background_color") in ("dark", "black", "light", "sepia")
            else default_settings["background_color"],
            "preload_pages": int(raw_settings.get("preload_pages", default_settings["preload_pages"])),
        }

        return ChapterPagesResponse(
            pool_chapter_id=chapter.pool_chapter_id,
            pool_manga_id=chapter.manga_id,
            chapter_number=chapter.chapter_number,
            title=chapter.title,
            page_count=chapter.page_count,
            prev_chapter_id=prev_ch,
            next_chapter_id=next_ch,
            reader_settings=reader_settings,
            pages=[
                PageRenderItem(
                    page_uid=p.page_uid,
                    page_number=p.page_number,
                    filename=p.filename,
                    image_url=storage_service.build_media_url(p.bucket, p.object_key),
                    width=p.width,
                    height=p.height,
                )
                for p in pages
            ],
        )

    @staticmethod
    async def record_reading_progress(
        db: AsyncSession,
        chapter_id: str,
        viewer: User,
        payload: ReadingProgressRequest,
        client_ip: str = "127.0.0.1",
    ) -> ReadingProgressResponse:
        """UC-4.3 & UC-2.5 BR1: Upsert reading history and count anti-F5 valid view."""
        chapter = await db.get(Chapter, chapter_id)
        if chapter is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy chương truyện.")
        manga = await MangaReaderService._get_accessible_manga(db, chapter.manga_id, viewer)

        now = datetime.now(timezone.utc)
        clamped_page = min(max(1, payload.page_number), max(1, chapter.page_count))
        is_completed = payload.is_completed or (clamped_page >= chapter.page_count)

        # Upsert UserChapterRead
        existing_read = (
            await db.execute(
                select(UserChapterRead).where(
                    UserChapterRead.user_id == viewer.user_id,
                    UserChapterRead.chapter_id == chapter_id,
                )
            )
        ).scalar_one_or_none()

        if existing_read is None:
            db.add(
                UserChapterRead(
                    user_id=viewer.user_id,
                    manga_id=chapter.manga_id,
                    chapter_id=chapter_id,
                    last_page_number=clamped_page,
                    is_completed=is_completed,
                    read_count=1,
                    first_read_at=now,
                    last_read_at=now,
                )
            )
        else:
            existing_read.last_page_number = clamped_page
            existing_read.is_completed = existing_read.is_completed or is_completed
            existing_read.read_count += 1
            existing_read.last_read_at = now

        # Upsert UserMangaReadingHistory
        existing_hist = (
            await db.execute(
                select(UserMangaReadingHistory).where(
                    UserMangaReadingHistory.user_id == viewer.user_id,
                    UserMangaReadingHistory.manga_id == chapter.manga_id,
                )
            )
        ).scalar_one_or_none()

        if existing_hist is None:
            db.add(
                UserMangaReadingHistory(
                    user_id=viewer.user_id,
                    manga_id=chapter.manga_id,
                    last_read_chapter_id=chapter_id,
                    last_read_page_number=clamped_page,
                    is_chapter_completed=is_completed,
                    first_read_at=now,
                    last_read_at=now,
                )
            )
        else:
            existing_hist.last_read_chapter_id = chapter_id
            existing_hist.last_read_page_number = clamped_page
            existing_hist.is_chapter_completed = is_completed
            existing_hist.last_read_at = now

        # Anti-F5 View Count Filter: requires dwell_seconds >= 10 OR pages_read_count >= 2
        view_counted = False
        if payload.dwell_seconds >= 10 or payload.pages_read_count >= 2:
            viewer_key = str(viewer.user_id) if viewer else client_ip
            slot_acquired = await acquire_view_count_slot(viewer_key, chapter_id)
            if slot_acquired:
                view_counted = True
                chapter.view_count += 1
                manga.view_count += 1
                today = now.date()
                metric_stmt = (
                    pg_insert(MangaDailyMetric)
                    .values(
                        manga_id=manga.pool_manga_id,
                        metric_date=today,
                        views=1,
                        list_adds=0,
                        ratings_count=0,
                        comments_count=0,
                    )
                    .on_conflict_do_update(
                        index_elements=["metric_date", "manga_id"],
                        set_={"views": MangaDailyMetric.views + 1},
                    )
                )
                await db.execute(metric_stmt)

        db.add(
            UserActivityLog(
                user_id=viewer.user_id,
                action_type="read_chapter",
                target_type="chapter",
                target_id=chapter_id,
                metadata_={
                    "manga_id": manga.pool_manga_id,
                    "page_number": clamped_page,
                    "is_completed": is_completed,
                    "view_counted": view_counted,
                },
            )
        )

        await db.commit()
        return ReadingProgressResponse(
            pool_chapter_id=chapter_id,
            pool_manga_id=manga.pool_manga_id,
            last_read_page_number=clamped_page,
            is_completed=is_completed,
            view_counted=view_counted,
        )

    @staticmethod
    async def update_reader_settings(
        db: AsyncSession,
        viewer: User,
        payload: ReaderSettingsUpdateRequest,
    ) -> dict[str, Any]:
        """UC-4.4: Persist personalized reader UI preferences."""
        settings_dict = payload.model_dump()
        viewer.reader_settings = settings_dict
        await db.commit()
        return settings_dict

    @staticmethod
    async def _recalculate_manga_rating_stats(db: AsyncSession, manga: Manga) -> None:
        stats_row = (
            await db.execute(
                select(
                    func.count(MangaRating.score),
                    func.coalesce(func.avg(MangaRating.score), 0),
                ).where(MangaRating.manga_id == manga.pool_manga_id)
            )
        ).one()
        count_val = int(stats_row[0] or 0)
        avg_val = round(float(stats_row[1] or 0.0), 2)
        manga.rating_count = count_val
        manga.average_rating = Decimal(str(avg_val))

    @staticmethod
    async def upsert_rating(
        db: AsyncSession,
        manga_id: str,
        viewer: User,
        payload: RatingUpsertRequest,
    ) -> RatingActionResponse:
        """UC-4.7 & UC-4.8: Mandatory reading history check before rating; record rating history."""
        manga = await MangaReaderService._get_accessible_manga(db, manga_id, viewer)

        # Mandatory check from Activity Diagram 4.7: User MUST have read at least 1 chapter of this manga
        has_read_count = (
            await db.execute(
                select(func.count(UserChapterRead.chapter_id)).where(
                    UserChapterRead.user_id == viewer.user_id,
                    UserChapterRead.manga_id == manga_id,
                )
            )
        ).scalar_one()

        if int(has_read_count or 0) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bạn cần đọc truyện trước khi chấm điểm.",
            )

        existing = (
            await db.execute(
                select(MangaRating).where(
                    MangaRating.user_id == viewer.user_id,
                    MangaRating.manga_id == manga_id,
                )
            )
        ).scalar_one_or_none()

        if existing is None:
            action: str = "create"
            old_score = None
            rating = MangaRating(
                user_id=viewer.user_id,
                manga_id=manga_id,
                score=payload.score,
            )
            db.add(rating)
        else:
            action = "update"
            old_score = existing.score
            existing.score = payload.score

        db.add(
            MangaRatingHistory(
                user_id=viewer.user_id,
                manga_id=manga_id,
                old_score=old_score,
                new_score=payload.score,
                action=action,
            )
        )
        db.add(
            UserActivityLog(
                user_id=viewer.user_id,
                action_type="rate_manga",
                target_type="manga",
                target_id=manga_id,
                metadata_={"action": action, "old_score": old_score, "new_score": payload.score},
            )
        )

        await db.flush()
        await MangaReaderService._recalculate_manga_rating_stats(db, manga)
        await db.commit()
        await db.refresh(manga)

        return RatingActionResponse(
            manga_id=manga_id,
            user_score=payload.score,
            average_rating=float(manga.average_rating),
            rating_count=manga.rating_count,
            action=action,  # type: ignore[arg-type]
        )

    @staticmethod
    async def delete_rating(
        db: AsyncSession,
        manga_id: str,
        viewer: User,
    ) -> RatingActionResponse:
        """UC-4.8: Remove user rating, record 'delete' in rating history, and recalculate stats."""
        manga = await MangaReaderService._get_accessible_manga(db, manga_id, viewer)

        existing = (
            await db.execute(
                select(MangaRating).where(
                    MangaRating.user_id == viewer.user_id,
                    MangaRating.manga_id == manga_id,
                )
            )
        ).scalar_one_or_none()

        if existing is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bạn chưa chấm điểm bộ truyện này.",
            )

        old_score = existing.score
        await db.delete(existing)
        db.add(
            MangaRatingHistory(
                user_id=viewer.user_id,
                manga_id=manga_id,
                old_score=old_score,
                new_score=None,
                action="delete",
            )
        )
        await db.flush()
        await MangaReaderService._recalculate_manga_rating_stats(db, manga)
        await db.commit()
        await db.refresh(manga)

        return RatingActionResponse(
            manga_id=manga_id,
            user_score=None,
            average_rating=float(manga.average_rating),
            rating_count=manga.rating_count,
            action="delete",
        )

    @staticmethod
    async def get_user_rating_history(
        db: AsyncSession,
        viewer: User,
    ) -> RatingHistoryListResponse:
        """UC-4.8: Retrieve chronological rating history of current user."""
        stmt = (
            select(MangaRatingHistory, Manga.title)
            .join(Manga, Manga.pool_manga_id == MangaRatingHistory.manga_id)
            .where(MangaRatingHistory.user_id == viewer.user_id)
            .order_by(desc(MangaRatingHistory.history_id))
        )
        rows = (await db.execute(stmt)).all()
        return RatingHistoryListResponse(
            items=[
                RatingHistoryItemResponse(
                    history_id=h.history_id,
                    pool_manga_id=h.manga_id,
                    manga_title=title,
                    old_score=h.old_score,
                    new_score=h.new_score,
                    action=h.action,
                    changed_at=h.created_at,
                )
                for h, title in rows
            ]
        )

    @staticmethod
    async def report_manga(
        db: AsyncSession,
        manga_id: str,
        viewer: User,
        payload: MangaReportCreateRequest,
    ) -> dict[str, Any]:
        """UC-4.9: Report manga error; auto-ignore if manga.ignore_future_reports is True."""
        manga = await db.get(Manga, manga_id)
        if manga is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ truyện.")

        within_limit = await check_and_increment_rate_limit(
            scope="report_manga",
            identifier=str(viewer.user_id),
            max_requests=10,
            window_seconds=3600,
        )
        if not within_limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Bạn đã gửi quá nhiều báo cáo trong thời gian ngắn.",
            )

        initial_status = ReportStatus.ignored if manga.ignore_future_reports else ReportStatus.pending
        desc_clean = sanitize_plain_text(payload.description) if payload.description else ""

        report = Report(
            reporter_id=viewer.user_id,
            target_type=ReportTargetType.manga,
            target_manga_id=manga_id,
            target_chapter_id=payload.chapter_id,
            reason_category=payload.reason_code,
            description=desc_clean,
            status=initial_status,
        )
        db.add(report)
        db.add(
            UserActivityLog(
                user_id=viewer.user_id,
                action_type="report_manga",
                target_type="manga",
                target_id=manga_id,
                metadata_={
                    "chapter_id": payload.chapter_id,
                    "reason_code": payload.reason_code,
                    "status": initial_status.value,
                },
            )
        )
        await db.commit()
        await db.refresh(report)
        return {
            "report_id": str(report.report_id),
            "status": report.status.value,
            "message": "Đã ghi nhận báo cáo truyện thành công.",
        }
