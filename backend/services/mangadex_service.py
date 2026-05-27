import httpx
import logging
import random
import os
import asyncio
from typing import List, Dict, Any, Optional
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
        "Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0"
    ]
    
    CONTENT_RATINGS = ["safe", "suggestive", "erotica", "pornographic"]

    def _get_headers(self) -> Dict[str, str]:
        ua = random.choice(self.USER_AGENTS)
        return {
            "User-Agent": ua,
            "Referer": "https://mangadex.org/",
            "Origin": "https://mangadex.org",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive"
        }

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
                    import asyncio
                    await asyncio.sleep(retry_after)
                    return await self._request(endpoint, params)
                
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP Error calling MangaDex ({endpoint}): {e.response.status_code} - {e.response.text}")
                return None
            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.NetworkError) as e:
                logger.warning(f"Network error calling MangaDex ({endpoint}): {e}. Attempting browser simulation fallback...")
                fallback_data = await self._request_via_playwright(endpoint, params)
                if fallback_data is not None:
                    return fallback_data
                logger.error(f"Browser simulation fallback also failed for MangaDex ({endpoint}).")
                return None
            except Exception as e:
                logger.error(f"Error calling MangaDex ({endpoint}): {e}")
                return None

    def _request_via_playwright_sync(self, url: str, proxy_url: Optional[str]) -> Optional[Dict[str, Any]]:
        from playwright.sync_api import sync_playwright
        import json
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
                    }
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

    async def _request_via_playwright(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            logger.warning("Playwright is not installed. Skipping browser-simulation fallback.")
            return None

        import urllib.parse
        import asyncio
        url = f"{self.BASE_URL}{endpoint}"
        if params:
            url += "?" + urllib.parse.urlencode(params, doseq=True)

        from backend.config import settings
        proxy_url = settings.mangadex_proxy or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
        if proxy_url:
            if not (proxy_url.startswith("http://") or proxy_url.startswith("https://") or proxy_url.startswith("socks5://") or proxy_url.startswith("socks4://")):
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
                    }
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
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            logger.warning("Playwright is not installed. Skipping browser-simulation download fallback.")
            return None

        import asyncio
        from backend.config import settings
        proxy_url = settings.mangadex_proxy or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
        if proxy_url:
            if not (proxy_url.startswith("http://") or proxy_url.startswith("https://") or proxy_url.startswith("socks5://") or proxy_url.startswith("socks4://")):
                proxy_url = f"http://{proxy_url}"

        logger.info(f"Attempting browser simulation image download via Playwright (Sync in Thread) for: {url}")
        try:
            return await asyncio.to_thread(self._download_via_playwright_sync, url, proxy_url)
        except Exception as e:
            logger.error(f"Failed running playwright sync download in thread: {e}")
            return None

    def parse_mangadex_links(self, links_dict: Optional[Dict[str, str]], mangadex_id: str) -> List[Dict[str, str]]:
        resolved = []
        resolved.append({
            "title": "MangaDex",
            "url": f"https://mangadex.org/title/{mangadex_id}"
        })
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
                resolved.append({
                    "title": title,
                    "url": url
                })
        return resolved

    async def search_manga(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search for manga on MangaDex. Returns metadata, alt titles, author, artist, and cover url.
        """
        import re
        import uuid
        
        uuid_pattern = r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
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

            authors = [rel["attributes"]["name"] for rel in item["relationships"] if rel["type"] == "author" and "attributes" in rel]
            artists = [rel["attributes"]["name"] for rel in item["relationships"] if rel["type"] == "artist" and "attributes" in rel]
            
            cover_file = None
            for rel in item["relationships"]:
                if rel["type"] == "cover_art" and "attributes" in rel:
                    cover_file = rel["attributes"]["fileName"]
                    break
            
            cover_url = f"https://uploads.mangadex.org/covers/{m_id}/{cover_file}" if cover_file else None

            manga_list.append({
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
                "links": self.parse_mangadex_links(attr.get("links", {}), m_id)
            })

        return manga_list

    async def get_manga_details(self, mangadex_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch details for a single manga by MangaDex ID.
        """
        params = {
            "includes[]": ["author", "artist", "cover_art"]
        }
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

        authors = [rel["attributes"]["name"] for rel in item["relationships"] if rel["type"] == "author" and "attributes" in rel]
        artists = [rel["attributes"]["name"] for rel in item["relationships"] if rel["type"] == "artist" and "attributes" in rel]
        
        authors_meta = []
        artists_meta = []
        for rel in item["relationships"]:
            if rel["type"] == "author":
                authors_meta.append({
                    "id": rel["id"],
                    "name": rel.get("attributes", {}).get("name") or "Unknown"
                })
            elif rel["type"] == "artist":
                artists_meta.append({
                    "id": rel["id"],
                    "name": rel.get("attributes", {}).get("name") or "Unknown"
                })

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
            tags.append({
                "mangadex_id": t.get("id"),
                "name": t_attr.get("name", {}),
                "group": t_attr.get("group"),
                "description": t_attr.get("description")
            })

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
            "links": self.parse_mangadex_links(attr.get("links", {}), m_id)
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
            "website": attr.get("website")
        }

    async def get_creator_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Search for a creator by name on MangaDex and return their details.
        """
        params = {
            "name": name,
            "limit": 10
        }
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
            "website": attr.get("website")
        }


    async def get_manga_chapters(self, mangadex_id: str, lang: str = "en") -> List[Dict[str, Any]]:
        """
        Get all chapters of a manga translated into the specified language, sorted by chapter number.
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
                "includes[]": ["scanlation_group"]
            }
            
            data = await self._request(f"/manga/{mangadex_id}/feed", params)
            if not data or "data" not in data:
                break
            
            for chap in data["data"]:
                attr = chap["attributes"]
                # Skip external links
                if attr.get("externalUrl") is not None:
                    continue

                group_ids = []
                group_names = []
                for rel in chap.get("relationships", []):
                    if rel.get("type") == "scanlation_group":
                        group_ids.append(rel.get("id"))
                        name = rel.get("attributes", {}).get("name")
                        if name:
                            group_names.append(name)
                
                group_id = ",".join(group_ids) if group_ids else "no-group"
                group_name = " & ".join(group_names) if group_names else "No Group"

                all_chapters.append({
                    "id": chap["id"],
                    "chapter": attr.get("chapter") or "Oneshot",
                    "title": attr.get("title") or "",
                    "volume": attr.get("volume"),
                    "group_id": group_id,
                    "group_name": group_name
                })
            
            if offset + limit >= data.get("total", 0):
                break
            offset += limit
            
        # De-duplicate by (chapter, group_id)
        unique_chapters = {}
        for c in all_chapters:
            key = (c["chapter"], c["group_id"])
            if key not in unique_chapters:
                unique_chapters[key] = c
                
        result = list(unique_chapters.values())
        
        # Sort key helper
        def get_chap_num(x):
            try:
                return float(x["chapter"])
            except ValueError:
                return 999999.0

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
                "includeFutureUpdates": 0
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

    async def download_image_bytes(self, url: str) -> Optional[bytes]:
        """
        Downloads image bytes for local saving or uploading to MinIO.
        """
        # Enforce rate limits
        await mangadex_rate_limiter.acquire()
        
        from backend.config import settings
        proxies = settings.mangadex_proxy if settings.mangadex_proxy else None
        headers = self._get_headers()
        
        async with httpx.AsyncClient(proxy=proxies, timeout=30.0) as client:
            try:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                return resp.content
            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.NetworkError) as e:
                logger.warning(f"Network error downloading image {url}: {e}. Attempting browser simulation fallback...")
                fallback_bytes = await self._download_via_playwright(url)
                if fallback_bytes is not None:
                    return fallback_bytes
                logger.error(f"Browser simulation fallback also failed for downloading image {url}.")
                return None
            except Exception as e:
                logger.error(f"Error downloading image bytes from {url}: {e}")
                return None

mangadex_service = MangaDexService()
