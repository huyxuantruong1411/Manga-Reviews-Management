"""Pydantic v2 Schemas matching 100% with manga_reader_contract_v2.schema.json."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ReaderMediaRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bucket: str = Field(..., min_length=1, max_length=63)
    object_key: str = Field(..., min_length=1)
    content_type: str | None = None
    width: int | None = Field(default=None, ge=1)
    height: int | None = Field(default=None, ge=1)
    file_size: int = Field(default=0, ge=0)
    md5_hash: str | None = None
    sha256: str | None = None


class ReaderCreator(BaseModel):
    model_config = ConfigDict(extra="forbid")

    creator_id: str = Field(..., min_length=1)
    slug: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    role: Literal["author", "artist"]
    mangadex_id: str | None = None
    biography: dict[str, str] = Field(default_factory=dict)
    links: dict[str, str] = Field(default_factory=dict)


class ReaderTag(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str = Field(..., min_length=1)
    source_tag_id: str | None = None
    mangadex_id: str | None = None
    group: Literal["genre", "theme", "format", "content", "other"] = "genre"
    name: dict[str, str]


class ReaderLink(BaseModel):
    model_config = ConfigDict(extra="forbid")

    site: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)


class ReaderCoverArt(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cover_id: str | None = None
    volume: str | None = None
    locale: str | None = None
    description: str | None = None
    media: ReaderMediaRef


class ReaderMangaStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chapter_count: int = Field(default=0, ge=0)
    page_count: int = Field(default=0, ge=0)
    total_size_bytes: int = Field(default=0, ge=0)
    languages: list[str] = Field(default_factory=list)


class ReaderLineage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pool_revision: int = Field(default=1, ge=1)
    source_metadata_revision: int = Field(default=1, ge=1)
    manifest_sha256: str = ""
    published_at: datetime | None = None
    updated_at: datetime | None = None


class ReaderPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    page_uid: str = Field(..., min_length=1)
    page_number: int = Field(..., ge=1)
    filename: str
    media: ReaderMediaRef


class ReaderChapter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pool_chapter_id: str = Field(..., min_length=1)
    pool_manga_id: str = Field(..., min_length=1)
    source_chapter_id: str
    chapter_number: str
    chapter_numeric: float = 0.0
    volume: str | None = None
    title: str = ""
    language: str = "en"
    scanlation_group: str | None = None
    publish_at: datetime | None = None
    source: str = "mangadex"
    source_id: str | None = None
    page_count: int = Field(default=0, ge=0)
    total_size_bytes: int = Field(default=0, ge=0)
    pages_revision: int = Field(default=1, ge=1)
    manifest_sha256: str = ""
    updated_at: datetime | None = None
    pages: list[ReaderPage] = Field(default_factory=list)


class ReaderManga(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pool_manga_id: str = Field(..., min_length=1)
    slug: str = Field(..., min_length=1)
    source_manga_id: str
    mangadex_id: str | None = None
    title: str = Field(..., min_length=1)
    alt_titles: list[str] = Field(default_factory=list)
    description: str = ""
    status: Literal["ongoing", "completed", "hiatus", "cancelled", "unknown"] = "unknown"
    content_rating: Literal["safe", "suggestive", "erotica", "pornographic", "unknown"] = "unknown"
    publication_demographic: Literal["shounen", "shoujo", "seinen", "josei", "kodomo", "unknown"] = "unknown"
    original_language: str | None = None
    year: int | None = Field(default=None, ge=1800, le=2200)
    published_start_date: str | None = None
    published_end_date: str | None = None
    official_volumes: int | None = Field(default=None, ge=0)
    official_chapters: int | None = Field(default=None, ge=0)
    creators: list[ReaderCreator] = Field(default_factory=list)
    tags: list[ReaderTag] = Field(default_factory=list)
    links: list[ReaderLink] = Field(default_factory=list)
    primary_cover: ReaderMediaRef | None = None
    cover_arts: list[ReaderCoverArt] = Field(default_factory=list)
    stats: ReaderMangaStats = Field(default_factory=ReaderMangaStats)
    lineage: ReaderLineage = Field(default_factory=ReaderLineage)


class MangaReaderPackage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract_name: Literal["manga-reader-package"] = "manga-reader-package"
    contract_version: Literal["2.0"] = "2.0"
    exported_at: datetime
    manga: ReaderManga
    chapters: list[ReaderChapter] = Field(default_factory=list)
