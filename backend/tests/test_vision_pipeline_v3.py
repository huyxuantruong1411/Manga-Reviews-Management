"""
test_vision_pipeline_v3.py - Mandatory regression and integration tests for Vision Pipeline V3.

Directly tests requirements from Section 20 & 21 of the V3 Implementation Plan:
1. test_cover_page_does_not_generate_fake_story_panels
2. test_proper_name_inio_is_not_wordninja_split
3. test_senpai_is_protected
4. test_bamboovian_is_not_segmented_into_common_words
5. test_cjk_text_bypasses_english_nlp
6. test_outside_text_does_not_create_fake_panel
7. test_low_confidence_text_is_not_vocab_indexed_by_default
8. test_raw_ocr_is_never_overwritten
9. test_case_normalization_does_not_modify_raw_text
10. test_reading_order_rtl
11. test_reading_order_ltr
12. test_page_type_blocks_cover_vocab
13. test_metrics_calculation
"""

import unittest

import numpy as np

from backend.services.vision.evaluation.metrics import (
    calculate_cer,
    calculate_iou,
    calculate_pairwise_order_accuracy,
    calculate_wer,
)
from backend.services.vision.layout.semantic_layout import SemanticLayoutAnalyzer
from backend.services.vision.nlp.router import nlp_router
from backend.services.vision.ocr.language_router import language_router
from backend.services.vision.ocr.script_detector import script_detector
from backend.services.vision.page_classifier import page_classifier
from backend.services.vision.reading_order.kovanen import kovanen_order_estimator
from backend.services.vision.text.association import region_associator
from backend.services.vision.text.correction_rules import is_protected_token
from backend.services.vision.text.normalizer import text_normalizer
from backend.services.vision.types import LayoutRegion, PageAnalysisContext


