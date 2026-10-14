"""Daily-rotating NDJSON file handler for structured log output.

Writes append-only to ``<log_dir>/<service_name>-YYYY-MM-DD.ndjson``.
When the UTC date changes the handler seamlessly opens a new file
without renaming existing files — critical for:

* **Windows**: avoids file-lock conflicts when another process reads
  the file (e.g. Filebeat in polling mode).
* **Filebeat**: avoids inode/identity confusion caused by file renames.

Errors in ``emit()`` are swallowed so that a full disk or permission
problem never crashes the application process.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path


class DailyNdjsonFileHandler(logging.Handler):
    """Append-only handler that writes one JSON object per line.

    Parameters
    ----------
    log_dir:
        Directory to store log files (created if absent).
    service_name:
        Used in the filename prefix, e.g. ``api-2026-10-14.ndjson``.
    formatter:
        Must be set *before* calling ``emit`` (typically an ECS formatter
        configured in :mod:`backend.core.logging_config`).
    """

    def __init__(self, log_dir: str, service_name: str) -> None:
        super().__init__()
        self._log_dir = Path(log_dir)
        self._service_name = service_name
        self._current_date: str = ""
        self._stream: object | None = None
        # Ensure directory exists
        self._log_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _today_utc(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _ensure_stream(self, today: str) -> object:
        """Open (or rotate to) the file for *today*."""
        if self._current_date != today or self._stream is None:
            self._close_stream()
            filepath = self._log_dir / f"{self._service_name}-{today}.ndjson"
            # Open in append mode with UTF-8 and line-buffering
            self._stream = open(filepath, "a", encoding="utf-8", buffering=1)  # noqa: SIM115
            self._current_date = today
        return self._stream  # type: ignore[return-value]

    def _close_stream(self) -> None:
        if self._stream is not None:
            try:
                self._stream.close()  # type: ignore[union-attr]
            except Exception:
                pass
            self._stream = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def emit(self, record: logging.LogRecord) -> None:
        """Write a single JSON line.  Never raises."""
        try:
            today = self._today_utc()
            stream = self._ensure_stream(today)
            msg = self.format(record)
            stream.write(msg + "\n")  # type: ignore[union-attr]
        except Exception:
            # Swallow all errors — logging must never crash the app.
            self.handleError(record)

    def close(self) -> None:
        self._close_stream()
        super().close()
