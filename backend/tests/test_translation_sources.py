"""TDD tests for page_uid stability, source identity, and translation domain schemas.

Step 1 (RED): Validating that page_uid is preserved across renumbering,
deletions, and backward-compatible with legacy documents.
"""

import uuid

import pytest

from backend.models.chapter import ChapterBase, PageItem
from backend.models.translation import (
    TranslationProfileCreate,
    compute_config_hash,
)
from backend.services.chapter_service import chapter_service


def test_legacy_page_item_without_uid_gets_backfilled_or_default():
    """Verify legacy dictionary without page_uid gets a valid page_uid on parse."""
    raw_page = {
        "page_number": 1,
        "filename": "001.jpg",
        "object_key": "pages/manga1/chap1/001.jpg",
        "file_size": 1024,
    }
    item = PageItem(**raw_page)
    assert item.page_uid is not None
    assert len(item.page_uid) > 10
    # Must be valid UUID format
    uuid_obj = uuid.UUID(item.page_uid)
    assert str(uuid_obj) == item.page_uid


def test_existing_page_uid_is_preserved_on_parse():
    """Verify existing page_uid is preserved exactly and not re-generated."""
    fixed_uid = str(uuid.uuid4())
    raw_page = {
        "page_uid": fixed_uid,
        "page_number": 2,
        "filename": "002.jpg",
        "object_key": "pages/manga1/chap1/002.jpg",
        "file_size": 2048,
    }
    item = PageItem(**raw_page)
    assert item.page_uid == fixed_uid


def test_chapter_base_has_pages_revision():
    """Verify ChapterBase exposes pages_revision defaulting to 1."""
    chap = ChapterBase(
        manga_id="manga123",
        chapter_number="1",
        chapter_numeric=1.0,
        pages=[
            PageItem(page_number=1, filename="01.png", object_key="key1", file_size=100),
            PageItem(page_number=2, filename="02.png", object_key="key2", file_size=200),
        ],
    )
    assert hasattr(chap, "pages_revision")
    assert chap.pages_revision == 1
    assert len(chap.pages) == 2
    assert chap.pages[0].page_uid != chap.pages[1].page_uid


def test_deterministic_config_hashing():
    """Verify canonical config hashing produces identical hash regardless of dict key order."""
    cfg_a = {
        "target_lang": "vi",
        "temperature": 0.2,
        "ocr": {"engine": "manga_ocr", "source_lang": "ja"},
        "detector": "default",
    }
    cfg_b = {
        "detector": "default",
        "ocr": {"source_lang": "ja", "engine": "manga_ocr"},
        "temperature": 0.2,
        "target_lang": "vi",
    }
    hash_a = compute_config_hash(cfg_a)
    hash_b = compute_config_hash(cfg_b)
    assert hash_a == hash_b
    assert len(hash_a) == 64  # SHA-256


def test_translation_profile_schema_validation():
    """Verify translation profile creation schema enforces validation."""
    profile_in = TranslationProfileCreate(
        name="Standard Vietnamese",
        target_language="vi",
        source_language="auto",
        effective_config={
            "provider": "gemini",
            "model": "gemini-2.5-flash",
            "temperature": 0.2,
        },
    )
    assert profile_in.name == "Standard Vietnamese"
    assert profile_in.target_language == "vi"
    assert profile_in.scope == "local"


@pytest.mark.anyio
async def test_delete_pages_preserves_page_uid_and_increments_revision(monkeypatch):
    """Verify delete_pages renumbers pages, strictly preserves page_uid, and increments pages_revision."""
    uid1 = str(uuid.uuid4())
    uid2 = str(uuid.uuid4())
    uid3 = str(uuid.uuid4())

    fake_chapter = {
        "_id": "507f1f77bcf86cd799439011",
        "manga_id": "manga_test",
        "chapter_number": "1",
        "pages_revision": 1,
        "pages": [
            {"page_uid": uid1, "page_number": 1, "filename": "001.jpg", "object_key": "pages/1/1/001.jpg"},
            {"page_uid": uid2, "page_number": 2, "filename": "002.jpg", "object_key": "pages/1/1/002.jpg"},
            {"page_uid": uid3, "page_number": 3, "filename": "003.jpg", "object_key": "pages/1/1/003.jpg"},
        ],
    }

    updated_doc = {}

    class MockCollection:
        async def find_one(self, filter_query):
            return dict(fake_chapter)

        async def update_one(self, filter_query, update_data):
            updated_doc.update(update_data)
            return True

    class MockReadingCollection:
        async def find_one(self, filter_query):
            return None

        async def update_one(self, filter_query, update_data):
            return True

    monkeypatch.setattr(chapter_service, "_get_chapters_col", lambda: MockCollection())
    monkeypatch.setattr(chapter_service, "_get_reading_col", lambda: MockReadingCollection())

    # Mock MinIO delete
    from backend.services.minio_service import minio_service

    monkeypatch.setattr(minio_service, "delete_chapter_page", lambda key: True)

    # Delete page 2
    res = await chapter_service.delete_pages("507f1f77bcf86cd799439011", [2])
    assert res["deleted_pages_count"] == 1
    assert res["remaining_pages_count"] == 2

    # Check update_one payload
    set_fields = updated_doc["$set"]
    inc_fields = updated_doc["$inc"]

    assert inc_fields["pages_revision"] == 1
    remaining_pages = set_fields["pages"]
    assert len(remaining_pages) == 2

    # Page 1 keeps uid1
    assert remaining_pages[0]["page_number"] == 1
    assert remaining_pages[0]["page_uid"] == uid1

    # Former Page 3 is renumbered to Page 2, but STAYS uid3!
    assert remaining_pages[1]["page_number"] == 2
    assert remaining_pages[1]["page_uid"] == uid3


