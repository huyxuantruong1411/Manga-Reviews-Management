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
        with (
            patch.object(self.service, "_get_panels_col", return_value=col),
            patch.object(self.service, "_get_chapters_col", return_value=chapters),
        ):
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

    async def test_replaced_image_cannot_receive_stale_ocr(self):
        chapters = SimpleNamespace(
            find_one=AsyncMock(return_value={"pages": [{"page_number": 1, "object_key": "k", "md5_hash": "new"}]})
        )
        with patch.object(self.service, "_get_chapters_col", return_value=chapters):
            with self.assertRaises(ValueError):
                await self.service._save_page_panels("m", "c", 1, "k", [{}], "old")

    async def test_cancel_during_last_page_is_not_reported_completed(self):
        cursor = MagicMock()
        cursor.sort.return_value = cursor
        cursor.to_list = AsyncMock(return_value=[{"_id": "c", "pages": [{"page_number": 1, "object_key": "k"}]}])
        db = SimpleNamespace(
            chapters=SimpleNamespace(distinct=AsyncMock(return_value=["m"]), find=MagicMock(return_value=cursor)),
            mangas=SimpleNamespace(find_one=AsyncMock(return_value={"title": "M"})),
        )
        self.service._global_scan_active = True

        def analyze(*args):
            self.service._cancel_global_scan = True
            return []

        with (
            patch("backend.services.panel_scanner_service.get_db", return_value=db),
            patch.object(self.service, "ensure_indexes", AsyncMock()),
            patch.object(self.service, "_fetch_page_bytes", AsyncMock(return_value=b"image")),
            patch.object(self.service, "_analyze_page_image", analyze),
        ):
            await self.service._run_global_scan_task(None, True)
        status = self.service.get_global_scan_status()
        self.assertEqual(status["stage"], "cancelled")
        self.assertFalse(status["is_scanning"])
        self.assertEqual(status["current_page"], 0)

    def test_normalization_preserves_valid_words_and_punctuation(self):
        self.assertEqual(normalize_comic_text("Understanding, friendship!"), "Understanding, friendship!")
        self.assertEqual(normalize_comic_text("incredi-\nble"), "incredible")

    def test_merged_english_ocr_is_repaired_without_splitting_vietnamese(self):
        self.assertEqual(normalize_comic_text("HELLOFRIEND."), "Hello friend.")
        self.assertEqual(normalize_comic_text("TRUYENTRANH", "vi"), "Truyentranh")

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

    def test_vietnamese_text_normalization_preserves_accents_and_casing(self):
        # Vietnamese text should normalize case cleanly without English wordninja corruption
        self.assertEqual(
            normalize_comic_text("CHÚNG TA PHẢI CHIẾN ĐẤU!", language="vi"),
            "Chúng ta phải chiến đấu!",
        )
        self.assertEqual(
            normalize_comic_text("CỐ-\nLÊN NÀO BẠN ƠI!", language="vi"),
            "Cố lên nào bạn ơi!",
        )

    def test_cluster_text_into_bubbles_groups_adjacent_lines(self):
        vision = VisionService()
        detections = [
            {
                "text": "First line of bubble",
                "norm_box": (0.60, 0.10, 0.75, 0.14),
                "center": (0.675, 0.12),
                "confidence": 0.95,
            },
            {
                "text": "Second line of bubble",
                "norm_box": (0.58, 0.15, 0.78, 0.19),
                "center": (0.68, 0.17),
                "confidence": 0.92,
            },
            {
                "text": "Far away dialogue",
                "norm_box": (0.10, 0.80, 0.30, 0.85),
                "center": (0.20, 0.825),
                "confidence": 0.88,
            },
        ]
        bubbles = vision.cluster_text_into_bubbles(detections, reading_direction="rtl")
        self.assertEqual(len(bubbles), 2)
        # Bubble with first two lines
        bubble_texts = [" ".join(d["text"] for d in b["detections"]) for b in bubbles]
        self.assertIn("First line of bubble Second line of bubble", bubble_texts)
        self.assertIn("Far away dialogue", bubble_texts)

    def test_reading_order_sorting_rtl_vs_ltr(self):
        vision = VisionService()
        # Box A is top-right, Box B is top-left
        boxes = [
            {"bbox": (0.10, 0.10, 0.40, 0.30), "id": "left"},
            {"bbox": (0.60, 0.10, 0.90, 0.30), "id": "right"},
        ]
        sorted_rtl = vision.sort_elements_by_reading_order(boxes, reading_direction="rtl")
        self.assertEqual(sorted_rtl[0]["id"], "right")
        self.assertEqual(sorted_rtl[1]["id"], "left")

        sorted_ltr = vision.sort_elements_by_reading_order(boxes, reading_direction="ltr")
        self.assertEqual(sorted_ltr[0]["id"], "left")
        self.assertEqual(sorted_ltr[1]["id"], "right")

    def test_outside_panel_text_preserved(self):
        vision = VisionService()
        panels = [(0.1, 0.1, 0.5, 0.5)]
        detections = [
            {"text": "Inside", "norm_box": (0.2, 0.2, 0.3, 0.3), "center": (0.25, 0.25)},
            {"text": "Outside narration", "norm_box": (0.8, 0.8, 0.95, 0.9), "center": (0.875, 0.85)},
        ]
        results = vision.associate_text_with_panels(panels, detections, preserve_outside_text=True)
        # Should return texts for panel 0 PLUS an extra outside bubble panel
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0][0]["text"], "Inside")
        self.assertEqual(results[1][0]["text"], "Outside narration")

    def test_vietnamese_feature_extraction_generates_unaccented_lemmas(self):
        lemmas, vocab = self.service.extract_language_features("Chiến binh dũng cảm", language="vi")
        # Should have both accented and unaccented search lemmas
        self.assertIn("chiến", lemmas)
        self.assertIn("chien", lemmas)
        self.assertIn("dũng", lemmas)
        self.assertIn("dung", lemmas)
        # Common stopword filtering
        lemmas_stop, _ = self.service.extract_language_features("Tôi là một người bạn của cậu", language="vi")
        self.assertNotIn("là", lemmas_stop)
        self.assertNotIn("của", lemmas_stop)
        self.assertIn("người", lemmas_stop)

    def test_analyze_page_image_bubble_and_fullpage_modes(self):
        fake_img = MagicMock()
        fake_img.shape = (1000, 800, 3)
        detections = [
            {"text": "Bong bóng thoại 1", "norm_box": (0.6, 0.1, 0.8, 0.2), "confidence": 0.95, "center": (0.7, 0.15)},
            {"text": "Bong bóng thoại 2", "norm_box": (0.1, 0.7, 0.3, 0.8), "confidence": 0.90, "center": (0.2, 0.75)},
        ]

        with (
            patch("backend.services.panel_scanner_service.vision_service.decode_image_bytes", return_value=fake_img),
            patch("backend.services.panel_scanner_service.vision_service.detect_text", return_value=detections),
        ):
            # 1. Bubble mode
            bubble_docs = self.service._analyze_page_image(
                b"fake", "m", "Manga Title", "c", "1", None, 1, "k", language="vi", scan_mode="bubble"
            )
            self.assertEqual(len(bubble_docs), 2)
            self.assertEqual(bubble_docs[0]["scan_mode"], "bubble")
            self.assertEqual(bubble_docs[0]["language"], "vi")
            self.assertIn("thoại", bubble_docs[0]["lemmas"])

            # 2. Fullpage mode
            full_docs = self.service._analyze_page_image(
                b"fake", "m", "Manga Title", "c", "1", None, 1, "k", language="vi", scan_mode="fullpage"
            )
            self.assertEqual(len(full_docs), 1)
            self.assertEqual(full_docs[0]["coords"], [0.0, 0.0, 1.0, 1.0])
            self.assertEqual(full_docs[0]["scan_mode"], "fullpage")

    async def test_search_panels_with_language_and_scan_mode_filters(self):
        cursor = MagicMock()
        cursor.sort.return_value = cursor.skip.return_value = cursor.limit.return_value = cursor
        cursor.to_list = AsyncMock(return_value=[])
        col = SimpleNamespace(count_documents=AsyncMock(return_value=0), find=MagicMock(return_value=cursor))
        self.service._nlp = lambda _: []

        with patch.object(self.service, "_get_panels_col", return_value=col):
            await self.service.search_panels("chiến đấu", language="vi", scan_mode="bubble")

        query = col.count_documents.call_args.args[0]
        self.assertEqual(query["language"], "vi")
        self.assertEqual(query["scan_mode"], "bubble")

    def test_side_by_side_bubbles_are_not_interleaved_in_panel(self):
        """Regression test for Screenshot 4: Two side-by-side bubbles in a panel must not be interleaved line by line."""
        vision = VisionService()
        # Panel covering entire scene
        panels = [(0.0, 0.0, 1.0, 1.0)]

        # Left bubble detections (x from 0.05 to 0.40)
        left_bubble_lines = [
            {"text": "High", "norm_box": (0.08, 0.10, 0.35, 0.16), "center": (0.21, 0.13)},
            {"text": "school", "norm_box": (0.07, 0.17, 0.36, 0.23), "center": (0.215, 0.20)},
            {"text": "starts", "norm_box": (0.08, 0.24, 0.34, 0.30), "center": (0.21, 0.27)},
            {"text": "in spring", "norm_box": (0.06, 0.31, 0.38, 0.37), "center": (0.22, 0.34)},
            {"text": "and it's", "norm_box": (0.07, 0.38, 0.37, 0.44), "center": (0.22, 0.41)},
            {"text": "a bit", "norm_box": (0.09, 0.45, 0.33, 0.51), "center": (0.21, 0.48)},
            {"text": "far...", "norm_box": (0.10, 0.52, 0.30, 0.58), "center": (0.20, 0.55)},
        ]

        # Right bubble detections (x from 0.55 to 0.95)
        right_bubble_lines = [
            {"text": "Raise", "norm_box": (0.65, 0.11, 0.88, 0.17), "center": (0.76, 0.14)},
            {"text": "your voice", "norm_box": (0.60, 0.18, 0.92, 0.24), "center": (0.76, 0.21)},
            {"text": "a little more,", "norm_box": (0.58, 0.25, 0.95, 0.31), "center": (0.765, 0.28)},
            {"text": "Kinomiya-san.", "norm_box": (0.57, 0.32, 0.94, 0.38), "center": (0.755, 0.35)},
        ]

        # Detections passed to association (shuffled/interleaved)
        all_detections = left_bubble_lines + right_bubble_lines

        panel_texts_list = vision.associate_text_with_panels(
            panels, all_detections, preserve_outside_text=False, reading_direction="rtl"
        )
        self.assertEqual(len(panel_texts_list), 1)

        assigned = panel_texts_list[0]
        # In RTL comic reading order:
        # All lines of Right bubble MUST appear together before Left bubble lines!
        ordered_texts = [d["text"] for d in assigned]

        # First 4 elements must belong to the right bubble
        self.assertEqual(ordered_texts[:4], ["Raise", "your voice", "a little more,", "Kinomiya-san."])
        # Following elements belong to left bubble
        self.assertEqual(ordered_texts[4:], ["High", "school", "starts", "in spring", "and it's", "a bit", "far..."])

    def test_english_word_segmentation_and_hyphenation(self):
        """Regression test for Screenshots 3 & 5: Hyphenation, merged tokens, contractions, and proper names."""
        # Screenshot 5: Iwas looking for onemore person.
        self.assertEqual(
            normalize_comic_text("Iwas looking for onemore person.", language="en"),
            "I was looking for one more person.",
        )

        # Screenshot 4 text artifacts: inspring, andit's, abit
        self.assertEqual(
            normalize_comic_text("starts inspring andit's abit far.. Kinomiya-san.", language="en"),
            "starts in spring and it's a bit far.. Kinomiya-san.",
        )

        # Screenshot 3: I'drecom- \nmenda multi-speed bike...
        self.assertEqual(
            normalize_comic_text("I'd recom-\nmend a multi-speed bike...", language="en"),
            "I'd recommend a multi-speed bike...",
        )


if __name__ == "__main__":
    unittest.main()
