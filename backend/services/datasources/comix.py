import asyncio
import importlib.util
import io
import logging
import re
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
from backend.services.datasources.anti_bot.local_ai_solver import LocalCaptchaSolver
from backend.services.datasources.anti_bot.session_store import SessionStore
from backend.services.datasources.anti_bot.stealth_transport import (
    DEFAULT_STEALTH_USER_AGENT,
    StealthTransport,
)
from backend.services.datasources.contracts import MangaSourceProvider
from backend.services.datasources.url_utils import validate_and_parse_source_url

logger = logging.getLogger(__name__)

DEFAULT_COMIX_USER_AGENT = DEFAULT_STEALTH_USER_AGENT


class ComixProvider(MangaSourceProvider):
    """
    Comix (comix.to) implementation of MangaSourceProvider.
    Uses hybrid transport:
    - Stealth Playwright Browser Context with Anti-Bot Local AI Solver & session store (storage_state.json)
      for metadata, catalogue pagination, and chapter page manifest resolution.
    - Direct HTTP Client (httpx) with 'Referer: https://comix.to/' and session headers for streaming image bytes.
    """

    def __init__(
        self,
        transport: Optional[Any] = None,
        session_store: Optional[SessionStore] = None,
        solver: Optional[LocalCaptchaSolver] = None,
    ):
        self._transport = transport
        self.session_store = session_store or SessionStore(provider="comix")
        self.solver = solver or LocalCaptchaSolver()
        self._stealth_transport = StealthTransport(
            provider="comix",
            session_store=self.session_store,
            solver=self.solver,
        )
        self._release_to_work_id: Dict[str, str] = {}
        self._work_cache: Dict[str, Dict[str, Any]] = {}
        self._releases_cache: Dict[str, Dict[str, SourceRelease]] = {}

    @property
    def name(self) -> str:
        return "comix"

    @property
    def capabilities(self) -> ProviderCapability:
        return ProviderCapability(
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

    async def resolve_work(self, url_or_id: str) -> SourceWork:
        """
        Resolves a work from a Comix title URL or work identifier (e.g. 'r9j5m' or 'r9j5m-yajin').
        """
        clean_input = url_or_id.strip()
        if clean_input.startswith("http://") or clean_input.startswith("https://"):
            provider, work_id, canonical_url = validate_and_parse_source_url(clean_input)
            if provider != "comix":
                raise ValueError(f"URL belongs to provider '{provider}', not 'comix'")
        else:
            work_id = clean_input.lower()
            canonical_url = f"https://comix.to/title/{work_id}"

        if self._transport and hasattr(self._transport, "resolve_work"):
            return await self._transport.resolve_work(work_id, canonical_url)

        # Run Playwright browser execution in thread
        raw_data = await asyncio.to_thread(self._fetch_work_details_sync, work_id, canonical_url)
        if not raw_data:
            raise SourceUnavailableError(f"Comix work '{work_id}' not found or unreachable")

        self._work_cache[work_id] = raw_data
        return self._normalize_work(work_id, canonical_url, raw_data)

    async def get_metadata(self, work_id: str) -> Dict[str, Any]:
        """
        Retrieves raw and normalized metadata for the Comix work.
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

        if work_id not in self._releases_cache:
            self._releases_cache[work_id] = {}
        for rel in releases:
            self._release_to_work_id[rel.id] = work_id
            self._releases_cache[work_id][rel.id] = rel

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

    async def get_release(self, work: Any, release_id: str) -> Optional[SourceRelease]:
        """
        Retrieves a single release metadata item by release ID from cache if available.
        """
        work_id = getattr(work, "source_work_id", None) or str(work)
        rel_id_str = str(release_id).strip()
        if work_id in self._releases_cache and rel_id_str in self._releases_cache[work_id]:
            return self._releases_cache[work_id][rel_id_str]

        for _w_id, rels in self._releases_cache.items():
            if rel_id_str in rels:
                return rels[rel_id_str]

        return None

    async def resolve_pages(self, release_id: str) -> SourcePageManifest:
        """
        Resolves the ordered image pages manifest for a Comix release.
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

                doc = await get_db().chapters.find_one({"source": "comix", "source_id": clean_release_id})
                if doc and doc.get("source_work_id"):
                    work_id = str(doc["source_work_id"])
            except Exception as e:
                logger.debug(f"DB lookup for work_id of release {clean_release_id} failed: {e}")

        if not work_id:
            raise SourceUnavailableError(
                f"Cannot resolve work context for Comix release '{clean_release_id}'. Work ID required."
            )

        manifest_data = await asyncio.to_thread(
            self._fetch_pages_manifest_sync,
            work_id,
            clean_release_id,
        )

        return manifest_data

    async def fetch_page(self, page: SourcePage, client: Optional[httpx.AsyncClient] = None) -> bytes:
        """
        Downloads image bytes from Comix CDN with strict headers and Pillow validation.
        """
        if self._transport and hasattr(self._transport, "fetch_page"):
            return await self._transport.fetch_page(page, client)

        headers = {
            "User-Agent": DEFAULT_COMIX_USER_AGENT,
            "Referer": "https://comix.to/",
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

    async def warmup_session_interactive(self, target_url: str = "https://comix.to") -> Dict[str, Any]:
        """
        Launches local headed browser session for one-touch HITL Cloudflare Turnstile verification.
        """
        return await self._stealth_transport.warmup_session_interactive(target_url)

    # ──────────────────────────────────────────────────────────────────────────
    # Synchronous Playwright execution helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _fetch_work_details_sync(self, work_id: str, canonical_url: str) -> Optional[Dict[str, Any]]:
        """
        Visits Comix title page via Playwright and captures metadata from JSON hydration or DOM.
        """
        if not importlib.util.find_spec("playwright"):
            raise DatasourceError("Playwright is not installed on this system", code="BROWSER_UNAVAILABLE")

        from playwright.sync_api import sync_playwright

        captured_api_data: Dict[str, Any] = {}

        def on_response(res):
            if "/api/" in res.url and work_id in res.url:
                try:
                    data = res.json()
                    if isinstance(data, dict):
                        captured_api_data["api"] = data
                except Exception:
                    pass

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=["--disable-blink-features=AutomationControlled"],
                )
                try:
                    # Apply storage_state if available
                    session_file = self.session_store.get_session_file("comix")
                    storage_state = str(session_file) if session_file.exists() else None

                    context = browser.new_context(
                        user_agent=DEFAULT_COMIX_USER_AGENT,
                        viewport={"width": 1280, "height": 720},
                        storage_state=storage_state,
                    )
                    page = context.new_page()
                    page.on("response", on_response)

                    url = f"https://comix.to/title/{work_id}"
                    page.goto(url, wait_until="networkidle", timeout=30000)
                    page.wait_for_timeout(2000)

                    # 1. Check API capture
                    if captured_api_data.get("api"):
                        return captured_api_data["api"]

                    # 2. Extract DOM data
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
            logger.error(f"Playwright error resolving Comix work '{work_id}': {e}")
            raise SourceUnavailableError(f"Playwright navigation failed for Comix work '{work_id}': {e}")

    def _fetch_releases_sync(self, work_id: str, language: str, order: str) -> List[SourceRelease]:
        """
        Navigates through Comix pagination, capturing chapter items.
        """
        if not importlib.util.find_spec("playwright"):
            raise DatasourceError("Playwright is not installed on this system", code="BROWSER_UNAVAILABLE")

        from playwright.sync_api import sync_playwright

        all_items: List[Dict[str, Any]] = []

        def on_response(res):
            if "/api/" in res.url and "chapter" in res.url:
                try:
                    data = res.json()
                    if isinstance(data, dict):
                        items = data.get("items", []) or data.get("data", [])
                        if isinstance(items, list):
                            all_items.extend(items)
                except Exception:
                    pass

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=["--disable-blink-features=AutomationControlled"],
                )
                try:
                    session_file = self.session_store.get_session_file("comix")
                    storage_state = str(session_file) if session_file.exists() else None

                    context = browser.new_context(
                        user_agent=DEFAULT_COMIX_USER_AGENT,
                        viewport={"width": 1280, "height": 720},
                        storage_state=storage_state,
                    )
                    page = context.new_page()
                    page.on("response", on_response)

                    url = f"https://comix.to/title/{work_id}"
                    page.goto(url, wait_until="networkidle", timeout=30000)
                    page.wait_for_timeout(2000)

                    # Iterate through pagination pages
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
            logger.error(f"Playwright error fetching chapters for Comix work '{work_id}': {e}")
            raise SourceUnavailableError(f"Failed to fetch Comix chapters: {e}")

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
            r_type = item.get("type")
            c_lang = item.get("language") or language

            results.append(
                SourceRelease(
                    id=rel_id,
                    source="comix",
                    source_work_id=work_id,
                    chapter_number=c_num,
                    title=c_name,
                    volume=str(item.get("volume")) if item.get("volume") is not None else None,
                    language=c_lang,
                    unit_kind="chapter",
                    release_type=r_type,
                    group_name=item.get("group_name") or item.get("group"),
                    pages_count=int(item.get("page_count") or item.get("pages_count") or 0),
                )
            )

        return results

    def _fetch_pages_manifest_sync(self, work_id: str, release_id: str) -> SourcePageManifest:
        """
        Navigates to the chapter reading page and intercepts/extracts the list of image URLs.
        """
        if not importlib.util.find_spec("playwright"):
            raise DatasourceError("Playwright is not installed on this system", code="BROWSER_UNAVAILABLE")

        from playwright.sync_api import sync_playwright

        captured_images: List[str] = []

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=["--disable-blink-features=AutomationControlled"],
                )
                try:
                    session_file = self.session_store.get_session_file("comix")
                    storage_state = str(session_file) if session_file.exists() else None

                    context = browser.new_context(
                        user_agent=DEFAULT_COMIX_USER_AGENT,
                        viewport={"width": 1280, "height": 720},
                        storage_state=storage_state,
                    )
                    page = context.new_page()

                    def on_response(res):
                        u = res.url.lower()
                        if any(ext in u for ext in [".jpg", ".jpeg", ".png", ".webp", ".avif"]) and "avatar" not in u:
                            if u not in captured_images:
                                captured_images.append(res.url)

                    page.on("response", on_response)

                    url = f"https://comix.to/title/{work_id}/{release_id}"
                    page.goto(url, wait_until="networkidle", timeout=30000)
                    page.wait_for_timeout(3000)

                    # Extract images directly from DOM as well
                    dom_imgs = page.evaluate("""() => {
                        const imgs = Array.from(document.querySelectorAll('.reader img, .chapter-images img, [data-page] img'));
                        return imgs.map(i => i.getAttribute('src') || i.getAttribute('data-src')).filter(Boolean);
                    }""")
                    for img_url in dom_imgs:
                        if img_url not in captured_images:
                            captured_images.append(img_url)

                finally:
                    browser.close()
        except Exception as e:
            logger.error(f"Playwright error fetching pages for Comix release '{release_id}': {e}")
            raise SourceUnavailableError(f"Failed to resolve pages for Comix release '{release_id}': {e}")

        if not captured_images:
            raise DatasourceError(
                f"No images found for Comix release '{release_id}'",
                code="EMPTY_CHAPTER_PAGES",
            )

        pages = [
            SourcePage(
                page_number=idx + 1,
                url=u,
                headers={"Referer": "https://comix.to/"},
            )
            for idx, u in enumerate(captured_images)
        ]

        return SourcePageManifest(
            provider="comix",
            work_id=work_id,
            release_id=release_id,
            page_count=len(pages),
            pages=pages,
        )

    def _normalize_work(self, work_id: str, canonical_url: str, raw: Dict[str, Any]) -> SourceWork:
        """
        Normalizes raw scraped dictionary into a standard SourceWork model.
        """
        title = raw.get("title") or work_id
        synopsis = raw.get("synopsisHtml") or raw.get("description") or ""
        clean_desc = re.sub(r"<[^>]+>", "", synopsis).strip()

        poster_data = raw.get("poster") or {}
        cover_url = poster_data.get("large") if isinstance(poster_data, dict) else raw.get("cover_url")

        alt_titles = raw.get("alt_titles") or []
        if isinstance(alt_titles, str):
            alt_titles = [alt_titles]

        return SourceWork(
            source="comix",
            source_work_id=work_id,
            title=title,
            url=canonical_url,
            alt_titles=alt_titles,
            author=raw.get("author"),
            artist=raw.get("artist"),
            cover_url=cover_url,
            status=raw.get("status"),
            year=str(raw.get("year")) if raw.get("year") else None,
            description=clean_desc,
            content_rating=raw.get("content_rating"),
            available_languages=raw.get("available_languages", ["en"]),
            extra_metadata=raw,
        )
