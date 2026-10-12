"""Storage failures must remain visible and retryable; no real objects are used."""

import copy
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.chapter_service import chapter_service
from backend.services.translation.storage_service import translation_storage_service


class StorageFailureTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_page_delete_keeps_metadata_and_reports_partial_failure(self):
        chapter = {
            "_id": "chapter",
            "manga_id": "manga",
            "pages_revision": 1,
            "pages": [
                {"page_number": 1, "page_uid": "keep", "object_key": "fixture/1.png"},
                {"page_number": 2, "page_uid": "delete", "object_key": "fixture/2.png"},
            ],
        }
        chapters = SimpleNamespace(find_one=AsyncMock(return_value=copy.deepcopy(chapter)), update_one=AsyncMock())
        progress = SimpleNamespace(find_one=AsyncMock(return_value=None))
        with (
            patch.object(chapter_service, "_get_chapters_col", return_value=chapters),
            patch.object(chapter_service, "_get_reading_col", return_value=progress),
            patch("backend.services.chapter_service.minio_service.delete_chapter_page", side_effect=[False, True]),
            patch(
                "backend.services.panel_scanner_service.panel_scanner_service.delete_panels_for_pages",
                new_callable=AsyncMock,
            ) as panels,
            patch(
                "backend.services.panel_scanner_service.panel_scanner_service.renumber_panels_for_chapter",
                new_callable=AsyncMock,
            ),
        ):
            result = await chapter_service.delete_pages("chapter", [1, 2])
        self.assertEqual(result["deleted_pages_count"], 1)
        self.assertEqual(result["failed_page_numbers"], [1])
        self.assertEqual(result["remaining_pages_count"], 1)
        self.assertEqual(chapters.update_one.call_args.args[1]["$set"]["pages"][0]["page_uid"], "keep")
        panels.assert_awaited_once_with("chapter", [2])

    async def test_cleanup_does_not_mark_failed_or_unvisited_objects_deleted(self):
        assets = [{"asset_id": "failed", "object_key": "translation/a.png", "state": "deleting", "file_size": 10}]
        collection = SimpleNamespace(
            find=lambda query: SimpleNamespace(to_list=AsyncMock(return_value=assets)),
            find_one=AsyncMock(return_value=None),
            update_many=AsyncMock(),
            update_one=AsyncMock(),
        )
        refs = SimpleNamespace(find_one=AsyncMock(return_value=None))
        db = {
            name: refs
            for name in ("translation_results", "translation_page_bindings", "translation_font_packs", "chapters")
        }
        db["translation_assets"] = collection
        client = MagicMock()
        client.remove_object.side_effect = OSError("synthetic storage failure")
        with (
            patch("backend.database.connection.get_db", return_value=db),
            patch.object(translation_storage_service, "_get_minio_client", return_value=client),
        ):
            result = await translation_storage_service.preview_cleanup(dry_run=False)
        collection.update_many.assert_not_called()
        collection.update_one.assert_not_called()
        self.assertEqual(result["failed_count"], 1)
        self.assertEqual(result["deleted_count"], 0)

    async def test_missing_client_cannot_fake_an_upload(self):
        with patch.object(translation_storage_service, "_get_minio_client", return_value=None):
            with self.assertRaises(RuntimeError):
                await translation_storage_service.upload_file("translation/fixture.png", b"fixture")
