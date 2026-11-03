"""Pydantic v2 Schemas for Module 3 (Manga Discovery, Reading Status)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class UpdateReadingStatusRequest(BaseModel):
    status: Literal["reading", "plan_to_read", "completed", "on_hold", "dropped"]
