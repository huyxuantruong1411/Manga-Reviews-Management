import pytest
from datetime import datetime
from backend.services.search_ranking_service import calculate_relevance_score, rank_manga_search_results


def test_exact_title_match_ranks_highest():
    query = "sekai oni"

    exact_match = {
        "_id": "1",
        "title": "Sekai Oni",
        "alt_titles": ["ja|世界鬼", "en|World Demon"],
        "author": "Okabe Uru",
        "artist": "Okabe Uru",
        "added_at": datetime(2026, 5, 24, 12, 0, 0),
    }

    incidental_match_1 = {
        "_id": "2",
        "title": "Isekai H Eiyuuden: Bishoujo Senshi-tachi wa Saikyou Gunshi no Muchana Onegai ni Sakaraenai",
        "alt_titles": ["en|The Beautiful Warrior Girls..."],
        "author": "Oikawa Tooru",
        "artist": "Oikawa Tooru",
        "added_at": datetime(2026, 6, 7, 15, 0, 0),
    }

    incidental_match_2 = {
        "_id": "3",
        "title": 'Ore dake Fuguu Skill no Isekai Shoukan Hangyakuki ~Saijaku Skill "Kyuushuu" ga Subete wo Nomikomu made~',
        "alt_titles": ["en|I'm the Only One with Unfavorable Skills, Isekai Summoning Rebellion"],
        "author": "Skyfarm",
        "artist": "Ryusei Takahata",
        "added_at": datetime(2026, 5, 27, 17, 0, 0),
    }

    score_exact = calculate_relevance_score(exact_match, query)
    score_incidental_1 = calculate_relevance_score(incidental_match_1, query)
    score_incidental_2 = calculate_relevance_score(incidental_match_2, query)

    assert score_exact > score_incidental_1
    assert score_exact > score_incidental_2
    assert score_exact > 20000.0  # Massive exact match boost

    # Rank list
    ranked = rank_manga_search_results([incidental_match_1, incidental_match_2, exact_match], query)
    assert ranked[0]["_id"] == "1"
    assert ranked[0]["title"] == "Sekai Oni"


def test_prefix_match_ranks_above_substring():
    query = "sekai"

    prefix_manga = {
        "_id": "1",
        "title": "Sekai Saikou no Ansatsusha",
        "alt_titles": [],
        "added_at": datetime(2026, 5, 23),
    }

    substring_manga = {
        "_id": "2",
        "title": "Boku wa Isekai de Fuyo Mahou...",
        "alt_titles": [],
        "added_at": datetime(2026, 6, 7),
    }

    score_prefix = calculate_relevance_score(prefix_manga, query)
    score_sub = calculate_relevance_score(substring_manga, query)

    assert score_prefix > score_sub

    ranked = rank_manga_search_results([substring_manga, prefix_manga], query)
    assert ranked[0]["_id"] == "1"


def test_title_density_normalization_short_beats_long():
    query = "naruto"

    short_title = {
        "_id": "1",
        "title": "Naruto",
        "alt_titles": [],
        "added_at": datetime(2026, 1, 1),
    }

    long_title = {
        "_id": "2",
        "title": "Naruto: The Seventh Hokage and the Scarlet Spring Plus Extra Gaiden",
        "alt_titles": [],
        "added_at": datetime(2026, 6, 1),
    }

    ranked = rank_manga_search_results([long_title, short_title], query)
    assert ranked[0]["_id"] == "1"


def test_alt_title_matching_ranks_between_title_and_author():
    query = "world demon"

    alt_match = {
        "_id": "1",
        "title": "Sekai Oni",
        "alt_titles": ["en|World Demon"],
        "author": "Okabe Uru",
        "artist": "Okabe Uru",
        "added_at": datetime(2026, 5, 24),
    }

    author_match = {
        "_id": "2",
        "title": "Some Other Manga",
        "alt_titles": [],
        "author": "World Demon Guy",
        "artist": "Someone",
        "added_at": datetime(2026, 6, 1),
    }

    ranked = rank_manga_search_results([author_match, alt_match], query)
    assert ranked[0]["_id"] == "1"


def test_tie_breaking_preserves_secondary_sort():
    query = "isekai"

    manga_a = {
        "_id": "1",
        "title": "Isekai Quest",
        "alt_titles": [],
        "added_at": datetime(2026, 1, 1),
        "personal_rating": 8.0,
    }

    manga_b = {
        "_id": "2",
        "title": "Isekai Magic",
        "alt_titles": [],
        "added_at": datetime(2026, 6, 1),
        "personal_rating": 9.5,
    }

    # Sort with secondary personal_rating desc
    ranked_rating = rank_manga_search_results([manga_a, manga_b], query, sort_by="personal_rating", sort_order="desc")
    assert ranked_rating[0]["_id"] == "2"

    # Sort with secondary added_at desc
    ranked_added = rank_manga_search_results([manga_a, manga_b], query, sort_by="added_at", sort_order="desc")
    assert ranked_added[0]["_id"] == "2"


def test_no_results_lost():
    query = "sekai oni"
    docs = [
        {"_id": str(i), "title": f"Manga {i}", "alt_titles": [], "added_at": datetime(2026, 1, i + 1)}
        for i in range(10)
    ]
    ranked = rank_manga_search_results(docs, query)
    assert len(ranked) == 10


@pytest.mark.anyio
async def test_manga_service_search_relevance_ranking(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock
    from backend.services.manga_service import manga_service

    # Mock collection
    mock_coll = MagicMock()
    mock_coll.count_documents = AsyncMock(return_value=3)

    sample_docs = [
        {
            "_id": "doc1",
            "title": "Isekai H Eiyuuden",
            "alt_titles": ["en|Onegai..."],
            "added_at": datetime(2026, 6, 7),
        },
        {
            "_id": "doc2",
            "title": "Sekai Oni",
            "alt_titles": ["ja|世界鬼"],
            "added_at": datetime(2026, 5, 24),
        },
        {
            "_id": "doc3",
            "title": "Ore dake Fuguu Skill",
            "alt_titles": ["en|Isekai Summoning"],
            "added_at": datetime(2026, 5, 27),
        },
    ]

    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=sample_docs)
    mock_coll.find.return_value = mock_cursor

    monkeypatch.setattr(manga_service, "_get_mangas_collection", lambda: mock_coll)

    res = await manga_service.get_mangas(search="sekai oni", sort_by="added_at", sort_order="desc")
    assert res["total"] == 3
    assert len(res["items"]) == 3
    # Sekai Oni must be rank 1 despite being added earliest
    assert res["items"][0]["title"] == "Sekai Oni"
    assert res["items"][0]["_id"] == "doc2"
