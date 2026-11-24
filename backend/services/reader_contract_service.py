"""
Builds the Manga Reader Data Contract v2 from Data Lake Pool documents.

Pure functions (no DB / MinIO access) so the transformation is deterministic and
fully unit-testable. `DatalakePoolService.export_etl_package_manifest` loads the
pool documents and delegates here.
"""

import copy
import re
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Optional, Tuple

from backend.models.reader_contract import (
    READER_CONTRACT_NAME,
    READER_CONTRACT_VERSION,
    ReaderChapter,
    ReaderCoverArt,
    ReaderCreator,
    ReaderLineage,
    ReaderLink,
    ReaderManga,
    ReaderMangaStats,
    ReaderMediaRef,
    ReaderPackage,
    ReaderPage,
    ReaderTag,
)

DEFAULT_BUCKET = "manga-library"
JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"
CONTRACT_SCHEMA_ID = f"urn:manga-datalake:contract:{READER_CONTRACT_NAME}:{READER_CONTRACT_VERSION}"

_STATUS_ALIASES: Dict[str, str] = {
    "ongoing": "ongoing",
    "publishing": "ongoing",
    "releasing": "ongoing",
    "serializing": "ongoing",
    "currently publishing": "ongoing",
    "in progress": "ongoing",
    "completed": "completed",
    "complete": "completed",
    "finished": "completed",
    "ended": "completed",
    "hiatus": "hiatus",
    "on hiatus": "hiatus",
    "paused": "hiatus",
    "on hold": "hiatus",
    "cancelled": "cancelled",
    "canceled": "cancelled",
    "discontinued": "cancelled",
    "dropped": "cancelled",
}
_CONTENT_RATING_ALIASES: Dict[str, str] = {
    "safe": "safe",
    "suggestive": "suggestive",
    "erotica": "erotica",
    "pornographic": "pornographic",
    "hentai": "pornographic",
}
_DEMOGRAPHIC_ALIASES: Dict[str, str] = {
    "shounen": "shounen",
    "shonen": "shounen",
    "shoujo": "shoujo",
    "shojo": "shoujo",
    "seinen": "seinen",
    "josei": "josei",
    "kodomo": "kodomo",
    "kodomomuke": "kodomo",
}
_TAG_GROUPS = {"genre", "theme", "format", "content"}


def _norm_key(value: Any) -> str:
    return re.sub(r"[\s_\-]+", " ", str(value)).strip().lower() if value is not None else ""


def normalize_status(value: Any) -> str:
    return _STATUS_ALIASES.get(_norm_key(value), "unknown")


def normalize_content_rating(value: Any) -> str:
    return _CONTENT_RATING_ALIASES.get(_norm_key(value), "unknown")


def normalize_demographic(value: Any) -> str:
    return _DEMOGRAPHIC_ALIASES.get(_norm_key(value), "unknown")


def _slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower().strip())
    return re.sub(r"[\s_-]+", "-", text).strip("-")


def _lang(value: Any) -> Optional[str]:
    text = str(value).strip().lower() if value else ""
    return text or None


def _parse_year(value: Any) -> Optional[int]:
    match = re.match(r"^\s*(\d{4})", str(value)) if value is not None else None
    if not match:
        return None
    year = int(match.group(1))
    return year if 1800 <= year <= 2200 else None


def _non_negative_int(value: Any) -> Optional[int]:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _positive_int(value: Any, default: int = 1) -> int:
    number = _non_negative_int(value)
    return number if number and number >= 1 else default


def _is_included(doc: Dict[str, Any]) -> bool:
    return doc.get("included", True) is not False


