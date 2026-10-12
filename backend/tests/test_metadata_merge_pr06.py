from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from backend.models.datasource import SourceWork
from backend.services.metadata_merge_service import (
    MetadataConflictError,
    MetadataMergeService,
)


@pytest.fixture
def sample_manga_doc():
    return {
        "_id": ObjectId("60c72b2f9b1d8e1f54a1a6b8"),
        "title": "Romi-chan no Okaasan",
        "alt_titles": ["Romi's Mother"],
        "description": "Original English description",
        "author": "Yuki",
        "artist": "Yuki",
        "year": "2017",
        "status": "completed",
        "read_status": "reading",
        "personal_rating": 8.5,
        "download_path": "d:/Manga/Romi",
        "links": [{"title": "Official", "url": "https://example.com/romi"}],
        "metadata_locks": {"title": True},
        "metadata_revision": 1,
        "metadata_provenance": {},
        "tag_ids": ["tag_1"],
    }


@pytest.fixture
def sample_candidate_source_work():
    return SourceWork(
        source="mangafire",
        source_work_id="oj8n8",
        title="Romi-chan no Okaasan (MangaFire Title)",
        url="https://mangafire.to/manga/romi-chan-no-okaasann.oj8n8",
        alt_titles=["Romi's Mother", "ロミちゃんのお母さん"],
        author="Yuki",
        artist="Yuki",
        year="2017",
        status="completed",
        description="Updated MangaFire synopsis with more details.",
        content_rating="safe",
        external_ids={"al": "105965", "mal": "130997", "mangadex": "3093cf37-0f8d-4f18-ad47-160fa8d781b0"},
    )


@pytest.mark.anyio
async def test_metadata_diff_generation_identifies_fields(sample_manga_doc, sample_candidate_source_work):
    service = MetadataMergeService()

    diff_report = service.generate_diff(sample_manga_doc, sample_candidate_source_work)

    assert diff_report.manga_id == "60c72b2f9b1d8e1f54a1a6b8"
    assert diff_report.source == "mangafire"
    assert diff_report.source_work_id == "oj8n8"
    assert diff_report.current_metadata_revision == 1

    diffs_by_field = {d.field_path: d for d in diff_report.diffs}

    # title is locked and conflicting
    assert "title" in diffs_by_field
    assert diffs_by_field["title"].is_locked is True
    assert diffs_by_field["title"].decision_state == "locked"
    assert diffs_by_field["title"].current_value == "Romi-chan no Okaasan"
    assert diffs_by_field["title"].candidate_value == "Romi-chan no Okaasan (MangaFire Title)"

    # description is different and unlocked -> conflict / candidate
    assert "description" in diffs_by_field
    assert diffs_by_field["description"].is_locked is False
    assert diffs_by_field["description"].decision_state == "conflict"

    # year is identical
    assert "year" in diffs_by_field
    assert diffs_by_field["year"].decision_state == "identical"

    # protected fields must NOT be in diffs
    assert "read_status" not in diffs_by_field
    assert "personal_rating" not in diffs_by_field
    assert "download_path" not in diffs_by_field


@pytest.mark.anyio
async def test_apply_metadata_respects_locks_and_bumps_revision(sample_manga_doc, sample_candidate_source_work):
    service = MetadataMergeService()

    mock_db = MagicMock()
    mock_mangas_col = AsyncMock()
    mock_snapshots_col = AsyncMock()

    mock_db.mangas = mock_mangas_col
    mock_db.source_metadata_snapshots = mock_snapshots_col

    # find_one returns sample_manga_doc
    mock_mangas_col.find_one.return_value = sample_manga_doc
    mock_mangas_col.update_one.return_value = MagicMock(modified_count=1)

    with patch("backend.services.metadata_merge_service.get_db", return_value=mock_db):
        res = await service.apply_metadata(
            manga_id="60c72b2f9b1d8e1f54a1a6b8",
            candidate=sample_candidate_source_work,
            accepted_fields=["description", "alt_titles", "links"],
            field_locks={"title": True, "description": False},
            expected_metadata_revision=1,
        )

        assert res.success is True
        assert res.new_metadata_revision == 2
        assert "description" in res.applied_fields
        # title was locked and not accepted
        assert "title" not in res.applied_fields

        # Check update_one call
        assert mock_mangas_col.update_one.called
        update_args = mock_mangas_col.update_one.call_args[0]
        filter_query = update_args[0]
        update_doc = update_args[1]["$set"]

        assert filter_query["_id"] == ObjectId("60c72b2f9b1d8e1f54a1a6b8")
        assert filter_query["metadata_revision"] == 1
        assert update_doc["metadata_revision"] == 2
        assert update_doc["description"] == "Updated MangaFire synopsis with more details."
        # Read status and personal rating must NOT be present in update_doc
        assert "read_status" not in update_doc
        assert "personal_rating" not in update_doc
        assert "download_path" not in update_doc

        # Verify snapshot recorded
        assert mock_snapshots_col.insert_one.called


