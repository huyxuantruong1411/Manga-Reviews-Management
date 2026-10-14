"""Structured log context propagation using ContextVar.

Provides ``log_context`` context manager to attach business identifiers
(``trace.id``, ``manga.task_id``, ``manga.job_id``, etc.) to every
``logging.LogRecord`` emitted within the scope.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

_log_ctx: ContextVar[dict[str, Any] | None] = ContextVar("log_ctx", default=None)

# Maps internal field names → ECS-compatible dot-notation keys on LogRecord.
FIELD_MAP: dict[str, str] = {
    "request_id": "trace.id",
    "task_id": "manga.task_id",
    "job_id": "manga.job_id",
    "manga_id": "manga.manga_id",
    "chapter_id": "manga.chapter_id",
    "stage": "manga.stage",
}


@contextmanager
def log_context(**fields: Any) -> Iterator[None]:
    """Push *fields* into the logging context for the duration of the block.

    Only non-``None`` values are stored.  The previous context is restored
    when the block exits, even on exception.
    """
    current = dict(_log_ctx.get() or {})
    current.update({k: v for k, v in fields.items() if v is not None})
    token = _log_ctx.set(current)
    try:
        yield
    finally:
        _log_ctx.reset(token)


def get_log_context() -> dict[str, Any]:
    """Return a shallow copy of the current logging context dict."""
    return dict(_log_ctx.get() or {})


class ContextFilter(logging.Filter):
    """Inject current ``_log_ctx`` values onto every :class:`logging.LogRecord`.

    Field names are translated through :data:`FIELD_MAP` so that downstream
    ECS formatters can pick up ``trace.id``, ``manga.*`` etc.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        ctx = _log_ctx.get() or {}
        for key, value in ctx.items():
            setattr(record, FIELD_MAP.get(key, f"manga.{key}"), str(value))
        return True