def _ensure_utc(value: Any) -> Optional[datetime]:
    """Normalize naive or aware datetimes / ISO strings to UTC-aware datetime (RFC 3339)."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    return None


def _media_ref(doc: Dict[str, Any]) -> Optional[ReaderMediaRef]:
    if not isinstance(doc, dict) or not doc.get("object_key"):
        return None
    width = _non_negative_int(doc.get("width"))
    height = _non_negative_int(doc.get("height"))
    return ReaderMediaRef(
        bucket=doc.get("minio_bucket") or DEFAULT_BUCKET,
        object_key=doc["object_key"],
        content_type=doc.get("content_type"),
        width=width or None,
        height=height or None,
        file_size=_non_negative_int(doc.get("file_size")) or 0,
        md5_hash=doc.get("md5_hash"),
        sha256=doc.get("sha256"),
    )


def _split_names(value: Any) -> List[str]:
    if not value:
        return []
    return [
        part.strip()
        for part in re.split(r"[,;]", str(value))
        if part.strip() and part.strip().lower() not in {"unknown", "n/a", "various", "various creators"}
    ]


def _build_creators(manga: Dict[str, Any]) -> List[ReaderCreator]:
    from backend.services.creator_service import (
        deterministic_creator_uuid,
        extract_creator_links,
        slugify_creator_name,
    )

    raw_creators = [c for c in (manga.get("creators") or []) if isinstance(c, dict) and c.get("name")]

    # Group by (name_lower, role) and also keep a role-agnostic fallback per name_lower
    by_name_and_role: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    by_name_any: Dict[str, List[Dict[str, Any]]] = {}
    for c in raw_creators:
        cname = str(c["name"]).strip()
        if not cname:
            continue
        cname_lower = cname.lower()
        by_name_any.setdefault(cname_lower, []).append(c)
        crole = str(c.get("role") or "").strip().lower()
        if crole in ("author", "artist"):
            by_name_and_role.setdefault((cname_lower, crole), []).append(c)

    seen_id_role: set[Tuple[str, str]] = set()
    creators: List[ReaderCreator] = []

    def _append_from_dict(c_dict: Dict[str, Any], name_str: str, role_str: str) -> None:
        dex_id = c_dict.get("mangadex_id")
        if isinstance(dex_id, str):
            dex_id = dex_id.strip() or None
        else:
            dex_id = None
        cid = str(c_dict.get("creator_id") or "").strip() or deterministic_creator_uuid(name_str, dex_id)
        if (cid, role_str) in seen_id_role:
            return
        seen_id_role.add((cid, role_str))
        c_slug = str(c_dict.get("slug") or "").strip() or slugify_creator_name(name_str)
        creators.append(
            ReaderCreator(
                creator_id=cid,
                slug=c_slug,
                name=name_str,
                role=role_str,
                mangadex_id=dex_id,
                biography={k: str(v) for k, v in (c_dict.get("biography") or {}).items() if v},
                links=extract_creator_links(c_dict),
            )
        )

    for role in ("author", "artist"):
        covered_names: set[str] = set()
        # 1. Emit any explicit creators declared for this role in manga["creators"]
        for (cname_lower, crole), c_list in by_name_and_role.items():
            if crole != role:
                continue
            for c_item in c_list:
                _append_from_dict(c_item, str(c_item["name"]).strip(), role)
            covered_names.add(cname_lower)

        # 2. Emit any names from manga[role] string not yet covered
        for name in _split_names(manga.get(role)):
            name_lower = name.lower()
            if name_lower in covered_names:
                continue
            covered_names.add(name_lower)
            candidates = by_name_any.get(name_lower) or [{}]
            for extra in candidates:
                _append_from_dict(extra, str(extra.get("name") or name).strip(), role)

    return creators


def _build_tags(raw_tags: Iterable[Any]) -> List[ReaderTag]:
    tags: List[ReaderTag] = []
    seen: set[str] = set()
    for raw in raw_tags or []:
        if not isinstance(raw, dict):
            continue
        names = raw.get("name") if isinstance(raw.get("name"), dict) else {}
        names = {str(k).lower(): str(v) for k, v in names.items() if v}
        if not names:
            continue
        names.setdefault("en", next(iter(names.values())))
        slug = _slugify(names["en"]) or _slugify(str(raw.get("source_tag_id") or ""))
        if not slug or slug in seen:
            continue
        seen.add(slug)
        group = str(raw.get("group") or "").lower()
        tags.append(
            ReaderTag(
                slug=slug,
                source_tag_id=raw.get("source_tag_id"),
                mangadex_id=raw.get("mangadex_id"),
                group=group if group in _TAG_GROUPS else "other",
                name=names,
            )
        )
    return tags


def _build_links(raw_links: Iterable[Any]) -> List[ReaderLink]:
    links: List[ReaderLink] = []
    for raw in raw_links or []:
        if not isinstance(raw, dict) or not raw.get("url"):
            continue
        site = raw.get("title") or raw.get("site") or raw.get("name") or "link"
        links.append(ReaderLink(site=str(site), url=str(raw["url"])))
    return links


def _build_cover_arts(raw_covers: Iterable[Any]) -> List[ReaderCoverArt]:
    covers: List[ReaderCoverArt] = []
    for raw in raw_covers or []:
        if not isinstance(raw, dict) or not _is_included(raw):
            continue
        media = _media_ref(raw)
        if media is None:
            continue
        covers.append(
            ReaderCoverArt(
                cover_id=raw.get("cover_id"),
                volume=raw.get("volume"),
                locale=_lang(raw.get("locale")),
                description=raw.get("description"),
                media=media,
            )
        )
    return covers


def _build_chapter(raw: Dict[str, Any], pool_manga_id: str) -> Optional[ReaderChapter]:
    if not _is_included(raw):
        return None
    raw_pages = [p for p in raw.get("pages") or [] if isinstance(p, dict) and _is_included(p) and p.get("object_key")]
    raw_pages.sort(key=lambda p: _non_negative_int(p.get("page_number")) or 0)
    pages: List[ReaderPage] = []
    for index, page in enumerate(raw_pages, start=1):
        media = _media_ref(page)
        if media is None:
            continue
        pages.append(
            ReaderPage(
                page_uid=str(page.get("page_uid") or f"{raw.get('pool_chapter_id')}-{index}"),
                page_number=index,
                filename=str(page.get("filename") or f"{index:03d}.jpg"),
                media=media,
            )
        )
    if not pages:
        return None
    try:
        numeric = float(raw.get("chapter_numeric") or 0.0)
    except (TypeError, ValueError):
        numeric = 0.0
    return ReaderChapter(
        pool_chapter_id=str(raw["pool_chapter_id"]),
        pool_manga_id=str(raw.get("pool_manga_id") or pool_manga_id),
        source_chapter_id=str(raw.get("source_chapter_id") or ""),
        chapter_number=str(raw.get("chapter_number") or f"{numeric:g}"),
        chapter_numeric=numeric,
        volume=str(raw["volume"]) if raw.get("volume") not in (None, "") else None,
        title=str(raw.get("title") or ""),
        language=_lang(raw.get("language")) or "en",
        scanlation_group=raw.get("scanlation_group") or None,
        publish_at=_ensure_utc(raw.get("publish_at")),
        source=str(raw.get("source") or "mangadex"),
        source_id=raw.get("source_id"),
        page_count=len(pages),
        total_size_bytes=sum(p.media.file_size for p in pages),
        pages_revision=_positive_int(raw.get("pages_revision")),
        manifest_sha256=str(raw.get("manifest_sha256") or ""),
        updated_at=_ensure_utc(raw.get("updated_at")),
        pages=pages,
    )


def build_reader_chapter(raw: Dict[str, Any], pool_manga_id: str) -> Optional[ReaderChapter]:
    """Public helper to transform a single pool chapter document into a strict ReaderChapter v2."""
    return _build_chapter(raw, pool_manga_id)


def build_reader_package(
    pool_manga: Dict[str, Any],
    pool_chapters: Iterable[Dict[str, Any]],
    exported_at: Optional[datetime] = None,
) -> ReaderPackage:
    """Transform a pool manga document + its pool chapters into a validated contract v2 package."""
    pool_manga_id = str(pool_manga["pool_manga_id"])

    chapters = [c for c in (_build_chapter(raw, pool_manga_id) for raw in pool_chapters or []) if c]
    chapters.sort(key=lambda c: (c.chapter_numeric, c.language, c.pool_chapter_id))

    stats = ReaderMangaStats(
        chapter_count=len(chapters),
        page_count=sum(c.page_count for c in chapters),
        total_size_bytes=sum(c.total_size_bytes for c in chapters),
        languages=sorted({c.language for c in chapters}),
    )
    raw_lineage = pool_manga.get("lineage") or {}
    lineage = ReaderLineage(
        pool_revision=_positive_int(raw_lineage.get("pool_revision")),
        source_metadata_revision=_positive_int(raw_lineage.get("source_metadata_revision")),
        manifest_sha256=str(raw_lineage.get("manifest_sha256") or ""),
        published_at=_ensure_utc(raw_lineage.get("published_at")),
        updated_at=_ensure_utc(raw_lineage.get("updated_at")),
    )
    title = str(pool_manga.get("title") or "Untitled")
    manga = ReaderManga(
        pool_manga_id=pool_manga_id,
        slug=str(pool_manga.get("slug") or _slugify(title) or pool_manga_id),
        source_manga_id=str(pool_manga.get("source_manga_id") or ""),
        mangadex_id=pool_manga.get("mangadex_id"),
        title=title,
        alt_titles=[str(t) for t in pool_manga.get("alt_titles") or [] if t],
        description=str(pool_manga.get("description") or ""),
        status=normalize_status(pool_manga.get("status")),
        content_rating=normalize_content_rating(pool_manga.get("content_rating")),
        publication_demographic=normalize_demographic(pool_manga.get("publication_demographic")),
        original_language=_lang(pool_manga.get("original_language")),
        year=_parse_year(pool_manga.get("year")),
        published_start_date=pool_manga.get("published_start_date"),
        published_end_date=pool_manga.get("published_end_date"),
        official_volumes=_non_negative_int(pool_manga.get("volumes")),
        official_chapters=_non_negative_int(pool_manga.get("chapters")),
        creators=_build_creators(pool_manga),
        tags=_build_tags(pool_manga.get("tags")),
        links=_build_links(pool_manga.get("links")),
        primary_cover=_media_ref(pool_manga.get("primary_cover") or {}),
        cover_arts=_build_cover_arts(pool_manga.get("cover_arts")),
        stats=stats,
        lineage=lineage,
    )
    return ReaderPackage(
        exported_at=_ensure_utc(exported_at) or datetime.now(timezone.utc),
        manga=manga,
        chapters=chapters,
    )


def build_reader_package_dict(
    pool_manga: Dict[str, Any],
    pool_chapters: Iterable[Dict[str, Any]],
    *,
    include_chapters: bool = True,
    exported_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Serialize a validated contract v2 package dict.

    When ``include_chapters=False`` (metadata-only sync / ADR-012), the root ``chapters``
    property is omitted rather than emitted as an empty list so downstream consumers never
    misinterpret a metadata update as a request to delete all existing chapters.
    """
    pkg = build_reader_package(pool_manga, pool_chapters, exported_at=exported_at)
    data = pkg.model_dump(mode="json")
    if not include_chapters:
        data.pop("chapters", None)
    return data


