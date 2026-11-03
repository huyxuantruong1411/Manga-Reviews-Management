"""Pydantic v2 Schemas for Module 2 (ETL Ingestion, CDC Webhook, Hide/Show/Delete, Analytics)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.contract_v2 import MangaReaderPackage, ReaderChapter


class EtlIngestRequest(BaseModel):
    package: MangaReaderPackage | None = None
    pool_manga_id: str | None = None
    pool_manga_ids: list[str] | None = None
    cdc_enabled: bool = True


class CdcChaptersWebhookRequest(BaseModel):
    pool_manga_id: str = Field(..., min_length=1)
    pool_revision: int | None = None
    chapters: list[ReaderChapter] = Field(..., min_length=1)


classMangaVisibilityReasonRequest = BaseModel


class MangaReasonRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)


class ToggleCdcRequest(BaseModel):
    cdc_enabled: bool
