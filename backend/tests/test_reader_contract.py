"""Tests for the Manga Reader Data Contract v2 (Data Lake Pool -> downstream reader system)."""

import json
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.testclient import TestClient

from backend.models.reader_contract import ReaderPackage
from backend.services.datalake_pool_service import DatalakePoolService
from backend.services.reader_contract_service import (
    READER_CONTRACT_VERSION,
    build_reader_contract_template,
    build_reader_package,
    normalize_content_rating,
    normalize_demographic,
    normalize_status,
)

FORBIDDEN_KEYS = {"_id", "included", "duplicate_of_page_number", "is_etl_ready", "pool_state", "color"}
# Presigned URLs expire, so media objects must never carry `url` (links legitimately do).
MEDIA_DEFS = ("ReaderMediaRef", "ReaderPage", "ReaderCoverArt")


def _collect_keys(node, acc):
    if isinstance(node, dict):
        for k, v in node.items():
            acc.add(k)
            _collect_keys(v, acc)
    elif isinstance(node, list):
        for item in node:
            _collect_keys(item, acc)
    return acc


def _schema_property_names(schema):
    names = set()
    for definition in [schema, *schema.get("$defs", {}).values()]:
        names.update(definition.get("properties", {}).keys())
    return names


def _sample_pool_manga():
    now = datetime(2026, 10, 1, tzinfo=timezone.utc)
    return {
        "_id": "65f000000000000000000001",
        "pool_manga_id": "pm_abc123",
        "source_manga_id": "65e000000000000000000001",
        "mangadex_id": "a1c7c817-4e59-43b7-9365-09675a149a6f",
        "slug": "one-piece",
        "title": "One Piece",
        "alt_titles": ["Đảo Hải Tặc"],
        "description": "Epic pirate adventure",
        "author": "Oda Eiichiro",
        "artist": "Oda Eiichiro",
        "creators": [{"name": "Oda Eiichiro", "role": "author", "mangadex_id": "cr-1", "biography": {"en": "Mangaka"}}],
        "year": "1997",
        "status": "Publishing",
        "content_rating": None,
        "publication_demographic": "Shonen",
        "original_language": "JA",
        "volumes": 108,
        "chapters": None,
        "tags": [
            {
                "source_tag_id": "t1",
                "mangadex_id": "md-t1",
                "name": {"en": "Adventure", "vi": "Phiêu lưu"},
                "group": "genre",
                "color": "#FF5722",
            }
        ],
        "links": [{"title": "MangaDex", "url": "https://mangadex.org/title/x"}],
        "tracker_metadata": {"mal": {"score": 9.1}},
        "primary_cover": {"minio_bucket": "manga-library", "object_key": "covers/op.jpg", "url": "https://signed"},
        "cover_arts": [
            {"cover_id": "c1", "volume": "1", "object_key": "covers/op_v1.jpg", "url": "https://x", "included": True},
            {"cover_id": "c2", "volume": "2", "object_key": "covers/op_v2.jpg", "included": False},
        ],
        "pool_state": "published",
        "is_etl_ready": True,
        "stats": {"total_chapters": 99, "total_pages": 999, "total_size_bytes": 1, "available_languages": ["xx"]},
        "lineage": {
            "source_metadata_revision": 3,
            "pool_revision": 5,
            "manifest_sha256": "abc",
            "published_at": now,
            "updated_at": now,
            "has_upstream_changes": True,
        },
    }


def _sample_pool_chapters():
    return [
        {
            "_id": "65f000000000000000000010",
            "pool_chapter_id": "pch_2",
            "pool_manga_id": "pm_abc123",
            "source_manga_id": "65e000000000000000000001",
            "source_chapter_id": "65e000000000000000000020",
            "chapter_number": "2",
            "chapter_numeric": 2.0,
            "language": "EN",
            "pages": [
                {"page_uid": "u21", "page_number": 1, "filename": "001.jpg", "object_key": "k21", "file_size": 10},
            ],
            "included": True,
        },
        {
            "_id": "65f000000000000000000011",
            "pool_chapter_id": "pch_1",
            "pool_manga_id": "pm_abc123",
            "source_manga_id": "65e000000000000000000001",
            "source_chapter_id": "65e000000000000000000021",
            "chapter_number": "1",
            "chapter_numeric": 1.0,
            "volume": "1",
            "title": "Romance Dawn",
            "language": "en",
            "scanlation_group": "TCB",
            "uploader": "someone",
            "pages": [
                {
                    "page_uid": "u1",
                    "page_number": 1,
                    "filename": "001.jpg",
                    "object_key": "k1",
                    "file_size": 100,
                    "width": 800,
                    "height": 1200,
                    "content_type": "image/jpeg",
                    "url": "https://signed",
                },
                {
                    "page_uid": "u2",
                    "page_number": 2,
                    "filename": "002.jpg",
                    "object_key": "k2",
                    "file_size": 200,
                    "included": False,
                    "duplicate_of_page_number": 1,
                },
                {"page_uid": "u3", "page_number": 3, "filename": "003.jpg", "object_key": "k3", "file_size": 300},
            ],
            "included": True,
        },
        {
            "pool_chapter_id": "pch_hidden",
            "pool_manga_id": "pm_abc123",
            "source_manga_id": "65e000000000000000000001",
            "source_chapter_id": "65e000000000000000000022",
            "chapter_number": "3",
            "chapter_numeric": 3.0,
            "language": "en",
            "pages": [{"page_uid": "u31", "page_number": 1, "filename": "001.jpg", "object_key": "k31"}],
            "included": False,
        },
    ]


