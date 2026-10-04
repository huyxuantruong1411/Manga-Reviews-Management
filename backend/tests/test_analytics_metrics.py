import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from backend.services.analytics_service import AnalyticsService


class TestAnalyticsMetrics(unittest.IsolatedAsyncioTestCase):
    async def test_overview_stats_includes_velocity_and_rates(self):
        service = AnalyticsService()

        # Mock mangas collection
        mangas_coll = SimpleNamespace(
            count_documents=AsyncMock(
                side_effect=[
                    100,  # total_manga
                    5,  # m_comp_7d
                    12,  # m_comp_30d
                    8,  # added_last_7d
                    4,  # added_prev_7d
                    25,  # added_last_30d
                    18,  # added_prev_30d
                    60,  # rated_count
                ]
            ),
            find=lambda query: SimpleNamespace(distinct=AsyncMock(return_value=["m1", "m2", "m3"])),
            aggregate=MagicMock(
                side_effect=[
                    SimpleNamespace(to_list=AsyncMock(return_value=[{"avg_rating": 8.25}])),
                    SimpleNamespace(
                        to_list=AsyncMock(
                            return_value=[
                                {"_id": "completed", "count": 30},
                                {"_id": "reading", "count": 10},
                                {"_id": "unread", "count": 50},
                                {"_id": "plan_to_read", "count": 10},
                            ]
                        )
                    ),
                ]
            ),
        )

        # Mock reviews collection
        reviews_coll = SimpleNamespace(count_documents=AsyncMock(return_value=15))

        # Mock audit collection
        audit_coll = SimpleNamespace(
            count_documents=AsyncMock(
                side_effect=[
                    3,  # completed_last_7d from audit (will fallback to m_comp_7d=5)
                    2,  # completed_prev_7d
                    10,  # completed_last_30d from audit (fallback to m_comp_30d=12)
                    7,  # completed_prev_30d
                ]
            )
        )

        service._get_mangas_collection = lambda: mangas_coll
        service._get_reviews_collection = lambda: reviews_coll
        service._get_audit_collection = lambda: audit_coll

        res = await service.get_overview_stats({})

        self.assertEqual(res["total_manga"], 100)
        self.assertEqual(res["total_reviews"], 15)
        self.assertEqual(res["average_rating"], 8.25)
        self.assertEqual(res["status_distribution"]["completed"], 30)

        # Velocity and storytelling rates
        self.assertIn("velocity", res)
        vel = res["velocity"]
        self.assertEqual(vel["completion_rate"], 30.0)  # 30 / 100 * 100
        self.assertEqual(vel["backlog_count"], 60)  # unread(50) + plan_to_read(10)
        self.assertEqual(vel["backlog_rate"], 60.0)
        self.assertEqual(vel["in_progress_count"], 10)
        self.assertEqual(vel["review_coverage_rate"], 50.0)  # 15 / 30 * 100
        self.assertEqual(vel["rated_count"], 60)
        self.assertEqual(vel["unrated_count"], 40)
        self.assertEqual(vel["completed_last_7d"], 5)
        self.assertEqual(vel["completed_prev_7d"], 2)
        self.assertEqual(vel["added_last_7d"], 8)


if __name__ == "__main__":
    unittest.main()
