import pytest

from backend.config import Settings
from backend.models.datasource import (
    ProviderCapability,
    SSRFSecurityError,
)
from backend.services.datasources.url_utils import validate_and_parse_source_url


def test_url_utils_valid_comix_standard():
    url = "https://comix.to/title/r9j5m-yajin"
    provider, work_id, canonical = validate_and_parse_source_url(url)
    assert provider == "comix"
    assert work_id == "r9j5m"
    assert canonical == "https://comix.to/title/r9j5m-yajin"


def test_url_utils_valid_comix_no_slug():
    url = "https://comix.to/title/r9j5m"
    provider, work_id, canonical = validate_and_parse_source_url(url)
    assert provider == "comix"
    assert work_id == "r9j5m"
    assert canonical == "https://comix.to/title/r9j5m"


def test_url_utils_valid_comix_trailing_slash_and_www():
    url = "https://www.comix.to/title/r9j5m-yajin/"
    provider, work_id, canonical = validate_and_parse_source_url(url)
    assert provider == "comix"
    assert work_id == "r9j5m"
    assert canonical == "https://comix.to/title/r9j5m-yajin"


def test_url_utils_valid_comix_different_slug_same_work_id():
    url1 = "https://comix.to/title/r9j5m-yajin"
    url2 = "https://comix.to/title/r9j5m-wild-man-adventures"
    p1, w1, _ = validate_and_parse_source_url(url1)
    p2, w2, _ = validate_and_parse_source_url(url2)
    assert p1 == p2 == "comix"
    assert w1 == w2 == "r9j5m"


def test_url_utils_valid_comix_chapter_subpath():
    url = "https://comix.to/title/r9j5m-yajin/chapter-14"
    provider, work_id, canonical = validate_and_parse_source_url(url)
    assert provider == "comix"
    assert work_id == "r9j5m"
    assert canonical == "https://comix.to/title/r9j5m-yajin"


def test_url_utils_comix_ssrf_and_spoof_rejection():
    # Domain suffix spoofing
    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("https://comix.to.evil-domain.com/title/r9j5m-yajin")

    # Malformed / missing work ID
    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("https://comix.to/about-us")

    # Userinfo injection
    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("https://admin:pass@comix.to/title/r9j5m")

    # Scheme check
    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("ftp://comix.to/title/r9j5m")


def test_comix_provider_capability_model():
    cap = ProviderCapability(
        name="comix",
        display_name="Comix",
        can_search=False,
        can_resolve_url=True,
        supports_languages=["en", "ja"],
        requires_session=True,
        can_download=True,
        supported_url_patterns=["https://comix.to/title/*"],
        rate_limit_per_minute=30,
    )
    assert cap.name == "comix"
    assert cap.requires_session is True
    assert cap.rate_limit_per_minute == 30


def test_comix_config_settings_defaults():
    settings = Settings()
    assert hasattr(settings, "datasource_comix_enabled")
    assert settings.datasource_comix_enabled is True
    assert settings.datasource_comix_base_url == "https://comix.to"
    assert settings.datasource_comix_transport == "stealth_auto"
    assert settings.datasource_captcha_auto_solve_enabled is True
    assert settings.datasource_captcha_max_attempts == 3
    assert settings.datasource_session_dir == "backend/data/datasource-sessions"