@pytest.mark.anyio
async def test_create_or_update_chapter_preserves_page_uid_on_update(monkeypatch):
    """Verify create_or_update_chapter reuses existing page_uid when updating pages."""
    uid1 = str(uuid.uuid4())
    existing_chap = {
        "_id": "507f1f77bcf86cd799439011",
        "manga_id": "manga_1",
        "chapter_number": "1",
        "source_id": "md_123",
        "pages_revision": 2,
        "pages": [{"page_uid": uid1, "page_number": 1, "filename": "001.jpg"}],
    }

    updated_doc = {}

    class MockCollection:
        async def find_one(self, filter_query):
            return existing_chap

        async def update_one(self, filter_query, update_data):
            updated_doc.update(update_data)
            return True

    monkeypatch.setattr(chapter_service, "_get_chapters_col", lambda: MockCollection())

    # Update with new page 1 without page_uid
    res_id = await chapter_service.create_or_update_chapter(
        {
            "manga_id": "manga_1",
            "chapter_number": "1",
            "source_id": "md_123",
            "pages": [{"page_number": 1, "filename": "001_new.jpg"}],
        }
    )

    assert res_id == "507f1f77bcf86cd799439011"
    saved_pages = updated_doc["$set"]["pages"]
    assert len(saved_pages) == 1
    # uid1 must be preserved for page 1!
    assert saved_pages[0]["page_uid"] == uid1


@pytest.mark.anyio
async def test_migration_upgrade_and_downgrade(monkeypatch):
    """Verify migration up backfills missing page_uid and pages_revision idempotently."""
    from backend.database.migrations.m_20261005_add_page_uid_and_translation_schemas import downgrade, upgrade

    legacy_chap = {
        "_id": "ch_legacy_1",
        "manga_id": "manga_1",
        "pages": [
            {"page_number": 1, "filename": "001.jpg"},
            {"page_number": 2, "filename": "002.jpg"},
        ],
    }

    updated_docs = {}

    class MockCursor:
        def __init__(self, items):
            self.items = items

        def __aiter__(self):
            self._iter = iter(self.items)
            return self

        async def __anext__(self):
            try:
                return next(self._iter)
            except StopIteration:
                raise StopAsyncIteration

    class MockChaptersCol:
        def find(self, query):
            return MockCursor([dict(legacy_chap)])

        async def update_one(self, filter_query, update_data):
            updated_docs[filter_query["_id"]] = update_data
            return True

        async def update_many(self, filter_query, update_data):
            return True

    class MockDB:
        chapters = MockChaptersCol()

    async def mock_init():
        return None

    monkeypatch.setattr(
        "backend.database.migrations.m_20261005_add_page_uid_and_translation_schemas.get_db", lambda: MockDB()
    )
    monkeypatch.setattr(
        "backend.database.migrations.m_20261005_add_page_uid_and_translation_schemas.init_db_indexes", mock_init
    )

    count = await upgrade()
    assert count == 1
    doc_update = updated_docs["ch_legacy_1"]["$set"]
    assert doc_update["pages_revision"] == 1
    assert len(doc_update["pages"]) == 2
    assert "page_uid" in doc_update["pages"][0]
    assert "page_uid" in doc_update["pages"][1]
    assert doc_update["pages"][0]["page_uid"] != doc_update["pages"][1]["page_uid"]

    # Test downgrade runs without error
    await downgrade()
