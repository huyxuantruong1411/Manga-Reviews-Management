"""Phase 0 Read-Only MongoDB Discovery & Schema Profiler.

Strictly read-only: invokes only list_collection_names, count_documents, and find.
Redacts private text (review content, OCR text, descriptions, URLs, object keys, credentials).
Outputs redacted schema/type/completeness/relationship statistics to
analytics/profiling/phase0_profile.json.
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from bson import Binary, Decimal128, Int64, ObjectId
from dotenv import dotenv_values
from pymongo import MongoClient, ReadPreference

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = REPO_ROOT / "analytics" / "profiling"

PRIVATE_KEY_PATTERNS = re.compile(
    r"(text|content|bio|biography|description|note|title|alt_title|url|uri|key|secret|password|token|avatar|filename|object_key|download_path|file_path|actor|reviewer_name)",
    re.IGNORECASE,
)

PRIMARY_COLLECTIONS = [
    "mangas",
    "reviews",
    "tags",
    "creators",
    "chapters",
    "chapter_slots",
    "reading_progress",
    "audit_logs",
    "external_reviews",
    "manga_panels",
    "panel_scan_pages",
    "vision_page_analyses",
    "vision_regions",
    "creator_tierlists",
    "manga_sources",
    "source_metadata_snapshots",
    "cover_arts",
]

POOL_COLLECTIONS = [
    "pool_mangas",
    "pool_chapters",
    "pool_creators",
    "pool_audit_logs",
    "pool_cdc_events",
    "pool_cdc_deliveries",
    "pool_cdc_subscriptions",
]


def bson_type_name(val: Any) -> str:
    if val is None:
        return "null"
    if isinstance(val, bool):
        return "bool"
    if isinstance(val, ObjectId):
        return "ObjectId"
    if isinstance(val, Int64):
        return "int64"
    if isinstance(val, int):
        return "int"
    if isinstance(val, float):
        return "double"
    if isinstance(val, Decimal128):
        return "Decimal128"
    if isinstance(val, datetime):
        return "datetime"
    if isinstance(val, Binary):
        return "binary"
    if isinstance(val, list):
        return "array"
    if isinstance(val, dict):
        return "object"
    if isinstance(val, str):
        return "string"
    return type(val).__name__


def walk_schema(doc: dict[str, Any], prefix: str, type_map: dict[str, Counter[str]], max_depth: int = 4) -> None:
    if prefix.count(".") >= max_depth:
        return
    for key, val in doc.items():
        path = f"{prefix}.{key}" if prefix else key
        tname = bson_type_name(val)
        type_map[path][tname] += 1
        if isinstance(val, dict) and prefix.count(".") < max_depth - 1:
            # Avoid exploding dynamic dictionary keys for provenance/locks/metrics maps
            if key in {"metadata_locks", "metadata_provenance", "source_metrics", "name", "biography", "links"}:
                sub_path = f"{path}.<key>"
                for sub_val in list(val.values())[:20]:
                    type_map[sub_path][bson_type_name(sub_val)] += 1
            elif key == "content_json":
                # TipTap JSON: record top-level node type only
                if "type" in val:
                    type_map[f"{path}.type"][bson_type_name(val["type"])] += 1
                if "content" in val:
                    type_map[f"{path}.content"][bson_type_name(val["content"])] += 1
            else:
                walk_schema(val, path, type_map, max_depth=max_depth)
        elif isinstance(val, list):
            elem_path = f"{path}[]"
            for item in val[:50]:
                itname = bson_type_name(item)
                type_map[elem_path][itname] += 1
                if isinstance(item, dict) and elem_path.count(".") < max_depth - 1:
                    walk_schema(item, elem_path, type_map, max_depth=max_depth)


def _to_iso(dt: Any) -> str | None:
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.isoformat()
    return None


def profile_collection_schema(coll, doc_count: int) -> dict[str, Any]:
    type_map: dict[str, Counter[str]] = defaultdict(Counter)
    sampled = 0
    cursor = coll.find({}, batch_size=200)
    for doc in cursor:
        sampled += 1
        walk_schema(doc, "", type_map)

    field_profile = {}
    for path, counts in sorted(type_map.items()):
        present_count = sum(counts.values())
        null_count = counts.get("null", 0)
        is_array_elem = "[]" in path or "<key>" in path
        field_profile[path] = {
            "types": dict(counts),
            "present_count": present_count,
            "null_count": null_count,
            "missing_rate": round(max(0, sampled - present_count) / sampled, 4)
            if (sampled and not is_array_elem)
            else None,
            "null_rate": round(null_count / sampled, 4) if (sampled and not is_array_elem) else None,
        }
    return {
        "document_count": doc_count,
        "sampled_count": sampled,
        "field_profile": field_profile,
    }


def collect_tiptap_node_types(node: Any, counter: Counter[str]) -> None:
    if not isinstance(node, dict):
        return
    ntype = node.get("type")
    if isinstance(ntype, str):
        counter[ntype] += 1
    for child in node.get("content") or []:
        collect_tiptap_node_types(child, counter)


def run_semantic_checks(db, pool_db) -> dict[str, Any]:
    semantics: dict[str, Any] = {}

    # 1. Mangas
    mangas = list(db.mangas.find({}, batch_size=200))
    manga_ids = {str(m["_id"]) for m in mangas}
    read_statuses = Counter()
    pub_statuses = Counter()
    content_ratings = Counter()
    demographics = Counter()
    orig_langs = Counter()
    ratings = []
    rating_step_invalid = 0
    rating_out_of_bounds = 0
    has_completed_at = 0
    has_added_at = 0
    has_updated_at = 0
    is_deleted_count = 0
    added_dates = []
    updated_dates = []
    completed_dates = []
    tracker_keys = Counter()
    mal_ext_score_present = 0
    mal_basic_score_present = 0
    source_metrics_keys = Counter()
    provenance_keys = Counter()
    locks_count = 0
    mangas_with_tag_ids = 0
    mangas_with_creators_arr = 0
    mangas_with_legacy_author = 0
    mangas_with_legacy_artist = 0
    legacy_author_commas = 0
    legacy_artist_commas = 0
    declared_chapters_present = 0
    declared_volumes_present = 0

    all_manga_tag_refs = []
    embedded_creator_refs = 0
    embedded_with_creator_id = 0
    embedded_with_mangadex_id = 0
    embedded_roles = Counter()

    for m in mangas:
        if m.get("is_deleted"):
            is_deleted_count += 1
        rs = m.get("read_status")
        read_statuses[str(rs)] += 1
        pub_statuses[str(m.get("status"))] += 1
        content_ratings[str(m.get("content_rating"))] += 1
        demographics[str(m.get("publication_demographic"))] += 1
        orig_langs[str(m.get("original_language"))] += 1

        pr = m.get("personal_rating")
        if pr is not None:
            try:
                f_pr = float(pr)
                ratings.append(f_pr)
                if f_pr < 0 or f_pr > 10:
                    rating_out_of_bounds += 1
                if (f_pr * 2) % 1 != 0:
                    rating_step_invalid += 1
            except (TypeError, ValueError):
                rating_out_of_bounds += 1

        if m.get("completed_at") is not None:
            has_completed_at += 1
            if isinstance(m["completed_at"], datetime):
                completed_dates.append(m["completed_at"])
        if m.get("added_at") is not None:
            has_added_at += 1
            if isinstance(m["added_at"], datetime):
                added_dates.append(m["added_at"])
        if m.get("updated_at") is not None:
            has_updated_at += 1
            if isinstance(m["updated_at"], datetime):
                updated_dates.append(m["updated_at"])

        if m.get("chapters") is not None:
            declared_chapters_present += 1
        if m.get("volumes") is not None:
            declared_volumes_present += 1

        tm = m.get("tracker_metadata")
        if isinstance(tm, dict):
            for k in tm:
                tracker_keys[k] += 1
            mal_ext = tm.get("mal_extended")
            if isinstance(mal_ext, dict) and mal_ext.get("score") is not None:
                mal_ext_score_present += 1
            mal_basic = tm.get("mal")
            if isinstance(mal_basic, dict) and mal_basic.get("score") is not None:
                mal_basic_score_present += 1

        sm = m.get("source_metrics")
        if isinstance(sm, dict) and sm:
            for k in sm:
                source_metrics_keys[k] += 1

        mp = m.get("metadata_provenance")
        if isinstance(mp, dict) and mp:
            for k in mp:
                provenance_keys[k] += 1

        ml = m.get("metadata_locks")
        if isinstance(ml, dict) and any(ml.values()):
            locks_count += 1

        tids = m.get("tag_ids") or []
        if tids:
            mangas_with_tag_ids += 1
            all_manga_tag_refs.extend([str(t) for t in tids])

        crs = m.get("creators") or []
        if crs:
            mangas_with_creators_arr += 1
            for c in crs:
                if isinstance(c, dict):
                    embedded_creator_refs += 1
                    if c.get("creator_id"):
                        embedded_with_creator_id += 1
                    if c.get("mangadex_id"):
                        embedded_with_mangadex_id += 1
                    embedded_roles[str(c.get("role"))] += 1

        if m.get("author"):
            mangas_with_legacy_author += 1
            if "," in str(m["author"]):
                legacy_author_commas += 1
        if m.get("artist"):
            mangas_with_legacy_artist += 1
            if "," in str(m["artist"]):
                legacy_artist_commas += 1

    # Tags
    tags = list(db.tags.find({}, batch_size=200))
    tag_id_set = {str(t["_id"]) for t in tags}
    tag_sources = Counter(str(t.get("source")) for t in tags)
    tag_groups = Counter(str(t.get("group")) for t in tags)
    dangling_tag_refs = [tid for tid in all_manga_tag_refs if tid not in tag_id_set]

    # Creators
    creators = list(db.creators.find({}, batch_size=200))
    creator_canonical_ids = {c.get("creator_id") for c in creators if c.get("creator_id")}
    creator_dex_ids = {c.get("mangadex_id") for c in creators if c.get("mangadex_id")}
    creator_names_lower = Counter((c.get("name") or "").strip().lower() for c in creators)
    duplicate_creator_names = sum(1 for _, cnt in creator_names_lower.items() if cnt > 1)

    matched_embedded_by_cid = 0
    matched_embedded_by_dex = 0
    for m in mangas:
        for c in m.get("creators") or []:
            if isinstance(c, dict):
                if c.get("creator_id") in creator_canonical_ids:
                    matched_embedded_by_cid += 1
                if c.get("mangadex_id") in creator_dex_ids:
                    matched_embedded_by_dex += 1

    semantics["mangas"] = {
        "total": len(mangas),
        "is_deleted_true": is_deleted_count,
        "read_status_dist": dict(read_statuses),
        "publication_status_dist": dict(pub_statuses),
        "content_rating_dist": dict(content_ratings),
        "demographic_dist": dict(demographics),
        "original_language_dist": dict(orig_langs),
        "rated_count": len(ratings),
        "rating_min": min(ratings) if ratings else None,
        "rating_max": max(ratings) if ratings else None,
        "rating_out_of_bounds": rating_out_of_bounds,
        "rating_step_invalid": rating_step_invalid,
        "has_added_at": has_added_at,
        "has_updated_at": has_updated_at,
        "has_completed_at": has_completed_at,
        "added_at_min": _to_iso(min(added_dates)) if added_dates else None,
        "added_at_max": _to_iso(max(added_dates)) if added_dates else None,
        "updated_at_max": _to_iso(max(updated_dates)) if updated_dates else None,
        "completed_at_min": _to_iso(min(completed_dates)) if completed_dates else None,
        "completed_at_max": _to_iso(max(completed_dates)) if completed_dates else None,
        "declared_chapters_present": declared_chapters_present,
        "declared_volumes_present": declared_volumes_present,
        "tracker_metadata_keys": dict(tracker_keys),
        "mal_extended_score_present": mal_ext_score_present,
        "mal_basic_score_present": mal_basic_score_present,
        "source_metrics_keys": dict(source_metrics_keys),
        "metadata_provenance_keys": dict(provenance_keys),
        "mangas_with_locks": locks_count,
        "mangas_with_tag_ids": mangas_with_tag_ids,
        "mangas_with_creators_array": mangas_with_creators_arr,
        "mangas_with_legacy_author": mangas_with_legacy_author,
        "mangas_with_legacy_artist": mangas_with_legacy_artist,
        "legacy_author_contains_comma": legacy_author_commas,
        "legacy_artist_contains_comma": legacy_artist_commas,
    }
    semantics["tags"] = {
        "total": len(tags),
        "source_dist": dict(tag_sources),
        "group_dist": dict(tag_groups),
        "total_tag_refs_on_mangas": len(all_manga_tag_refs),
        "dangling_tag_refs": len(dangling_tag_refs),
    }
    semantics["creators"] = {
        "total_docs": len(creators),
        "with_canonical_creator_id": len(creator_canonical_ids),
        "with_mangadex_id": len(creator_dex_ids),
        "duplicate_normalized_names": duplicate_creator_names,
        "embedded_creator_refs": embedded_creator_refs,
        "embedded_with_creator_id": embedded_with_creator_id,
        "embedded_with_mangadex_id": embedded_with_mangadex_id,
        "embedded_matched_creators_col_by_creator_id": matched_embedded_by_cid,
        "embedded_matched_creators_col_by_mangadex_id": matched_embedded_by_dex,
        "embedded_roles_dist": dict(embedded_roles),
    }

    # 2. Reviews
    reviews = list(db.reviews.find({}, batch_size=200))
    tiptap_nodes = Counter()
    review_deleted = 0
    review_orphan_manga = 0
    reviews_per_manga = Counter()
    review_created_dates = []
    for r in reviews:
        if r.get("is_deleted"):
            review_deleted += 1
        else:
            reviews_per_manga[str(r.get("manga_id"))] += 1
        if str(r.get("manga_id")) not in manga_ids:
            review_orphan_manga += 1
        if isinstance(r.get("created_at"), datetime):
            review_created_dates.append(r["created_at"])
        collect_tiptap_node_types(r.get("content_json"), tiptap_nodes)

    semantics["reviews"] = {
        "total": len(reviews),
        "is_deleted_true": review_deleted,
        "active_count": len(reviews) - review_deleted,
        "distinct_manga_with_active_review": len(reviews_per_manga),
        "max_active_reviews_per_manga": max(reviews_per_manga.values()) if reviews_per_manga else 0,
        "mangas_with_multiple_active_reviews": sum(1 for c in reviews_per_manga.values() if c > 1),
        "orphan_manga_id_count": review_orphan_manga,
        "tiptap_node_types": dict(tiptap_nodes),
        "created_at_min": _to_iso(min(review_created_dates)) if review_created_dates else None,
        "created_at_max": _to_iso(max(review_created_dates)) if review_created_dates else None,
    }

    # 3. External reviews
    ext_reviews = list(db.external_reviews.find({}, batch_size=200))
    ext_sources = Counter()
    ext_recs = Counter()
    ext_ratings = []
    ext_prelim = 0
    ext_spoiler = 0
    ext_orphan = 0
    ext_keys = Counter()
    ext_fetched = []
    for er in ext_reviews:
        ext_sources[str(er.get("source"))] += 1
        ext_recs[str(er.get("recommendation_status"))] += 1
        if er.get("overall_rating") is not None:
            ext_ratings.append(float(er["overall_rating"]))
        if er.get("is_preliminary"):
            ext_prelim += 1
        if er.get("is_spoiler"):
            ext_spoiler += 1
        if str(er.get("manga_id")) not in manga_ids:
            ext_orphan += 1
        if isinstance(er.get("fetched_at"), datetime):
            ext_fetched.append(er["fetched_at"])
        ext_keys[(str(er.get("source")), str(er.get("source_work_id")), str(er.get("source_review_id")))] += 1

    semantics["external_reviews"] = {
        "total": len(ext_reviews),
        "distinct_manga_id": len({str(er.get("manga_id")) for er in ext_reviews}),
        "source_dist": dict(ext_sources),
        "recommendation_dist": dict(ext_recs),
        "rated_count": len(ext_ratings),
        "rating_min": min(ext_ratings) if ext_ratings else None,
        "rating_max": max(ext_ratings) if ext_ratings else None,
        "preliminary_count": ext_prelim,
        "spoiler_count": ext_spoiler,
        "orphan_manga_id_count": ext_orphan,
        "duplicate_natural_keys": sum(1 for c in ext_keys.values() if c > 1),
        "fetched_at_min": _to_iso(min(ext_fetched)) if ext_fetched else None,
        "fetched_at_max": _to_iso(max(ext_fetched)) if ext_fetched else None,
    }

    # 4. Chapters & Chapter Slots
    chapters = list(db.chapters.find({}, batch_size=200))
    ch_sources = Counter()
    ch_langs = Counter()
    ch_states = Counter()
    ch_with_slot_id = 0
    total_pages = 0
    pages_with_uid = 0
    pages_with_md5 = 0
    pages_with_sha256 = 0
    ch_orphan = 0
    page_keys_seen = set()
    page_hash_by_ch_page: dict[tuple[str, int], set[str]] = defaultdict(set)

    for ch in chapters:
        ch_id = str(ch["_id"])
        ch_sources[str(ch.get("source"))] += 1
        ch_langs[str(ch.get("language"))] += 1
        ch_states[str(ch.get("state"))] += 1
        if ch.get("logical_chapter_id"):
            ch_with_slot_id += 1
        if str(ch.get("manga_id")) not in manga_ids:
            ch_orphan += 1
        for p in ch.get("pages") or []:
            total_pages += 1
            if p.get("page_uid"):
                pages_with_uid += 1
            if p.get("md5_hash"):
                pages_with_md5 += 1
                page_hash_by_ch_page[(ch_id, int(p.get("page_number", 0)))].add(str(p["md5_hash"]))
            if p.get("sha256"):
                pages_with_sha256 += 1
            page_keys_seen.add((ch_id, p.get("page_number")))

    slots = list(db.chapter_slots.find({}, batch_size=200))
    semantics["chapters"] = {
        "total": len(chapters),
        "distinct_manga_id": len({str(ch.get("manga_id")) for ch in chapters}),
        "source_dist": dict(ch_sources),
        "language_dist": dict(ch_langs),
        "state_dist": dict(ch_states),
        "with_logical_chapter_id": ch_with_slot_id,
        "orphan_manga_id_count": ch_orphan,
        "total_embedded_pages": total_pages,
        "pages_with_page_uid": pages_with_uid,
        "pages_with_md5_hash": pages_with_md5,
        "pages_with_sha256": pages_with_sha256,
        "chapter_slots_total": len(slots),
    }

    # 5. OCR: manga_panels & panel_scan_pages & vision_page_analyses
    panels = list(db.manga_panels.find({}, batch_size=500))
    panel_langs = Counter()
    panel_modes = Counter()
    panel_pipeline_versions = Counter()
    panel_with_cleaned_text = 0
    panel_with_vocab = 0
    vocab_items_total = 0
    vocab_freq_gt1 = 0
    vocab_freq_eq1 = 0
    vocab_missing_lemma = 0
    vocab_missing_pos = 0
    panel_with_lemmas = 0

    for pan in panels:
        panel_langs[str(pan.get("language"))] += 1
        panel_modes[str(pan.get("scan_mode"))] += 1
        panel_pipeline_versions[str(pan.get("pipeline_version"))] += 1
        if (pan.get("cleaned_text") or "").strip():
            panel_with_cleaned_text += 1
        if pan.get("lemmas"):
            panel_with_lemmas += 1
        vocs = pan.get("vocabulary") or []
        if vocs:
            panel_with_vocab += 1
            for v in vocs:
                vocab_items_total += 1
                freq = v.get("frequency")
                if freq is not None and freq > 1:
                    vocab_freq_gt1 += 1
                elif freq == 1:
                    vocab_freq_eq1 += 1
                if not v.get("lemma"):
                    vocab_missing_lemma += 1
                if not v.get("pos_tag"):
                    vocab_missing_pos += 1

    scan_pages = list(db.panel_scan_pages.find({}, batch_size=500))
    scan_hash_matches = 0
    scan_hash_mismatches = 0
    scan_missing_chapter_page = 0
    scan_pipeline_versions = Counter()
    for sp in scan_pages:
        scan_pipeline_versions[str(sp.get("pipeline_version"))] += 1
        key = (str(sp.get("chapter_id")), int(sp.get("page_number", 0)))
        if key not in page_keys_seen:
            scan_missing_chapter_page += 1
        else:
            hashes = page_hash_by_ch_page.get(key)
            if hashes and sp.get("page_hash"):
                if str(sp["page_hash"]) in hashes:
                    scan_hash_matches += 1
                else:
                    scan_hash_mismatches += 1

    semantics["ocr"] = {
        "manga_panels_total": len(panels),
        "distinct_manga_id": len({str(p.get("manga_id")) for p in panels}),
        "distinct_chapter_id": len({str(p.get("chapter_id")) for p in panels}),
        "language_dist": dict(panel_langs),
        "scan_mode_dist": dict(panel_modes),
        "pipeline_version_dist": dict(panel_pipeline_versions),
        "panels_with_cleaned_text": panel_with_cleaned_text,
        "panels_with_lemmas": panel_with_lemmas,
        "panels_with_vocabulary": panel_with_vocab,
        "vocab_items_total": vocab_items_total,
        "vocab_freq_gt1": vocab_freq_gt1,
        "vocab_freq_eq1": vocab_freq_eq1,
        "vocab_missing_lemma": vocab_missing_lemma,
        "vocab_missing_pos_tag": vocab_missing_pos,
        "panel_scan_pages_total": len(scan_pages),
        "scan_pages_pipeline_version_dist": dict(scan_pipeline_versions),
        "scan_pages_hash_matches": scan_hash_matches,
        "scan_pages_hash_mismatches": scan_hash_mismatches,
        "scan_pages_missing_in_chapters": scan_missing_chapter_page,
        "vision_page_analyses_total": db.vision_page_analyses.count_documents({}),
        "vision_regions_total": db.vision_regions.count_documents({}),
    }

    # 6. Audit logs & Reading progress
    audits = list(db.audit_logs.find({}, batch_size=500))
    audit_entity_types = Counter()
    audit_actions = Counter()
    audit_fields = Counter()
    audit_timestamps = []
    manga_status_audit_ids = set()
    latest_audit_status: dict[str, tuple[datetime, str]] = {}

    for a in audits:
        et = str(a.get("entity_type"))
        act = str(a.get("action"))
        fld = str(a.get("field"))
        audit_entity_types[et] += 1
        audit_actions[act] += 1
        audit_fields[fld] += 1
        ts = a.get("timestamp")
        if isinstance(ts, datetime):
            audit_timestamps.append(ts)
            if et == "manga" and act == "update_status" and fld == "read_status":
                eid = str(a.get("entity_id"))
                manga_status_audit_ids.add(eid)
                prev = latest_audit_status.get(eid)
                if prev is None or ts > prev[0]:
                    latest_audit_status[eid] = (ts, str(a.get("new_value")))

    status_conflicts = 0
    for m in mangas:
        mid = str(m["_id"])
        if mid in latest_audit_status:
            audit_val = latest_audit_status[mid][1].lower()
            if audit_val.startswith("readstatus."):
                audit_val = audit_val.split(".", 1)[1]
            cur_val = str(m.get("read_status") or "").lower()
            if audit_val != cur_val:
                status_conflicts += 1

    prog_docs = list(db.reading_progress.find({}, batch_size=200))
    semantics["audit_and_progress"] = {
        "audit_logs_total": len(audits),
        "entity_type_dist": dict(audit_entity_types),
        "action_dist": dict(audit_actions),
        "field_dist": dict(audit_fields),
        "timestamp_min": _to_iso(min(audit_timestamps)) if audit_timestamps else None,
        "timestamp_max": _to_iso(max(audit_timestamps)) if audit_timestamps else None,
        "mangas_with_status_audit": len(manga_status_audit_ids),
        "status_audit_coverage_rate": round(len(manga_status_audit_ids) / len(mangas), 4) if mangas else 0.0,
        "latest_audit_vs_current_status_conflicts": status_conflicts,
        "reading_progress_total": len(prog_docs),
        "reading_progress_distinct_manga": len({str(p.get("manga_id")) for p in prog_docs}),
    }

    # 7. Creator Tierlists
    tierlists = list(db.creator_tierlists.find({}, batch_size=200))
    tl_revisions = [t.get("revision") for t in tierlists if t.get("revision") is not None]
    tl_total_items = 0
    tl_orphan_items = 0
    for tl in tierlists:
        for row in tl.get("tiers") or []:
            for item in row.get("items") or []:
                tl_total_items += 1
                if str(item.get("manga_id")) not in manga_ids:
                    tl_orphan_items += 1

    semantics["creator_tierlists"] = {
        "total": len(tierlists),
        "revisions": sorted(set(tl_revisions)),
        "total_ranked_items": tl_total_items,
        "orphan_manga_items": tl_orphan_items,
    }

    # 8. Pool DB summary
    pool_counts = {}
    for col_name in POOL_COLLECTIONS:
        if col_name in pool_db.list_collection_names():
            pool_counts[col_name] = pool_db[col_name].count_documents({})
        else:
            pool_counts[col_name] = 0
    semantics["pool_db"] = pool_counts

    return semantics


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    env_path = REPO_ROOT / "backend" / ".env"
    env_vals = dotenv_values(env_path) if env_path.exists() else {}

    uri = (
        os.environ.get("ANALYTICS_MONGODB_URI")
        or os.environ.get("MONGODB_URI")
        or env_vals.get("MONGODB_URI")
        or "mongodb://localhost:27017"
    )
    db_name = os.environ.get("DATABASE_NAME") or env_vals.get("DATABASE_NAME") or "manga_library"
    pool_db_name = os.environ.get("POOL_DATABASE_NAME") or env_vals.get("POOL_DATABASE_NAME") or "manga_datalake_pool"

    client = MongoClient(uri, read_preference=ReadPreference.PRIMARY, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
        db = client[db_name]
        pool_db = client[pool_db_name]

        primary_present = sorted(db.list_collection_names())
        pool_present = sorted(pool_db.list_collection_names())

        collection_profiles = {}
        for col_name in PRIMARY_COLLECTIONS:
            if col_name in primary_present:
                cnt = db[col_name].count_documents({})
                collection_profiles[col_name] = {
                    "database": "primary",
                    "present": True,
                    **profile_collection_schema(db[col_name], cnt),
                }
            else:
                collection_profiles[col_name] = {"database": "primary", "present": False, "document_count": 0}

        for col_name in POOL_COLLECTIONS:
            if col_name in pool_present:
                cnt = pool_db[col_name].count_documents({})
                collection_profiles[col_name] = {
                    "database": "pool",
                    "present": True,
                    **profile_collection_schema(pool_db[col_name], cnt),
                }
            else:
                collection_profiles[col_name] = {"database": "pool", "present": False, "document_count": 0}

        semantics = run_semantic_checks(db, pool_db)

        report = {
            "profiled_at": datetime.now(UTC).isoformat(),
            "primary_database_name": db_name,
            "pool_database_name": pool_db_name,
            "primary_collections_present": primary_present,
            "pool_collections_present": pool_present,
            "collection_profiles": collection_profiles,
            "semantics": semantics,
        }

        out_path = OUTPUT_DIR / "phase0_profile.json"
        out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Wrote redacted Phase 0 profile to {out_path}")
        print(json.dumps(semantics, indent=2, ensure_ascii=False))
    finally:
        client.close()


if __name__ == "__main__":
    main()
