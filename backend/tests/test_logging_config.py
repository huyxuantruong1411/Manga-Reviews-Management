"""Unit tests for logging configuration and ECS formatting (backend/core/logging_config.py)."""

import json
import logging

from backend.core.log_context import log_context
from backend.core.logging_config import _RedactingECSFormatter, setup_logging


def test_ecs_formatter_contains_mandatory_fields():
    formatter = _RedactingECSFormatter()
    record = logging.LogRecord("backend.test", logging.INFO, "file.py", 42, "Processing chapter", (), None)
    record.__dict__["service.name"] = "api"
    record.__dict__["service.environment"] = "test"
    record.__dict__["event.dataset"] = "mangalib.api"

    line = formatter.format(record)
    data = json.loads(line)

    assert "@timestamp" in data
    assert data["log.level"] == "info"
    assert data["message"] == "Processing chapter"
    assert data["service"]["name"] == "api"
    assert data["service"]["environment"] == "test"
    assert data["event"]["dataset"] == "mangalib.api"


def test_ecs_formatter_redacts_secrets():
    formatter = _RedactingECSFormatter()
    secret_msg = "User logged in with password: my_password_123 and token AIzaSyD-1234567890abcdefghijklmnopqrst"
    record = logging.LogRecord("backend.test", logging.INFO, "auth.py", 10, secret_msg, (), None)

    line = formatter.format(record)
    assert "AIzaSyD" not in line
    assert "[REDACTED]" in line


def test_log_context_injected_into_ecs_record():
    formatter = _RedactingECSFormatter()
    with log_context(request_id="req-trace-uuid-123456", task_id="ocr-task-888", manga_id="one-piece"):
        from backend.core.log_context import ContextFilter

        record = logging.LogRecord("backend.test", logging.INFO, "test.py", 1, "Context message", (), None)
        ContextFilter().filter(record)
        line = formatter.format(record)
        data = json.loads(line)

        assert data["trace"]["id"] == "req-trace-uuid-123456"
        assert data["manga"]["task_id"] == "ocr-task-888"
        assert data["manga"]["manga_id"] == "one-piece"


def test_setup_logging_idempotence():
    root = logging.getLogger()
    setup_logging("api")
    first_run_count = len(root.handlers)

    setup_logging("api")
    second_run_count = len(root.handlers)

    assert second_run_count == first_run_count
