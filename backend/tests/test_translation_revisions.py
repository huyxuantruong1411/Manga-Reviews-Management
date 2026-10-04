"""TDD tests for Translation Result Revisions, Re-render No-LLM, and Chapter Export.

Tests verify:
- Editing regions increments result revision and detects edit conflicts (409).
- Re-rendering redraws text onto clean canvas without invoking any external LLM provider.
- Exporting chapter packages translated and original fallback pages into a valid ZIP with manifest.json.
"""

import io
import zipfile

import pytest

from backend.models.translation import RegionData
from backend.services.translation.editor_service import translation_editor_service
from backend.services.translation.export_service import translation_export_service


@pytest.mark.anyio
async def test_editor_update_regions_increments_revision(monkeypatch):
    """Editing region text increments active_revision and updates region content."""
    fake_results = {
        "res_1": {
            "result_id": "res_1",
            "active_revision": 1,
            "chapter_id": "chap_1",
            "page_uid": "p_uid_1",
            "output_object_key": "translation/outputs/res_1_rev1.jpg",
            "clean_object_key": "translation/clean/res_1.jpg",
            "regions": [
                {
                    "region_id": "reg_1",
                    "bounding_box": {"x": 0.1, "y": 0.1, "width": 0.3, "height": 0.2},
                    "reading_order": 1,
                    "source_text": "こんにちは",
                    "translated_text": "Xin chào",
                }
            ],
        }
    }

    class MockResultsCol:
        async def find_one(self, query):
            return fake_results.get(query.get("result_id"))

        async def update_one(self, query, update):
            rid = query.get("result_id")
            if rid in fake_results:
                fake_results[rid].update(update.get("$set", {}))
                return True
            return False

    class MockDB:
        def __getitem__(self, item):
            return MockResultsCol()

    monkeypatch.setattr("backend.database.connection.get_db", lambda: MockDB())

    updated_regions = [
        RegionData(
            region_id="reg_1",
            bounding_box={"x": 0.1, "y": 0.1, "width": 0.3, "height": 0.2},
            reading_order=1,
            source_text="こんにちは",
            translated_text="Chào bạn nhé! (Đã chỉnh sửa)",
        )
    ]

    res = await translation_editor_service.save_regions(
        result_id="res_1",
        regions=updated_regions,
        expected_revision=1,
    )

    assert res["active_revision"] == 2
    assert res["regions"][0]["translated_text"] == "Chào bạn nhé! (Đã chỉnh sửa)"


@pytest.mark.anyio
async def test_editor_conflict_detection_on_stale_revision(monkeypatch):
    """Passing a stale expected_revision raises ValueError (conflict)."""
    fake_results = {
        "res_1": {
            "result_id": "res_1",
            "active_revision": 2,  # Already at revision 2
        }
    }

    class MockResultsCol:
        async def find_one(self, query):
            return fake_results.get(query.get("result_id"))

    class MockDB:
        def __getitem__(self, item):
            return MockResultsCol()

    monkeypatch.setattr("backend.database.connection.get_db", lambda: MockDB())

    with pytest.raises(ValueError, match="Revision conflict"):
        await translation_editor_service.save_regions(
            result_id="res_1",
            regions=[],
            expected_revision=1,  # Stale!
        )


@pytest.mark.anyio
async def test_export_chapter_zip_structure(monkeypatch):
    """Exporting a chapter creates a valid ZIP file with ordered images and manifest.json."""
    fake_chapter = {
        "id": "chap_export_1",
        "chapter_number": 1,
        "title": "Prologue",
        "pages": [
            {"page_uid": "p1", "page_number": 1, "object_key": "pages/1/1/001.jpg"},
            {"page_uid": "p2", "page_number": 2, "object_key": "pages/1/1/002.jpg"},
        ],
    }

    fake_bindings = {
        "p1": {
            "page_uid": "p1",
            "chosen_result_id": "res_1",
            "output_object_key": "translation/outputs/res_1.jpg",
        }
    }

    class MockChaptersCol:
        async def find_one(self, query):
            return fake_chapter

    class MockBindingsCol:
        def find(self, query):
            class Cursor:
                async def to_list(self, length=None):
                    return list(fake_bindings.values())

            return Cursor()

    class MockDB:
        def __getitem__(self, item):
            if item == "chapters":
                return MockChaptersCol()
            if item == "translation_page_bindings":
                return MockBindingsCol()
            raise KeyError(item)

    monkeypatch.setattr("backend.database.connection.get_db", lambda: MockDB())

    # Mock storage download
    async def mock_get_bytes(object_key):
        return b"\xff\xd8\xff\xe0MockImageData"

    monkeypatch.setattr(translation_export_service, "_fetch_object_bytes", mock_get_bytes)

    zip_bytes = await translation_export_service.export_chapter("chap_export_1", target_language="vi")
    assert len(zip_bytes) > 0

    # Verify ZIP archive contents
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        namelist = zf.namelist()
        assert "001.jpg" in namelist
        assert "002.jpg" in namelist
        assert "manifest.json" in namelist

        manifest_data = zf.read("manifest.json").decode("utf-8")
        assert "chap_export_1" in manifest_data
        assert "translated" in manifest_data
        assert "original_fallback" in manifest_data


