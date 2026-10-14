"""Unit tests for audit logs Elasticsearch dual-write, search fallback, and backfill."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from backend.config import settings
from backend.services.audit_search_service import audit_search_service
from backend.services.audit_service import audit_service
from scripts.elk.backfill_audit import backfill_audit_logs


@pytest.mark.anyio
async def test_audit_dual_write_triggers_es_index():
    with patch.object(settings, "audit_es_sync_enabled", True):
        with patch.object(audit_search_service, "index_audit_doc", new_callable=AsyncMock) as mock_index:
            mock_index.return_value = True

            # Mock MongoDB insert
            mock_coll = AsyncMock()
            mock_res = AsyncMock()
            mock_res.inserted_id = ObjectId()
            mock_coll.insert_one.return_value = mock_res

            with patch.object(audit_service, "_get_audit_collection", return_value=mock_coll):
                res = await audit_service.log_event(
                    entity_type="manga",
                    entity_id=str(ObjectId()),
                    action="create_manga",
                    note="Unit test dual-write",
                )

                assert res.get("action") == "create_manga"
                # Wait briefly for background task
                import asyncio

                await asyncio.sleep(0.05)
                mock_index.assert_called_once()


class MockAsyncCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *args, **kwargs):
        return self

    def skip(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def __aiter__(self):
        async def _gen():
            for d in self.docs:
                yield d

        return _gen()


@pytest.mark.anyio
async def test_audit_es_search_fallback_on_error():
    with patch.object(settings, "audit_es_search_enabled", True):
        # ES search returns None (simulating connection failure or exception)
        with patch.object(audit_search_service, "search_audit_logs", new_callable=AsyncMock, return_value=None):
            mock_coll = AsyncMock()
            mock_coll.count_documents.return_value = 1

            doc = {
                "_id": ObjectId(),
                "entity_type": "manga",
                "entity_id": "123",
                "action": "view",
                "timestamp": datetime.now(timezone.utc),
            }

            mock_cursor = MockAsyncCursor([doc])
            mock_coll.find = MagicMock(return_value=mock_cursor)

            with patch.object(audit_service, "_get_audit_collection", return_value=mock_coll):
                result = await audit_service.get_audit_logs()
                assert result["source_engine"] == "mongodb"
                assert result["total"] == 1
                assert len(result["items"]) == 1


@pytest.mark.anyio
async def test_audit_es_search_primary_when_available():
    with patch.object(settings, "audit_es_search_enabled", True):
        mock_es_response = {
            "total": 42,
            "items": [{"_id": "es_1", "action": "update"}],
            "skip": 0,
            "limit": 20,
            "source_engine": "elasticsearch",
        }
        with patch.object(
            audit_search_service, "search_audit_logs", new_callable=AsyncMock, return_value=mock_es_response
        ):
            result = await audit_service.get_audit_logs()
            assert result["source_engine"] == "elasticsearch"
            assert result["total"] == 42


@pytest.mark.anyio
async def test_backfill_audit_logs():
    with patch("scripts.elk.backfill_audit.connect_to_mongo", new_callable=AsyncMock):
        with patch("scripts.elk.backfill_audit.close_mongo_connection", new_callable=AsyncMock):
            with patch("scripts.elk.backfill_audit.init_es_client", new_callable=AsyncMock) as mock_init_es:
                with patch("scripts.elk.backfill_audit.close_es_client", new_callable=AsyncMock):
                    mock_init_es.return_value = AsyncMock()

                    mock_db = AsyncMock()
                    mock_db.audit_logs.count_documents.return_value = 2
                    mock_cursor = MockAsyncCursor(
                        [
                            {"_id": ObjectId(), "action": "test_1"},
                            {"_id": ObjectId(), "action": "test_2"},
                        ]
                    )
                    mock_db.audit_logs.find = MagicMock(return_value=mock_cursor)

                    with patch("scripts.elk.backfill_audit.get_db", return_value=mock_db):
                        with patch.object(
                            audit_search_service, "index_audit_doc", new_callable=AsyncMock, return_value=True
                        ) as mock_index:
                            count = await backfill_audit_logs(batch_size=1)
                            assert count == 2
                            assert mock_index.call_count == 2
