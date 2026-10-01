import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx

from backend.utils.rate_limiter import anilist_rate_limiter, jikan_rate_limiter

logger = logging.getLogger(__name__)

ANILIST_GRAPHQL_URL = "https://graphql.anilist.co"
JIKAN_API_URL = "https://api.jikan.moe/v4/manga"

ANILIST_QUERY = """
query ($id: Int) {
  Media (id: $id, type: MANGA) {
    id
    title {
      romaji
      english
      native
      userPreferred
    }
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    status
    chapters
    volumes
    countryOfOrigin
    isLicensed
    source
    format
    genres
    synonyms
    averageScore
    meanScore
    popularity
    favourites
    siteUrl
  }
}
"""


def extract_tracker_ids(links: Any) -> Dict[str, str]:
    """
    Extract tracker IDs from MangaDex links (dict or list of link objects/dicts).
    """
    tracker_ids = {}
    if not links:
        return tracker_ids

    # If links is a list of dicts like [{"title": "AniList", "url": "https://anilist.co/manga/86810"}, ...]
    if isinstance(links, list):
        for link in links:
            if isinstance(link, dict):
                title = str(link.get("title", "")).lower()
                url = str(link.get("url", ""))
            elif hasattr(link, "title") and hasattr(link, "url"):
                title = str(link.title).lower()
                url = str(link.url)
            else:
                continue

            if "anilist" in title or "al" == title:
                match = re.search(r"/manga/(\d+)", url) or re.search(r"(\d+)", url)
                if match:
                    tracker_ids["anilist"] = match.group(1)
            elif "myanimelist" in title or "mal" == title:
                match = re.search(r"/manga/(\d+)", url) or re.search(r"(\d+)", url)
                if match:
                    tracker_ids["mal"] = match.group(1)
            elif "mangaupdates" in title or "mu" == title:
                match = re.search(r"id=(\d+)", url) or re.search(r"series/([^/]+)", url)
                if match:
                    tracker_ids["mu"] = match.group(1)
        return tracker_ids

    # If links is a dict like {"al": "86810", "mal": "87543", "mu": "12345"}
    if isinstance(links, dict):
        al_val = str(links.get("al", links.get("anilist", ""))).strip()
        if al_val:
            match = re.search(r"(\d+)", al_val)
            if match:
                tracker_ids["anilist"] = match.group(1)

        mal_val = str(links.get("mal", links.get("myanimelist", ""))).strip()
        if mal_val:
            match = re.search(r"(\d+)", mal_val)
            if match:
                tracker_ids["mal"] = match.group(1)

        mu_val = str(links.get("mu", links.get("mangaupdates", ""))).strip()
        if mu_val:
            tracker_ids["mu"] = mu_val

    return tracker_ids


def format_fuzzy_date(year: Optional[int], month: Optional[int], day: Optional[int]) -> Optional[str]:
    """Format year, month, day into YYYY-MM-DD, YYYY-MM, or YYYY string."""
    if not year:
        return None
    if month and day:
        return f"{year:04d}-{month:02d}-{day:02d}"
    if month:
        return f"{year:04d}-{month:02d}"
    return f"{year:04d}"


def parse_iso_date(date_str: Optional[str]) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    """Parse ISO date string like '2013-09-15T00:00:00+00:00' into (year, month, day)."""
    if not date_str:
        return None, None, None
    try:
        # Match YYYY-MM-DD
        match = re.match(r"^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?", date_str)
        if match:
            y = int(match.group(1))
            m = int(match.group(2)) if match.group(2) else None
            d = int(match.group(3)) if match.group(3) else None
            return y, m, d
    except Exception:
        pass
    return None, None, None


async def fetch_anilist_metadata(anilist_id: str) -> Optional[Dict[str, Any]]:
    """Fetch metadata from AniList GraphQL API."""
    try:
        await anilist_rate_limiter.acquire()
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                ANILIST_GRAPHQL_URL,
                json={"query": ANILIST_QUERY, "variables": {"id": int(anilist_id)}},
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
            if response.status_code == 200:
                data = response.json().get("data", {}).get("Media")
                if data:
                    start_d = data.get("startDate", {})
                    end_d = data.get("endDate", {})
                    return {
                        "id": data.get("id"),
                        "title": data.get("title"),
                        "start_date": format_fuzzy_date(start_d.get("year"), start_d.get("month"), start_d.get("day")),
                        "end_date": format_fuzzy_date(end_d.get("year"), end_d.get("month"), end_d.get("day")),
                        "status": data.get("status"),
                        "chapters": data.get("chapters"),
                        "volumes": data.get("volumes"),
                        "country_of_origin": data.get("countryOfOrigin"),
                        "is_licensed": data.get("isLicensed"),
                        "source": data.get("source"),
                        "format": data.get("format"),
                        "genres": data.get("genres"),
                        "synonyms": data.get("synonyms"),
                        "average_score": data.get("averageScore"),
                        "mean_score": data.get("meanScore"),
                        "popularity": data.get("popularity"),
                        "favourites": data.get("favourites"),
                        "site_url": data.get("siteUrl"),
                    }
            else:
                logger.warning(f"AniList API error HTTP {response.status_code} for ID {anilist_id}: {response.text}")
    except Exception as e:
        logger.error(f"Error fetching AniList metadata for ID {anilist_id}: {e}")
    return None


