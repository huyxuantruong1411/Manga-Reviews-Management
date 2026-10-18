from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.pyobjectid import PyObjectId

ExternalReviewSource = Literal["myanimelist", "anilist", "mangaupdates", "animeplanet"]
RecommendationStatus = Literal["recommended", "mixed_feelings", "not_recommended", "unknown"]


class MALAuthorEntry(BaseModel):
    """Author representation from MyAnimeList with explicit roles."""

    model_config = ConfigDict(extra="ignore")

    mal_id: Optional[int] = None
    name: str = Field(..., description="Author's name (e.g., 'Abe, Youichi')")
    role: str = Field(default="Story & Art", description="Author's role (e.g., 'Story & Art', 'Story', 'Art')")
    url: Optional[str] = None


class MALExtendedMetadata(BaseModel):
    """Enriched metadata retrieved from MyAnimeList detail page and Jikan v4 API."""

    model_config = ConfigDict(extra="ignore")

    mal_id: int
    canonical_url: str
    japanese_title: Optional[str] = None
    english_title: Optional[str] = None
    synonyms: List[str] = Field(default_factory=list)
    media_type: Optional[str] = None
    volumes: Optional[int] = None
    chapters: Optional[int] = None
    status: Optional[str] = None
    published_string: Optional[str] = None
    published_start_date: Optional[str] = None
    published_end_date: Optional[str] = None
    genres: List[str] = Field(default_factory=list)
    themes: List[str] = Field(default_factory=list)
    demographics: List[str] = Field(default_factory=list)
    serialization: List[str] = Field(default_factory=list)
    authors: List[MALAuthorEntry] = Field(default_factory=list)
    score: Optional[float] = None
    scored_by: Optional[int] = None
    rank: Optional[int] = None
    popularity: Optional[int] = None
    members: Optional[int] = None
    favorites: Optional[int] = None
    last_enriched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ExternalReviewReactions(BaseModel):
    """Reactions mapped from third-party reviews (e.g. 7 MAL reaction icons)."""

    model_config = ConfigDict(extra="ignore")

    total: int = 0
    nice: int = 0
    love_it: int = 0
    funny: int = 0
    confusing: int = 0
    informative: int = 0
    well_written: int = 0
    creative: int = 0


class ExternalReviewBase(BaseModel):
    """Base fields for an external review document."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    manga_id: str = Field(..., description="Internal MongoDB ID of the manga")
    source: ExternalReviewSource = Field(default="myanimelist", description="Source provider")
    source_work_id: str = Field(..., description="ID of the work on source platform (e.g. MAL manga ID)")
    source_review_id: str = Field(..., description="Unique review ID on source platform")
    source_url: str = Field(..., description="Direct URL to source review")
    reviewer_name: str = Field(..., description="Username of the reviewer")
    reviewer_profile_url: Optional[str] = None
    reviewer_avatar_url: Optional[str] = None
    overall_rating: Optional[int] = Field(default=None, ge=1, le=10, description="Overall score 1-10 if available")
    recommendation_status: RecommendationStatus = Field(default="unknown")
    is_preliminary: bool = Field(default=False, description="Whether review is written before completion")
    chapters_progress: Optional[str] = Field(default=None, description="Progress at review time (e.g. '15/31 chp')")
    is_spoiler: bool = Field(default=False, description="Flag indicating spoiler contents")
    content_text: str = Field(..., description="Full text content of the review")
    word_count: int = Field(default=0, ge=0)
    character_count: int = Field(default=0, ge=0)
    reactions: ExternalReviewReactions = Field(default_factory=ExternalReviewReactions)
    posted_at: Optional[datetime] = None
    posted_at_raw: Optional[str] = None


class ExternalReviewInDB(ExternalReviewBase):
    """External review model as stored in MongoDB collection `external_reviews`."""

    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ExternalReviewResponse(ExternalReviewBase):
    """API response model for an external review."""

    id: PyObjectId = Field(alias="_id")
    fetched_at: datetime
    updated_at: datetime


class ExternalReviewStatsSummary(BaseModel):
    """Aggregate statistics for external reviews associated with a manga."""

    model_config = ConfigDict(extra="ignore")

    total_reviews: int = 0
    by_source: Dict[str, int] = Field(default_factory=dict)
    by_recommendation: Dict[str, int] = Field(default_factory=dict)
    spoiler_count: int = 0
    preliminary_count: int = 0
    average_rating: Optional[float] = None
    last_synced_at: Optional[datetime] = None
    linked_mal_id: Optional[str] = None
    linked_mal_url: Optional[str] = None


class ExternalReviewListResponse(BaseModel):
    """Paginated list of external reviews with filter summary."""

    model_config = ConfigDict(extra="ignore")

    items: List[ExternalReviewResponse] = Field(default_factory=list)
    total: int = 0
    skip: int = 0
    limit: int = 20
    summary: ExternalReviewStatsSummary = Field(default_factory=ExternalReviewStatsSummary)


class TriggerExternalReviewSyncRequest(BaseModel):
    """Payload to trigger external review synchronization and optional metadata enrichment."""

    model_config = ConfigDict(extra="ignore")

    source: ExternalReviewSource = Field(default="myanimelist", description="Source provider to sync from")
    mal_url_or_id: Optional[str] = Field(
        default=None,
        description="Optional MAL URL or numeric ID if not yet linked to the manga",
    )
    include_spoilers: bool = Field(default=True, description="Fetch reviews marked as spoiler")
    include_preliminary: bool = Field(default=True, description="Fetch preliminary reviews")
    sync_extended_metadata: bool = Field(
        default=True,
        description="Whether to also scrape & enrich extended MAL metadata",
    )
    apply_empty_manga_fields: bool = Field(
        default=True,
        description="Fill blank manga fields (volumes, chapters, dates, titles) respecting metadata_locks",
    )
    max_pages: int = Field(default=50, ge=1, le=200, description="Max pages of reviews to crawl")
    force_full_rescan: bool = Field(default=False, description="Rescan all pages even if reviews exist")
