"""
Manga Reader Data Contract v2.

Universal, strictly-validated package format that every manga published in the
Data Lake & Storage Pool can be exported into. Intended for downstream reader
systems (relational databases such as PostgreSQL/MySQL) to build their schema
and map fields 1:1.

Design rules:
- No internal/editor fields (`_id`, presigned `url`, `included`,
  `duplicate_of_page_number`, `pool_state`, `is_etl_ready`, UI colors).
- Only chapters/pages with `included=True` are exported; pages are renumbered 1..N.
- Media is referenced by (bucket, object_key) only; readers resolve URLs themselves.
- Enumerations are normalized so they map cleanly to SQL ENUM/CHECK constraints.
- `extra="forbid"` everywhere => JSON Schema emits `additionalProperties: false`.
"""

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

READER_CONTRACT_NAME = "manga-reader-package"
READER_CONTRACT_VERSION = "2.0"

PublicationStatus = Literal["ongoing", "completed", "hiatus", "cancelled", "unknown"]
ContentRating = Literal["safe", "suggestive", "erotica", "pornographic", "unknown"]
PublicationDemographic = Literal["shounen", "shoujo", "seinen", "josei", "kodomo", "unknown"]
CreatorRole = Literal["author", "artist"]
TagGroup = Literal["genre", "theme", "format", "content", "other"]

_STRICT = ConfigDict(extra="forbid", populate_by_name=True)


class ReaderMediaRef(BaseModel):
    """Pointer to an image object in S3/MinIO object storage (Zero-Copy)."""

    model_config = _STRICT

    bucket: str = Field(..., description="Object storage bucket name. SQL: VARCHAR(63) NOT NULL")
    object_key: str = Field(..., description="Object key inside the bucket. SQL: TEXT NOT NULL")
    content_type: Optional[str] = Field(None, description="MIME type, e.g. image/jpeg, image/webp")
    width: Optional[int] = Field(None, ge=1, description="Image width in pixels")
    height: Optional[int] = Field(None, ge=1, description="Image height in pixels")
    file_size: int = Field(0, ge=0, description="Size in bytes. SQL: BIGINT")
    md5_hash: Optional[str] = Field(None, description="MD5 hex digest (dedup)")
    sha256: Optional[str] = Field(None, description="SHA-256 hex digest (integrity)")


class ReaderCreator(BaseModel):
    """Author/artist credit. A person with both roles appears twice (one row per (creator_id, role))."""

    model_config = _STRICT

    creator_id: str = Field(
        ...,
        min_length=1,
        description="PRIMARY KEY / Canonical creator UUID (MangaDex UUID or deterministic UUIDv5). Disambiguates homonymous creators.",
    )
    slug: str = Field(
        ...,
        min_length=1,
        description="URL-friendly creator slug (e.g. nakamura-moto) for routes like /author/{creator_id}/{slug}.",
    )
    name: str = Field(..., min_length=1, description="Display name")
    role: CreatorRole = Field(..., description="Credit role")
    mangadex_id: Optional[str] = Field(None, description="MangaDex author UUID if known")
    biography: Dict[str, str] = Field(default_factory=dict, description="Localized biography {lang: text}")
    links: Dict[str, str] = Field(
        default_factory=dict,
        description="External/social links {platform: url}, e.g. twitter, pixiv, youtube, website",
    )


class ReaderTag(BaseModel):
    model_config = _STRICT

    slug: str = Field(..., min_length=1, description="Stable URL-safe tag key (unique). Derived from English name")
    source_tag_id: Optional[str] = Field(None, description="Tag ID in the source review system")
    mangadex_id: Optional[str] = Field(None, description="MangaDex tag UUID if known")
    group: TagGroup = Field("genre", description="Tag category")
    name: Dict[str, str] = Field(..., description="Localized names {lang: name}; key `en` always present")


class ReaderLink(BaseModel):
    model_config = _STRICT

    site: str = Field(..., min_length=1, description="Site label, e.g. MangaDex, MyAnimeList")
    url: str = Field(..., min_length=1, description="Absolute URL")


class ReaderCoverArt(BaseModel):
    model_config = _STRICT

    cover_id: Optional[str] = Field(None, description="Cover identifier in the source system")
    volume: Optional[str] = Field(None, description="Volume label this cover belongs to")
    locale: Optional[str] = Field(None, description="Cover locale (ISO 639-1)")
    description: Optional[str] = None
    media: ReaderMediaRef


class ReaderMangaStats(BaseModel):
    """Computed from the exported chapters/pages only (never stale)."""

    model_config = _STRICT

    chapter_count: int = Field(0, ge=0)
    page_count: int = Field(0, ge=0)
    total_size_bytes: int = Field(0, ge=0)
    languages: List[str] = Field(default_factory=list, description="Distinct chapter languages, sorted")


