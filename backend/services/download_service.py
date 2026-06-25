import os
import asyncio
import logging
import random
import uuid
import io
import base64
from datetime import datetime
from typing import List, Dict, Any, Optional
from bson import ObjectId
from PIL import Image
from backend.database.connection import get_db
from backend.services.mangadex_service import mangadex_service
from backend.utils.file_utils import clean_filename, normalize_windows_path
from backend.config import settings


logger = logging.getLogger(__name__)

# Dictionary to keep track of active tasks in memory for cancellation checks
# key: task_id (str), value: bool (True if cancelled)
active_cancellations = {}

class DownloadService:
    def __init__(self):
        self.running_tasks = set()

    def _get_tasks_collection(self):
        return get_db().download_tasks

    def _get_mangas_collection(self):
        return get_db().mangas

    async def create_task(self, manga_id: str, manga_title: str, chapters: List[Dict[str, Any]]) -> str:
        task_id = str(uuid.uuid4())
        
        chapters_detail = []
        for c in chapters:
            chapters_detail.append({
                "id": c["id"],
                "chapter": c["chapter"],
                "title": c.get("title", ""),
                "status": "pending",
                "error": None
            })
            
        task_doc = {
            "_id": task_id,
            "manga_id": manga_id,
            "manga_title": manga_title,
            "status": "pending",
            "total_chapters": len(chapters),
            "completed_chapters": 0,
            "chapters_detail": chapters_detail,
            "progress": 0.0,
            "error_message": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        await self._get_tasks_collection().insert_one(task_doc)
        active_cancellations[task_id] = False
        return task_id

    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        return await self._get_tasks_collection().find_one({"_id": task_id})

    async def list_tasks(self, limit: int = 20) -> List[Dict[str, Any]]:
        cursor = self._get_tasks_collection().find().sort("created_at", -1).limit(limit)
        tasks = []
        async for doc in cursor:
            tasks.append(doc)
        return tasks

    async def cancel_task(self, task_id: str) -> bool:
        task = await self.get_task_status(task_id)
        if not task:
            return False
            
        if task["status"] in ["completed", "failed", "cancelled"]:
            return False
            
        active_cancellations[task_id] = True
        await self._get_tasks_collection().update_one(
            {"_id": task_id},
            {"$set": {"status": "cancelled", "updated_at": datetime.utcnow()}}
        )
        return True

    async def delete_task(self, task_id: str) -> bool:
        task = await self.get_task_status(task_id)
        if not task:
            return False
            
        if task["status"] not in ["completed", "failed", "cancelled"]:
            return False
            
        await self._get_tasks_collection().delete_one({"_id": task_id})
        return True

    async def resume_task(self, task_id: str, background_tasks: Any) -> bool:
        task = await self.get_task_status(task_id)
        if not task:
            return False
            
        if task_id in self.running_tasks:
            logger.info(f"Task {task_id} is already running.")
            return True
            
        # Reset cancellations tracker
        active_cancellations[task_id] = False
        
        # Reset stuck/failed/cancelled chapters to pending
        chapters = task.get("chapters_detail", [])
        for chap in chapters:
            if chap.get("status") in ["failed", "downloading", "pending"]:
                chap["status"] = "pending"
                chap["error"] = None
                
        await self._get_tasks_collection().update_one(
            {"_id": task_id},
            {
                "$set": {
                    "status": "pending",
                    "error_message": None,
                    "chapters_detail": chapters,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        background_tasks.add_task(
            self.start_download_background,
            task_id=task_id,
            download_path=task.get("download_path")
        )
        return True

    async def auto_resume_tasks(self):
        try:
            cursor = self._get_tasks_collection().find({"status": {"$in": ["downloading", "pending"]}})
            async for task in cursor:
                task_id = task["_id"]
                if task_id not in self.running_tasks:
                    logger.info(f"Auto-resuming task {task_id} on startup...")
                    # Reset cancellations tracker
                    active_cancellations[task_id] = False
                    asyncio.create_task(
                        self.start_download_background(
                            task_id=task_id,
                            download_path=task.get("download_path")
                        )
                    )
        except Exception as e:
            logger.error(f"Error during auto-resuming tasks on startup: {e}")

    async def start_download_background(self, task_id: str, download_path: Optional[str] = None):
        """
        Runs the download process in the background.
        """
        if task_id in self.running_tasks:
            logger.warning(f"Task {task_id} is already running. Skipping duplicate execution.")
            return
        self.running_tasks.add(task_id)
        
        task = await self.get_task_status(task_id)
        if not task:
            self.running_tasks.discard(task_id)
            return
            
        manga_id = task["manga_id"]
        manga_title = task["manga_title"]
        chapters = task["chapters_detail"]
        total = task["total_chapters"]
        
        base_dir = download_path
        if not base_dir:
            db_config = await get_db().settings.find_one({"_id": "download_config"})
            base_dir = db_config.get("base_path") if db_config else None
        if not base_dir:
            base_dir = settings.download_dir
        
        # Check if the manga has the "oneshot" tag
        is_oneshot = False
        try:
            manga = await self._get_mangas_collection().find_one({"_id": ObjectId(manga_id)})
            if manga:
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
            logger.error(f"Error checking oneshot status for manga {manga_id}: {e}")
            
        if is_oneshot:
            target_dir = normalize_windows_path(base_dir)
        else:
            target_dir = normalize_windows_path(os.path.join(base_dir, clean_filename(manga_title)))
        
        # Update state to downloading and store resolved download path
        await self._get_tasks_collection().update_one(
            {"_id": task_id},
            {
                "$set": {
                    "status": "downloading",
                    "download_path": os.path.abspath(target_dir),
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        try:
            os.makedirs(target_dir, exist_ok=True)
            completed_count = sum(1 for c in chapters if c.get("status") == "completed")
            
            for idx, chap in enumerate(chapters):
                # Check cancellation
                if active_cancellations.get(task_id) or (await self._check_db_cancelled(task_id)):
                    logger.info(f"Task {task_id} cancelled.")
                    break
                    
                chap_id = chap["id"]
                chap_num = chap["chapter"]
                chap_title = chap.get("title", "")
                chap_status = chap.get("status", "pending")
                
                if chap_status == "completed":
                    continue
                    
                # Determine folder name based on chapter title existence
                if chap_title:
                    folder_name = clean_filename(f"Chapter {chap_num} - {chap_title}")
                else:
                    folder_name = clean_filename(f"Chapter {chap_num}")
                    
                chap_path = os.path.join(target_dir, folder_name)
                
                # Update individual chapter status to downloading
                await self._update_chapter_status(task_id, chap_id, "downloading")
                
                # Fetch images
                try:
                    img_urls = await mangadex_service.get_chapter_images(chap_id)
                    if not img_urls:
                        raise ValueError("No images found for this chapter.")
                    
                    os.makedirs(chap_path, exist_ok=True)
                    
                    # Download images concurrently in batches of 4
                    success = await self._download_images_concurrently(img_urls, chap_path, task_id, chap_num)
                    
                    if success:
                        await self._update_chapter_status(task_id, chap_id, "completed")
                        completed_count += 1
                    else:
                        raise RuntimeError("Failed to download one or more pages.")
                        
                except Exception as e:
                    logger.error(f"Error downloading chapter {chap_num}: {e}")
                    await self._update_chapter_status(task_id, chap_id, "failed", str(e))
                
                # Update task progress
                progress = completed_count / total
                await self._get_tasks_collection().update_one(
                    {"_id": task_id},
                    {
                        "$set": {
                            "completed_chapters": completed_count,
                            "progress": progress,
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                
                # Delay between chapters to avoid rate limits
                await asyncio.sleep(random.uniform(1.0, 2.0))
                
            # Finalize task status
            final_task = await self.get_task_status(task_id)
            if final_task["status"] != "cancelled":
                # Check if all completed
                failed_any = any(c["status"] == "failed" for c in final_task["chapters_detail"])
                status = "failed" if failed_any and completed_count == 0 else "completed"
                
                await self._get_tasks_collection().update_one(
                    {"_id": task_id},
                    {
                        "$set": {
                            "status": status,
                            "progress": 1.0 if status == "completed" else final_task["progress"],
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                
                # If completed successfully, update manga download_path
                if status == "completed":
                    try:
                        abs_target_dir = os.path.abspath(target_dir)
                        # Get old path for audit logs
                        manga_doc = await self._get_mangas_collection().find_one({"_id": ObjectId(manga_id)})
                        old_download_path = manga_doc.get("download_path") if manga_doc else None
                        
                        await self._get_mangas_collection().update_one(
                            {"_id": ObjectId(manga_id)},
                            {"$set": {"download_path": abs_target_dir, "updated_at": datetime.utcnow()}}
                        )
                        
                        # Add audit log entry
                        await get_db().audit_logs.insert_one({
                            "entity_type": "manga",
                            "entity_id": manga_id,
                            "action": "update_metadata",
                            "field": "download_path",
                            "old_value": old_download_path,
                            "new_value": abs_target_dir,
                            "timestamp": datetime.utcnow(),
                            "note": "Updated download path on successful download"
                        })
                    except Exception as db_err:
                        logger.error(f"Error saving download_path for manga {manga_id}: {db_err}")
                
        except Exception as e:
            logger.error(f"Critical error in task {task_id}: {e}")
            await self._get_tasks_collection().update_one(
                {"_id": task_id},
                {
                    "$set": {
                        "status": "failed",
                        "error_message": str(e),
                        "updated_at": datetime.utcnow()
                    }
                }
            )
        finally:
            active_cancellations.pop(task_id, None)
            self.running_tasks.discard(task_id)

    async def _check_db_cancelled(self, task_id: str) -> bool:
        doc = await self.get_task_status(task_id)
        return doc.get("status") == "cancelled" if doc else False

    async def _update_chapter_status(self, task_id: str, chap_id: str, status: str, error: Optional[str] = None):
        await self._get_tasks_collection().update_one(
            {"_id": task_id, "chapters_detail.id": chap_id},
            {
                "$set": {
                    "chapters_detail.$.status": status,
                    "chapters_detail.$.error": error,
                    "updated_at": datetime.utcnow()
                }
            }
        )

    def _read_file(self, path: str) -> bytes:
        with open(path, "rb") as f:
            return f.read()

    def _generate_base64_thumbnail(self, bytes_data: bytes, width: int = 120) -> Optional[str]:
        try:
            img = Image.open(io.BytesIO(bytes_data))
            if img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGB')
            w_percent = (width / float(img.size[0]))
            h_size = int((float(img.size[1]) * float(w_percent)))
            img = img.resize((width, h_size), Image.Resampling.LANCZOS)
            buffered = io.BytesIO()
            if img.mode == 'RGBA':
                background = Image.new("RGB", img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[3])
                img = background
            img.save(buffered, format="JPEG", quality=75)
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
            return f"data:image/jpeg;base64,{img_str}"
        except Exception as e:
            logger.error(f"Error generating thumbnail: {e}")
            return None

    async def _update_page_progress(self, task_id: str, chap_num: str, page_num: int, page_total: int, bytes_data: bytes):
        try:
            # Generate thumbnail preview asynchronously
            preview_base64 = await asyncio.to_thread(self._generate_base64_thumbnail, bytes_data)
            
            await self._get_tasks_collection().update_one(
                {"_id": task_id},
                {
                    "$set": {
                        "current_chapter_name": f"Chapter {chap_num}",
                        "current_page_number": page_num,
                        "current_page_total": page_total,
                        "current_page_preview": preview_base64,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
        except Exception as e:
            logger.error(f"Failed to update page progress for task {task_id}: {e}")

    async def _download_images_concurrently(self, urls: List[str], chap_path: str, task_id: str, chap_num: str, max_sem: int = 4) -> bool:
        sem = asyncio.Semaphore(max_sem)
        
        async def download_page(idx: int, url: str) -> bool:
            async with sem:
                ext = ".jpg"
                if "." in url[-5:]:
                    # Get file extension from URL
                    ext = os.path.splitext(url.split("?")[0])[1].lower()
                
                file_name = f"{idx+1:03d}{ext}"
                full_path = os.path.join(chap_path, file_name)
                
                # Check if already exists
                if os.path.exists(full_path) and os.path.getsize(full_path) > 0:
                    try:
                        # Read the cached image bytes
                        loop = asyncio.get_running_loop()
                        bytes_data = await loop.run_in_executor(None, self._read_file, full_path)
                        if bytes_data:
                            await self._update_page_progress(task_id, chap_num, idx + 1, len(urls), bytes_data)
                    except Exception as e:
                        logger.error(f"Error reading cached image for preview: {e}")
                    return True
                    
                bytes_data = await mangadex_service.download_image_bytes(url)
                if not bytes_data:
                    return False
                    
                # Save bytes to disk
                try:
                    # Write inside worker thread to avoid blocking loop
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, self._write_file, full_path, bytes_data)
                    # Update progress
                    await self._update_page_progress(task_id, chap_num, idx + 1, len(urls), bytes_data)
                    return True
                except Exception as e:
                    logger.error(f"Error saving image {file_name}: {e}")
                    return False

        tasks = [download_page(idx, url) for idx, url in enumerate(urls)]
        results = await asyncio.gather(*tasks)
        return all(results)

    def _write_file(self, path: str, data: bytes):
        with open(path, "wb") as f:
            f.write(data)

download_service = DownloadService()
