import os
import asyncio
import logging
from fastapi import APIRouter, Path, HTTPException, Query
from fastapi.responses import FileResponse
from typing import List, Optional
from pydantic import BaseModel, Field
from bson import ObjectId
from backend.database.connection import get_db
from backend.services.image_tools_service import image_tools_service
from backend.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/image-tools", tags=["Image Tools"])


# ─── Request / Response models ────────────────────────────────────────

class ScanDuplicatesRequest(BaseModel):
    path: Optional[str] = None
    manga_id: Optional[str] = None


class DeleteDuplicatesRequest(BaseModel):
    file_paths: List[str]


class ScanFormatRequest(BaseModel):
    path: Optional[str] = None
    manga_id: Optional[str] = None
    target_format: str = ".png"


class ConvertFormatRequest(BaseModel):
    file_paths: List[str]
    target_format: str = ".png"


# ─── Helpers ──────────────────────────────────────────────────────────

async def _resolve_scan_path(path: Optional[str], manga_id: Optional[str]) -> str:
    """
    Resolve the folder to scan from explicit path, manga download_path, or global base path.
    """
    # 1. Explicit path override
    if path and path.strip():
        resolved = os.path.abspath(path.strip())
        if not os.path.isdir(resolved):
            raise HTTPException(status_code=400, detail=f"Directory not found: {resolved}")
        return resolved

    # 2. Manga download_path from DB
    if manga_id:
        if not ObjectId.is_valid(manga_id):
            raise HTTPException(status_code=400, detail="Invalid manga ID")
        manga = await get_db().mangas.find_one({"_id": ObjectId(manga_id)})
        if not manga:
            raise HTTPException(status_code=404, detail="Manga not found")
        dl_path = manga.get("download_path")
        if dl_path and os.path.isdir(dl_path):
            return dl_path
        raise HTTPException(status_code=400, detail="Manga chưa có thư mục tải riêng. Hãy chọn rõ thư mục cần quét.")

    # 3. Fall back to global base path
    db_config = await get_db().settings.find_one({"_id": "download_config"})
    base_path = db_config.get("base_path") if db_config else None
    if not base_path:
        base_path = settings.download_dir

    if base_path and os.path.isdir(base_path):
        return base_path

    raise HTTPException(
        status_code=400,
        detail="No valid scan path found. Please provide a path or ensure a manga has a download path."
    )


# ─── Endpoints ────────────────────────────────────────────────────────

@router.get("/scan-progress")
async def get_scan_progress():
    """Get the progress of the active duplicate images scan."""
    return image_tools_service.progress

@router.post("/scan-duplicates")
async def scan_duplicates(req: ScanDuplicatesRequest):
    """Scan a folder for duplicate images using MD5 hashing."""
    scan_path = await _resolve_scan_path(req.path, req.manga_id)
    result = await asyncio.to_thread(image_tools_service.scan_duplicates, scan_path)
    result["scan_path"] = scan_path
    return result


@router.post("/delete-duplicates")
async def delete_duplicates(req: DeleteDuplicatesRequest):
    """Delete specified duplicate image files."""
    if not req.file_paths:
        raise HTTPException(status_code=400, detail="No file paths provided")
    return await asyncio.to_thread(image_tools_service.delete_duplicates, req.file_paths)


@router.post("/scan-format")
async def scan_format(req: ScanFormatRequest):
    """Scan a folder for images not matching the target format."""
    scan_path = await _resolve_scan_path(req.path, req.manga_id)
    result = await asyncio.to_thread(image_tools_service.scan_non_target_format, scan_path, req.target_format)
    result["scan_path"] = scan_path
    return result


@router.post("/convert-format")
async def convert_format(req: ConvertFormatRequest):
    """Convert specified image files to target format."""
    if not req.file_paths:
        raise HTTPException(status_code=400, detail="No file paths provided")
    return await asyncio.to_thread(image_tools_service.convert_images, req.file_paths, req.target_format)


@router.get("/manga/{manga_id}/download-path")
async def get_manga_download_path(manga_id: str = Path(...)):
    """Get the stored download path for a specific manga, with fallback to base path."""
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ID")

    manga = await get_db().mangas.find_one({"_id": ObjectId(manga_id)})
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found")

    download_path = manga.get("download_path")
    exists = bool(download_path and os.path.isdir(download_path))

    # Also return the global base path as fallback
    db_config = await get_db().settings.find_one({"_id": "download_config"})
    base_path = db_config.get("base_path") if db_config else settings.download_dir

    return {
        "manga_id": manga_id,
        "manga_title": manga.get("title", ""),
        "download_path": download_path,
        "path_exists": exists,
        "base_path": base_path,
    }


@router.get("/file")
async def get_local_image_file(path: str = Query(..., description="Absolute path of the image file")):
    """Serve a local image file directly from disk using FileResponse."""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.isfile(path):
        raise HTTPException(status_code=400, detail="Path is not a file")
    
    # Simple extension check to prevent arbitrary file reading
    ext = os.path.splitext(path)[1].lower()
    if ext not in {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'}:
        raise HTTPException(status_code=400, detail="Only image files can be served")
        
    return FileResponse(path)
