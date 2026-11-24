"""Security primitives & tunnel isolation middleware for the External Source Connector.

Provides:
- Constant-time API key authentication (`X-Connector-API-Key` or `Authorization: Bearer <key>`).
- Tunnel host guard ASGI middleware (`ConnectorExposureMiddleware`) preventing public ngrok /
  Cloudflare tunnels pointed at the main backend from accessing personal review or admin routes.
- Bucket allowlist & object-key path traversal checks for the Zero-Copy media proxy.
- HMAC-SHA256 webhook payload signing and verification helpers.
- Callback URL validation with optional private-network SSRF protection.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import re
import time
from typing import Dict, Iterable, Optional, Tuple
from urllib.parse import urlparse

from fastapi import HTTPException, Request, status
from starlette.types import ASGIApp, Receive, Scope, Send

from backend.config import settings

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]", "testserver"}
_BUCKET_RE = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
_ALLOWED_TUNNEL_PREFIXES = ("/api/connector/v1",)
_ALLOWED_TUNNEL_EXACT = ("/health",)


def _strip_port(host_header: str) -> str:
    host = (host_header or "").strip().lower()
    if not host:
        return ""
    # Handle comma-separated X-Forwarded-Host values (first hop is external edge)
    if "," in host:
        host = host.split(",", 1)[0].strip()
    if host.startswith("["):
        end_idx = host.find("]")
        return host[: end_idx + 1] if end_idx != -1 else host
    if ":" in host:
        return host.rsplit(":", 1)[0]
    return host


def is_external_tunnel_host(host: Optional[str], forwarded_host: Optional[str] = None) -> bool:
    """Return True if the request arrived via a non-loopback / external tunnel host."""
    if forwarded_host:
        fwd_clean = _strip_port(forwarded_host)
        if fwd_clean and fwd_clean not in _LOCAL_HOSTS:
            return True
    if host:
        host_clean = _strip_port(host)
        if host_clean and host_clean not in _LOCAL_HOSTS:
            return True
    return False


def is_connector_allowed_path(path: str) -> bool:
    """Return True if path is permitted through an external tunnel."""
    if path in _ALLOWED_TUNNEL_EXACT:
        return True
    for prefix in _ALLOWED_TUNNEL_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return True
    return False


class ConnectorExposureMiddleware:
    """Pure ASGI middleware that restricts non-loopback tunnel requests to Connector routes only.

    Protects the personal review/management API if ngrok or Cloudflare Tunnel is pointed at
    the main backend port (:8000). Local browser/Vite traffic (`localhost` / `127.0.0.1`) is
    unaffected.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not settings.connector_enforce_tunnel_path_guard:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if is_connector_allowed_path(path):
            await self.app(scope, receive, send)
            return

        host = None
        forwarded_host = None
        for raw_name, raw_val in scope.get("headers", []):
            name = raw_name.lower()
            if name == b"host":
                host = raw_val.decode("latin-1", errors="ignore")
            elif name == b"x-forwarded-host":
                forwarded_host = raw_val.decode("latin-1", errors="ignore")

        if is_external_tunnel_host(host, forwarded_host):
            body = json.dumps(
                {
                    "error": {
                        "code": "CONNECTOR_ROUTE_RESTRICTED",
                        "message": (
                            "External tunnel requests may only access /api/connector/v1/* and /health. "
                            "Personal review and admin endpoints are blocked from external hosts."
                        ),
                    }
                }
            ).encode("utf-8")
            await send(
                {
                    "type": "http.response.start",
                    "status": status.HTTP_403_FORBIDDEN,
                    "headers": [
                        (b"content-type", b"application/json; charset=utf-8"),
                        (b"content-length", str(len(body)).encode("ascii")),
                        (b"cache-control", b"no-store"),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        await self.app(scope, receive, send)


def _extract_presented_api_key(request: Request) -> str:
    direct = (request.headers.get("X-Connector-API-Key") or "").strip()
    if direct:
        return direct
    auth_header = (request.headers.get("Authorization") or "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return ""


async def verify_connector_auth(request: Request) -> str:
    """FastAPI dependency enforcing External Source Connector API key authentication.

    Fail-closed policy:
    - If `connector_enabled` is False -> 503.
    - If `connector_api_key` is set -> require exact constant-time match via
      `X-Connector-API-Key` or `Authorization: Bearer <key>` (401 otherwise).
    - If `connector_api_key` is empty -> only allowed when BOTH
      `connector_allow_unauthenticated_local=True` AND request is strictly local loopback.
    """
    if not settings.connector_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "CONNECTOR_DISABLED",
                "message": "External Source Connector is disabled on this server.",
            },
        )

    configured_key = (settings.connector_api_key or "").strip()
    is_external = is_external_tunnel_host(
        request.headers.get("host"),
        request.headers.get("x-forwarded-host"),
    )

    if not configured_key:
        if settings.connector_allow_unauthenticated_local and not is_external:
            return "local_open"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "CONNECTOR_API_KEY_NOT_CONFIGURED",
                "message": (
                    "CONNECTOR_API_KEY must be configured in backend/.env before accepting connector requests."
                ),
            },
        )

    presented = _extract_presented_api_key(request)
    if not presented or not hmac.compare_digest(presented.encode("utf-8"), configured_key.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "CONNECTOR_UNAUTHORIZED",
                "message": "Missing or invalid connector API key (send X-Connector-API-Key or Authorization: Bearer).",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    return "api_key"


def validate_safe_media_ref(
    bucket: str,
    object_key: str,
    *,
    allowed_buckets: Optional[Iterable[str]] = None,
) -> Tuple[str, str]:
    """Validate `(bucket, object_key)` against bucket allowlist and path-traversal attacks."""
    clean_bucket = (bucket or "").strip()
    if not clean_bucket or len(clean_bucket) > 63 or not _BUCKET_RE.match(clean_bucket):
        raise ValueError("Invalid object storage bucket name")

    allowed = set(allowed_buckets) if allowed_buckets is not None else {settings.minio_bucket}
    if clean_bucket not in allowed:
        raise ValueError(f"Bucket '{clean_bucket}' is not in the connector allowlist")

    if not object_key or not isinstance(object_key, str):
        raise ValueError("Object key must not be empty")
    if object_key.startswith("/") or "\\" in object_key:
        raise ValueError("Object key contains forbidden leading slash or backslash")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in object_key):
        raise ValueError("Object key contains control characters")

    segments = object_key.split("/")
    if any(seg in ("", ".", "..") for seg in segments):
        raise ValueError("Object key contains unsafe path traversal segments")

    return clean_bucket, object_key


