from unittest.mock import AsyncMock, patch

import pytest
from bson import ObjectId

from backend.services.chapter_lifecycle_service import chapter_lifecycle_service
from backend.services.chapter_service import chapter_service
from backend.services.content_deletion_service import DeletionStorageError


@pytest.mark.anyio
async def test_deletion_epoch_fencing_and_state():
    """
    LC-01: Verifies that deleting a chapter sets state to 'deleting' and increments lifecycle_epoch.
    """
    chapter_id = ObjectId("60c72b2f9b1d8b2bad000021")
    chapter_doc = {
        "_id": chapter_id,
        "manga_id": "manga_1",
        "chapter_number": "14",
        "state": "ready",
        "lifecycle_epoch": 1,
        "pages": [],
    }

    updates_performed = []

    class MockChaptersCol:
        async def find_one(self, query):
            if query.get("_id") == chapter_id:
                return dict(chapter_doc)
            return None

        async def update_one(self, query, update_spec):
            updates_performed.append(update_spec)
            if "$inc" in update_spec:
                chapter_doc["lifecycle_epoch"] += update_spec["$inc"].get("lifecycle_epoch", 0)
            if "$set" in update_spec:
                chapter_doc.update(update_spec["$set"])
            return type("Result", (), {"modified_count": 1})()

        async def delete_one(self, query):
            return type("Result", (), {"deleted_count": 1})()

    class MockSlotsCol:
        async def find_one(self, query):
            return None

        async def update_one(self, query, update_spec):
            return type("Result", (), {"modified_count": 1})()

    class MockReadingCol:
        async def update_many(self, query, update_spec):
            return type("Result", (), {"modified_count": 0})()

    class MockMangasCol:
        async def find_one(self, query):
            return {"_id": ObjectId(), "title": "Test Manga"}

    with (
        patch(
            "backend.services.chapter_service.get_db",
            return_value=type("MockDB", (), {"chapter_slots": MockSlotsCol()})(),
        ),
        patch.object(chapter_service, "_get_chapters_col", return_value=MockChaptersCol()),
        patch.object(chapter_service, "_get_slots_col", return_value=MockSlotsCol()),
        patch.object(chapter_service, "_get_reading_col", return_value=MockReadingCol()),
        patch.object(chapter_service, "_get_mangas_col", return_value=MockMangasCol()),
        patch("backend.services.chapter_service.cancel_source_jobs", AsyncMock()),
        patch("backend.services.chapter_service.delete_chapter_dependencies", AsyncMock()),
        patch("backend.services.chapter_service.audit_service.log_event", AsyncMock()),
    ):
        success = await chapter_lifecycle_service.delete_chapter(str(chapter_id))
        assert success is True

        # Epoch was incremented from 1 to 2
        assert chapter_doc["lifecycle_epoch"] == 2
        # State was set to 'deleting' during the process
        assert any(u.get("$set", {}).get("state") == "deleting" for u in updates_performed)


