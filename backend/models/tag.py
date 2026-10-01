from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel, Field

from backend.models.pyobjectid import PyObjectId


class TagBase(BaseModel):
    mangadex_id: Optional[str] = None
    source: str = "custom"  # "mangadex" or "custom"
    name: Dict[str, str] = Field(default_factory=dict)  # {"en": "Tag Name", "vi": "Tên Tag"}
    group: Optional[str] = "custom"  # e.g. "genre", "theme", "format", "custom"
    description: Optional[Dict[str, str]] = None
    color: Optional[str] = None  # UI tag badge color, especially for custom tags


class TagCreate(TagBase):
    pass


class TagUpdate(BaseModel):
    name: Optional[Dict[str, str]] = None
    group: Optional[str] = None
    description: Optional[Dict[str, str]] = None
    color: Optional[str] = None


class TagResponse(TagBase):
    id: PyObjectId = Field(alias="_id")
    created_at: datetime
    manga_count: Optional[int] = 0

    class Config:
        populate_by_name = True
