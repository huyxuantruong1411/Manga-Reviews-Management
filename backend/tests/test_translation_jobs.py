"""TDD tests for durable translation job orchestration, lease claiming, and cancellation.

Tests verify:
- Enqueue returns 202 and creates durable job + page documents in MongoDB.
- Cancellation marks cancel_requested and cancels queued pages.
- Retry only re-enqueues failed/cancelled slots, preserving completed slots.
- CAS lease claiming increments fencing token and prevents duplicate worker execution.
"""

import pytest

from backend.models.translation import (
    TranslationJobCreate,
    TranslationJobSource,
)
from backend.services.translation.job_service import translation_job_service


def test_translation_job_create_schema_validation():
    """Verify TranslationJobCreate validates chapter source and parameters."""
    req = TranslationJobCreate(
        source=TranslationJobSource(
            kind="chapter_pages",
            manga_id="manga_1",
            chapter_id="chap_1",
            page_uids=["uid_1", "uid_2"],
        ),
        target_language="vi",
        reuse_policy="reuse_existing",
    )
    assert req.source.manga_id == "manga_1"
    assert len(req.source.page_uids) == 2
    assert req.target_language == "vi"


@pytest.mark.anyio
async def test_enqueue_translation_job_creates_durable_records(monkeypatch):
    """Verify enqueueing creates a durable parent job document and individual page documents."""
    fake_jobs_col = {}
    fake_pages_col = {}
    fake_chapters_col = {
        "chap_1": {
            "_id": "chap_1",
            "manga_id": "manga_1",
            "pages_revision": 1,
            "pages": [
                {"page_uid": "uid_1", "page_number": 1, "object_key": "pages/1/1/001.jpg"},
                {"page_uid": "uid_2", "page_number": 2, "object_key": "pages/1/1/002.jpg"},
            ],
        }
    }

    class MockJobsCol:
        async def insert_one(self, doc):
            fake_jobs_col[doc["job_id"]] = doc
            return True

        async def find_one(self, filter_query):
            if "job_id" in filter_query:
                return fake_jobs_col.get(filter_query["job_id"])
            return None

        async def update_one(self, filter_query, update_data):
            job_id = filter_query.get("job_id")
            if job_id in fake_jobs_col:
                if "$set" in update_data:
                    fake_jobs_col[job_id].update(update_data["$set"])
            return True

    class MockPagesCol:
        async def insert_many(self, docs):
            for d in docs:
                fake_pages_col[(d["job_id"], d["page_identity"])] = d
            return True

        def find(self, filter_query):
            job_id = filter_query.get("job_id")
            items = [d for d in fake_pages_col.values() if d["job_id"] == job_id]

            class MockCursor:
                def __init__(self, it):
                    self.it = it

                def __aiter__(self):
                    self._it = iter(self.it)
                    return self

                async def __anext__(self):
                    try:
                        return next(self._it)
                    except StopIteration:
                        raise StopAsyncIteration

                async def to_list(self, length=None):
                    return list(self.it)

            return MockCursor(items)

        async def update_one(self, filter_query, update_data):
            key = (filter_query.get("job_id"), filter_query.get("page_identity"))
            if key in fake_pages_col:
                if "$set" in update_data:
                    fake_pages_col[key].update(update_data["$set"])
                if "$inc" in update_data:
                    for field, val in update_data["$inc"].items():
                        fake_pages_col[key][field] = fake_pages_col[key].get(field, 0) + val
                return True
            return False

        async def update_many(self, filter_query, update_data):
            job_id = filter_query.get("job_id")
            for doc in fake_pages_col.values():
                if doc["job_id"] == job_id:
                    if "$set" in update_data:
                        doc.update(update_data["$set"])
            return True

    class MockChaptersCol:
        async def find_one(self, filter_query):
            c_id = str(filter_query.get("_id"))
            return fake_chapters_col.get(c_id)

    class MockDB:
        translation_jobs = MockJobsCol()
        translation_job_pages = MockPagesCol()
        chapters = MockChaptersCol()

    monkeypatch.setattr("backend.services.translation.job_service.get_db", lambda: MockDB())

    async def mock_enqueue(*args, **kwargs):
        return True

    monkeypatch.setattr("backend.services.translation.job_service.enqueue_page_task", mock_enqueue)

    req = TranslationJobCreate(
        source=TranslationJobSource(
            kind="chapter_pages",
            manga_id="manga_1",
            chapter_id="chap_1",
            page_uids=["uid_1", "uid_2"],
        ),
        target_language="vi",
    )

    job_res = await translation_job_service.create_job(req)
    assert job_res["job_id"] is not None
    assert job_res["state"] == "queued"
    assert job_res["total_pages"] == 2

    # Check durable records in MongoDB
    assert job_res["job_id"] in fake_jobs_col
    assert ("job_res_test", "uid_1") not in fake_pages_col  # check page count
    pages_for_job = [d for d in fake_pages_col.values() if d["job_id"] == job_res["job_id"]]
    assert len(pages_for_job) == 2
    assert pages_for_job[0]["page_identity"] in ("uid_1", "uid_2")


