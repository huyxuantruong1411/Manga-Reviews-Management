from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from backend.models.external_review import (
    MALExtendedMetadata,
)
from backend.services.external_review_service import ExternalReviewService
from backend.services.mal_enrichment_service import (
    apply_extended_mal_metadata_to_manga,
    extract_mal_id,
    parse_mal_manga_info_html,
    parse_mal_reviews_page_html,
)

# --- MOCK HTML FIXTURES ---

SAMPLE_MAL_INFO_HTML = """
<!DOCTYPE html>
<html>
<head><title>Youkaku no Majoromi - MyAnimeList.net</title></head>
<body>
<div id="content">
  <div class="leftside">
    <h2>Alternative Titles</h2>
    <div class="spaceit_pad"><span class="dark_text">Japanese:</span> 羊角のマジョロミ</div>
    <div class="spaceit_pad"><span class="dark_text">English:</span> Sheeply Horned Witch Romi</div>
    <div class="spaceit_pad"><span class="dark_text">Synonyms:</span> Majoromi, The Horned Witch</div>
    <h2>Information</h2>
    <div class="spaceit_pad"><span class="dark_text">Type:</span> <a href="/manga.php?type=1">Manga</a></div>
    <div class="spaceit_pad"><span class="dark_text">Volumes:</span> 3</div>
    <div class="spaceit_pad"><span class="dark_text">Chapters:</span> 31</div>
    <div class="spaceit_pad"><span class="dark_text">Status:</span> Finished</div>
    <div class="spaceit_pad"><span class="dark_text">Published:</span> Sep 25, 2017 to Jun 26, 2024</div>
    <div class="spaceit_pad"><span class="dark_text">Genres:</span> <a href="/genre/4">Comedy</a>, <a href="/genre/22">Romance</a>, <a href="/genre/37">Supernatural</a></div>
    <div class="spaceit_pad"><span class="dark_text">Themes:</span> <a href="/theme/6">Mythology</a></div>
    <div class="spaceit_pad"><span class="dark_text">Demographic:</span> <a href="/demographic/42">Seinen</a>, <a href="/demographic/27">Shounen</a></div>
    <div class="spaceit_pad"><span class="dark_text">Serialization:</span> <a href="/manga/magazine/1155">Young Dragon Age</a></div>
    <div class="spaceit_pad"><span class="dark_text">Authors:</span> <a href="/people/4946/Youichi_Abe">Abe, Youichi</a> (Story & Art)</div>
    <h2>Statistics</h2>
    <div class="spaceit_pad"><span class="dark_text">Score:</span> <span class="score-label score-7">7.35</span></div>
    <div class="spaceit_pad"><span class="dark_text">Ranked:</span> #4520</div>
    <div class="spaceit_pad"><span class="dark_text">Popularity:</span> #8900</div>
    <div class="spaceit_pad"><span class="dark_text">Members:</span> 1,450</div>
    <div class="spaceit_pad"><span class="dark_text">Favorites:</span> 42</div>
  </div>
</div>
</body>
</html>
"""

