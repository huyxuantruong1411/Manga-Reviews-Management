import os
import asyncio
import logging
import random
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from backend.database.connection import get_db
from backend.services.mangadex_service import mangadex_service
from backend.utils.file_utils import clean_filename
from backend.config import settings

logger = logging.getLogger(__name__)

# Dictionary to keep track of active tasks in memory for cancellation checks
# key: task_id (str), value: bool (True if cancelled)
active_cancellations = {}

class DownloadService:
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

    async def start_download_background(self, task_id: str, download_path: Optional[str] = None):
        """
        Runs the download process in the background.
        """
        task = await self.get_task_status(task_id)
        if not task:
            return
            
        manga_id = task["manga_id"]
        manga_title = task["manga_title"]
        chapters = task["chapters_detail"]
        total = task["total_chapters"]
        
        base_dir = download_path or settings.download_dir
        manga_dir = os.path.join(base_dir, clean_filename(manga_title))
        
        # Update state to downloading
        await self._get_tasks_collection().update_one(
            {"_id": task_id},
            {"$set": {"status": "downloading", "updated_at": datetime.utcnow()}}
        )
        
        try:
            os.makedirs(manga_dir, exist_ok=True)
            completed_count = 0
            
            for idx, chap in enumerate(chapters):
                # Check cancellation
                if active_cancellations.get(task_id) or (await self._check_db_cancelled(task_id)):
                    logger.info(f"Task {task_id} cancelled.")
                    break
                    
                chap_id = chap["id"]
                chap_num = chap["chapter"]
                chap_title = chap.get("title", "")
                
                # Determine folder name based on chapter title existence
                if chap_title:
                    folder_name = clean_filename(f"Chapter {chap_num} - {chap_title}")
                else:
                    folder_name = clean_filename(f"Chapter {chap_num}")
                    
                chap_path = os.path.join(manga_dir, folder_name)
                
                # Update individual chapter status to downloading
                await self._update_chapter_status(task_id, chap_id, "downloading")
                
                # Fetch images
                try:
                    img_urls = await mangadex_service.get_chapter_images(chap_id)
                    if not img_urls:
                        raise ValueError("No images found for this chapter.")
                        
                    os.makedirs(chap_path, exist_ok=True)
                    
                    # Download images concurrently in batches of 4
                    success = await self._download_images_concurrently(img_urls, chap_path)
                    
                    if success:
                        await self._update_chapter_status(task_id, chap_id, "completed")
                    else:
                        raise RuntimeError("Failed to download one or more pages.")
                        
                except Exception as e:
                    logger.error(f"Error downloading chapter {chap_num}: {e}")
                    await self._update_chapter_status(task_id, chap_id, "failed", str(e))
                
                completed_count += 1
                progress = completed_count / total
                
                # Update task progress
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

    async def _download_images_concurrently(self, urls: List[str], chap_path: str, max_sem: int = 4) -> bool:
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
                    return True
                    
                bytes_data = await mangadex_service.download_image_bytes(url)
                if not bytes_data:
                    return False
                    
                # Save bytes to disk
                try:
                    # Write inside worker thread to avoid blocking loop
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(None, self._write_file, full_path, bytes_data)
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
