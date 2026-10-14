"""Centralised logging configuration with optional ECS-JSON file output.

Call :func:`setup_logging` once per process (API server, ARQ worker) to:

1. Configure the root logger's console handler.
2. Optionally attach a :class:`~backend.core.log_handlers.DailyNdjsonFileHandler`
   that writes ECS-formatted JSON with secrets redacted.
3. Suppress noisy third-party loggers.
4. Optionally replace uvicorn's default access-log handler.

The function is **idempotent** — safe to call multiple times during
uvicorn reloads without duplicating handlers.
"""

from __future__ import annotations

import logging
import sys

from backend.config import settings
from backend.core.log_context import ContextFilter
from backend.core.log_redaction import redact

# Sentinel attribute set on the root logger to detect re-entry.
_SETUP_DONE_ATTR = "_manga_logging_configured"

# Third-party loggers whose default verbosity is too high.
_NOISY_LOGGERS = (
    "httpx",
    "httpcore",
    "urllib3",
    "pymongo",
    "elastic_transport",
    "elasticsearch",
    "PIL",
    "watchfiles",
    "arq",
)


class _ServiceFilter(logging.Filter):
    """Stamp every record with ``service.name``, ``service.environment``
    and ``event.dataset`` so that ECS formatters include them automatically.
    """

    def __init__(self, service_name: str, environment: str) -> None:
        super().__init__()
        self._service_name = service_name
        self._environment = environment
        self._dataset = f"mangalib.{service_name}"

    def filter(self, record: logging.LogRecord) -> bool:
        record.__dict__.setdefault("service.name", self._service_name)
        record.__dict__.setdefault("service.environment", self._environment)
        record.__dict__.setdefault("event.dataset", self._dataset)
        return True


class _RedactingECSFormatter(logging.Formatter):
    """ECS stdlib formatter that additionally runs :func:`redact` on the
    serialized JSON line.
    """

    def __init__(self) -> None:
        super().__init__()
        import ecs_logging

        self._inner = ecs_logging.StdlibFormatter()

    def format(self, record: logging.LogRecord) -> str:
        line = self._inner.format(record)
        return redact(line)


def setup_logging(
    service_name: str,
    *,
    replace_uvicorn_access: bool = False,
) -> None:
    """Configure structured logging for *service_name*.

    Parameters
    ----------
    service_name:
        Identifier stamped on every record (``api``, ``worker_ocr``, …).
    replace_uvicorn_access:
        If ``True``, silence ``uvicorn.access`` so our
        :class:`~backend.core.request_logging.RequestLoggingMiddleware`
        takes over request logging.
    """
    root = logging.getLogger()

    # Idempotency guard — don't double-configure on uvicorn reload.
    if getattr(root, _SETUP_DONE_ATTR, False):
        return
    setattr(root, _SETUP_DONE_ATTR, True)

    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    root.setLevel(level)

    # ------------------------------------------------------------------
    # Filters (applied to root so all handlers pick them up)
    # ------------------------------------------------------------------
    root.addFilter(ContextFilter())
    root.addFilter(_ServiceFilter(service_name, settings.service_environment))

    # ------------------------------------------------------------------
    # Console handler (always active — writes to stderr)
    # ------------------------------------------------------------------
    console = logging.StreamHandler(stream=sys.stderr)
    if settings.log_format == "json":
        console.setFormatter(_RedactingECSFormatter())
    else:
        console.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(name)s - %(message)s"))
    console.setLevel(level)
    root.addHandler(console)

    # ------------------------------------------------------------------
    # NDJSON file handler (opt-in via LOG_FILE_ENABLED=true)
    # ------------------------------------------------------------------
    if settings.log_file_enabled:
        from backend.core.log_handlers import DailyNdjsonFileHandler

        file_handler = DailyNdjsonFileHandler(settings.log_dir, service_name)
        file_handler.setFormatter(_RedactingECSFormatter())
        file_handler.setLevel(level)
        root.addHandler(file_handler)

    # ------------------------------------------------------------------
    # Suppress noisy loggers
    # ------------------------------------------------------------------
    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)

    # ------------------------------------------------------------------
    # Optionally replace uvicorn access log
    # ------------------------------------------------------------------
    if replace_uvicorn_access:
        logging.getLogger("uvicorn.access").handlers.clear()
        logging.getLogger("uvicorn.access").propagate = False

    # Remove any pre-existing basicConfig handler that main.py may have added.
    # We keep only the handlers we configured above.
    for h in root.handlers[:]:
        if h not in (console,) and not isinstance(h, logging.Handler.__class__):
            # Only remove generic StreamHandlers that look like basicConfig artefacts
            if (
                isinstance(h, logging.StreamHandler)
                and not isinstance(h, logging.FileHandler)
                and h is not console
                and h.stream is sys.stderr  # type: ignore[attr-defined]
            ):
                root.removeHandler(h)
