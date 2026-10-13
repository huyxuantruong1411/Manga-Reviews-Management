import io
from unittest.mock import AsyncMock, patch

import pytest
from PIL import Image

from backend.models.datasource import (
    DatasourceError,
    ReleaseQuery,
    SourcePage,
    SSRFSecurityError,
)
from backend.models.download_plan import (
    DownloadSelectionPolicy,
)
from backend.services.datasources.mangafire import MangaFireSourceProvider
from backend.services.datasources.registry import get_datasource_provider
from backend.services.datasources.url_utils import validate_and_parse_source_url
from backend.services.download_plan_service import download_plan_service
from backend.tests.fixtures.multisource_fixtures import (
    generate_synthetic_catalogue_pages,
)


@pytest.fixture
def sample_jpeg_bytes() -> bytes:
    img = Image.new("RGB", (100, 100), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def synthetic_romi_data():
    return {
        "id": 19305,
        "hid": "oj8n8",
        "slug": "sheeply-horned-witch-romii",
        "title": "Sheeply Horned Witch Romi",
        "type": "manga",
        "status": "finished",
        "contentRating": "safe",
        "poster": {"large": "https://static.mfcdn.nl/731a/i/7/76/7689d7410f4fae1bae25598c689f4f8e.jpg"},
        "latestChapter": 31,
        "year": 2017,
        "synopsisHtml": "The only things that are still awake in this world are sheep, me, and her.",
        "altTitles": [
            "Sheep Horn Witch Romi",
            "羊角のマジョロミ",
            "Youkaku no Majo Romi",
        ],
        "rating": 8,
        "ratingCount": 1,
        "follows": 175,
        "languages": ["en", "pt-br"],
        "links": {
            "mal": "https://myanimelist.net/manga/130997/",
            "al": "https://anilist.co/manga/105965/",
            "mu": "https://mangaupdates.com/series/1dz9hlw/",
            "md": "https://mangadex.org/title/8627e210-25dc-4e9a-8531-142c917e4760/",
            "mb": "https://mangabaka.org/42743/",
        },
        "malId": "130997",
        "anilistId": "105965",
        "genres": [{"id": 5, "title": "Comedy"}, {"id": 7, "title": "Ecchi"}],
        "themes": [{"id": 268934, "title": "Animals"}],
        "demographics": [{"id": 268918, "title": "Shounen"}],
        "authors": [{"id": 269858, "title": "Abe Youichi"}],
        "artists": [{"id": 269861, "title": "Abe Youichi"}],
    }


def test_mangafire_provider_registration():
    provider = get_datasource_provider("mangafire")
    assert isinstance(provider, MangaFireSourceProvider)
    assert provider.name == "mangafire"
    caps = provider.capabilities
    assert caps.can_resolve_url is True
    assert caps.requires_session is True
    assert "en" in caps.supports_languages
    assert "pt-br" in caps.supports_languages


def test_mangafire_url_validation_and_ssrf():
    # Valid MangaFire URL
    prov, work_id, canonical = validate_and_parse_source_url(
        "https://mangafire.to/title/oj8n8-sheeply-horned-witch-romii"
    )
    assert prov == "mangafire"
    assert work_id == "oj8n8"
    assert canonical == "https://mangafire.to/title/oj8n8-sheeply-horned-witch-romii"

    # Valid with trailing slash
    prov, work_id, canonical = validate_and_parse_source_url("https://mangafire.to/title/oj8n8/")
    assert prov == "mangafire"
    assert work_id == "oj8n8"

    # Reject attacker spoof domain
    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("https://mangafire.to.attacker.com/title/oj8n8")

    # Reject localhost / private IP
    with pytest.raises(SSRFSecurityError):
        validate_and_parse_source_url("http://127.0.0.1/title/oj8n8")


@pytest.mark.anyio
async def test_mangafire_resolve_work_with_synthetic_fixture(synthetic_romi_data):
    provider = MangaFireSourceProvider()

    with patch.object(provider, "_fetch_work_details_sync", return_value=synthetic_romi_data):
        work = await provider.resolve_work("https://mangafire.to/title/oj8n8-sheeply-horned-witch-romii")

        assert work.source == "mangafire"
        assert work.source_work_id == "oj8n8"
        assert work.title == "Sheeply Horned Witch Romi"
        assert work.status == "finished"
        assert work.year == "2017"
        assert work.author == "Abe Youichi"
        assert work.artist == "Abe Youichi"
        assert work.content_rating == "safe"
        assert "Sheep Horn Witch Romi" in work.alt_titles

        # Cross links & external IDs
        assert work.external_ids.get("mal") == "130997"
        assert work.external_ids.get("al") == "105965"
        assert work.external_ids.get("mangadex") == "8627e210-25dc-4e9a-8531-142c917e4760"
        assert work.external_ids.get("mu") == "1dz9hlw"


@pytest.mark.anyio
async def test_mangafire_list_releases_catalogue_completeness():
    provider = MangaFireSourceProvider()

    # Generate synthetic 62 releases across 31 chapter numbers
    synthetic_items = generate_synthetic_catalogue_pages(total_chapters=31, releases_per_chapter=2)
    assert len(synthetic_items) == 62

    # Map raw items to the format expected by MangaFire
    raw_mf_items = [
        {
            "id": i["id"],
            "number": i["number"],
            "name": i["name"],
            "type": i["type"],
            "language": "en",
            "createdAt": 1783305159,
        }
        for i in synthetic_items
    ]

    # Call list_releases with synthetic releases
    from backend.models.datasource import SourceRelease

    releases = [
        SourceRelease(
            id=str(i["id"]),
            source="mangafire",
            source_work_id="oj8n8",
            chapter_number=str(i["number"]),
            title=i["name"],
            volume=None,
            language="en",
            unit_kind="chapter",
            release_type=i["type"],
            group_id=None,
            group_name=None,
            uploader=None,
            uploader_id=None,
            pages_count=0,
            version=1,
            publish_at=None,
            readable_at=None,
            created_at=None,
            updated_at=None,
            external_url=None,
        )
        for i in raw_mf_items
    ]

    with patch.object(provider, "_fetch_releases_sync", return_value=releases):
        page = await provider.list_releases("oj8n8", ReleaseQuery(language="en", limit=100))
        assert len(page.items) == 62
        assert page.total == 62
        assert page.catalogue_complete is True

        # Chapter 14 should have 2 releases: 1 official and 1 unofficial
        ch14_releases = [r for r in page.items if r.chapter_number == "14"]
        assert len(ch14_releases) == 2
        types = {r.release_type for r in ch14_releases}
        assert types == {"official", "unofficial"}
        # Ensure group_name is None (not confused with release_type)
        assert all(r.group_name is None for r in ch14_releases)


@pytest.mark.anyio
async def test_mangafire_resolve_pages_manifest():
    provider = MangaFireSourceProvider()

    # Pre-populate release mapping
    provider._release_to_work_id["4618281"] = "oj8n8"

    synthetic_pages = [
        {"url": f"https://l1n.mfcdn1.xyz/mf/page_{idx}.jpg", "width": 1122, "height": 1600} for idx in range(1, 23)
    ]

    from backend.models.datasource import SourcePage, SourcePageManifest

    expected_pages = [
        SourcePage(
            page_number=idx + 1,
            url=p["url"],
            headers={"Referer": "https://mangafire.to/"},
            content_type="image/jpeg",
        )
        for idx, p in enumerate(synthetic_pages)
    ]
    expected_manifest = SourcePageManifest(
        provider="mangafire",
        work_id="oj8n8",
        release_id="4618281",
        language="en",
        unit_kind="chapter",
        chapter_number_raw="14",
        page_count=len(expected_pages),
        pages=expected_pages,
        adapter_version="1.0.0",
    )

    with patch.object(provider, "_fetch_pages_manifest_sync", return_value=expected_manifest):
        manifest = await provider.resolve_pages("4618281")
        assert manifest.provider == "mangafire"
        assert manifest.release_id == "4618281"
        assert manifest.page_count == 22
        assert len(manifest.pages) == 22
        assert manifest.pages[0].headers.get("Referer") == "https://mangafire.to/"


@pytest.mark.anyio
async def test_mangafire_fetch_page_validation(sample_jpeg_bytes):
    provider = MangaFireSourceProvider()

    page = SourcePage(
        page_number=1,
        url="https://l1n.mfcdn1.xyz/mf/sample.jpg",
        headers={"Referer": "https://mangafire.to/"},
    )

    # 1. Successful download of valid JPEG
    mock_client = AsyncMock()
    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.content = sample_jpeg_bytes
    mock_client.get.return_value = mock_resp

    data = await provider.fetch_page(page, client=mock_client)
    assert data == sample_jpeg_bytes

    # 2. Rejection of corrupted HTML response (e.g. Cloudflare error page with 200 status)
    mock_bad_resp = AsyncMock()
    mock_bad_resp.status_code = 200
    mock_bad_resp.content = (
        b"<html><body>Cloudflare Blocked. Please solve captcha challenge to access requested resource. "
        b"Error code 1020 access denied.</body></html>"
    )
    mock_client.get.return_value = mock_bad_resp

    with pytest.raises(DatasourceError) as exc_info:
        await provider.fetch_page(page, client=mock_client)
    assert exc_info.value.code == "INVALID_IMAGE_BYTES"


@pytest.mark.anyio
async def test_mangafire_download_plan_one_release_per_chapter():
    """
    Test creating a download plan with MangaFire releases ensuring that
    a planned 31-chapter set correctly produces 31 items.
    """
    from unittest.mock import MagicMock

    mock_db = MagicMock()
    mock_plans_col = AsyncMock()
    mock_chaps_col = AsyncMock()
    mock_bindings_col = AsyncMock()

    mock_db.download_plans = mock_plans_col
    mock_db.chapters = mock_chaps_col
    mock_db.manga_sources = mock_bindings_col

    # Return valid binding
    mock_bindings_col.find_one.return_value = {
        "manga_id": "manga_123",
        "source": "mangafire",
        "source_work_id": "oj8n8",
    }
    # No existing chapters
    mock_chaps_col.find_one.return_value = None

    # 31 releases (1 per chapter)
    releases = [
        {
            "id": f"rel_{num}",
            "chapter_number": str(num),
            "title": f"Chapter {num}",
            "volume": None,
            "language": "en",
            "unit_kind": "chapter",
            "source": "mangafire",
        }
        for num in range(1, 32)
    ]

    release_ids = [r["id"] for r in releases]

    with (
        patch("backend.services.download_plan_service.get_db", return_value=mock_db),
        patch(
            "backend.services.datasources.mangafire.MangaFireSourceProvider._fetch_work_details_sync",
            return_value={"title": "Romi"},
        ),
    ):
        plan = await download_plan_service.create_plan(
            manga_id="manga_123",
            source="mangafire",
            source_work_id="oj8n8",
            release_ids=release_ids,
            selection_policy=DownloadSelectionPolicy.SKIP_EXISTING,
            save_to_disk=False,
        )
        assert plan.total_items == 31
        assert plan.download_count == 31
        assert plan.source == "mangafire"
        assert plan.source_work_id == "oj8n8"
