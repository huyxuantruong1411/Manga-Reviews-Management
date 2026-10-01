import asyncio
import logging
import os
import random
from typing import Any, Dict, List, Optional

import httpx

from backend.utils.rate_limiter import mangadex_rate_limiter

logger = logging.getLogger(__name__)


class MangaDexService:
    BASE_URL = "https://api.mangadex.org"

    USER_AGENTS = [
        # Chrome (Windows, macOS, Linux)
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        # Firefox (Windows, macOS, Linux)
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/122.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/120.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/122.0",
        "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/120.0",
        "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0",
        # Safari (macOS, iOS)
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/605.1.15",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/605.1.15",
        "Mozilla/5.0 (iPad; CPU OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/605.1.15",
        # Edge (Windows, macOS)
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
        # Chrome Mobile (Android)
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
        # Firefox Mobile (Android)
        "Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0",
        "Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0",
    ]

    CONTENT_RATINGS = ["safe", "suggestive", "erotica", "pornographic"]

    def __init__(self):
        self._image_client: Optional[httpx.AsyncClient] = None
        self._image_client_lock = asyncio.Lock()

    async def _get_image_client(self) -> httpx.AsyncClient:
        from backend.config import settings

        proxies = settings.mangadex_proxy if settings.mangadex_proxy else None
        if self._image_client is None or self._image_client.is_closed:
            async with self._image_client_lock:
                if self._image_client is None or self._image_client.is_closed:
                    self._image_client = httpx.AsyncClient(
                        proxy=proxies,
                        timeout=httpx.Timeout(30.0, connect=10.0),
                        limits=httpx.Limits(max_keepalive_connections=20, max_connections=40),
                    )
        return self._image_client

    def _get_headers(self) -> Dict[str, str]:
        return {"User-Agent": "Manga-Reviews-Management/1.0.0 (contact@manga-reviews-management.local)"}

    async def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        # Enforce Rate Limiter
        await mangadex_rate_limiter.acquire()

        url = f"{self.BASE_URL}{endpoint}"
        from backend.config import settings

        proxies = settings.mangadex_proxy if settings.mangadex_proxy else None
        headers = self._get_headers()

        async with httpx.AsyncClient(proxy=proxies, timeout=20.0) as client:
            try:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", 5))
                    logger.warning(f"MangaDex rate limited (429). Sleeping for {retry_after}s...")
                    await asyncio.sleep(retry_after)
                    return await self._request(endpoint, params)

                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as e:
                status_code = e.response.status_code
                response_text = e.response.text
                logger.warning(f"HTTP Error calling MangaDex ({endpoint}): {status_code} - {response_text[:200]}")

                # Check if it looks like a browser block/unsupported browser page (e.g. HTML response)
                is_html_block = False
                if "content-type" in e.response.headers:
                    ct = e.response.headers["content-type"].lower()
                    if "text/html" in ct or "application/xhtml+xml" in ct:
                        is_html_block = True
                elif response_text.strip().startswith("<!doctype html") or "<html" in response_text.lower():
                    is_html_block = True

                if is_html_block or "Unsupported Browser" in response_text:
                    logger.warning("Detected browser block/challenge page. Attempting browser simulation fallback...")
                    fallback_data = await self._request_via_playwright(endpoint, params)
                    if fallback_data is not None:
                        return fallback_data

                # Fallback 1: Try authenticated request for 403 or 5xx errors
                if status_code in (403,) or status_code >= 500:
                    auth_data = await self._request_authenticated(endpoint, params)
                    if auth_data is not None:
                        return auth_data
                return None
            except (
                httpx.ConnectError,
                httpx.ConnectTimeout,
                httpx.ReadTimeout,
                httpx.WriteTimeout,
                httpx.NetworkError,
            ) as e:
                logger.warning(f"Network error calling MangaDex ({endpoint}): {e}.")
                # Fallback 1: Try authenticated request
                auth_data = await self._request_authenticated(endpoint, params)
                if auth_data is not None:
                    return auth_data
                # Fallback 2: Browser simulation
                logger.warning(
                    f"Auth fallback failed or unavailable for ({endpoint}). Attempting browser simulation fallback..."
                )
                fallback_data = await self._request_via_playwright(endpoint, params)
                if fallback_data is not None:
                    return fallback_data
                logger.error(f"All fallbacks failed for MangaDex ({endpoint}).")
                return None
            except Exception as e:
                logger.error(f"Error calling MangaDex ({endpoint}): {e}")
                return None

    async def _request_authenticated(
        self, endpoint: str, params: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Retry a MangaDex API request with an authenticated Bearer token.
        This is a fallback layer — only called when the anonymous request has already failed.
        Returns None if auth is not configured or the authenticated request also fails.
        """
        from backend.utils.mangadex_auth import mangadex_auth

        token = await mangadex_auth.get_access_token()
        if not token:
            logger.debug(f"Auth fallback skipped for ({endpoint}): no token available.")
            return None

        logger.info(f"Attempting authenticated fallback for MangaDex ({endpoint})...")

        await mangadex_rate_limiter.acquire()

        url = f"{self.BASE_URL}{endpoint}"
        from backend.config import settings

        proxies = settings.mangadex_proxy if settings.mangadex_proxy else None
        headers = self._get_headers()
        headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(proxy=proxies, timeout=20.0) as client:
            try:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code == 401:
                    # Token might be stale despite our expiry tracking — invalidate and retry once
                    logger.warning("MangaDex auth fallback got 401. Invalidating token and retrying...")
                    mangadex_auth.invalidate()
                    new_token = await mangadex_auth.get_access_token()
                    if not new_token:
                        return None
                    headers["Authorization"] = f"Bearer {new_token}"
                    resp = await client.get(url, params=params, headers=headers)

                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", 5))
                    logger.warning(f"MangaDex rate limited (429) on auth request. Sleeping for {retry_after}s...")
                    await asyncio.sleep(retry_after)
                    return await self._request_authenticated(endpoint, params)

                resp.raise_for_status()
                logger.info(f"MangaDex auth fallback SUCCEEDED for ({endpoint}).")
                return resp.json()
            except Exception as e:
                logger.warning(f"MangaDex auth fallback FAILED for ({endpoint}): {e}")
                return None

    def _request_via_playwright_sync(self, url: str, proxy_url: Optional[str]) -> Optional[Dict[str, Any]]:
        import json

        from playwright.sync_api import sync_playwright

        try:
            with sync_playwright() as p:
                ua = random.choice(self.USER_AGENTS)
                context_options = {
                    "user_agent": ua,
                    "viewport": {"width": 1280, "height": 720},
                    "extra_http_headers": {
                        "Referer": "https://mangadex.org/",
                        "Origin": "https://mangadex.org",
                        "Accept-Language": "en-US,en;q=0.9",
                    },
                }

                if proxy_url:
                    context_options["proxy"] = {"server": proxy_url}

                try:
                    browser = p.chromium.launch(headless=True)
                except Exception as launch_err:
                    logger.error(
                        f"Failed to launch Playwright Chromium: {launch_err}. "
                        "Make sure you have run 'playwright install' or 'playwright install chromium'."
                    )
                    return None

                try:
                    context = browser.new_context(**context_options)
                    page = context.new_page()

                    response = page.goto(url, wait_until="commit", timeout=15000)
                    if not response:
                        raise Exception("No response received from page.goto")

                    status = response.status
                    if status == 429:
                        logger.warning("MangaDex rate limit (429) hit in Playwright.")
                        return None

                    content = response.text()

                    if status >= 400:
                        logger.error(f"Playwright request failed with status {status}: {content[:200]}")
                        return None

                    return json.loads(content)
                finally:
                    browser.close()
        except Exception as e:
            logger.error(f"Playwright sync browser simulation failed: {e}")
            return None

    async def _request_via_playwright(
        self, endpoint: str, params: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        import importlib.util

        if not importlib.util.find_spec("playwright"):
            logger.warning("Playwright is not installed. Skipping browser-simulation fallback.")
            return None

        import asyncio
        import urllib.parse

        url = f"{self.BASE_URL}{endpoint}"
        if params:
            url += "?" + urllib.parse.urlencode(params, doseq=True)

        from backend.config import settings

        proxy_url = settings.mangadex_proxy or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
        if proxy_url:
            if not (
                proxy_url.startswith("http://")
                or proxy_url.startswith("https://")
                or proxy_url.startswith("socks5://")
                or proxy_url.startswith("socks4://")
            ):
                proxy_url = f"http://{proxy_url}"

        logger.info(f"Attempting browser simulation fallback via Playwright (Sync in Thread) for: {url}")
        try:
            return await asyncio.to_thread(self._request_via_playwright_sync, url, proxy_url)
        except Exception as e:
            logger.error(f"Failed running playwright sync in thread: {e}")
            return None

    def _download_via_playwright_sync(self, url: str, proxy_url: Optional[str]) -> Optional[bytes]:
        from playwright.sync_api import sync_playwright

        try:
            with sync_playwright() as p:
                ua = random.choice(self.USER_AGENTS)
                context_options = {
                    "user_agent": ua,
                    "extra_http_headers": {
                        "Referer": "https://mangadex.org/",
                        "Origin": "https://mangadex.org",
                    },
                }

                if proxy_url:
                    context_options["proxy"] = {"server": proxy_url}

                try:
                    browser = p.chromium.launch(headless=True)
                except Exception as launch_err:
                    logger.error(
                        f"Failed to launch Playwright Chromium: {launch_err}. "
                        "Make sure you have run 'playwright install' or 'playwright install chromium'."
                    )
                    return None

                try:
                    context = browser.new_context(**context_options)
                    page = context.new_page()

                    response = page.goto(url, wait_until="commit", timeout=20000)
                    if not response:
                        raise Exception("No response received from page.goto for image download")

                    status = response.status
                    if status >= 400:
                        raise Exception(f"Failed to fetch image, status code {status}")

                    return response.body()
                finally:
                    browser.close()
        except Exception as e:
            logger.error(f"Playwright sync image download failed: {e}")
            return None

    async def _download_via_playwright(self, url: str) -> Optional[bytes]:
        import importlib.util

        if not importlib.util.find_spec("playwright"):
            logger.warning("Playwright is not installed. Skipping browser-simulation download fallback.")
            return None

        import asyncio

        from backend.config import settings

        proxy_url = settings.mangadex_proxy or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
        if proxy_url:
            if not (
                proxy_url.startswith("http://")
                or proxy_url.startswith("https://")
                or proxy_url.startswith("socks5://")
                or proxy_url.startswith("socks4://")
            ):
                proxy_url = f"http://{proxy_url}"

        logger.info(f"Attempting browser simulation image download via Playwright (Sync in Thread) for: {url}")
        try:
            return await asyncio.to_thread(self._download_via_playwright_sync, url, proxy_url)
        except Exception as e:
            logger.error(f"Failed running playwright sync download in thread: {e}")
            return None

    def parse_mangadex_links(self, links_dict: Optional[Dict[str, str]], mangadex_id: str) -> List[Dict[str, str]]:
        resolved = []
        resolved.append({"title": "MangaDex", "url": f"https://mangadex.org/title/{mangadex_id}"})
        if not links_dict:
            return resolved

        templates = {
            "al": ("AniList", "https://anilist.co/manga/{}"),
            "ap": ("Anime-Planet", "https://www.anime-planet.com/manga/{}"),
            "bw": ("BookWalker", "https://bookwalker.jp/{}"),
            "mu": ("MangaUpdates", "https://www.mangaupdates.com/series.html?id={}"),
            "nu": ("NovelUpdates", "https://www.novelupdates.com/series/{}"),
            "kt": ("Kitsu", "https://kitsu.io/manga/{}"),
            "mal": ("MyAnimeList", "https://myanimelist.net/manga/{}"),
            "amz": ("Amazon", "{}"),
            "ebj": ("eBookJapan", "{}"),
            "cdj": ("CDJapan", "{}"),
            "raw": ("Official Raw", "{}"),
            "engtl": ("Official English", "{}"),
        }

        for key, value in links_dict.items():
            if key in templates:
                title, template = templates[key]
                if key == "bw":
                    val_str = str(value).lstrip("/")
                    url = f"https://bookwalker.jp/{val_str}"
                elif "{}" in template:
                    url = template.format(value)
                else:
                    url = value
                resolved.append({"title": title, "url": url})
        return resolved

    async def search_manga(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search for manga on MangaDex. Returns metadata, alt titles, author, artist, and cover url.
        """
        import re
        import uuid

        uuid_pattern = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
        clean_query = query.strip()
        url_match = re.search(rf"/title/({uuid_pattern})", clean_query)
        if url_match:
            clean_query = url_match.group(1)

        is_uuid = False
        try:
            uuid.UUID(str(clean_query))
            is_uuid = True
        except ValueError:
            pass

        if is_uuid:
            params = {"ids[]": [clean_query]}
        else:
            params = {
                "title": clean_query,
                "limit": limit,
                "order[relevance]": "desc",
            }

        params["contentRating[]"] = self.CONTENT_RATINGS
        params["includes[]"] = ["author", "artist", "cover_art"]

        data = await self._request("/manga", params)
        if not data or "data" not in data:
            return []

        manga_list = []
        for item in data["data"]:
            attr = item["attributes"]
            m_id = item["id"]

            title = attr["title"].get("en") or list(attr["title"].values())[0] if attr["title"] else "No Title"

            alt_titles = []
            if "altTitles" in attr:
                for alt_dict in attr["altTitles"]:
                    for lang, val in alt_dict.items():
                        alt_titles.append(f"{lang}|{val}")

            authors = [
                rel["attributes"]["name"]
                for rel in item["relationships"]
                if rel["type"] == "author" and "attributes" in rel
            ]
            artists = [
                rel["attributes"]["name"]
                for rel in item["relationships"]
                if rel["type"] == "artist" and "attributes" in rel
            ]

            cover_file = None
            for rel in item["relationships"]:
                if rel["type"] == "cover_art" and "attributes" in rel:
                    cover_file = rel["attributes"]["fileName"]
                    break

            cover_url = f"https://uploads.mangadex.org/covers/{m_id}/{cover_file}" if cover_file else None

            manga_list.append(
                {
                    "id": m_id,
                    "title": title,
                    "alt_titles": alt_titles,
                    "year": str(attr.get("year")) if attr.get("year") else "N/A",
                    "author": ", ".join(authors) if authors else "Unknown",
                    "artist": ", ".join(artists) if artists else "Unknown",
                    "cover_url": cover_url,
                    "status": attr.get("status"),
                    "description": attr.get("description", {}).get("en") or attr.get("description", {}).get("vi") or "",
                    "content_rating": attr.get("contentRating"),
                    "publication_demographic": attr.get("publicationDemographic"),
                    "original_language": attr.get("originalLanguage"),
                    "links": self.parse_mangadex_links(attr.get("links", {}), m_id),
                }
            )

        return manga_list

    async def get_manga_details(self, mangadex_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch details for a single manga by MangaDex ID.
        """
        params = {"includes[]": ["author", "artist", "cover_art"]}
        data = await self._request(f"/manga/{mangadex_id}", params)
        if not data or "data" not in data:
            return None

        item = data["data"]
        attr = item["attributes"]
        m_id = item["id"]

        title = attr["title"].get("en") or list(attr["title"].values())[0] if attr["title"] else "No Title"

        alt_titles = []
        if "altTitles" in attr:
            for alt_dict in attr["altTitles"]:
                for lang, val in alt_dict.items():
                    alt_titles.append(f"{lang}|{val}")

        authors = [
            rel["attributes"]["name"]
            for rel in item["relationships"]
            if rel["type"] == "author" and "attributes" in rel
        ]
        artists = [
            rel["attributes"]["name"]
            for rel in item["relationships"]
            if rel["type"] == "artist" and "attributes" in rel
        ]

        authors_meta = []
        artists_meta = []
        for rel in item["relationships"]:
            if rel["type"] == "author":
                authors_meta.append({"id": rel["id"], "name": rel.get("attributes", {}).get("name") or "Unknown"})
            elif rel["type"] == "artist":
                artists_meta.append({"id": rel["id"], "name": rel.get("attributes", {}).get("name") or "Unknown"})

        cover_file = None
        for rel in item["relationships"]:
            if rel["type"] == "cover_art" and "attributes" in rel:
                cover_file = rel["attributes"]["fileName"]
                break

        cover_url = f"https://uploads.mangadex.org/covers/{m_id}/{cover_file}" if cover_file else None

        # Gather tags
        tags = []
        for t in attr.get("tags", []):
            t_attr = t.get("attributes", {})
            tags.append(
                {
                    "mangadex_id": t.get("id"),
                    "name": t_attr.get("name", {}),
                    "group": t_attr.get("group"),
                    "description": t_attr.get("description"),
                }
            )

        return {
            "mangadex_id": m_id,
            "title": title,
            "alt_titles": alt_titles,
            "description": attr.get("description", {}).get("en") or attr.get("description", {}).get("vi") or "",
            "author": ", ".join(authors) if authors else "Unknown",
            "artist": ", ".join(artists) if artists else "Unknown",
            "authors_meta": authors_meta,
            "artists_meta": artists_meta,
            "year": str(attr.get("year")) if attr.get("year") else "N/A",
            "status": attr.get("status"),
            "cover_url": cover_url,
            "tags": tags,
            "content_rating": attr.get("contentRating"),
            "publication_demographic": attr.get("publicationDemographic"),
            "original_language": attr.get("originalLanguage"),
            "last_volume": attr.get("lastVolume"),
            "last_chapter": attr.get("lastChapter"),
            "links": self.parse_mangadex_links(attr.get("links", {}), m_id),
        }

    async def get_creator_by_id(self, creator_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch creator details from MangaDex by creator ID.
        """
        data = await self._request(f"/author/{creator_id}")
        if not data or "data" not in data:
            return None

        item = data["data"]
        attr = item["attributes"]

        return {
            "mangadex_id": item["id"],
            "name": attr.get("name") or "Unknown",
            "biography": attr.get("biography") or {},
            "twitter": attr.get("twitter"),
            "pixiv": attr.get("pixiv"),
            "youtube": attr.get("youtube"),
            "website": attr.get("website"),
        }

    async def get_creator_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Search for a creator by name on MangaDex and return their details.
        """
        params = {"name": name, "limit": 10}
        data = await self._request("/author", params)
        if not data or "data" not in data or not data["data"]:
            return None

        # Find exact match or first match
        authors = data["data"]
        matched = None
        for author in authors:
            if author.get("attributes", {}).get("name", "").lower() == name.lower():
                matched = author
                break
        if not matched:
            matched = authors[0]

        attr = matched["attributes"]
        return {
            "mangadex_id": matched["id"],
            "name": attr.get("name") or "Unknown",
            "biography": attr.get("biography") or {},
            "twitter": attr.get("twitter"),
            "pixiv": attr.get("pixiv"),
            "youtube": attr.get("youtube"),
            "website": attr.get("website"),
        }

    async def get_manga_chapters(self, mangadex_id: str, lang: str = "en") -> List[Dict[str, Any]]:
        """
        Get all chapters of a manga translated into the specified language, sorted naturally by chapter number.
        Preserves all MangaDex metadata: volume, scanlation group, uploader, publishAt, readableAt, pages.
        """
        all_chapters = []
        offset = 0
        limit = 500
        while True:
            params = {
                "limit": limit,
                "offset": offset,
                "translatedLanguage[]": [lang],
                "order[chapter]": "asc",
                "includeFutureUpdates": 0,
                "contentRating[]": self.CONTENT_RATINGS,
                "includes[]": ["scanlation_group", "user"],
            }

            data = await self._request(f"/manga/{mangadex_id}/feed", params)
            if not data or "data" not in data:
                break

            for chap in data["data"]:
                attr = chap.get("attributes", {})
                # Skip external links
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

                group_id = ",".join(group_ids) if group_ids else "no-group"
                group_name = " & ".join(group_names) if group_names else "No Group"

                # Normalize volume: clean empty strings, "none", "null" to None
                raw_vol = attr.get("volume")
                vol_clean = None
                if raw_vol is not None:
                    s_vol = str(raw_vol).strip()
                    if s_vol and s_vol.lower() not in ("none", "null", "no volume"):
                        vol_clean = s_vol

                all_chapters.append(
                    {
                        "id": chap["id"],
                        "chapter": attr.get("chapter") or "Oneshot",
                        "title": attr.get("title") or "",
                        "volume": vol_clean,
                        "group_id": group_id,
                        "group_name": group_name,
                        "uploader": uploader_name,
                        "uploader_id": uploader_id,
                        "publish_at": attr.get("publishAt"),
                        "readable_at": attr.get("readableAt"),
                        "created_at": attr.get("createdAt"),
                        "updated_at": attr.get("updatedAt"),
                        "pages": attr.get("pages") or 0,
                        "version": attr.get("version", 1),
                        "language": attr.get("translatedLanguage") or lang,
                    }
                )

            if offset + limit >= data.get("total", 0):
                break
            offset += limit

        # De-duplicate by (chapter, group_id) while preserving richer metadata
        unique_chapters = {}
        for c in all_chapters:
            key = (c["chapter"], c["group_id"])
            if key not in unique_chapters:
                unique_chapters[key] = c
            else:
                prev = unique_chapters[key]
                if not prev.get("volume") and c.get("volume"):
                    prev["volume"] = c.get("volume")
                if not prev.get("title") and c.get("title"):
                    prev["title"] = c.get("title")
                if not prev.get("uploader") and c.get("uploader"):
                    prev["uploader"] = c.get("uploader")
                if not prev.get("publish_at") and c.get("publish_at"):
                    prev["publish_at"] = c.get("publish_at")
                if not prev.get("pages") and c.get("pages"):
                    prev["pages"] = c.get("pages")

        result = list(unique_chapters.values())

        # Sort key helper: strictly prioritize numeric chapter number, then volume number, then group
        def get_chap_num(x):
            try:
                ch_str = str(x.get("chapter", "0")).strip().lower()
                if ch_str in ("oneshot", "one-shot"):
                    c_num = 0.0
                else:
                    c_num = float(ch_str)
            except (ValueError, TypeError):
                c_num = 999999.0

            vol_raw = x.get("volume")
            try:
                v_num = float(vol_raw) if vol_raw is not None else 999999.0
            except (ValueError, TypeError):
                v_num = 999999.0

            return (c_num, v_num, x.get("group_name", ""))

        result.sort(key=get_chap_num)
        return result

    async def get_available_languages(self, mangadex_id: str) -> List[str]:
        """
        Get all available translated languages for a manga.
        """
        langs = set()
        offset = 0
        limit = 500
        while True:
            params = {
                "limit": limit,
                "offset": offset,
                "contentRating[]": self.CONTENT_RATINGS,
                "includeFutureUpdates": 0,
            }
            data = await self._request(f"/manga/{mangadex_id}/feed", params)
            if not data or "data" not in data:
                break

            for c in data["data"]:
                lang = c["attributes"].get("translatedLanguage")
                if lang:
                    langs.add(lang)

            if offset + limit >= data.get("total", 0):
                break
            offset += limit

        return list(langs)

    async def get_chapter_images(self, chapter_id: str) -> List[str]:
        """
        Get the image URLs for a chapter.
        """
        data = await self._request(f"/at-home/server/{chapter_id}")
        if not data or "baseUrl" not in data:
            return []
        base = data["baseUrl"]
        hash_ = data["chapter"]["hash"]
        return [f"{base}/data/{hash_}/{f}" for f in data["chapter"]["data"]]

    async def download_image_bytes(self, url: str, _retries: int = 2) -> Optional[bytes]:
        """
        Downloads image bytes for local saving or uploading to MinIO.
        Uses pooled persistent client. Retries on transient network failures before falling back to Playwright.
        Note: MangaDex image CDNs / MangaDex@Home nodes are not throttled by the REST API rate limiter.
        """
        headers = self._get_headers()
        client = await self._get_image_client()
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.content
        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            response_text = e.response.text
            logger.warning(f"HTTP Error downloading image {url}: {status_code} - {response_text[:200]}")

            # Check if it looks like a browser block/unsupported browser page (e.g. HTML response)
            is_html_block = False
            if "content-type" in e.response.headers:
                ct = e.response.headers["content-type"].lower()
                if "text/html" in ct or "application/xhtml+xml" in ct:
                    is_html_block = True
            elif response_text.strip().startswith("<!doctype html") or "<html" in response_text.lower():
                is_html_block = True

            if is_html_block or "Unsupported Browser" in response_text or status_code == 403:
                logger.warning(
                    "Detected browser block/challenge page for image download. Attempting browser simulation fallback..."
                )
                fallback_bytes = await self._download_via_playwright(url)
                if fallback_bytes is not None:
                    return fallback_bytes
            return None
        except (
            httpx.ConnectError,
            httpx.ConnectTimeout,
            httpx.ReadTimeout,
            httpx.WriteTimeout,
            httpx.NetworkError,
            httpx.RemoteProtocolError,
        ) as e:
            # Retry on transient network failures before falling back to Playwright
            if _retries > 0:
                wait = 3 * (3 - _retries)  # 3s, 6s backoff
                logger.warning(
                    f"Network error downloading image {url}: {e}. Retrying in {wait}s ({_retries} retries left)..."
                )
                await asyncio.sleep(wait)
                return await self.download_image_bytes(url, _retries=_retries - 1)
            logger.warning(f"Network error downloading image {url}: {e}. Attempting browser simulation fallback...")
            fallback_bytes = await self._download_via_playwright(url)
            if fallback_bytes is not None:
                return fallback_bytes
            logger.error(f"Browser simulation fallback also failed for downloading image {url}.")
            return None
        except Exception as e:
            # Catch-all: also retry for unexpected transient errors (e.g. RemoteProtocolError variants)
            if _retries > 0:
                wait = 3 * (3 - _retries)
                logger.warning(
                    f"Unexpected error downloading image {url}: {e}. Retrying in {wait}s ({_retries} retries left)..."
                )
                await asyncio.sleep(wait)
                return await self.download_image_bytes(url, _retries=_retries - 1)
            logger.error(f"Error downloading image bytes from {url}: {e}")
            return None

    async def get_manga_covers(self, mangadex_id: str) -> List[Dict[str, Any]]:
        """
        Fetch all covers for a manga by MangaDex ID.
        """
        covers = []
        offset = 0
        limit = 100
        while True:
            params = {"manga[]": [mangadex_id], "limit": limit, "offset": offset, "order[volume]": "asc"}
            data = await self._request("/cover", params)
            if not data or "data" not in data:
                break

            for item in data["data"]:
                attr = item["attributes"]
                covers.append(
                    {
                        "mangadex_cover_id": item["id"],
                        "file_name": attr.get("fileName"),
                        "volume": attr.get("volume"),
                        "description": attr.get("description"),
                        "locale": attr.get("locale"),
                        "version": attr.get("version"),
                        "created_at": attr.get("createdAt"),
                        "updated_at": attr.get("updatedAt"),
                    }
                )

            if offset + limit >= data.get("total", 0):
                break
            offset += limit

        return covers

    async def get_manga_recommendations(self, mangadex_id: str) -> List[Dict[str, Any]]:
        """
        Fetch recommended manga for a manga by MangaDex ID.
        """
        params = {
            "includes[]": ["manga"],
        }
        params["contentRating[]"] = self.CONTENT_RATINGS

        data = await self._request(f"/manga/{mangadex_id}/recommendation", params)
        if not data or "data" not in data:
            return []

        recommendations = []
        for item in data["data"]:
            score = item.get("attributes", {}).get("score", 0)

            manga_rel = None
            for rel in item.get("relationships", []):
                if rel["type"] == "manga" and rel["id"] != mangadex_id:
                    manga_rel = rel
                    break

            if not manga_rel:
                continue

            m_id = manga_rel["id"]
            m_attr = manga_rel.get("attributes", {})
            if not m_attr:
                continue

            title = (
                m_attr.get("title", {}).get("en") or list(m_attr.get("title", {}).values())[0]
                if m_attr.get("title")
                else "No Title"
            )

            recommendations.append(
                {
                    "mangadex_id": m_id,
                    "score": score,
                    "title": title,
                    "author": "Unknown",
                    "artist": "Unknown",
                    "cover_url": None,
                    "status": m_attr.get("status"),
                    "year": str(m_attr.get("year")) if m_attr.get("year") else "N/A",
                }
            )

        # Batch fetch cover arts to populate cover_url for all recommendations in one call
        m_ids = [r["mangadex_id"] for r in recommendations]
        covers_by_manga = {}
        if m_ids:
            try:
                # Retrieve manga details in batch (limit 100) and expand cover_art
                manga_data = await self._request("/manga", {"ids[]": m_ids, "includes[]": ["cover_art"], "limit": 100})
                if manga_data and "data" in manga_data:
                    for m_item in manga_data["data"]:
                        m_item_id = m_item["id"]
                        cover_file = None
                        for rel in m_item.get("relationships", []):
                            if rel["type"] == "cover_art" and "attributes" in rel:
                                cover_file = rel["attributes"]["fileName"]
                                break
                        if cover_file:
                            covers_by_manga[m_item_id] = cover_file
            except Exception as e:
                logger.error(f"Failed to batch fetch cover arts for recommendations: {e}")

        # Update cover URLs with the 256px resolution thumbnail
        for r in recommendations:
            cov_file = covers_by_manga.get(r["mangadex_id"])
            if cov_file:
                r["cover_url"] = f"https://uploads.mangadex.org/covers/{r['mangadex_id']}/{cov_file}.256.jpg"

        return recommendations[:20]

    async def get_manga_basic_info(self, mangadex_id: str) -> Optional[Dict[str, Any]]:
        """
        Lightweight metadata fetch - title, cover, status, year, author, artist.
        """
        params = {"includes[]": ["author", "artist", "cover_art"]}
        data = await self._request(f"/manga/{mangadex_id}", params)
        if not data or "data" not in data:
            return None

        item = data["data"]
        attr = item["attributes"]
        m_id = item["id"]

        title = attr["title"].get("en") or list(attr["title"].values())[0] if attr["title"] else "No Title"
        authors = [
            rel["attributes"]["name"]
            for rel in item.get("relationships", [])
            if rel["type"] == "author" and "attributes" in rel
        ]
        artists = [
            rel["attributes"]["name"]
            for rel in item.get("relationships", [])
            if rel["type"] == "artist" and "attributes" in rel
        ]

        cover_file = None
        for rel in item.get("relationships", []):
            if rel["type"] == "cover_art" and "attributes" in rel:
                cover_file = rel["attributes"]["fileName"]
                break

        cover_url = f"https://uploads.mangadex.org/covers/{m_id}/{cover_file}" if cover_file else None

        return {
            "mangadex_id": m_id,
            "title": title,
            "author": ", ".join(authors) if authors else "Unknown",
            "artist": ", ".join(artists) if artists else "Unknown",
            "cover_url": cover_url,
            "status": attr.get("status"),
            "year": str(attr.get("year")) if attr.get("year") else "N/A",
            "description": attr.get("description", {}).get("en") or attr.get("description", {}).get("vi") or "",
        }


mangadex_service = MangaDexService()
