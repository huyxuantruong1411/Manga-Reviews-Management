import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from PIL import Image

from backend.core.redis import (
    close_redis_pool,
    delete_cache,
    delete_cache_pattern,
    deserialize_from_cache,
    get_cache,
    init_redis_pool,
    serialize_for_cache,
    set_cache,
)
from backend.routers.tasks import _resolve_task_status
from backend.tasks.ocr import process_manga_panel_ocr


class TestRedisCacheAndWorker(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Create a temporary dummy image file for OCR tests
        self.test_img_path = os.path.abspath("test_dummy_panel.png")
        img = Image.new("RGB", (400, 200), color=(255, 255, 255))
        img.save(self.test_img_path)

        # Initialize redis pool for tests
        self.redis_client = await init_redis_pool()

    def _require_redis(self):
        if not self.redis_client:
            self.skipTest("Live Redis server is not available; skipping live Redis test.")

    async def asyncTearDown(self):
        if os.path.exists(self.test_img_path):
            try:
                os.remove(self.test_img_path)
            except Exception:
                pass
        # Clean up any test cache keys
        await delete_cache_pattern("test:*")
        await delete_cache_pattern("task:ocr:test_*")
        from backend.core.redis import close_arq_pool

        await close_redis_pool()
        await close_arq_pool()

    # -----------------------------------------------------------------------
    # 1. Serialization & Encoder Tests
    # -----------------------------------------------------------------------
    def test_json_encoder_custom_types(self):
        oid = ObjectId()
        now = datetime.now(timezone.utc)
        sample = {
            "id": oid,
            "time": now,
            "tags": {"action", "shounen"},
            "title": "One Piece",
        }
        serialized = serialize_for_cache(sample)
        deserialized = deserialize_from_cache(serialized)

        self.assertEqual(deserialized["id"], str(oid))
        self.assertEqual(deserialized["title"], "One Piece")
        self.assertIn("action", deserialized["tags"])
        self.assertIn("shounen", deserialized["tags"])

    # -----------------------------------------------------------------------
    # 2. Redis Cache Operations (CRUD & Fallback)
    # -----------------------------------------------------------------------
    async def test_redis_cache_crud(self):
        self._require_redis()
        key = "test:manga:999"
        val = {"title": "Berserk", "chapters": 375}

        # Set
        ok = await set_cache(key, val, ttl=60)
        self.assertTrue(ok)

        # Get
        retrieved = await get_cache(key)
        self.assertEqual(retrieved, val)

        # Delete
        del_ok = await delete_cache(key)
        self.assertTrue(del_ok)

        # Confirm gone
        miss = await get_cache(key)
        self.assertIsNone(miss)

    async def test_redis_pattern_deletion(self):
        self._require_redis()
        await set_cache("test:pattern:1", {"a": 1})
        await set_cache("test:pattern:2", {"b": 2})
        await set_cache("test:other:1", {"c": 3})

        deleted = await delete_cache_pattern("test:pattern:*")
        self.assertEqual(deleted, 2)

        self.assertIsNone(await get_cache("test:pattern:1"))
        self.assertIsNone(await get_cache("test:pattern:2"))
        self.assertIsNotNone(await get_cache("test:other:1"))

    async def test_redis_graceful_fallback_when_offline(self):
        # Simulate Redis client returning None or throwing ConnectionError
        with patch("backend.core.redis.get_redis_client", return_value=None):
            # get_cache should safely return None
            res = await get_cache("test:nonexistent")
            self.assertIsNone(res)

            # set_cache should safely return False without exception
            set_res = await set_cache("test:key", {"data": 123})
            self.assertFalse(set_res)

            # delete_cache should safely return False without exception
            del_res = await delete_cache("test:key")
            self.assertFalse(del_res)

    # -----------------------------------------------------------------------
    # 3. Async OCR Worker Task Execution
    # -----------------------------------------------------------------------
    async def test_process_manga_panel_ocr_direct_call(self):
        # Test direct call: process_manga_panel_ocr(panel_id, image_path)
        with patch(
            "backend.tasks.ocr.vision_service.detect_text",
            return_value=[{"text": "HELLO WORLD", "confidence": 0.95, "norm_box": (0, 0, 1, 1)}],
        ):
            res = await process_manga_panel_ocr(101, self.test_img_path)

            self.assertEqual(res["panel_id"], "101")
            self.assertEqual(res["status"], "completed")
            self.assertIn("raw_text", res)
            self.assertIn("cleaned_text", res)
            self.assertIn("vocabulary", res)

    async def test_process_manga_panel_ocr_arq_context_call(self):
        self._require_redis()
        # Test ARQ worker call signature: (ctx, panel_id, image_path)
        ctx = {"job_id": "test_job_12345"}
        with patch(
            "backend.tasks.ocr.vision_service.detect_text",
            return_value=[{"text": "TEST BUBBLE", "confidence": 0.99, "norm_box": (0, 0, 1, 1)}],
        ):
            res = await process_manga_panel_ocr(ctx, panel_id=202, image_path=self.test_img_path)

            self.assertEqual(res["task_id"], "test_job_12345")
            self.assertEqual(res["panel_id"], "202")
            self.assertEqual(res["status"], "completed")

            # Verify that task status was saved to Redis
            cached_task = await get_cache("task:ocr:test_job_12345")
            self.assertIsNotNone(cached_task)
            self.assertEqual(cached_task["status"], "completed")

    async def test_process_manga_panel_ocr_file_not_found(self):
        with self.assertRaises(FileNotFoundError):
            await process_manga_panel_ocr(303, "non_existent_image_path_12345.jpg")

    # -----------------------------------------------------------------------
    # 4. Task Status Resolver Endpoint Logic
    # -----------------------------------------------------------------------
    async def test_resolve_task_status_from_cache(self):
        self._require_redis()
        job_id = "test_job_resolved"
        await set_cache(
            f"task:ocr:{job_id}",
            {
                "task_id": job_id,
                "panel_id": "505",
                "status": "completed",
                "cleaned_text": "Parsed dialogue text",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            },
            ttl=60,
        )

        resp = await _resolve_task_status(job_id)
        self.assertEqual(resp.task_id, job_id)
        self.assertEqual(resp.status, "completed")
        self.assertEqual(resp.panel_id, "505")
        self.assertIsNotNone(resp.result)

    async def test_resolve_task_status_not_found(self):
        resp = await _resolve_task_status("completely_unknown_job_id_xyz")
        self.assertEqual(resp.status, "not_found")


if __name__ == "__main__":
    unittest.main()
