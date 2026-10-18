import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from lxml import html

from backend.models.external_review import MALAuthorEntry, MALExtendedMetadata
from backend.utils.rate_limiter import jikan_rate_limiter

logger = logging.getLogger(__name__)

MAL_BASE_URL = "https://myanimelist.net"
MONTH_MAP = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

COMMON_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def extract_mal_id(url_or_id: Optional[str]) -> Optional[str]:
    """
    Extract numeric MAL manga ID from ID string or various URL structures.
    Examples:
        '130997' -> '130997'
        'https://myanimelist.net/manga/130997/Youkaku_no_Majoromi' -> '130997'
        'myanimelist.net/manga/130997' -> '130997'
    """
    if not url_or_id:
        return None
    val = str(url_or_id).strip()
    if not val:
        return None

    # Check for direct numeric string
    if val.isdigit():
        return val

    # Match /manga/<id>
    match = re.search(r"myanimelist\.net/manga/(\d+)", val, re.IGNORECASE)
    if match:
        return match.group(1)

    # General fallback for /manga/(\d+)
    match = re.search(r"/manga/(\d+)", val, re.IGNORECASE)
    if match:
        return match.group(1)

    return None


def parse_date_str(date_str: str) -> Optional[str]:
    """Parse 'Sep 25, 2017' into '2017-09-25'."""
    if not date_str:
        return None
    match = re.search(r"([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})", date_str.strip())
    if match:
        mon_str, day_str, yr_str = match.groups()
        mon = MONTH_MAP.get(mon_str.lower())
        if mon:
            return f"{int(yr_str):04d}-{mon:02d}-{int(day_str):02d}"
    # Match Year only
    match_yr = re.search(r"\b(\d{4})\b", date_str.strip())
    if match_yr:
        return match_yr.group(1)
    return None


def parse_mal_datetime_utc(date_str: str) -> Optional[datetime]:
    """Parse date like 'Feb 4, 2024' or 'Feb 2, 2026' into timezone-aware datetime."""
    if not date_str:
        return None
    cleaned = date_str.strip()
    match = re.search(r"([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})", cleaned)
    if match:
        mon_str, day_str, yr_str = match.groups()
        mon = MONTH_MAP.get(mon_str.lower())
        if mon:
            try:
                return datetime(int(yr_str), mon, int(day_str), tzinfo=timezone.utc)
            except ValueError:
                pass
    return None


