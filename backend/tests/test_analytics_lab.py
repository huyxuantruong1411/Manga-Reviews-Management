"""Tests for read-only Analytics Lab Arrow delivery router and security guards."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers.analytics_lab import ARROW_MEDIA_TYPE
from backend.routers.analytics_lab import router as analytics_lab_router


def _build_test_client(monkeypatch: pytest.MonkeyPatch, analytics_home: Path) -> TestClient:
    monkeypatch.setenv("ANALYTICS_HOME", str(analytics_home))
    app = FastAPI()
    app.include_router(analytics_lab_router)
    return TestClient(app)


def _seed_release(home: Path, release_id: str = "rel-test-1") -> bytes:
    rel_dir = home / "releases" / release_id
    arrow_dir = rel_dir / "arrow"
    arrow_dir.mkdir(parents=True, exist_ok=True)
    payload = b"ARROW_IPC_STREAM_MOCK_BYTES"
    arrow_file = arrow_dir / "gld_taste_calibration.arrow"
    arrow_file.write_bytes(payload)
    sha = hashlib.sha256(payload).hexdigest()

    manifest = {
        "release_id": release_id,
        "snapshot_date": "2026-11-28",
        "status": "published",
        "datasets": {
            "gld_taste_calibration": {
                "name": "gld_taste_calibration",
                "enabled": True,
                "relative_path": "arrow/gld_taste_calibration.arrow",
                "rows": 10,
                "bytes": len(payload),
                "sha256": sha,
                "mime_type": ARROW_MEDIA_TYPE,
            },
            "gld_disabled_mart": {
                "name": "gld_disabled_mart",
                "enabled": False,
                "relative_path": "arrow/gld_disabled_mart.arrow",
            },
            "gld_traversal_mart": {
                "name": "gld_traversal_mart",
                "enabled": True,
                "relative_path": "arrow/../../secret.txt",
            },
        },
    }
    (rel_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (home / "releases" / "current_release.json").write_text(
        json.dumps({"release_id": release_id, "snapshot_date": "2026-11-28"}),
        encoding="utf-8",
    )
    return payload


def test_health_no_release_returns_graceful_status(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    client = _build_test_client(monkeypatch, tmp_path / "empty_analytics")
    resp = client.get("/api/analytics-lab/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "no_release_published"

    manifest_resp = client.get("/api/analytics-lab/manifest")
    assert manifest_resp.status_code == 404


def test_serves_allowlisted_arrow_and_rejects_unlisted_or_traversal(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    home = tmp_path / "analytics_home"
    payload = _seed_release(home)
    client = _build_test_client(monkeypatch, home)

    health = client.get("/api/analytics-lab/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ready"
    assert health.json()["active_release_id"] == "rel-test-1"

    manifest = client.get("/api/analytics-lab/manifest")
    assert manifest.status_code == 200
    assert manifest.json()["release_id"] == "rel-test-1"

    arrow_resp = client.get("/api/analytics-lab/releases/rel-test-1/datasets/gld_taste_calibration.arrow")
    assert arrow_resp.status_code == 200
    assert arrow_resp.headers["content-type"].startswith(ARROW_MEDIA_TYPE)
    assert arrow_resp.headers["x-payload-sha256"] == hashlib.sha256(payload).hexdigest()
    assert "immutable" in arrow_resp.headers["cache-control"]
    assert arrow_resp.content == payload

    # Unlisted dataset -> 404
    assert client.get("/api/analytics-lab/releases/rel-test-1/datasets/unknown_mart.arrow").status_code == 404
    # Disabled dataset -> 403
    assert client.get("/api/analytics-lab/releases/rel-test-1/datasets/gld_disabled_mart.arrow").status_code == 403
    # Malicious relative_path in manifest -> 403
    assert client.get("/api/analytics-lab/releases/rel-test-1/datasets/gld_traversal_mart.arrow").status_code == 403
    # Invalid release ID / dataset name -> 422 or 404
    assert client.get("/api/analytics-lab/releases/..%2Fetc/datasets/gld_taste_calibration.arrow").status_code in (
        404,
        422,
    )
    assert client.get("/api/analytics-lab/releases/rel-test-1/datasets/BAD-NAME.arrow").status_code == 422