@pytest.mark.anyio
async def test_apply_metadata_stale_revision_conflict(sample_manga_doc, sample_candidate_source_work):
    service = MetadataMergeService()

    mock_db = MagicMock()
    mock_mangas_col = AsyncMock()
    mock_db.mangas = mock_mangas_col

    # Document has revision 2, but client expects 1
    sample_manga_doc["metadata_revision"] = 2
    mock_mangas_col.find_one.return_value = sample_manga_doc

    with patch("backend.services.metadata_merge_service.get_db", return_value=mock_db):
        with pytest.raises(MetadataConflictError) as exc_info:
            await service.apply_metadata(
                manga_id="60c72b2f9b1d8e1f54a1a6b8",
                candidate=sample_candidate_source_work,
                accepted_fields=["description"],
                expected_metadata_revision=1,
            )
        assert "Metadata was modified by another operation" in str(exc_info.value)


@pytest.mark.anyio
async def test_merge_links_and_alts_unioned(sample_manga_doc, sample_candidate_source_work):
    service = MetadataMergeService()

    # Alt titles: existing has "Romi's Mother", candidate has "Romi's Mother" and "ロミちゃんのお母さん"
    merged_alts = service.merge_alt_titles(
        existing_alts=sample_manga_doc.get("alt_titles", []),
        candidate_alts=sample_candidate_source_work.alt_titles,
    )
    assert len(merged_alts) == 2
    assert "Romi's Mother" in merged_alts
    assert "ロミちゃんのお母さん" in merged_alts

    # Links: candidate has external_ids for al, mal, mangadex
    merged_links = service.merge_links(
        existing_links=sample_manga_doc.get("links", []),
        candidate=sample_candidate_source_work,
    )
    link_urls = [link_item["url"] for link_item in merged_links]
    assert "https://example.com/romi" in link_urls
    assert "https://anilist.co/manga/105965" in link_urls
    assert "https://myanimelist.net/manga/130997" in link_urls
    assert "https://mangafire.to/manga/romi-chan-no-okaasann.oj8n8" in link_urls


@pytest.mark.anyio
async def test_sync_manga_metadata_respects_locked_title(sample_manga_doc):
    """
    Ensure that manga_service.sync_manga_metadata does not overwrite locked title.
    """
    from backend.services.manga_service import manga_service

    mock_db = MagicMock()
    mock_mangas_col = AsyncMock()
    mock_tags_col = AsyncMock()
    mock_db.mangas = mock_mangas_col
    mock_db.tags = mock_tags_col

    # Manga has locked title
    manga_in_db = dict(sample_manga_doc)
    manga_in_db["mangadex_id"] = "3093cf37-0f8d-4f18-ad47-160fa8d781b0"
    manga_in_db["metadata_locks"] = {"title": True}
    mock_mangas_col.find_one.return_value = manga_in_db

    fake_details = {
        "title": "Different MangaDex Title",
        "alt_titles": ["Romi's Mother"],
        "description": "Synced synopsis",
        "author": "Yuki",
        "artist": "Yuki",
        "year": "2017",
        "status": "completed",
        "tags": [],
        "links": [],
        "authors_meta": [],
        "artists_meta": [],
    }

    with (
        patch.object(manga_service, "_get_mangas_collection", return_value=mock_mangas_col),
        patch.object(manga_service, "_get_tags_collection", return_value=mock_tags_col),
        patch("backend.services.manga_service.mangadex_service.get_manga_details", return_value=fake_details),
        patch("backend.services.creator_service.creator_service.sync_creator_by_dex_id", return_value=None),
        patch("backend.services.manga_service.minio_service.upload_cover", return_value=None),
        patch.object(manga_service, "enrich_manga_tracker_metadata", return_value=None),
    ):
        await manga_service.sync_manga_metadata("60c72b2f9b1d8e1f54a1a6b8")

        assert mock_mangas_col.update_one.called
        first_update_doc = mock_mangas_col.update_one.call_args_list[0][0][1]["$set"]
        # Title must NOT have been changed to "Different MangaDex Title" because it was locked!
        assert first_update_doc.get("title") == "Romi-chan no Okaasan"
        # Unlocked description was updated
        assert first_update_doc.get("description") == "Synced synopsis"