def parse_mal_manga_info_html(html_text: str, mal_id: str) -> MALExtendedMetadata:
    """Parse manga info from MyAnimeList HTML page (leftside column)."""
    tree = html.fromstring(html_text)
    leftside = tree.xpath("//div[contains(@class, 'leftside')]")
    container = leftside[0] if leftside else tree

    data: Dict[str, Any] = {
        "mal_id": int(mal_id),
        "canonical_url": f"https://myanimelist.net/manga/{mal_id}",
        "synonyms": [],
        "genres": [],
        "themes": [],
        "demographics": [],
        "serialization": [],
        "authors": [],
    }

    # Find all spaceit_pad blocks
    blocks = container.xpath(".//div[contains(@class, 'spaceit_pad')]")
    for block in blocks:
        dark_nodes = block.xpath(".//span[contains(@class, 'dark_text')]")
        if not dark_nodes:
            continue
        label_raw = dark_nodes[0].text_content().strip()
        label = label_raw.rstrip(":").strip()

        # Extract remaining text in block
        # Cloned block without dark_text
        block_text = block.text_content().replace(label_raw, "", 1).strip()

        if label == "Japanese":
            data["japanese_title"] = block_text or None
        elif label == "English":
            data["english_title"] = block_text or None
        elif label == "Synonyms":
            syns = [s.strip() for s in block_text.split(",") if s.strip()]
            data["synonyms"].extend(syns)
        elif label == "Type":
            data["media_type"] = block_text or None
        elif label == "Volumes":
            val_str = block_text.replace(",", "").strip()
            data["volumes"] = int(val_str) if val_str.isdigit() else None
        elif label == "Chapters":
            val_str = block_text.replace(",", "").strip()
            data["chapters"] = int(val_str) if val_str.isdigit() else None
        elif label == "Status":
            data["status"] = block_text or None
        elif label == "Published":
            data["published_string"] = block_text or None
            if "to" in block_text:
                parts = block_text.split("to", 1)
                data["published_start_date"] = parse_date_str(parts[0])
                data["published_end_date"] = parse_date_str(parts[1])
            else:
                data["published_start_date"] = parse_date_str(block_text)
        elif label in ("Genres", "Genre"):
            a_tags = block.xpath(".//a")
            genres = [a.text_content().strip() for a in a_tags if a.text_content().strip()]
            data["genres"].extend(genres)
        elif label in ("Themes", "Theme"):
            a_tags = block.xpath(".//a")
            themes = [a.text_content().strip() for a in a_tags if a.text_content().strip()]
            data["themes"].extend(themes)
        elif label in ("Demographic", "Demographics"):
            a_tags = block.xpath(".//a")
            demos = [a.text_content().strip() for a in a_tags if a.text_content().strip()]
            data["demographics"].extend(demos)
        elif label == "Serialization":
            a_tags = block.xpath(".//a")
            magazines = [a.text_content().strip() for a in a_tags if a.text_content().strip()]
            data["serialization"].extend(magazines)
        elif label in ("Authors", "Author"):
            # Authors often appear as <a href="/people/...">Abe, Youichi</a> (Story & Art)
            author_links = block.xpath(".//a[contains(@href, '/people/')]")
            if author_links:
                for a_tag in author_links:
                    name = a_tag.text_content().strip()
                    href = a_tag.get("href", "")
                    a_id = None
                    id_match = re.search(r"/people/(\d+)", href)
                    if id_match:
                        a_id = int(id_match.group(1))

                    # Look for tail or sibling text containing (Role)
                    tail_text = a_tag.tail or ""
                    role = "Story & Art"
                    role_match = re.search(r"\(([^)]+)\)", tail_text)
                    if role_match:
                        role = role_match.group(1).strip()

                    author_url = f"https://myanimelist.net{href}" if href.startswith("/") else href
                    data["authors"].append(
                        MALAuthorEntry(
                            mal_id=a_id,
                            name=name,
                            role=role,
                            url=author_url or None,
                        )
                    )
            elif block_text:
                # Text fallback without links
                data["authors"].append(MALAuthorEntry(name=block_text, role="Story & Art"))
        elif label == "Score":
            # Can be inside <span class="score-label">7.35</span>
            score_match = re.search(r"(\d+\.\d+|\d+)", block_text)
            if score_match:
                try:
                    data["score"] = float(score_match.group(1))
                except ValueError:
                    pass
        elif label == "Ranked":
            rank_match = re.search(r"#?(\d+)", block_text.replace(",", ""))
            if rank_match:
                data["rank"] = int(rank_match.group(1))
        elif label == "Popularity":
            pop_match = re.search(r"#?(\d+)", block_text.replace(",", ""))
            if pop_match:
                data["popularity"] = int(pop_match.group(1))
        elif label == "Members":
            mem_match = re.search(r"(\d+)", block_text.replace(",", ""))
            if mem_match:
                data["members"] = int(mem_match.group(1))
        elif label == "Favorites":
            fav_match = re.search(r"(\d+)", block_text.replace(",", ""))
            if fav_match:
                data["favorites"] = int(fav_match.group(1))

    return MALExtendedMetadata.model_validate(data)


