"""System Log service supporting Elasticsearch querying with local NDJSON fallback."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

from backend.config import settings
from backend.core.elasticsearch import check_es_health, get_es_client
from backend.models.system_log import (
    ElkStatusResponse,
    SystemLogItem,
    SystemLogPaginationResponse,
    SystemLogStatsResponse,
)

logger = logging.getLogger("services.system_log")


class SystemLogService:
    """Manages system log querying across Elasticsearch and local NDJSON files."""

    def _parse_ecs_record(self, doc: dict[str, Any], fallback_id: str = "") -> SystemLogItem:
        """Normalize an ECS JSON dictionary into a typed SystemLogItem."""
        log_obj = doc.get("log") if isinstance(doc.get("log"), dict) else {}
        service_obj = doc.get("service") if isinstance(doc.get("service"), dict) else {}
        trace_obj = doc.get("trace") if isinstance(doc.get("trace"), dict) else {}
        manga_obj = doc.get("manga") if isinstance(doc.get("manga"), dict) else {}
        http_obj = doc.get("http") if isinstance(doc.get("http"), dict) else {}
        req_obj = http_obj.get("request") if isinstance(http_obj.get("request"), dict) else {}
        resp_obj = http_obj.get("response") if isinstance(http_obj.get("response"), dict) else {}
        url_obj = doc.get("url") if isinstance(doc.get("url"), dict) else {}
        error_obj = doc.get("error") if isinstance(doc.get("error"), dict) else {}
        event_obj = doc.get("event") if isinstance(doc.get("event"), dict) else {}

        duration_ns = event_obj.get("duration") or doc.get("event.duration")
        duration_ms = round(duration_ns / 1_000_000, 2) if isinstance(duration_ns, (int, float)) else None

        return SystemLogItem(
            id=str(doc.get("_id") or fallback_id or ""),
            timestamp=doc.get("@timestamp") or doc.get("timestamp"),
            level=(log_obj.get("level") or doc.get("log.level") or doc.get("level") or "info").lower(),
            logger=log_obj.get("logger") or doc.get("log.logger") or doc.get("logger"),
            message=doc.get("message", ""),
            service_name=service_obj.get("name") or doc.get("service.name") or doc.get("service_name"),
            trace_id=trace_obj.get("id") or doc.get("trace.id") or doc.get("trace_id"),
            task_id=manga_obj.get("task_id") or doc.get("manga.task_id") or doc.get("task_id"),
            job_id=manga_obj.get("job_id") or doc.get("manga.job_id") or doc.get("job_id"),
            manga_id=manga_obj.get("manga_id") or doc.get("manga.manga_id") or doc.get("manga_id"),
            chapter_id=manga_obj.get("chapter_id") or doc.get("manga.chapter_id") or doc.get("chapter_id"),
            stage=manga_obj.get("stage") or doc.get("manga.stage") or doc.get("stage"),
            http_method=req_obj.get("method") or doc.get("http.request.method"),
            http_status=resp_obj.get("status_code") or doc.get("http.response.status_code"),
            url_path=url_obj.get("path") or doc.get("url.path"),
            duration_ms=duration_ms,
            error_type=error_obj.get("type") or doc.get("error.type"),
            error_message=error_obj.get("message") or doc.get("error.message"),
            error_stack_trace=error_obj.get("stack_trace") or doc.get("error.stack_trace"),
            raw=doc,
        )

    # ------------------------------------------------------------------
    # Elasticsearch Mode
    # ------------------------------------------------------------------

    async def _query_elasticsearch(
        self,
        service_name: str | None = None,
        level: str | None = None,
        trace_id: str | None = None,
        task_id: str | None = None,
        job_id: str | None = None,
        search: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        skip: int = 0,
        limit: int = 50,
        sort_order: str = "desc",
    ) -> SystemLogPaginationResponse | None:
        """Query Elasticsearch data stream for logs."""
        client = get_es_client()
        if client is None:
            return None

        try:
            must_clauses: list[dict[str, Any]] = []
            filter_clauses: list[dict[str, Any]] = []

            if service_name and service_name != "all":
                filter_clauses.append({"term": {"service.name": service_name}})
            if level and level != "all":
                filter_clauses.append({"term": {"log.level": level.lower()}})
            if trace_id:
                filter_clauses.append({"term": {"trace.id": trace_id}})
            if task_id:
                filter_clauses.append({"term": {"manga.task_id": task_id}})
            if job_id:
                filter_clauses.append({"term": {"manga.job_id": job_id}})

            if start_date or end_date:
                range_query: dict[str, Any] = {}
                if start_date:
                    range_query["gte"] = start_date.isoformat()
                if end_date:
                    range_query["lte"] = end_date.isoformat()
                filter_clauses.append({"range": {"@timestamp": range_query}})

            if search and search.strip():
                must_clauses.append(
                    {
                        "multi_match": {
                            "query": search.strip(),
                            "fields": [
                                "message^2",
                                "log.logger",
                                "error.message",
                                "url.path",
                            ],
                        }
                    }
                )

            bool_query: dict[str, Any] = {}
            if must_clauses:
                bool_query["must"] = must_clauses
            if filter_clauses:
                bool_query["filter"] = filter_clauses
            if not bool_query:
                bool_query["must"] = [{"match_all": {}}]

            res = await client.search(
                index="logs-mangalib.*-*",
                query={"bool": bool_query},
                sort=[{"@timestamp": {"order": sort_order}}],
                from_=skip,
                size=limit,
            )

            hits = res.get("hits", {})
            total = hits.get("total", {}).get("value", 0)
            items: list[SystemLogItem] = []
            for hit in hits.get("hits", []):
                source = hit.get("_source", {})
                source["_id"] = hit.get("_id")
                items.append(self._parse_ecs_record(source, fallback_id=hit.get("_id", "")))

            return SystemLogPaginationResponse(
                total=total,
                items=items,
                skip=skip,
                limit=limit,
                source_engine="elasticsearch",
            )
        except Exception as e:
            logger.warning(f"Elasticsearch query failed, falling back to local files: {e}")
            return None

    # ------------------------------------------------------------------
    # Local NDJSON Fallback Mode
    # ------------------------------------------------------------------

    def _query_local_ndjson(
        self,
        service_name: str | None = None,
        level: str | None = None,
        trace_id: str | None = None,
        task_id: str | None = None,
        job_id: str | None = None,
        search: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        skip: int = 0,
        limit: int = 50,
        sort_order: str = "desc",
    ) -> SystemLogPaginationResponse:
        """Scan local NDJSON log files and return filtered results."""
        log_dir = Path(settings.log_dir)
        records: list[SystemLogItem] = []

        if not log_dir.exists():
            return SystemLogPaginationResponse(total=0, items=[], skip=skip, limit=limit, source_engine="local_ndjson")

        log_files = sorted(log_dir.glob("*.ndjson"), reverse=True)
        search_lower = search.strip().lower() if search and search.strip() else None
        target_level = level.lower() if level and level != "all" else None
        target_service = service_name if service_name and service_name != "all" else None

        line_counter = 0
        for log_file in log_files:
            try:
                with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        line_str = line.strip()
                        if not line_str:
                            continue
                        try:
                            doc = json.loads(line_str)
                        except json.JSONDecodeError:
                            continue

                        line_counter += 1
                        fallback_id = f"{log_file.stem}-{line_counter}"
                        item = self._parse_ecs_record(doc, fallback_id=fallback_id)

                        # Filtering
                        if target_service and item.service_name != target_service:
                            continue
                        if target_level and item.level != target_level:
                            continue
                        if trace_id and item.trace_id != trace_id:
                            continue
                        if task_id and item.task_id != task_id:
                            continue
                        if job_id and item.job_id != job_id:
                            continue

                        if search_lower:
                            matches = (
                                search_lower in item.message.lower()
                                or (item.logger and search_lower in item.logger.lower())
                                or (item.error_message and search_lower in item.error_message.lower())
                                or (item.url_path and search_lower in item.url_path.lower())
                            )
                            if not matches:
                                continue

                        records.append(item)
            except Exception as e:
                logger.warning(f"Error reading log file {log_file}: {e}")

        # Sort
        reverse = sort_order == "desc"
        records.sort(key=lambda r: r.timestamp or "", reverse=reverse)

        total = len(records)
        paged_items = records[skip : skip + limit]

        return SystemLogPaginationResponse(
            total=total,
            items=paged_items,
            skip=skip,
            limit=limit,
            source_engine="local_ndjson",
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_system_logs(
        self,
        service_name: str | None = None,
        level: str | None = None,
        trace_id: str | None = None,
        task_id: str | None = None,
        job_id: str | None = None,
        search: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        skip: int = 0,
        limit: int = 50,
        sort_order: str = "desc",
    ) -> SystemLogPaginationResponse:
        """Fetch system logs with primary Elasticsearch query and automatic NDJSON fallback."""
        if settings.es_enabled:
            es_response = await self._query_elasticsearch(
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
            if es_response is not None:
                return es_response

        # Fallback to local files
        return self._query_local_ndjson(
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

    async def get_system_log_stats(self) -> SystemLogStatsResponse:
        """Compute aggregate system log statistics across services and levels."""
        # Check local files for fallback computation
        log_dir = Path(settings.log_dir)
        by_service: dict[str, int] = {}
        by_level: dict[str, int] = {}
        total = 0
        error_count = 0
        warning_count = 0

        # Scan local files
        if log_dir.exists():
            for log_file in log_dir.glob("*.ndjson"):
                try:
                    with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                        for line in f:
                            if not line.strip():
                                continue
                            try:
                                doc = json.loads(line)
                            except Exception:
                                continue
                            total += 1
                            item = self._parse_ecs_record(doc)
                            svc = item.service_name or "unknown"
                            lvl = item.level or "info"

                            by_service[svc] = by_service.get(svc, 0) + 1
                            by_level[lvl] = by_level.get(lvl, 0) + 1

                            if lvl in ("error", "critical"):
                                error_count += 1
                            elif lvl == "warning":
                                warning_count += 1
                except Exception:
                    pass

        return SystemLogStatsResponse(
            total_logs=total,
            error_count=error_count,
            warning_count=warning_count,
            by_service=by_service,
            by_level=by_level,
            source_engine="local_ndjson",
        )

    async def get_elk_status(self) -> ElkStatusResponse:
        """Probe Elasticsearch and Kibana connectivity and collect local log metrics."""
        es_health = await check_es_health()
        es_connected = bool(es_health.get("connected", False))
        es_status = str(es_health.get("status", "disabled"))

        # Ping Kibana
        kibana_available = False
        if settings.kibana_url:
            try:
                async with httpx.AsyncClient(timeout=1.5) as client:
                    resp = await client.get(f"{settings.kibana_url}/api/status")
                    if resp.status_code == 200:
                        kibana_available = True
            except Exception:
                kibana_available = False

        # Local logs metrics
        log_dir = Path(settings.log_dir)
        local_files_count = 0
        local_bytes = 0
        if log_dir.exists():
            for f in log_dir.glob("*.ndjson"):
                local_files_count += 1
                try:
                    local_bytes += f.stat().st_size
                except Exception:
                    pass

        dashboard_embed = (
            f"{settings.kibana_url}/app/dashboards#/view/{settings.kibana_dashboard_id}"
            "?embed=true&_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-24h,to:now))"
        )
        discover_embed = (
            f"{settings.kibana_url}/app/discover#/?embed=true"
            "&_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-24h,to:now))"
        )

        return ElkStatusResponse(
            es_enabled=settings.es_enabled,
            es_connected=es_connected,
            es_status=es_status,
            kibana_url=settings.kibana_url,
            kibana_available=kibana_available,
            kibana_embed_dashboard_url=dashboard_embed,
            kibana_embed_discover_url=discover_embed,
            local_log_files_count=local_files_count,
            local_log_bytes=local_bytes,
        )


system_log_service = SystemLogService()
