from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_serializer


class DownloadSelectionPolicy(str, Enum):
    SKIP_EXISTING = "skip_existing_release"
    KEEP_ALTERNATIVE = "keep_alternative"
    REPLACE_PREFERRED = "replace_preferred_after_commit"
    RETRY_FAILED = "retry_failed"


class DownloadPlanItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    item_id: str = Field(..., description="Unique plan item identifier (UUID)")
    source_release_id: str = Field(..., description="External release ID from provider")
    chapter_number: str = Field(..., description="Raw chapter number string e.g. '14'")
    volume: Optional[str] = Field(None, description="Volume label or number")
    title: Optional[str] = Field("", description="Chapter / release title")
    language: str = Field("en", description="Language code")
    unit_kind: str = Field("chapter", description="Unit kind: chapter | oneshot | extra | volume")
    target_slot_id: Optional[str] = Field(None, description="Logical chapter slot ID in chapter_slots")
    target_chapter_id: Optional[str] = Field(None, description="Target internal chapter ObjectId string")
    action: str = Field("download", description="'download' | 'skip' | 'replace'")
    status: str = Field("pending", description="'pending' | 'downloading' | 'completed' | 'failed' | 'skipped'")
    reason: Optional[str] = Field(None, description="Reason if skipped or replaced")
    expected_revision: int = Field(1, description="Expected pages/media revision counter")
    error: Optional[str] = None


class DownloadPlan(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str = Field(..., alias="_id", description="Unique plan ID")
    manga_id: str = Field(..., description="Target manga ID")
    source: str = Field(..., description="Provider name e.g. mangadex, mangafire")
    source_work_id: str = Field(..., description="Source work identifier")
    selection_policy: DownloadSelectionPolicy = Field(
        default=DownloadSelectionPolicy.SKIP_EXISTING, description="Release selection and conflict policy"
    )
    items: List[DownloadPlanItem] = Field(default_factory=list)
    total_items: int = 0
    download_count: int = 0
    skip_count: int = 0
    save_to_disk: bool = False
    download_path: Optional[str] = None
    snapshot_hash: Optional[str] = None
    expires_at: datetime = Field(..., description="Plan expiration timestamp (TTL)")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @computed_field
    @property
    def plan_id(self) -> str:
        return self.id

    @model_serializer(mode="wrap")
    def _serialize(self, handler, info):
        data = handler(self)
        data["id"] = self.id
        data["_id"] = self.id
        data["plan_id"] = self.id
        return data


# --- API Request & Response DTOs ---


class CreateDownloadPlanRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source: str = Field(..., description="Provider name e.g. 'mangadex', 'mangafire'")
    source_work_id: str = Field(..., description="Remote work ID or slug")
    release_ids: List[str] = Field(..., description="List of source release IDs to include in the plan")
    selection_policy: DownloadSelectionPolicy = Field(
        default=DownloadSelectionPolicy.SKIP_EXISTING,
        description="Policy: skip_existing_release | keep_alternative | replace_preferred_after_commit | retry_failed",
    )
    save_to_disk: bool = Field(False, description="Whether to also mirror downloaded images to local filesystem")
    download_path: Optional[str] = Field(None, description="Optional custom root folder for local disk mirror")
    auto_link: bool = Field(True, description="Whether to auto-link unlinked source work if not bound elsewhere")
    releases_metadata: Optional[List[dict]] = Field(
        None, description="Optional release metadata hints from client (e.g. chapter_number, volume, title, language)"
    )


class ExecuteDownloadPlanRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    idempotency_key: Optional[str] = Field(None, description="Optional client idempotency key")


class ExecuteDownloadPlanResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    task_id: str = Field(..., description="Background download task ID")
    plan_id: str = Field(..., description="Executed download plan ID")
    status: str = Field("pending", description="Task execution status")
    total_items: int = 0
    download_count: int = 0
    message: str = "Download plan execution started"
