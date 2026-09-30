"""Read/write isolation: all persistence and external storage are mocked."""
import io
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from PIL import Image
from backend.services.panel_scanner_service import PanelScannerService, normalize_comic_text
from backend.services.vision_service import VisionService


class PanelTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service = PanelScannerService()

    async def test_terminal_events_are_not_running(self):
        self.service._active_scans["m"] = True
        queue = self.service.register_queue("m")
        await self.service._emit_progress("m", "completed", 1, 1, "done")
        self.assertFalse((await queue.get())["is_scanning"])
        self.service._global_scan_active = True
        await self.service._emit_global_progress("cancelled", None, "", 0, 1, 0, 1, 0, "stop")
        self.assertFalse(self.service.get_global_scan_status()["is_scanning"])

    async def test_slow_sse_client_does_not_block_scan(self):
        queue = self.service.register_global_queue()
        for current in range(10):
            await self.service._emit_global_progress("indexing", None, "", 0, 1, current, 10, 0, "")
        self.assertEqual(queue.qsize(), 1)
        self.assertEqual((await queue.get())["current_page"], 9)

    async def test_global_and_single_scans_cannot_overlap(self):
        self.service._active_scans["other"] = True
        self.assertFalse((await self.service.trigger_global_scan())["success"])
        self.assertFalse((await self.service.trigger_scan("m"))["success"])

    async def test_empty_query_browses_without_letter_filter(self):
        cursor = MagicMock()
        cursor.sort.return_value = cursor
        cursor.skip.return_value = cursor
        cursor.limit.return_value = cursor
        cursor.to_list = AsyncMock(return_value=[])
        col = SimpleNamespace(count_documents=AsyncMock(return_value=0), find=MagicMock(return_value=cursor))
        self.service._nlp = lambda _: []
        with patch.object(self.service, "_get_panels_col", return_value=col):
            await self.service.search_panels("", manga_id="m")
        col.count_documents.assert_awaited_once_with({"manga_id": "m"})

    async def test_blank_nlp_falls_back_to_token_text(self):
        cursor = MagicMock()
        cursor.sort.return_value = cursor.skip.return_value = cursor.limit.return_value = cursor
        cursor.to_list = AsyncMock(return_value=[])
        col = SimpleNamespace(count_documents=AsyncMock(return_value=0), find=MagicMock(return_value=cursor))
        self.service._nlp = lambda _: [SimpleNamespace(lemma_="", text="Dream", is_punct=False, is_space=False)]
        with patch.object(self.service, "_get_panels_col", return_value=col):
            await self.service.search_panels("dream")
        query = col.count_documents.call_args.args[0]
        self.assertIn({"lemmas": {"$in": ["dream"]}}, query["$or"])

    async def test_failed_insert_does_not_delete_previous_scan(self):
        col = SimpleNamespace(insert_many=AsyncMock(side_effect=RuntimeError("db failed")), delete_many=AsyncMock())
        chapters = SimpleNamespace(find_one=AsyncMock(return_value={"pages": [{"page_number": 1, "object_key": "k"}]}))
        with patch.object(self.service, "_get_panels_col", return_value=col), patch.object(self.service, "_get_chapters_col", return_value=chapters):
            with self.assertRaises(RuntimeError):
                await self.service._save_page_panels("m", "c", 1, "k", [{}])
        selector = col.delete_many.call_args.args[0]
        self.assertIsInstance(selector["scan_generation"], str)
        self.assertNotIn("$ne", selector["scan_generation"])

    async def test_deleted_page_cannot_be_reinserted_by_scan(self):
        chapters = SimpleNamespace(find_one=AsyncMock(return_value=None))
        with patch.object(self.service, "_get_chapters_col", return_value=chapters):
            with self.assertRaises(ValueError):
                await self.service._save_page_panels("m", "c", 1, "k", [{}])

    def test_normalization_preserves_valid_words_and_punctuation(self):
        self.assertEqual(normalize_comic_text("Understanding, friendship!"), "Understanding, friendship!")
        self.assertEqual(normalize_comic_text("incredi-\nble"), "incredible")

    def test_highlighting_does_not_trust_ocr_html(self):
        highlighted = self.service._highlight_text('<img src=x onerror="evil()">dream', ["dream"])
        self.assertNotIn("<img", highlighted)
        self.assertIn("<mark>dream</mark>", highlighted)

    def test_invalid_image_is_failure_not_empty_success(self):
        with self.assertRaises(ValueError):
            self.service._analyze_page_image(b"invalid", "m", "M", "c", "1", None, 1, "k")

    def test_grayscale_and_rgba_crops_return_jpeg(self):
        vision = VisionService()
        for mode in ("1", "L", "RGBA", "RGB"):
            source = io.BytesIO()
            Image.new(mode, (30, 40)).save(source, format="PNG")
            output = vision.get_panel_crop_stream(source.getvalue(), (0, 0, 1, 1))
            with Image.open(output) as image:
                self.assertEqual(image.format, "JPEG")

    def test_no_panels_does_not_crash_text_assignment(self):
        self.assertEqual(VisionService().associate_text_with_panels([], [{}]), [])


if __name__ == "__main__":
    unittest.main()
