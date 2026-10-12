"""Queue ownership and source validation regressions; all persistence is mocked."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.models.translation import TranslationJobCreate
from backend.services.translation import job_service


@pytest.mark.anyio
async def test_missing_queue_does_not_claim_dispatch_or_start_inline_worker(monkeypatch):
    worker = AsyncMock()
    monkeypatch.setattr("backend.core.redis.get_arq_pool", AsyncMock(return_value=None))
    monkeypatch.setattr("backend.tasks.translation.execute_translation_job_page", worker)
    assert await job_service.enqueue_page_task("job", "page") is False
    worker.assert_not_called()


@pytest.mark.anyio
@pytest.mark.parametrize(
    "source, status",
    [
        ({"page_numbers": [999]}, 422),
        ({"page_uids": ["foreign-page"]}, 422),
        ({"expected_pages_revision": 1}, 409),
        ({"manga_id": "foreign-manga"}, 422),
    ],
)
async def test_invalid_source_does_not_write_job(monkeypatch, source, status):
    db = MagicMock()
    db.chapters.find_one = AsyncMock(
        return_value={
            "_id": "chapter",
            "manga_id": "manga",
            "pages_revision": 2,
            "pages": [{"page_uid": "page", "page_number": 1}],
        }
    )
    db.translation_jobs.insert_one = AsyncMock()
    db.translation_job_pages.insert_many = AsyncMock()
    monkeypatch.setattr(job_service, "get_db", lambda: db)
    monkeypatch.setattr(job_service, "require_translation_engine", lambda: None)
    monkeypatch.setattr(job_service, "enqueue_page_task", AsyncMock(return_value=True))
    req = TranslationJobCreate(source={"kind": "chapter_pages", "chapter_id": "chapter", **source})
    with pytest.raises(HTTPException) as error:
        await job_service.translation_job_service.create_job(req)
    assert error.value.status_code == status
    db.translation_jobs.insert_one.assert_not_called()


@pytest.mark.anyio
async def test_retry_clears_cancel_before_dispatch_and_skips_lost_cas(monkeypatch):
    job = {"job_id": "job", "cancel_requested": True}
    db = MagicMock()
    db.translation_jobs.find_one = AsyncMock(return_value=job)

    async def update_job(query, update):
        job.update(update.get("$set", {}))
        return SimpleNamespace(matched_count=1)

    db.translation_jobs.update_one = AsyncMock(side_effect=update_job)
    db.translation_job_pages.find.return_value.to_list = AsyncMock(
        return_value=[
            {"page_identity": "won", "attempt": 2, "state": "failed"},
            {"page_identity": "lost", "attempt": 2, "state": "failed"},
        ]
    )
    db.translation_job_pages.update_one = AsyncMock(
        side_effect=[
            SimpleNamespace(matched_count=1),
            SimpleNamespace(matched_count=0),
        ]
    )

    async def dispatch(*args, **kwargs):
        assert job["cancel_requested"] is False
        return True

    enqueue = AsyncMock(side_effect=dispatch)
    monkeypatch.setattr(job_service, "get_db", lambda: db)
    monkeypatch.setattr(job_service, "require_translation_engine", lambda: None)
    monkeypatch.setattr(job_service, "enqueue_page_task", enqueue)
    result = await job_service.translation_job_service.retry_job("job")
    assert result["retried_count"] == 1
    enqueue.assert_awaited_once_with("job", "won", attempt=3)
    query = db.translation_job_pages.update_one.call_args_list[0].args[0]
    assert query["attempt"] == 2 and query["state"] == "failed"


@pytest.mark.anyio
async def test_mixed_success_is_partial():
    from backend.tasks.translation import _update_parent_job_progress

    collection = MagicMock()
    collection.update_one = AsyncMock()
    collection.find_one = AsyncMock(return_value={"total_pages": 2, "completed_pages": 1, "failed_pages": 1})
    await _update_parent_job_progress(collection, "job", success=False)
    assert collection.update_one.call_args.args[1]["$set"]["state"] == "partial"