def clean_review_text(element) -> Tuple[str, int, int]:
    """Extract and sanitize text from div.text in review-element."""
    # Convert <br> tags to newline
    for br in element.xpath(".//br"):
        br.tail = "\n" + (br.tail or "")

    # Remove unwanted UI buttons/text (e.g., .open, helpful counters, rating labels)
    for bad_node in element.xpath(".//div[contains(@class, 'open')] | .//a[contains(@class, 'js-toggle')]"):
        bad_node.drop_tree()

    raw_text = element.text_content()
    # Normalize whitespaces while preserving paragraph breaks
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in raw_text.splitlines()]
    # Remove empty lines excess
    filtered_lines = []
    prev_empty = False
    for line in lines:
        if line:
            filtered_lines.append(line)
            prev_empty = False
        elif not prev_empty:
            filtered_lines.append("")
            prev_empty = True

    cleaned = "\n".join(filtered_lines).strip()
    words = len(cleaned.split())
    chars = len(cleaned)
    return cleaned, words, chars


def parse_mal_reviews_page_html(
    html_text: str,
    mal_id: str,
) -> Tuple[List[Dict[str, Any]], Optional[int], bool]:
    """
    Parse a reviews page of MyAnimeList.
    Returns:
        (parsed_reviews_list, total_filtered_results, has_next_page)
    """
    tree = html.fromstring(html_text)

    # 1. Check for "Filtered Results: X / Y"
    total_filtered_results: Optional[int] = None
    filter_box = tree.xpath(
        "//div[contains(@class, 'review-filter-box')] | //span[contains(text(), 'Filtered Results:')]"
    )
    if filter_box:
        box_text = filter_box[0].text_content()
        match = re.search(r"Filtered Results:\s*(\d+)\s*/\s*(\d+)", box_text)
        if match:
            total_filtered_results = int(match.group(2))

    review_elements = tree.xpath("//div[contains(@class, 'review-element')]")
    results: List[Dict[str, Any]] = []

    for el in review_elements:
        # Extract review ID
        source_review_id = None
        open_link = el.xpath(".//div[contains(@class, 'open')]/a/@href")
        if open_link:
            id_match = re.search(r"id=(\d+)", open_link[0])
            if id_match:
                source_review_id = id_match.group(1)

        # Fallback review ID from review-element id if present
        if not source_review_id:
            el_id = el.get("id", "")
            id_match = re.search(r"(\d+)", el_id)
            if id_match:
                source_review_id = id_match.group(1)

        if not source_review_id:
            # Skip unidentifiable review block
            continue

        # Reviewer profile and username
        user_nodes = el.xpath(".//div[contains(@class, 'username')]//a")
        reviewer_name = user_nodes[0].text_content().strip() if user_nodes else "Unknown"
        reviewer_profile = user_nodes[0].get("href", "") if user_nodes else ""
        if reviewer_profile and reviewer_profile.startswith("/"):
            reviewer_profile = f"https://myanimelist.net{reviewer_profile}"

        # Reviewer avatar
        thumb_img = el.xpath(".//div[contains(@class, 'thumb')]//img")
        reviewer_avatar = None
        if thumb_img:
            reviewer_avatar = thumb_img[0].get("data-src") or thumb_img[0].get("src")

        # Posted at date
        update_at_nodes = el.xpath(".//div[contains(@class, 'update_at')]")
        posted_at_raw = update_at_nodes[0].text_content().strip() if update_at_nodes else None
        posted_at = parse_mal_datetime_utc(posted_at_raw) if posted_at_raw else None

        # Tags: recommendation status, preliminary, spoiler
        tags_container = el.xpath(".//div[contains(@class, 'tags')]")
        rec_status = "unknown"
        is_preliminary = False
        chapters_progress = None
        is_spoiler = False

        if tags_container:
            tag_box = tags_container[0]
            not_rec = tag_box.xpath(".//*[contains(@class, 'not-recommended') or contains(text(), 'Not Recommended')]")
            mixed = tag_box.xpath(".//*[contains(@class, 'mixed-feelings') or contains(text(), 'Mixed Feelings')]")
            recommended = tag_box.xpath(".//*[contains(@class, 'recommended') or contains(text(), 'Recommended')]")

            if not_rec:
                rec_status = "not_recommended"
            elif mixed:
                rec_status = "mixed_feelings"
            elif recommended:
                rec_status = "recommended"

            prelim = tag_box.xpath(".//*[contains(@class, 'preliminary') or contains(text(), 'Preliminary')]")
            if prelim:
                is_preliminary = True
                prog_span = prelim[0].xpath(".//span")
                if prog_span:
                    chp_text = prog_span[0].text_content().strip()
                    # Strip parentheses
                    chapters_progress = re.sub(r"[()]", "", chp_text).strip()
                else:
                    match_prog = re.search(r"\(([^)]+)\)", prelim[0].text_content())
                    if match_prog:
                        chapters_progress = match_prog.group(1).strip()

            spoiler = tag_box.xpath(".//*[contains(@class, 'spoiler') or contains(text(), 'Spoiler')]")
            if spoiler:
                is_spoiler = True

        # Overall rating
        rating_node = el.xpath(".//div[contains(@class, 'rating')]//span[contains(@class, 'num')]")
        overall_rating = None
        if rating_node:
            r_text = rating_node[0].text_content().strip()
            if r_text.isdigit():
                overall_rating = int(r_text)

        # Reactions JSON from data-reactions attribute
        reactions_raw = el.get("data-reactions")
        reactions_data = {
            "total": 0,
            "nice": 0,
            "love_it": 0,
            "funny": 0,
            "confusing": 0,
            "informative": 0,
            "well_written": 0,
            "creative": 0,
        }
        if reactions_raw:
            try:
                rx_json = json.loads(reactions_raw)
                counts = rx_json.get("count", [])
                keys = ["nice", "love_it", "funny", "confusing", "informative", "well_written", "creative"]
                for i, k in enumerate(keys):
                    if i < len(counts):
                        try:
                            reactions_data[k] = int(counts[i])
                        except (ValueError, TypeError):
                            pass
                total_rx = rx_json.get("num")
                if total_rx is not None:
                    reactions_data["total"] = int(total_rx)
                else:
                    reactions_data["total"] = sum(reactions_data[k] for k in keys)
            except Exception as e:
                logger.debug(f"Failed to parse data-reactions attribute: {e}")

        # Text content
        text_node = el.xpath(".//div[contains(@class, 'text')]")
        if text_node:
            content_text, words, chars = clean_review_text(text_node[0])
        else:
            content_text, words, chars = "", 0, 0

        source_url = f"https://myanimelist.net/reviews.php?id={source_review_id}"

        results.append(
            {
                "source_review_id": source_review_id,
                "source_work_id": str(mal_id),
                "source_url": source_url,
                "reviewer_name": reviewer_name,
                "reviewer_profile_url": reviewer_profile or None,
                "reviewer_avatar_url": reviewer_avatar or None,
                "overall_rating": overall_rating,
                "recommendation_status": rec_status,
                "is_preliminary": is_preliminary,
                "chapters_progress": chapters_progress,
                "is_spoiler": is_spoiler,
                "content_text": content_text,
                "word_count": words,
                "character_count": chars,
                "reactions": reactions_data,
                "posted_at": posted_at,
                "posted_at_raw": posted_at_raw,
            }
        )

    # Check for next page
    next_btn = tree.xpath(
        "//a[@data-ga-click-type='review-more-reviews'] | "
        "//div[contains(@class, 'pagination')]//a[contains(text(), 'Next') or contains(text(), 'More')]"
    )
    has_next_page = bool(next_btn)

    return results, total_filtered_results, has_next_page


