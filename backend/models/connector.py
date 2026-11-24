"""Pydantic v2 DTOs for the External Source Connector API (ETL v2.0 + Media Proxy + CDC)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.reader_contract import (
    READER_CONTRACT_NAME,
    READER_CONTRACT_VERSION,
    ContentRating,
    PublicationDemographic,
    PublicationStatus,
    ReaderLineage,
    ReaderMangaStats,
    ReaderMediaRef,
)

CdcEventType = Literal[
    "MANGA_METADATA_UPDATED",
    "CHAPTER_CREATED",
    "CHAPTER_UPDATED",
    "CHAPTER_DELETED",
    "MANGA_REMOVED",
    "SUBSCRIPTION_PING",
]

DEFAULT_CDC_EVENTS: List[CdcEventType] = [
    "MANGA_METADATA_UPDATED",
    "CHAPTER_CREATED",
    "CHAPTER_UPDATED",
    "CHAPTER_DELETED",
    "MANGA_REMOVED",
]

CdcSubscriptionStatus = Literal["ACTIVE", "PAUSED", "CANCELLED", "FAILED"]
CdcDeliveryStatus = Literal["PENDING", "DELIVERED", "FAILED"]


class ConnectorPoolSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ready_mangas: int = 0
    ready_chapters: int = 0
    ready_pages: int = 0
    total_size_bytes: int = 0


class ConnectorInfoResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source_system: str
    service_version: str = "1.0.0"
    contract_name: str = READER_CONTRACT_NAME
    contract_version: str = READER_CONTRACT_VERSION
    schema_id: str = f"urn:manga-datalake:contract:{READER_CONTRACT_NAME}:{READER_CONTRACT_VERSION}"
    auth_mode: Literal["api_key", "local_open"] = "api_key"
    capabilities: List[str] = Field(default_factory=list)
    endpoints: Dict[str, str] = Field(default_factory=dict)
    pool_stats: ConnectorPoolSummary = Field(default_factory=ConnectorPoolSummary)
    server_time: Optional[datetime] = None


class ConnectorCatalogItem(BaseModel):
    """External-safe catalog summary for a published, ETL-ready pooled manga."""

    model_config = ConfigDict(extra="forbid")

    pool_manga_id: str
    source_manga_id: str
    slug: str
    mangadex_id: Optional[str] = None
    title: str
    alt_titles: List[str] = Field(default_factory=list)
    status: PublicationStatus = "unknown"
    content_rating: ContentRating = "unknown"
    publication_demographic: PublicationDemographic = "unknown"
    original_language: Optional[str] = None
    year: Optional[int] = None
    primary_cover: Optional[ReaderMediaRef] = None
    primary_cover_media_path: Optional[str] = Field(
        None, description="Relative media proxy path under this connector base URL"
    )
    stats: ReaderMangaStats
    lineage: ReaderLineage
    package_url: str = Field(..., description="Relative endpoint path to fetch the strict v2.0 ReaderPackage")
    cdc_supported: bool = True


class ConnectorCatalogResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source_system: str
    contract_name: str = READER_CONTRACT_NAME
    contract_version: str = READER_CONTRACT_VERSION
    items: List[ConnectorCatalogItem] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 24
    has_next: bool = False


class CdcSubscriptionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pool_manga_id: str = Field(..., min_length=1, max_length=80, description="Stable pool manga ID (pm_...)")
    callback_url: str = Field(
        ...,
        min_length=8,
        max_length=1000,
        description="Downstream reader webhook receiver URL (http/https)",
    )
    consumer_id: str = Field(
        default="manga-reader",
        min_length=1,
        max_length=100,
        description="Logical downstream consumer identifier",
    )
    webhook_secret: Optional[str] = Field(
        default=None,
        min_length=8,
        max_length=256,
        description="Optional consumer-specific HMAC-SHA256 signing secret; defaults to server CONNECTOR_WEBHOOK_SECRET",
    )
    events: List[CdcEventType] = Field(
        default_factory=lambda: list(DEFAULT_CDC_EVENTS),
        min_length=1,
        description="Event types subscribed for this manga",
    )


class CdcSubscriptionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    provider_subscription_key: str
    pool_manga_id: str
    consumer_id: str
    callback_url: str
    events: List[str] = Field(default_factory=list)
    status: CdcSubscriptionStatus = "ACTIVE"
    signing_algorithm: str = "HMAC-SHA256"
    signature_header: str = "X-Manga-Source-Signature"
    has_custom_secret: bool = False
    subscribed_at: datetime
    unsubscribed_at: Optional[datetime] = None
    last_event_at: Optional[datetime] = None
    updated_at: datetime


class CdcSubscriptionListResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: List[CdcSubscriptionResponse] = Field(default_factory=list)
    total: int = 0


class CdcEventEnvelope(BaseModel):
    """Canonical CDC event envelope aligned with 10_API_CONTRACTS_AND_EVENTS.md §10."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    eventId: str = Field(..., min_length=1)
    eventType: CdcEventType
    occurredAt: datetime
    contractName: str = READER_CONTRACT_NAME
    contractVersion: str = READER_CONTRACT_VERSION
    poolMangaId: str = Field(..., min_length=1)
    poolChapterId: Optional[str] = None
    poolRevision: int = Field(1, ge=1)
    payloadSha256: str = Field(..., min_length=64, max_length=64)
    payload: Dict[str, Any] = Field(default_factory=dict)


class CdcEventFeedResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: List[CdcEventEnvelope] = Field(default_factory=list)
    total: int = 0
    has_more: bool = False
    next_after_event_id: Optional[str] = None


class CdcDeliveryRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    delivery_id: str
    event_id: str
    event_type: str
    subscription_key: str
    pool_manga_id: str
    callback_url: str
    status: CdcDeliveryStatus
    attempt_count: int = 0
    response_status: Optional[int] = None
    last_error: Optional[str] = None
    created_at: datetime
    delivered_at: Optional[datetime] = None
    updated_at: datetime


class CdcDeliveryListResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: List[CdcDeliveryRecord] = Field(default_factory=list)
    total: int = 0


class NgrokTunnelInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    proto: str
    public_url: str
    addr: str


class ConnectorStatusResponse(BaseModel):
    """Non-secret operational snapshot for the local Data Lake Pool Admin UI."""

    model_config = ConfigDict(extra="ignore")

    connector_enabled: bool
    source_system: str
    contract_name: str = READER_CONTRACT_NAME
    contract_version: str = READER_CONTRACT_VERSION
    schema_id: str = f"urn:manga-datalake:contract:{READER_CONTRACT_NAME}:{READER_CONTRACT_VERSION}"
    dedicated_port: int
    api_key_configured: bool
    webhook_secret_configured: bool
    tunnel_path_guard_enabled: bool
    allow_unauthenticated_local: bool
    configured_public_base_url: Optional[str] = None
    active_public_base_url: Optional[str] = None
    ngrok_active: bool = False
    ngrok_tunnels: List[NgrokTunnelInfo] = Field(default_factory=list)
    pool_stats: ConnectorPoolSummary = Field(default_factory=ConnectorPoolSummary)
    active_subscriptions_count: int = 0
    total_events_count: int = 0
    failed_deliveries_count: int = 0
    endpoints: Dict[str, str] = Field(default_factory=dict)
