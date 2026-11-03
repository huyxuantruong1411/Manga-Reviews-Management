"""FastAPI Router for Module 4: Manga Reader, Chapter List/Filter, Continue Reading, Ratings & Reports."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, get_optional_user
from app.models import User
from app.modules.mod4_manga_reader.schemas import (
    ChapterListResponse,
    ChapterPagesResponse,
    ContinueReadingResponse,
    MangaReportCreateRequest,
    RatingActionResponse,
    RatingHistoryListResponse,
    RatingUpsertRequest,
    ReaderSettingsUpdateRequest,
    ReadingProgressRequest,
    ReadingProgressResponse,
)
from app.modules.mod4_manga_reader.service import MangaReaderService

router = APIRouter(prefix="/api/v1", tags=["Module 4 - Manga Reader & Ratings"])


@router.get("/mangas/{manga_id}/chapters", response_model=ChapterListResponse)
async def list_chapters(
    manga_id: str,
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    q_chapter_number: str | None = Query(default=None),
    language: str | None = Query(default=None),
    scanlation_group: str | None = Query(default=None),
    volume: str | None = Query(default=None),
    read_status: str | None = Query(default=None, pattern="^(read|unread)$"),
    viewer: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> ChapterListResponse:
    """UC-4.1 & UC-4.2: List, sort, and filter chapters of a manga."""
    return await MangaReaderService.list_chapters(
        db=db,
        manga_id=manga_id,
        viewer=viewer,
        sort_order=sort_order,
        q_chapter_number=q_chapter_number,
        language=language,
        scanlation_group=scanlation_group,
        volume=volume,
        read_status=read_status,
    )


@router.get("/mangas/{manga_id}/read-first", response_model=ContinueReadingResponse)
async def read_from_beginning(
    manga_id: str,
    viewer: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> ContinueReadingResponse:
    """UC-4.5: Start reading from the lowest numbered chapter at page 1."""
    return await MangaReaderService.read_from_beginning(db, manga_id, viewer)


@router.get("/mangas/{manga_id}/continue-reading", response_model=ContinueReadingResponse)
async def continue_reading(
    manga_id: str,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContinueReadingResponse:
    """UC-4.6: Smart Continue Reading navigation based on user reading history."""
    return await MangaReaderService.continue_reading(db, manga_id, viewer)


@router.get("/chapters/{chapter_id}/pages", response_model=ChapterPagesResponse)
async def get_chapter_pages(
    chapter_id: str,
    viewer: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> ChapterPagesResponse:
    """UC-4.3: Fetch ordered chapter page manifest and reader preferences."""
    return await MangaReaderService.get_chapter_pages(db, chapter_id, viewer)


@router.post("/chapters/{chapter_id}/progress", response_model=ReadingProgressResponse)
async def record_reading_progress(
    chapter_id: str,
    payload: ReadingProgressRequest,
    request: Request,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadingProgressResponse:
    """UC-4.3 & UC-2.5: Record reading progress and count valid anti-F5 view."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    return await MangaReaderService.record_reading_progress(db, chapter_id, viewer, payload, client_ip)


@router.put("/users/me/reader-settings")
async def update_reader_settings(
    payload: ReaderSettingsUpdateRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """UC-4.4: Save personalized reader settings."""
    return await MangaReaderService.update_reader_settings(db, viewer, payload)


@router.post("/mangas/{manga_id}/ratings", response_model=RatingActionResponse)
async def upsert_rating(
    manga_id: str,
    payload: RatingUpsertRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RatingActionResponse:
    """UC-4.7 & UC-4.8: Rate or update rating (requires prior chapter reading history)."""
    return await MangaReaderService.upsert_rating(db, manga_id, viewer, payload)


@router.delete("/mangas/{manga_id}/ratings", response_model=RatingActionResponse)
async def delete_rating(
    manga_id: str,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RatingActionResponse:
    """UC-4.8: Delete user's rating for a manga."""
    return await MangaReaderService.delete_rating(db, manga_id, viewer)


@router.get("/users/me/rating-history", response_model=RatingHistoryListResponse)
async def get_my_rating_history(
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RatingHistoryListResponse:
    """UC-4.8: View user's chronological rating change history."""
    return await MangaReaderService.get_user_rating_history(db, viewer)


@router.post("/mangas/{manga_id}/reports", status_code=status.HTTP_201_CREATED)
async def report_manga(
    manga_id: str,
    payload: MangaReportCreateRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """UC-4.9: Report an issue with a manga or chapter."""
    return await MangaReaderService.report_manga(db, manga_id, viewer, payload)