class TestEnumNormalization(unittest.TestCase):
    def test_status_aliases(self):
        self.assertEqual(normalize_status("Publishing"), "ongoing")
        self.assertEqual(normalize_status("ONGOING"), "ongoing")
        self.assertEqual(normalize_status("Finished"), "completed")
        self.assertEqual(normalize_status("on hiatus"), "hiatus")
        self.assertEqual(normalize_status("Discontinued"), "cancelled")
        self.assertEqual(normalize_status(None), "unknown")
        self.assertEqual(normalize_status("weird"), "unknown")

    def test_content_rating_defaults_to_unknown_not_safe(self):
        self.assertEqual(normalize_content_rating("Suggestive"), "suggestive")
        self.assertEqual(normalize_content_rating(None), "unknown")
        self.assertEqual(normalize_content_rating("???"), "unknown")

    def test_demographic_aliases(self):
        self.assertEqual(normalize_demographic("Shonen"), "shounen")
        self.assertEqual(normalize_demographic("shojo"), "shoujo")
        self.assertEqual(normalize_demographic("seinen"), "seinen")
        self.assertEqual(normalize_demographic(None), "unknown")


class TestReaderContractTemplate(unittest.TestCase):
    def test_template_is_draft_2020_12_schema_with_version(self):
        template = build_reader_contract_template()
        self.assertEqual(template["$schema"], "https://json-schema.org/draft/2020-12/schema")
        self.assertIn(READER_CONTRACT_VERSION, template["$id"])
        self.assertEqual(READER_CONTRACT_VERSION, "2.0")
        self.assertIn("manga", template["properties"])
        self.assertIn("chapters", template["properties"])
        # JSON serializable
        json.dumps(template)

    def test_template_is_strict_and_has_no_internal_fields(self):
        template = build_reader_contract_template()
        for name, definition in template.get("$defs", {}).items():
            if definition.get("type") == "object" and "properties" in definition:
                self.assertFalse(definition.get("additionalProperties", True), f"{name} must forbid extras")
        self.assertFalse(_schema_property_names(template) & FORBIDDEN_KEYS)
        for media_def in MEDIA_DEFS:
            self.assertNotIn("url", template["$defs"][media_def]["properties"])

    def test_template_example_validates_against_contract(self):
        template = build_reader_contract_template()
        examples = template.get("examples")
        self.assertTrue(examples)
        pkg = ReaderPackage.model_validate(examples[0])
        self.assertEqual(pkg.contract_version, "2.0")
        self.assertGreater(len(pkg.chapters[0].pages), 0)

    def test_enums_exposed_in_schema(self):
        template = build_reader_contract_template()
        dumped = json.dumps(template)
        for value in ("ongoing", "hiatus", "pornographic", "shounen", "josei"):
            self.assertIn(f'"{value}"', dumped)


