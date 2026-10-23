import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

from backend.models.datalake_pool import PublishToPoolRequest
from backend.services.content_deletion_service import source_object_is_shared
from backend.services.datalake_pool_service import DatalakePoolService


class TestDatalakePool(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.review_db = MagicMock()
        self.review_db.mangas.find_one = AsyncMock(return_value=None)
        self.pool_db = MagicMock()
        self.service = DatalakePoolService()
        self.service._get_source_db = MagicMock(return_value=self.review_db)
        self.service._get_pool_db = MagicMock(return_value=self.pool_db)

    async def test_cannot_publish_manga_without_pages(self):
        manga_id = str(ObjectId())

        # Manga exists but has no chapters with pages
        self.review_db.mangas.find_one = AsyncMock(return_value={"_id": ObjectId(manga_id), "title": "Test Manga"})
        self.review_db.chapters.find = MagicMock(return_value=AsyncMock(to_list=AsyncMock(return_value=[])))

        req = PublishToPoolRequest(source_manga_ids=[manga_id])
        res = await self.service.publish_mangas_to_pool(req)

        self.assertEqual(res.success_count, 0)
        self.assertEqual(res.error_count, 1)
        self.assertIn("chưa có dữ liệu trang truyện", res.results[0].error.lower())

    async def test_publish_manga_encapsulates_full_metadata_and_zero_copy_keys(self):
        manga_id = str(ObjectId())
        chapter_id = str(ObjectId())
        tag_id = str(ObjectId())
        creator_name = "Oda Eiichiro"

        manga_doc = {
            "_id": ObjectId(manga_id),
            "title": "One Piece",
            "alt_titles": ["Đảo Hải Tặc"],
            "description": "Epic pirate adventure",
            "author": creator_name,
            "artist": creator_name,
            "year": "1997",
            "status": "ongoing",
            "tag_ids": [tag_id],
            "content_rating": "safe",
            "minio_cover_key": "covers/one_piece.jpg",
        }
        chapter_doc = {
            "_id": ObjectId(chapter_id),
            "manga_id": manga_id,
            "chapter_number": "1",
            "chapter_numeric": 1.0,
            "volume": "1",
            "title": "Romance Dawn",
            "language": "en",
            "page_count": 2,
            "pages": [
                {
                    "page_uid": "uid-1",
                    "page_number": 1,
                    "filename": "001.jpg",
                    "object_key": "chapters/one_piece/ch1/001.jpg",
                    "file_size": 102400,
                    "md5_hash": "hash001",
                },
                {
                    "page_uid": "uid-2",
                    "page_number": 2,
                    "filename": "002.jpg",
                    "object_key": "chapters/one_piece/ch1/002.jpg",
                    "file_size": 204800,
                    "md5_hash": "hash002",
                },
            ],
        }
        tag_doc = {
            "_id": ObjectId(tag_id),
            "name": {"en": "Adventure", "vi": "Phiêu lưu"},
            "group": "genre",
            "color": "#FF5722",
        }
        creator_doc = {
            "name": creator_name,
            "role": "author",
            "biography": {"en": "Legendary mangaka"},
        }

        self.review_db.mangas.find_one = AsyncMock(return_value=manga_doc)
        self.review_db.chapters.find = MagicMock(return_value=AsyncMock(to_list=AsyncMock(return_value=[chapter_doc])))

        # Async iterator cursor for tags & creators
        class AsyncCursor:
            def __init__(self, docs):
                self.docs = docs

            def __aiter__(self):
                async def gen():
                    for d in self.docs:
                        yield d

                return gen()

        self.review_db.tags.find = MagicMock(return_value=AsyncCursor([tag_doc]))
        self.review_db.creators.find = MagicMock(return_value=AsyncCursor([creator_doc]))
        self.review_db.cover_arts.find = MagicMock(return_value=AsyncCursor([]))

        self.pool_db.pool_mangas.find_one = AsyncMock(return_value=None)
        self.pool_db.pool_mangas.update_one = AsyncMock()
        self.pool_db.pool_chapters.delete_many = AsyncMock()
        self.pool_db.pool_chapters.insert_many = AsyncMock()
        self.pool_db.pool_audit_logs.insert_one = AsyncMock()

        with (
            patch("backend.services.minio_service.minio_service.upload_cover") as mock_up_cov,
            patch("backend.services.minio_service.minio_service.upload_chapter_page") as mock_up_page,
        ):
            req = PublishToPoolRequest(source_manga_ids=[manga_id])
            res = await self.service.publish_mangas_to_pool(req)

            self.assertEqual(res.success_count, 1)
            self.assertEqual(res.error_count, 0)
            self.assertEqual(mock_up_cov.call_count, 0)  # Zero-Copy!
            self.assertEqual(mock_up_page.call_count, 0)

        # Check pool_mangas update call
        update_call = self.pool_db.pool_mangas.update_one.call_args
        self.assertIsNotNone(update_call)
        set_doc = update_call[0][1]["$set"]
        self.assertEqual(set_doc["title"], "One Piece")
        self.assertEqual(len(set_doc["tags"]), 1)
        self.assertEqual(set_doc["tags"][0]["name"]["en"], "Adventure")
        self.assertEqual(set_doc["tags"][0]["name"]["vi"], "Phiêu lưu")
        self.assertEqual(set_doc["primary_cover"]["object_key"], "covers/one_piece.jpg")
        self.assertEqual(set_doc["stats"]["total_pages"], 2)

    async def test_pool_crud_and_page_deletion_never_deletes_minio_objects(self):
        pool_chapter_id = "pch_123"

        chapter_data = {
            "pool_chapter_id": pool_chapter_id,
            "pool_manga_id": "pm_123",
            "chapter_number": "1",
            "pages": [
                {"page_uid": "p1", "page_number": 1, "filename": "1.jpg", "object_key": "k1", "file_size": 100},
                {"page_uid": "p2", "page_number": 2, "filename": "2.jpg", "object_key": "k2", "file_size": 100},
                {"page_uid": "p3", "page_number": 3, "filename": "3.jpg", "object_key": "k3", "file_size": 100},
            ],
            "page_count": 3,
            "total_size_bytes": 300,
        }
        self.pool_db.pool_chapters.find_one = AsyncMock(return_value=chapter_data)
        self.pool_db.pool_chapters.update_one = AsyncMock()
        self.pool_db.pool_chapters.find = MagicMock(
            return_value=AsyncMock(to_list=AsyncMock(return_value=[chapter_data]))
        )
        self.pool_db.pool_mangas.find_one = AsyncMock(return_value={"pool_manga_id": "pm_123", "stats": {}})
        self.pool_db.pool_mangas.update_one = AsyncMock()

        with (
            patch("backend.services.minio_service.minio_service.delete_chapter_page") as mock_del_page,
            patch("backend.services.minio_service.minio_service.delete_cover") as mock_del_cover,
        ):
            # Delete page 2 from pool chapter
            updated = await self.service.delete_pool_chapter_pages(pool_chapter_id, [2])

            self.assertIsNotNone(updated)
            self.assertEqual(mock_del_page.call_count, 0)
            self.assertEqual(mock_del_cover.call_count, 0)

            # Verify pages renumbered to 1, 2
            update_args = self.pool_db.pool_chapters.update_one.call_args[0][1]["$set"]
            remaining_pages = update_args["pages"]
            self.assertEqual(len(remaining_pages), 2)
            self.assertEqual(remaining_pages[0]["page_number"], 1)
            self.assertEqual(remaining_pages[0]["page_uid"], "p1")
            self.assertEqual(remaining_pages[1]["page_number"], 2)
            self.assertEqual(remaining_pages[1]["page_uid"], "p3")

    async def test_source_object_is_shared_protects_pooled_media(self):
        review_db = MagicMock()
        review_db.chapters.find_one = AsyncMock(return_value=None)
        review_db.mangas.find_one = AsyncMock(return_value=None)
        review_db.cover_arts.find_one = AsyncMock(return_value=None)

        pool_db = MagicMock()
        # Found in pool_chapters!
        pool_db.pool_chapters.find_one = AsyncMock(return_value={"_id": ObjectId()})
        pool_db.pool_mangas.find_one = AsyncMock(return_value=None)

        with patch("backend.database.connection.get_pool_db", return_value=pool_db):
            is_shared = await source_object_is_shared(review_db, "chapters/ch1/001.jpg")
            self.assertTrue(is_shared)

    async def test_pool_metadata_editing_is_isolated_from_review_db(self):
        pool_manga_id = "pm_abc"

        self.pool_db.pool_mangas.find_one = AsyncMock(
            return_value={
                "pool_manga_id": pool_manga_id,
                "source_manga_id": str(ObjectId()),
                "title": "Old Pool Title",
                "lineage": {"pool_revision": 1},
            }
        )
        self.pool_db.pool_mangas.update_one = AsyncMock()
        self.pool_db.pool_audit_logs.insert_one = AsyncMock()

        await self.service.update_pool_manga(pool_manga_id, {"title": "New Pool Title", "status": "completed"})

        # Assert pool_db was updated
        self.pool_db.pool_mangas.update_one.assert_called_once()
        # Assert review_db was NOT called
        self.review_db.mangas.update_one.assert_not_called()

    async def test_scan_and_cleanup_duplicates(self):
        pool_manga_id = "pm_dup"
        pool_ch_id = "pch_dup"
        chapter_doc = {
            "pool_chapter_id": pool_ch_id,
            "pool_manga_id": pool_manga_id,
            "chapter_number": "1",
            "pages": [
                {
                    "page_uid": "p1",
                    "page_number": 1,
                    "filename": "1.jpg",
                    "object_key": "k1",
                    "file_size": 100,
                    "md5_hash": "dup_md5",
                },
                {
                    "page_uid": "p2",
                    "page_number": 2,
                    "filename": "2.jpg",
                    "object_key": "k2",
                    "file_size": 100,
                    "md5_hash": "dup_md5",
                },
                {
                    "page_uid": "p3",
                    "page_number": 3,
                    "filename": "3.jpg",
                    "object_key": "k3",
                    "file_size": 200,
                    "md5_hash": "unique_md5",
                },
            ],
            "page_count": 3,
            "total_size_bytes": 400,
        }
        self.pool_db.pool_chapters.find = MagicMock(
            return_value=AsyncMock(to_list=AsyncMock(return_value=[chapter_doc]))
        )
        self.pool_db.pool_chapters.find_one = AsyncMock(return_value=chapter_doc)
        self.pool_db.pool_chapters.update_one = AsyncMock()
        self.pool_db.pool_mangas.find_one = AsyncMock(return_value={"pool_manga_id": pool_manga_id, "stats": {}})
        self.pool_db.pool_mangas.update_one = AsyncMock()

        # 1. Scan
        groups = await self.service.scan_pool_duplicates(pool_manga_id)
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0].hash_value, "dup_md5")
        self.assertEqual(len(groups[0].items), 2)

        # 2. Cleanup target page 2
        from backend.models.datalake_pool import PoolDuplicateTarget

        cleanup_res = await self.service.cleanup_pool_duplicates(
            pool_manga_id, [PoolDuplicateTarget(pool_chapter_id=pool_ch_id, page_number=2)]
        )
        self.assertTrue(cleanup_res["success"])
        self.assertEqual(cleanup_res["removed_pages_count"], 1)

    async def test_verify_pool_manga_integrity(self):
        pool_manga_id = "pm_verify"
        manga_doc = {
            "pool_manga_id": pool_manga_id,
            "primary_cover": {"object_key": "covers/test.jpg"},
            "cover_arts": [],
        }
        chapter_doc = {
            "pool_chapter_id": "ch1",
            "pages": [{"object_key": "pages/1.jpg"}],
        }

        class AsyncCursor:
            def __init__(self, docs):
                self.docs = docs

            def __aiter__(self):
                async def gen():
                    for d in self.docs:
                        yield d

                return gen()

        self.pool_db.pool_mangas.find_one = AsyncMock(return_value=manga_doc)
        self.pool_db.pool_chapters.find = MagicMock(return_value=AsyncCursor([chapter_doc]))

        with patch("backend.services.minio_service.minio_service.object_exists") as mock_exists:
            # First simulate all existing
            mock_exists.return_value = True
            report = await self.service.verify_pool_manga_integrity(pool_manga_id)
            self.assertTrue(report.is_healthy)
            self.assertEqual(len(report.missing_keys), 0)

            # Next simulate missing page object
            mock_exists.side_effect = lambda k: k != "pages/1.jpg"
            report_fail = await self.service.verify_pool_manga_integrity(pool_manga_id)
            self.assertFalse(report_fail.is_healthy)
            self.assertIn("pages/1.jpg", report_fail.missing_keys)
