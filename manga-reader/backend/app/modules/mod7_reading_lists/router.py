"""FastAPI Router for Module 7: Personal Reading Lists, Privacy & Merge/Deduplicate."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User
from app.modules.mod7_reading_lists.schemas import (
    ReadingListCollectionResponse,
    ReadingListCreateRequest,
    ReadingListMergeRequest,
    ReadingListResponse,
    ReadingListUpdateRequest,
)
from app.modules.mod7_reading_lists.service import ReadingListService

router = APIRouter(prefix="/api/v1/reading-lists", tags=["Module 7 - Personal Reading Lists"])


@router.get("", response_model=ReadingListCollectionResponse)
async def list_my_reading_lists(
    q: str | None = Query(default=None),
    sort_by: str = Query(default="newest", pattern="^(newest|name_asc|most_items)$"),
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadingListCollectionResponse:
    """UC-7.1: View and search current user's personal reading lists."""
    return await ReadingListService.list_my_reading_lists(db, viewer, q, sort_by)


@router.post("", response_model=ReadingListResponse, status_code=status.HTTP_201_CREATED)
async def create_reading_list(
    payload: ReadingListCreateRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadingListResponse:
    """UC-7.2: Create a new personal reading list."""
    return await ReadingListService.create_reading_list(db, viewer, payload)


@router.post("/merge", response_model=ReadingListResponse, status_code=status.HTTP_201_CREATED)
async def merge_reading_lists(
    payload: ReadingListMergeRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadingListResponse:
    """UC-7.6: Merge 2 or more personal reading lists with automatic manga deduplication."""
    return await ReadingListService.merge_reading_lists(db, viewer, payload)


@router.get("/{list_id}", response_model=ReadingListResponse)
async def get_reading_list_detail(
    list_id: uuid.UUID,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadingListResponse:
    """UC-7.3: Get metadata of a personal reading list (owner only)."""
    return await ReadingListService.get_reading_list_detail(db, list_id, viewer)


@router.put("/{list_id}", response_model=ReadingListResponse)
async def update_reading_list(
    list_id: uuid.UUID,
    payload: ReadingListUpdateRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReadingListResponse:
    """UC-7.4: Update name and description of a personal reading list."""
    return await ReadingListService.update_reading_list(db, list_id, viewer, payload)


@router.delete("/{list_id}")
async def delete_reading_list(
    list_id: uuid.UUID,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """UC-7.5: Delete a personal reading list."""
    return await ReadingListService.delete_reading_list(db, list_id, viewer)
