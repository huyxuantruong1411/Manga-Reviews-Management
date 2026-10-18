"""
Synthetic multi-source test fixtures for MangaDex and MangaFire.
Provides deterministic, synthetic data for testing identity isolation,
collision handling, pagination, candidate normalization, and manifest formats.
"""

from typing import Any, Dict, List

# 1. Collision Scenario: Identical external IDs across different providers
COLLISION_FIXTURES: Dict[str, Dict[str, Any]] = {
    "mangadex_release": {
        "source": "mangadex",
        "source_work_id": "work-uuid-aaa",
        "source_id": "123",  # Same ID
        "language": "en",
        "chapter_number": "1",
        "title": "MangaDex Release 123",
        "page_count": 20,
    },
    "mangafire_release": {
        "source": "mangafire",
        "source_work_id": "work-hid-bbb",
        "source_id": "123",  # Same ID
        "language": "en",
        "chapter_number": "1",
        "title": "MangaFire Release 123",
        "page_count": 25,
    },
    "comix_release": {
        "source": "comix",
        "source_work_id": "r9j5m",
        "source_id": "123",  # Same ID
        "language": "en",
        "chapter_number": "1",
        "title": "Comix Release 123",
        "page_count": 22,
    },
}

# 2. Same Chapter Number with Multiple Releases (e.g. MangaFire Romi Ch. 14)
SAME_CHAPTER_MULTIPLE_RELEASES_FIXTURE: List[Dict[str, Any]] = [
    {
        "id": 4618281,
        "number": 14,
        "name": "POCKET-SIZED SANADA",
        "language": "en",
        "type": "unofficial",
        "page_count": 6,
        "source": "mangafire",
    },
    {
        "id": 7694003,
        "number": 14,
        "name": "(1r0n)",
        "language": "en",
        "type": "official",
        "page_count": 6,
        "source": "mangafire",
    },
]

# 3. Candidate Normalization Test Cases
CANDIDATE_NORMALIZATION_CASES: List[Dict[str, Any]] = [
    {"raw": "14", "canonical": "14", "numeric": 14.0, "is_special": False},
    {"raw": "014", "canonical": "14", "numeric": 14.0, "is_special": False},
    {"raw": "14.0", "canonical": "14", "numeric": 14.0, "is_special": False},
    {"raw": "14.1", "canonical": "14.1", "numeric": 14.1, "is_special": False},
    {"raw": "14.2", "canonical": "14.2", "numeric": 14.2, "is_special": False},
    {"raw": "14a", "canonical": "14a", "numeric": 14.0, "is_special": True},
    {"raw": "14b", "canonical": "14b", "numeric": 14.0, "is_special": True},
    {"raw": "Oneshot", "canonical": "oneshot", "numeric": None, "is_special": True},
    {"raw": "", "canonical": "unclassified", "numeric": None, "is_special": True},
]


# 4. Multi-Page Synthetic Catalogue (62 releases across 31 chapter numbers)
def generate_synthetic_catalogue_pages(total_chapters: int = 31, releases_per_chapter: int = 2) -> List[Dict[str, Any]]:
    releases = []
    for c_num in range(1, total_chapters + 1):
        for r_idx in range(releases_per_chapter):
            rel_id = 10000 + c_num * 10 + r_idx
            rel_type = "official" if r_idx == 0 else "unofficial"
            releases.append(
                {
                    "id": rel_id,
                    "number": c_num,
                    "name": f"Chapter {c_num} ({rel_type})",
                    "language": "en",
                    "type": rel_type,
                    "page_count": 6 + (c_num % 5),
                }
            )
    return releases


# 5. Cross-Source Mismatch Fixture (Romi Chapter 14)
ROMI_MISMATCH_FIXTURE: Dict[str, Any] = {
    "mangafire": {
        "work_id": "oj8n8",
        "title": "Sheeply Horned Witch Romi",
        "chapter_number": "14",
        "release_id": "4618281",
        "chapter_title": "POCKET-SIZED SANADA",
        "pages_count": 6,
    },
    "mangadex": {
        "work_id": "8627e210-25dc-4e9a-8531-142c917e4760",
        "title": "Sheeply Horned Witch Romi",
        "chapter_number": "14",
        "release_id": "01f03090-5a4d-47c2-a96a-a780266efb75",
        "chapter_title": "Rewrites",
        "pages_count": 17,
    },
    "verification_status": "unverified_mapping",
    "should_auto_merge": False,
}

