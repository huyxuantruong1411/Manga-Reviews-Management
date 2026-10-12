from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId
from fastapi import HTTPException

from backend.services import sync_manager_service as sync_module


@pytest.mark.anyio
async def test_unsupported_schedule_is_not_silently_saved(monkeypatch):
    db = MagicMock()
    db.sync_configs.insert_one = AsyncMock(return_value=MagicMock(inserted_id=ObjectId()))
    monkeypatch.setattr(sync_module, "get_db", lambda: db)
    with pytest.raises(HTTPException) as error:
        await sync_module.SyncManagerService().create_sync_pool(
            {"name": "Fixture", "schedule": {"type": "interval", "interval_hours": 1}}
        )
    assert error.value.status_code == 422
    db.sync_configs.insert_one.assert_not_called()


@pytest.mark.anyio
async def test_queueing_pool_does_not_claim_successful_sync(monkeypatch):
    db = MagicMock()
    db.sync_configs.find_one = AsyncMock(return_value={"name": "Fixture"})
    db.sync_configs.update_one = AsyncMock()
    monkeypatch.setattr(sync_module, "get_db", lambda: db)
    service = sync_module.SyncManagerService()
    service.preview_sync_pool = AsyncMock(return_value=[{"_id": "manga"}])
    service.execute_batch_sync = AsyncMock(return_value={"status": "queued"})
    await service.execute_sync_pool(str(ObjectId()))
    db.sync_configs.update_one.assert_not_called()


@pytest.mark.anyio
@pytest.mark.parametrize("status", ["completed", "failed"])
async def test_pool_success_timestamp_requires_completed_batch(monkeypatch, status):
    db = MagicMock()
    db.sync_configs.update_one = AsyncMock()
    monkeypatch.setattr(sync_module, "get_db", lambda: db)
    service = sync_module.SyncManagerService()
    service.execute_single_sync = AsyncMock(return_value={"status": status})
    pool_id = str(ObjectId())
    result = await service.execute_batch_sync(["manga"], {}, pool_id)
    await service.active_tasks[result["task_id"]]
    assert db.sync_configs.update_one.await_count == (1 if status == "completed" else 0)
