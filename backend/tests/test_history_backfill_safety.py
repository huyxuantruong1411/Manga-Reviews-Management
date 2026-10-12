"""Historical status repair must be explicit and preserve stored timestamps."""

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId

from backend.database import indexes


class Cursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *_args):
        return self

    def __aiter__(self):
        async def iterate():
            for document in self.documents:
                yield document

        return iterate()


class BackfillTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.original = datetime(2025, 1, 1, tzinfo=timezone.utc)
        self.event_time = datetime(2024, 1, 1, tzinfo=timezone.utc)
        self.manga = {"_id": ObjectId(), "read_status": "reading", "reading_at": self.original}
        self.events = [
            {"action": "update_status", "field": "read_status", "new_value": "reading", "timestamp": self.event_time}
        ]
        self.db = SimpleNamespace(
            mangas=SimpleNamespace(
                find=lambda *_: Cursor([self.manga]),
                update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)),
            ),
            audit_logs=SimpleNamespace(find=lambda *_: Cursor(self.events)),
        )

    async def test_default_is_read_only_preview(self):
        with patch.object(indexes, "get_db", return_value=self.db):
            await indexes.backfill_manga_status_timestamps()
        self.db.mangas.update_one.assert_not_awaited()

    async def test_apply_preserves_existing_timestamp_and_guards_missing_fields(self):
        with patch.object(indexes, "get_db", return_value=self.db):
            report = await indexes.backfill_manga_status_timestamps(dry_run=False)
        query, update = self.db.mangas.update_one.call_args.args
        self.assertNotIn("reading_at", update["$set"])
        self.assertEqual(query["read_status"], "reading")
        self.assertEqual(query["updated_at"], {"$exists": False})
        for field in update["$set"]:
            self.assertEqual(query[field], {"$exists": False})
        self.assertEqual(report["applied"], 1)

    async def test_current_status_does_not_turn_creation_time_into_completion(self):
        self.manga = {"_id": ObjectId(), "read_status": "completed", "added_at": self.original}
        self.events = [{"action": "create", "timestamp": self.event_time}]
        with patch.object(indexes, "get_db", return_value=self.db):
            report = await indexes.backfill_manga_status_timestamps(dry_run=True)
        self.assertIsNone(report["changes"][0]["fields"]["completed_at"])

    async def test_concurrent_edit_is_reported_without_claiming_application(self):
        self.db.mangas.update_one.return_value = SimpleNamespace(matched_count=0)
        with patch.object(indexes, "get_db", return_value=self.db):
            report = await indexes.backfill_manga_status_timestamps(dry_run=False)
        self.assertEqual(report["applied"], 0)
        self.assertEqual(report["conflicts"], [str(self.manga["_id"])])

    async def test_malformed_legacy_status_and_events_do_not_abort_other_records(self):
        self.manga = {"_id": ObjectId(), "read_status": "legacy-invalid"}
        self.events = [{"action": "update_status", "field": "read_status", "new_value": 42, "timestamp": "not-a-date"}]
        with patch.object(indexes, "get_db", return_value=self.db):
            report = await indexes.backfill_manga_status_timestamps()
        self.assertTrue(all(value is None for value in report["changes"][0]["fields"].values()))

    async def test_index_startup_never_runs_history_backfill(self):
        class Database:
            def __getattr__(self, name):
                return SimpleNamespace(create_index=AsyncMock())

            __getitem__ = __getattr__

        with (
            patch.object(indexes, "get_db", return_value=Database()),
            patch.object(indexes, "backfill_manga_status_timestamps", new_callable=AsyncMock) as backfill,
        ):
            await indexes.init_db_indexes()
        backfill.assert_not_awaited()
