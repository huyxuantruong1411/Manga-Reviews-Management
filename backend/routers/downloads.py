import os
import uuid
import logging
from fastapi import APIRouter, Path, Query, Body, BackgroundTasks, HTTPException, status
from typing import List, Optional, Dict, Any
from bson import ObjectId
from pydantic import BaseModel, Field
from backend.database.connection import get_db
from backend.services.download_service import download_service
from backend.config import settings
from backend.utils.file_utils import clean_filename

logger = logging.getLogger(__name__)

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


class VerifyPathPayload(BaseModel):
    path: str

@router.post("/downloads/verify-path")
async def verify_download_path(payload: VerifyPathPayload = Body(...)):
    """Check if a folder path exists and is writable."""
    path_str = payload.path.strip()
    if not path_str:
        raise HTTPException(status_code=400, detail="Đường dẫn không được để trống")
        
    try:
        abs_path = os.path.abspath(path_str)
        exists = os.path.exists(abs_path) and os.path.isdir(abs_path)
        
        # Test write access
        writable = False
        test_dir = abs_path
        if not exists:
            parent_dir = os.path.dirname(abs_path)
            while parent_dir and not os.path.exists(parent_dir):
                parent_dir = os.path.dirname(parent_dir)
            if parent_dir:
                test_dir = parent_dir
            else:
                test_dir = "."
                
        test_file = os.path.join(test_dir, f".test_write_{str(uuid.uuid4())}")
        try:
            with open(test_file, "w") as f:
                f.write("test")
            os.remove(test_file)
            writable = True
        except Exception:
            writable = False
            
        if exists:
            if writable:
                return {
                    "exists": True,
                    "writable": True,
                    "message": "Thư mục đã tồn tại sẵn trên hệ thống và có quyền ghi."
                }
            else:
                return {
                    "exists": True,
                    "writable": False,
                    "message": "Thư mục đã tồn tại sẵn nhưng không có quyền ghi (thiếu quyền truy cập)."
                }
        else:
            if writable:
                return {
                    "exists": False,
                    "writable": True,
                    "message": "Thư mục chưa tồn tại (sẽ được tự động tạo mới khi bắt đầu tải)."
                }
            else:
                return {
                    "exists": False,
                    "writable": False,
                    "message": "Thư mục chưa tồn tại và không thể tạo mới trong đường dẫn cha (đường dẫn không hợp lệ hoặc thiếu quyền)."
                }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Đường dẫn không hợp lệ: {str(e)}")


class DownloadChapterPayload(BaseModel):
    id: str
    chapter: str
    title: Optional[str] = ""
    volume: Optional[str] = None

class DownloadRequest(BaseModel):
    chapters: List[DownloadChapterPayload]
    lang: str = "en"
    download_path: Optional[str] = None
    force: bool = False

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

    # Resolve target directory (checking oneshot status)
    is_oneshot = False
    try:
        tag_ids = manga.get("tag_ids", [])
        oid_list = []
        for tid in tag_ids:
            if isinstance(tid, str) and ObjectId.is_valid(tid):
                oid_list.append(ObjectId(tid))
            elif isinstance(tid, ObjectId):
                oid_list.append(tid)
        
        if oid_list:
            local_tags = await get_db().tags.find({"_id": {"$in": oid_list}}).to_list(None)
            for tag in local_tags:
                tag_name = tag.get("name")
                if isinstance(tag_name, dict):
                    en_name = tag_name.get("en", "")
                    if en_name.lower() == "oneshot":
                        is_oneshot = True
                        break
                elif isinstance(tag_name, str):
                    if tag_name.lower() == "oneshot":
                        is_oneshot = True
                        break
    except Exception as e:
        logger.error(f"Error checking oneshot status during path validation: {e}")

    if is_oneshot:
        target_dir = abs_path
    else:
        target_dir = os.path.join(abs_path, clean_filename(manga["title"]))

    # Validate target directory content (check if contains files/folders)
    if not req.force:
        is_dirty = False
        if os.path.exists(target_dir) and os.path.isdir(target_dir):
            try:
                contents = os.listdir(target_dir)
                if contents:
                    if is_oneshot:
                        # Oneshot target folder contains images. If folders or non-image files are present, it's dirty
                        for item in contents:
                            item_path = os.path.join(target_dir, item)
                            if os.path.isdir(item_path):
                                is_dirty = True
                                break
                            ext = os.path.splitext(item)[1].lower()
                            if ext not in ['.jpg', '.jpeg', '.png', '.webp', '.gif']:
                                is_dirty = True
                                break
                    else:
                        # Normal manga target folder should only contain chapter folders.
                        for item in contents:
                            item_path = os.path.join(target_dir, item)
                            if os.path.isfile(item_path):
                                is_dirty = True
                                break
                            if not item.lower().startswith("chapter"):
                                is_dirty = True
                                break
            except Exception as le:
                logger.error(f"Error listing target directory contents: {le}")
                
        if is_dirty:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Thư mục tải xuống chứa các tệp hoặc thư mục khác. Tiếp tục tải xuống có thể ghi đè các tệp trùng tên. Bạn có muốn tiếp tục không?"
            )

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

@router.post("/downloads/tasks/{task_id}/resume")
async def resume_download_task(
    background_tasks: BackgroundTasks,
    task_id: str = Path(...)
):
    """Resume a download task that is stuck, failed, or cancelled."""
    resumed = await download_service.resume_task(task_id, background_tasks)
    if not resumed:
        raise HTTPException(status_code=400, detail="Task cannot be resumed or not found")
    return {"message": "Download task resume request submitted"}
