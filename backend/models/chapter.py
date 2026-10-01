from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from backend.models.pyobjectid import PyObjectId


class PageItem(BaseModel):
    page_number: int = Field(..., description="1-indexed page number")
    filename: str = Field(..., description="File name e.g. 001.jpg")
    object_key: str = Field(..., description="MinIO storage key")
    file_size: int = Field(0, description="File size in bytes")
    width: Optional[int] = Field(None, description="Image width in pixels")
    height: Optional[int] = Field(None, description="Image height in pixels")
    md5_hash: Optional[str] = Field(None, description="MD5 hash for duplicate detection")
    url: Optional[str] = Field(None, description="Presigned URL for reading")


class ChapterBase(BaseModel):
    manga_id: str = Field(..., description="Target manga ID")
    chapter_number: str = Field(..., description="Chapter number e.g. '1', '2.5', 'oneshot'")
    chapter_numeric: float = Field(0.0, description="Float representation for natural sorting")
    volume: Optional[str] = Field(None, description="Volume number or identifier")
    title: Optional[str] = Field("", description="Chapter title")
    language: str = Field("en", description="Language code e.g. en, vi, ja, ru")
    scanlation_group: Optional[str] = Field(None, description="Scanlation group name")
    source: str = Field("mangadex", description="'mangadex' | 'local_import' | 'manual'")
    source_id: Optional[str] = Field(None, description="External ID e.g. MangaDex chapter UUID")
    pages: List[PageItem] = Field(default_factory=list)
    page_count: int = Field(0, description="Total pages in chapter")
    uploader: Optional[str] = Field(None, description="Uploader username")
    publish_at: Optional[datetime] = Field(None, description="Publish date on source")
    readable_at: Optional[datetime] = Field(None, description="Readable date on source")
    external_url: Optional[str] = Field(None, description="External URL if hosted externally")


class ChapterCreate(ChapterBase):
    pass


class ChapterInDB(ChapterBase):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {datetime: lambda dt: dt.isoformat()}


class ReadingProgress(BaseModel):
    manga_id: str
    last_read_chapter_id: Optional[str] = None
    last_read_chapter_number: Optional[str] = None
    last_read_page: int = 1
    read_chapter_ids: List[str] = Field(default_factory=list)
    reading_mode: str = Field("long_strip", description="'long_strip' | 'single' | 'double_ltr' | 'double_rtl'")
    fit_mode: str = Field("width", description="'width' | 'height' | 'original'")
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# Request / Response Schemas
class DetectedChapter(BaseModel):
    folder_name: str
    folder_path: str
    chapter_number: str
    chapter_numeric: float
    volume: Optional[str] = None
    title: Optional[str] = ""
    scanlation_group: Optional[str] = None
    page_count: int
    image_files: List[str]
    is_duplicate: bool = False
    existing_chapter_id: Optional[str] = None


class FolderScanResponse(BaseModel):
    folder_path: str
    is_valid: bool
    message: str
    total_folders: int
    detected_chapters: List[DetectedChapter]
    unrecognized_folders: List[str] = []


class FolderImportRequest(BaseModel):
    folder_path: str
    conflict_strategy: str = Field("skip", description="'skip' | 'overwrite' | 'keep_both'")
    default_language: str = Field("en", description="Default language if not detected")
    default_group: Optional[str] = Field(None, description="Default scanlation group")
    selected_folders: Optional[List[str]] = Field(None, description="Optional subset of folder names to import")


class DeletePagesRequest(BaseModel):
    page_numbers: List[int] = Field(..., description="List of 1-indexed page numbers to delete")


class StorageDuplicateItem(BaseModel):
    chapter_id: str
    chapter_number: str
    chapter_title: Optional[str] = None
    page_number: int
    filename: str
    object_key: str
    file_size: int
    url: Optional[str] = None


class StorageDuplicateGroup(BaseModel):
    md5_hash: str
    file_size: int
    items: List[StorageDuplicateItem]