SAMPLE_MAL_REVIEWS_HTML = """
<!DOCTYPE html>
<html>
<head><title>Youkaku no Majoromi Reviews</title></head>
<body>
<div class="review-filter-box">
  <span>Filtered Results: 2 / 2</span>
</div>
<div class="review-element js-review-element" data-reactions='{"icon":["nice","love_it","funny","confusing","informative","well_written","creative"],"num":3,"count":["0","0","2","1","0","0","0"]}'>
  <div class="thumb">
    <a href="/profile/EtherLux"><img src="/images/user_ether.jpg" alt="EtherLux" /></a>
  </div>
  <div class="username"><a href="/profile/EtherLux">EtherLux</a></div>
  <div class="update_at">Feb 4, 2024</div>
  <div class="tags">
    <div class="tag not-recommended">Not Recommended</div>
    <div class="tag preliminary">Preliminary <span>(15/31 chp)</span></div>
  </div>
  <div class="rating">Overall Rating: <span class="num">5</span></div>
  <div class="text">
    I started reading this series with high expectations.<br />
    However, the pacing after chapter 10 becomes erratic.<br/>
    The art remains wonderful though.
    <div class="open"><a href="/reviews.php?id=534123">read more</a></div>
  </div>
</div>

<div class="review-element js-review-element" data-reactions='{"icon":["nice","love_it","funny","confusing","informative","well_written","creative"],"num":5,"count":["2","2","0","0","1","0","0"]}'>
  <div class="thumb">
    <a href="/profile/TomboyEmouto"><img data-src="/images/user_tomboy.jpg" alt="TomboyEmouto" /></a>
  </div>
  <div class="username"><a href="/profile/TomboyEmouto">TomboyEmouto</a></div>
  <div class="update_at">Feb 2, 2026</div>
  <div class="tags">
    <div class="tag mixed-feelings">Mixed Feelings</div>
    <div class="tag spoiler">Spoiler</div>
  </div>
  <div class="rating">Overall Rating: <span class="num">7</span></div>
  <div class="text">
    A very unique take on horned witch lore.
    <span class="js-hidden">Later in the plot, the revelation about Romi's family completely flips the story dynamics.</span>
    <div class="open"><a href="/reviews.php?id=534999">read more</a></div>
  </div>
</div>
</body>
</html>
"""


# --- TESTS: EXTRACT MAL ID ---


def test_extract_mal_id_various_formats():
    assert extract_mal_id("130997") == "130997"
    assert extract_mal_id("https://myanimelist.net/manga/130997") == "130997"
    assert extract_mal_id("https://myanimelist.net/manga/130997/Youkaku_no_Majoromi") == "130997"
    assert extract_mal_id("https://myanimelist.net/manga/130997/Youkaku_no_Majoromi/reviews") == "130997"
    assert extract_mal_id("myanimelist.net/manga/130997?foo=bar") == "130997"
    assert extract_mal_id("invalid-input") is None
    assert extract_mal_id("") is None
    assert extract_mal_id(None) is None


# --- TESTS: PARSE MAL MANGA INFO HTML ---


def test_parse_mal_manga_info_html():
    meta = parse_mal_manga_info_html(SAMPLE_MAL_INFO_HTML, "130997")
    assert isinstance(meta, MALExtendedMetadata)
    assert meta.mal_id == 130997
    assert meta.japanese_title == "羊角のマジョロミ"
    assert meta.english_title == "Sheeply Horned Witch Romi"
    assert "Majoromi" in meta.synonyms
    assert "The Horned Witch" in meta.synonyms
    assert meta.media_type == "Manga"
    assert meta.volumes == 3
    assert meta.chapters == 31
    assert meta.status == "Finished"
    assert meta.published_string == "Sep 25, 2017 to Jun 26, 2024"
    assert meta.published_start_date == "2017-09-25"
    assert meta.published_end_date == "2024-06-26"
    assert "Comedy" in meta.genres
    assert "Romance" in meta.genres
    assert "Supernatural" in meta.genres
    assert "Mythology" in meta.themes
    assert "Seinen" in meta.demographics
    assert "Shounen" in meta.demographics
    assert meta.serialization == ["Young Dragon Age"]
    assert len(meta.authors) == 1
    assert meta.authors[0].name == "Abe, Youichi"
    assert meta.authors[0].role == "Story & Art"
    assert meta.score == 7.35
    assert meta.rank == 4520
    assert meta.popularity == 8900
    assert meta.members == 1450
    assert meta.favorites == 42


# --- TESTS: PARSE MAL REVIEWS HTML ---


