"""FastAPI Router for Module 8: Reading List Items Search/Filter, Batch Add/Remove & Analytics."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User
from app.modules.mod8_list_items.schemas import (
    BatchAddMangaRequest,
    BatchAddMangaResponse,
    ListItemsCollectionResponse,
    ReadingListAnalyticsResponse,
)
from app.modules.mod8_list_items.service import ListItemsService

router = APIRouter(prefix="/api/v1/reading-lists", tags=["Module 8 - List Items & Analytics"])


@router.post("/batch-add-manga", response_model=BatchAddMangaResponse)
async def batch_add_manga_to_lists(
    payload: BatchAddMangaRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BatchAddMangaResponse:
    """UC-8.3: Batch add a manga to multiple personal lists + optional inline new list creation."""
    return await ListItemsService.batch_add_manga_to_lists(db, viewer, payload)


@router.get("/{list_id}/items", response_model=ListItemsCollectionResponse)
async def list_items_in_reading_list(
    list_id: uuid.UUID,
    q: str | None = Query(default=None),
    tag_slug: str | None = Query(default=None),
    pub_status: str | None = Query(default=None),
    sort_by: str = Query(default="added_desc", pattern="^(added_desc|title_asc|rating_desc)$"),
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ListItemsCollectionResponse:
    """UC-8.1 & UC-8.2: List, search, and filter mangas inside a specific reading list."""
    return await ListItemsService.list_items_in_reading_list(
        db=db,
        list_id=list_id,
        viewer=viewer,
        q=q,
        tag_slug=tag_slug,
        pub_status=pub_status,
        sort_by=sort_by,
    )


@router.delete("/{list_id}/items/{manga_id}")
async def remove_manga_from_list(
    list_id: uuid.UUID,
    manga_id: str,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """UC-8.4: Remove a manga from a reading list."""
    return await ListItemsService.remove_manga_from_list(db, list_id, manga_id, viewer)


@router.get("/{list_id}/analytics", response_model=ReadingListAnalyticsResponse)
async def get_list_analytics(
    list_id: uuid.UUID,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadingListAnalyticsResponse:
    """UC-8.5: Get metadata analytics for a reading list."""
    return await ListItemsService.get_list_analytics(db, list_id, viewer)
