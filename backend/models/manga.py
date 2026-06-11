from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum
from backend.models.pyobjectid import PyObjectId

class ReadStatus(str, Enum):
    UNREAD = "unread"
    READING = "reading"
    COMPLETED = "completed"
    DROPPED = "dropped"
    ON_HOLD = "on_hold"
    PLAN_TO_READ = "plan_to_read"
    RE_READING = "re_reading"

class MangaLink(BaseModel):
    title: str
    url: str

class MangaBase(BaseModel):
    mangadex_id: Optional[str] = None
    title: str
    alt_titles: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    author: Optional[str] = None
    artist: Optional[str] = None
    year: Optional[str] = None
    status: Optional[str] = None  # MangaDex publishing status
    read_status: ReadStatus = ReadStatus.UNREAD
    personal_rating: Optional[float] = None  # None or 0-10, step 0.5
    tag_ids: List[str] = Field(default_factory=list)  # List of string Tag IDs
    links: List[MangaLink] = Field(default_factory=list)
    content_rating: Optional[str] = None
    publication_demographic: Optional[str] = None
    original_language: Optional[str] = None
    download_path: Optional[str] = None
    published_start_date: Optional[str] = None
    published_end_date: Optional[str] = None
    volumes: Optional[int] = None
    chapters: Optional[int] = None

    @field_validator("personal_rating")
    @classmethod
    def validate_rating(cls, v):
        if v is not None:
            if v < 0 or v > 10:
                raise ValueError("Rating must be between 0 and 10")
            # rating must be multiple of 0.5
            if (v * 2) % 1 != 0:
                raise ValueError("Rating must be a multiple of 0.5")
        return v

class MangaCreate(MangaBase):
    cover_url: Optional[str] = None
    # For manual entry, the user can upload an image.
    # We will upload it to MinIO and set minio_cover_key.

class MangaCreateDex(BaseModel):
    mangadex_id: str
    read_status: ReadStatus = ReadStatus.UNREAD
    personal_rating: Optional[float] = None
    tag_ids: List[str] = Field(default_factory=list)

class MangaUpdate(BaseModel):
    title: Optional[str] = None
    alt_titles: Optional[List[str]] = None
    description: Optional[str] = None
    author: Optional[str] = None
    artist: Optional[str] = None
    year: Optional[str] = None
    status: Optional[str] = None
    read_status: Optional[ReadStatus] = None
    personal_rating: Optional[float] = None
    tag_ids: Optional[List[str]] = None
    links: Optional[List[MangaLink]] = None
    content_rating: Optional[str] = None
    publication_demographic: Optional[str] = None
    original_language: Optional[str] = None
    download_path: Optional[str] = None
    published_start_date: Optional[str] = None
    published_end_date: Optional[str] = None
    volumes: Optional[int] = None
    chapters: Optional[int] = None
    
    @field_validator("personal_rating")
    @classmethod
    def validate_rating(cls, v):
        if v is not None:
            if v < 0 or v > 10:
                raise ValueError("Rating must be between 0 and 10")
            if (v * 2) % 1 != 0:
                raise ValueError("Rating must be a multiple of 0.5")
        return v

class MangaResponse(MangaBase):
    id: PyObjectId = Field(alias="_id")
    cover_url: Optional[str] = None  # Presigned URL for frontend
    minio_cover_key: Optional[str] = None
    added_at: datetime
    updated_at: datetime
    unread_at: Optional[datetime] = None
    reading_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    dropped_at: Optional[datetime] = None
    on_hold_at: Optional[datetime] = None
    plan_to_read_at: Optional[datetime] = None
    re_reading_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "id": "60c72b2f9b1d8e1f54a1a6b8",
                "mangadex_id": "32d76d88-f3b7-4a1b-97d8-3011a0172bd6",
                "title": "Frieren: Beyond Journey's End",
                "read_status": "reading",
                "personal_rating": 9.5
            }
        }

class MangaPaginationResponse(BaseModel):
    total: int
    items: List[MangaResponse]
    skip: int
    limit: int

