"""Domain models, Pydantic schemas, and hashing utilities for Translation Studio.

Covers profiles, revisions, providers, assets, font packs, jobs, results,
and page bindings in accordance with the Translation Studio architecture.
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.pyobjectid import PyObjectId


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def compute_config_hash(config_dict: Dict[str, Any]) -> str:
    """Computes a deterministic, order-independent SHA-256 hash of a config dictionary."""
    canonical_json = json.dumps(config_dict, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


# ─── PROFILES & REVISIONS ───────────────────────────────────────────────────


class TranslationProfileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Profile name")
    target_language: str = Field("vi", min_length=2, max_length=10, description="Target language code")
    source_language: str = Field("auto", min_length=2, max_length=10, description="Source language code")
    scope: str = Field("local", description="Access scope ('local')")
    effective_config: Dict[str, Any] = Field(default_factory=dict, description="Engine configuration parameters")
    is_default: bool = Field(False, description="Whether this is the default profile")
    description: Optional[str] = Field(None, max_length=500, description="Optional profile description")


class TranslationProfileCreate(TranslationProfileBase):
    pass


class TranslationProfileInDB(TranslationProfileBase):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    profile_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    active_revision: int = Field(default=1)
    config_hash: str = Field(default="")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(populate_by_name=True)


class TranslationProfileRevision(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    profile_id: str
    revision: int = 1
    schema_version: int = 1
    scope: str = "local"
    effective_config: Dict[str, Any] = Field(default_factory=dict)
    config_hash: str
    created_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(populate_by_name=True)


# ─── PROVIDERS ──────────────────────────────────────────────────────────────


class TranslationProviderBase(BaseModel):
    provider_id: str = Field(..., description="Unique provider ID e.g. 'gemini-default'")
    name: str = Field(..., description="Display name e.g. 'Google Gemini API'")
    kind: Literal["gemini", "openai_compatible", "offline_stub"] = Field("gemini")
    endpoint_url: Optional[str] = Field(None, description="Custom endpoint URL for OpenAI-compatible providers")
    model_id: str = Field(..., description="Model ID e.g. 'gemini-2.5-flash'")
    is_active: bool = Field(True)
    capabilities: Dict[str, Any] = Field(default_factory=dict)
    last_probed_at: Optional[datetime] = None


class TranslationProviderInDB(TranslationProviderBase):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    created_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(populate_by_name=True)


# ─── ASSETS & FONTS ─────────────────────────────────────────────────────────


class TranslationAssetInDB(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    asset_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    scope: str = "local"
    kind: Literal["font", "demo_input", "output_image", "clean_image", "mask_image", "export_zip"]
    object_key: str
    sha256: str
    file_size: int = 0
    mime_type: str = "application/octet-stream"
    state: Literal["available", "deleting", "deleted"] = "available"
    created_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(populate_by_name=True)


class TranslationFontPack(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    font_pack_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    revision: int = 1
    name: str
    scope: str = "local"
    variants: List[Dict[str, str]] = Field(default_factory=list)
    vietnamese_coverage: bool = False
    missing_glyphs: List[str] = Field(default_factory=list)
    license_note: Optional[str] = None
    state: Literal["available", "archived", "rejected"] = "available"
    created_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(populate_by_name=True)


# ─── JOBS & PAGES ───────────────────────────────────────────────────────────


class TranslationJobSource(BaseModel):
    kind: Literal["chapter_pages", "demo_assets"] = "chapter_pages"
    manga_id: Optional[str] = None
    chapter_id: Optional[str] = None
    page_uids: List[str] = Field(default_factory=list)
    expected_pages_revision: Optional[int] = None
    demo_asset_ids: Optional[List[str]] = None


class TranslationJobCreate(BaseModel):
    source: TranslationJobSource
    profile_id: Optional[str] = None
    profile_revision: Optional[int] = None
    target_language: str = "vi"
    context_policy: Literal["profile_default", "none", "full_chapter"] = "profile_default"
    reuse_policy: Literal["reuse_existing", "regenerate"] = "reuse_existing"
    idempotency_key: Optional[str] = None


class TranslationJobInDB(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    job_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    scope: str = "local"
    operation_kind: Literal["translate", "clean_only", "upscale"] = "translate"
    state: Literal["queued", "running", "completed", "partial", "failed", "cancelled"] = "queued"
    cancel_requested: bool = False
    total_pages: int = 0
    completed_pages: int = 0
    failed_pages: int = 0
    source_manifest: Dict[str, Any] = Field(default_factory=dict)
    profile_snapshot: Dict[str, Any] = Field(default_factory=dict)
    idempotency_key: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(populate_by_name=True)


class TranslationJobPageInDB(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    job_id: str
    page_identity: str  # page_uid or demo_asset_id
    ordinal: int
    source_sha256: Optional[str] = None
    state: Literal[
        "queued",
        "preparing",
        "running",
        "committing",
        "completed",
        "failed",
        "cancelled",
        "skipped",
    ] = "queued"
    stage: Optional[str] = None
    attempt: int = 1
    fencing_token: int = 0
    lease_until: Optional[datetime] = None
    result_id: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


# ─── RESULTS & REVISIONS ────────────────────────────────────────────────────


class RegionData(BaseModel):
    region_id: str
    bounding_box: Dict[str, float]  # Normalized x, y, width, height [0.0, 1.0]
    reading_order: int
    source_text: str
    translated_text: str
    confidence: Optional[float] = None
    quality_warning: Optional[str] = None


class TranslationResultInDB(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    result_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    scope: str = "local"
    fingerprint: str
    source_sha256: str
    chapter_id: Optional[str] = None
    page_uid: Optional[str] = None
    target_language: str = "vi"
    active_revision: int = 1
    output_object_key: str
    clean_object_key: Optional[str] = None
    width: int = 0
    height: int = 0
    regions: List[RegionData] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(populate_by_name=True)


class TranslationPageBindingInDB(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    scope: str = "local"
    chapter_id: str
    page_uid: str
    target_language: str = "vi"
    chosen_result_id: str
    chosen_revision: int = 1
    validated_source_hash: str
    updated_at: datetime = Field(default_factory=utc_now)

    model_config = ConfigDict(populate_by_name=True)
