"""Sanitization, XSS protection, and forbidden keyword filtering utilities."""

from __future__ import annotations

import html
import re
import unicodedata

# UC-6.2 BR1: Forbidden system impersonation keywords in display_name
FORBIDDEN_DISPLAY_NAME_TERMS = (
    "admin",
    "administrator",
    "moderator",
    "system",
    "quản trị viên",
    "quan tri vien",
    "mod",
)

# UC-5.2: Forbidden profanity / abusive terms in comments
FORBIDDEN_COMMENT_WORDS = (
    "scam_link_ malware",
    "fuck_admin",
    "hack_account",
)

_SCRIPT_TAG_RE = re.compile(r"<\s*script[^>]*>.*?<\s*/\s*script\s*>", re.IGNORECASE | re.DOTALL)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_EVENT_HANDLER_RE = re.compile(r"on\w+\s*=\s*['\"][^'\"]*['\"]", re.IGNORECASE)
_JS_PROTOCOL_RE = re.compile(r"javascript\s*:", re.IGNORECASE)


def strip_accents(text: str) -> str:
    """Remove Vietnamese and Latin diacritics for accent-insensitive matching."""
    if not text:
        return ""
    text = text.replace("đ", "d").replace("Đ", "D")
    normalized = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def sanitize_plain_text(value: str) -> str:
    """Strip dangerous HTML/Script tags and event handlers to prevent XSS (UC-5.2, UC-6.2 NFR2)."""
    if not value:
        return ""
    cleaned = _SCRIPT_TAG_RE.sub("", value)
    cleaned = _EVENT_HANDLER_RE.sub("", cleaned)
    cleaned = _JS_PROTOCOL_RE.sub("", cleaned)
    cleaned = _HTML_TAG_RE.sub("", cleaned)
    return html.unescape(cleaned).strip()


def is_display_name_impersonating(display_name: str) -> bool:
    """Return True if display_name attempts to impersonate Admin/Moderator/System (UC-6.2 BR1)."""
    lowered = display_name.strip().lower()
    unaccented = strip_accents(lowered)
    tokens = set(re.findall(r"\w+", unaccented))
    for term in FORBIDDEN_DISPLAY_NAME_TERMS:
        term_norm = strip_accents(term.lower())
        if term_norm == "mod":
            if "mod" in tokens:
                return True
        elif term_norm in lowered or term_norm in unaccented:
            return True
    return False


def contains_forbidden_comment_words(content: str) -> bool:
    """Check if comment contains banned terms."""
    lowered = content.lower()
    return any(word in lowered for word in FORBIDDEN_COMMENT_WORDS)
