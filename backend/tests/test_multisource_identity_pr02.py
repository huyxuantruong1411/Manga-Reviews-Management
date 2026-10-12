from unittest.mock import AsyncMock, patch

import pytest
from bson import ObjectId

from backend.models.datasource import IdentityConflictError
from backend.services.chapter_service import ChapterService
from backend.services.chapter_slot_service import ChapterSlotService
from backend.services.source_binding_service import SourceBindingService


@pytest.mark.anyio
async def test_same_external_id_different_sources_creates_distinct_chapters():
    """
    ID-01: Verifies that external ID '123' from MangaDex and '123' from MangaFire
    are treated as two completely distinct chapters and do not overwrite each other.
    """
    service = ChapterService()
    docs_in_db = []

    class MockCollection:
        async def find_one(self, query):
            for doc in docs_in_db:
                # Query must match source AND source_id
                if (
                    doc.get("manga_id") == query.get("manga_id")
                    and doc.get("source") == query.get("source")
                    and doc.get("source_id") == query.get("source_id")
                ):
                    return doc
            return None

        async def insert_one(self, doc):
            new_doc = dict(doc)
            new_doc["_id"] = ObjectId()
            docs_in_db.append(new_doc)
            return type("Result", (), {"inserted_id": new_doc["_id"]})()

        async def update_one(self, query, update_spec):
            for doc in docs_in_db:
                if doc["_id"] == query["_id"]:
                    doc.update(update_spec.get("$set", {}))
                    return True
            return False

    mock_col = MockCollection()

    with (
        patch.object(service, "_get_chapters_col", return_value=mock_col),
        patch("backend.services.chapter_slot_service.chapter_slot_service.bind_chapter_to_slot", AsyncMock()),
    ):
        # 1. Insert MangaDex chapter with source_id="123"
        id1 = await service.create_or_update_chapter(
            {
                "manga_id": "manga_1",
                "source": "mangadex",
                "source_id": "123",
                "chapter_number": "1",
                "title": "MangaDex Ch 1",
            }
        )

        # 2. Insert MangaFire chapter with identical source_id="123"
        id2 = await service.create_or_update_chapter(
            {
                "manga_id": "manga_1",
                "source": "mangafire",
                "source_id": "123",
                "chapter_number": "1",
                "title": "MangaFire Ch 1",
            }
        )

        # Must result in two distinct chapter documents!
        assert id1 != id2
        assert len(docs_in_db) == 2
        assert docs_in_db[0]["source"] == "mangadex"
        assert docs_in_db[1]["source"] == "mangafire"
        assert docs_in_db[0]["source_id"] == docs_in_db[1]["source_id"] == "123"


@pytest.mark.anyio
async def test_candidate_normalization_and_slot_grouping():
    """
    ID-03: Tests that '14', '014', '14.0' map to the same slot,
    while '14.1' and '14a' create separate slots.
    """
    service = ChapterSlotService()
    slots_in_db = []

    class MockSlotsCol:
        async def find_one(self, query):
            for s in slots_in_db:
                if (
                    s["manga_id"] == query["manga_id"]
                    and s["language"] == query["language"]
                    and s["chapter_key"] == query["chapter_key"]
                ):
                    return s
            return None

        async def insert_one(self, doc):
            new_doc = dict(doc)
            new_doc["_id"] = ObjectId()
            slots_in_db.append(new_doc)
            return type("Result", (), {"inserted_id": new_doc["_id"]})()

    mock_col = MockSlotsCol()

    with patch.object(service, "_get_slots_col", return_value=mock_col):
        s1 = await service.get_or_create_slot("manga_1", "14")
        s2 = await service.get_or_create_slot("manga_1", "014")
        s3 = await service.get_or_create_slot("manga_1", "14.0")

        # '14', '014', '14.0' must resolve to the exact same slot document
        assert s1["_id"] == s2["_id"] == s3["_id"]
        assert len(slots_in_db) == 1

        # '14.1' must create a separate slot
        s_decimal = await service.get_or_create_slot("manga_1", "14.1")
        assert s_decimal["_id"] != s1["_id"]
        assert len(slots_in_db) == 2

        # '14a' must create a separate slot
        s_special = await service.get_or_create_slot("manga_1", "14a")
        assert s_special["_id"] != s1["_id"]
        assert s_special["_id"] != s_decimal["_id"]
        assert len(slots_in_db) == 3


