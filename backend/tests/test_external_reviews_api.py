from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from starlette.testclient import TestClient

from backend.main import app
from backend.models.external_review import (
    ExternalReviewListResponse,
    ExternalReviewResponse,
    ExternalReviewStatsSummary,
)
from backend.services.external_review_service import external_review_service


@pytest.fixture
def client():
    return TestClient(app)


def test_list_external_reviews_endpoint(client):
    now = datetime.now(timezone.utc)
    mock_response = ExternalReviewListResponse(
        items=[
            ExternalReviewResponse(
                _id="60d5ecb8b487343568910001",
                manga_id="mock_manga_id_123",
                source="myanimelist",
                source_work_id="130997",
                source_review_id="534123",
                source_url="https://myanimelist.net/reviews.php?id=534123",
                reviewer_name="EtherLux",
                overall_rating=8,
                recommendation_status="recommended",
                content_text="Sample content",
                fetched_at=now,
                updated_at=now,
            )
        ],
        total=1,
        skip=0,
        limit=20,
        summary=ExternalReviewStatsSummary(
            total_reviews=1,
            by_source={"myanimelist": 1},
            by_recommendation={"recommended": 1},
            linked_mal_id="130997",
        ),
    )

    with patch.object(
        external_review_service,
        "list_external_reviews",
        new_callable=AsyncMock,
        return_value=mock_response,
    ) as mock_list:
        resp = client.get(
            "/api/manga/mock_manga_id_123/external-reviews?source=myanimelist&recommendation_status=recommended"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["reviewer_name"] == "EtherLux"
        assert data["summary"]["linked_mal_id"] == "130997"
        mock_list.assert_called_once()


def test_trigger_sync_endpoint(client):
    mock_status = {
        "manga_id": "mock_manga_id_123",
        "source": "myanimelist",
        "status": "running",
        "stage": "resolving_id",
        "stage_label": "Đang xác thực mã định danh...",
        "progress_pct": 5.0,
        "logs": ["Bắt đầu tác vụ..."],
    }

    with patch.object(
        external_review_service,
        "start_sync",
        new_callable=AsyncMock,
        return_value=mock_status,
    ) as mock_start:
        resp = client.post(
            "/api/manga/mock_manga_id_123/external-reviews/sync",
            json={"source": "myanimelist", "mal_url_or_id": "130997"},
        )
        assert resp.status_code == 202
        data = resp.json()
        assert data["status"] == "running"
        assert data["progress_pct"] == 5.0
        mock_start.assert_called_once()


def test_get_sync_status_endpoint(client):
    mock_status = {
        "manga_id": "mock_manga_id_123",
        "status": "completed",
        "stage": "completed",
        "stage_label": "Hoàn tất!",
        "progress_pct": 100.0,
        "fetched_reviews_count": 2,
    }

    with patch.object(
        external_review_service,
        "get_sync_status",
        return_value=mock_status,
    ):
        resp = client.get("/api/manga/mock_manga_id_123/external-reviews/sync-status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"
        assert data["fetched_reviews_count"] == 2


def test_cancel_sync_endpoint(client):
    with patch.object(
        external_review_service,
        "cancel_sync",
        return_value=True,
    ):
        resp = client.post("/api/manga/mock_manga_id_123/external-reviews/sync/cancel")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "cancelled"


def test_delete_individual_review_endpoint(client):
    with patch.object(
        external_review_service,
        "delete_external_review",
        new_callable=AsyncMock,
        return_value=True,
    ):
        resp = client.delete("/api/manga/mock_manga_id_123/external-reviews/534123")
        assert resp.status_code == 204

    with patch.object(
        external_review_service,
        "delete_external_review",
        new_callable=AsyncMock,
        return_value=False,
    ):
        resp = client.delete("/api/manga/mock_manga_id_123/external-reviews/not_found_id")
        assert resp.status_code == 404


def test_clear_manga_reviews_endpoint(client):
    with patch.object(
        external_review_service,
        "clear_manga_external_reviews",
        new_callable=AsyncMock,
        return_value=5,
    ):
        resp = client.delete("/api/manga/mock_manga_id_123/external-reviews?source=myanimelist")
        assert resp.status_code == 200
        data = resp.json()
        assert data["deleted_count"] == 5
