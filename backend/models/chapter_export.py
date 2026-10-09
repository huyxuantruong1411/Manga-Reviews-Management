from typing import List, Literal, Optional

from pydantic import BaseModel, Field

ExportFormat = Literal["pdf", "zip", "cbz", "folder"]
ExportGrouping = Literal["single_file", "by_volume", "by_chapter"]
ExportDestination = Literal["browser", "local_folder"]
ImageOptimization = Literal["original", "compressed"]


class ChapterExportRequest(BaseModel):
    chapter_ids: Optional[List[str]] = Field(
        default=None,
        description="Optional list of specific chapter IDs to export. If empty, exports all matching chapters.",
    )
    language: Optional[str] = Field(
        default=None,
        description="Filter chapters by language code (e.g. 'en', 'vi').",
    )
    format: ExportFormat = Field(
        default="pdf",
        description="Export target format: 'pdf' | 'zip' | 'cbz' | 'folder'.",
    )
    grouping: ExportGrouping = Field(
        default="single_file",
        description="File grouping structure: 'single_file' | 'by_volume' | 'by_chapter'.",
    )
    destination: ExportDestination = Field(
        default="browser",
        description="Destination method: 'browser' (direct download) | 'local_folder' (save directly to disk).",
    )
    local_path: Optional[str] = Field(
        default=None,
        description="Target directory path when destination is 'local_folder'. Defaults to manga download dir.",
    )
    auto_open_explorer: bool = Field(
        default=False,
        description="Automatically open Windows Explorer upon completion when destination is 'local_folder'.",
    )
    image_optimization: ImageOptimization = Field(
        default="original",
        description="Image optimization strategy: 'original' (no recompression) | 'compressed' (JPEG 85%).",
    )
    include_metadata: bool = Field(
        default=True,
        description="Whether to include ComicInfo.xml or metadata.json in exported packages.",
    )
    include_cover: bool = Field(
        default=True,
        description="Whether to include the manga cover image as front page if available.",
    )
    naming_template: Optional[str] = Field(
        default=None,
        description="Optional filename template, e.g. '{manga_title} - Ch.{chapter_number}'.",
    )


class ChapterExportOpenFolderRequest(BaseModel):
    path: str = Field(..., description="Target file or folder path to reveal in Windows Explorer.")


class ChapterExportItem(BaseModel):
    file_name: str
    file_path: str
    file_size: int
    page_count: int
    volume: Optional[str] = None
    chapter_number: Optional[str] = None


class ChapterExportResponse(BaseModel):
    export_id: str
    status: str = "completed"
    format: str
    grouping: str
    destination: str
    total_chapters: int
    total_pages: int
    total_size_bytes: int
    download_url: Optional[str] = None
    destination_path: Optional[str] = None
    files: List[ChapterExportItem] = []
