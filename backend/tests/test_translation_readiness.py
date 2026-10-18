"""The bundled synthetic runner must never masquerade as a real engine."""

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from backend.models.translation import TranslationJobCreate, TranslationJobSource
from backend.services.translation.editor_service import translation_editor_service
from backend.services.translation.job_service import translation_job_service
from backend.services.translation.providers import translation_provider_service


class ReadinessTests(unittest.IsolatedAsyncioTestCase):
    async def test_placeholder_result_cannot_be_published(self):
        collection = SimpleNamespace(
            find_one=AsyncMock(
                return_value={
                    "result_id": "r",
                    "source_sha256": "src_sha_placeholder",
                    "active_revision": 1,
                }
            ),
            update_one=AsyncMock(),
        )
        with patch(
            "backend.database.connection.get_db",
            return_value={
                "translation_results": collection,
                "translation_page_bindings": collection,
            },
        ):
            with self.assertRaises(ValueError):
                await translation_editor_service.publish_result("chapter", "page", "r")
        collection.update_one.assert_not_called()

    async def test_unavailable_engine_rejects_job_before_any_db_write(self):
        request = TranslationJobCreate(source=TranslationJobSource(chapter_id="fixture"))
        database = MagicMock()
        with patch("backend.services.translation.runtime.has_translation_engine", return_value=False):
            with patch("backend.services.translation.job_service.get_db", database):
                with self.assertRaises(HTTPException) as caught:
                    await translation_job_service.create_job(request)
        self.assertEqual(caught.exception.status_code, 503)
        self.assertEqual(caught.exception.detail["code"], "TRANSLATION_ENGINE_UNAVAILABLE")
        database.assert_not_called()

    def test_hardware_probe_cannot_claim_real_engine_readiness(self):
        with patch("backend.services.translation.runtime.has_translation_engine", return_value=False):
            result = translation_provider_service.probe_runtime_environment()
            self.assertFalse(result["ready_for_inference"])
            self.assertEqual(result["engine"]["status"], "unavailable")

    def test_hardware_probe_reports_ready_when_engine_installed(self):
        with patch("backend.services.translation.runtime.has_translation_engine", return_value=True):
            result = translation_provider_service.probe_runtime_environment()
            self.assertTrue(result["ready_for_inference"])
            self.assertEqual(result["engine"]["status"], "ready")

    def test_offline_stub_is_labelled_synthetic(self):
        result = translation_provider_service.probe_provider_credentials("offline_stub")
        self.assertEqual(result["status"], "synthetic")
