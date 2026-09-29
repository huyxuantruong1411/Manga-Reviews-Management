import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Path, Query, Body, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.services.chapter_service import chapter_service
from backend.models.chapter import (
    DeletePagesRequest,
    FolderImportRequest,
    FolderScanResponse,
    StorageDuplicateGroup
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Chapters & Reader"])

class ScanFolderPayload(BaseModel):
    folder_path: str

class DuplicateCleanupPayload(BaseModel):
    object_keys: List[str]

class ReadingProgressPayload(BaseModel):
    chapter_id: str
    chapter_number: str
    page: int = 1
    reading_mode: str = "long_strip"
    fit_mode: str = "width"
    mark_as_read: bool = False

@router.get("/manga/{manga_id}/chapters")
async def get_manga_chapters(
    manga_id: str = Path(...),
    lang: Optional[str] = Query(None),
    group: Optional[str] = Query(None)
):
    """Retrieve all stored chapters for a manga."""
    try:
        chapters = await chapter_service.get_manga_chapters(manga_id, language=lang, group=group)
        return {"chapters": chapters, "total": len(chapters)}
    except Exception as e:
        logger.error(f"Error fetching chapters for manga {manga_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/chapters/{chapter_id}")
async def get_chapter(chapter_id: str = Path(...)):
    """Retrieve chapter details with presigned page URLs for reading."""
    try:
        chapter = await chapter_service.get_chapter_by_id(chapter_id, include_presigned_urls=True)
        if not chapter:
            raise HTTPException(status_code=404, detail="Chapter not found")
        return chapter
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching chapter {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/chapters/{chapter_id}")
async def delete_chapter(chapter_id: str = Path(...)):
    """Delete a chapter and all its stored pages."""
    try:
        success = await chapter_service.delete_chapter(chapter_id)
        if not success:
            raise HTTPException(status_code=404, detail="Chapter not found or already deleted")
        return {"success": True, "message": "Chapter deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting chapter {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chapters/{chapter_id}/delete-pages")
async def delete_chapter_pages(
    chapter_id: str = Path(...),
    payload: DeletePagesRequest = Body(...)
):
    """Delete specific page numbers from a chapter and renumber remaining pages."""
    try:
        res = await chapter_service.delete_pages(chapter_id, payload.page_numbers)
        return res
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        logger.error(f"Error deleting pages for chapter {chapter_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/manga/{manga_id}/scan-folder", response_model=FolderScanResponse)
async def scan_local_folder(
    manga_id: str = Path(...),
    payload: ScanFolderPayload = Body(...)
):
    """Scan a local folder to preview chapters, page counts, and duplicate conflicts before import."""
    try:
        res = await chapter_service.scan_local_folder(payload.folder_path, manga_id)
        return res
    except Exception as e:
        logger.error(f"Error scanning folder: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/manga/{manga_id}/import-folder")
async def import_local_folder(
    manga_id: str = Path(...),
    payload: FolderImportRequest = Body(...)
):
    """Import chapters and pages from a local directory into system storage."""
    try:
        res = await chapter_service.import_local_folder(
            manga_id=manga_id,
            folder_path=payload.folder_path,
            conflict_strategy=payload.conflict_strategy,
            default_language=payload.default_language,
            default_group=payload.default_group,
            selected_folders=payload.selected_folders
        )
        return res
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Error importing folder for manga {manga_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/manga/{manga_id}/import-folder-stream")
async def import_local_folder_stream(
    manga_id: str = Path(...),
    payload: FolderImportRequest = Body(...)
):
    """Import chapters and pages with granular, real-time SSE progress streaming."""
    try:
        generator = chapter_service.stream_import_local_folder(
            manga_id=manga_id,
            folder_path=payload.folder_path,
            conflict_strategy=payload.conflict_strategy,
            default_language=payload.default_language,
            default_group=payload.default_group,
            selected_folders=payload.selected_folders
        )
        return StreamingResponse(generator, media_type="text/event-stream")
    except Exception as e:
        logger.error(f"Error starting import stream for manga {manga_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/manga/{manga_id}/storage-duplicates", response_model=List[StorageDuplicateGroup])
async def get_storage_duplicates(
    manga_id: str = Path(...),
    chapter_id: Optional[str] = Query(None)
):
    """Scan stored pages for identical images (MD5 matching) and return visual preview groups."""
    try:
        groups = await chapter_service.scan_storage_duplicates(manga_id, chapter_id)
        return groups
    except Exception as e:
        logger.error(f"Error scanning storage duplicates for manga {manga_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/manga/{manga_id}/storage-duplicates/cleanup")
async def cleanup_storage_duplicates(
    manga_id: str = Path(...),
    payload: DuplicateCleanupPayload = Body(...)
):
    """Delete selected duplicate pages from MinIO and chapter documents."""
    try:
        res = await chapter_service.delete_storage_duplicate_pages(manga_id, payload.object_keys)
        return res
    except Exception as e:
        logger.error(f"Error cleaning up duplicate pages for manga {manga_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/manga/{manga_id}/reading-progress")
async def get_reading_progress(manga_id: str = Path(...)):
    """Get the user's reading position and preferences for a manga."""
    try:
        return await chapter_service.get_reading_progress(manga_id)
    except Exception as e:
        logger.error(f"Error fetching reading progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/manga/{manga_id}/reading-progress")
async def save_reading_progress(
    manga_id: str = Path(...),
    payload: ReadingProgressPayload = Body(...)
):
    """Save user's current chapter, page, reading mode, and fit mode."""
    try:
        return await chapter_service.save_reading_progress(
            manga_id=manga_id,
            chapter_id=payload.chapter_id,
            chapter_number=payload.chapter_number,
            page=payload.page,
            reading_mode=payload.reading_mode,
            fit_mode=payload.fit_mode,
            mark_as_read=payload.mark_as_read
        )
    except Exception as e:
        logger.error(f"Error saving reading progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))
