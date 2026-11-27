"""Phase 5 Synthetic End-to-End Pipeline & Rollback Tests (Offline, No MongoDB Required)."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from analytics.scripts.extract_bronze import extract_collection_to_parquet
from analytics.scripts.run_pipeline import rollback_release, run_pipeline, validate_published_release
from analytics.tests.test_phase1_bronze import ReadOnlyGuardCollection
from bson import ObjectId


def _seed_synthetic_bronze(home: Path, snap_date: date) -> None:
    bronze_root = home / "lake" / "bronze"
    m1_id = ObjectId()
    m2_id = ObjectId()
    t1_id = ObjectId()
    t2_id = ObjectId()
    c1_id = "11111111-1111-1111-1111-111111111111"
    ch1_id = ObjectId()
    slot1_id = ObjectId()
    rev1_id = ObjectId()

    now = datetime(2026, 11, 1, 10, 0, 0, tzinfo=UTC)
    older = datetime(2026, 5, 25, 10, 0, 0, tzinfo=UTC)

    synthetic_docs = {
        "mangas": [
            {
                "_id": m1_id,
                "title": "Synthetic Manga Alpha",
                "read_status": "completed",
                "status": "completed",
                "content_rating": "safe",
                "publication_demographic": "seinen",
                "original_language": "ja",
                "year": "2020",
                "personal_rating": 9.0,
                "chapters": 40,
                "volumes": 4,
                "tag_ids": [str(t1_id), str(t2_id)],
                "creators": [{"creator_id": c1_id, "name": "Creator A", "role": "author", "slug": "creator-a"}],
                "tracker_metadata": {
                    "mal": {"score": 8.4},
                    "anilist": {"mean_score": 82},
                    "fetched_at": now.isoformat(),
                },
                "added_at": older,
                "updated_at": now,
                "completed_at": now,
            },
            {
                "_id": m2_id,
                "title": "Synthetic Manga Beta",
                "read_status": "unread",
                "status": "ongoing",
                "content_rating": "safe",
                "publication_demographic": "shounen",
                "original_language": "ja",
                "year": "2024",
                "personal_rating": None,
                "chapters": 120,
                "volumes": 12,
                "tag_ids": [str(t1_id)],
                "creators": [{"creator_id": c1_id, "name": "Creator A", "role": "artist", "slug": "creator-a"}],
                "added_at": now,
                "updated_at": now,
            },
        ],
        "reviews": [
            {
                "_id": rev1_id,
                "manga_id": str(m1_id),
                "title": "Synthetic Review",
                "is_deleted": False,
                "created_at": now,
                "updated_at": now,
                "content_json": {
                    "type": "doc",
                    "content": [
                        {"type": "paragraph", "content": [{"type": "text", "text": "Great art and solid plot pacing."}]}
                    ],
                },
            }
        ],
        "tags": [
            {
                "_id": t1_id,
                "name": {"en": "Action", "vi": "Hành động"},
                "group": "genre",
                "source": "mangadex",
                "created_at": older,
                "updated_at": now,
            },
            {
                "_id": t2_id,
                "name": {"en": "Drama", "vi": "Chính kịch"},
                "group": "genre",
                "source": "mangadex",
                "created_at": older,
                "updated_at": now,
            },
        ],
        "creators": [
            {
                "_id": ObjectId(),
                "creator_id": c1_id,
                "name": "Creator A",
                "slug": "creator-a",
                "mangadex_id": c1_id,
                "created_at": older,
                "updated_at": now,
            },
        ],
        "chapters": [
            {
                "_id": ch1_id,
                "manga_id": str(m1_id),
                "logical_chapter_id": str(slot1_id),
                "chapter_number": "1",
                "chapter_numeric": 1.0,
                "language": "en",
                "source": "mangadex",
                "state": "ready",
                "page_count": 1,
                "pages_revision": 1,
                "pages": [
                    {
                        "page_uid": "p-uid-1",
                        "page_number": 1,
                        "md5_hash": "abc123",
                        "file_size": 1000,
                        "width": 800,
                        "height": 1200,
                    }
                ],
                "created_at": now,
                "updated_at": now,
            }
        ],
        "chapter_slots": [
            {
                "_id": slot1_id,
                "manga_id": str(m1_id),
                "language": "en",
                "unit_kind": "chapter",
                "numbering_scope_id": "scope_default",
                "chapter_key": "1",
                "chapter_display": "1",
                "preferred_chapter_id": str(ch1_id),
                "mapping_state": "verified",
                "is_excluded": False,
                "created_at": now,
                "updated_at": now,
            }
        ],
        "external_reviews": [
            {
                "_id": ObjectId(),
                "manga_id": str(m1_id),
                "source": "myanimelist",
                "source_work_id": "999",
                "source_review_id": "r-1",
                "overall_rating": 8,
                "recommendation_status": "recommended",
                "is_preliminary": False,
                "is_spoiler": False,
                "word_count": 100,
                "character_count": 550,
                "reactions": {"total": 5},
                "posted_at": now,
                "fetched_at": now,
                "updated_at": now,
            }
        ],
        "manga_panels": [
            {
                "_id": ObjectId(),
                "manga_id": str(m1_id),
                "chapter_id": str(ch1_id),
                "chapter_number": "1",
                "page_number": 1,
                "panel_index": 0,
                "language": "en",
                "scan_mode": "panel",
                "scan_generation": "gen1",
                "cleaned_text": "Hello world",
                "lemmas": ["hello", "world"],
                "vocabulary": [{"term": "Hello", "lemma": "hello", "pos_tag": "INTJ", "frequency": 1}],
                "created_at": now,
            }
        ],
        "panel_scan_pages": [
            {
                "_id": ObjectId(),
                "manga_id": str(m1_id),
                "chapter_id": str(ch1_id),
                "page_number": 1,
                "page_hash": "abc123",
                "pipeline_version": 2,
                "scanned_at": now,
            }
        ],
        "audit_logs": [
            {
                "_id": ObjectId(),
                "entity_type": "manga",
                "entity_id": str(m1_id),
                "action": "update_status",
                "field": "read_status",
                "old_value": "unread",
                "new_value": "completed",
                "actor": "user",
                "timestamp": now,
            }
        ],
        "reading_progress": [
            {
                "_id": ObjectId(),
                "manga_id": str(m1_id),
                "last_read_chapter_id": str(ch1_id),
                "last_read_chapter_number": "1",
                "last_read_language": "en",
                "last_read_page": 1,
                "read_chapter_ids": [str(ch1_id)],
                "reading_mode": "long_strip",
                "fit_mode": "width",
                "updated_at": now,
            }
        ],
        "creator_tierlists": [
            {
                "_id": ObjectId(),
                "creator_name": "Creator A",
                "creator_name_normalized": "creator a",
                "title": "Top Works",
                "category_tag": "General",
                "is_default": True,
                "revision": 1,
                "tiers": [
                    {"row_id": "tier-s", "label": "S", "color_key": "crimson", "items": [{"manga_id": str(m1_id)}]}
                ],
                "created_at": now,
                "updated_at": now,
            }
        ],
    }

    for entity_name, docs in synthetic_docs.items():
        extract_collection_to_parquet(
            ReadOnlyGuardCollection(docs),
            entity_name=entity_name,
            database_alias="primary",
            collection_name=entity_name,
            entity_cfg={"primary_key": "_id"},
            bronze_root=bronze_root,
            snapshot_date=snap_date,
            batch_id="syn-batch",
            batch_size=100,
        )


def test_synthetic_end_to_end_pipeline_failure_safety_and_rollback(tmp_path: Path) -> None:
    home = tmp_path / "analytics_home"
    snap_date = date(2026, 11, 28)
    _seed_synthetic_bronze(home, snap_date)

    # Publish Release 1 from synthetic Bronze
    res1 = run_pipeline(
        analytics_home=home,
        skip_extract=True,
        existing_snapshot="2026-11-28",
        release_id_override="rel-syn-1",
    )
    assert res1["status"] == "success"
    assert res1["datasets_published"] == 9
    assert validate_published_release(home, "rel-syn-1")["status"] == "valid"

    pointer = json.loads((home / "releases" / "current_release.json").read_text(encoding="utf-8"))
    assert pointer["release_id"] == "rel-syn-1"

    # Simulated failed refresh (missing snapshot date) must leave rel-syn-1 active!
    with pytest.raises(FileNotFoundError):
        run_pipeline(
            analytics_home=home,
            skip_extract=True,
            existing_snapshot="2099-01-01",
            release_id_override="rel-syn-fail",
        )
    pointer_after_fail = json.loads((home / "releases" / "current_release.json").read_text(encoding="utf-8"))
    assert pointer_after_fail["release_id"] == "rel-syn-1"

    # Publish Release 2, then rollback to Release 1
    res2 = run_pipeline(
        analytics_home=home,
        skip_extract=True,
        existing_snapshot="2026-11-28",
        release_id_override="rel-syn-2",
    )
    assert res2["status"] == "success"
    assert (
        json.loads((home / "releases" / "current_release.json").read_text(encoding="utf-8"))["release_id"]
        == "rel-syn-2"
    )

    rb = rollback_release(home, "rel-syn-1")
    assert rb["release_id"] == "rel-syn-1"
    assert rb["rollback"] is True
    assert (
        json.loads((home / "releases" / "current_release.json").read_text(encoding="utf-8"))["release_id"]
        == "rel-syn-1"
    )
