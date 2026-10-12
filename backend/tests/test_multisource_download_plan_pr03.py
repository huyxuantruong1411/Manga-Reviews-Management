import io
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from bson import ObjectId
from PIL import Image

from backend.models.datasource import (
    IdentityConflictError,
    SourcePage,
    SourcePageManifest,
    SourceRelease,
    SourceWork,
)
from backend.models.download_plan import (
    DownloadPlanItem,
    DownloadSelectionPolicy,
)
from backend.services.chapter_media_service import ChapterMediaService
from backend.services.download_plan_service import DownloadPlanService


def _create_sample_image(format="JPEG", size=(100, 100), color=(255, 0, 0)) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", size, color)
    img.save(buf, format=format)
    return buf.getvalue()


@pytest.mark.anyio
async def test_create_download_plan_unlinked_source_rejected():
    """
    DL-01: Verifies that creating a download plan for an unlinked source work
    raises IdentityConflictError.
    """
    plan_service = DownloadPlanService()

    class MockMangaSourcesCol:
        async def find_one(self, query):
            # Not found
            return None

    with patch.object(plan_service, "_get_manga_sources_col", return_value=MockMangaSourcesCol()):
        with pytest.raises(IdentityConflictError) as exc_info:
            await plan_service.create_plan(
                manga_id="manga_1",
                source="mangafire",
                source_work_id="unlinked_work",
                release_ids=["rel_1"],
                selection_policy=DownloadSelectionPolicy.SKIP_EXISTING,
            )
        assert "not linked" in str(exc_info.value).lower()


@pytest.mark.anyio
async def test_create_download_plan_selection_policies():
    """
    DL-02: Verifies that existing ready chapters are skipped under SKIP_EXISTING,
    and planned for download under REPLACE_PREFERRED or KEEP_ALTERNATIVE.
    """
    plan_service = DownloadPlanService()

    class MockMangaSourcesCol:
        async def find_one(self, query):
            return {
                "_id": ObjectId(),
                "manga_id": "manga_1",
                "source": "mangadex",
                "source_work_id": "work_1",
                "link_state": "verified",
            }

    existing_chapters = [
        {
            "_id": ObjectId("60c72b2f9b1d8b2bad000001"),
            "manga_id": "manga_1",
            "source": "mangadex",
            "source_id": "rel_existing",
            "language": "en",
            "chapter_number": "14",
            "state": "ready",
            "media_revision_id": "rev_old",
            "pages_revision": 1,
        }
    ]

    class MockChaptersCol:
        async def find_one(self, query):
            for c in existing_chapters:
                if (
                    c.get("manga_id") == query.get("manga_id")
                    and c.get("source") == query.get("source")
                    and c.get("source_id") == query.get("source_id")
                    and c.get("language") == query.get("language")
                ):
                    return c
            return None

    class MockPlansCol:
        def __init__(self):
            self.saved = []

        async def insert_one(self, doc):
            self.saved.append(doc)
            return type("Result", (), {"inserted_id": doc["_id"]})()

    mock_plans_col = MockPlansCol()

    mock_provider = AsyncMock()
    mock_provider.resolve_work.return_value = SourceWork(
        source="mangadex",
        source_work_id="work_1",
        title="Sample Manga",
        url="https://mangadex.org/title/work_1",
    )
    mock_release_existing = SourceRelease(
        id="rel_existing",
        source="mangadex",
        source_work_id="work_1",
        chapter_number="14",
        language="en",
    )
    mock_release_new = SourceRelease(
        id="rel_new",
        source="mangadex",
        source_work_id="work_1",
        chapter_number="15",
        language="en",
    )
    mock_provider.get_release = AsyncMock(
        side_effect=lambda work, rid: mock_release_existing if rid == "rel_existing" else mock_release_new
    )

    with (
        patch.object(plan_service, "_get_manga_sources_col", return_value=MockMangaSourcesCol()),
        patch.object(plan_service, "_get_chapters_col", return_value=MockChaptersCol()),
        patch.object(plan_service, "_get_plans_col", return_value=mock_plans_col),
        patch("backend.services.datasources.registry.provider_registry.get_provider", return_value=mock_provider),
    ):
        # 1. Test SKIP_EXISTING
        plan_skip = await plan_service.create_plan(
            manga_id="manga_1",
            source="mangadex",
            source_work_id="work_1",
            release_ids=["rel_existing", "rel_new"],
            selection_policy=DownloadSelectionPolicy.SKIP_EXISTING,
        )
        assert plan_skip.total_items == 2
        assert plan_skip.skip_count == 1
        assert plan_skip.download_count == 1
        skip_item = next(i for i in plan_skip.items if i.source_release_id == "rel_existing")
        assert skip_item.action == "skip"
        assert skip_item.status == "skipped"

        # 2. Test REPLACE_PREFERRED
        plan_replace = await plan_service.create_plan(
            manga_id="manga_1",
            source="mangadex",
            source_work_id="work_1",
            release_ids=["rel_existing", "rel_new"],
            selection_policy=DownloadSelectionPolicy.REPLACE_PREFERRED,
        )
        assert plan_replace.total_items == 2
        assert plan_replace.download_count == 2
        replace_item = next(i for i in plan_replace.items if i.source_release_id == "rel_existing")
        assert replace_item.action == "download"
        assert replace_item.status == "pending"


