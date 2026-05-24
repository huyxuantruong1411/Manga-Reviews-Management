import os
import uuid
from fastapi import APIRouter, Path, Query, Body, BackgroundTasks, HTTPException, status
from typing import List, Optional, Dict, Any
from bson import ObjectId
from pydantic import BaseModel, Field
from backend.database.connection import get_db
from backend.services.download_service import download_service
from backend.config import settings

router = APIRouter(prefix="/api", tags=["Downloads"])

@router.get("/downloads/base-path")
async def get_base_path():
    """Retrieve the current base path for downloads (DB settings or fallback)."""
    db = get_db()
    doc = await db.settings.find_one({"_id": "download_config"})
    path = doc.get("base_path") if doc else None
    return {"base_path": path or settings.download_dir}

class UpdateBasePathPayload(BaseModel):
    base_path: str

@router.put("/downloads/base-path")
async def update_base_path(payload: UpdateBasePathPayload = Body(...)):
    """Update the default configured base path for downloads."""
    new_path = payload.base_path.strip()
    if not new_path:
        raise HTTPException(status_code=400, detail="Base path cannot be empty")
        
    try:
        # Validate path feasibility/writeability before saving
        abs_path = os.path.abspath(new_path)
        os.makedirs(abs_path, exist_ok=True)
        test_file = os.path.join(abs_path, f".test_write_{str(uuid.uuid4())}")
        try:
            with open(test_file, "w") as f:
                f.write("test")
            os.remove(test_file)
        except Exception:
            raise HTTPException(status_code=400, detail="Directory is not writable")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=f"Invalid or unwriteable base path: {str(e)}")

    db = get_db()
    await db.settings.update_one(
        {"_id": "download_config"},
        {"$set": {"base_path": abs_path}},
        upsert=True
    )
    return {"base_path": abs_path, "message": "Base path updated successfully"}


class DownloadChapterPayload(BaseModel):
    id: str
    chapter: str
    title: Optional[str] = ""
    volume: Optional[str] = None

class DownloadRequest(BaseModel):
    chapters: List[DownloadChapterPayload]
    lang: str = "en"
    download_path: Optional[str] = None

@router.post("/manga/{manga_id}/download", status_code=status.HTTP_202_ACCEPTED)
async def download_manga_chapters(
    background_tasks: BackgroundTasks,
    manga_id: str = Path(...),
    req: DownloadRequest = Body(...)
):
    """Start background downloading for selected chapters of a manga."""
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ID")
        
    manga = await get_db().mangas.find_one({"_id": ObjectId(manga_id)})
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found")

    # Format payload
    chapters_list = [c.dict() for c in req.chapters]
    
    # Path validation
    base_dir = req.download_path
    if not base_dir:
        db_config = await get_db().settings.find_one({"_id": "download_config"})
        base_dir = db_config.get("base_path") if db_config else None
    if not base_dir:
        base_dir = settings.download_dir
        
    if not base_dir:
        raise HTTPException(status_code=400, detail="Download path cannot be empty")
        
    try:
        # Resolve path to absolute
        abs_path = os.path.abspath(base_dir)
        # Try to make directories (creating folder hierarchy up to the end)
        os.makedirs(abs_path, exist_ok=True)
        # Test write access by writing a temporary mock file
        test_file = os.path.join(abs_path, f".test_write_{str(uuid.uuid4())}")
        try:
            with open(test_file, "w") as f:
                f.write("test")
            os.remove(test_file)
        except Exception:
            raise HTTPException(status_code=400, detail="Directory is not writable")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=400, detail=f"Invalid or unwriteable download path: {str(e)}")

    # Create task in DB
    task_id = await download_service.create_task(
        manga_id=manga_id,
        manga_title=manga["title"],
        chapters=chapters_list
    )
    
    # Run in background
    background_tasks.add_task(
        download_service.start_download_background,
        task_id=task_id,
        download_path=req.download_path
    )
    
    return {"task_id": task_id, "status": "pending"}

@router.get("/downloads/tasks")
async def list_download_tasks(limit: int = Query(20, ge=1, le=100)):
    """List recent download tasks."""
    return await download_service.list_tasks(limit)

@router.get("/downloads/tasks/{task_id}")
async def get_download_task(task_id: str = Path(...)):
    """Get status and progress of a download task."""
    task = await download_service.get_task_status(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Download task not found")
    return task

@router.post("/downloads/tasks/{task_id}/cancel")
async def cancel_download_task(task_id: str = Path(...)):
    """Cancel a running download task."""
    cancelled = await download_service.cancel_task(task_id)
    if not cancelled:
        raise HTTPException(status_code=400, detail="Task cannot be cancelled or already finished")
    return {"message": "Cancellation request submitted"}
