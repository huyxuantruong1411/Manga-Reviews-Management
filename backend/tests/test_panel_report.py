"""
test_panel_report.py – Unit test suite for PanelReportService.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.services.panel_report_service import PanelReportService


class TestPanelReportService(unittest.TestCase):
    def setUp(self):
        self.service = PanelReportService()
        self.mock_data = {
            "report_metadata": {
                "generated_at": "2026-10-02 04:00:00 UTC",
                "system_engine": "Manga-Reviews-Management Panel Pipeline v2.0",
                "ocr_model": "RapidOCR PP-OCRv4 (ONNX Runtime, DBNet + CRNN)",
                "post_processing_engine": "MangaOCRService",
                "nlp_model": "spaCy en_core_web_sm",
                "total_panels_in_report": 2,
                "total_matching_panels_in_db": 2,
                "total_word_count": 15,
                "unique_vocabulary_count": 5,
                "scan_mode": "panel",
                "chapter_scope": "Ch. 1",
            },
            "manga": {
                "id": "mock_manga_123",
                "title": "One Piece Mock Test",
                "original_title": "ONE PIECE",
                "authors": ["Eiichiro Oda"],
                "artists": ["Eiichiro Oda"],
                "genres": ["Action", "Adventure"],
                "status": "ongoing",
                "description": "A story about pirates.",
                "cover_image": "data:image/jpeg;base64,mockcoverbytes",
            },
            "chapter_context": {
                "id": "mock_chap_1",
                "number": "1",
                "title": "Romance Dawn",
                "volume": "1",
            },
            "pipeline_technical_specification": {
                "stage_1_page_ingestion": {"storage": "MinIO"},
                "stage_2_panel_segmentation": {"algorithm": "Gaussian Threshold"},
                "stage_3_ocr_detection_recognition": {"model": "PP-OCRv4"},
                "stage_4_manga_ocr_post_processing": {"engine": "MangaOCRService"},
                "stage_5_linguistic_feature_extraction": {"nlp": "spaCy"},
            },
            "ai_optimization_directive": {
                "role": "Computer Vision & NLP Auditor",
                "task_objective": "Evaluate extraction quality.",
                "review_checklist": [
                    "1. Panel Crop Accuracy",
                    "2. Comic Lettering OCR",
                ],
            },
            "vocabulary_summary": {
                "top_terms": [
                    {"term": "pirate", "lemma": "pirate", "pos_tag": "NOUN", "frequency": 3},
                    {"term": "adventure", "lemma": "adventure", "pos_tag": "NOUN", "frequency": 2},
                ],
                "total_unique": 2,
            },
            "panels": [
                {
                    "panel_id": "panel_001",
                    "panel_index": 0,
                    "chapter_id": "mock_chap_1",
                    "chapter_number": "1",
                    "chapter_title": "Romance Dawn",
                    "volume": "1",
                    "page_number": 1,
                    "page_minio_key": "pages/mock_p1.jpg",
                    "coords": [0.05, 0.05, 0.95, 0.45],
                    "width": 800,
                    "height": 500,
                    "raw_text": "I AM GOING TO BE THE PIRATE KING!",
                    "cleaned_text": "I am going to be the pirate king!",
                    "language": "en",
                    "scan_mode": "panel",
                    "lemmas": ["be", "pirate", "king"],
                    "vocabulary": [
                        {"term": "pirate", "lemma": "pirate", "pos_tag": "NOUN", "frequency": 1},
                        {"term": "king", "lemma": "king", "pos_tag": "NOUN", "frequency": 1},
                    ],
                    "image_data_url": "data:image/jpeg;base64,mockpanelbytes",
                },
                {
                    "panel_id": "panel_002",
                    "panel_index": 1,
                    "chapter_id": "mock_chap_1",
                    "chapter_number": "1",
                    "chapter_title": "Romance Dawn",
                    "volume": "1",
                    "page_number": 1,
                    "page_minio_key": "pages/mock_p1.jpg",
                    "coords": [0.05, 0.50, 0.95, 0.95],
                    "width": 800,
                    "height": 500,
                    "raw_text": "GOTALK TO HIM!",
                    "cleaned_text": "Go talk to him!",
                    "language": "en",
                    "scan_mode": "panel",
                    "lemmas": ["go", "talk"],
                    "vocabulary": [
                        {"term": "talk", "lemma": "talk", "pos_tag": "VERB", "frequency": 1},
                    ],
                    "image_data_url": "data:image/jpeg;base64,mockpanelbytes2",
                },
            ],
        }

    def test_render_html_report_contains_essential_elements(self):
        html_out = self.service.render_html_report(self.mock_data)

        # Check title and manga info
        self.assertIn("One Piece Mock Test", html_out)
        self.assertIn("Romance Dawn", html_out)

        # Check embedded Base64 image tags
        self.assertIn("data:image/jpeg;base64,mockcoverbytes", html_out)
        self.assertIn("data:image/jpeg;base64,mockpanelbytes", html_out)

        # Check OCR texts
        self.assertIn("I am going to be the pirate king!", html_out)
        self.assertIn("GOTALK TO HIM!", html_out)
        self.assertIn("Go talk to him!", html_out)

        # Check AI optimization directive and embedded JSON script
        self.assertIn("AI Optimization &amp; Self-Audit Protocol", html_out)
        self.assertIn('id="ai-structured-data"', html_out)
        self.assertIn('"mock_manga_123"', html_out)

        # Check print CSS presence
        self.assertIn("@media print", html_out)

        # Check technical pipeline specs
        self.assertIn("PP-OCRv4", html_out)
        self.assertIn("MangaOCRService", html_out)

    def test_render_html_report_with_pages_and_raw_original_images(self):
        """Verify that intact raw original page images are rendered before extracted panels."""
        data_with_pages = dict(self.mock_data)
        data_with_pages["report_metadata"] = dict(self.mock_data["report_metadata"])
        data_with_pages["report_metadata"]["total_pages_in_report"] = 1

        raw_page_data_url = "data:image/jpeg;base64,mockraworiginalpagebytes12345"
        data_with_pages["pages"] = [
            {
                "page_key": "mock_chap_1_p1_pages_mock_p1_jpg",
                "chapter_id": "mock_chap_1",
                "chapter_number": "1",
                "chapter_title": "Romance Dawn",
                "volume": "1",
                "page_number": 1,
                "page_minio_key": "pages/mock_p1.jpg",
                "original_image_data_url": raw_page_data_url,
                "panels_count": 2,
                "panels": self.mock_data["panels"],
            }
        ]

        html_out = self.service.render_html_report(data_with_pages)

        # 1. Verify Part 1 Raw Original Page section appears first
        self.assertIn("1. Ảnh Gốc Nguyên Vẹn Ban Đầu (Raw Original Manga Page)", html_out)
        self.assertIn(raw_page_data_url, html_out)
        self.assertIn("raw-page-img", html_out)
        self.assertIn("raw-page-block", html_out)

        # 2. Verify Part 2 Extracted Panels section appears corresponding to this page
        self.assertIn("2. Kết Quả Trích Xuất Khung Tranh Tương Ứng", html_out)
        self.assertIn("extracted-panels-block", html_out)
        self.assertIn("data:image/jpeg;base64,mockpanelbytes", html_out)
        self.assertIn("I am going to be the pirate king!", html_out)

        # 3. Check page metadata and metrics
        self.assertIn("Trang Gốc (Original Pages)", html_out)
        self.assertIn("Trang Gốc (Original Page) #1", html_out)
        self.assertIn("Key: pages/mock_p1.jpg", html_out)

        # 4. Check AI Prompt instructs comparison between raw original page and crops
        self.assertIn("Đối chiếu ảnh gốc nguyên vẹn ban đầu (Raw Original Page)", html_out)


if __name__ == "__main__":
    unittest.main()
