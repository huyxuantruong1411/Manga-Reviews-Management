import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId
from PIL import Image
from backend.routers import chapters, reviews
from backend.routers.downloads import DownloadRequest
from backend.routers.sync_manager import SyncOptions
from backend.services.chapter_service import ChapterService
from backend.services.audit_service import AuditService
from backend.services.image_tools_service import _convert_single_image, ImageToolsService
from backend.routers.analytics import parse_iso_date
from backend.utils.remote_images import validate_public_url


class SystemTests(unittest.IsolatedAsyncioTestCase):
    async def test_finalization_never_deletes_shared_or_draft_media(self):
        review_id = str(ObjectId())
        collection = SimpleNamespace(find_one=AsyncMock(return_value={"content_json": {}}), update_one=AsyncMock())
        storage = MagicMock()
        with patch.object(reviews, "get_db", return_value=SimpleNamespace(reviews=collection)), patch.object(reviews, "minio_service", storage):
            result = await reviews.finalize_review("m", review_id)
        self.assertEqual(result["deleted_orphans"], 0)
        storage.client.remove_object.assert_not_called()

    async def test_only_one_cleanup_route_and_language_is_forwarded(self):
        matching = [r for r in chapters.router.routes if r.path == "/api/manga/{manga_id}/cleanup-latest-chapter"]
        self.assertEqual(len(matching), 1)
        delete = AsyncMock(return_value={"chapter_number": "3"})
        with patch.object(chapters.chapter_service, "delete_latest_chapter", delete):
            result = await matching[0].endpoint(manga_id="m", lang="vi")
        delete.assert_awaited_once_with("m", language="vi")
        self.assertIn("deleted_chapter", result)

    async def test_reading_progress_rejects_foreign_chapter(self):
        service = ChapterService()
        col = SimpleNamespace(find_one=AsyncMock(return_value=None))
        with patch.object(service, "_get_chapters_col", return_value=col):
            with self.assertRaises(ValueError):
                await service.save_reading_progress("m", "c", "1")

    async def test_reading_progress_validates_page_and_atomically_marks_read(self):
        service = ChapterService()
        chapters_col = SimpleNamespace(find_one=AsyncMock(return_value={"pages": [{}, {}], "chapter_number": "7", "language": "en"}))
        reading_col = SimpleNamespace(update_one=AsyncMock())
        manga_col = SimpleNamespace(find_one=AsyncMock(return_value=None))
        with patch.object(service, "_get_chapters_col", return_value=chapters_col), patch.object(service, "_get_reading_col", return_value=reading_col), patch.object(service, "_get_mangas_col", return_value=manga_col):
            with self.assertRaises(ValueError):
                await service.save_reading_progress(str(ObjectId()), "c", "wrong", page=3)
            result = await service.save_reading_progress(str(ObjectId()), "c", "wrong", page=2, mark_as_read=True)
        self.assertEqual(result["last_read_chapter_number"], "7")
        update = reading_col.update_one.call_args.args[1]
        self.assertEqual(update["$addToSet"], {"read_chapter_ids": "c"})
        self.assertNotIn("read_chapter_ids", update["$set"])

    async def test_different_source_chapters_do_not_overwrite_each_other(self):
        service = ChapterService()
        col = SimpleNamespace(find_one=AsyncMock(return_value=None), insert_one=AsyncMock(return_value=SimpleNamespace(inserted_id=ObjectId())), update_one=AsyncMock())
        with patch.object(service, "_get_chapters_col", return_value=col):
            await service.create_or_update_chapter({"manga_id": "m", "chapter_number": "1", "source_id": "source-2"})
        col.find_one.assert_awaited_once_with({"manga_id": "m", "source_id": "source-2"})
        col.update_one.assert_not_awaited()

    async def test_audit_lookup_uses_document_id(self):
        service = AuditService()
        oid = ObjectId()
        col = SimpleNamespace(find_one=AsyncMock(return_value={"_id": oid}))
        with patch.object(service, "_get_audit_collection", return_value=col):
            result = await service.get_audit_log_by_id(str(oid))
        col.find_one.assert_awaited_once_with({"_id": oid})
        self.assertEqual(result["_id"], str(oid))

    def test_tracker_option_survives_validation(self):
        self.assertTrue(SyncOptions(sync_metadata=False, sync_trackers=True).model_dump()["sync_trackers"])

    def test_empty_download_is_rejected(self):
        with self.assertRaises(ValueError):
            DownloadRequest(chapters=[])

    def test_conversion_preserves_source_and_existing_destination(self):
        with tempfile.TemporaryDirectory(prefix="manga-regression-") as folder:
            source = Path(folder) / "page.png"
            destination = Path(folder) / "page.jpg"
            Image.new("RGB", (10, 10), "red").save(source)
            destination.write_bytes(b"existing user file")
            result = _convert_single_image(str(source), ".jpg")
            self.assertFalse(result["success"])
            self.assertTrue(source.exists())
            self.assertEqual(destination.read_bytes(), b"existing user file")

    def test_conversion_handles_grayscale(self):
        with tempfile.TemporaryDirectory(prefix="manga-regression-") as folder:
            source = Path(folder) / "page.png"
            Image.new("L", (10, 10)).save(source)
            result = _convert_single_image(str(source), ".jpg")
            self.assertTrue(result["success"])
            with Image.open(result["path"]) as image:
                self.assertEqual(image.format, "JPEG")

    def test_duplicate_deletion_requires_scan_and_retains_one_copy(self):
        with tempfile.TemporaryDirectory(prefix="manga-regression-") as folder:
            first, second = Path(folder) / "1.png", Path(folder) / "2.png"
            Image.new("RGB", (10, 10), "red").save(first)
            second.write_bytes(first.read_bytes())
            service = ImageToolsService()
            self.assertEqual(service.delete_duplicates([str(first)])["deleted_count"], 0)
            service.scan_duplicates(folder)
            self.assertEqual(service.delete_duplicates([str(first), str(second)])["deleted_count"], 0)
            self.assertEqual(service.delete_duplicates([str(first)])["deleted_count"], 1)
            self.assertTrue(second.exists())

    def test_end_date_includes_whole_day(self):
        end = parse_iso_date("2026-09-30", end_of_day=True)
        self.assertEqual((end.hour, end.minute, end.second), (23, 59, 59))

    async def test_remote_image_rejects_private_and_redirect_destinations(self):
        for url in ("file:///C:/test", "http://localhost/image", "http://user:pass@example.com/image"):
            with self.assertRaises(ValueError):
                await validate_public_url(url)
        addresses = [(2, 1, 6, "", ("127.0.0.1", 80))]
        with patch("backend.utils.remote_images.socket.getaddrinfo", return_value=addresses):
            with self.assertRaises(ValueError):
                await validate_public_url("https://public-looking.example/image")


if __name__ == "__main__":
    unittest.main()
