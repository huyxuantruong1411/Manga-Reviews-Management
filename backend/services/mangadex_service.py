import httpx
import logging
from typing import List, Dict, Any, Optional
from backend.utils.rate_limiter import mangadex_rate_limiter

logger = logging.getLogger(__name__)

class MangaDexService:
    BASE_URL = "https://api.mangadex.org"
    
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://mangadex.org/",
        "Origin": "https://mangadex.org",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive"
    }
    
    CONTENT_RATINGS = ["safe", "suggestive", "erotica", "pornographic"]

    async def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        # Enforce Rate Limiter
        await mangadex_rate_limiter.acquire()
        
        url = f"{self.BASE_URL}{endpoint}"
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                resp = await client.get(url, params=params, headers=self.HEADERS)
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
            except Exception as e:
                logger.error(f"Error calling MangaDex ({endpoint}): {e}")
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
                "contentRating[]": self.CONTENT_RATINGS
            }
            
            data = await self._request(f"/manga/{mangadex_id}/feed", params)
            if not data or "data" not in data:
                break
            
            for chap in data["data"]:
                attr = chap["attributes"]
                # Skip external links
                if attr.get("externalUrl") is not None:
                    continue

                all_chapters.append({
                    "id": chap["id"],
                    "chapter": attr.get("chapter") or "Oneshot",
                    "title": attr.get("title") or "",
                    "volume": attr.get("volume")
                })
            
            if offset + limit >= data.get("total", 0):
                break
            offset += limit
            
        # De-duplicate by chapter number
        unique_chapters = {}
        for c in all_chapters:
            chap_num = c["chapter"]
            if chap_num not in unique_chapters:
                unique_chapters[chap_num] = c
                
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
        params = {
            "manga": mangadex_id,
            "limit": 100,
            "contentRating[]": self.CONTENT_RATINGS
        }
        data = await self._request("/chapter", params)
        langs = set()
        if data and "data" in data:
            for c in data["data"]:
                lang = c["attributes"].get("translatedLanguage")
                if lang:
                    langs.add(lang)
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
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(url, headers=self.HEADERS)
                resp.raise_for_status()
                return resp.content
            except Exception as e:
                logger.error(f"Error downloading image bytes from {url}: {e}")
                return None

mangadex_service = MangaDexService()