def apply_extended_mal_metadata_to_manga(
    manga: dict,
    mal_meta: MALExtendedMetadata,
    apply_empty_fields: bool = True,
) -> Dict[str, Any]:
    """
    Construct the MongoDB update payload for a manga document from MALExtendedMetadata.
    Respects manga.metadata_locks to avoid overwriting user-curated fields.
    """
    update_doc: Dict[str, Any] = {
        "tracker_metadata.mal_extended": mal_meta.model_dump(mode="json"),
    }

    # Also update basic tracker_metadata.mal
    update_doc["tracker_metadata.mal"] = {
        "id": str(mal_meta.mal_id),
        "score": mal_meta.score,
        "status": mal_meta.status,
        "volumes": mal_meta.volumes,
        "chapters": mal_meta.chapters,
        "site_url": mal_meta.canonical_url,
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
    }

    locks = manga.get("metadata_locks") or {}

    if apply_empty_fields:
        # Check volumes
        if not manga.get("volumes") and mal_meta.volumes and not locks.get("volumes"):
            update_doc["volumes"] = mal_meta.volumes

        # Check chapters
        if not manga.get("chapters") and mal_meta.chapters and not locks.get("chapters"):
            update_doc["chapters"] = mal_meta.chapters

        # Check dates
        if (
            not manga.get("published_start_date")
            and mal_meta.published_start_date
            and not locks.get("published_start_date")
        ):
            update_doc["published_start_date"] = mal_meta.published_start_date
        if not manga.get("published_end_date") and mal_meta.published_end_date and not locks.get("published_end_date"):
            update_doc["published_end_date"] = mal_meta.published_end_date

        # Check alt titles
        existing_alts = list(manga.get("alt_titles") or [])
        modified_alts = False
        if mal_meta.japanese_title and not locks.get("alt_titles"):
            ja_entry = f"ja|{mal_meta.japanese_title}"
            if not any(mal_meta.japanese_title in a for a in existing_alts):
                existing_alts.append(ja_entry)
                modified_alts = True

        if mal_meta.english_title and not locks.get("alt_titles"):
            en_entry = f"en|{mal_meta.english_title}"
            if not any(mal_meta.english_title in a for a in existing_alts):
                existing_alts.append(en_entry)
                modified_alts = True

        if modified_alts:
            update_doc["alt_titles"] = existing_alts

        # Check manga links
        existing_links = list(manga.get("links") or [])
        has_mal_link = any(
            (isinstance(item, dict) and item.get("title", "").lower() in ("mal", "myanimelist"))
            or (hasattr(item, "title") and str(item.title).lower() in ("mal", "myanimelist"))
            for item in existing_links
        )
        if not has_mal_link:
            existing_links.append(
                {
                    "title": "mal",
                    "url": mal_meta.canonical_url,
                }
            )
            update_doc["links"] = existing_links

    return update_doc


