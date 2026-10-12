import io
import unittest
import zipfile
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from PIL import Image

from backend.services.translation.export_service import translation_export_service


class TranslationExportRegressionTests(unittest.IsolatedAsyncioTestCase):
    async def test_object_id_chapter_and_png_bytes_are_preserved(self):
        chapter_id = ObjectId()
        chapter = {"_id": chapter_id, "pages": [{"page_uid": "p1", "page_number": 1, "object_key": "fixture.png"}]}

        async def find_chapter(query):
            return chapter if query.get("_id") == chapter_id else None

        binding_queries = []

        def find_bindings(query):
            binding_queries.append(query)
            return SimpleNamespace(to_list=AsyncMock(return_value=[]))

        db = {
            "chapters": SimpleNamespace(find_one=find_chapter),
            "translation_page_bindings": SimpleNamespace(find=find_bindings),
        }
        stream = io.BytesIO()
        Image.new("RGB", (4, 5), "blue").save(stream, "PNG")
        with (
            patch("backend.database.connection.get_db", return_value=db),
            patch.object(translation_export_service, "_fetch_object_bytes", AsyncMock(return_value=stream.getvalue())),
        ):
            result = await translation_export_service.export_chapter(str(chapter_id), target_language="en")
        with zipfile.ZipFile(io.BytesIO(result)) as archive:
            self.assertEqual(archive.read("001.png"), stream.getvalue())
        self.assertEqual(binding_queries[0]["target_language"], "en")
        self.assertEqual(binding_queries[0]["scope"], "local")