def test_parse_mal_reviews_page_html():
    reviews, total_expected, has_next = parse_mal_reviews_page_html(SAMPLE_MAL_REVIEWS_HTML, "130997")
    assert total_expected == 2
    assert has_next is False
    assert len(reviews) == 2

    # Review 1: EtherLux
    r1 = reviews[0]
    assert r1["source_review_id"] == "534123"
    assert r1["reviewer_name"] == "EtherLux"
    assert r1["reviewer_profile_url"] == "https://myanimelist.net/profile/EtherLux"
    assert r1["reviewer_avatar_url"] == "/images/user_ether.jpg"
    assert r1["recommendation_status"] == "not_recommended"
    assert r1["is_preliminary"] is True
    assert r1["chapters_progress"] == "15/31 chp"
    assert r1["is_spoiler"] is False
    assert r1["overall_rating"] == 5
    assert r1["posted_at_raw"] == "Feb 4, 2024"
    assert r1["posted_at"] == datetime(2024, 2, 4, tzinfo=timezone.utc)
    assert "I started reading this series" in r1["content_text"]
    assert "The art remains wonderful though." in r1["content_text"]
    assert "read more" not in r1["content_text"].lower()
    assert r1["reactions"]["total"] == 3
    assert r1["reactions"]["funny"] == 2
    assert r1["reactions"]["confusing"] == 1
    assert r1["word_count"] > 10

    # Review 2: TomboyEmouto
    r2 = reviews[1]
    assert r2["source_review_id"] == "534999"
    assert r2["reviewer_name"] == "TomboyEmouto"
    assert r2["reviewer_avatar_url"] == "/images/user_tomboy.jpg"
    assert r2["recommendation_status"] == "mixed_feelings"
    assert r2["is_preliminary"] is False
    assert r2["is_spoiler"] is True
    assert r2["overall_rating"] == 7
    assert r2["posted_at_raw"] == "Feb 2, 2026"
    assert r2["posted_at"] == datetime(2026, 2, 2, tzinfo=timezone.utc)
    # Check that text inside span.js-hidden is parsed
    assert "Later in the plot, the revelation about Romi's family" in r2["content_text"]
    assert r2["reactions"]["total"] == 5
    assert r2["reactions"]["nice"] == 2
    assert r2["reactions"]["love_it"] == 2
    assert r2["reactions"]["informative"] == 1


# --- TESTS: APPLY EXTENDED MAL METADATA TO MANGA ---


def test_apply_extended_mal_metadata_to_manga():
    meta = parse_mal_manga_info_html(SAMPLE_MAL_INFO_HTML, "130997")
    manga = {
        "_id": ObjectId("60d5ecb8b487343568912345"),
        "title": "Youkaku no Majoromi",
        "alt_titles": ["en|Witch Romi"],
        "volumes": None,
        "chapters": None,
        "links": [],
        "metadata_locks": {"title": True},
        "tracker_metadata": {},
    }

    update_doc = apply_extended_mal_metadata_to_manga(manga, meta, apply_empty_fields=True)
    assert "tracker_metadata.mal_extended" in update_doc
    assert update_doc["tracker_metadata.mal_extended"]["mal_id"] == 130997
    assert update_doc["volumes"] == 3
    assert update_doc["chapters"] == 31
    assert "title" not in update_doc  # title was locked!

    # Alt titles should include Japanese and English
    new_alts = update_doc.get("alt_titles", [])
    assert any("羊角のマジョロミ" in a for a in new_alts)
    assert any("Sheeply Horned Witch Romi" in a for a in new_alts)

    # Links should have MAL link
    links = update_doc.get("links", [])
    assert any(link.get("url") == "https://myanimelist.net/manga/130997" for link in links)


# --- TESTS: EXTERNAL REVIEW SERVICE ISOLATION & CRUD ---


@pytest.mark.anyio
async def test_external_reviews_service_isolation_and_upsert():
    mock_db = MagicMock()
    mock_external_reviews = MagicMock()
    mock_personal_reviews = MagicMock()
    mock_mangas = MagicMock()

    mock_db.external_reviews = mock_external_reviews
    mock_db.reviews = mock_personal_reviews
    mock_db.mangas = mock_mangas

    # Setup find_one for manga
    mock_mangas.find_one = AsyncMock(
        return_value={
            "_id": ObjectId("60d5ecb8b487343568912345"),
            "title": "Youkaku no Majoromi",
            "links": [{"title": "mal", "url": "https://myanimelist.net/manga/130997"}],
            "tracker_metadata": {"mal_id": "130997"},
        }
    )

    service = ExternalReviewService(db=mock_db)
    reviews, _, _ = parse_mal_reviews_page_html(SAMPLE_MAL_REVIEWS_HTML, "130997")

    # Simulate saving reviews
    mock_external_reviews.update_one = AsyncMock()
    inserted, updated = await service.save_parsed_reviews("60d5ecb8b487343568912345", "myanimelist", reviews)
    assert inserted + updated == 2
    assert mock_external_reviews.update_one.call_count == 2

    # Verify CRITICAL ARCHITECTURAL ISOLATION RULE: personal collection `reviews` was NEVER touched!
    assert mock_personal_reviews.insert_one.called is False
    assert mock_personal_reviews.update_one.called is False
    assert mock_personal_reviews.update_many.called is False


