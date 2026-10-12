from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

from backend.models.review import ReviewCreate
from backend.routers import reviews


@pytest.mark.anyio
async def test_same_title_does_not_discard_new_review_content(monkeypatch):
    manga_id, old_id, new_id = ObjectId(), ObjectId(), ObjectId()
    db = MagicMock()
    db.mangas.find_one = AsyncMock(return_value={"title": "Fixture"})
    db.reviews.find_one = AsyncMock(
        return_value={
            "_id": old_id,
            "title": "My Review",
            "content_json": {"text": "older"},
            "created_at": datetime.now(),
        }
    )
    db.reviews.insert_one = AsyncMock(return_value=SimpleNamespace(inserted_id=new_id))
    monkeypatch.setattr(reviews, "get_db", lambda: db)
    monkeypatch.setattr(reviews, "delete_cache", AsyncMock())
    monkeypatch.setattr(reviews.audit_service, "log_event", AsyncMock())
    result = await reviews.create_review(str(manga_id), ReviewCreate(title="My Review", content_json={"text": "new"}))
    assert result["_id"] == str(new_id)
    assert result["content_json"] == {"text": "new"}
    db.reviews.insert_one.assert_awaited_once()


@pytest.mark.anyio
@pytest.mark.parametrize("action", ["cleanup_review_tabs", "finalize_review"])
async def test_content_actions_invalidate_cached_reviews(monkeypatch, action):
    db = MagicMock()
    db.reviews.find_one = AsyncMock(
        return_value={
            "_id": ObjectId(),
            "content_json": {"type": "doc", "content": []},
        }
    )
    db.reviews.update_one = AsyncMock()
    cache = AsyncMock()
    monkeypatch.setattr(reviews, "get_db", lambda: db)
    monkeypatch.setattr(reviews, "delete_cache", cache)
    await getattr(reviews, action)(str(ObjectId()), str(ObjectId()))
    cache.assert_awaited_once()
