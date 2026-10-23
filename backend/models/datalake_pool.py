import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.pyobjectid import PyObjectId


class PoolMediaPointer(BaseModel):
    model_config = ConfigDict(extra="ignore")

    minio_bucket: str = Field("manga-library", description="MinIO storage bucket")
    object_key: str = Field(..., description="Physical object key on MinIO")
    url: Optional[str] = Field(None, description="Dynamically generated presigned read URL")


class PoolPageItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    page_uid: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Deterministic or UUID page key")
    page_number: int = Field(..., description="1-indexed page sequence in chapter")
    filename: str = Field(..., description="Original image filename")
    minio_bucket: str = Field("manga-library", description="Source MinIO bucket")
    object_key: str = Field(..., description="Physical MinIO object key (Zero-Copy)")
    file_size: int = Field(0, description="Image file size in bytes")
    width: Optional[int] = Field(None, description="Image width in pixels")
    height: Optional[int] = Field(None, description="Image height in pixels")
    md5_hash: Optional[str] = Field(None, description="MD5 hash for deduplication")
    sha256: Optional[str] = Field(None, description="SHA-256 hash for integrity verification")
    content_type: Optional[str] = Field(None, description="MIME content type")
    url: Optional[str] = Field(None, description="Presigned URL for reading/preview")
    included: bool = Field(True, description="Whether this page is included in reader output")
    duplicate_of_page_number: Optional[int] = Field(None, description="Original page number if marked duplicate")


