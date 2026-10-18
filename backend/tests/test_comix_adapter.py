import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from PIL import Image

from backend.models.datasource import (
    DatasourceError,
    ReleaseQuery,
    SourcePage,
    SourcePageManifest,
    SourceRelease,
    SourceUnavailableError,
    SourceWork,
)
from backend.services.datasources.comix import ComixProvider
from backend.services.datasources.registry import (
    get_datasource_provider,
    list_datasource_providers,
)
from backend.tests.fixtures.multisource_fixtures import (
    COMIX_CHAPTER_RELEASES_FIXTURE,
    COMIX_MANIFEST_V2_FIXTURE,
    COMIX_YAJIN_FIXTURE,
)


def _create_dummy_image_bytes(fmt: str = "WEBP") -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (100, 100), color=(30, 144, 255))
    img.save(buf, format=fmt)
    return buf.getvalue()


def test_comix_provider_registry_and_capabilities():
    provider = get_datasource_provider("comix")
    assert provider is not None
    assert provider.name == "comix"
    assert provider.capabilities.display_name == "Comix"
    assert provider.capabilities.requires_session is True
    assert "https://comix.to/title/*" in provider.capabilities.supported_url_patterns

    providers = list_datasource_providers()
    provider_names = [p.name for p in providers]
    assert "comix" in provider_names
    assert "mangadex" in provider_names
    assert "mangafire" in provider_names


@pytest.mark.anyio
async def test_comix_resolve_work_from_url_and_raw_id():
    mock_transport = MagicMock()
    mock_work = SourceWork(
        source="comix",
        source_work_id=COMIX_YAJIN_FIXTURE["work_id"],
        title=COMIX_YAJIN_FIXTURE["title"],
        url=COMIX_YAJIN_FIXTURE["canonical_url"],
        alt_titles=COMIX_YAJIN_FIXTURE["alt_titles"],
        author=COMIX_YAJIN_FIXTURE["author"],
        artist=COMIX_YAJIN_FIXTURE["artist"],
        description=COMIX_YAJIN_FIXTURE["description"],
        status=COMIX_YAJIN_FIXTURE["status"],
        year=COMIX_YAJIN_FIXTURE["year"],
        cover_url=COMIX_YAJIN_FIXTURE["cover_url"],
        available_languages=COMIX_YAJIN_FIXTURE["available_languages"],
    )
    mock_transport.resolve_work = AsyncMock(return_value=mock_work)

    provider = ComixProvider(transport=mock_transport)

    # 1. Resolve by URL
    work1 = await provider.resolve_work("https://comix.to/title/r9j5m-yajin")
    assert work1.source == "comix"
    assert work1.source_work_id == "r9j5m"
    assert work1.title == "Yajin"
    assert "野人" in work1.alt_titles

    # 2. Resolve by raw work_id
    work2 = await provider.resolve_work("r9j5m")
    assert work2.source_work_id == "r9j5m"

    # 3. Reject wrong provider URL
    with pytest.raises(ValueError) as exc_info:
        await provider.resolve_work("https://mangadex.org/title/8627e210-25dc-4e9a-8531-142c917e4760")
    assert "mangadex" in str(exc_info.value)


@pytest.mark.anyio
async def test_comix_list_releases_and_pagination():
    releases = [
        SourceRelease(
            id=item["id"],
            source="comix",
            source_work_id=item["work_id"],
            chapter_number=item["chapter_number"],
            title=item["title"],
            volume=item.get("volume"),
            language=item["language"],
            unit_kind=item["unit_kind"],
            pages_count=item["pages_count"],
            group_name=item["group_name"],
        )
        for item in COMIX_CHAPTER_RELEASES_FIXTURE
    ]
    # Add a chapter 2 to test sort order
    releases.append(
        SourceRelease(
            id="cmx_rel_002",
            source="comix",
            source_work_id="r9j5m",
            chapter_number="2",
            title="Surviving the cold",
            volume="1",
            language="en",
            unit_kind="chapter",
            pages_count=18,
            group_name="Comix Scan",
        )
    )

    provider = ComixProvider()
    with patch.object(provider, "_fetch_releases_sync", return_value=releases):
        query = ReleaseQuery(language="en", order="asc")
        page = await provider.list_releases("r9j5m", query)

        assert page.total == 3
        # Should be ordered asc: chapter 1, 2, 14
        nums = [item.chapter_number for item in page.items]
        assert nums == ["1", "2", "14"]
        assert page.catalogue_complete is True

        # Test desc sort
        query_desc = ReleaseQuery(language="en", order="desc")
        page_desc = await provider.list_releases("r9j5m", query_desc)
        nums_desc = [item.chapter_number for item in page_desc.items]
        assert nums_desc == ["14", "2", "1"]


@pytest.mark.anyio
async def test_comix_resolve_pages_manifest():
    mock_transport = MagicMock()
    expected_pages = [
        SourcePage(
            page_number=p["page_number"],
            url=f"https://img.comix.to/r9j5m/cmx_rel_014/{p['filename']}",
            content_type=p["content_type"],
            headers={"Referer": "https://comix.to/"},
        )
        for p in COMIX_MANIFEST_V2_FIXTURE["pages"]
    ]
    mock_manifest = SourcePageManifest(
        provider="comix",
        work_id="r9j5m",
        release_id="cmx_rel_014",
        page_count=len(expected_pages),
        pages=expected_pages,
    )
    mock_transport.resolve_pages = AsyncMock(return_value=mock_manifest)

    provider = ComixProvider(transport=mock_transport)
    manifest = await provider.resolve_pages("cmx_rel_014")

    assert manifest.provider == "comix"
    assert manifest.release_id == "cmx_rel_014"
    assert len(manifest.pages) == 4
    assert manifest.pages[0].page_number == 1
    assert manifest.pages[0].headers["Referer"] == "https://comix.to/"


@pytest.mark.anyio
async def test_comix_fetch_page_valid_image():
    dummy_bytes = _create_dummy_image_bytes("WEBP")
    page = SourcePage(
        page_number=1,
        url="https://img.comix.to/r9j5m/cmx_rel_014/0001.webp",
        headers={"Referer": "https://comix.to/"},
    )

    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = dummy_bytes
    mock_client.get = AsyncMock(return_value=mock_response)

    provider = ComixProvider()
    data = await provider.fetch_page(page, client=mock_client)

    assert data == dummy_bytes
    assert len(data) > 100


@pytest.mark.anyio
async def test_comix_fetch_page_rejects_html_cloudflare_challenge():
    # Cloudflare challenge or bot block masquerading as HTTP 200 HTML
    html_bytes = (
        b"<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>Turnstile Challenge</body></html>"
    )
    page = SourcePage(
        page_number=1,
        url="https://img.comix.to/r9j5m/cmx_rel_014/0001.webp",
    )

    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = html_bytes
    mock_client.get = AsyncMock(return_value=mock_response)

    provider = ComixProvider()
    with pytest.raises(DatasourceError) as exc_info:
        await provider.fetch_page(page, client=mock_client)

    assert exc_info.value.code == "INVALID_IMAGE_BYTES"


@pytest.mark.anyio
async def test_comix_fetch_page_http_error():
    page = SourcePage(
        page_number=1,
        url="https://img.comix.to/r9j5m/cmx_rel_014/0001.webp",
    )

    mock_client = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 403
    mock_client.get = AsyncMock(return_value=mock_response)

    provider = ComixProvider()
    with pytest.raises(SourceUnavailableError):
        await provider.fetch_page(page, client=mock_client)
