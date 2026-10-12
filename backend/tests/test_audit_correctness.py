"""Reproductions of audited data correctness bugs using isolated fake boundaries."""

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from pydantic import ValidationError

from backend.models.manga import MangaCreate, MangaCreateDex, MangaUpdate
from backend.routers.reviews import router as reviews_router
from backend.services.analytics_service import AnalyticsService
from backend.services.translation.editor_service import translation_editor_service


class ValidationTests(unittest.IsolatedAsyncioTestCase):
    def test_titles_cannot_be_blank(self):
        for model in (MangaCreate, MangaUpdate):
            for title in ("", " \t\n"):
                with self.subTest(model=model.__name__, title=title):
                    with self.assertRaises(ValidationError):
                        model(title=title)

    def test_import_rating_has_the_same_domain_as_manual_entry(self):
        for rating in (-1, 99, 7.1, float("nan"), float("inf")):
            with self.subTest(rating=rating):
                with self.assertRaises(ValidationError):
                    MangaCreateDex(mangadex_id="fixture", personal_rating=rating)

    async def test_missing_review_body_is_422_before_database_access(self):
        app = FastAPI()
        app.include_router(reviews_router)
        mid = "507f1f77bcf86cd799439011"
        with patch("backend.routers.reviews.get_db", side_effect=AssertionError("Must not query DB")):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
            ) as client:
                self.assertEqual((await client.post(f"/api/manga/{mid}/reviews")).status_code, 422)
                self.assertEqual((await client.put(f"/api/manga/{mid}/reviews/{mid}")).status_code, 422)


class AnalyticsScopeTests(unittest.IsolatedAsyncioTestCase):
    async def test_no_matching_manga_cannot_count_other_mangas_completion(self):
        service = AnalyticsService()
        mangas = SimpleNamespace(
            count_documents=AsyncMock(return_value=0),
            find=lambda query: SimpleNamespace(distinct=AsyncMock(return_value=[])),
            aggregate=lambda pipeline: SimpleNamespace(to_list=AsyncMock(return_value=[])),
        )

        async def count_audit(query):
            return 0 if query.get("entity_id") == {"$in": []} else 7

        service._get_mangas_collection = lambda: mangas
        service._get_reviews_collection = lambda: SimpleNamespace(count_documents=AsyncMock(return_value=0))
        service._get_audit_collection = lambda: SimpleNamespace(count_documents=count_audit)
        result = await service.get_overview_stats({"title": "not found"})
        self.assertEqual(result["total_manga"], 0)
        for period in ("last_7d", "prev_7d", "last_30d", "prev_30d"):
            self.assertEqual(result["velocity"][f"completed_{period}"], 0)


class TranslationEditTests(unittest.IsolatedAsyncioTestCase):
    async def test_edit_invalidates_previous_render_before_publish(self):
        collection = SimpleNamespace(
            find_one=AsyncMock(return_value={"result_id": "r", "active_revision": 1, "output_object_key": "old.jpg"}),
            update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)),
        )
        with patch("backend.database.connection.get_db", return_value={"translation_results": collection}):
            result = await translation_editor_service.save_regions("r", [], expected_revision=1)
        self.assertFalse(result.get("output_object_key"))
        self.assertEqual(collection.update_one.call_args.args[1]["$set"]["output_object_key"], "")

    async def test_rerender_uses_immutable_key_and_rejects_concurrent_edit(self):
        import io

        from PIL import Image

        image = io.BytesIO()
        Image.new("RGB", (8, 8), "white").save(image, "PNG")
        collection = SimpleNamespace(
            find_one=AsyncMock(
                return_value={"result_id": "r", "active_revision": 1, "regions": [], "clean_object_key": "clean.png"}
            ),
            update_one=AsyncMock(return_value=SimpleNamespace(matched_count=0)),
        )
        with (
            patch("backend.database.connection.get_db", return_value={"translation_results": collection}),
            patch(
                "backend.services.translation.editor_service.translation_storage_service.get_object_bytes",
                AsyncMock(return_value=image.getvalue()),
            ),
            patch(
                "backend.services.translation.editor_service.translation_storage_service.upload_file", AsyncMock()
            ) as upload,
        ):
            with self.assertRaises(ValueError):
                await translation_editor_service.rerender_result("r")
        self.assertNotEqual(upload.call_args.args[0], "translation/outputs/r_rev1.jpg")
        self.assertEqual(collection.update_one.call_args.args[0]["active_revision"], 1)

    async def test_save_fails_when_another_writer_wins_after_the_read(self):
        collection = SimpleNamespace(
            find_one=AsyncMock(return_value={"result_id": "r", "active_revision": 1}),
            update_one=AsyncMock(return_value=SimpleNamespace(matched_count=0)),
        )
        with patch("backend.database.connection.get_db", return_value={"translation_results": collection}):
            with self.assertRaises(ValueError):
                await translation_editor_service.save_regions("r", [], expected_revision=1)
        self.assertEqual(collection.update_one.call_args.args[0]["active_revision"], 1)

    async def test_missing_clean_image_never_produces_a_blank_success(self):
        collection = SimpleNamespace(
            find_one=AsyncMock(return_value={"result_id": "r", "active_revision": 1, "regions": []}),
            update_one=AsyncMock(),
        )
        with (
            patch("backend.database.connection.get_db", return_value={"translation_results": collection}),
            patch(
                "backend.services.translation.editor_service.translation_storage_service.upload_file",
                new_callable=AsyncMock,
            ),
        ):
            with self.assertRaises(ValueError):
                await translation_editor_service.rerender_result("r")
        collection.update_one.assert_not_called()
