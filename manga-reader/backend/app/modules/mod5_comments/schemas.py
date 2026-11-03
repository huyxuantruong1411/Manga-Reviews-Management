"""Pydantic v2 DTOs for Module 5 (Comments, Spoilers, Edit History, Reactions, Comment Reports)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CommentItemResponse(BaseModel):
    comment_id: uuid.UUID
    manga_id: str
    chapter_id: str | None = None
    user_id: uuid.UUID
    username: str
    display_name: str
    avatar_url: str | None = None
    parent_comment_id: uuid.UUID | None = None
    content: str
    is_spoiler: bool
    spoiler_locked_by_admin: bool
    is_edited: bool
    edited_at: datetime | None = None
    is_deleted: bool
    like_count: int
    dislike_count: int
    user_reaction: Literal["like", "dislike"] | None = None
    created_at: datetime


class CommentListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[CommentItemResponse]


class CommentCreateRequest(BaseModel):
    chapter_id: str | None = Field(default=None, max_length=64)
    parent_comment_id: uuid.UUID | None = None
    content: str = Field(min_length=1, max_length=2000)
    is_spoiler: bool = False
    bypass_cooldown: bool = False


class CommentUpdateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class CommentSpoilerUpdateRequest(BaseModel):
    is_spoiler: bool


class CommentEditHistoryItemResponse(BaseModel):
    edit_id: int
    comment_id: uuid.UUID
    previous_content: str
    edited_at: datetime


class CommentEditHistoryListResponse(BaseModel):
    items: list[CommentEditHistoryItemResponse]


class CommentReactionRequest(BaseModel):
    reaction: Literal["like", "dislike", "none"]


class CommentReactionResponse(BaseModel):
    comment_id: uuid.UUID
    user_reaction: Literal["like", "dislike"] | None
    like_count: int
    dislike_count: int


class CommentReportCreateRequest(BaseModel):
    reason_code: Literal["unmarked_spoiler", "spam", "harassment", "hate_speech", "other"]
    description: str | None = Field(default=None, max_length=1000)
