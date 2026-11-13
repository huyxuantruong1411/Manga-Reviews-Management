import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

from backend.services.analytics_service import AnalyticsService
from backend.services.review_export_service import ReviewExportService


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)
        self._idx = 0

    def __aiter__(self):
        self._idx = 0
        return self

    async def __anext__(self):
        if self._idx >= len(self._docs):
            raise StopAsyncIteration
        item = self._docs[self._idx]
        self._idx += 1
        return item

    async def to_list(self, length=None):
        if length is None:
            return list(self._docs)
        return list(self._docs[:length])


class TestAnalyticsPerformance(unittest.IsolatedAsyncioTestCase):
    async def test_get_all_analytics_uses_consolidated_facets_and_single_id_lookup(self):
        service = AnalyticsService()
        now = datetime.now(timezone.utc)
        tag_id = ObjectId()
        tag_id_str = str(tag_id)

        manga_facet_doc = {
            "summary": [
                {
                    "total_manga": 100,
                    "rated_count": 60,
                    "avg_rating": 8.25,
                    "m_comp_7d": 5,
                    "m_comp_30d": 12,
                    "added_last_7d": 8,
                    "added_prev_7d": 4,
                    "added_last_30d": 20,
                    "added_prev_30d": 15,
                    "earliest_added_at": now - timedelta(days=90),
                    "latest_added_at": now,
                }
            ],
            "status_distribution": [
                {"_id": "unread", "count": 50},
                {"_id": "reading", "count": 10},
                {"_id": "completed", "count": 30},
                {"_id": "plan_to_read", "count": 10},
            ],
            "score_distribution": [{"_id": 8, "count": 20}, {"_id": 9, "count": 40}],
            "top_tags_raw": [{"_id": tag_id_str, "count": 25}],
            "manga_timeline": [{"_id": "2026-10", "count": 12}],
            "demographic": [{"_id": "shounen", "count": 70}],
            "publishing_status": [{"_id": "ongoing", "count": 60}],
            "original_language": [{"_id": "ja", "count": 100}],
            "content_rating": [{"_id": "safe", "count": 90}],
            "top_authors": [{"_id": "Oda", "count": 4}],
            "top_artists": [{"_id": "Murata", "count": 3}],
            "demo_ratings": [{"_id": "shounen", "avg_rating": 8.5}],
            "status_ratings": [{"_id": "completed", "avg_rating": 8.8}],
            "year_distribution": [
                {"year": "2020", "demographic": "shounen", "status": "ongoing", "read_status": "reading", "count": 5}
            ],
        }

        review_facet_doc = {
            "summary": [
                {
                    "total_reviews": 15,
                    "earliest": now - timedelta(days=40),
                    "latest": now - timedelta(days=1),
                }
            ],
            "timeline": [{"_id": "2026-10", "count": 7}],
        }

        audit_facet_doc = {
            "velocity_and_range": [
                {
                    "completed_last_7d": 3,
                    "completed_prev_7d": 2,
                    "completed_last_30d": 14,
                    "completed_prev_30d": 9,
                    "earliest": now - timedelta(days=60),
                    "latest": now - timedelta(days=2),
                }
            ],
            "timeline": [{"_id": "2026-10", "count": 6}],
        }

        distinct_ids_mock = AsyncMock(return_value=["m1", "m2", "m3"])
        mangas_agg_mock = MagicMock(return_value=FakeCursor([manga_facet_doc]))
        reviews_agg_mock = MagicMock(return_value=FakeCursor([review_facet_doc]))
        audit_agg_mock = MagicMock(return_value=FakeCursor([audit_facet_doc]))

        mangas_coll = SimpleNamespace(
            find=MagicMock(return_value=SimpleNamespace(distinct=distinct_ids_mock)),
            aggregate=mangas_agg_mock,
        )
        reviews_coll = SimpleNamespace(aggregate=reviews_agg_mock)
        audit_coll = SimpleNamespace(aggregate=audit_agg_mock)
        tags_coll = SimpleNamespace(
            find=MagicMock(return_value=FakeCursor([{"_id": tag_id, "name": {"en": "Action"}, "color": "#f97316"}]))
        )

        service._get_mangas_collection = lambda: mangas_coll
        service._get_reviews_collection = lambda: reviews_coll
        service._get_audit_collection = lambda: audit_coll
        service._get_tags_collection = lambda: tags_coll

        result = await service.get_all_analytics({})

        # Assert consolidated queries (1 facet aggregate each, 1 distinct call total)
        self.assertEqual(mangas_agg_mock.call_count, 1)
        self.assertEqual(distinct_ids_mock.await_count, 1)
        self.assertEqual(reviews_agg_mock.call_count, 1)
        self.assertEqual(audit_agg_mock.call_count, 1)

        manga_pipeline = mangas_agg_mock.call_args.args[0]
        self.assertTrue(any("$facet" in stage for stage in manga_pipeline))

        # Assert exact computed structure & fallback completion max(m_comp, audit_comp)
        self.assertEqual(result["overview"]["total_manga"], 100)
        self.assertEqual(result["overview"]["total_reviews"], 15)
        self.assertEqual(result["overview"]["average_rating"], 8.25)
        self.assertEqual(result["overview"]["velocity"]["completed_last_7d"], 5)  # max(audit=3, mangas=5)
        self.assertEqual(result["overview"]["velocity"]["completed_last_30d"], 14)  # max(audit=14, mangas=12)
        self.assertEqual(result["overview"]["velocity"]["review_coverage_rate"], 50.0)
        self.assertEqual(result["top_tags"][0]["name"], "Action")
        self.assertEqual(result["score_distribution"], [{"score": 8, "count": 20}, {"score": 9, "count": 40}])
        self.assertEqual(result["manga_timeline"], [{"period": "2026-10", "count": 12}])
        self.assertEqual(result["review_timeline"], [{"period": "2026-10", "count": 7}])
        self.assertEqual(result["completed_timeline"], [{"period": "2026-10", "count": 6}])
        self.assertEqual(result["metadata_distributions"]["original_language"], [{"name": "Japanese", "value": 100}])
        self.assertEqual(result["top_creators"]["authors"], [{"name": "Oda", "count": 4}])
        self.assertEqual(result["rating_insights"]["demographic_ratings"], [{"name": "Shounen", "avg_rating": 8.5}])
        self.assertEqual(result["year_distribution"]["min_year"], 2020)
        self.assertIsNotNone(result["timeline_date_range"]["earliest_review"])
        self.assertIsNotNone(result["timeline_date_range"]["earliest_completed"])

    async def test_empty_library_short_circuits_reviews_and_audit_queries(self):
        service = AnalyticsService()
        mangas_agg_mock = MagicMock(return_value=FakeCursor([{"summary": [], "status_distribution": []}]))
        reviews_agg_mock = MagicMock()
        audit_agg_mock = MagicMock()

        service._get_mangas_collection = lambda: SimpleNamespace(
            find=MagicMock(return_value=SimpleNamespace(distinct=AsyncMock(return_value=[]))),
            aggregate=mangas_agg_mock,
        )
        service._get_reviews_collection = lambda: SimpleNamespace(aggregate=reviews_agg_mock)
        service._get_audit_collection = lambda: SimpleNamespace(aggregate=audit_agg_mock)
        service._get_tags_collection = lambda: SimpleNamespace(find=MagicMock(return_value=FakeCursor([])))

        result = await service.get_all_analytics({"title": "__no_match__"})

        reviews_agg_mock.assert_not_called()
        audit_agg_mock.assert_not_called()
        self.assertEqual(result["overview"]["total_manga"], 0)
        self.assertEqual(result["overview"]["total_reviews"], 0)
        self.assertEqual(result["review_timeline"], [])
        self.assertEqual(result["completed_timeline"], [])
        self.assertIsNone(result["timeline_date_range"]["earliest_review"])
        self.assertIsNone(result["timeline_date_range"]["earliest_completed"])

    async def test_redis_cache_hit_and_invalidation(self):
        service = AnalyticsService()
        cache_store = {}

        async def fake_get_cache(key):
            return cache_store.get(key)

        async def fake_set_cache(key, value, ttl=300):
            cache_store[key] = value
            return True

        async def fake_delete_pattern(pattern):
            assert pattern == "analytics:*"
            count = len(cache_store)
            cache_store.clear()
            return count

        mangas_agg_mock = MagicMock(return_value=FakeCursor([{"summary": [{"total_manga": 5, "rated_count": 0}]}]))
        service._get_mangas_collection = lambda: SimpleNamespace(
            find=MagicMock(return_value=SimpleNamespace(distinct=AsyncMock(return_value=[]))),
            aggregate=mangas_agg_mock,
        )
        service._get_reviews_collection = lambda: SimpleNamespace(aggregate=MagicMock())
        service._get_audit_collection = lambda: SimpleNamespace(aggregate=MagicMock())
        service._get_tags_collection = lambda: SimpleNamespace(find=MagicMock(return_value=FakeCursor([])))

        with (
            patch("backend.services.analytics_service.get_cache", side_effect=fake_get_cache),
            patch("backend.services.analytics_service.set_cache", side_effect=fake_set_cache),
            patch("backend.services.analytics_service.delete_cache_pattern", side_effect=fake_delete_pattern),
        ):
            first = await service.get_all_analytics({}, group_by="month", use_cache=True)
            second = await service.get_all_analytics({}, group_by="month", use_cache=True)
            diff_group = await service.get_all_analytics({}, group_by="week", use_cache=True)

            self.assertEqual(first["overview"]["total_manga"], 5)
            self.assertEqual(second["overview"]["total_manga"], 5)
            self.assertEqual(diff_group["overview"]["total_manga"], 5)
            # Only 2 cold computations for 2 distinct cache keys; second 'month' call was served from cache
            self.assertEqual(mangas_agg_mock.call_count, 2)
            self.assertEqual(len(cache_store), 2)

            cleared = await service.invalidate_cache()
            self.assertEqual(cleared, 2)
            self.assertEqual(cache_store, {})

    async def test_review_corpus_summary_uses_cache(self):
        service = ReviewExportService()
        cached_summary = {
            "total_reviews": 12,
            "total_words": 2400,
            "total_characters": 12000,
            "estimated_tokens": 3120,
            "average_words_per_review": 200.0,
            "total_manga_reviewed": 10,
            "average_manga_rating": 8.4,
            "earliest_review_date": None,
            "latest_review_date": None,
            "read_status_distribution": {"completed": 10},
            "top_genres": [{"name": "Action", "count": 8}],
        }

        with (
            patch(
                "backend.services.review_export_service.get_cache", new=AsyncMock(return_value=cached_summary)
            ) as mock_get,
            patch("backend.services.review_export_service.get_db") as mock_db,
        ):
            res = await service.get_review_corpus_summary()
            mock_get.assert_awaited_once()
            mock_db.assert_not_called()
            self.assertEqual(res.total_reviews, 12)
            self.assertEqual(res.total_words, 2400)


if __name__ == "__main__":
    unittest.main()
