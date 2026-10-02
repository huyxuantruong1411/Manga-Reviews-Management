"""End-to-end test: OCR a sample manga page through the enhanced pipeline."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import cv2

from backend.services.manga_ocr_service import manga_ocr_service
from backend.services.vision_service import vision_service


class TestOCRE2E(unittest.TestCase):
    def test_sample_manga_page_ocr(self):
        img_rel_path = os.path.join(
            "ref",
            "Panel-words-detector",
            "backend",
            "data",
            "manga",
            "Sample Manga",
            "Chapter 001 - The Beginning",
            "001.jpg",
        )
        full_path = os.path.join(os.path.dirname(__file__), "..", "..", img_rel_path)
        if not os.path.exists(full_path):
            self.skipTest(f"Sample image not found at {full_path}; skipping e2e local test.")

        img = cv2.imread(full_path)
        self.assertIsNotNone(img, f"Failed to load image from {full_path}")

        detections = vision_service.detect_text(img)
        self.assertIsInstance(detections, list)

        result = manga_ocr_service.process_detections(detections)
        self.assertIn("raw_text", result)
        self.assertIn("clean_text", result)
        self.assertIn("detected_tokens", result)


if __name__ == "__main__":
    unittest.main()
