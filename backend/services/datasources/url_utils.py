import ipaddress
import re
import urllib.parse
from typing import Optional, Tuple

from backend.models.datasource import SSRFSecurityError

ALLOWED_PROVIDERS = {
    "mangadex": {"mangadex.org", "api.mangadex.org"},
    "mangafire": {"mangafire.to", "www.mangafire.to"},
    "comix": {"comix.to", "www.comix.to"},
}

UUID_PATTERN = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
MANGAFIRE_WORK_ID_PATTERN = re.compile(r"^[a-zA-Z0-9]+$")
COMIX_WORK_ID_PATTERN = re.compile(r"^[a-zA-Z0-9]+$")


def validate_and_parse_source_url(raw_url: str, allow_test_hosts: bool = False) -> Tuple[str, str, str]:
    """
    Validates a URL against strict SSRF rules and extracts (provider, work_id, canonical_url).
    Rejects:
    - Non-http(s) schemes
    - Credentials/userinfo in URL
    - Private IP addresses, localhost (unless allow_test_hosts is True)
    - Domains not in the explicit allowlist
    """
    clean_url = raw_url.strip()
    try:
        parsed = urllib.parse.urlparse(clean_url)
    except Exception as e:
        raise SSRFSecurityError(f"Malformed URL: {e}")

    if parsed.scheme not in ("http", "https"):
        raise SSRFSecurityError(f"Unsupported URL scheme: {parsed.scheme!r}")

    # Reject userinfo
    if parsed.username or parsed.password:
        raise SSRFSecurityError("URLs with embedded userinfo are forbidden")

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise SSRFSecurityError("Missing hostname in URL")

    # Reject private/loopback IPs
    if not allow_test_hosts:
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local:
                raise SSRFSecurityError(f"Private IP address rejected: {hostname}")
        except ValueError:
            # Not an IP literal, domain name
            pass

        if hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
            raise SSRFSecurityError(f"Localhost target rejected: {hostname}")

    # Match allowlist
    matched_provider: Optional[str] = None
    for provider, domains in ALLOWED_PROVIDERS.items():
        if hostname in domains:
            matched_provider = provider
            break

    if not matched_provider:
        raise SSRFSecurityError(f"Host '{hostname}' is not in allowed datasources list")

    # Parse provider specific work identity
    path = parsed.path.rstrip("/")

    if matched_provider == "mangadex":
        # Format: /title/{uuid} or raw uuid in query
        match = re.search(r"/title/([0-9a-fA-F\-]{36})", path)
        if match:
            work_id = match.group(1).lower()
        else:
            raise SSRFSecurityError(f"Cannot extract valid MangaDex UUID from path '{path}'")
        canonical_url = f"https://mangadex.org/title/{work_id}"
        return ("mangadex", work_id, canonical_url)

    elif matched_provider == "mangafire":
        # Format: /title/{id}-{slug} or /title/{id}
        match = re.search(r"/title/([a-zA-Z0-9]+)(?:-[^/]+)?", path)
        if match:
            work_id = match.group(1).lower()
        else:
            raise SSRFSecurityError(f"Cannot extract valid MangaFire work ID from path '{path}'")
        # Extract slug if available for full canonical URL, or fallback to work_id
        slug_match = re.search(r"/title/([a-zA-Z0-9]+-[^/]+)", path)
        slug_part = slug_match.group(1) if slug_match else work_id
        canonical_url = f"https://mangafire.to/title/{slug_part}"
        return ("mangafire", work_id, canonical_url)

    elif matched_provider == "comix":
        # Format: /title/{work_id}-{slug} or /title/{work_id} or /title/{work_id}-{slug}/...
        match = re.search(r"^/title/([a-zA-Z0-9]+)(?:-([^/]+))?", path)
        if match:
            work_id = match.group(1).lower()
            slug = match.group(2)
        else:
            raise SSRFSecurityError(f"Cannot extract valid Comix work ID from path '{path}'")
        if slug:
            canonical_url = f"https://comix.to/title/{work_id}-{slug}"
        else:
            canonical_url = f"https://comix.to/title/{work_id}"
        return ("comix", work_id, canonical_url)

    raise SSRFSecurityError(f"Unsupported provider: {matched_provider}")


def normalize_chapter_candidate(raw: Optional[str]) -> Tuple[str, Optional[float], bool]:
    """
    Normalizes a chapter string into (canonical_key, numeric_sort_hint, is_special).
    Rules:
    - '14', '014', '14.0' -> canonical '14', numeric 14.0, is_special False
    - '14.1' -> canonical '14.1', numeric 14.1, is_special False
    - '14a', '14b' -> canonical '14a', numeric 14.0, is_special True
    - 'oneshot', empty -> canonical 'oneshot' / 'unclassified', numeric None, is_special True
    """
    if not raw or not str(raw).strip():
        return ("unclassified", None, True)

    cleaned = str(raw).strip()
    lower = cleaned.lower()

    if lower in ("oneshot", "one-shot", "one shot"):
        return ("oneshot", None, True)

    # Check decimal float
    try:
        val = float(cleaned)
        # If integer equivalent (e.g. 14.0 -> 14)
        if val.is_integer():
            return (str(int(val)), val, False)
        else:
            return (str(val), val, False)
    except ValueError:
        pass

    # Check alphanumeric like 14a, 14.1a
    match = re.match(r"^(\d+(?:\.\d+)?)([a-zA-Z]+)$", cleaned)
    if match:
        num_part = float(match.group(1))
        return (cleaned.lower(), num_part, True)

    return (cleaned.lower(), None, True)
