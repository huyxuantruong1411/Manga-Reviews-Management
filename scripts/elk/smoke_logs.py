"""Smoke test log emitter to verify ECS formatting, redaction, and log pipelines."""

from __future__ import annotations

import logging

from backend.config import settings
from backend.core.log_context import log_context
from backend.core.logging_config import setup_logging


def emit_smoke_logs() -> None:
    """Emits sample log records across INFO, WARNING, ERROR, and CRITICAL levels."""
    # Ensure file logging is enabled during smoke testing
    settings.log_file_enabled = True
    setup_logging("smoke")

    # If logging was already initialized earlier in the process without file output,
    # attach a DailyNdjsonFileHandler explicitly for smoke testing
    from backend.core.log_handlers import DailyNdjsonFileHandler
    from backend.core.logging_config import _RedactingECSFormatter

    root = logging.getLogger()
    if not any(isinstance(h, DailyNdjsonFileHandler) for h in root.handlers):
        file_handler = DailyNdjsonFileHandler(settings.log_dir, "smoke")
        file_handler.setFormatter(_RedactingECSFormatter())
        file_handler.setLevel(logging.INFO)
        root.addHandler(file_handler)

    logger = logging.getLogger("manga.smoke")

    with log_context(request_id="smoke-req-123456", task_id="smoke-task-789"):
        # 1. INFO: UTF-8 Vietnamese characters
        logger.info("Khởi chạy smoke test hệ thống Manga Reviews - tiếng Việt có dấu")

        # 2. WARNING: Mock MinIO presigned URL with signature
        logger.warning(
            "MinIO presigned download requested: "
            "http://127.0.0.1:9000/manga/page.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=MOCKCRED%2F20261014&X-Amz-Signature=mock_sig_123456789"
        )

        # 3. ERROR: Mock secrets (Gemini AIza key and Authorization header)
        logger.error(
            "Failed authentication using key AIzaSyD-1234567890abcdefghijklmnopqrst "
            "with header Authorization: Bearer mock_secret_jwt_token_here"
        )

        # 4. CRITICAL: Exception with stack trace
        try:
            raise RuntimeError("Mô phỏng lỗi nghiêm trọng trong pipeline xử lý OCR")
        except RuntimeError:
            logger.critical("Sự cố nghiêm trọng cần can thiệp", exc_info=True)


def main() -> None:
    print("Emitting smoke test logs...")
    emit_smoke_logs()
    print("Smoke logs emitted successfully.")


if __name__ == "__main__":
    main()
