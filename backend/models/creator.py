from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel, Field

from backend.models.pyobjectid import PyObjectId


class CreatorBase(BaseModel):
    mangadex_id: Optional[str] = None
    name: str
    biography: Dict[str, str] = Field(default_factory=dict)  # e.g., {"en": "...", "ja": "..."}
    twitter: Optional[str] = None
    pixiv: Optional[str] = None
    youtube: Optional[str] = None
    website: Optional[str] = None


class CreatorCreate(CreatorBase):
    pass


class CreatorUpdate(BaseModel):
    name: Optional[str] = None
    biography: Optional[Dict[str, str]] = None
    twitter: Optional[str] = None
    pixiv: Optional[str] = None
    youtube: Optional[str] = None
    website: Optional[str] = None


class CreatorResponse(CreatorBase):
    id: PyObjectId = Field(alias="_id")
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True
