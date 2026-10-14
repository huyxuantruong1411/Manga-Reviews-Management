"""Router endpoints for System Logs and ELK Stack Status."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Query

from backend.models.system_log import (
    ElkStatusResponse,
    SystemLogPaginationResponse,
    SystemLogStatsResponse,
)
from backend.services.system_log_service import system_log_service

router = APIRouter(prefix="/api/system-logs", tags=["System Logs"])


@router.get("", response_model=SystemLogPaginationResponse)
async def get_system_logs(
    service_name: str | None = Query(default=None, description="Filter by service name: api, worker_ocr, etc."),
    level: str | None = Query(default=None, description="Filter by log level: info, warning, error, critical"),
    trace_id: str | None = Query(default=None, description="Filter by correlation Trace ID"),
    task_id: str | None = Query(default=None, description="Filter by OCR task ID"),
    job_id: str | None = Query(default=None, description="Filter by Translation job ID"),
    search: str | None = Query(default=None, description="Search term for message or logger"),
    start_date: datetime | None = Query(default=None, description="Start date timestamp"),
    end_date: datetime | None = Query(default=None, description="End date timestamp"),
    skip: int = Query(default=0, ge=0, description="Pagination offset"),
    limit: int = Query(default=50, ge=1, le=200, description="Items per page"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$", description="Sort order by timestamp"),
):
    """Retrieve system logs from Elasticsearch with automatic fallback to local NDJSON files."""
    return await system_log_service.get_system_logs(
        service_name=service_name,
        level=level,
        trace_id=trace_id,
        task_id=task_id,
        job_id=job_id,
        search=search,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit,
        sort_order=sort_order,
    )


@router.get("/stats", response_model=SystemLogStatsResponse)
async def get_system_log_stats():
    """Retrieve aggregated counts and breakdowns by service and severity level."""
    return await system_log_service.get_system_log_stats()


@router.get("/elk-status", response_model=ElkStatusResponse)
async def get_elk_status():
    """Retrieve connectivity status and direct embed URLs for Elasticsearch and Kibana."""
    return await system_log_service.get_elk_status()
