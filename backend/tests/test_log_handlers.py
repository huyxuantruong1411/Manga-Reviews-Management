"""Unit tests for DailyNdjsonFileHandler (backend/core/log_handlers.py)."""

import logging
from pathlib import Path
from unittest.mock import patch

from backend.core.log_handlers import DailyNdjsonFileHandler


def test_handler_creates_file_and_writes_ndjson(tmp_path: Path):
    handler = DailyNdjsonFileHandler(str(tmp_path), "api")
    formatter = logging.Formatter("%(message)s")
    handler.setFormatter(formatter)

    logger = logging.getLogger("test_logger_ndjson")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)

    logger.info("First line")
    logger.info("Second line")
    handler.close()
    logger.removeHandler(handler)

    files = list(tmp_path.glob("api-*.ndjson"))
    assert len(files) == 1
    content = files[0].read_text(encoding="utf-8").splitlines()
    assert content == ["First line", "Second line"]


def test_handler_supports_vietnamese_utf8(tmp_path: Path):
    handler = DailyNdjsonFileHandler(str(tmp_path), "worker_ocr")
    handler.setFormatter(logging.Formatter("%(message)s"))

    logger = logging.getLogger("test_logger_utf8")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)

    vn_text = "Trích xuất văn bản tiếng Việt có dấu: Đắc Nhân Tâm, Thám tử lừng danh Conan"
    logger.info(vn_text)
    handler.close()
    logger.removeHandler(handler)

    files = list(tmp_path.glob("worker_ocr-*.ndjson"))
    assert len(files) == 1
    content = files[0].read_text(encoding="utf-8")
    assert vn_text in content


def test_handler_rotates_date_without_rename(tmp_path: Path):
    handler = DailyNdjsonFileHandler(str(tmp_path), "api")
    handler.setFormatter(logging.Formatter("%(message)s"))

    logger = logging.getLogger("test_logger_rotation")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)

    with patch.object(handler, "_today_utc", return_value="2026-10-14"):
        logger.info("Day 1 message")

    with patch.object(handler, "_today_utc", return_value="2026-10-15"):
        logger.info("Day 2 message")

    handler.close()
    logger.removeHandler(handler)

    file_day1 = tmp_path / "api-2026-10-14.ndjson"
    file_day2 = tmp_path / "api-2026-10-15.ndjson"

    assert file_day1.exists()
    assert file_day2.exists()
    assert file_day1.read_text(encoding="utf-8").strip() == "Day 1 message"
    assert file_day2.read_text(encoding="utf-8").strip() == "Day 2 message"


def test_handler_error_swallowed_on_emit(tmp_path: Path):
    handler = DailyNdjsonFileHandler(str(tmp_path), "api")
    # Emit without setting formatter or with bad stream
    record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
    with patch.object(handler, "_ensure_stream", side_effect=OSError("Disk full")):
        # Must not raise
        handler.emit(record)
    handler.close()
