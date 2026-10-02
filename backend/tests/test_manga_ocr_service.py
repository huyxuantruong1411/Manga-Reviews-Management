"""Unit tests for the MangaOCRService pipeline."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.services.manga_ocr_service import MangaOCRService


class TestMangaOCRService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = MangaOCRService()

    def _assert_ocr_output(self, raw_lines: list[str], expected_substr: list[str], language: str = "en"):
        result = self.service.process_ocr_text(raw_lines, language=language)
        clean = result["clean_text"]
        for substr in expected_substr:
            self.assertIn(
                substr.lower(),
                clean.lower(),
                f"Expected '{substr}' in clean_text: '{clean}'",
            )

    def test_dehyphenation_counselor(self):
        self._assert_ocr_output(["COUNSEL-", "OR"], ["counselor"])

    def test_stuck_words_gotalk(self):
        self._assert_ocr_output(["GOTALK"], ["go", "talk"])

    def test_stuck_words_waita(self):
        self._assert_ocr_output(["WAITA"], ["wait"])

    def test_i_prefix_iwas(self):
        self._assert_ocr_output(["Iwas going home"], ["was"])

    def test_backtick_to_apostrophe(self):
        self._assert_ocr_output(["it`s fine"], ["it's"])

    def test_all_caps_normalisation(self):
        self._assert_ocr_output(["THIS IS A TEST"], ["this", "is", "test"])

    def test_normal_text_passthrough(self):
        self._assert_ocr_output(["Hello world, how are you?"], ["hello", "world"])

    def test_vietnamese_dehyphenation(self):
        self._assert_ocr_output(["cố-", "lên nào"], ["cố", "lên"], language="vi")

    def test_stuck_words_thankyou(self):
        self._assert_ocr_output(["THANKYOU"], ["thank", "you"])

    def test_multiline_dehyphenation_recommend(self):
        self._assert_ocr_output(["I recom-", "mend this book"], ["recommend"])


if __name__ == "__main__":
    unittest.main()
