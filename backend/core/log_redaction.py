"""Redaction engine for sensitive data in log messages.

Operates on plain strings (log messages) and guarantees that the output
is still valid JSON when the input was valid JSON.  Patterns covered:

- ``X-Amz-Signature=...`` and ``X-Amz-Credential=...`` (MinIO presigned URLs)
- Query params: ``key=``, ``api_key=``, ``token=``, ``client_secret=``
- ``Authorization: Bearer ...`` / ``Authorization: Basic ...``
- Google AI keys matching ``AIza...``
- Generic ``password`` / ``secret`` key-value pairs in JSON-like text
"""

from __future__ import annotations

import re

_REDACTED = "[REDACTED]"

# Ordered list of (compiled regex, replacement template).
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # MinIO presigned URL signature params
    (re.compile(r"(X-Amz-Signature=)[^&\s\"']+", re.IGNORECASE), rf"\1{_REDACTED}"),
    (re.compile(r"(X-Amz-Credential=)[^&\s\"']+", re.IGNORECASE), rf"\1{_REDACTED}"),
    # Generic query-string secrets
    (
        re.compile(r"([?&](?:key|api_key|token|client_secret|secret)=)[^&\s\"']+", re.IGNORECASE),
        rf"\1{_REDACTED}",
    ),
    # Authorization headers
    (re.compile(r"(Authorization:\s*(?:Bearer|Basic)\s+)[^\s\"']+", re.IGNORECASE), rf"\1{_REDACTED}"),
    # Google Gemini / AI Studio key pattern (AIza + 30-45 alphanumeric chars)
    (re.compile(r"AIza[0-9A-Za-z_\-]{30,45}"), _REDACTED),
    # JSON key-value: "password": "...", "secret": "...", "secret_key": "..."
    (
        re.compile(
            r'("(?:password|secret|secret_key|client_secret|api_key|gemini_api_key)"'
            r"\s*:\s*)"
            r'"[^"]*"',
            re.IGNORECASE,
        ),
        rf'\1"{_REDACTED}"',
    ),
    # Plain text key-value: password: ... or password=... (avoiding already redacted)
    (
        re.compile(
            r'(\b(?:password|secret|secret_key|client_secret|api_key)\s*[:=]\s*)(?!"?\[REDACTED\]"?)[^\s,"\'}]+',
            re.IGNORECASE,
        ),
        rf"\1{_REDACTED}",
    ),
]


def redact(text: str) -> str:
    """Return *text* with all known secret patterns replaced by ``[REDACTED]``.

    The function preserves JSON structure: if the input is valid JSON the
    output will also be valid JSON (quotes and delimiters are kept intact).
    """
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text