# 6. Synthetic Manifest v2 Fixture
SYNTHETIC_MANIFEST_V2: Dict[str, Any] = {
    "schema_version": 2,
    "manga_id": "manga_test_001",
    "chapter_id": "c_mf_14_a",
    "logical_chapter_id": "slot_14",
    "media_revision_id": "rev_uuid_test_14",
    "pages_revision": 1,
    "source": {
        "provider": "mangafire",
        "work_id": "oj8n8",
        "release_id": "4618281",
        "language": "en",
        "unit_kind": "chapter",
        "chapter_number_raw": "14",
        "numbering_scope_id": "scope_default",
    },
    "page_count": 6,
    "pages": [
        {
            "page_uid": f"uid_p_{i}",
            "page_number": i,
            "filename": f"{i:04d}.jpg",
            "object_key": f"chapters/manga_test_001/c_mf_14_a/revisions/rev_uuid_test_14/{i:04d}.jpg",
            "content_type": "image/jpeg",
            "file_size": 560000,
            "width": 1122,
            "height": 1600,
            "sha256": f"a{i}f" * 16,
        }
        for i in range(1, 7)
    ],
    "adapter_version": "1.0.0",
    "observed_at": "2026-10-12T16:00:00Z",
}

# 7. Comix (comix.to) Yajin Work Fixture
COMIX_YAJIN_FIXTURE: Dict[str, Any] = {
    "work_id": "r9j5m",
    "slug": "yajin",
    "canonical_url": "https://comix.to/title/r9j5m-yajin",
    "title": "Yajin",
    "alt_titles": ["野人", "Wild Man Yajin"],
    "author": "Author Yajin",
    "artist": "Artist Yajin",
    "description": "Story of Yajin surviving in harsh wilderness.",
    "status": "ongoing",
    "year": "2023",
    "genres": ["Action", "Adventure", "Drama", "Seinen"],
    "content_rating": "safe",
    "cover_url": "https://img.comix.to/covers/r9j5m.jpg",
    "available_languages": ["en"],
}

# 8. Comix Chapter Releases Fixture
COMIX_CHAPTER_RELEASES_FIXTURE: List[Dict[str, Any]] = [
    {
        "id": "cmx_rel_001",
        "work_id": "r9j5m",
        "chapter_number": "1",
        "title": "The Awakening",
        "volume": "1",
        "language": "en",
        "unit_kind": "chapter",
        "pages_count": 22,
        "group_name": "Comix Scan",
    },
    {
        "id": "cmx_rel_014",
        "work_id": "r9j5m",
        "chapter_number": "14",
        "title": "Wild Encounter",
        "volume": "2",
        "language": "en",
        "unit_kind": "chapter",
        "pages_count": 20,
        "group_name": "Comix Scan",
    },
]

# 9. Comix Manifest v2 Fixture
COMIX_MANIFEST_V2_FIXTURE: Dict[str, Any] = {
    "schema_version": 2,
    "manga_id": "manga_test_yajin",
    "chapter_id": "c_cmx_14",
    "logical_chapter_id": "slot_14",
    "media_revision_id": "rev_cmx_14_uuid",
    "pages_revision": 1,
    "source": {
        "provider": "comix",
        "work_id": "r9j5m",
        "release_id": "cmx_rel_014",
        "language": "en",
        "unit_kind": "chapter",
        "chapter_number_raw": "14",
        "numbering_scope_id": "scope_default",
    },
    "page_count": 4,
    "pages": [
        {
            "page_uid": f"uid_cmx_p_{i}",
            "page_number": i,
            "filename": f"{i:04d}.webp",
            "object_key": f"chapters/manga_test_yajin/c_cmx_14/revisions/rev_cmx_14_uuid/{i:04d}.webp",
            "content_type": "image/webp",
            "file_size": 320000,
            "width": 1100,
            "height": 1600,
            "sha256": f"c{i}a" * 16,
        }
        for i in range(1, 5)
    ],
    "adapter_version": "1.0.0",
    "observed_at": "2026-10-18T16:00:00Z",
}
