"""Pydantic v2 DTOs for Module 8 (Reading List Items, Batch Add/Remove & List Analytics)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ListItemMangaResponse(BaseModel):
    pool_manga_id: str
    slug: str
    title: str
    status: str
    content_rating: str
    cover_url: str | None = None
    chapter_count: int
    average_rating: float
    is_hidden: bool = False
    tags: list[str] = Field(default_factory=list)
    added_at: datetime


class ListItemsCollectionResponse(BaseModel):
    list_id: uuid.UUID
    total: int
    available_tags_in_list: list[str]
    items: list[ListItemMangaResponse]


class BatchAddMangaRequest(BaseModel):
    manga_id: str = Field(max_length=64)
    list_ids: list[uuid.UUID] = Field(default_factory=list)
    new_list_name: str | None = Field(default=None, max_length=150)


class BatchAddMangaResponse(BaseModel):
    manga_id: str
    added_count: int
    list_ids: list[uuid.UUID]


class TagDistributionItem(BaseModel):
    slug: str
    name: str
    count: int
    percentage: float


class CreatorDistributionItem(BaseModel):
    creator_id: str
    name: str
    count: int


class ReadingListAnalyticsResponse(BaseModel):
    list_id: uuid.UUID
    total_mangas: int
    total_chapters: int
    average_rating: float
    status_distribution: dict[str, int]
    tag_distribution: list[TagDistributionItem]
    top_creators: list[CreatorDistributionItem]
