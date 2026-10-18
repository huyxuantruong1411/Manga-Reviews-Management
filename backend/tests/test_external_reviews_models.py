from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

from backend.database.indexes import DELETION_REFERENCE_INDEXES, ensure_deletion_reference_indexes
from backend.database.migrations.m_20261015_external_reviews_indexes import downgrade, upgrade
from backend.models.external_review import (
    ExternalReviewInDB,
    ExternalReviewListResponse,
    ExternalReviewReactions,
    ExternalReviewResponse,
    ExternalReviewStatsSummary,
    MALAuthorEntry,
    MALExtendedMetadata,
    TriggerExternalReviewSyncRequest,
)


def test_mal_author_entry_valid():
    author = MALAuthorEntry(
        mal_id=1234,
        name="Abe, Youichi",
        role="Story & Art",
        url="https://myanimelist.net/people/1234/Youichi_Abe",
    )
    assert author.name == "Abe, Youichi"
    assert author.role == "Story & Art"
    assert author.mal_id == 1234


def test_mal_extended_metadata_valid():
    metadata = MALExtendedMetadata(
        mal_id=130997,
        canonical_url="https://myanimelist.net/manga/130997/Youkaku_no_Majoromi",
        japanese_title="羊角のマジョロミ",
        english_title="Sheeply Horned Witch Romi",
        volumes=3,
        chapters=31,
        status="Finished",
        genres=["Comedy", "Romance", "Supernatural"],
        demographics=["Seinen", "Shounen"],
        serialization=["Young Dragon Age"],
        authors=[MALAuthorEntry(name="Abe, Youichi", role="Story & Art")],
        score=7.35,
    )
    assert metadata.mal_id == 130997
    assert metadata.volumes == 3
    assert metadata.chapters == 31
    assert len(metadata.authors) == 1
    assert metadata.authors[0].role == "Story & Art"


def test_external_review_reactions_defaults():
    reactions = ExternalReviewReactions(nice=2, love_it=1, total=3)
    assert reactions.nice == 2
    assert reactions.love_it == 1
    assert reactions.funny == 0
    assert reactions.total == 3


def test_external_review_in_db_and_response_validation():
    now = datetime.now(timezone.utc)
    review_dict = {
        "_id": "60d5ecb8b487343568912345",
        "manga_id": "manga_mock_id_01",
        "source": "myanimelist",
        "source_work_id": "130997",
        "source_review_id": "534123",
        "source_url": "https://myanimelist.net/reviews.php?id=534123",
        "reviewer_name": "EtherLux",
        "reviewer_profile_url": "https://myanimelist.net/profile/EtherLux",
        "overall_rating": 8,
        "recommendation_status": "recommended",
        "is_preliminary": True,
        "chapters_progress": "15/31 chp",
        "is_spoiler": False,
        "content_text": "A wonderful and surreal manga series with delightful art.",
        "word_count": 9,
        "character_count": 56,
        "reactions": {"total": 5, "nice": 3, "love_it": 2},
        "posted_at": now,
        "posted_at_raw": "Feb 4, 2024",
    }

    in_db = ExternalReviewInDB.model_validate(review_dict)
    assert in_db.reviewer_name == "EtherLux"
    assert in_db.is_preliminary is True
    assert in_db.chapters_progress == "15/31 chp"
    assert in_db.reactions.total == 5

    response_model = ExternalReviewResponse(
        _id="60d5ecb8b487343568912345",
        manga_id="manga_mock_id_01",
        source="myanimelist",
        source_work_id="130997",
        source_review_id="534123",
        source_url="https://myanimelist.net/reviews.php?id=534123",
        reviewer_name="EtherLux",
        overall_rating=8,
        recommendation_status="recommended",
        content_text="Detailed review",
        fetched_at=now,
        updated_at=now,
    )
    assert response_model.id == "60d5ecb8b487343568912345"


def test_external_review_rating_bounds():
    with pytest.raises(ValidationError):
        ExternalReviewResponse(
            _id="60d5ecb8b487343568912345",
            manga_id="manga_mock_id_01",
            source="myanimelist",
            source_work_id="130997",
            source_review_id="534123",
            source_url="https://myanimelist.net/reviews.php?id=534123",
            reviewer_name="EtherLux",
            overall_rating=15,  # Invalid: > 10
            content_text="Invalid rating",
            fetched_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )


def test_external_review_list_response_and_summary():
    summary = ExternalReviewStatsSummary(
        total_reviews=2,
        by_source={"myanimelist": 2},
        by_recommendation={"recommended": 1, "mixed_feelings": 1},
        spoiler_count=1,
        preliminary_count=1,
        average_rating=7.5,
        linked_mal_id="130997",
    )
    list_response = ExternalReviewListResponse(
        items=[],
        total=2,
        skip=0,
        limit=20,
        summary=summary,
    )
    assert list_response.total == 2
    assert list_response.summary.by_source["myanimelist"] == 2
    assert list_response.summary.spoiler_count == 1


def test_trigger_external_review_sync_request_defaults():
    req = TriggerExternalReviewSyncRequest()
    assert req.source == "myanimelist"
    assert req.include_spoilers is True
    assert req.include_preliminary is True
    assert req.sync_extended_metadata is True
    assert req.apply_empty_manga_fields is True
    assert req.max_pages == 50


def test_deletion_reference_indexes_contains_external_reviews():
    match = any(
        collection == "external_reviews" and field == "manga_id" for collection, field, _ in DELETION_REFERENCE_INDEXES
    )
    assert match is True, "external_reviews must be indexed in DELETION_REFERENCE_INDEXES"


@pytest.mark.anyio
async def test_indexes_and_migration_upgrade_downgrade():
    mock_db = MagicMock()
    mock_collection = MagicMock()
    mock_collection.create_index = AsyncMock()
    mock_collection.drop_index = AsyncMock()
    mock_collection.index_information = AsyncMock(
        return_value={
            "ext_reviews_unique_source_review": {},
            "ext_reviews_manga_source_posted": {},
        }
    )
    mock_db.external_reviews = mock_collection
    mock_db.__getitem__.return_value = mock_collection

    await ensure_deletion_reference_indexes(mock_db)
    assert mock_collection.create_index.called

    # Test migration upgrade & downgrade
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(
            "backend.database.migrations.m_20261015_external_reviews_indexes.get_db",
            lambda: mock_db,
        )
        await upgrade()
        assert mock_collection.create_index.call_count >= 5

        await downgrade()
        assert mock_collection.drop_index.called
