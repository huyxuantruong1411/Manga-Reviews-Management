"""Pydantic v2 DTOs for Module 7 (Personal Reading Lists & Merge/Deduplicate)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ReadingListResponse(BaseModel):
    list_id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    description: str
    visibility: str
    manga_count: int
    created_at: datetime
    updated_at: datetime


class ReadingListCollectionResponse(BaseModel):
    total: int
    items: list[ReadingListResponse]


class ReadingListCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=1000)


class ReadingListUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=1000)


class ReadingListMergeRequest(BaseModel):
    source_list_ids: list[uuid.UUID] = Field(min_length=2)
    new_list_name: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=1000)
    delete_source_lists: bool = False
    confirm_empty: bool = False