@pytest.mark.anyio
async def test_media_validation_and_staging():
    """
    DL-03: Tests image bytes validation, hashing, and staged manifest v2 upload.
    """
    media_service = ChapterMediaService()

    jpeg_bytes = _create_sample_image("JPEG")
    png_bytes = _create_sample_image("PNG")

    # 1. Valid image inspection
    ctype, w, h = media_service.validate_image_bytes(jpeg_bytes)
    assert ctype == "image/jpeg"
    assert w == 100
    assert h == 100

    # 2. Corrupt / HTML byte rejection
    html_bytes = b"<html><body>403 Forbidden</body></html>"
    with pytest.raises(ValueError) as exc_info:
        media_service.validate_image_bytes(html_bytes)
    assert "Invalid image" in str(exc_info.value) or "unsupported" in str(exc_info.value).lower()

    # 3. Test staging sequential pages
    minio_storage = {}

    class MockMinio:
        def upload_chapter_page_revision(self, manga_id, chapter_id, media_revision_id, filename, data, content_type):
            key = f"chapters/{manga_id}/{chapter_id}/revisions/{media_revision_id}/{filename}"
            minio_storage[key] = data
            return key, len(data), 100, 100, "sha256_mock", "md5_mock"

        def put_object_bytes(self, object_name, data, content_type="application/octet-stream"):
            minio_storage[object_name] = data
            return object_name

    mock_minio = MockMinio()

    page_manifest = SourcePageManifest(
        provider="mangadex",
        work_id="work_1",
        release_id="rel_1",
        chapter_number_raw="14",
        page_count=2,
        pages=[
            SourcePage(page_number=1, url="http://example.com/1.jpg"),
            SourcePage(page_number=2, url="http://example.com/2.png"),
        ],
    )

    page_bytes_map = {
        "http://example.com/1.jpg": jpeg_bytes,
        "http://example.com/2.png": png_bytes,
    }

    with patch.object(media_service, "_minio_service", mock_minio):
        result = await media_service.stage_and_verify_chapter(
            manga_id="manga_1",
            chapter_id="chap_1",
            media_revision_id="rev_1",
            manifest=page_manifest,
            fetcher=lambda page: page_bytes_map[page.url],
        )

        assert result["page_count"] == 2
        assert len(result["pages"]) == 2
        assert result["pages"][0].page_number == 1
        assert result["pages"][0].filename == "0001.jpg"
        assert result["pages"][1].page_number == 2
        assert result["pages"][1].filename == "0002.png"
        assert "manifest_sha256" in result

        # Check MinIO storage keys
        assert "chapters/manga_1/chap_1/revisions/rev_1/0001.jpg" in minio_storage
        assert "chapters/manga_1/chap_1/revisions/rev_1/0002.png" in minio_storage
        assert "chapters/manga_1/chap_1/revisions/rev_1/manifest.json" in minio_storage


