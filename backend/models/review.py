from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from backend.models.pyobjectid import PyObjectId


class ReviewBase(BaseModel):
    title: str = "My Review"
    content_json: Dict[str, Any] = Field(default_factory=dict)  # Tiptap ProseMirror JSON


class ReviewCreate(ReviewBase):
    pass


class ReviewUpdate(BaseModel):
    title: Optional[str] = None
    content_json: Optional[Dict[str, Any]] = None


class ReviewResponse(ReviewBase):
    id: PyObjectId = Field(alias="_id")
    manga_id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False

    class Config:
        populate_by_name = True
