import asyncio
import importlib.util
import io
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from PIL import Image

from backend.models.datasource import (
    DatasourceError,
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

logger = logging.getLogger(__name__)

DEFAULT_MANGAFIRE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)


class MangaFireSourceProvider(MangaSourceProvider):
    """
    MangaFire implementation of MangaSourceProvider.
    Uses hybrid transport:
    - Isolated Playwright Headless Browser Context for metadata, catalogue pagination,
      and chapter page manifest resolution (allowing the site's JS to evaluate signatures).
    - Direct HTTP Client (httpx) with 'Referer: https://mangafire.to/' for streaming image bytes.
    """

    def __init__(self, transport: Optional[Any] = None):
        self._transport = transport
        self._release_to_work_id: Dict[str, str] = {}
        self._work_cache: Dict[str, Dict[str, Any]] = {}

    @property
    def name(self) -> str:
        return "mangafire"

    @property
    def capabilities(self) -> ProviderCapability:
        return ProviderCapability(
            name="mangafire",
            display_name="MangaFire",
            can_search=False,
            can_resolve_url=True,
            supports_languages=["en", "pt-br", "es", "ja", "fr"],
            requires_session=True,
            can_download=True,
            supported_url_patterns=["https://mangafire.to/title/*"],
            rate_limit_per_minute=60,
        )

    async def resolve_work(self, url_or_id: str) -> SourceWork:
        """
        Resolves a work from a MangaFire title URL or work identifier (e.g. 'oj8n8').
        """
        clean_input = url_or_id.strip()
        if clean_input.startswith("http://") or clean_input.startswith("https://"):
            provider, work_id, canonical_url = validate_and_parse_source_url(clean_input)
            if provider != "mangafire":
                raise ValueError(f"URL belongs to provider '{provider}', not 'mangafire'")
        else:
            work_id = clean_input.lower()
            canonical_url = f"https://mangafire.to/title/{work_id}"

        if self._transport and hasattr(self._transport, "resolve_work"):
            return await self._transport.resolve_work(work_id, canonical_url)

        # Run Playwright browser execution in thread
        raw_data = await asyncio.to_thread(self._fetch_work_details_sync, work_id, canonical_url)
        if not raw_data:
            raise SourceUnavailableError(f"MangaFire work '{work_id}' not found or unreachable")

        self._work_cache[work_id] = raw_data
        return self._normalize_work(work_id, canonical_url, raw_data)

    async def get_metadata(self, work_id: str) -> Dict[str, Any]:
        """
        Retrieves raw and normalized metadata for the MangaFire work.
        """
        if work_id in self._work_cache:
            return self._work_cache[work_id]
        work = await self.resolve_work(work_id)
        return work.model_dump()

    async def list_releases(self, work_id: str, query: ReleaseQuery) -> ReleasePage:
        """
        Fetches all releases across pages for the work, preserving each release ID.
        """
        if self._transport and hasattr(self._transport, "list_releases"):
            return await self._transport.list_releases(work_id, query)

        releases = await asyncio.to_thread(
            self._fetch_releases_sync,
            work_id,
            query.language,
            query.order,
        )

        for rel in releases:
            self._release_to_work_id[rel.id] = work_id

        # Language filtering
        target_lang = query.language.lower()
        filtered = [r for r in releases if r.language.lower() == target_lang]
        if not filtered and releases:
            # If no items match target lang, keep all for inspection
            filtered = releases

        # Sort order
        is_desc = query.order.lower() == "desc"
        try:
            filtered.sort(
                key=lambda r: float(r.chapter_number) if r.chapter_number.replace(".", "", 1).isdigit() else 0.0,
                reverse=is_desc,
            )
        except Exception:
            pass

        return ReleasePage(
            items=filtered,
            total=len(filtered),
            has_next=False,
            page=1,
            limit=len(filtered) or 500,
            catalogue_complete=True,
            observed_at=datetime.now(timezone.utc),
        )

    async def resolve_pages(self, release_id: str) -> SourcePageManifest:
        """
        Resolves the ordered image pages manifest for a MangaFire release.
        """
        if self._transport and hasattr(self._transport, "resolve_pages"):
            return await self._transport.resolve_pages(release_id)

        clean_release_id = str(release_id).strip()
        work_id = self._release_to_work_id.get(clean_release_id)

        if not work_id and ":" in clean_release_id:
            parts = clean_release_id.split(":", 1)
            work_id = parts[0]
            clean_release_id = parts[1]

        if not work_id:
            # Try to query MongoDB chapters collection for source_work_id
            try:
                from backend.database.connection import get_db

                doc = await get_db().chapters.find_one({"source": "mangafire", "source_id": clean_release_id})
                if doc and doc.get("source_work_id"):
                    work_id = str(doc["source_work_id"])
            except Exception as e:
                logger.debug(f"DB lookup for work_id of release {clean_release_id} failed: {e}")

        if not work_id:
            raise SourceUnavailableError(
                f"Cannot resolve work context for MangaFire release '{clean_release_id}'. Work ID required."
            )

        manifest_data = await asyncio.to_thread(
            self._fetch_pages_manifest_sync,
            work_id,
            clean_release_id,
        )

        return manifest_data

    async def fetch_page(self, page: SourcePage, client: Optional[httpx.AsyncClient] = None) -> bytes:
        """
        Downloads image bytes from MangaFire CDN with strict headers and Pillow validation.
        """
        if self._transport and hasattr(self._transport, "fetch_page"):
            return await self._transport.fetch_page(page, client)

        headers = {
            "User-Agent": DEFAULT_MANGAFIRE_USER_AGENT,
            "Referer": "https://mangafire.to/",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        }
        if page.headers:
            headers.update(page.headers)

        close_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
            close_client = True

        try:
            resp = await client.get(page.url, headers=headers)
            if resp.status_code != 200:
                raise SourceUnavailableError(f"Failed to fetch image from '{page.url}' (HTTP {resp.status_code})")

            data = resp.content
            if not data or len(data) < 100:
                raise DatasourceError(f"Truncated or empty image response from '{page.url}'", code="TRUNCATED_IMAGE")

            # Pillow image verification
            try:
                img = Image.open(io.BytesIO(data))
                img.verify()
            except Exception as e:
                raise DatasourceError(f"Corrupted image bytes from '{page.url}': {e}", code="INVALID_IMAGE_BYTES")

            return data
        finally:
            if close_client:
                await client.aclose()

    # ──────────────────────────────────────────────────────────────────────────
    # Synchronous Playwright execution helpers (run in dedicated worker threads)
    # ──────────────────────────────────────────────────────────────────────────

    def _fetch_work_details_sync(self, work_id: str, canonical_url: str) -> Optional[Dict[str, Any]]:
        """
        Visits MangaFire title page via Playwright and intercepts the /api/titles/{work_id} response.
        """
        if not importlib.util.find_spec("playwright"):
            raise DatasourceError("Playwright is not installed on this system", code="BROWSER_UNAVAILABLE")

        from playwright.sync_api import sync_playwright

        captured_api_data: Dict[str, Any] = {}

        def on_response(res):
            if f"/api/titles/{work_id}" in res.url and "?" in res.url:
                try:
                    data = res.json()
                    if isinstance(data, dict) and "data" in data:
                        captured_api_data["detail"] = data["data"]
                except Exception:
                    pass

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                try:
                    context = browser.new_context(
                        user_agent=DEFAULT_MANGAFIRE_USER_AGENT,
                        viewport={"width": 1280, "height": 720},
                    )
                    page = context.new_page()
                    page.on("response", on_response)

                    url = f"https://mangafire.to/title/{work_id}"
                    page.goto(url, wait_until="networkidle", timeout=30000)
                    page.wait_for_timeout(2000)

                    detail = captured_api_data.get("detail")
                    if detail:
                        return detail

                    # Fallback to DOM extraction if API event was missed
                    dom_data = page.evaluate("""() => {
                        const h1 = document.querySelector('h1')?.innerText?.trim() || '';
                        const desc = document.querySelector('.description, .synopsis, [itemprop="description"]')?.innerText?.trim() || '';
                        const poster = document.querySelector('.poster img, .manga-poster img, [itemprop="image"]')?.getAttribute('src') || '';
                        return { title: h1, synopsisHtml: desc, poster: { large: poster } };
                    }""")
                    return dom_data
                finally:
                    browser.close()
        except Exception as e:
            logger.error(f"Playwright error resolving MangaFire work '{work_id}': {e}")
            raise SourceUnavailableError(f"Playwright navigation failed for MangaFire work '{work_id}': {e}")

    def _fetch_releases_sync(self, work_id: str, language: str, order: str) -> List[SourceRelease]:
        """
        Navigates through MangaFire pagination, capturing all chapter items.
        """
        if not importlib.util.find_spec("playwright"):
            raise DatasourceError("Playwright is not installed on this system", code="BROWSER_UNAVAILABLE")

        from playwright.sync_api import sync_playwright

        all_items: List[Dict[str, Any]] = []

        def on_response(res):
            if f"/api/titles/{work_id}/chapters" in res.url:
                try:
                    data = res.json()
                    if isinstance(data, dict):
                        items = data.get("items", [])
                        all_items.extend(items)
                except Exception:
                    pass

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                try:
                    context = browser.new_context(
                        user_agent=DEFAULT_MANGAFIRE_USER_AGENT,
                        viewport={"width": 1280, "height": 720},
                    )
                    page = context.new_page()
                    page.on("response", on_response)

                    url = f"https://mangafire.to/title/{work_id}"
                    page.goto(url, wait_until="networkidle", timeout=30000)
                    page.wait_for_timeout(2000)

                    # Iterate through pagination pages (e.g. 2, 3, 4)
                    for p_num in range(2, 20):
                        has_page = page.evaluate(
                            """(num) => {
                            const btns = Array.from(document.querySelectorAll('.npager__num, .pagination a, .pagination button, [data-page]'));
                            const target = btns.find(b => b.innerText.trim() === String(num));
                            if (target) {
                                target.click();
                                return true;
                            }
                            return false;
                        }""",
                            p_num,
                        )
                        if not has_page:
                            break
                        page.wait_for_timeout(2500)

                finally:
                    browser.close()
        except Exception as e:
            logger.error(f"Playwright error fetching chapters for MangaFire work '{work_id}': {e}")
            raise SourceUnavailableError(f"Failed to fetch MangaFire chapters: {e}")

        # Deduplicate raw items by ID
        seen_ids = set()
        unique_items = []
        for item in all_items:
            rel_id = item.get("id")
            if rel_id and rel_id not in seen_ids:
                seen_ids.add(rel_id)
                unique_items.append(item)

        results: List[SourceRelease] = []
        for item in unique_items:
            rel_id = str(item.get("id"))
            c_num = str(item.get("number", "1"))
            c_name = item.get("name", "")
            r_type = item.get("type")  # e.g. "official", "unofficial"
            c_lang = item.get("language") or language

            created_ts = item.get("createdAt")
            created_dt = None
            if created_ts:
                try:
                    created_dt = datetime.fromtimestamp(created_ts, tz=timezone.utc)
                except Exception:
                    pass

            results.append(
                SourceRelease(
                    id=rel_id,
                    source="mangafire",
                    source_work_id=work_id,
                    chapter_number=c_num,
                    title=c_name,
                    volume=None,
                    language=c_lang,
                    unit_kind="oneshot" if c_num.lower() == "oneshot" else "chapter",
                    release_type=r_type,
                    group_id=None,
                    group_name=None,  # Do not invent group from release type
                    uploader=None,
                    uploader_id=None,
                    pages_count=0,
                    version=1,
                    publish_at=created_dt,
                    readable_at=created_dt,
                    created_at=created_dt,
                    updated_at=created_dt,
                    external_url=None,
                )
            )

        return results

    def _fetch_pages_manifest_sync(self, work_id: str, release_id: str) -> SourcePageManifest:
        """
        Navigates to the MangaFire chapter reader and captures the chapter page URLs.
        """
        if not importlib.util.find_spec("playwright"):
            raise DatasourceError("Playwright is not installed on this system", code="BROWSER_UNAVAILABLE")

        from playwright.sync_api import sync_playwright

        captured_chapter_api: Dict[str, Any] = {}

        def on_response(res):
            if f"/api/chapters/{release_id}" in res.url:
                try:
                    data = res.json()
                    if isinstance(data, dict) and "data" in data:
                        captured_chapter_api["data"] = data["data"]
                except Exception:
                    pass

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                try:
                    context = browser.new_context(
                        user_agent=DEFAULT_MANGAFIRE_USER_AGENT,
                        viewport={"width": 1280, "height": 720},
                    )
                    page = context.new_page()
                    page.on("response", on_response)

                    url = f"https://mangafire.to/title/{work_id}/chapter/{release_id}"
                    page.goto(url, wait_until="networkidle", timeout=30000)
                    page.wait_for_timeout(2000)

                    chap_data = captured_chapter_api.get("data")
                    pages_urls: List[str] = []

                    if chap_data and "pages" in chap_data:
                        for p_obj in chap_data["pages"]:
                            if isinstance(p_obj, dict) and "url" in p_obj:
                                pages_urls.append(p_obj["url"])
                            elif isinstance(p_obj, str):
                                pages_urls.append(p_obj)

                    if not pages_urls:
                        # Fallback to DOM evaluation for mfcdn images
                        dom_imgs = page.evaluate("""() => {
                            const imgs = Array.from(document.querySelectorAll('img[src*="mfcdn"]'));
                            return imgs.map(i => i.src).filter(Boolean);
                        }""")
                        pages_urls = dom_imgs

                    if not pages_urls:
                        raise SourceUnavailableError(f"No images found for MangaFire release '{release_id}'")

                    source_pages = [
                        SourcePage(
                            page_number=idx + 1,
                            url=u,
                            headers={"Referer": "https://mangafire.to/"},
                            content_type="image/jpeg",
                        )
                        for idx, u in enumerate(pages_urls)
                    ]

                    return SourcePageManifest(
                        provider="mangafire",
                        work_id=work_id,
                        release_id=release_id,
                        language="en",
                        unit_kind="chapter",
                        chapter_number_raw=str(chap_data.get("number", "")) if chap_data else "",
                        page_count=len(source_pages),
                        pages=source_pages,
                        adapter_version="1.0.0",
                        observed_at=datetime.now(timezone.utc),
                    )

                finally:
                    browser.close()
        except Exception as e:
            logger.error(f"Playwright error resolving pages for MangaFire release '{release_id}': {e}")
            raise SourceUnavailableError(f"Failed to resolve pages for release '{release_id}': {e}")

    # ──────────────────────────────────────────────────────────────────────────
    # Normalization helper
    # ──────────────────────────────────────────────────────────────────────────

    def _normalize_work(self, work_id: str, canonical_url: str, data: Dict[str, Any]) -> SourceWork:
        """
        Normalizes raw MangaFire work JSON into a standardized SourceWork model.
        """
        title = data.get("title") or "Unknown Manga"
        poster = data.get("poster", {})
        poster_url = None
        if isinstance(poster, dict):
            poster_url = poster.get("large") or poster.get("medium") or poster.get("small")
        elif isinstance(poster, str):
            poster_url = poster

        alt_titles = data.get("altTitles", [])
        if not isinstance(alt_titles, list):
            alt_titles = []

        # Extract external IDs (AL, MAL, MangaDex, etc.)
        external_ids = {"mangafire": work_id}
        if data.get("malId"):
            external_ids["mal"] = str(data["malId"])
        if data.get("anilistId"):
            external_ids["al"] = str(data["anilistId"])

        links = data.get("links", {})
        if isinstance(links, dict):
            for k, v in links.items():
                if not v or not isinstance(v, str):
                    continue
                if k == "md" or "mangadex.org/title/" in v:
                    uuid_part = v.rstrip("/").split("/")[-1]
                    if uuid_part:
                        external_ids["mangadex"] = uuid_part
                elif k == "mu" or "mangaupdates.com/series/" in v:
                    mu_part = v.rstrip("/").split("/")[-1]
                    if mu_part:
                        external_ids["mu"] = mu_part
                elif k == "mb" or "mangabaka.org/" in v:
                    mb_part = v.rstrip("/").split("/")[-1]
                    if mb_part:
                        external_ids["mb"] = mb_part

        # Extract authors and artists
        authors_list = [a.get("title") for a in data.get("authors", []) if isinstance(a, dict) and a.get("title")]
        artists_list = [a.get("title") for a in data.get("artists", []) if isinstance(a, dict) and a.get("title")]

        author = ", ".join(authors_list) if authors_list else None
        artist = ", ".join(artists_list) if artists_list else None

        genres = [g.get("title") for g in data.get("genres", []) if isinstance(g, dict) and g.get("title")]
        themes = [t.get("title") for t in data.get("themes", []) if isinstance(t, dict) and t.get("title")]
        demographics = [d.get("title") for d in data.get("demographics", []) if isinstance(d, dict) and d.get("title")]

        desc = data.get("synopsisHtml") or data.get("description") or ""
        # Clean basic HTML tags from synopsis
        import re

        clean_desc = re.sub(r"<[^>]+>", " ", desc).strip()
        clean_desc = re.sub(r"\s+", " ", clean_desc)

        return SourceWork(
            source="mangafire",
            source_work_id=work_id,
            title=title,
            url=canonical_url,
            alt_titles=alt_titles,
            author=author,
            artist=artist,
            cover_url=poster_url,
            status=data.get("status"),
            year=str(data["year"]) if data.get("year") is not None else None,
            description=clean_desc,
            content_rating=data.get("contentRating"),
            publication_demographic=demographics[0] if demographics else None,
            original_language="ja" if "manga" in str(data.get("type", "")).lower() else None,
            available_languages=data.get("languages", ["en"]),
            external_ids=external_ids,
            extra_metadata={
                "rating": data.get("rating"),
                "rating_count": data.get("ratingCount"),
                "follows": data.get("follows"),
                "genres": genres,
                "themes": themes,
                "demographics": demographics,
                "latest_chapter": data.get("latestChapter"),
            },
        )