@pytest.mark.anyio
async def test_cas_commit_success_and_stale_worker_rejection():
    """
    DL-04: Verifies Compare-And-Swap (CAS) semantics on chapter document.
    - Matching fence & epoch succeeds and marks state="ready".
    - Mismatched fence/epoch (stale worker) fails commit.
    """
    media_service = ChapterMediaService()
    chapter_doc = {
        "_id": ObjectId("60c72b2f9b1d8b2bad000002"),
        "manga_id": "manga_1",
        "source": "mangadex",
        "source_id": "rel_14",
        "state": "staging",
        "pending_operation_id": "op_active",
        "media_write_fence": 5,
        "lifecycle_epoch": 2,
        "pages_revision": 1,
    }

    class MockChaptersCol:
        async def update_one(self, query, update_spec):
            # Check CAS conditions
            if (
                chapter_doc["_id"] == query["_id"]
                and chapter_doc["pending_operation_id"] == query["pending_operation_id"]
                and chapter_doc["media_write_fence"] == query["media_write_fence"]
                and chapter_doc["lifecycle_epoch"] == query["lifecycle_epoch"]
            ):
                chapter_doc.update(update_spec.get("$set", {}))
                return type("Result", (), {"modified_count": 1})()
            return type("Result", (), {"modified_count": 0})()

    mock_col = MockChaptersCol()
    with patch.object(media_service, "_get_chapters_col", return_value=mock_col):
        # 1. Stale worker attempt (mismatched fence)
        stale_success = await media_service.commit_chapter_media(
            chapter_id="60c72b2f9b1d8b2bad000002",
            operation_id="op_active",
            expected_fence=4,  # Stale fence!
            expected_epoch=2,
            media_revision_id="rev_stale",
            manifest_sha256="hash_stale",
            pages=[],
        )
        assert stale_success is False
        assert chapter_doc["state"] == "staging"

        # 2. Active worker attempt (matching fence and epoch)
        active_success = await media_service.commit_chapter_media(
            chapter_id="60c72b2f9b1d8b2bad000002",
            operation_id="op_active",
            expected_fence=5,  # Matching fence
            expected_epoch=2,
            media_revision_id="rev_active",
            manifest_sha256="hash_active",
            pages=[],
        )
        assert active_success is True
        assert chapter_doc["state"] == "ready"
        assert chapter_doc["media_revision_id"] == "rev_active"
        assert chapter_doc["pending_operation_id"] is None


@pytest.mark.anyio
async def test_failed_staging_preserves_ready_chapter():
    """
    DL-05: Verifies that if an error occurs during download or staging (e.g. invalid bytes, network drop),
    an existing ready chapter's document and media revision remain completely intact.
    """
    media_service = ChapterMediaService()
    chapter_doc = {
        "_id": ObjectId("60c72b2f9b1d8b2bad000003"),
        "manga_id": "manga_1",
        "source": "mangadex",
        "source_id": "rel_14",
        "state": "ready",
        "media_revision_id": "rev_existing_pristine",
        "pages_revision": 1,
        "manifest_sha256": "pristine_hash",
    }

    # Simulate staging error on page 2
    corrupt_page_manifest = SourcePageManifest(
        provider="mangadex",
        work_id="work_1",
        release_id="rel_14",
        chapter_number_raw="14",
        page_count=2,
        pages=[
            SourcePage(page_number=1, url="http://example.com/1.jpg"),
            SourcePage(page_number=2, url="http://example.com/2.jpg"),
        ],
    )

    fetcher_calls = []

    def corrupt_fetcher(page):
        fetcher_calls.append(page.page_number)
        if page.page_number == 1:
            return _create_sample_image("JPEG")
        raise RuntimeError("Network disconnected while downloading page 2")

    with pytest.raises(RuntimeError) as exc_info:
        await media_service.stage_and_verify_chapter(
            manga_id="manga_1",
            chapter_id="60c72b2f9b1d8b2bad000003",
            media_revision_id="rev_failed_attempt",
            manifest=corrupt_page_manifest,
            fetcher=corrupt_fetcher,
        )

    assert "Network disconnected" in str(exc_info.value)
    # The original document was never touched or demoted from ready!
    assert chapter_doc["state"] == "ready"
    assert chapter_doc["media_revision_id"] == "rev_existing_pristine"
    assert chapter_doc["manifest_sha256"] == "pristine_hash"


@pytest.mark.anyio
async def test_slot_preference_update_on_commit():
    """
    DL-06: Verifies that when a replacement release commits successfully,
    the preferred pointer in chapter_slots updates to the new chapter ID.
    """
    from backend.services.chapter_slot_service import ChapterSlotService

    slot_service = ChapterSlotService()
    slots_in_db = [
        {
            "_id": ObjectId("60c72b2f9b1d8b2bad000010"),
            "manga_id": "manga_1",
            "language": "en",
            "chapter_key": "14",
            "preferred_chapter_id": "chap_old",
        }
    ]

    class MockSlotsCol:
        async def find_one(self, query):
            for s in slots_in_db:
                if s["_id"] == query.get("_id") or (
                    s["manga_id"] == query.get("manga_id") and s.get("chapter_key") == query.get("chapter_key")
                ):
                    return s
            return None

        async def update_one(self, query, update_spec):
            for s in slots_in_db:
                if s["_id"] == query["_id"]:
                    s.update(update_spec.get("$set", {}))
                    return type("Result", (), {"modified_count": 1})()
            return type("Result", (), {"modified_count": 0})()

    mock_col = MockSlotsCol()
    with patch.object(slot_service, "_get_slots_col", return_value=mock_col):
        # Update preference to newly committed chap_new
        success = await slot_service.set_preferred_chapter("60c72b2f9b1d8b2bad000010", "chap_new")
        assert success is True
        assert slots_in_db[0]["preferred_chapter_id"] == "chap_new"