@pytest.mark.anyio
async def test_source_binding_conflict_prevention():
    """
    ID-06: Verifies that linking an already-bound source work to a different manga
    raises IdentityConflictError.
    """
    service = SourceBindingService()
    sources_in_db = [
        {
            "_id": ObjectId(),
            "manga_id": "manga_original",
            "source": "mangafire",
            "source_work_id": "oj8n8",
            "canonical_url": "https://mangafire.to/title/oj8n8",
        }
    ]

    class MockSourcesCol:
        async def find_one(self, query):
            for s in sources_in_db:
                if s["source"] == query["source"] and s["source_work_id"] == query["source_work_id"]:
                    return s
            return None

        async def update_one(self, query, update_spec):
            return True

        async def insert_one(self, doc):
            return type("Result", (), {"inserted_id": ObjectId()})()

    mock_col = MockSourcesCol()

    with patch.object(service, "_get_sources_col", return_value=mock_col):
        # 1. Linking same work to same manga succeeds (idempotent)
        res = await service.link_source_to_manga(
            manga_id="manga_original",
            source="mangafire",
            source_work_id="oj8n8",
            canonical_url="https://mangafire.to/title/oj8n8",
        )
        assert res is not None

        # 2. Linking same work to a DIFFERENT manga raises IdentityConflictError
        with pytest.raises(IdentityConflictError) as exc_info:
            await service.link_source_to_manga(
                manga_id="manga_different",
                source="mangafire",
                source_work_id="oj8n8",
                canonical_url="https://mangafire.to/title/oj8n8",
            )
        assert "already linked to manga 'manga_original'" in str(exc_info.value)


@pytest.mark.anyio
async def test_multisource_migration_up_and_down():
    from backend.database.migrations.m_20261012_multisource_chapters import downgrade, upgrade

    mangas = [{"_id": ObjectId(), "title": "Test Manga", "mangadex_id": "8627e210-25dc-4e9a-8531-142c917e4760"}]
    chapters = [
        {
            "_id": ObjectId(),
            "manga_id": str(mangas[0]["_id"]),
            "chapter_number": "1",
            "source_id": "md-1",
            "language": "en",
        }
    ]
    manga_sources = []
    chapter_slots = []

    class MockCursor:
        def __init__(self, data):
            self.data = list(data)
            self.idx = 0

        def __aiter__(self):
            return self

        async def __anext__(self):
            if self.idx < len(self.data):
                item = self.data[self.idx]
                self.idx += 1
                return item
            raise StopAsyncIteration

    class MockDB:
        def __init__(self):
            self.mangas = AsyncMock()
            self.mangas.find = lambda q: MockCursor(mangas)

            self.chapters = AsyncMock()
            self.chapters.find = lambda q: MockCursor(chapters)
            self.chapters.update_one = AsyncMock(side_effect=lambda q, u: chapters[0].update(u.get("$set", {})))
            self.chapters.update_many = AsyncMock()

            self.manga_sources = AsyncMock()
            self.manga_sources.find_one = AsyncMock(return_value=None)
            self.manga_sources.insert_one = AsyncMock(side_effect=lambda doc: manga_sources.append(doc))
            self.manga_sources.delete_many = AsyncMock()

            self.chapter_slots = AsyncMock()
            self.chapter_slots.find_one = AsyncMock(return_value=None)
            self.chapter_slots.insert_one = AsyncMock(
                side_effect=lambda doc: (
                    doc.update({"_id": ObjectId()}),
                    chapter_slots.append(doc),
                    type("Result", (), {"inserted_id": doc["_id"]})(),
                )[2]
            )
            self.chapter_slots.delete_many = AsyncMock()

    mock_db = MockDB()

    with (
        patch("backend.database.migrations.m_20261012_multisource_chapters.get_db", return_value=mock_db),
        patch("backend.database.migrations.m_20261012_multisource_chapters.init_db_indexes", AsyncMock()),
    ):
        report = await upgrade()
        assert report["manga_sources_created"] == 1
        assert report["slots_created"] == 1
        assert report["chapters_migrated"] == 1
        assert len(manga_sources) == 1
        assert manga_sources[0]["source_work_id"] == "8627e210-25dc-4e9a-8531-142c917e4760"

        # Verify chapter was updated with state='ready' and logical_chapter_id
        assert chapters[0].get("state") == "ready"
        assert chapters[0].get("logical_chapter_id") is not None

        # Test downgrade
        await downgrade()
        mock_db.chapter_slots.delete_many.assert_awaited_once_with({})