def validate_callback_url(url: str, *, allow_private: Optional[bool] = None) -> str:
    """Validate downstream CDC webhook callback URL."""
    clean_url = (url or "").strip()
    parsed = urlparse(clean_url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("callback_url must use http or https scheme")
    if not parsed.hostname:
        raise ValueError("callback_url must include a valid hostname")

    allow_priv = settings.connector_webhook_allow_private_urls if allow_private is None else allow_private
    if not allow_priv:
        host_lower = parsed.hostname.lower()
        if host_lower in ("localhost", "127.0.0.1", "::1"):
            raise ValueError("Private/loopback callback_url is disallowed by server policy")
        try:
            ip = ipaddress.ip_address(host_lower)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                raise ValueError("Private/internal IP callback_url is disallowed by server policy")
        except ValueError as exc:
            # Hostname is not a raw IP literal — only re-raise our own policy errors
            if "disallowed" in str(exc):
                raise

    return clean_url


def sign_webhook_payload(
    secret: str,
    raw_body: bytes,
    *,
    timestamp: Optional[int] = None,
) -> Dict[str, str]:
    """Create canonical HMAC-SHA256 signature headers for outbound CDC webhook delivery.

    Emits both:
    - `X-Manga-Source-Timestamp`: Unix epoch seconds.
    - `X-Manga-Source-Signature`: `t=<ts>,v1=<hmac_sha256(secret, f"{ts}.".encode() + raw_body)>`
      (timestamp-bound replay-resistant signature).
    - `X-Webhook-Signature-256`: `sha256=<hmac_sha256(secret, raw_body)>`
      (standard raw-body HMAC for simple webhook verifiers).
    """
    ts = int(time.time()) if timestamp is None else int(timestamp)
    secret_bytes = (secret or "").encode("utf-8")

    ts_signed_input = f"{ts}.".encode("ascii") + raw_body
    v1_digest = hmac.new(secret_bytes, ts_signed_input, hashlib.sha256).hexdigest()
    body_digest = hmac.new(secret_bytes, raw_body, hashlib.sha256).hexdigest()

    return {
        "X-Manga-Source-Timestamp": str(ts),
        "X-Manga-Source-Signature": f"t={ts},v1={v1_digest}",
        "X-Webhook-Signature-256": f"sha256={body_digest}",
    }


def verify_webhook_signature(
    *,
    secret: str,
    raw_body: bytes,
    signature_header: str,
    timestamp_header: Optional[str] = None,
    tolerance_seconds: Optional[int] = None,
    now_timestamp: Optional[int] = None,
) -> bool:
    """Verify `X-Manga-Source-Signature` (`t=<ts>,v1=<hex>`) or `sha256=<hex>`."""
    if not secret or not signature_header:
        return False
    secret_bytes = secret.encode("utf-8")
    sig = signature_header.strip()

    if sig.startswith("sha256="):
        expected = hmac.new(secret_bytes, raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig[7:], expected)

    parts: Dict[str, str] = {}
    for token in sig.split(","):
        if "=" in token:
            k, v = token.split("=", 1)
            parts[k.strip()] = v.strip()

    ts_str = parts.get("t") or (timestamp_header or "").strip()
    v1 = parts.get("v1", "")
    if not ts_str or not v1:
        return False

    try:
        ts_val = int(ts_str)
    except ValueError:
        return False

    if tolerance_seconds is not None:
        current = int(time.time()) if now_timestamp is None else int(now_timestamp)
        if abs(current - ts_val) > tolerance_seconds:
            return False

    expected_v1 = hmac.new(secret_bytes, f"{ts_val}.".encode("ascii") + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(v1, expected_v1)
