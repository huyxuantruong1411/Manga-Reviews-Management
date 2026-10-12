"""Deletion failures retain a retry anchor; tests never touch real storage."""

import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import HTTPException

from backend.routers import chapters, manga
from backend.services.chapter_service import chapter_service
from backend.services.content_deletion_service import DeletionBusyError, DeletionStorageError
from backend.services.manga_service import manga_service


class Cursor:
    def __init__(self, documents=()):
        self.documents = documents

    def __aiter__(self):
        async def iterate():
            for document in self.documents:
                yield document

        return iterate()


def collection(documents=()):
    return SimpleNamespace(
        find=lambda *args, **kwargs: Cursor(documents),
        find_one=AsyncMock(return_value=None),
        delete_one=AsyncMock(),
        delete_many=AsyncMock(),
        update_one=AsyncMock(),
        update_many=AsyncMock(),
    )


class DeletionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.manga_id = ObjectId()
        self.chapter_id = ObjectId()
        self.chapter = {
            "_id": self.chapter_id,
            "manga_id": str(self.manga_id),
            "pages": [{"object_key": "fixture/shared.png"}],
        }
        self.db = SimpleNamespace(
            **{
                name: collection()
                for name in (
                    "mangas",
                    "chapters",
                    "cover_arts",
                    "reading_progress",
                    "reviews",
                    "manga_recommendations",
                    "manga_panels",
                    "panel_scan_pages",
                    "vision_page_analyses",
                    "vision_regions",
                    "translation_page_bindings",
                    "translation_jobs",
                    "translation_job_pages",
                )
            }
        )
        self.db.chapters.find_one.side_effect = lambda query, *args: (
            self.chapter if query == {"_id": self.chapter_id} else None
        )
        self.db.mangas.find_one.side_effect = lambda query, *args: (
            {"_id": self.manga_id, "title": "Fixture", "minio_cover_key": "fixture/cover.png"}
            if query == {"_id": self.manga_id}
            else None
        )
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        for module in ("chapter_service", "manga_service"):
            self.stack.enter_context(patch(f"backend.services.{module}.get_db", return_value=self.db))
        self.storage = self.stack.enter_context(
            patch("backend.services.minio_service.minio_service.delete_cover", return_value=True)
        )
        self.pages = self.stack.enter_context(
            patch("backend.services.minio_service.minio_service.delete_chapter_page", return_value=True)
        )
        self.stack.enter_context(
            patch("backend.services.audit_service.audit_service.log_event", new_callable=AsyncMock)
        )
        self.stack.enter_context(patch("backend.services.manga_service.delete_cache", new_callable=AsyncMock))

    async def test_chapter_cleanup_failure_retains_parent_for_retry(self):
        self.db.manga_panels.delete_many.side_effect = RuntimeError("synthetic cleanup failure")
        with self.assertRaises(RuntimeError):
            await chapter_service.delete_chapter(str(self.chapter_id))
        self.db.chapters.delete_one.assert_not_awaited()

    async def test_chapter_preserves_object_owned_by_another_chapter(self):
        self.db.chapters.find_one.side_effect = lambda query, *args: (
            self.chapter if query == {"_id": self.chapter_id} else {"_id": "other"}
        )
        await chapter_service.delete_chapter(str(self.chapter_id))
        self.pages.assert_not_called()
        self.db.chapters.delete_one.assert_awaited_once()

    async def test_chapter_removes_bindings_and_v3_regions_before_analysis(self):
        analysis_id = ObjectId()
        self.db.vision_page_analyses.find = lambda *args: Cursor([{"_id": analysis_id}])
        await chapter_service.delete_chapter(str(self.chapter_id))
        self.db.translation_page_bindings.delete_many.assert_awaited_once_with(
            {"scope": "local", "chapter_id": str(self.chapter_id)}
        )
        self.db.vision_regions.delete_many.assert_awaited_once_with(
            {"page_analysis_id": {"$in": [analysis_id, str(analysis_id)]}}
        )
        self.db.vision_page_analyses.delete_many.assert_awaited_once()

    async def test_manga_cascades_chapters_and_progress(self):
        self.db.chapters.find = lambda *args: Cursor([self.chapter])
        with patch.object(chapter_service, "delete_chapter", new_callable=AsyncMock) as delete:
            await manga_service.delete_manga(str(self.manga_id))
        delete.assert_awaited_once_with(str(self.chapter_id))
        self.db.reading_progress.delete_many.assert_awaited_once_with({"manga_id": str(self.manga_id)})
        self.db.mangas.delete_one.assert_awaited_once()

    async def test_manga_child_failure_keeps_parent_and_covers(self):
        self.db.chapters.find = lambda *args: Cursor([self.chapter])
        with patch.object(chapter_service, "delete_chapter", side_effect=RuntimeError("synthetic storage failure")):
            with self.assertRaises(RuntimeError):
                await manga_service.delete_manga(str(self.manga_id))
        self.db.mangas.delete_one.assert_not_awaited()
        self.storage.assert_not_called()

    async def test_cover_storage_failure_retains_manga(self):
        self.storage.return_value = False
        with self.assertRaises(RuntimeError):
            await manga_service.delete_manga(str(self.manga_id))
        self.db.mangas.delete_one.assert_not_awaited()
        self.db.cover_arts.delete_many.assert_not_awaited()

    async def test_cover_used_by_another_manga_is_preserved(self):
        self.db.cover_arts.find_one.return_value = {"manga_id": "other"}
        await manga_service.delete_manga(str(self.manga_id))
        self.storage.assert_not_called()

    async def test_running_translation_blocks_storage_deletion(self):
        self.db.translation_jobs.find = lambda *args: Cursor([{"job_id": "fixture-job"}])
        self.db.translation_job_pages.find_one.return_value = {"state": "running"}
        with self.assertRaises(RuntimeError):
            await chapter_service.delete_chapter(str(self.chapter_id))
        self.pages.assert_not_called()
        self.db.chapters.delete_one.assert_not_awaited()
        self.assertTrue(self.db.translation_jobs.update_many.call_args.args[1]["$set"]["cancel_requested"])

    async def test_storage_failure_keeps_chapter_and_dependencies(self):
        self.pages.return_value = False
        with self.assertRaises(RuntimeError):
            await chapter_service.delete_chapter(str(self.chapter_id))
        self.db.chapters.delete_one.assert_not_awaited()
        self.db.manga_panels.delete_many.assert_not_awaited()

    async def test_region_cleanup_failure_retains_analysis_for_retry(self):
        self.db.vision_page_analyses.find = lambda *args: Cursor([{"_id": ObjectId()}])
        self.db.vision_regions.delete_many.side_effect = RuntimeError("synthetic region failure")
        with self.assertRaises(RuntimeError):
            await chapter_service.delete_chapter(str(self.chapter_id))
        self.db.vision_page_analyses.delete_many.assert_not_awaited()
        self.db.chapters.delete_one.assert_not_awaited()
        self.db.vision_regions.delete_many.side_effect = None
        self.assertTrue(await chapter_service.delete_chapter(str(self.chapter_id)))
        self.db.chapters.delete_one.assert_awaited_once()

    async def test_progress_failure_retains_chapter_for_retry(self):
        self.db.reading_progress.update_many.side_effect = RuntimeError("synthetic progress failure")
        with self.assertRaises(RuntimeError):
            await chapter_service.delete_chapter(str(self.chapter_id))
        self.db.chapters.delete_one.assert_not_awaited()

    async def test_delete_routes_report_actionable_conflict_and_storage_unavailability(self):
        for router, service, method in (
            (chapters, chapter_service, "delete_chapter"),
            (manga, manga_service, "delete_manga"),
        ):
            for error, status_code in ((DeletionBusyError, 409), (DeletionStorageError, 503)):
                with self.subTest(route=method, error=error), patch.object(service, method, side_effect=error("Retry")):
                    with self.assertRaises(HTTPException) as caught:
                        await getattr(router, method)("fixture")
                    self.assertEqual(caught.exception.status_code, status_code)
                    self.assertEqual(caught.exception.detail, "Retry")