@pytest.mark.anyio
async def test_deletion_reconciles_slot_preferred_pointer_with_alternative():
    """
    LC-02: Verifies that when the preferred chapter is deleted, the slot's preferred
    pointer is reassigned to an available alternative ready chapter in the same slot.
    """
    chapter_del_id = ObjectId("60c72b2f9b1d8b2bad000022")
    chapter_alt_id = ObjectId("60c72b2f9b1d8b2bad000023")
    slot_id = ObjectId("60c72b2f9b1d8b2bad000024")

    chapter_to_del = {
        "_id": chapter_del_id,
        "manga_id": "manga_1",
        "chapter_number": "14",
        "logical_chapter_id": str(slot_id),
        "state": "ready",
        "lifecycle_epoch": 1,
        "pages": [],
    }

    alternative_chapter = {
        "_id": chapter_alt_id,
        "manga_id": "manga_1",
        "chapter_number": "14",
        "logical_chapter_id": str(slot_id),
        "state": "ready",
        "lifecycle_epoch": 1,
    }

    slot_doc = {
        "_id": slot_id,
        "manga_id": "manga_1",
        "preferred_chapter_id": str(chapter_del_id),
    }

    slot_updates = []

    class MockChaptersCol:
        async def find_one(self, query):
            if query.get("_id") == chapter_del_id:
                return chapter_to_del
            if query.get("logical_chapter_id") == str(slot_id) and query.get("state") == "ready":
                return alternative_chapter
            return None

        async def update_one(self, query, update_spec):
            return type("Result", (), {"modified_count": 1})()

        async def delete_one(self, query):
            return type("Result", (), {"deleted_count": 1})()

    class MockSlotsCol:
        async def find_one(self, query):
            if query.get("_id") == slot_id:
                return slot_doc
            return None

        async def update_one(self, query, update_spec):
            slot_updates.append(update_spec)
            slot_doc.update(update_spec.get("$set", {}))
            return type("Result", (), {"modified_count": 1})()

    class MockReadingCol:
        async def update_many(self, query, update_spec):
            return type("Result", (), {"modified_count": 0})()

    class MockMangasCol:
        async def find_one(self, query):
            return {"_id": ObjectId(), "title": "Test Manga"}

    with (
        patch(
            "backend.services.chapter_service.get_db",
            return_value=type("MockDB", (), {"chapter_slots": MockSlotsCol()})(),
        ),
        patch.object(chapter_service, "_get_chapters_col", return_value=MockChaptersCol()),
        patch.object(chapter_service, "_get_slots_col", return_value=MockSlotsCol()),
        patch.object(chapter_service, "_get_reading_col", return_value=MockReadingCol()),
        patch.object(chapter_service, "_get_mangas_col", return_value=MockMangasCol()),
        patch("backend.services.chapter_service.cancel_source_jobs", AsyncMock()),
        patch("backend.services.chapter_service.delete_chapter_dependencies", AsyncMock()),
        patch("backend.services.chapter_service.audit_service.log_event", AsyncMock()),
    ):
        await chapter_lifecycle_service.delete_chapter(str(chapter_del_id))

        # Preferred pointer was safely switched to alternative_chapter
        assert slot_doc["preferred_chapter_id"] == str(chapter_alt_id)


@pytest.mark.anyio
async def test_deletion_storage_failure_marks_cleanup_failed_and_keeps_parent():
    """
    LC-03: Verifies that if MinIO reports a deletion failure,
    the chapter state becomes 'cleanup_failed', DeletionStorageError is raised,
    and the MongoDB chapter document is NOT deleted.
    """
    chapter_id = ObjectId("60c72b2f9b1d8b2bad000025")
    chapter_doc = {
        "_id": chapter_id,
        "manga_id": "manga_1",
        "chapter_number": "14",
        "state": "ready",
        "lifecycle_epoch": 1,
        "pages": [{"page_number": 1, "object_key": "chapters/manga_1/c1/0001.jpg"}],
    }

    deleted_docs = []

    class MockChaptersCol:
        async def find_one(self, query):
            if query.get("_id") == chapter_id:
                return chapter_doc
            return None

        async def update_one(self, query, update_spec):
            chapter_doc.update(update_spec.get("$set", {}))
            return type("Result", (), {"modified_count": 1})()

        async def delete_one(self, query):
            deleted_docs.append(query)
            return type("Result", (), {"deleted_count": 1})()

    class MockSlotsCol:
        async def find_one(self, query):
            return None

        async def update_one(self, query, update_spec):
            return type("Result", (), {"modified_count": 1})()

    class MockReadingCol:
        async def update_many(self, query, update_spec):
            return type("Result", (), {"modified_count": 0})()

    with (
        patch(
            "backend.services.chapter_service.get_db",
            return_value=type("MockDB", (), {"chapter_slots": MockSlotsCol()})(),
        ),
        patch.object(chapter_service, "_get_chapters_col", return_value=MockChaptersCol()),
        patch.object(chapter_service, "_get_slots_col", return_value=MockSlotsCol()),
        patch.object(chapter_service, "_get_reading_col", return_value=MockReadingCol()),
        patch("backend.services.chapter_service.cancel_source_jobs", AsyncMock()),
        patch("backend.services.chapter_service.source_object_is_shared", AsyncMock(return_value=False)),
        patch(
            "backend.services.minio_service.minio_service.delete_chapter_page", return_value=False
        ),  # Storage failure!
    ):
        with pytest.raises(DeletionStorageError):
            await chapter_lifecycle_service.delete_chapter(str(chapter_id))

        # Chapter was marked 'cleanup_failed'
        assert chapter_doc["state"] == "cleanup_failed"
        # The chapter doc was NOT deleted from MongoDB
        assert len(deleted_docs) == 0