async def fetch_jikan_metadata(mal_id: str) -> Optional[Dict[str, Any]]:
    """Fetch metadata from Jikan (MyAnimeList) API v4."""
    try:
        await jikan_rate_limiter.acquire()
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{JIKAN_API_URL}/{mal_id}/full")
            if response.status_code == 200:
                data = response.json().get("data", {})
                if data:
                    published = data.get("published", {})
                    prop = published.get("prop", {})
                    from_prop = prop.get("from", {})
                    to_prop = prop.get("to", {})

                    start_date = format_fuzzy_date(from_prop.get("year"), from_prop.get("month"), from_prop.get("day"))
                    end_date = format_fuzzy_date(to_prop.get("year"), to_prop.get("month"), to_prop.get("day"))

                    # Fallback parse ISO if prop fields missing
                    if not start_date and published.get("from"):
                        y, m, d = parse_iso_date(published.get("from"))
                        start_date = format_fuzzy_date(y, m, d)
                    if not end_date and published.get("to"):
                        y, m, d = parse_iso_date(published.get("to"))
                        end_date = format_fuzzy_date(y, m, d)

                    score = data.get("score")
                    score_100 = round(score * 10) if score is not None else None

                    return {
                        "id": data.get("mal_id"),
                        "title": data.get("title"),
                        "title_english": data.get("title_english"),
                        "title_japanese": data.get("title_japanese"),
                        "start_date": start_date,
                        "end_date": end_date,
                        "status": data.get("status"),
                        "chapters": data.get("chapters"),
                        "volumes": data.get("volumes"),
                        "type": data.get("type"),
                        "score": score,
                        "score_100": score_100,
                        "scored_by": data.get("scored_by"),
                        "rank": data.get("rank"),
                        "popularity": data.get("popularity"),
                        "members": data.get("members"),
                        "favorites": data.get("favorites"),
                        "synopsis": data.get("synopsis"),
                        "genres": [g.get("name") for g in data.get("genres", []) if g.get("name")],
                        "authors": [a.get("name") for a in data.get("authors", []) if a.get("name")],
                        "serializations": [s.get("name") for s in data.get("serializations", []) if s.get("name")],
                        "site_url": data.get("url"),
                    }
            else:
                logger.warning(f"Jikan API error HTTP {response.status_code} for ID {mal_id}: {response.text}")
    except Exception as e:
        logger.error(f"Error fetching Jikan metadata for ID {mal_id}: {e}")
    return None


async def fetch_tracker_metadata(links: Dict[str, str]) -> Dict[str, Any]:
    """
    Fetch tracker metadata for AniList and MyAnimeList based on tracker IDs in links dict.
    Returns structured tracker metadata payload.
    """
    tracker_ids = extract_tracker_ids(links)
    result: Dict[str, Any] = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "anilist": None,
        "myanimelist": None,
        "combined": {},
    }

    anilist_data = None
    mal_data = None

    if "anilist" in tracker_ids:
        anilist_data = await fetch_anilist_metadata(tracker_ids["anilist"])
        result["anilist"] = anilist_data

    if "mal" in tracker_ids:
        mal_data = await fetch_jikan_metadata(tracker_ids["mal"])
        result["myanimelist"] = mal_data

    # Merge into combined section
    # AniList takes precedence for start_date, end_date, score
    start_date = None
    end_date = None
    average_score = None
    popularity = None
    source = None
    format_type = None

    if anilist_data:
        start_date = anilist_data.get("start_date")
        end_date = anilist_data.get("end_date")
        average_score = anilist_data.get("average_score")
        popularity = anilist_data.get("popularity")
        source = anilist_data.get("source")
        format_type = anilist_data.get("format")

    if mal_data:
        if not start_date:
            start_date = mal_data.get("start_date")
        if not end_date:
            end_date = mal_data.get("end_date")
        if average_score is None:
            average_score = mal_data.get("score_100")
        if popularity is None:
            popularity = mal_data.get("popularity")
        if not format_type:
            format_type = mal_data.get("type")

    result["combined"] = {
        "published_start_date": start_date,
        "published_end_date": end_date,
        "average_score": average_score,
        "popularity": popularity,
        "source": source,
        "format": format_type,
    }

    return result
