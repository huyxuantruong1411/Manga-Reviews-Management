"""Pydantic v2 schemas for System Logs API and ELK Status."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SystemLogItem(BaseModel):
    """Normalized ECS system log item displayed in the native UI."""

    id: str | None = Field(default=None, description="Unique record identifier")
    timestamp: str | None = Field(default=None, description="ISO timestamp of the event")
    level: str = Field(default="info", description="Log level: debug, info, warning, error, critical")
    logger: str | None = Field(default=None, description="Logger namespace")
    message: str = Field(default="", description="Sanitized log message")
    service_name: str | None = Field(default=None, description="Originating service: api, worker_ocr, etc.")
    trace_id: str | None = Field(default=None, description="Correlation Trace ID (X-Request-ID)")
    task_id: str | None = Field(default=None, description="OCR or background task identifier")
    job_id: str | None = Field(default=None, description="Translation job identifier")
    manga_id: str | None = Field(default=None, description="Related Manga identifier")
    chapter_id: str | None = Field(default=None, description="Related Chapter identifier")
    stage: str | None = Field(default=None, description="Translation / OCR pipeline stage")
    http_method: str | None = Field(default=None, description="HTTP request method")
    http_status: int | None = Field(default=None, description="HTTP response status code")
    url_path: str | None = Field(default=None, description="HTTP request URL path")
    duration_ms: float | None = Field(default=None, description="Latency duration in milliseconds")
    error_type: str | None = Field(default=None, description="Exception class name")
    error_message: str | None = Field(default=None, description="Exception summary message")
    error_stack_trace: str | None = Field(default=None, description="Exception stack trace string")
    raw: dict[str, Any] | None = Field(default=None, description="Full raw ECS JSON payload")


class SystemLogPaginationResponse(BaseModel):
    """Paginated response containing system logs and active source engine."""

    total: int = Field(description="Total number of matching log records")
    items: list[SystemLogItem] = Field(default_factory=list, description="Page of system log items")
    skip: int = Field(default=0, description="Offset count")
    limit: int = Field(default=20, description="Items per page")
    source_engine: str = Field(description="'elasticsearch' or 'local_ndjson'")


class SystemLogStatsResponse(BaseModel):
    """Aggregate KPIs for system logs."""

    total_logs: int = Field(default=0)
    error_count: int = Field(default=0)
    warning_count: int = Field(default=0)
    by_service: dict[str, int] = Field(default_factory=dict)
    by_level: dict[str, int] = Field(default_factory=dict)
    source_engine: str = Field(description="'elasticsearch' or 'local_ndjson'")


class ElkStatusResponse(BaseModel):
    """Live connectivity and health metrics for Elasticsearch & Kibana."""

    es_enabled: bool = Field(description="Whether ES is enabled in backend configuration")
    es_connected: bool = Field(description="Whether backend is actively connected to ES")
    es_status: str = Field(description="ES cluster status: green, yellow, red, unhealthy, disabled")
    kibana_url: str = Field(description="Base URL of Kibana")
    kibana_available: bool = Field(description="Whether Kibana responded affirmatively to health check")
    kibana_embed_dashboard_url: str = Field(description="Direct URL to embed Kibana Dashboard in iframe")
    kibana_embed_discover_url: str = Field(description="Direct URL to embed Kibana Discover in iframe")
    local_log_files_count: int = Field(default=0, description="Number of daily .ndjson files in log_dir")
    local_log_bytes: int = Field(default=0, description="Total size in bytes of local log files")
