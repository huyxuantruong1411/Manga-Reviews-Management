"""Pydantic v2 Schemas for Module 1 (Account Lock/Unlock, Activity Logs, Analytics, Reports)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LockUserRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)
    locked_until: datetime | None = None


class UnlockUserRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)
    force_override: bool = False


class ResolveReportRequest(BaseModel):
    action: str = Field(..., min_length=2, max_length=64)
    note: str = Field(..., min_length=2, max_length=2000)
