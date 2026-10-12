"""Regression boundaries from the October system audit. No external requests."""

import copy
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from backend.config import settings
from backend.routers import reviews
from backend.services import ai_service
from backend.services.minio_service import MinioService
from backend.services.translation.profiles import translation_profile_service


class StorageSafetyTests(unittest.TestCase):
    def test_upload_does_not_change_bucket_policy(self):
        client = MagicMock()
        client.bucket_exists.return_value = False
        with patch.object(reviews.minio_service, "client", client):
            reviews._ensure_bucket("review-images")
        client.make_bucket.assert_called_once_with("review-images")
        client.set_bucket_policy.assert_not_called()

    def test_minio_uses_tls_configuration(self):
        with patch.object(settings, "minio_secure", True), patch("backend.services.minio_service.Minio") as client:
            MinioService()
        self.assertTrue(client.call_args.kwargs["secure"])

    def test_review_media_url_is_persistent_same_origin(self):
        mid = "507f1f77bcf86cd799439011"
        url = reviews._build_public_url("review-images", f"{mid}/image.png")
        self.assertEqual(url, f"/api/manga/{mid}/reviews/media/review-images/image.png")


class CredentialTests(unittest.IsolatedAsyncioTestCase):
    def test_redaction_descends_into_lists_without_mutating_input(self):
        config = {"providers": [{"api_key": "test-secret", "children": [{"token": "nested"}]}]}
        original = copy.deepcopy(config)
        clean = translation_profile_service.sanitize_config_for_export(config)
        self.assertNotIn("test-secret", str(clean))
        self.assertNotIn("nested", str(clean))
        self.assertEqual(config, original)

    async def test_profile_read_never_exposes_stored_credentials(self):
        doc = {"profile_id": "p", "effective_config": {"api_key": "test-secret"}}
        collection = SimpleNamespace(find_one=AsyncMock(return_value=copy.deepcopy(doc)))
        with patch("backend.database.connection.get_db", return_value={"translation_profiles": collection}):
            result = await translation_profile_service.get_profile("p")
        self.assertNotIn("test-secret", str(result))

    async def test_gemini_key_is_a_header_not_part_of_url(self):
        response = SimpleNamespace(
            status_code=200,
            json=lambda: {"candidates": [{"content": {"parts": [{"text": "test response"}]}}]},
        )
        client = MagicMock()
        client.post = AsyncMock(return_value=response)
        client.__aenter__.return_value = client
        with (
            patch.object(settings, "gemini_api_key", "test-key"),
            patch.object(ai_service.httpx, "AsyncClient", return_value=client),
        ):
            await ai_service.call_gemini("ideas", {"title": "Synthetic"})
        call = client.post.call_args
        self.assertNotIn("test-key", call.args[0])
        self.assertEqual(call.kwargs["headers"]["x-goog-api-key"], "test-key")


def test_nested_review_media_retains_category_in_resolver_url():
    from backend.services.review_media_service import build_media_url

    manga_id = "507f1f77bcf86cd799439011"
    assert build_media_url("review-media", f"{manga_id}/audio/fixture.mp3") == (
        f"/api/manga/{manga_id}/reviews/media/review-media/audio/fixture.mp3"
    )
