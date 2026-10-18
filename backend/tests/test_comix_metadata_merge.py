from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from backend.models.datasource import SourceWork
from backend.services.metadata_merge_service import MetadataMergeService


@pytest.fixture
def base_manga_doc():
    return {
        "_id": ObjectId("60c72b2f9b1d8e1f54a1a6ba"),
        "title": "Yajin",
        "alt_titles": ["野人"],
        "description": "Original synopsis of Yajin.",
        "author": "Yajin Author",
        "artist": "Yajin Artist",
        "year": "2021",
        "status": "ongoing",
        "read_status": "reading",
        "personal_rating": 9.0,
        "reviews": [{"id": "rev1", "content": "Amazing survival manga"}],
        "notes": "Chapter 14 was intense",
        "download_path": "d:/Manga/Yajin",
        "links": [{"title": "MangaDex", "url": "https://mangadex.org/title/r9j5m-uuid"}],
        "metadata_locks": {"title": True},
        "metadata_revision": 1,
        "metadata_provenance": {},
        "tag_ids": ["tag_survival_id"],
        "source_metrics": {"mangadex": {"rating": 8.4, "follows": 12000}},
    }


@pytest.fixture
def comix_candidate_source_work():
    return SourceWork(
        source="comix",
        source_work_id="r9j5m",
        title="Yajin (Comix Alternative)",
        url="https://comix.to/title/r9j5m-yajin",
        alt_titles=[
            "Wild Man Yajin",
            "Read Yajin online free",
            "Yajin Chapter 14 free manga",
            "  野人  ",
            "High quality scanlation",
            "<b>Yajin the Wilderness Hunter</b>",
        ],
        author="Yajin Author",
        artist="Yajin Artist",
        year="2021",
        status="releasing",
        description="Expanded wilderness survival story of Yajin facing predators and ruthless cold.",
        content_rating="safe",
        cover_url="https://img.comix.to/covers/r9j5m.jpg",
        external_ids={"mal": "154321", "al": "143210"},
        extra_metadata={
            "genres": ["Action", "Adventure", "Survival"],
            "source_metrics": {"score": 8.9, "views": 250000, "follows": 6800},
        },
    )


def test_merge_alt_titles_filters_seo_junk():
    service = MetadataMergeService()

    raw_candidates = [
        "Wild Man Yajin",
        "Read Yajin online free",
        "Yajin free manga",
        "Manga online free Yajin",
        "High quality scanlation",
        "All chapters latest chapters",
        "English scan",
        "<b>Yajin the Wilderness Hunter</b>",
    ]

    merged = service.merge_alt_titles(existing_alts=["野人"], candidate_alts=raw_candidates)

    # Clean titles preserved
    assert "野人" in merged
    assert "Wild Man Yajin" in merged
    assert "Yajin the Wilderness Hunter" in merged

    # SEO spam stripped
    assert "Read Yajin online free" not in merged
    assert "Yajin free manga" not in merged
    assert "Manga online free Yajin" not in merged
    assert "High quality scanlation" not in merged
    assert "All chapters latest chapters" not in merged
    assert "English scan" not in merged


@pytest.mark.anyio
async def test_metadata_diff_includes_source_metrics_and_tags(base_manga_doc, comix_candidate_source_work):
    service = MetadataMergeService()

    diff_report = service.generate_diff(base_manga_doc, comix_candidate_source_work)

    assert diff_report.manga_id == "60c72b2f9b1d8e1f54a1a6ba"
    assert diff_report.source == "comix"

    diffs = {d.field_path: d for d in diff_report.diffs}

    # title locked
    assert diffs["title"].is_locked is True
    assert diffs["title"].decision_state == "locked"
    assert diffs["title"].current_value == "Yajin"

    # source_metrics diff
    assert "source_metrics" in diffs
    assert diffs["source_metrics"].candidate_value == {"score": 8.9, "views": 250000, "follows": 6800}

    # tag_ids diff
    assert "tag_ids" in diffs
    assert diffs["tag_ids"].candidate_value == ["Action", "Adventure", "Survival"]

    # Protected user fields must never appear
    for protected in service.PROTECTED_USER_FIELDS:
        assert protected not in diffs


