import io
import unittest
import zipfile
from unittest.mock import AsyncMock, MagicMock, patch

from PIL import Image

from backend.models.chapter_export import (
    ChapterExportRequest,
)
from backend.services.chapter_export_service import ChapterExportService


class TestChapterExportService(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.service = ChapterExportService()

    def _create_mock_image(self, width: int = 100, height: int = 150, color: str = "blue") -> bytes:
        img = Image.new("RGB", (width, height), color=color)
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        return buf.getvalue()

    def test_request_validation(self):
        req = ChapterExportRequest()
        self.assertEqual(req.format, "pdf")
        self.assertEqual(req.grouping, "single_file")
        self.assertEqual(req.destination, "browser")
        self.assertTrue(req.include_metadata)

        custom = ChapterExportRequest(
            chapter_ids=["chap-1", "chap-2"],
            format="cbz",
            grouping="by_volume",
            destination="local_folder",
            local_path="D:/Manga/Export",
            auto_open_explorer=True,
            image_optimization="compressed",
        )
        self.assertEqual(custom.format, "cbz")
        self.assertEqual(custom.grouping, "by_volume")
        self.assertEqual(custom.local_path, "D:/Manga/Export")
        self.assertTrue(custom.auto_open_explorer)

    def test_generate_comic_info_xml(self):
        xml_content = self.service.generate_comic_info_xml(
            manga_title="One Piece",
            chapter_number="1000",
            volume="100",
            chapter_title="Straw Hat Luffy",
            page_count=20,
            summary="Epic chapter",
            authors=["Eiichiro Oda"],
            language="en",
        )
        self.assertIn("<Series>One Piece</Series>", xml_content)
        self.assertIn("<Number>1000</Number>", xml_content)
        self.assertIn("<Volume>100</Volume>", xml_content)
        self.assertIn("<Title>Straw Hat Luffy</Title>", xml_content)
        self.assertIn("<PageCount>20</PageCount>", xml_content)
        self.assertIn("<Writer>Eiichiro Oda</Writer>", xml_content)
        self.assertIn("<LanguageISO>en</LanguageISO>", xml_content)

    def test_create_pdf_from_images(self):
        img1 = self._create_mock_image(width=50, height=80, color="red")
        img2 = self._create_mock_image(width=50, height=80, color="green")
        images_data = [("001.jpg", img1), ("002.jpg", img2)]

        pdf_bytes = self.service.create_pdf_from_images(images_data, optimize=False)
        self.assertTrue(len(pdf_bytes) > 0)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))

    def test_create_zip_or_cbz_archive(self):
        img1 = self._create_mock_image(width=40, height=60, color="blue")
        img2 = self._create_mock_image(width=40, height=60, color="yellow")
        files = [
            ("Volume 01/Chapter 001/001.jpg", img1),
            ("Volume 01/Chapter 001/002.jpg", img2),
            ("ComicInfo.xml", b"<ComicInfo><Title>Test</Title></ComicInfo>"),
        ]

        archive_bytes = self.service.create_zip_archive(files)
        self.assertTrue(len(archive_bytes) > 0)

        with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as zf:
            namelist = zf.namelist()
            self.assertIn("Volume 01/Chapter 001/001.jpg", namelist)
            self.assertIn("Volume 01/Chapter 001/002.jpg", namelist)
            self.assertIn("ComicInfo.xml", namelist)
            self.assertEqual(zf.read("ComicInfo.xml"), b"<ComicInfo><Title>Test</Title></ComicInfo>")

    @patch("backend.services.chapter_export_service.subprocess.Popen")
    def test_reveal_in_windows_explorer(self, mock_popen):
        with (
            patch("sys.platform", "win32"),
            patch("os.path.exists", return_value=True),
            patch("os.path.isfile", return_value=True),
        ):
            res = self.service.reveal_in_windows_explorer("C:\\Export\\test.pdf")
            self.assertTrue(res["success"])
            mock_popen.assert_called_once()
            args = mock_popen.call_args[0][0]
            self.assertIn("explorer", args[0].lower() if isinstance(args, list) else args.lower())

    @patch("backend.services.chapter_export_service.get_db")
    @patch("backend.services.chapter_export_service.chapter_service.get_manga_chapters")
    @patch("backend.services.chapter_export_service.minio_service.client.get_object")
    async def test_stream_export_manga(self, mock_minio_get, mock_get_chapters, mock_get_db):
        from bson import ObjectId

        from backend.models.chapter import ChapterInDB, PageItem

        manga_oid = ObjectId()
        mock_db = MagicMock()
        mock_db.mangas.find_one = AsyncMock(
            return_value={
                "_id": manga_oid,
                "title": "Mock Manga",
                "authors": ["Author A"],
                "description": "Mock Description",
            }
        )
        mock_get_db.return_value = mock_db

        mock_page = PageItem(
            page_number=1,
            filename="001.jpg",
            object_key="chapters/m1/c1/001.jpg",
            file_size=100,
        )
        mock_chapter = ChapterInDB(
            _id=ObjectId(),
            manga_id=str(manga_oid),
            chapter_number="1",
            chapter_numeric=1.0,
            volume="1",
            title="First Chapter",
            pages=[mock_page],
            page_count=1,
        )
        mock_get_chapters.return_value = [mock_chapter]

        mock_resp = MagicMock()
        mock_resp.read.return_value = self._create_mock_image(50, 50, "purple")
        mock_minio_get.return_value = mock_resp

        req = ChapterExportRequest(
            format="pdf",
            grouping="single_file",
            destination="browser",
        )

        events = []
        async for sse_chunk in self.service.stream_export_manga(str(manga_oid), req):
            events.append(sse_chunk)

        self.assertTrue(len(events) >= 3)
        event_texts = "".join(events)
        self.assertIn('"type": "init"', event_texts)
        self.assertIn('"type": "chapter_start"', event_texts)
        self.assertIn('"type": "page_progress"', event_texts)
        self.assertIn('"type": "completed"', event_texts)

    @patch("backend.services.chapter_export_service.get_db")
    @patch("backend.services.chapter_export_service.chapter_service.get_manga_chapters")
    @patch("backend.services.chapter_export_service.minio_service.client.get_object")
    async def test_stream_export_manga_with_dict_chapters_and_id_filter(
        self, mock_minio_get, mock_get_chapters, mock_get_db
    ):
        from bson import ObjectId

        manga_oid = ObjectId()
        mock_db = MagicMock()
        mock_db.mangas.find_one = AsyncMock(
            return_value={
                "_id": manga_oid,
                "title": "Dict Manga",
                "authors": ["Author B"],
            }
        )
        mock_get_db.return_value = mock_db

        chap1_id = "6ac3fe8710f653ef6ae57778"
        chap2_id = "6ac3fe8710f653ef6ae57779"

        dict_chapters = [
            {
                "id": chap1_id,
                "manga_id": str(manga_oid),
                "chapter_number": "1",
                "chapter_numeric": 1.0,
                "volume": "1",
                "title": "Dict Chap 1",
                "pages": [{"filename": "001.jpg", "object_key": "k1", "page_number": 1}],
            },
            {
                "id": chap2_id,
                "manga_id": str(manga_oid),
                "chapter_number": "2",
                "chapter_numeric": 2.0,
                "volume": "1",
                "title": "Dict Chap 2",
                "pages": [{"filename": "002.jpg", "object_key": "k2", "page_number": 1}],
            },
        ]
        mock_get_chapters.return_value = dict_chapters

        mock_resp = MagicMock()
        mock_resp.read.return_value = self._create_mock_image(50, 50, "green")
        mock_minio_get.return_value = mock_resp

        req = ChapterExportRequest(
            chapter_ids=[chap1_id],  # only chapter 1
            format="zip",
            grouping="by_chapter",
            destination="browser",
        )

        events = []
        async for sse_chunk in self.service.stream_export_manga(str(manga_oid), req):
            events.append(sse_chunk)

        event_texts = "".join(events)
        self.assertIn('"type": "init"', event_texts)
        self.assertIn('"total_chapters": 1', event_texts)
        self.assertIn('"chapter_id": "' + chap1_id + '"', event_texts)
        self.assertNotIn(chap2_id, event_texts)
        self.assertIn('"type": "completed"', event_texts)


if __name__ == "__main__":
    unittest.main()