@pytest.mark.anyio
async def test_rerender_result_no_llm(monkeypatch):
    """Re-rendering draws regions on canvas with PIL and updates output_object_key without LLM calls."""
    fake_results = {
        "res_rerender_1": {
            "result_id": "res_rerender_1",
            "active_revision": 2,
            "output_object_key": "translation/outputs/res_rerender_1_rev2.jpg",
            "clean_object_key": "translation/clean/res_rerender_1.jpg",
            "regions": [
                {
                    "region_id": "reg_1",
                    "bounding_box": {"x": 0.1, "y": 0.1, "width": 0.4, "height": 0.2},
                    "reading_order": 1,
                    "source_text": "Hello",
                    "translated_text": "Xin chào thế giới!",
                }
            ],
            "width": 800,
            "height": 1200,
        }
    }

    class MockResultsCol:
        async def find_one(self, query):
            return fake_results.get(query.get("result_id"))

        async def update_one(self, query, update):
            rid = query.get("result_id")
            if rid in fake_results:
                fake_results[rid].update(update.get("$set", {}))
                return True
            return False

    class MockDB:
        def __getitem__(self, item):
            return MockResultsCol()

    monkeypatch.setattr("backend.database.connection.get_db", lambda: MockDB())

    uploaded_files = {}

    async def mock_upload(object_key, data, content_type="image/jpeg"):
        uploaded_files[object_key] = data
        return object_key

    monkeypatch.setattr(
        "backend.services.translation.storage_service.translation_storage_service.upload_file", mock_upload
    )

    result = await translation_editor_service.rerender_result("res_rerender_1")

    assert "res_rerender_1_rev2.jpg" in result["output_object_key"]
    assert len(uploaded_files) == 1
    # Verify image was uploaded as valid JPEG
    uploaded_data = list(uploaded_files.values())[0]
    assert uploaded_data.startswith(b"\xff\xd8")  # JPEG header magic bytes


@pytest.mark.anyio
async def test_publish_result(monkeypatch):
    """Publishing a result binds it to chapter page bindings."""
    fake_results = {
        "res_pub_1": {
            "result_id": "res_pub_1",
            "active_revision": 3,
            "output_object_key": "translation/outputs/res_pub_1_rev3.jpg",
            "source_sha256": "fake_sha_256",
            "target_language": "vi",
        }
    }

    bindings_storage = {}

    class MockResultsCol:
        async def find_one(self, query):
            return fake_results.get(query.get("result_id"))

    class MockBindingsCol:
        async def update_one(self, query, update, upsert=False):
            key = (query["chapter_id"], query["page_uid"])
            bindings_storage[key] = update.get("$set", {})
            return True

    class MockDB:
        def __getitem__(self, item):
            if item == "translation_results":
                return MockResultsCol()
            if item == "translation_page_bindings":
                return MockBindingsCol()
            raise KeyError(item)

    monkeypatch.setattr("backend.database.connection.get_db", lambda: MockDB())

    res = await translation_editor_service.publish_result(
        chapter_id="chap_99",
        page_uid="page_99_1",
        result_id="res_pub_1",
    )

    assert res["status"] == "published"
    assert res["chosen_result_id"] == "res_pub_1"
    assert res["chosen_revision"] == 3
    assert ("chap_99", "page_99_1") in bindings_storage