def _example_package() -> ReaderPackage:
    """Illustrative package covering every field; built through the real transformer to stay valid."""
    ts = datetime(2026, 1, 1, tzinfo=timezone.utc)
    pool_manga = {
        "pool_manga_id": "pm_1a2b3c4d5e6f",
        "source_manga_id": "65e0c0ffee0000000000abcd",
        "mangadex_id": "00000000-0000-4000-8000-000000000001",
        "slug": "example-manga",
        "title": "Example Manga",
        "alt_titles": ["Ví Dụ Manga", "サンプル漫画"],
        "description": "Synopsis of the manga.",
        "author": "Jane Author",
        "artist": "John Artist",
        "creators": [
            {
                "creator_id": "00000000-0000-4000-8000-0000000000a1",
                "slug": "jane-author",
                "name": "Jane Author",
                "role": "author",
                "mangadex_id": "00000000-0000-4000-8000-0000000000a1",
                "biography": {
                    "en": "**Name In Native Language:** 山田花子\n\nAward-winning manga author.",
                },
                "links": {
                    "twitter": "https://twitter.com/jane_author",
                    "website": "https://jane-author.example.com",
                },
            },
            {
                "creator_id": "00000000-0000-4000-8000-0000000000a2",
                "slug": "john-artist",
                "name": "John Artist",
                "role": "artist",
                "mangadex_id": "00000000-0000-4000-8000-0000000000a2",
                "biography": {
                    "en": "Lead illustrator and character designer.",
                },
                "links": {
                    "twitter": "https://twitter.com/john_artist",
                    "pixiv": "https://www.pixiv.net/users/123456",
                },
            },
        ],
        "year": "2020",
        "status": "ongoing",
        "content_rating": "safe",
        "publication_demographic": "shounen",
        "original_language": "ja",
        "published_start_date": "2020-04-01",
        "volumes": 12,
        "chapters": 110,
        "tags": [{"source_tag_id": "tag_action", "name": {"en": "Action", "vi": "Hành động"}, "group": "genre"}],
        "links": [{"title": "MangaDex", "url": "https://mangadex.org/title/00000000-0000-4000-8000-000000000001"}],
        "primary_cover": {"minio_bucket": DEFAULT_BUCKET, "object_key": "covers/example-manga/main.webp"},
        "cover_arts": [
            {
                "cover_id": "cov_v1",
                "volume": "1",
                "locale": "ja",
                "object_key": "covers/example-manga/v1.webp",
            }
        ],
        "lineage": {
            "pool_revision": 3,
            "source_metadata_revision": 2,
            "manifest_sha256": "0" * 64,
            "published_at": ts,
            "updated_at": ts,
        },
    }
    page = {
        "page_uid": "pg_000001",
        "page_number": 1,
        "filename": "001.webp",
        "minio_bucket": DEFAULT_BUCKET,
        "object_key": "chapters/example-manga/en/ch-1/001.webp",
        "file_size": 245760,
        "width": 1080,
        "height": 1620,
        "content_type": "image/webp",
        "md5_hash": "d41d8cd98f00b204e9800998ecf8427e",
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    }
    chapter = {
        "pool_chapter_id": "pch_0a1b2c3d4e5f",
        "pool_manga_id": "pm_1a2b3c4d5e6f",
        "source_chapter_id": "65e0c0ffee0000000000ef01",
        "chapter_number": "1",
        "chapter_numeric": 1.0,
        "volume": "1",
        "title": "The Beginning",
        "language": "en",
        "scanlation_group": "Example Scans",
        "publish_at": ts,
        "source": "mangadex",
        "source_id": "00000000-0000-4000-8000-0000000000c1",
        "pages_revision": 1,
        "manifest_sha256": "1" * 64,
        "updated_at": ts,
        "pages": [page],
    }
    return build_reader_package(pool_manga, [chapter], exported_at=ts)


@lru_cache(maxsize=1)
def _cached_template() -> Dict[str, Any]:
    schema = ReaderPackage.model_json_schema(mode="serialization")
    return {
        "$schema": JSON_SCHEMA_DIALECT,
        "$id": CONTRACT_SCHEMA_ID,
        **schema,
        "examples": [_example_package().model_dump(mode="json")],
    }


def build_reader_contract_template() -> Dict[str, Any]:
    """Universal JSON Schema (Draft 2020-12) with an embedded valid example for every pooled manga."""
    return copy.deepcopy(_cached_template())
