"""Unit tests for log redaction engine (backend/core/log_redaction.py)."""

import json

from backend.core.log_redaction import redact


def test_redact_minio_presigned_url():
    url = "http://minio:9000/bucket/img.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20261014%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=d2c6e61f185"
    redacted = redact(url)
    assert "d2c6e61f185" not in redacted
    assert "AKIAIOSFODNN7EXAMPLE" not in redacted
    assert "X-Amz-Signature=[REDACTED]" in redacted
    assert "X-Amz-Credential=[REDACTED]" in redacted


def test_redact_query_params():
    msg = "GET /api/sync?key=secret123&other=ok&api_key=secret456&token=token789&client_secret=cs999"
    redacted = redact(msg)
    assert "secret123" not in redacted
    assert "secret456" not in redacted
    assert "token789" not in redacted
    assert "cs999" not in redacted
    assert "other=ok" in redacted


def test_redact_authorization_header():
    header1 = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    header2 = "Authorization: Basic dXNlcjpwYXNzd29yZA=="
    assert redact(header1) == "Authorization: Bearer [REDACTED]"
    assert redact(header2) == "Authorization: Basic [REDACTED]"


def test_redact_google_ai_key():
    key = "AIzaSyD-1234567890abcdefghijklmnopqrst"  # 39 chars total: AIza + 35 chars
    msg = f"Connecting to Gemini with key {key} now"
    redacted = redact(msg)
    assert key not in redacted
    assert "[REDACTED]" in redacted


def test_redact_json_preserves_validity():
    payload = {
        "user": "test_user",
        "password": "super_secret_password_123",
        "client_secret": "top_secret_oauth_key",
        "nested": {
            "gemini_api_key": "AIzaSyD-1234567890abcdefghijklmnopqrst",
            "info": "This is safe",
        },
    }
    raw_json = json.dumps(payload)
    redacted_json = redact(raw_json)

    # Output must be strictly valid JSON
    parsed = json.loads(redacted_json)
    assert parsed["user"] == "test_user"
    assert parsed["password"] == "[REDACTED]"
    assert parsed["client_secret"] == "[REDACTED]"
    assert parsed["nested"]["gemini_api_key"] == "[REDACTED]"
    assert parsed["nested"]["info"] == "This is safe"


def test_redact_plain_safe_text():
    safe = "Normal log message: processing chapter 42 for manga 'One Piece'"
    assert redact(safe) == safe
