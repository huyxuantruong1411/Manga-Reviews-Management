from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ProviderCapability(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., description="Provider identifier, e.g. 'mangadex', 'mangafire'")
    display_name: str = Field(..., description="Human-readable provider name")
    can_search: bool = Field(False, description="Whether full catalogue search is supported")
    can_resolve_url: bool = True
    supports_languages: List[str] = Field(default_factory=lambda: ["en"])
    requires_session: bool = Field(False, description="Whether browser session or cookies are required")
    can_download: bool = True
    supported_url_patterns: List[str] = Field(default_factory=list)
    rate_limit_per_minute: int = 60


class SourceWork(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source: str = Field(..., description="Provider name e.g. 'mangadex' | 'mangafire'")
    source_work_id: str = Field(..., description="Remote work identifier or slug/hid")
    title: str = Field(..., description="Canonical or primary title")
    url: str = Field(..., description="Canonical remote URL")
    alt_titles: List[str] = Field(default_factory=list)
    author: Optional[str] = None
    artist: Optional[str] = None
    cover_url: Optional[str] = None
    status: Optional[str] = None
    year: Optional[str] = None
    description: Optional[str] = ""
    content_rating: Optional[str] = None
    publication_demographic: Optional[str] = None
    original_language: Optional[str] = None
    available_languages: List[str] = Field(default_factory=list)
    external_ids: Dict[str, str] = Field(
        default_factory=dict, description="e.g. {'mangadex': 'uuid', 'al': '105965', 'mal': '130997'}"
    )
    extra_metadata: Dict[str, Any] = Field(default_factory=dict)


class SourceRelease(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(..., description="External release ID, string representation")
    source: str = Field(..., description="Provider name")
    source_work_id: str = Field(..., description="Work ID on that provider")
    chapter_number: str = Field(..., description="Raw chapter number string e.g. '14', '14.1', 'oneshot'")
    title: Optional[str] = Field("", description="Release / chapter title")
    volume: Optional[str] = Field(None, description="Volume label or number if known")
    language: str = Field("en", description="Translated language BCP-47 / code")
    unit_kind: str = Field("chapter", description="'chapter' | 'oneshot' | 'extra' | 'volume'")
    release_type: Optional[str] = Field(None, description="'official' | 'unofficial' | None")
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    uploader: Optional[str] = None
    uploader_id: Optional[str] = None
    pages_count: int = Field(0, description="Reported or verified number of pages")
    version: int = Field(1, description="Provider upstream version if available")
    publish_at: Optional[datetime] = None
    readable_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    external_url: Optional[str] = None


class ReleaseQuery(BaseModel):
    model_config = ConfigDict(extra="ignore")

    language: str = "en"
    unit_kind: Optional[str] = "chapter"
    limit: int = 500
    offset: int = 0
    page: int = 1
    sort: str = "number"
    order: str = "asc"


class ReleasePage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: List[SourceRelease] = Field(default_factory=list)
    total: Optional[int] = None
    has_next: bool = False
    page: int = 1
    limit: int = 500
    catalogue_complete: bool = True
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SourcePage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    page_number: int = Field(..., description="1-indexed sequence order")
    url: str = Field(..., description="Image CDN URL")
    headers: Optional[Dict[str, str]] = Field(None, description="Required headers e.g. Referer")
    content_type: Optional[str] = None
    expected_size: Optional[int] = None
    expected_hash: Optional[str] = None


class SourcePageManifest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    provider: str
    work_id: str
    release_id: str
    language: str = "en"
    unit_kind: str = "chapter"
    chapter_number_raw: str = ""
    page_count: int = 0
    pages: List[SourcePage] = Field(default_factory=list)
    adapter_version: str = "1.0.0"
    manifest_sha256: Optional[str] = None
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# --- Datasource Error Hierarchy ---


class DatasourceError(Exception):
    """Base exception for all datasource operations."""

    def __init__(self, message: str, code: str = "DATASOURCE_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


class SourceUnavailableError(DatasourceError):
    def __init__(self, message: str = "Source is currently unavailable"):
        super().__init__(message, code="SOURCE_UNAVAILABLE")


class SourceRateLimitedError(DatasourceError):
    def __init__(self, retry_after: int = 5, message: str = "Source rate limit exceeded"):
        super().__init__(message, code="SOURCE_RATE_LIMITED")
        self.retry_after = retry_after


class SourceRequiresSessionError(DatasourceError):
    def __init__(self, message: str = "Source requires human verification or active session"):
        super().__init__(message, code="SOURCE_REQUIRES_SESSION")


class SourceSchemaChangedError(DatasourceError):
    def __init__(self, message: str = "Source HTML or API schema has changed unexpectedly"):
        super().__init__(message, code="SOURCE_SCHEMA_CHANGED")


class SourceReleaseGoneError(DatasourceError):
    def __init__(self, message: str = "Source release or chapter no longer exists (404)"):
        super().__init__(message, code="SOURCE_RELEASE_GONE")


class SourceManifestChangedError(DatasourceError):
    def __init__(self, message: str = "Source page manifest changed during download operation"):
        super().__init__(message, code="SOURCE_MANIFEST_CHANGED")


class IdentityConflictError(DatasourceError):
    def __init__(self, message: str = "Identity or mapping conflict detected between sources"):
        super().__init__(message, code="IDENTITY_CONFLICT")


class SSRFSecurityError(DatasourceError):
    def __init__(self, message: str = "URL target rejected for security / SSRF boundaries"):
        super().__init__(message, code="SSRF_SECURITY_REJECTED")


class MetadataConflictError(DatasourceError):
    def __init__(self, message: str = "Metadata conflict detected or revision mismatch"):
        super().__init__(message, code="METADATA_CONFLICT")


# --- Metadata Merge DTOs ---


class MetadataFieldDiff(BaseModel):
    model_config = ConfigDict(extra="ignore")

    field_path: str
    current_value: Any = None
    candidate_value: Any = None
    source: str
    decision_state: str = "identical"  # "identical" | "new" | "conflict" | "locked"
    is_locked: bool = False
    recommended_action: str = "keep"  # "keep" | "accept" | "manual_review"


class MetadataPreviewResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    manga_id: str
    source: str
    source_work_id: str
    current_metadata_revision: int = 1
    diffs: List[MetadataFieldDiff] = Field(default_factory=list)
    has_conflicts: bool = False
    protected_user_fields: List[str] = Field(
        default_factory=lambda: ["read_status", "personal_rating", "reviews", "notes", "download_path"]
    )


class MetadataApplyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source: str
    source_work_id: str
    expected_metadata_revision: int
    accepted_fields: List[str] = Field(default_factory=list)
    field_locks: Optional[Dict[str, bool]] = None


class MetadataApplyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    success: bool = True
    manga_id: str
    applied_fields: List[str] = Field(default_factory=list)
    new_metadata_revision: int
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LinkSourceRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source: str = Field(..., description="Provider name e.g. 'mangafire', 'mangadex'")
    source_work_id: str = Field(..., description="Remote work ID or slug")
    canonical_url: str = Field(..., description="Canonical URL to remote work")
    title: Optional[str] = Field(None, description="Title of remote work")
    link_state: str = Field("verified", description="Link state: 'verified' | 'unverified' | 'candidate'")
    numbering_scope_id: str = Field("scope_default", description="Numbering scope ID")
