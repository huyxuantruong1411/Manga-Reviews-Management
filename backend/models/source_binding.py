from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.pyobjectid import PyObjectId


class MangaSourceBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    manga_id: str = Field(..., description="Target manga internal ID")
    source: str = Field(..., description="Provider name e.g. 'mangadex', 'mangafire'")
    source_work_id: str = Field(..., description="External work identifier")
    canonical_url: str = Field(..., description="Canonical upstream URL")
    title: Optional[str] = Field(None, description="Title reported by upstream")
    link_state: str = Field("verified", description="'verified' | 'proposed' | 'conflict' | 'disabled'")
    evidence: Dict[str, Any] = Field(default_factory=dict, description="Verification evidence (match reason, IDs)")
    numbering_scope_id: str = Field("scope_default", description="Numbering scope identifier")


class MangaSourceInDB(MangaSourceBase):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class ChapterSlotBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    manga_id: str = Field(..., description="Target manga internal ID")
    language: str = Field("en", description="BCP-47 language code")
    unit_kind: str = Field("chapter", description="'chapter' | 'oneshot' | 'extra' | 'volume'")
    numbering_scope_id: str = Field("scope_default", description="Numbering scope identifier")
    chapter_key: str = Field(..., description="Normalized sorting key e.g. '14', '14.1', 'oneshot'")
    chapter_display: str = Field(..., description="Display string e.g. '14'")
    title: Optional[str] = Field("", description="Slot title if known")
    volume: Optional[str] = Field(None, description="Volume label if applicable")
    preferred_chapter_id: Optional[str] = Field(None, description="Internal ID of stored preferred release")
    mapping_state: str = Field("verified", description="'verified' | 'unverified' | 'conflict'")
    is_excluded: bool = Field(False, description="Whether excluded from auto-download gap filling")


class ChapterSlotInDB(ChapterSlotBase):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class ChapterSlotDetail(BaseModel):
    model_config = ConfigDict(extra="ignore")

    slot_id: str
    chapter_key: str
    chapter_display: str
    language: str
    unit_kind: str
    title: Optional[str] = ""
    volume: Optional[str] = None
    preferred_chapter_id: Optional[str] = None
    is_ready: bool = False
    stored_releases_count: int = 0
    available_releases: List[Dict[str, Any]] = Field(default_factory=list)
