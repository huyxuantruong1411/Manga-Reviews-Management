from unittest.mock import AsyncMock, patch

import pytest

from backend.models.datasource import (
    DatasourceError,
    ReleaseQuery,
    SourceWork,
    SSRFSecurityError,
)
from backend.services.datasources.contracts import MangaSourceProvider
from backend.services.datasources.mangadex import MangaDexSourceProvider
from backend.services.datasources.registry import (
    get_datasource_provider,
    list_datasource_providers,
)
from backend.services.datasources.url_utils import (
    normalize_chapter_candidate,
    validate_and_parse_source_url,
)


def test_url_utils_valid_mangadex():
    url = "https://mangadex.org/title/8627e210-25dc-4e9a-8531-142c917e4760"
    provider, work_id, canonical = validate_and_parse_source_url(url)
    assert provider == "mangadex"
    assert work_id == "8627e210-25dc-4e9a-8531-142c917e4760"
    assert canonical == url


def test_url_utils_valid_mangafire():
    url = "https://mangafire.to/title/oj8n8-sheeply-horned-witch-romii"
    provider, work_id, canonical = validate_and_parse_source_url(url)
    assert provider == "mangafire"
    assert work_id == "oj8n8"
    assert canonical == "https://mangafire.to/title/oj8n8-sheeply-horned-witch-romii"


def test_url_utils_ssrf_and_security_rejections():
    # 1. Attacker domain suffix spoof
    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("https://mangafire.to.attacker.com/title/oj8n8")

    # 2. Localhost and private IP
    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("http://localhost:8000/title/123")

    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("http://127.0.0.1/title/123")

    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("http://192.168.1.1/title/123")

    # 3. Userinfo in URL
    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("https://admin:pass@mangadex.org/title/8627e210-25dc-4e9a-8531-142c917e4760")

    # 4. Non-http scheme
    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("file:///etc/passwd")


def test_chapter_candidate_normalization():
    # 14, 014, 14.0 -> canonical "14"
    assert normalize_chapter_candidate("14") == ("14", 14.0, False)
    assert normalize_chapter_candidate("014") == ("14", 14.0, False)
    assert normalize_chapter_candidate("14.0") == ("14", 14.0, False)

    # 14.1, 14.2 -> not merged into 14
    assert normalize_chapter_candidate("14.1") == ("14.1", 14.1, False)
    assert normalize_chapter_candidate("14.2") == ("14.2", 14.2, False)

    # 14a, 14b -> special
    assert normalize_chapter_candidate("14a") == ("14a", 14.0, True)
    assert normalize_chapter_candidate("14b") == ("14b", 14.0, True)

    # oneshot / missing
    assert normalize_chapter_candidate("Oneshot") == ("oneshot", None, True)
    assert normalize_chapter_candidate("") == ("unclassified", None, True)
    assert normalize_chapter_candidate(None) == ("unclassified", None, True)


def test_registry_lookup_and_registration():
    provider = get_datasource_provider("mangadex")
    assert isinstance(provider, MangaSourceProvider)
    assert provider.name == "mangadex"

    providers = list_datasource_providers()
    assert any(p.name == "mangadex" for p in providers)

    with pytest.raises(DatasourceError) as exc_info:
        get_datasource_provider("unknown_provider_xyz")
    assert exc_info.value.code == "PROVIDER_NOT_FOUND"


@pytest.mark.anyio
async def test_mangadex_provider_adapter_list_releases_preserves_ids():
    mock_service = AsyncMock()
    mock_service.CONTENT_RATINGS = ["safe", "suggestive", "erotica", "pornographic"]
    mock_service._request = AsyncMock(
        return_value={
            "total": 2,
            "data": [
                {
                    "id": "rel-uuid-001",
                    "attributes": {
                        "chapter": "14",
                        "title": "Rewrites",
                        "volume": "3",
                        "pages": 17,
                        "translatedLanguage": "en",
                        "externalUrl": None,
                    },
                    "relationships": [
                        {"type": "scanlation_group", "id": "grp-1", "attributes": {"name": "Dekoboko"}},
                    ],
                },
                {
                    "id": "rel-uuid-002",
                    "attributes": {
                        "chapter": "14",
                        "title": "Rewrites Alternative",
                        "volume": "3",
                        "pages": 17,
                        "translatedLanguage": "en",
                        "externalUrl": None,
                    },
                    "relationships": [
                        {"type": "scanlation_group", "id": "grp-2", "attributes": {"name": "OtherGroup"}},
                    ],
                },
            ],
        }
    )

    provider = MangaDexSourceProvider(service=mock_service)
    page = await provider.list_releases("work-123", ReleaseQuery(language="en"))

    assert len(page.items) == 2
    # Crucial test invariant: Both distinct release IDs are preserved!
    assert page.items[0].id == "rel-uuid-001"
    assert page.items[1].id == "rel-uuid-002"
    assert page.items[0].group_name == "Dekoboko"
    assert page.items[1].group_name == "OtherGroup"


@pytest.mark.anyio
async def test_datasources_router_endpoints():
    from backend.routers.datasources import (
        ResolveSourceRequest,
        list_datasources,
        list_source_releases,
        resolve_source_work,
    )

    # 1. Test GET /api/datasources
    caps = await list_datasources()
    assert len(caps) >= 1
    assert any(c.name == "mangadex" for c in caps)

    # 2. Test POST /api/datasources/resolve
    mock_provider = AsyncMock()
    mock_provider.name = "mangadex"
    mock_provider.resolve_work = AsyncMock(
        return_value=SourceWork(
            source="mangadex",
            source_work_id="8627e210-25dc-4e9a-8531-142c917e4760",
            title="Test Manga",
            url="https://mangadex.org/title/8627e210-25dc-4e9a-8531-142c917e4760",
        )
    )

    with patch("backend.routers.datasources.get_datasource_provider", return_value=mock_provider):
        req = ResolveSourceRequest(
            url_or_id="https://mangadex.org/title/8627e210-25dc-4e9a-8531-142c917e4760",
            provider_hint="auto",
        )
        resolved = await resolve_source_work(req)
        assert resolved.source == "mangadex"
        assert resolved.title == "Test Manga"

    # 3. Test GET /api/datasources/{provider_name}/releases/{work_id}
    from backend.models.datasource import ReleasePage, SourceRelease

    mock_page = ReleasePage(
        items=[
            SourceRelease(
                id="rel-uuid-001",
                source="mangadex",
                source_work_id="8627e210-25dc-4e9a-8531-142c917e4760",
                chapter_number="14",
                title="Rewrites",
                language="en",
            )
        ],
        total=1,
    )
    mock_provider.list_releases = AsyncMock(return_value=mock_page)
    with patch("backend.routers.datasources.get_datasource_provider", return_value=mock_provider):
        res_page = await list_source_releases(
            provider_name="mangadex",
            work_id="8627e210-25dc-4e9a-8531-142c917e4760",
            lang="en",
            limit=10,
            offset=0,
        )
        assert len(res_page.items) == 1
        assert res_page.items[0].id == "rel-uuid-001"