@pytest.mark.anyio
async def test_external_reviews_listing_and_summary():
    mock_db = MagicMock()
    mock_external_reviews = MagicMock()
    mock_mangas = MagicMock()
    mock_db.external_reviews = mock_external_reviews
    mock_db.mangas = mock_mangas

    mock_mangas.find_one = AsyncMock(
        return_value={
            "_id": ObjectId("60d5ecb8b487343568912345"),
            "links": [{"title": "mal", "url": "https://myanimelist.net/manga/130997"}],
            "tracker_metadata": {"mal_id": "130997"},
        }
    )

    now = datetime.now(timezone.utc)
    mock_docs = [
        {
            "_id": ObjectId("60d5ecb8b487343568910001"),
            "manga_id": "60d5ecb8b487343568912345",
            "source": "myanimelist",
            "source_work_id": "130997",
            "source_review_id": "534123",
            "source_url": "https://myanimelist.net/reviews.php?id=534123",
            "reviewer_name": "EtherLux",
            "overall_rating": 5,
            "recommendation_status": "not_recommended",
            "is_preliminary": True,
            "is_spoiler": False,
            "content_text": "Not recommended text",
            "reactions": {"total": 3},
            "fetched_at": now,
            "updated_at": now,
        },
        {
            "_id": ObjectId("60d5ecb8b487343568910002"),
            "manga_id": "60d5ecb8b487343568912345",
            "source": "myanimelist",
            "source_work_id": "130997",
            "source_review_id": "534999",
            "source_url": "https://myanimelist.net/reviews.php?id=534999",
            "reviewer_name": "TomboyEmouto",
            "overall_rating": 7,
            "recommendation_status": "mixed_feelings",
            "is_preliminary": False,
            "is_spoiler": True,
            "content_text": "Spoiler text here",
            "reactions": {"total": 5},
            "fetched_at": now,
            "updated_at": now,
        },
    ]

    class MockCursor:
        def __init__(self, items):
            self.items = items

        def sort(self, *args, **kwargs):
            return self

        def skip(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def __aiter__(self):
            self._iter = iter(self.items)
            return self

        async def __anext__(self):
            try:
                return next(self._iter)
            except StopIteration:
                raise StopAsyncIteration

    mock_external_reviews.count_documents = AsyncMock(return_value=2)
    mock_external_reviews.find = MagicMock(return_value=MockCursor(mock_docs))
    mock_external_reviews.aggregate = MagicMock(
        return_value=MockCursor(
            [
                {
                    "_id": None,
                    "total": 2,
                    "spoiler_count": 1,
                    "preliminary_count": 1,
                    "avg_rating": 6.0,
                    "by_rec": [
                        {"_id": "not_recommended", "count": 1},
                        {"_id": "mixed_feelings", "count": 1},
                    ],
                    "by_src": [{"_id": "myanimelist", "count": 2}],
                    "latest_fetched": now,
                }
            ]
        )
    )

    service = ExternalReviewService(db=mock_db)
    res = await service.list_external_reviews("60d5ecb8b487343568912345")

    assert res.total == 2
    assert len(res.items) == 2
    assert res.summary.total_reviews == 2
    assert res.summary.by_source["myanimelist"] == 2
    assert res.summary.spoiler_count == 1
    assert res.summary.preliminary_count == 1
    assert res.summary.average_rating == 6.0
    assert res.summary.linked_mal_id == "130997"