class TestBuildReaderPackage(unittest.TestCase):
    def setUp(self):
        self.pkg = build_reader_package(_sample_pool_manga(), _sample_pool_chapters())
        self.dumped = self.pkg.model_dump(mode="json")

    def test_strips_internal_fields_everywhere(self):
        self.assertFalse(_collect_keys(self.dumped, set()) & FORBIDDEN_KEYS)
        manga = self.dumped["manga"]
        media_nodes = [manga["primary_cover"], *[c["media"] for c in manga["cover_arts"]]]
        for ch in self.dumped["chapters"]:
            for page in ch["pages"]:
                media_nodes.extend([page, page["media"]])
        for node in media_nodes:
            self.assertNotIn("url", node)

    def test_excluded_chapters_and_pages_are_dropped_and_renumbered(self):
        chapter_ids = [c["pool_chapter_id"] for c in self.dumped["chapters"]]
        self.assertEqual(chapter_ids, ["pch_1", "pch_2"])  # sorted by chapter_numeric, hidden dropped
        ch1 = self.dumped["chapters"][0]
        self.assertEqual([p["page_uid"] for p in ch1["pages"]], ["u1", "u3"])
        self.assertEqual([p["page_number"] for p in ch1["pages"]], [1, 2])
        self.assertEqual(ch1["page_count"], 2)
        self.assertEqual(ch1["total_size_bytes"], 400)

    def test_stats_recomputed_from_exported_content(self):
        stats = self.dumped["manga"]["stats"]
        self.assertEqual(stats["chapter_count"], 2)
        self.assertEqual(stats["page_count"], 3)
        self.assertEqual(stats["total_size_bytes"], 410)
        self.assertEqual(stats["languages"], ["en"])

    def test_manga_fields_normalized(self):
        m = self.dumped["manga"]
        self.assertEqual(m["status"], "ongoing")
        self.assertEqual(m["content_rating"], "unknown")
        self.assertEqual(m["publication_demographic"], "shounen")
        self.assertEqual(m["original_language"], "ja")
        self.assertEqual(m["year"], 1997)
        self.assertEqual(m["primary_cover"]["object_key"], "covers/op.jpg")
        self.assertEqual([c["cover_id"] for c in m["cover_arts"]], ["c1"])
        self.assertEqual(m["tags"][0]["name"]["vi"], "Phiêu lưu")
        roles = {(c["name"], c["role"]) for c in m["creators"]}
        self.assertEqual(roles, {("Oda Eiichiro", "author"), ("Oda Eiichiro", "artist")})
        for c in m["creators"]:
            self.assertTrue(c.get("creator_id"))
            self.assertEqual(c.get("slug"), "oda-eiichiro")
        self.assertEqual(m["lineage"]["pool_revision"], 5)

    def test_creators_preserve_homonyms_with_distinct_creator_ids(self):
        pool_manga = _sample_pool_manga()
        pool_manga["author"] = "Nakamura Moto"
        pool_manga["artist"] = "Nakamura Moto"
        pool_manga["creators"] = [
            {
                "creator_id": "7918d851-d77f-4ad6-9ec5-2c097320dc7e",
                "slug": "nakamura-moto",
                "name": "Nakamura Moto",
                "role": "author",
                "mangadex_id": "7918d851-d77f-4ad6-9ec5-2c097320dc7e",
                "biography": {"en": "Author Nakamura Moto #1"},
                "links": {"twitter": "https://twitter.com/nakamura_1"},
            },
            {
                "creator_id": "22222222-d77f-4ad6-9ec5-2c097320dc7e",
                "slug": "nakamura-moto",
                "name": "Nakamura Moto",
                "role": "author",
                "mangadex_id": "22222222-d77f-4ad6-9ec5-2c097320dc7e",
                "biography": {"en": "Author Nakamura Moto #2 (Homonym)"},
                "links": {"pixiv": "https://www.pixiv.net/users/222"},
            },
        ]
        pkg = build_reader_package(pool_manga, _sample_pool_chapters())
        authors = [c for c in pkg.manga.creators if c.role == "author"]
        self.assertEqual(len(authors), 2)
        self.assertEqual(
            {c.creator_id for c in authors},
            {
                "7918d851-d77f-4ad6-9ec5-2c097320dc7e",
                "22222222-d77f-4ad6-9ec5-2c097320dc7e",
            },
        )
        c1 = next(c for c in authors if c.creator_id == "7918d851-d77f-4ad6-9ec5-2c097320dc7e")
        self.assertEqual(c1.links.get("twitter"), "https://twitter.com/nakamura_1")
        self.assertEqual(c1.slug, "nakamura-moto")

    def test_package_round_trips_through_contract_model(self):
        ReaderPackage.model_validate(self.dumped)


class TestExportManifestUsesV2(unittest.IsolatedAsyncioTestCase):
    async def test_export_etl_package_manifest_returns_v2_contract(self):
        service = DatalakePoolService()
        pool_db = MagicMock()
        pool_db.pool_mangas.find_one = AsyncMock(return_value=_sample_pool_manga())
        cursor = MagicMock()
        cursor.sort = MagicMock(return_value=cursor)
        cursor.to_list = AsyncMock(return_value=_sample_pool_chapters())
        pool_db.pool_chapters.find = MagicMock(return_value=cursor)
        service._get_pool_db = MagicMock(return_value=pool_db)
        service._get_source_db = MagicMock(return_value=MagicMock())

        manifest = await service.export_etl_package_manifest("pm_abc123")

        self.assertEqual(manifest["contract_version"], "2.0")
        ReaderPackage.model_validate(manifest)
        self.assertEqual(len(manifest["chapters"]), 2)

    async def test_export_returns_none_when_missing(self):
        service = DatalakePoolService()
        pool_db = MagicMock()
        pool_db.pool_mangas.find_one = AsyncMock(return_value=None)
        service._get_pool_db = MagicMock(return_value=pool_db)
        self.assertIsNone(await service.export_etl_package_manifest("pm_missing"))


@pytest.fixture
def client():
    from backend.main import app

    return TestClient(app)


def test_contract_template_endpoint(client):
    resp = client.get("/api/datalake-pool/contract/template")
    assert resp.status_code == 200
    assert "attachment" in resp.headers.get("content-disposition", "")
    data = resp.json()
    assert data["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    ReaderPackage.model_validate(data["examples"][0])
