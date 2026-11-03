"""Pydantic v2 DTOs for Module 4 (Manga Reader, Chapter Filter, Progress, Ratings, Reports)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class ChapterItemResponse(BaseModel):
    pool_chapter_id: str
    pool_manga_id: str
    chapter_number: str
    chapter_numeric: float
    volume: str | None = None
    title: str | None = None
    language: str
    scanlation_group: str | None = None
    publish_at: datetime | None = None
    page_count: int
    view_count: int
    is_read: bool = False
    last_read_page_number: int = 1
    is_completed: bool = False


class ChapterListResponse(BaseModel):
    manga_id: str
    total: int
    items: list[ChapterItemResponse]


class ContinueReadingResponse(BaseModel):
    manga_id: str
    chapter_id: str
    chapter_number: str
    page_number: int
    caught_up: bool = False
    message: str | None = None


class PageRenderItem(BaseModel):
    page_uid: str
    page_number: int
    filename: str
    image_url: str
    width: int | None = None
    height: int | None = None


class ChapterPagesResponse(BaseModel):
    pool_chapter_id: str
    pool_manga_id: str
    chapter_number: str
    title: str | None = None
    page_count: int
    prev_chapter_id: str | None = None
    next_chapter_id: str | None = None
    reader_settings: dict[str, Any]
    pages: list[PageRenderItem]


class ReadingProgressRequest(BaseModel):
    page_number: int = Field(default=1, ge=1)
    is_completed: bool = False
    dwell_seconds: int = Field(default=0, ge=0)
    pages_read_count: int = Field(default=1, ge=0)


class ReadingProgressResponse(BaseModel):
    pool_chapter_id: str
    pool_manga_id: str
    last_read_page_number: int
    is_completed: bool
    view_counted: bool


class ReaderSettingsUpdateRequest(BaseModel):
    reading_mode: Literal["vertical_scroll", "single_page", "double_page"] = "vertical_scroll"
    reading_direction: Literal["ltr", "rtl"] = "ltr"
    fit_mode: Literal["fit_width", "fit_height", "original"] = "fit_width"
    background_color: Literal["dark", "black", "light", "sepia"] = "dark"
    preload_pages: int = Field(default=3, ge=0, le=10)


class RatingUpsertRequest(BaseModel):
    score: int = Field(ge=1, le=10)


class RatingActionResponse(BaseModel):
    manga_id: str
    user_score: int | None
    average_rating: float
    rating_count: int
    action: Literal["create", "update", "delete"]


class RatingHistoryItemResponse(BaseModel):
    history_id: int
    pool_manga_id: str
    manga_title: str
    old_score: int | None
    new_score: int | None
    action: str
    changed_at: datetime


class RatingHistoryListResponse(BaseModel):
    items: list[RatingHistoryItemResponse]


class MangaReportCreateRequest(BaseModel):
    chapter_id: str | None = Field(default=None, max_length=64)
    reason_code: Literal["broken_images", "wrong_chapter_order", "inappropriate_content", "copyright", "other"]
    description: str | None = Field(default=None, max_length=1000)