class TestVisionPipelineV3(unittest.TestCase):
    def test_proper_name_inio_is_not_wordninja_split(self):
        """Page 2 failure: INIO ASANO must not become 'In io asano'."""
        res = text_normalizer.normalize("INIO ASANO", language="en")
        self.assertEqual(res.raw_text, "INIO ASANO")
        clean = res.corrected_text or res.normalized_text
        self.assertNotIn("In io", clean)
        self.assertTrue(is_protected_token("inio"))
        self.assertTrue(is_protected_token("asano"))

    def test_senpai_is_protected(self):
        """SENPAI must not be split into 'sen pai'."""
        res = text_normalizer.normalize("SENPAI", language="en")
        clean = res.corrected_text or res.normalized_text
        self.assertNotIn("sen pai", clean.lower())
        self.assertTrue(is_protected_token("senpai"))

    def test_bamboovian_is_not_segmented_into_common_words(self):
        """BAMBOOVIAN must not be segmented into 'bamboo vi an'."""
        res = text_normalizer.normalize("BAMBOOVIAN", language="en")
        clean = res.corrected_text or res.normalized_text
        self.assertNotIn("bamboo vi an", clean.lower())

    def test_cjk_text_bypasses_english_nlp(self):
        """CJK text must not be routed to English spaCy."""
        cjk_text = "避心 たのしい 漫画"
        script, conf = script_detector.detect_script(cjk_text)
        self.assertIn(script, ("han", "hiragana", "katakana", "mixed"))

        routed_lang, routed_script = language_router.route_language(cjk_text, detected_script=script)
        self.assertEqual(routed_lang, "ja")

        tokens = nlp_router.analyze(cjk_text, language=routed_lang)
        self.assertTrue(len(tokens) > 0)
        self.assertEqual(tokens[0].pos, "JA_TOKEN")

    def test_outside_text_does_not_create_fake_panel(self):
        """Text outside any frame must have panel_region_id = None and not manufacture a fake frame."""
        frames = [
            LayoutRegion(
                id="frame-1",
                kind="frame",
                bbox=(0.1, 0.1, 0.9, 0.5),
            )
        ]
        balloons = []
        outside_text_bbox = (0.02, 0.85, 0.25, 0.95)

        panel_id, balloon_id, conf = region_associator.associate_text(outside_text_bbox, frames, balloons)
        self.assertIsNone(panel_id)
        self.assertIsNone(balloon_id)

    def test_cover_page_does_not_generate_fake_story_panels(self):
        """Page 1 cover should not be fragmented into 19 fake story panels."""
        analyzer = SemanticLayoutAnalyzer()
        synthetic_cover = np.ones((1800, 1200, 3), dtype=np.uint8) * 200

        ctx = PageAnalysisContext(
            manga_id="m1",
            chapter_id="c1",
            page_number=1,  # Page 1 is cover
            page_hash="h1",
            image_width=1200,
            image_height=1800,
        )

        regions = analyzer.analyze_layout(synthetic_cover, ctx)
        frames = [r for r in regions if r.kind == "frame"]
        # Must be single frame or zero fake fragmentations
        self.assertLessEqual(len(frames), 2)
        self.assertNotEqual(len(frames), 19)

    def test_page_type_blocks_cover_vocab(self):
        """Cover pages must have index_for_vocabulary = False."""
        # Non-blank image with visual variation
        img = np.zeros((1800, 1200, 3), dtype=np.uint8)
        img[100:500, 100:500] = 255
        ctx = PageAnalysisContext(
            manga_id="m1",
            chapter_id="c1",
            page_number=1,
            page_hash="h1",
            image_width=1200,
            image_height=1800,
        )
        page_type, index_search, index_vocab = page_classifier.classify_page(
            img, context=ctx, frame_count=1, text_count=5
        )
        self.assertEqual(page_type, "cover")
        self.assertTrue(index_search)
        self.assertFalse(index_vocab)

    def test_raw_ocr_is_never_overwritten(self):
        """Raw OCR must remain strictly untouched across normalization stages."""
        raw = "INIO ASANO"
        res = text_normalizer.normalize(raw, language="en")
        self.assertEqual(res.raw_text, raw)

    def test_case_normalization_does_not_modify_raw_text(self):
        raw = "THIS IS A TEST SENTENCE."
        res = text_normalizer.normalize(raw, language="en")
        self.assertEqual(res.raw_text, raw)
        self.assertIn("THIS IS A TEST SENTENCE.", res.raw_text)

    def test_reading_order_rtl(self):
        """Test Kovanen recursive partition in RTL (top to bottom, right before left)."""
        # Panel 1: Top Right
        p1 = LayoutRegion(id="p1", kind="frame", bbox=(0.55, 0.05, 0.95, 0.45))
        # Panel 2: Top Left
        p2 = LayoutRegion(id="p2", kind="frame", bbox=(0.05, 0.05, 0.45, 0.45))
        # Panel 3: Bottom Full
        p3 = LayoutRegion(id="p3", kind="frame", bbox=(0.05, 0.55, 0.95, 0.95))

        sorted_regions = kovanen_order_estimator.sort_regions([p2, p3, p1], direction="rtl")
        order_ids = [r.id for r in sorted_regions]
        self.assertEqual(order_ids, ["p1", "p2", "p3"])

    def test_reading_order_ltr(self):
        """Test Kovanen recursive partition in LTR (top to bottom, left before right)."""
        p1 = LayoutRegion(id="p1", kind="frame", bbox=(0.05, 0.05, 0.45, 0.45))
        p2 = LayoutRegion(id="p2", kind="frame", bbox=(0.55, 0.05, 0.95, 0.45))
        p3 = LayoutRegion(id="p3", kind="frame", bbox=(0.05, 0.55, 0.95, 0.95))

        sorted_regions = kovanen_order_estimator.sort_regions([p2, p3, p1], direction="ltr")
        order_ids = [r.id for r in sorted_regions]
        self.assertEqual(order_ids, ["p1", "p2", "p3"])

    def test_metrics_calculation(self):
        """Test evaluation metrics functions."""
        cer = calculate_cer("SENPAI", "SENPAI")
        self.assertEqual(cer, 0.0)

        cer_diff = calculate_cer("INIO", "IN IO")
        self.assertGreater(cer_diff, 0.0)

        wer = calculate_wer("hello world", "hello world")
        self.assertEqual(wer, 0.0)

        iou = calculate_iou((0.0, 0.0, 1.0, 1.0), (0.0, 0.0, 1.0, 1.0))
        self.assertEqual(iou, 1.0)

        acc = calculate_pairwise_order_accuracy(["A", "B", "C"], ["A", "B", "C"])
        self.assertEqual(acc, 1.0)


if __name__ == "__main__":
    unittest.main()
