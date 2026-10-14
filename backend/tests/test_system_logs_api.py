"""Unit tests for System Logs API and ELK Status endpoints."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from starlette.testclient import TestClient

from backend.config import settings
from backend.main import app
from backend.services.system_log_service import system_log_service


@pytest.fixture
def mock_ndjson_logs(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "log_dir", str(tmp_path))
    monkeypatch.setattr(settings, "es_enabled", False)

    file1 = tmp_path / "api-2026-10-14.ndjson"
    lines = [
        json.dumps(
            {
                "@timestamp": "2026-10-14T10:00:00Z",
                "log": {"level": "info", "logger": "backend.access"},
                "service": {"name": "api"},
                "message": "GET /api/manga 200",
                "trace": {"id": "trace-uuid-1"},
                "http": {"request": {"method": "GET"}, "response": {"status_code": 200}},
                "url": {"path": "/api/manga"},
                "event": {"duration": 45000000},
            }
        ),
        json.dumps(
            {
                "@timestamp": "2026-10-14T10:05:00Z",
                "log": {"level": "error", "logger": "backend.access"},
                "service": {"name": "api"},
                "message": "POST /api/manga 500",
                "trace": {"id": "trace-uuid-2"},
                "http": {"request": {"method": "POST"}, "response": {"status_code": 500}},
                "url": {"path": "/api/manga"},
                "error": {"type": "DatabaseError", "message": "Connection lost"},
                "event": {"duration": 120000000},
            }
        ),
    ]
    file1.write_text("\n".join(lines) + "\n", encoding="utf-8")

    file2 = tmp_path / "worker_ocr-2026-10-14.ndjson"
    ocr_lines = [
        json.dumps(
            {
                "@timestamp": "2026-10-14T10:10:00Z",
                "log": {"level": "warning", "logger": "tasks.ocr"},
                "service": {"name": "worker_ocr"},
                "message": "OCR text extraction low confidence",
                "trace": {"id": "trace-uuid-2"},
                "manga": {"task_id": "ocr-job-42", "stage": "detection"},
            }
        )
    ]
    file2.write_text("\n".join(ocr_lines) + "\n", encoding="utf-8")
    return tmp_path


def test_get_system_logs_local_ndjson_mode(mock_ndjson_logs):
    client = TestClient(app)
    response = client.get("/api/system-logs")
    assert response.status_code == 200
    data = response.json()

    assert data["source_engine"] == "local_ndjson"
    assert data["total"] == 3
    assert len(data["items"]) == 3
    # Sorted by timestamp desc
    assert data["items"][0]["service_name"] == "worker_ocr"


def test_get_system_logs_filtered_by_service_and_level(mock_ndjson_logs):
    client = TestClient(app)
    # Filter by service
    resp_svc = client.get("/api/system-logs?service_name=worker_ocr")
    assert resp_svc.status_code == 200
    assert resp_svc.json()["total"] == 1
    assert resp_svc.json()["items"][0]["service_name"] == "worker_ocr"

    # Filter by level
    resp_lvl = client.get("/api/system-logs?level=error")
    assert resp_lvl.status_code == 200
    assert resp_lvl.json()["total"] == 1
    assert resp_lvl.json()["items"][0]["level"] == "error"

    # Filter by trace_id (cross-service correlation)
    resp_trace = client.get("/api/system-logs?trace_id=trace-uuid-2")
    assert resp_trace.status_code == 200
    # Both api 500 error and worker_ocr warning share trace-uuid-2
    assert resp_trace.json()["total"] == 2


def test_get_system_logs_elasticsearch_mode(monkeypatch):
    monkeypatch.setattr(settings, "es_enabled", True)
    mock_es_result = {
        "total": 1,
        "items": [
            {
                "id": "es_hit_1",
                "timestamp": "2026-10-14T12:00:00Z",
                "level": "info",
                "service_name": "api",
                "message": "ES search result",
            }
        ],
        "skip": 0,
        "limit": 50,
        "source_engine": "elasticsearch",
    }
    with patch.object(system_log_service, "_query_elasticsearch", new_callable=AsyncMock, return_value=mock_es_result):
        client = TestClient(app)
        resp = client.get("/api/system-logs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_engine"] == "elasticsearch"
        assert data["total"] == 1


def test_get_system_log_stats(mock_ndjson_logs):
    client = TestClient(app)
    response = client.get("/api/system-logs/stats")
    assert response.status_code == 200
    data = response.json()

    assert data["total_logs"] == 3
    assert data["error_count"] == 1
    assert data["warning_count"] == 1
    assert data["by_service"]["api"] == 2
    assert data["by_service"]["worker_ocr"] == 1


def test_get_elk_status(mock_ndjson_logs):
    client = TestClient(app)
    response = client.get("/api/system-logs/elk-status")
    assert response.status_code == 200
    data = response.json()

    assert data["es_enabled"] is False
    assert "kibana_embed_dashboard_url" in data
    assert "kibana_embed_discover_url" in data
    assert data["local_log_files_count"] == 2
    assert data["local_log_bytes"] > 0