@pytest.mark.anyio
async def test_protected_user_fields_never_applied(sample_manga_doc, sample_candidate_source_work):
    service = MetadataMergeService()

    mock_db = MagicMock()
    mock_mangas_col = AsyncMock()
    mock_snapshots_col = AsyncMock()

    mock_db.mangas = mock_mangas_col
    mock_db.source_metadata_snapshots = mock_snapshots_col

    mock_mangas_col.find_one.return_value = sample_manga_doc
    mock_mangas_col.update_one.return_value = MagicMock(modified_count=1)

    with patch("backend.services.metadata_merge_service.get_db", return_value=mock_db):
        res = await service.apply_metadata(
            manga_id="60c72b2f9b1d8e1f54a1a6b8",
            candidate=sample_candidate_source_work,
            # Even if caller maliciously specifies protected user fields:
            accepted_fields=["read_status", "personal_rating", "reviews", "notes", "download_path", "description"],
            expected_metadata_revision=1,
        )

        assert res.success is True
        assert "read_status" not in res.applied_fields
        assert "personal_rating" not in res.applied_fields
        assert "reviews" not in res.applied_fields
        assert "download_path" not in res.applied_fields
        assert "description" in res.applied_fields

        update_doc = mock_mangas_col.update_one.call_args[0][1]["$set"]
        assert "read_status" not in update_doc
        assert "personal_rating" not in update_doc
        assert "download_path" not in update_doc


@pytest.mark.anyio
async def test_metadata_router_endpoints(sample_manga_doc, sample_candidate_source_work):
    from backend.routers.metadata import (
        MetadataLocksUpdateRequest,
        MetadataPreviewRequest,
        get_metadata_locks,
        preview_metadata_merge,
        update_metadata_locks,
    )

    mock_db = MagicMock()
    mock_mangas_col = AsyncMock()
    mock_db.mangas = mock_mangas_col

    mock_mangas_col.find_one.return_value = sample_manga_doc
    mock_mangas_col.update_one.return_value = MagicMock(matched_count=1, modified_count=1)

    # 1. Preview
    with patch("backend.routers.metadata.get_db", return_value=mock_db):
        preview_req = MetadataPreviewRequest(
            source="mangafire",
            source_work_id="oj8n8",
            source_work=sample_candidate_source_work,
        )
        preview_resp = await preview_metadata_merge("60c72b2f9b1d8e1f54a1a6b8", preview_req)
        assert preview_resp.manga_id == "60c72b2f9b1d8e1f54a1a6b8"
        assert preview_resp.source == "mangafire"
        assert len(preview_resp.diffs) > 0

    # 2. Get locks
    with patch("backend.routers.metadata.get_db", return_value=mock_db):
        locks_resp = await get_metadata_locks("60c72b2f9b1d8e1f54a1a6b8")
        assert locks_resp["manga_id"] == "60c72b2f9b1d8e1f54a1a6b8"
        assert locks_resp["locks"] == {"title": True}

    # 3. Update locks
    with patch("backend.routers.metadata.get_db", return_value=mock_db):
        update_locks_req = MetadataLocksUpdateRequest(locks={"title": True, "description": True})
        update_resp = await update_metadata_locks("60c72b2f9b1d8e1f54a1a6b8", update_locks_req)
        assert update_resp["updated"] is True
        assert update_resp["locks"]["description"] is True