@pytest.mark.anyio
async def test_apply_metadata_from_comix_enriches_3_sources_and_protects_user(
    base_manga_doc, comix_candidate_source_work
):
    """
    CMX-META-01:
    Tests merging metadata from Comix into an existing Manga document that already
    has MangaDex/MangaFire data.
    Verifies:
    1. Locked title is strictly untouched.
    2. Description, cover_url, alt_titles (clean), links, tag_ids are updated.
    3. source_metrics.comix is added alongside existing source_metrics.mangadex.
    4. Comix cover_url is registered in db.cover_arts gallery as candidate.
    5. personal_rating, read_status, reviews, notes remain untouched.
    """
    service = MetadataMergeService()

    mock_db = MagicMock()
    mock_mangas_col = AsyncMock()
    mock_snapshots_col = AsyncMock()
    mock_tags_col = AsyncMock()
    mock_cover_arts_col = AsyncMock()

    mock_db.mangas = mock_mangas_col
    mock_db.source_metadata_snapshots = mock_snapshots_col
    mock_db.tags = mock_tags_col
    mock_db.cover_arts = mock_cover_arts_col

    # Mock tags collection: Survival tag already exists, Action & Adventure are new
    def mock_tag_find_one(query):
        name_lower = query.get("name_lower")
        if name_lower == "survival":
            return {"_id": ObjectId("60c72b2f9b1d8e1f54a1a601"), "name": "Survival"}
        return None

    mock_tags_col.find_one = AsyncMock(side_effect=mock_tag_find_one)
    mock_tags_col.insert_one = AsyncMock(side_effect=lambda doc: type("Result", (), {"inserted_id": ObjectId()})())

    mock_mangas_col.find_one = AsyncMock(return_value=dict(base_manga_doc))
    mock_mangas_col.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    mock_cover_arts_col.update_one = AsyncMock(return_value=MagicMock(modified_count=1))

    with patch("backend.services.metadata_merge_service.get_db", return_value=mock_db):
        resp = await service.apply_metadata(
            manga_id="60c72b2f9b1d8e1f54a1a6ba",
            candidate=comix_candidate_source_work,
            accepted_fields=["description", "alt_titles", "links", "tag_ids", "source_metrics"],
            field_locks={"title": True},
            expected_metadata_revision=1,
        )

        assert resp.success is True
        assert resp.new_metadata_revision == 2
        assert "description" in resp.applied_fields
        assert "source_metrics" in resp.applied_fields
        assert "tag_ids" in resp.applied_fields
        assert "title" not in resp.applied_fields

        # Inspect updated document in DB
        update_call = mock_mangas_col.update_one.call_args[0]
        update_set = update_call[1]["$set"]

        # 1. Title was locked, must NOT be modified
        assert "title" not in update_set

        # 2. Description updated
        assert "wilderness survival story" in update_set["description"]

        # 3. Clean alt titles merged
        assert "Wild Man Yajin" in update_set["alt_titles"]
        assert "野人" in update_set["alt_titles"]
        assert not any("free" in a.lower() for a in update_set["alt_titles"])

        # 4. Multi-source metrics co-exist
        assert "mangadex" in update_set["source_metrics"]
        assert "comix" in update_set["source_metrics"]
        assert update_set["source_metrics"]["comix"]["score"] == 8.9

        # 5. Tag IDs merged
        assert len(update_set["tag_ids"]) >= 3
        assert "tag_survival_id" in update_set["tag_ids"]

        # 6. Candidate cover registered in cover_arts
        assert mock_cover_arts_col.update_one.called
        cover_call = mock_cover_arts_col.update_one.call_args[0]
        assert cover_call[0]["source"] == "comix"
        assert cover_call[0]["source_url"] == "https://img.comix.to/covers/r9j5m.jpg"

        # 7. User fields strictly protected
        assert "personal_rating" not in update_set
        assert "read_status" not in update_set
        assert "reviews" not in update_set
        assert "notes" not in update_set
        assert "download_path" not in update_set
