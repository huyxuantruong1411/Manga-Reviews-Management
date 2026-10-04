from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class TopGenreStat(BaseModel):
    name: str
    count: int


class ReviewCorpusSummaryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_reviews: int = Field(default=0, description="Total active reviews written")
    total_words: int = Field(default=0, description="Total words across all reviews")
    total_characters: int = Field(default=0, description="Total characters across all reviews")
    estimated_tokens: int = Field(default=0, description="Estimated LLM tokens (~1.3x words for EN/VI mix)")
    average_words_per_review: float = Field(default=0.0)
    total_manga_reviewed: int = Field(default=0, description="Number of distinct manga reviewed")
    average_manga_rating: Optional[float] = Field(
        default=None, description="Average personal rating for reviewed manga"
    )
    earliest_review_date: Optional[datetime] = None
    latest_review_date: Optional[datetime] = None
    read_status_distribution: Dict[str, int] = Field(default_factory=dict)
    top_genres: List[TopGenreStat] = Field(default_factory=list)


class ReviewCorpusExportRequest(BaseModel):
    format: str = Field(default="markdown", description="'markdown', 'json', or 'txt'")
    read_statuses: Optional[List[str]] = Field(default=None, description="Filter by manga read status")
    rating_min: Optional[float] = Field(default=None, ge=0.0, le=10.0)
    rating_max: Optional[float] = Field(default=None, ge=0.0, le=10.0)
    manga_ids: Optional[List[str]] = Field(default=None, description="Filter by specific manga IDs")
    sort_by: str = Field(
        default="created_at_desc",
        description="One of: 'created_at_desc', 'created_at_asc', 'rating_desc', 'rating_asc', 'words_desc', 'title_asc'",
    )
    include_synopsis: bool = Field(default=True, description="Include manga description/synopsis")
    include_system_prompt: bool = Field(
        default=True, description="Include AI instructions for tone and style emulation"
    )
    include_manga_meta: bool = Field(
        default=True, description="Include metadata like author, artist, year, demographic"
    )
    include_alt_titles: bool = Field(default=True, description="Include alternative manga titles")


class ReviewCorpusExportResponse(BaseModel):
    content: str
    format: str
    total_reviews: int
    total_words: int
    estimated_tokens: int
    filename: str


class ReviewManagementItem(BaseModel):
    id: str = Field(description="Review ID")
    manga_id: str = Field(description="Associated Manga ID")
    manga_title: str = Field(description="Manga title")
    manga_cover_url: Optional[str] = Field(default=None, description="Manga cover image URL")
    manga_rating: Optional[float] = Field(default=None, description="Personal rating of the manga")
    manga_read_status: Optional[str] = Field(default=None, description="Read status of the manga")
    review_title: str = Field(description="Review title")
    word_count: int = Field(default=0, description="Word count of the review")
    character_count: int = Field(default=0, description="Character count of the review")
    snippet: str = Field(default="", description="Snippet of review text")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    content_json: Optional[Dict[str, Any]] = None


class ReviewManagementResponse(BaseModel):
    reviews: List[ReviewManagementItem]
    total: int
