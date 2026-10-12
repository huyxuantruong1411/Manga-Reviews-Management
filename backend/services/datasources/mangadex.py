import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from backend.models.datasource import (
    ProviderCapability,
    ReleasePage,
    ReleaseQuery,
    SourcePage,
    SourcePageManifest,
    SourceRelease,
    SourceUnavailableError,
    SourceWork,
)
from backend.services.datasources.contracts import MangaSourceProvider
from backend.services.datasources.url_utils import validate_and_parse_source_url
from backend.services.mangadex_service import MangaDexService

logger = logging.getLogger(__name__)


class MangaDexSourceProvider(MangaSourceProvider):
    """
    MangaDex implementation of MangaSourceProvider.
    Wraps existing MangaDexService, providing normalized DTOs, full catalogue v2
    (preserving release IDs), and rate-limited access.
    """

    def __init__(self, service: Optional[MangaDexService] = None):
        self._service = service or MangaDexService()

    @property
    def name(self) -> str:
        return "mangadex"

    @property
    def capabilities(self) -> ProviderCapability:
        return ProviderCapability(
            name="mangadex",
            display_name="MangaDex",
            can_search=True,
            can_resolve_url=True,
            supports_languages=["en", "vi", "ja", "ru", "es", "fr", "pt-br", "id", "de", "it"],
            requires_session=False,
            can_download=True,
            supported_url_patterns=["https://mangadex.org/title/*"],
            rate_limit_per_minute=300,
        )

    async def resolve_work(self, url_or_id: str) -> SourceWork:
        """
        Resolves a work from a MangaDex title URL or UUID.
        """
        clean_input = url_or_id.strip()
        if clean_input.startswith("http://") or clean_input.startswith("https://"):
            provider, work_id, canonical_url = validate_and_parse_source_url(clean_input)
            if provider != "mangadex":
                raise ValueError(f"URL belongs to provider '{provider}', not 'mangadex'")
        else:
            work_id = clean_input.lower()
            canonical_url = f"https://mangadex.org/title/{work_id}"

        details = await self._service.get_manga_details(work_id)
        if not details:
            raise SourceUnavailableError(f"MangaDex work '{work_id}' not found or unreachable")

        available_languages = await self._service.get_available_languages(work_id)

        # Extract external IDs
        external_ids = {"mangadex": work_id}
        for link in details.get("links", []):
            title = link.get("title", "").lower()
            url = link.get("url", "")
            if "anilist" in title:
                match = url.rstrip("/").split("/")[-1]
                if match:
                    external_ids["al"] = match
            elif "myanimelist" in title:
                match = url.rstrip("/").split("/")[-1]
                if match:
                    external_ids["mal"] = match
            elif "mangaupdates" in title:
                match = url.split("id=")[-1] if "id=" in url else ""
                if match:
                    external_ids["mu"] = match

        return SourceWork(
            source="mangadex",
            source_work_id=work_id,
            title=details.get("title", "No Title"),
            url=canonical_url,
            alt_titles=details.get("alt_titles", []),
            author=details.get("author"),
            artist=details.get("artist"),
            cover_url=details.get("cover_url"),
            status=details.get("status"),
            year=details.get("year"),
            description=details.get("description", ""),
            content_rating=details.get("content_rating"),
            publication_demographic=details.get("publication_demographic"),
            original_language=details.get("original_language"),
            available_languages=available_languages,
            external_ids=external_ids,
            extra_metadata={
                "last_volume": details.get("last_volume"),
                "last_chapter": details.get("last_chapter"),
                "tags": details.get("tags", []),
            },
        )

    async def get_metadata(self, work_id: str) -> Dict[str, Any]:
        details = await self._service.get_manga_details(work_id)
        if not details:
            raise SourceUnavailableError(f"MangaDex work '{work_id}' details not found")
        return details

    async def list_releases(self, work_id: str, query: ReleaseQuery) -> ReleasePage:
        """
        Lists releases from MangaDex feed, preserving each release ID.
        Filters out externalUrl links.
        """
        all_releases: List[SourceRelease] = []
        offset = query.offset
        limit = min(query.limit, 500)
        total_count = None
        has_next = False

        params: Dict[str, Any] = {
            "limit": limit,
            "offset": offset,
            "translatedLanguage[]": [query.language],
            "order[chapter]": query.order if query.order in ("asc", "desc") else "asc",
            "includeFutureUpdates": 0,
            "contentRating[]": self._service.CONTENT_RATINGS,
            "includes[]": ["scanlation_group", "user"],
        }

        data = await self._service._request(f"/manga/{work_id}/feed", params)
        if not data or "data" not in data:
            return ReleasePage(
                items=[], total=0, has_next=False, page=query.page, limit=limit, catalogue_complete=False
            )

        total_count = data.get("total", 0)
        feed_items = data.get("data", [])

        for chap in feed_items:
            attr = chap.get("attributes", {})
            # Skip externalUrl links per repository policy
            if attr.get("externalUrl") is not None:
                continue

            group_ids = []
            group_names = []
            uploader_name = None
            uploader_id = None
            for rel in chap.get("relationships", []):
                rel_type = rel.get("type")
                if rel_type == "scanlation_group":
                    group_ids.append(rel.get("id"))
                    name = rel.get("attributes", {}).get("name")
                    if name:
                        group_names.append(name)
                elif rel_type == "user":
                    uploader_id = rel.get("id")
                    uploader_name = rel.get("attributes", {}).get("username")

            group_id = ",".join(group_ids) if group_ids else None
            group_name = " & ".join(group_names) if group_names else None

            raw_vol = attr.get("volume")
            vol_clean = None
            if raw_vol is not None:
                s_vol = str(raw_vol).strip()
                if s_vol and s_vol.lower() not in ("none", "null", "no volume"):
                    vol_clean = s_vol

            chapter_num = attr.get("chapter") or "oneshot"

            def parse_dt(val: Optional[str]) -> Optional[datetime]:
                if not val:
                    return None
                try:
                    return datetime.fromisoformat(val.replace("Z", "+00:00"))
                except Exception:
                    return None

            all_releases.append(
                SourceRelease(
                    id=chap["id"],
                    source="mangadex",
                    source_work_id=work_id,
                    chapter_number=str(chapter_num),
                    title=attr.get("title") or "",
                    volume=vol_clean,
                    language=attr.get("translatedLanguage") or query.language,
                    unit_kind="oneshot" if str(chapter_num).lower() == "oneshot" else "chapter",
                    release_type=None,
                    group_id=group_id,
                    group_name=group_name,
                    uploader=uploader_name,
                    uploader_id=uploader_id,
                    pages_count=attr.get("pages") or 0,
                    version=attr.get("version", 1),
                    publish_at=parse_dt(attr.get("publishAt")),
                    readable_at=parse_dt(attr.get("readableAt")),
                    created_at=parse_dt(attr.get("createdAt")),
                    updated_at=parse_dt(attr.get("updatedAt")),
                    external_url=None,
                )
            )

        has_next = (offset + limit) < total_count

        return ReleasePage(
            items=all_releases,
            total=total_count,
            has_next=has_next,
            page=query.page,
            limit=limit,
            catalogue_complete=not has_next,
            observed_at=datetime.now(timezone.utc),
        )

    async def resolve_pages(self, release_id: str) -> SourcePageManifest:
        """
        Resolves the ordered image pages for a MangaDex release.
        """
        image_urls = await self._service.get_chapter_images(release_id)
        if not image_urls:
            raise SourceUnavailableError(f"Could not resolve image pages for MangaDex chapter '{release_id}'")

        pages = [
            SourcePage(
                page_number=idx + 1,
                url=url,
                headers={"User-Agent": "Manga-Reviews-Management/1.0.0"},
                content_type="image/jpeg",
            )
            for idx, url in enumerate(image_urls)
        ]

        return SourcePageManifest(
            provider="mangadex",
            work_id="",  # Populated or attached by caller context
            release_id=release_id,
            language="en",
            unit_kind="chapter",
            chapter_number_raw="",
            page_count=len(pages),
            pages=pages,
            adapter_version="1.0.0",
            observed_at=datetime.now(timezone.utc),
        )

    async def fetch_page(self, page: SourcePage, client: Optional[httpx.AsyncClient] = None) -> bytes:
        """
        Fetches verified image bytes for a single page.
        """
        data = await self._service.download_image_bytes(page.url)
        if not data:
            raise SourceUnavailableError(f"Failed to download image from '{page.url}'")
        return data
