import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from backend.database.connection import get_db
from backend.models.datasource import (
    MetadataApplyResponse,
    MetadataConflictError,
    MetadataFieldDiff,
    MetadataPreviewResponse,
    SourceWork,
)

logger = logging.getLogger(__name__)


class MetadataMergeService:
    PROTECTED_USER_FIELDS = {
        "read_status",
        "personal_rating",
        "reviews",
        "notes",
        "download_path",
    }

    MERGEABLE_FIELDS = [
        "title",
        "alt_titles",
        "description",
        "author",
        "artist",
        "year",
        "status",
        "content_rating",
        "publication_demographic",
        "original_language",
        "links",
        "cover_url",
        "tag_ids",
        "source_metrics",
    ]

    SEO_JUNK_PATTERNS = [
        re.compile(r"read\s+.*online", re.I),
        re.compile(r"free\s+manga", re.I),
        re.compile(r"manga\s+online", re.I),
        re.compile(r"read\s+free", re.I),
        re.compile(r"high\s+quality", re.I),
        re.compile(r"scanlation", re.I),
        re.compile(r"all\s+chapters", re.I),
        re.compile(r"latest\s+chapters", re.I),
        re.compile(r"english\s+scan", re.I),
        re.compile(r"raw\s+manga", re.I),
    ]

    @classmethod
    def is_seo_junk(cls, title: str) -> bool:
        clean = re.sub(r"<[^>]+>", "", title).strip()
        if not clean or len(clean) > 250:
            return True
        for pat in cls.SEO_JUNK_PATTERNS:
            if pat.search(clean):
                return True
        return False

    @staticmethod
    def normalize_status(raw_status: Optional[str]) -> Optional[str]:
        if not raw_status:
            return None
        s = str(raw_status).strip().lower()
        if s in ("releasing", "ongoing"):
            return "ongoing"
        if s in ("completed", "finished"):
            return "completed"
        if s in ("on_hiatus", "hiatus"):
            return "hiatus"
        if s in ("discontinued", "cancelled", "canceled"):
            return "cancelled"
        return s

    @classmethod
    def merge_alt_titles(cls, existing_alts: List[str], candidate_alts: List[str]) -> List[str]:
        merged = [a.strip() for a in existing_alts if a and not cls.is_seo_junk(a)]
        existing_lookup = {a.strip().lower() for a in merged}
        for alt in candidate_alts:
            if not alt:
                continue
            clean_alt = re.sub(r"<[^>]+>", "", alt).strip()
            if not clean_alt or cls.is_seo_junk(clean_alt):
                continue
            normalized = clean_alt.lower()
            if normalized not in existing_lookup:
                merged.append(clean_alt)
                existing_lookup.add(normalized)
        return merged

    @classmethod
    def merge_links(cls, existing_links: List[Any], candidate: SourceWork) -> List[Dict[str, str]]:
        merged_links: List[Dict[str, str]] = []
        seen_urls = set()

        for link in existing_links:
            if isinstance(link, dict):
                url = link.get("url", "").strip()
                title = link.get("title", "")
            else:
                url = getattr(link, "url", "").strip()
                title = getattr(link, "title", "")
            if url and url not in seen_urls:
                merged_links.append({"title": title, "url": url})
                seen_urls.add(url)

        # Merge candidate canonical URL
        if candidate.url and candidate.url not in seen_urls:
            display_title = candidate.source.capitalize()
            merged_links.append({"title": display_title, "url": candidate.url})
            seen_urls.add(candidate.url)

        # Merge candidate external IDs
        ext_ids = candidate.external_ids or {}
        if "al" in ext_ids and ext_ids["al"]:
            al_url = f"https://anilist.co/manga/{ext_ids['al']}"
            if al_url not in seen_urls:
                merged_links.append({"title": "AniList", "url": al_url})
                seen_urls.add(al_url)

        if "mal" in ext_ids and ext_ids["mal"]:
            mal_url = f"https://myanimelist.net/manga/{ext_ids['mal']}"
            if mal_url not in seen_urls:
                merged_links.append({"title": "MyAnimeList", "url": mal_url})
                seen_urls.add(mal_url)

        if "mangadex" in ext_ids and ext_ids["mangadex"]:
            dex_url = f"https://mangadex.org/title/{ext_ids['mangadex']}"
            if dex_url not in seen_urls:
                merged_links.append({"title": "MangaDex", "url": dex_url})
                seen_urls.add(dex_url)

        return merged_links

    def generate_diff(self, manga_doc: Dict[str, Any], candidate: SourceWork) -> MetadataPreviewResponse:
        manga_id = str(manga_doc.get("_id", ""))
        current_rev = manga_doc.get("metadata_revision", 1)
        locks = manga_doc.get("metadata_locks", {})

        diffs: List[MetadataFieldDiff] = []
        has_conflicts = False

        for field in self.MERGEABLE_FIELDS:
            if field == "source_metrics":
                curr_val = manga_doc.get("source_metrics", {}).get(candidate.source)
                cand_val = candidate.extra_metadata.get("source_metrics") or candidate.extra_metadata.get("metrics")
            elif field == "tag_ids":
                curr_val = manga_doc.get("tag_ids", [])
                cand_val = candidate.extra_metadata.get("genres") or candidate.extra_metadata.get("tags")
            elif field == "cover_url":
                curr_val = manga_doc.get("cover_url")
                cand_val = candidate.cover_url
            elif field == "status":
                curr_val = manga_doc.get("status")
                cand_val = self.normalize_status(candidate.status)
            elif hasattr(candidate, field):
                curr_val = manga_doc.get(field)
                cand_val = getattr(candidate, field)
            else:
                curr_val = manga_doc.get(field)
                cand_val = None

            if cand_val is None and field not in ("title", "description", "author", "artist", "year"):
                continue

            is_locked = bool(locks.get(field, False))

            # Compare values
            if curr_val == cand_val:
                state = "identical"
                recommendation = "keep"
            elif is_locked:
                state = "locked"
                recommendation = "keep"
            elif not curr_val and cand_val:
                state = "new"
                recommendation = "accept"
            else:
                state = "conflict"
                recommendation = "manual_review"
                has_conflicts = True

            diffs.append(
                MetadataFieldDiff(
                    field_path=field,
                    current_value=curr_val,
                    candidate_value=cand_val,
                    source=candidate.source,
                    decision_state=state,
                    is_locked=is_locked,
                    recommended_action=recommendation,
                )
            )

        return MetadataPreviewResponse(
            manga_id=manga_id,
            source=candidate.source,
            source_work_id=candidate.source_work_id,
            current_metadata_revision=current_rev,
            diffs=diffs,
            has_conflicts=has_conflicts,
        )

    async def apply_metadata(
        self,
        manga_id: str,
        candidate: SourceWork,
        accepted_fields: List[str],
        field_locks: Optional[Dict[str, bool]] = None,
        expected_metadata_revision: Optional[int] = None,
    ) -> MetadataApplyResponse:
        db = get_db()
        if not ObjectId.is_valid(manga_id):
            raise ValueError(f"Invalid manga ObjectId: {manga_id}")

        manga = await db.mangas.find_one({"_id": ObjectId(manga_id)})
        if not manga:
            raise ValueError(f"Manga with id {manga_id} not found")

        current_rev = manga.get("metadata_revision", 1)
        if expected_metadata_revision is not None and current_rev != expected_metadata_revision:
            raise MetadataConflictError(
                f"Metadata was modified by another operation (expected revision {expected_metadata_revision}, "
                f"current revision {current_rev})"
            )

        # Merge field locks
        locks = dict(manga.get("metadata_locks", {}))
        if field_locks:
            locks.update(field_locks)

        update_doc: Dict[str, Any] = {}
        provenance = dict(manga.get("metadata_provenance", {}))
        applied_fields: List[str] = []
        now_utc = datetime.now(timezone.utc)

        for field in accepted_fields:
            if field in self.PROTECTED_USER_FIELDS:
                logger.warning(f"Skipping attempt to overwrite protected user field: {field}")
                continue

            if field not in self.MERGEABLE_FIELDS:
                continue

            # If field is locked in locks and not explicitly provided in field_locks as unlocked
            if locks.get(field, False) and not (field_locks and field_locks.get(field) is False):
                logger.info(f"Skipping locked field: {field}")
                continue

            val: Any = None
            if field == "cover_url":
                val = candidate.cover_url
            elif field == "status":
                val = self.normalize_status(candidate.status)
            elif field == "alt_titles":
                val = self.merge_alt_titles(manga.get("alt_titles", []), candidate.alt_titles)
            elif field == "links":
                val = self.merge_links(manga.get("links", []), candidate)
            elif field == "source_metrics":
                metrics = candidate.extra_metadata.get("source_metrics") or candidate.extra_metadata.get("metrics")
                if metrics:
                    existing_metrics = dict(manga.get("source_metrics") or {})
                    existing_metrics[candidate.source] = metrics
                    val = existing_metrics
            elif field == "tag_ids":
                genres = candidate.extra_metadata.get("genres") or candidate.extra_metadata.get("tags") or []
                if genres:
                    existing_tag_ids = list(manga.get("tag_ids", []))
                    for g in genres:
                        g_name = str(g).strip()
                        if not g_name:
                            continue
                        tag_doc = await db.tags.find_one({"name_lower": g_name.lower()})
                        if tag_doc:
                            tid = str(tag_doc["_id"])
                        else:
                            res = await db.tags.insert_one(
                                {
                                    "name": g_name,
                                    "name_lower": g_name.lower(),
                                    "description": "",
                                    "created_at": now_utc,
                                }
                            )
                            tid = str(res.inserted_id)
                        if tid not in existing_tag_ids:
                            existing_tag_ids.append(tid)
                    val = existing_tag_ids
            elif hasattr(candidate, field):
                val = getattr(candidate, field)

            if val is not None:
                update_doc[field] = val
                applied_fields.append(field)
                provenance[field] = {
                    "source": candidate.source,
                    "source_work_id": candidate.source_work_id,
                    "updated_at": now_utc.isoformat(),
                }

        # Auto-track source metrics if present even if not explicitly checked in accepted_fields
        cand_metrics = candidate.extra_metadata.get("source_metrics") or candidate.extra_metadata.get("metrics")
        if cand_metrics and "source_metrics" not in update_doc:
            existing_metrics = dict(manga.get("source_metrics") or {})
            existing_metrics[candidate.source] = cand_metrics
            update_doc["source_metrics"] = existing_metrics
            if "source_metrics" not in applied_fields:
                applied_fields.append("source_metrics")
            provenance["source_metrics"] = {
                "source": candidate.source,
                "source_work_id": candidate.source_work_id,
                "updated_at": now_utc.isoformat(),
            }

        # Candidate cover art gallery registration
        if candidate.cover_url:
            try:
                await db.cover_arts.update_one(
                    {"manga_id": manga_id, "source": candidate.source, "source_url": candidate.cover_url},
                    {
                        "$setOnInsert": {
                            "manga_id": manga_id,
                            "source": candidate.source,
                            "source_url": candidate.cover_url,
                            "is_candidate": True,
                            "created_at": now_utc,
                        }
                    },
                    upsert=True,
                )
            except Exception as ca_err:
                logger.debug(f"Candidate cover art registration skipped: {ca_err}")

        new_rev = current_rev + 1
        update_doc["metadata_revision"] = new_rev
        update_doc["metadata_locks"] = locks
        update_doc["metadata_provenance"] = provenance
        update_doc["updated_at"] = datetime.now(timezone.utc)

        filter_query: Dict[str, Any] = {"_id": ObjectId(manga_id)}
        if expected_metadata_revision is not None:
            filter_query["metadata_revision"] = expected_metadata_revision

        result = await db.mangas.update_one(filter_query, {"$set": update_doc})
        if result.modified_count == 0:
            raise MetadataConflictError("Concurrent update detected; revision mismatch on atomic commit.")

        # Persist snapshot
        snapshot_bytes = json.dumps(candidate.model_dump(), default=str, sort_keys=True).encode("utf-8")
        snapshot_hash = hashlib.sha256(snapshot_bytes).hexdigest()

        snapshot_doc = {
            "manga_id": manga_id,
            "source": candidate.source,
            "source_work_id": candidate.source_work_id,
            "fetched_at": now_utc,
            "snapshot_hash": snapshot_hash,
            "source_work": candidate.model_dump(),
        }
        await db.source_metadata_snapshots.insert_one(snapshot_doc)

        # Invalidate cache if redis is running
        try:
            from backend.core.redis import delete_cache

            await delete_cache(f"manga:detail:{manga_id}")
        except Exception as e:
            logger.debug(f"Cache invalidation notice: {e}")

        return MetadataApplyResponse(
            success=True,
            manga_id=manga_id,
            applied_fields=applied_fields,
            new_metadata_revision=new_rev,
            updated_at=now_utc,
        )


metadata_merge_service = MetadataMergeService()
