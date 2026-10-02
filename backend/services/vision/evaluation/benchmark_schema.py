"""
benchmark_schema.py - Schema for gold benchmark annotations.
"""

from typing import List, Optional, Tuple

from pydantic import BaseModel, Field

from backend.services.vision.types import PageType, ReadingDirection, ScriptType, TextRole


class GoldText(BaseModel):
    id: str
    bbox: Tuple[float, float, float, float]
    text: str
    script: ScriptType = "latin"
    language: str = "en"
    role: TextRole = "dialogue"
    parent_balloon_id: Optional[str] = None
    parent_frame_id: Optional[str] = None


class GoldBalloon(BaseModel):
    id: str
    bbox: Tuple[float, float, float, float]
    role: str = "speech"
    reading_order: int = 0
    parent_frame_id: Optional[str] = None


class GoldFrame(BaseModel):
    id: str
    bbox: Tuple[float, float, float, float]
    reading_order: int = 0


class GoldPage(BaseModel):
    page_number: int
    page_type: PageType = "story"
    reading_direction: ReadingDirection = "rtl"
    frames: List[GoldFrame] = Field(default_factory=list)
    balloons: List[GoldBalloon] = Field(default_factory=list)
    texts: List[GoldText] = Field(default_factory=list)


class BenchmarkDataset(BaseModel):
    manga_id: str
    chapter_id: str
    pages: List[GoldPage] = Field(default_factory=list)