async def fetch_mal_manga_page_html(mal_id: str) -> Optional[str]:
    """Fetch raw HTML of a manga's detail page from MyAnimeList."""
    url = f"{MAL_BASE_URL}/manga/{mal_id}"
    try:
        await jikan_rate_limiter.acquire()
        async with httpx.AsyncClient(timeout=15.0, headers=COMMON_HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.text
            logger.warning(f"Failed to fetch MAL manga page for {mal_id}: HTTP {resp.status_code}")
    except Exception as e:
        logger.error(f"Error fetching MAL manga page for {mal_id}: {e}")
    return None


async def fetch_mal_reviews_page_html(
    mal_id: str,
    page: int = 1,
    include_spoilers: bool = True,
    include_preliminary: bool = True,
) -> Optional[str]:
    """
    Fetch a page of reviews from MyAnimeList with cookies & parameters for full coverage.
    """
    params = {
        "sort": "newest",
        "filter_check": "",
        "filter_hide": "",
        "p": str(page),
    }
    if include_preliminary:
        params["preliminary"] = "on"
    if include_spoilers:
        params["spoiler"] = "on"

    cookies = {
        "reviews_inc_preliminary": "1" if include_preliminary else "0",
        "reviews_sort": "recent",
    }

    url = f"{MAL_BASE_URL}/manga/{mal_id}/reviews"
    try:
        await jikan_rate_limiter.acquire()
        async with httpx.AsyncClient(
            timeout=20.0,
            headers=COMMON_HEADERS,
            cookies=cookies,
            params=params,
            follow_redirects=True,
        ) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.text
            logger.warning(f"Failed to fetch MAL reviews page {page} for {mal_id}: HTTP {resp.status_code}")
    except Exception as e:
        logger.error(f"Error fetching MAL reviews page {page} for {mal_id}: {e}")
    return None