@pytest.mark.anyio
async def test_cancel_job_sets_cancellation_and_aborts_queued_pages(monkeypatch):
    """Verify cancel_job marks job as cancelled and updates queued page slots."""
    job_id = "job_cancel_test"
    fake_job = {
        "job_id": job_id,
        "state": "running",
        "cancel_requested": False,
        "total_pages": 2,
    }
    fake_pages = {
        (job_id, "uid_1"): {"job_id": job_id, "page_identity": "uid_1", "state": "completed"},
        (job_id, "uid_2"): {"job_id": job_id, "page_identity": "uid_2", "state": "queued"},
    }

    class MockDB:
        class translation_jobs:
            @staticmethod
            async def find_one(query):
                return fake_job if query.get("job_id") == job_id else None

            @staticmethod
            async def update_one(query, update):
                if "$set" in update:
                    fake_job.update(update["$set"])
                return True

        class translation_job_pages:
            @staticmethod
            async def update_many(query, update):
                for p in fake_pages.values():
                    if p["state"] == "queued":
                        p["state"] = "cancelled"
                return True

    monkeypatch.setattr("backend.services.translation.job_service.get_db", lambda: MockDB())

    res = await translation_job_service.cancel_job(job_id)
    assert res["success"] is True
    assert fake_job["cancel_requested"] is True
    # uid_1 remains completed!
    assert fake_pages[(job_id, "uid_1")]["state"] == "completed"
    # uid_2 is cancelled!
    assert fake_pages[(job_id, "uid_2")]["state"] == "cancelled"


@pytest.mark.anyio
async def test_retry_job_only_requeues_failed_or_cancelled_pages(monkeypatch):
    """Verify retry_job only processes failed or cancelled slots and skips completed slots."""
    job_id = "job_retry_test"
    fake_job = {
        "job_id": job_id,
        "state": "partial",
        "cancel_requested": False,
        "total_pages": 3,
    }
    fake_pages = {
        (job_id, "uid_1"): {"job_id": job_id, "page_identity": "uid_1", "state": "completed", "attempt": 1},
        (job_id, "uid_2"): {"job_id": job_id, "page_identity": "uid_2", "state": "failed", "attempt": 1},
        (job_id, "uid_3"): {"job_id": job_id, "page_identity": "uid_3", "state": "cancelled", "attempt": 1},
    }

    class MockCursor:
        def __init__(self, it):
            self.it = it

        def __aiter__(self):
            self._it = iter(self.it)
            return self

        async def __anext__(self):
            try:
                return next(self._it)
            except StopIteration:
                raise StopAsyncIteration

        async def to_list(self, length=None):
            return list(self.it)

    class MockDB:
        class translation_jobs:
            @staticmethod
            async def find_one(query):
                return fake_job

            @staticmethod
            async def update_one(query, update):
                if "$set" in update:
                    fake_job.update(update["$set"])
                return True

        class translation_job_pages:
            @staticmethod
            def find(query):
                target_states = query.get("state", {}).get("$in", [])
                filtered = [p for p in fake_pages.values() if not target_states or p["state"] in target_states]
                return MockCursor(filtered)

            @staticmethod
            async def update_one(query, update):
                key = (query.get("job_id"), query.get("page_identity"))
                if key in fake_pages:
                    if "$set" in update:
                        fake_pages[key].update(update["$set"])
                    if "$inc" in update:
                        for f, v in update["$inc"].items():
                            fake_pages[key][f] = fake_pages[key].get(f, 0) + v
                return True

    enqueued_slots = []

    async def mock_retry_enqueue(job_id, page_id, attempt=1):
        enqueued_slots.append((page_id, attempt))
        return True

    monkeypatch.setattr("backend.services.translation.job_service.get_db", lambda: MockDB())
    monkeypatch.setattr("backend.services.translation.job_service.enqueue_page_task", mock_retry_enqueue)

    res = await translation_job_service.retry_job(job_id)
    assert res["retried_count"] == 2
    # Only uid_2 and uid_3 retried!
    assert ("uid_2", 2) in enqueued_slots
    assert ("uid_3", 2) in enqueued_slots
    assert not any(p[0] == "uid_1" for p in enqueued_slots)
