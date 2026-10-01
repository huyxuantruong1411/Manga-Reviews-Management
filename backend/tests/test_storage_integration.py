"""Opt-in integration test using a newly created, isolated Mongo DB and bucket.

RUN_STORAGE_INTEGRATION=1 python -m unittest discover -s backend/tests -v
No existing database, bucket, manga, or download directory is modified.
"""

import asyncio
import io
import os
import time
import unittest
from uuid import uuid4

import httpx
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image, ImageDraw, ImageFont

from backend.config import settings
from backend.database.connection import db_instance
from backend.main import app
from backend.services.minio_service import minio_service
from backend.services.panel_scanner_service import panel_scanner_service


@unittest.skipUnless(os.environ.get("RUN_STORAGE_INTEGRATION") == "1", "Opt-in isolated storage test")
class StorageIntegration(unittest.IsolatedAsyncioTestCase):
    async def test_detector_reader_and_cascade(self):
        suffix = uuid4().hex
        database_name = "manga_regression_" + suffix
        bucket = "manga-regression-" + suffix
        mongo = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
        previous_db, previous_bucket = db_instance.db, minio_service.bucket
        created_bucket = False
        manga_id, chapter_id = ObjectId(), ObjectId()
        key = f"chapters/{manga_id}/source-uuid/001.png"
        try:
            await mongo.admin.command("ping")
            db_instance.db = mongo[database_name]
            await asyncio.to_thread(minio_service.client.make_bucket, bucket)
            created_bucket = True
            minio_service.bucket = bucket
            await db_instance.db.mangas.insert_one(
                {"_id": manga_id, "title": "Isolated OCR regression", "read_status": "unread"}
            )
            image = Image.new("RGB", (900, 280), "white")
            draw = ImageDraw.Draw(image)
            try:
                font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 48)
            except OSError:
                font = ImageFont.load_default(size=48)
            draw.text((30, 80), "HELLO FRIEND. WE HAVE A DREAM.", fill="black", font=font)
            image_bytes = io.BytesIO()
            image.save(image_bytes, format="PNG")
            data = image_bytes.getvalue()
            await asyncio.to_thread(
                minio_service.client.put_object, bucket, key, io.BytesIO(data), len(data), content_type="image/png"
            )
            await db_instance.db.chapters.insert_one(
                {
                    "_id": chapter_id,
                    "manga_id": str(manga_id),
                    "chapter_number": "1",
                    "chapter_numeric": 1,
                    "language": "en",
                    "pages": [
                        {
                            "page_number": 1,
                            "filename": "001.png",
                            "object_key": key,
                            "width": 900,
                            "height": 280,
                            "md5_hash": "fixture-hash",
                        }
                    ],
                    "page_count": 1,
                }
            )
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                start = await client.post("/api/panels/scan", json={"manga_ids": [str(manga_id)]})
                self.assertEqual(start.status_code, 200, start.text)
                deadline = time.monotonic() + 60
                while panel_scanner_service._global_scan_active and time.monotonic() < deadline:
                    await asyncio.sleep(0.05)
                status = (await client.get("/api/panels/scan-status")).json()
                self.assertEqual(status["stage"], "completed", status)
                self.assertFalse(status["is_scanning"])
                search = await client.get("/api/panels/search", params={"q": "hello", "manga_id": str(manga_id)})
                self.assertEqual(search.status_code, 200, search.text)
                results = search.json()["results"]
                self.assertTrue(results, search.text)
                panel_id = results[0]["panel_id"]
                crop = await client.get(f"/api/panels/{panel_id}/crop")
                self.assertEqual(crop.status_code, 200)
                self.assertEqual(crop.headers["content-type"], "image/jpeg")
                original = await client.get(f"/api/panels/{panel_id}/page-image")
                self.assertEqual(original.headers["content-type"], "image/png")
                self.assertEqual(original.content, data)
                progress = {"chapter_id": str(chapter_id), "chapter_number": "1", "page": 1, "mark_as_read": True}
                saved = await client.post(f"/api/manga/{manga_id}/reading-progress", json=progress)
                self.assertEqual(saved.status_code, 200, saved.text)
                foreign = await client.post(f"/api/manga/{ObjectId()}/reading-progress", json=progress)
                self.assertEqual(foreign.status_code, 422, foreign.text)
                self.assertEqual(await db_instance.db.panel_scan_pages.count_documents({}), 1)
                deleted = await client.delete(f"/api/chapters/{chapter_id}")
                self.assertEqual(deleted.status_code, 200, deleted.text)
                self.assertEqual(await db_instance.db.manga_panels.count_documents({}), 0)
                self.assertEqual(await db_instance.db.panel_scan_pages.count_documents({}), 0)
                progress = (await client.get(f"/api/manga/{manga_id}/reading-progress")).json()
                self.assertIsNone(progress["last_read_chapter_id"])
                self.assertEqual(progress["read_chapter_ids"], [])
                self.assertEqual((await client.get(f"/api/panels/{panel_id}/crop")).status_code, 404)
                remaining = await asyncio.to_thread(
                    lambda: list(minio_service.client.list_objects(bucket, recursive=True))
                )
                self.assertEqual(remaining, [])
        finally:
            minio_service.bucket = previous_bucket
            db_instance.db = previous_db
            # Only the unique resources created by this test are eligible for cleanup.
            assert database_name == "manga_regression_" + suffix
            await mongo.drop_database(database_name)
            mongo.close()
            if created_bucket:
                await asyncio.to_thread(minio_service.client.remove_object, bucket, key)
                await asyncio.to_thread(minio_service.client.remove_bucket, bucket)


if __name__ == "__main__":
    unittest.main()
