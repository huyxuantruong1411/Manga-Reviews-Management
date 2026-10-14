"""Pure ASGI middleware for HTTP request tracing and structured logging.

Measures request latency in nanoseconds (``event.duration``), propagates
or generates ``X-Request-ID``, attaches ECS attributes, and integrates with
:mod:`backend.core.log_context`.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from typing import TYPE_CHECKING, Any

from backend.config import settings
from backend.core.log_context import log_context

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("backend.access")
_REQ_ID_RE = re.compile(r"^[A-Za-z0-9._\-]{8,64}$")


class RequestLoggingMiddleware:
    """Pure ASGI middleware that logs HTTP requests with ECS attributes."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")

        # Extract headers from ASGI scope
        raw_headers = scope.get("headers", [])
        req_id_str = ""
        user_agent = None

        for name, val in raw_headers:
            name_lower = name.lower()
            if name_lower == b"x-request-id":
                candidate = val.decode("latin-1", errors="ignore").strip()
                if _REQ_ID_RE.match(candidate):
                    req_id_str = candidate
            elif name_lower == b"user-agent":
                ua = val.decode("latin-1", errors="ignore").strip()
                if ua:
                    user_agent = ua

        if not req_id_str:
            req_id_str = uuid.uuid4().hex

        status_code = 500

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message.get("status", 200)
                headers = list(message.get("headers", []))
                has_header = any(k.lower() == b"x-request-id" for k, _ in headers)
                if not has_header:
                    headers.append((b"x-request-id", req_id_str.encode("latin-1")))
                    message["headers"] = headers
            await send(message)

        # Skip paths (e.g. /health)
        if path in settings.log_skip_paths:
            with log_context(request_id=req_id_str):
                await self.app(scope, receive, send_wrapper)
            return

        method = scope.get("method", "GET")
        client = scope.get("client")
        client_ip = client[0] if client else None

        start_ns = time.perf_counter_ns()
        with log_context(request_id=req_id_str):
            try:
                await self.app(scope, receive, send_wrapper)
            finally:
                duration_ns = time.perf_counter_ns() - start_ns
                duration_ms = round(duration_ns / 1_000_000, 2)

                level = logging.INFO
                if status_code >= 500:
                    level = logging.ERROR
                elif status_code >= 400:
                    level = logging.WARNING

                extra: dict[str, Any] = {
                    "http.request.method": method,
                    "http.response.status_code": status_code,
                    "url.path": path,
                    "event.duration": duration_ns,
                }
                if client_ip:
                    extra["client.ip"] = client_ip
                if user_agent:
                    extra["user_agent.original"] = user_agent

                logger.log(
                    level,
                    f"{method} {path} {status_code} - {duration_ms:.2f}ms",
                    extra=extra,
                )