class ReaderLineage(BaseModel):
    """Versioning info for incremental upserts on the reader side."""

    model_config = _STRICT

    pool_revision: int = Field(1, ge=1, description="Increments on every pool change. Use for change detection")
    source_metadata_revision: int = Field(1, ge=1)
    manifest_sha256: str = Field("", description="Content hash of the pooled manga")
    published_at: Optional[datetime] = Field(None, description="First publish into pool (UTC, ISO 8601)")
    updated_at: Optional[datetime] = Field(None, description="Last pool modification (UTC, ISO 8601)")


class ReaderManga(BaseModel):
    model_config = _STRICT

    pool_manga_id: str = Field(..., min_length=1, description="PRIMARY KEY. Stable pool ID, e.g. pm_1a2b3c4d5e6f")
    slug: str = Field(..., min_length=1, description="UNIQUE. URL-friendly slug")
    source_manga_id: str = Field(..., description="ID in the source review system (traceability)")
    mangadex_id: Optional[str] = Field(None, description="MangaDex manga UUID if known")

    title: str = Field(..., min_length=1, description="Primary display title")
    alt_titles: List[str] = Field(default_factory=list, description="Alternative titles (any language)")
    description: str = Field("", description="Synopsis (plain text / markdown)")

    status: PublicationStatus = "unknown"
    content_rating: ContentRating = Field("unknown", description="`unknown` must be treated as NOT safe by readers")
    publication_demographic: PublicationDemographic = "unknown"
    original_language: Optional[str] = Field(None, description="ISO 639-1 lowercase, e.g. ja, ko, zh")
    year: Optional[int] = Field(None, ge=1800, le=2200, description="First publication year")
    published_start_date: Optional[str] = Field(None, description="Free-form or ISO date string from source")
    published_end_date: Optional[str] = None
    official_volumes: Optional[int] = Field(None, ge=0, description="Official volume count (not the exported one)")
    official_chapters: Optional[int] = Field(None, ge=0, description="Official chapter count (not the exported one)")

    creators: List[ReaderCreator] = Field(default_factory=list)
    tags: List[ReaderTag] = Field(default_factory=list)
    links: List[ReaderLink] = Field(default_factory=list)

    primary_cover: Optional[ReaderMediaRef] = None
    cover_arts: List[ReaderCoverArt] = Field(default_factory=list)

    stats: ReaderMangaStats = Field(default_factory=ReaderMangaStats)
    lineage: ReaderLineage = Field(default_factory=ReaderLineage)


class ReaderPage(BaseModel):
    model_config = _STRICT

    page_uid: str = Field(..., min_length=1, description="PRIMARY KEY. Stable page identifier")
    page_number: int = Field(..., ge=1, description="1-indexed reading order, contiguous 1..N")
    filename: str = Field(..., description="Original image filename")
    media: ReaderMediaRef


class ReaderChapter(BaseModel):
    model_config = _STRICT

    pool_chapter_id: str = Field(..., min_length=1, description="PRIMARY KEY")
    pool_manga_id: str = Field(..., min_length=1, description="FOREIGN KEY -> manga.pool_manga_id")
    source_chapter_id: str = Field(..., description="ID in the source review system")

    chapter_number: str = Field(..., description="Display number, may be '10.5' or 'Extra'")
    chapter_numeric: float = Field(0.0, description="Sort key. ORDER BY chapter_numeric, language")
    volume: Optional[str] = None
    title: str = ""
    language: str = Field("en", description="ISO 639-1 lowercase (may include region, e.g. pt-br)")
    scanlation_group: Optional[str] = None
    publish_at: Optional[datetime] = None
    source: str = Field("mangadex", description="Origin provider of this chapter")
    source_id: Optional[str] = Field(None, description="Chapter ID at the origin provider")

    page_count: int = Field(0, ge=0)
    total_size_bytes: int = Field(0, ge=0)
    pages_revision: int = Field(1, ge=1, description="Increments when pages are edited")
    manifest_sha256: str = ""
    updated_at: Optional[datetime] = None

    pages: List[ReaderPage] = Field(default_factory=list)


class ReaderPackage(BaseModel):
    """Self-contained export of one manga with all readable chapters and pages."""

    model_config = ConfigDict(
        extra="forbid",
        title="MangaReaderPackage",
        json_schema_extra={
            "description": (
                "Universal Data Contract for every manga in the Manga Data Lake & Storage Pool. "
                "Suggested relational mapping: manga(1) -> chapters(N) -> pages(N); "
                "manga(N) <-> tags(N); manga(1) -> creators(N), links(N), cover_arts(N)."
            )
        },
    )

    contract_name: Literal["manga-reader-package"] = READER_CONTRACT_NAME
    contract_version: Literal["2.0"] = READER_CONTRACT_VERSION
    exported_at: datetime
    manga: ReaderManga
    chapters: List[ReaderChapter] = Field(default_factory=list, description="Sorted by chapter_numeric, language")
