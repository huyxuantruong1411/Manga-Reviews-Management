"""FastAPI Router for Module 2 (Manga Management, ETL Data Contract v2.0, CDC Webhook, Analytics)."""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_admin
from app.models import User
from app.modules.mod2_manga_management.schemas import (
    CdcChaptersWebhookRequest,
    EtlIngestRequest,
    MangaReasonRequest,
)
from app.modules.mod2_manga_management.service import manga_management_service

router = APIRouter(prefix="/api/v1", tags=["Module 2 - Manga Management & ETL/CDC"])


@router.get("/admin/etl/sources", status_code=status.HTTP_200_OK)
async def list_etl_sources(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List available manga packages from Manga Data Lake & Storage Pool and local staging (UC-2.3)."""
    return await manga_management_service.list_etl_sources(db)


@router.post("/admin/etl/ingest", status_code=status.HTTP_200_OK)
async def ingest_etl_package(
    payload: EtlIngestRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Validate and idempotently ingest a MangaReaderPackage v2.0 into PostgreSQL & MinIO (UC-2.3)."""
    return await manga_management_service.ingest_package(db, admin, payload)


@router.post("/webhooks/cdc/chapters", status_code=status.HTTP_200_OK)
async def cdc_chapters_webhook(
    payload: CdcChaptersWebhookRequest,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Receive incremental chapter updates via Change Data Capture (CDC) webhook (UC-2.3)."""
    return await manga_management_service.process_cdc_chapters_webhook(db, payload)


@router.post("/admin/mangas/{manga_id}/hide", status_code=status.HTTP_200_OK)
async def hide_manga(
    manga_id: str,
    payload: MangaReasonRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Hide a manga from public discovery and invalidate catalog cache immediately (UC-2.1)."""
    return await manga_management_service.hide_manga(db, admin, manga_id, payload.reason)


@router.post("/admin/mangas/{manga_id}/show", status_code=status.HTTP_200_OK)
async def show_manga(
    manga_id: str,
    payload: MangaReasonRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Restore a hidden manga to public visibility after metadata integrity check (UC-2.2)."""
    return await manga_management_service.show_manga(db, admin, manga_id, payload.reason)


@router.delete("/admin/mangas/{manga_id}", status_code=status.HTTP_200_OK)
async def delete_manga(
    manga_id: str,
    payload: MangaReasonRequest | None = Body(default=None),
    reason: str | None = Query(default=None),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Delete a manga if not currently syncing, and schedule MinIO cleanup (UC-2.4)."""
    final_reason = (payload.reason if payload else None) or reason or "Deleted by admin"
    return await manga_management_service.delete_manga(db, admin, manga_id, final_reason)


@router.get("/admin/analytics/mangas", status_code=status.HTTP_200_OK)
async def get_manga_analytics(
    period: str = Query(default="month", pattern=r"^(day|week|month|custom)$"),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    tag_slug: str | None = Query(default=None),
    manga_id: str | None = Query(default=None),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """View manga interaction analytics and Top/Bottom rankings (UC-2.5)."""
    return await manga_management_service.get_manga_analytics(
        db=db,
        period=period,
        from_date=from_date,
        to_date=to_date,
        tag_slug=tag_slug,
        manga_id=manga_id,
    )
