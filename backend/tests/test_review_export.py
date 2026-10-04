import unittest
from datetime import datetime
from unittest.mock import AsyncMock, patch

from backend.services.review_export_service import ReviewExportService


class TestReviewExportService(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service = ReviewExportService()

    def test_tiptap_to_markdown_basic_formatting(self):
        sample_doc = {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 1},
                    "content": [{"type": "text", "text": "Masterpiece of Psychological Drama"}],
                },
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "This manga is "},
                        {"type": "text", "text": "deeply compelling", "marks": [{"type": "bold"}]},
                        {"type": "text", "text": " and "},
                        {"type": "text", "text": "unsettling", "marks": [{"type": "italic"}]},
                        {"type": "text", "text": ". Check "},
                        {
                            "type": "text",
                            "text": "author info",
                            "marks": [{"type": "link", "attrs": {"href": "https://example.com"}}],
                        },
                        {"type": "text", "text": "."},
                    ],
                },
                {
                    "type": "blockquote",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [{"type": "text", "text": "The greatest trick was making us question truth."}],
                        }
                    ],
                },
                {
                    "type": "bulletList",
                    "content": [
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [{"type": "text", "text": "Pacing: 10/10"}],
                                }
                            ],
                        },
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [{"type": "text", "text": "Art: 9.5/10"}],
                                }
                            ],
                        },
                    ],
                },
            ],
        }

        md = self.service.tiptap_to_markdown(sample_doc)
        self.assertIn("# Masterpiece of Psychological Drama", md)
        self.assertIn("**deeply compelling** and *unsettling*", md)
        self.assertIn("[author info](https://example.com)", md)
        self.assertIn("> The greatest trick was making us question truth.", md)
        self.assertIn("- Pacing: 10/10", md)
        self.assertIn("- Art: 9.5/10", md)

    def test_tiptap_to_plain_text(self):
        sample_doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "Simple review with "},
                        {"type": "text", "text": "bold words", "marks": [{"type": "bold"}]},
                    ],
                }
            ],
        }
        text = self.service.tiptap_to_plain_text(sample_doc)
        self.assertEqual(text, "Simple review with bold words")

    def test_estimate_metrics(self):
        text = "Monster is a psychological thriller masterpiece with intense character growth."
        words = self.service.count_words(text)
        self.assertGreater(words, 5)
        tokens = self.service.estimate_tokens(text)
        self.assertGreater(tokens, 5)

    async def test_generate_corpus_markdown(self):
        manga = {
            "_id": "60d5ec49f1b2c8b1f8e4e1a1",
            "title": "Monster",
            "alt_titles": ["Naoki Urasawa's Monster"],
            "author": "Naoki Urasawa",
            "artist": "Naoki Urasawa",
            "year": "1994",
            "status": "completed",
            "read_status": "completed",
            "personal_rating": 10.0,
            "publication_demographic": "seinen",
            "content_rating": "safe",
            "original_language": "ja",
            "volumes": 18,
            "chapters": 162,
            "description": "Dr. Kenzo Tenma is an elite neurosurgeon...",
            "tag_ids": ["tag_psy", "tag_mystery"],
        }
        reviews = [
            {
                "_id": "rev1",
                "manga_id": "60d5ec49f1b2c8b1f8e4e1a1",
                "title": "A Masterclass in Moral Ambiguity",
                "content_json": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "Johan Liebert remains the gold standard for antagonists.",
                                }
                            ],
                        }
                    ],
                },
                "created_at": datetime(2025, 1, 15, 12, 0, 0),
                "updated_at": datetime(2025, 1, 15, 12, 30, 0),
                "is_deleted": False,
            }
        ]
        tag_map = {"tag_psy": "Psychological", "tag_mystery": "Mystery"}

        output = self.service.build_corpus_markdown(
            reviews_with_manga=[(reviews[0], manga)],
            tag_map=tag_map,
            include_system_prompt=True,
            include_synopsis=True,
            include_manga_meta=True,
        )

        self.assertIn("# AUTHOR WRITING STYLE CORPUS & CRITIQUE ARCHIVE", output)
        self.assertIn("Naoki Urasawa", output)
        self.assertIn("A Masterclass in Moral Ambiguity", output)
        self.assertIn("Johan Liebert remains the gold standard for antagonists.", output)
        self.assertIn("10.0 / 10.0", output)
        self.assertIn("Psychological, Mystery", output)

    async def test_generate_corpus_json(self):
        manga = {
            "_id": "60d5ec49f1b2c8b1f8e4e1a1",
            "title": "Monster",
            "author": "Naoki Urasawa",
            "personal_rating": 10.0,
            "read_status": "completed",
            "tag_ids": ["tag_psy"],
        }
        reviews = [
            {
                "_id": "rev1",
                "manga_id": "60d5ec49f1b2c8b1f8e4e1a1",
                "title": "Test Review",
                "content_json": {
                    "type": "doc",
                    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Deep thoughts."}]}],
                },
                "created_at": datetime(2025, 1, 15),
                "updated_at": datetime(2025, 1, 15),
            }
        ]
        tag_map = {"tag_psy": "Psychological"}

        data = self.service.build_corpus_json(
            reviews_with_manga=[(reviews[0], manga)],
            tag_map=tag_map,
            include_system_prompt=True,
            include_synopsis=True,
            include_manga_meta=True,
        )

        self.assertIn("corpus_metadata", data)
        self.assertEqual(len(data["reviews"]), 1)
        self.assertEqual(data["reviews"][0]["review_title"], "Test Review")
        self.assertEqual(data["reviews"][0]["manga"]["title"], "Monster")

    async def test_router_endpoints_registered_and_working(self):
        from backend.models.review_export import ReviewCorpusExportRequest, ReviewCorpusExportResponse
        from backend.routers import analytics

        summary_mock = AsyncMock(return_value={"total_reviews": 5, "total_words": 1200})
        export_mock = AsyncMock(
            return_value=ReviewCorpusExportResponse(
                content="# Corpus",
                format="markdown",
                total_reviews=1,
                total_words=10,
                estimated_tokens=13,
                filename="manga_reviews_corpus_2026-10-04.md",
            )
        )

        with (
            patch.object(analytics.review_export_service, "get_review_corpus_summary", summary_mock),
            patch.object(analytics.review_export_service, "export_corpus", export_mock),
        ):
            summary = await analytics.get_review_corpus_summary()
            self.assertEqual(summary["total_reviews"], 5)

            export_req = ReviewCorpusExportRequest(format="markdown")
            export_res = await analytics.export_review_corpus(export_req)
            self.assertEqual(export_res.filename, "manga_reviews_corpus_2026-10-04.md")

            download_res = await analytics.download_review_corpus(format="markdown")
            self.assertEqual(download_res.media_type, "text/markdown; charset=utf-8")
            self.assertIn("Content-Disposition", download_res.headers)

    async def test_reviews_management_service_and_endpoint(self):
        from backend.models.review_export import ReviewManagementItem, ReviewManagementResponse
        from backend.routers import analytics

        sample_reviews = [
            (
                {
                    "_id": "rev1",
                    "manga_id": "m1",
                    "title": "Unmatched depth",
                    "content_json": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Gripping psychological thriller."}],
                            }
                        ],
                    },
                    "created_at": datetime(2026, 1, 1),
                },
                {
                    "_id": "m1",
                    "title": "Monster",
                    "cover_image_url": "https://example.com/monster.jpg",
                    "personal_rating": 9.5,
                    "read_status": "completed",
                },
            )
        ]

        with patch.object(self.service, "get_reviews_with_manga", AsyncMock(return_value=sample_reviews)):
            res = await self.service.get_reviews_management_list(db=AsyncMock(), search="Monster")
            self.assertEqual(res.total, 1)
            self.assertEqual(res.reviews[0].manga_title, "Monster")
            self.assertEqual(res.reviews[0].review_title, "Unmatched depth")
            self.assertGreater(res.reviews[0].word_count, 0)
            self.assertIn("Gripping", res.reviews[0].snippet)

        mock_mgmt = AsyncMock(
            return_value=ReviewManagementResponse(
                reviews=[
                    ReviewManagementItem(
                        id="rev1",
                        manga_id="m1",
                        manga_title="Monster",
                        review_title="Unmatched depth",
                        word_count=10,
                        character_count=50,
                        snippet="Gripping...",
                    )
                ],
                total=1,
            )
        )
        with patch.object(analytics.review_export_service, "get_reviews_management_list", mock_mgmt):
            api_res = await analytics.get_reviews_management(search="Monster")
            self.assertEqual(api_res.total, 1)
            self.assertEqual(api_res.reviews[0].review_title, "Unmatched depth")


if __name__ == "__main__":
    unittest.main()
