"""Unit tests for ELK utility scripts (bootstrap_env, prune_logs, smoke_logs)."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
import json

from scripts.elk.bootstrap_env import (
    CREDENTIAL_KEYS,
    ENCRYPTION_KEY,
    bootstrap_elk_env,
)
from scripts.elk.prune_logs import prune_logs
from scripts.elk.smoke_logs import emit_smoke_logs
from backend.config import settings


def test_bootstrap_elk_env(tmp_path: Path):
    template = tmp_path / ".env.example"
    template.write_text(
        "ELASTIC_VERSION=8.17.0\n"
        "ELASTIC_PASSWORD=placeholder\n"
        "KIBANA_PASSWORD=placeholder\n"
        "KIBANA_ENCRYPTION_KEY=placeholder\n"
        "KIBANA_VIEWER_PASSWORD=placeholder\n"
        "LOGSTASH_WRITER_PASSWORD=placeholder\n"
        "APP_ES_PASSWORD=placeholder\n",
        encoding="utf-8",
    )
    output = tmp_path / ".env"
    log_dir = tmp_path / "logs"

    creds = bootstrap_elk_env(template, output, log_dir)

    assert output.exists()
    assert log_dir.exists()
    for key in CREDENTIAL_KEYS:
        assert key in creds
        assert creds[key] != "placeholder"
        assert len(creds[key]) >= 16

    assert len(creds[ENCRYPTION_KEY]) >= 32

    content = output.read_text(encoding="utf-8")
    assert "ELASTIC_VERSION=8.17.0" in content
    assert "placeholder" not in content

    # Should not overwrite without force
    second_run = bootstrap_elk_env(template, output, log_dir, force=False)
    assert second_run == {}


def test_prune_logs(tmp_path: Path):
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)
    old_date = today - timedelta(days=10)
    very_old_date = today - timedelta(days=35)

    f_today = tmp_path / f"api-{today.strftime('%Y-%m-%d')}.ndjson"
    f_yesterday = tmp_path / f"api-{yesterday.strftime('%Y-%m-%d')}.ndjson"
    f_old = tmp_path / f"api-{old_date.strftime('%Y-%m-%d')}.ndjson"
    f_very_old = tmp_path / f"worker_ocr-{very_old_date.strftime('%Y-%m-%d')}.ndjson"

    for f in (f_today, f_yesterday, f_old, f_very_old):
        f.write_text("log data\n", encoding="utf-8")

    # 1. Dry run with retention = 7 days
    dry_pruned = prune_logs(tmp_path, days=7, dry_run=True)
    assert len(dry_pruned) == 2
    assert f_old in dry_pruned
    assert f_very_old in dry_pruned
    # Files must still exist on disk
    assert f_old.exists()
    assert f_very_old.exists()

    # 2. Actual run with retention = 7 days
    pruned = prune_logs(tmp_path, days=7, dry_run=False)
    assert len(pruned) == 2
    assert not f_old.exists()
    assert not f_very_old.exists()
    assert f_today.exists()
    assert f_yesterday.exists()

    # 3. Test that today is never pruned even with days=0
    prune_logs(tmp_path, days=0, dry_run=False)
    assert f_today.exists()
    assert not f_yesterday.exists()


def test_smoke_logs(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "log_dir", str(tmp_path))
    monkeypatch.setattr(settings, "log_file_enabled", True)

    emit_smoke_logs()

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    smoke_file = tmp_path / f"smoke-{today}.ndjson"
    assert smoke_file.exists()

    lines = smoke_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) >= 4

    content = smoke_file.read_text(encoding="utf-8")
    # Must contain Vietnamese text when parsed from JSON
    first_record = json.loads(lines[0])
    assert "tiếng Việt có dấu" in first_record["message"]
    # Secrets must be redacted
    assert "mock_sig_123456789" not in content
    assert "AIzaSyD" not in content
    assert "mock_secret_jwt_token_here" not in content
    assert "[REDACTED]" in content

    # Every line must be valid JSON
    for line in lines:
        parsed = json.loads(line)
        assert "@timestamp" in parsed
        assert "log.level" in parsed
