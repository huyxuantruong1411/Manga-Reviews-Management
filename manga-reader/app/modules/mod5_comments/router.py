"""FastAPI Router for Module 5: Comments, 2-Level Spoiler Lock, Edit History, Soft Delete & Reactions."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, get_optional_user
from app.models import User
from app.modules.mod5_comments.schemas import (
    CommentCreateRequest,
    CommentEditHistoryListResponse,
    CommentItemResponse,
    CommentListResponse,
    CommentReactionRequest,
    CommentReactionResponse,
    CommentReportCreateRequest,
    CommentSpoilerUpdateRequest,
    CommentUpdateRequest,
)
from app.modules.mod5_comments.service import CommentService

router = APIRouter(prefix="/api/v1", tags=["Module 5 - Comments & Spoilers"])


@router.get("/mangas/{manga_id}/comments", response_model=CommentListResponse)
async def list_manga_comments(
    manga_id: str,
    chapter_id: str | None = Query(default=None),
    include_spoilers: bool = Query(default=True),
    sort_by: str = Query(default="newest", pattern="^(newest|oldest|top_liked)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    viewer: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> CommentListResponse:
    """UC-5.1: List comments on a manga or specific chapter."""
    return await CommentService.list_manga_comments(
        db=db,
        manga_id=manga_id,
        viewer=viewer,
        chapter_id=chapter_id,
        include_spoilers=include_spoilers,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )


@router.post("/mangas/{manga_id}/comments", response_model=CommentItemResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    manga_id: str,
    payload: CommentCreateRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentItemResponse:
    """UC-5.2: Post a new comment or reply."""
    return await CommentService.create_comment(db, manga_id, viewer, payload)


@router.patch("/comments/{comment_id}/spoiler", response_model=CommentItemResponse)
async def update_spoiler_flag(
    comment_id: uuid.UUID,
    payload: CommentSpoilerUpdateRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentItemResponse:
    """UC-5.3: Toggle spoiler flag (Admin lock prevents author from unmarking)."""
    return await CommentService.update_spoiler_flag(db, comment_id, viewer, payload)


@router.put("/comments/{comment_id}", response_model=CommentItemResponse)
async def edit_comment(
    comment_id: uuid.UUID,
    payload: CommentUpdateRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentItemResponse:
    """UC-5.4: Edit comment and save previous version in edit history."""
    return await CommentService.edit_comment(db, comment_id, viewer, payload)


@router.get("/comments/{comment_id}/edit-history", response_model=CommentEditHistoryListResponse)
async def get_comment_edit_history(
    comment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> CommentEditHistoryListResponse:
    """UC-5.4: View chronological edit history of a comment."""
    return await CommentService.get_comment_edit_history(db, comment_id)


@router.get("/users/{user_id}/comments", response_model=CommentListResponse)
async def list_user_comments(
    user_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> CommentListResponse:
    """UC-5.5: List non-deleted comments posted by a user."""
    return await CommentService.list_user_comments(db, user_id, page, page_size)


@router.delete("/comments/{comment_id}")
async def soft_delete_comment(
    comment_id: uuid.UUID,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """UC-5.6: Soft delete comment while preserving replies."""
    return await CommentService.soft_delete_comment(db, comment_id, viewer)


@router.post("/comments/{comment_id}/reports", status_code=status.HTTP_201_CREATED)
async def report_comment(
    comment_id: uuid.UUID,
    payload: CommentReportCreateRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """UC-5.7: Report a comment for unmarked spoiler or community violation."""
    return await CommentService.report_comment(db, comment_id, viewer, payload)


@router.post("/comments/{comment_id}/reactions", response_model=CommentReactionResponse)
async def react_to_comment(
    comment_id: uuid.UUID,
    payload: CommentReactionRequest,
    viewer: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommentReactionResponse:
    """UC-5.8: Like or Dislike a comment (mutually exclusive)."""
    return await CommentService.react_to_comment(db, comment_id, viewer, payload)