class PoolTagEmbedded(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source_tag_id: Optional[str] = None
    mangadex_id: Optional[str] = None
    name: Dict[str, str] = Field(
        default_factory=dict, description="Multilingual tag names e.g. {'en': '...', 'vi': '...'}"
    )
    group: Optional[str] = Field("genre", description="Tag category e.g. genre, theme, format")
    color: Optional[str] = Field(None, description="Theme display color")


class PoolCreatorEmbedded(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., description="Creator full name")
    role: str = Field("author", description="Role e.g. author, artist, creator")
    mangadex_id: Optional[str] = None
    biography: Dict[str, str] = Field(default_factory=dict)
    links: Dict[str, str] = Field(default_factory=dict)


class PoolCoverArtEmbedded(BaseModel):
    model_config = ConfigDict(extra="ignore")

    cover_id: Optional[str] = None
    volume: Optional[str] = None
    locale: Optional[str] = None
    description: Optional[str] = None
    minio_bucket: str = Field("manga-library")
    object_key: str = Field(..., description="Cover art object key")
    url: Optional[str] = None
    included: bool = True


class PoolMangaStats(BaseModel):
    model_config = ConfigDict(extra="ignore")

    total_chapters: int = 0
    total_pages: int = 0
    total_size_bytes: int = 0
    available_languages: List[str] = Field(default_factory=list)


class PoolLineageInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source_metadata_revision: int = 1
    pool_revision: int = 1
    manifest_sha256: str = ""
    published_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_synced_from_source_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    has_upstream_changes: bool = False


class PoolMangaInDB(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    pool_manga_id: str = Field(..., description="Unique slug/UUID for pool manga")
    source_manga_id: str = Field(..., description="Foreign key _id in review system")
    mangadex_id: Optional[str] = None
    slug: str = Field(..., description="URL-friendly slug")

    title: str
    alt_titles: List[str] = Field(default_factory=list)
    description: Optional[str] = ""
    author: Optional[str] = None
    artist: Optional[str] = None
    creators: List[PoolCreatorEmbedded] = Field(default_factory=list)
    year: Optional[str] = None
    status: Optional[str] = None
    content_rating: Optional[str] = "safe"
    publication_demographic: Optional[str] = None
    original_language: Optional[str] = None
    published_start_date: Optional[str] = None
    published_end_date: Optional[str] = None
    volumes: Optional[int] = None
    chapters: Optional[int] = None

    tags: List[PoolTagEmbedded] = Field(default_factory=list)
    links: List[Dict[str, str]] = Field(default_factory=list)
    tracker_metadata: Optional[Dict[str, Any]] = None

    primary_cover: Optional[PoolMediaPointer] = None
    cover_arts: List[PoolCoverArtEmbedded] = Field(default_factory=list)

    pool_state: str = Field("published", description="'published' | 'draft' | 'archived'")
    is_etl_ready: bool = Field(True, description="Ready for downstream ETL connector")

    stats: PoolMangaStats = Field(default_factory=PoolMangaStats)
    lineage: PoolLineageInfo = Field(default_factory=PoolLineageInfo)

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class PoolChapterInDB(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    pool_chapter_id: str = Field(..., description="Stable chapter identifier for pool")
    pool_manga_id: str = Field(..., description="Foreign key to pool_mangas.pool_manga_id")
    source_manga_id: str = Field(..., description="Source manga ObjectId string")
    source_chapter_id: str = Field(..., description="Source chapter ObjectId string")

    chapter_number: str
    chapter_numeric: float = 0.0
    volume: Optional[str] = None
    title: Optional[str] = ""
    language: str = "en"
    scanlation_group: Optional[str] = None
    uploader: Optional[str] = None
    publish_at: Optional[datetime] = None
    source: str = "mangadex"
    source_id: Optional[str] = None

    pages: List[PoolPageItem] = Field(default_factory=list)
    page_count: int = 0
    total_size_bytes: int = 0
    pages_revision: int = 1
    manifest_sha256: str = ""
    included: bool = True

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


# Request & Response Schemas
class PoolCandidateItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source_manga_id: str
    title: str
    cover_url: Optional[str] = None
    author: Optional[str] = None
    status: Optional[str] = None
    ready_chapters_count: int = 0
    total_pages_count: int = 0
    available_languages: List[str] = Field(default_factory=list)
    is_eligible: bool = False
    eligibility_reason: Optional[str] = None
    already_in_pool: bool = False
    pool_manga_id: Optional[str] = None
    needs_sync: bool = False


class PublishToPoolRequest(BaseModel):
    source_manga_ids: List[str] = Field(..., min_length=1, description="List of source manga IDs to publish")
    languages: Optional[List[str]] = Field(None, description="Optional filter of languages to include")
    auto_deduplicate_pages: bool = Field(False, description="Auto-remove duplicate pages by MD5 hash on ingest")
    mark_etl_ready: bool = Field(True, description="Mark as ready for downstream ETL ingestion")


class PublishItemResult(BaseModel):
    source_manga_id: str
    pool_manga_id: Optional[str] = None
    success: bool
    title: str
    chapters_count: int = 0
    pages_count: int = 0
    error: Optional[str] = None


class PublishToPoolResponse(BaseModel):
    success_count: int
    error_count: int
    results: List[PublishItemResult]


class PoolMangaUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: Optional[str] = None
    alt_titles: Optional[List[str]] = None
    description: Optional[str] = None
    author: Optional[str] = None
    artist: Optional[str] = None
    year: Optional[str] = None
    status: Optional[str] = None
    content_rating: Optional[str] = None
    publication_demographic: Optional[str] = None
    original_language: Optional[str] = None
    volumes: Optional[int] = None
    chapters: Optional[int] = None
    pool_state: Optional[str] = None
    is_etl_ready: Optional[bool] = None
    primary_cover_key: Optional[str] = None


class PoolChapterUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    chapter_number: Optional[str] = None
    chapter_numeric: Optional[float] = None
    volume: Optional[str] = None
    title: Optional[str] = None
    language: Optional[str] = None
    scanlation_group: Optional[str] = None
    included: Optional[bool] = None


class PoolBatchChapterUpdateRequest(BaseModel):
    pool_chapter_ids: List[str] = Field(..., min_length=1)
    volume: Optional[str] = None
    scanlation_group: Optional[str] = None
    language: Optional[str] = None
    renumber_start: Optional[float] = None
    renumber_step: Optional[float] = 1.0


class PoolDeletePagesRequest(BaseModel):
    page_numbers: List[int] = Field(..., min_length=1, description="1-indexed page numbers to delete")


class PoolDuplicateTarget(BaseModel):
    pool_chapter_id: str
    page_number: int
    page_uid: Optional[str] = None


class PoolDuplicateCleanupRequest(BaseModel):
    targets: List[PoolDuplicateTarget] = Field(..., min_length=1)


class PoolDuplicateItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    pool_chapter_id: str
    chapter_number: str
    chapter_title: Optional[str] = None
    page_number: int
    page_uid: str
    filename: str
    object_key: str
    file_size: int
    url: Optional[str] = None


class PoolDuplicateGroup(BaseModel):
    model_config = ConfigDict(extra="ignore")

    hash_type: str = "md5"
    hash_value: str
    file_size: int
    items: List[PoolDuplicateItem]


class PoolIntegrityReport(BaseModel):
    model_config = ConfigDict(extra="ignore")

    pool_manga_id: str
    is_healthy: bool
    total_checked: int
    missing_keys: List[str]
    checked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PoolStatsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    total_mangas: int = 0
    total_etl_ready: int = 0
    total_chapters: int = 0
    total_pages: int = 0
    total_size_bytes: int = 0
    saved_storage_bytes: int = 0  # 100% saved via Zero-Copy mapping
