import os
import asyncio
import logging
import random
import uuid
import time
import io
import base64
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from bson import ObjectId
from PIL import Image
from backend.database.connection import get_db
from backend.services.mangadex_service import mangadex_service
from backend.utils.file_utils import clean_filename, normalize_windows_path
from backend.services.audit_service import audit_service
from backend.services.minio_service import minio_service
from backend.services.chapter_service import chapter_service
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

    async def create_task(
        self,
        manga_id: str,
        manga_title: str,
        chapters: List[Dict[str, Any]],
        save_to_disk: bool = False,
        lang: str = "en",
        download_path: Optional[str] = None
    ) -> str:
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
            "save_to_disk": save_to_disk,
            "lang": lang,
            "download_path": download_path,
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
        
        save_to_disk = task.get("save_to_disk", False)
        lang = task.get("lang", "en")
        
        target_dir = None
        if save_to_disk:
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
                    "download_path": os.path.abspath(target_dir) if target_dir else None,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        try:
            if target_dir:
                os.makedirs(target_dir, exist_ok=True)
            completed_count = sum(1 for c in chapters if c.get("status") == "completed")
            task_start_time = time.time()
            shared_stats = {
                "start_time": task_start_time,
                "pages_done": 0,
                "bytes_done": 0,
                "total_chapters": total,
                "current_chap_index": 1
            }
            
            for idx, chap in enumerate(chapters, 1):
                shared_stats["current_chap_index"] = idx
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
                    
                chap_path = os.path.join(target_dir, folder_name) if target_dir else None
                if chap_path:
                    os.makedirs(chap_path, exist_ok=True)
                
                # Update individual chapter status to downloading
                await self._update_chapter_status(task_id, chap_id, "downloading")
                
                # Fetch images
                try:
                    img_urls = await mangadex_service.get_chapter_images(chap_id)
                    if not img_urls:
                        raise ValueError("No images found for this chapter.")
                    
                    # Download images and upload directly to MinIO (and optionally save to disk)
                    success, page_items = await self._download_images_concurrently(
                        urls=img_urls,
                        chap_path=chap_path,
                        task_id=task_id,
                        chap_num=chap_num,
                        manga_id=manga_id,
                        chap_id=chap_id,
                        shared_stats=shared_stats
                    )
                    
                    if success:
                        # Record chapter in database
                        await chapter_service.create_or_update_chapter({
                            "manga_id": manga_id,
                            "chapter_number": chap_num,
                            "title": chap_title,
                            "language": lang,
                            "source": "mangadex",
                            "source_id": chap_id,
                            "pages": page_items,
                            "page_count": len(page_items)
                        })
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
                
                # If completed successfully, update manga download_path if save_to_disk
                if status == "completed":
                    try:
                        manga_doc = await self._get_mangas_collection().find_one({"_id": ObjectId(manga_id)})
                        old_download_path = manga_doc.get("download_path") if manga_doc else None
                        abs_target_dir = os.path.abspath(target_dir) if target_dir else None
                        
                        if abs_target_dir:
                            await self._get_mangas_collection().update_one(
                                {"_id": ObjectId(manga_id)},
                                {"$set": {"download_path": abs_target_dir, "updated_at": datetime.utcnow()}}
                            )
                        
                        # Add audit log entry
                        await audit_service.log_event(
                            entity_type="manga",
                            entity_id=manga_id,
                            entity_title=manga_doc.get("title") if manga_doc else None,
                            action="download_completed",
                            field="chapters",
                            old_value=old_download_path,
                            new_value=abs_target_dir or "system_storage",
                            actor="system",
                            note=f"Downloaded {len(chapters)} chapter(s) to system storage" + (f" and disk ({abs_target_dir})" if abs_target_dir else ""),
                            details={"download_path": abs_target_dir, "chapters_count": len(chapters), "save_to_disk": save_to_disk}
                        )
                    except Exception as db_err:
                        logger.error(f"Error logging audit for manga download {manga_id}: {db_err}")
                
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

    async def _update_page_progress(
        self,
        task_id: str,
        chap_num: str,
        page_num: int,
        page_total: int,
        bytes_data: bytes,
        filename: Optional[str] = None,
        file_size: Optional[int] = None,
        speed_pages: Optional[float] = None,
        speed_mb: Optional[float] = None,
        elapsed_sec: Optional[float] = None,
        eta_sec: Optional[float] = None,
        total_pages_downloaded: Optional[int] = None,
        total_bytes_downloaded: Optional[int] = None,
        remaining_chapters: Optional[int] = None
    ):
        try:
            # Generate thumbnail preview asynchronously
            preview_base64 = await asyncio.to_thread(self._generate_base64_thumbnail, bytes_data)
            
            update_fields: Dict[str, Any] = {
                "current_chapter_name": f"Chapter {chap_num}",
                "current_page_number": page_num,
                "current_page_total": page_total,
                "current_page_preview": preview_base64,
                "updated_at": datetime.utcnow()
            }
            if filename:
                update_fields["current_filename"] = filename
            if file_size is not None:
                update_fields["current_file_size"] = file_size
            if speed_pages is not None:
                update_fields["speed_pages_per_sec"] = speed_pages
            if speed_mb is not None:
                update_fields["speed_mb_per_sec"] = speed_mb
            if elapsed_sec is not None:
                update_fields["elapsed_seconds"] = elapsed_sec
            if eta_sec is not None:
                update_fields["eta_seconds"] = eta_sec
            if total_pages_downloaded is not None:
                update_fields["total_pages_downloaded"] = total_pages_downloaded
            if total_bytes_downloaded is not None:
                update_fields["total_bytes_downloaded"] = total_bytes_downloaded
            if remaining_chapters is not None:
                update_fields["remaining_chapters"] = remaining_chapters

            await self._get_tasks_collection().update_one(
                {"_id": task_id},
                {"$set": update_fields}
            )
        except Exception as e:
            logger.error(f"Failed to update page progress for task {task_id}: {e}")

    async def _download_images_concurrently(
        self,
        urls: List[str],
        chap_path: Optional[str],
        task_id: str,
        chap_num: str,
        manga_id: str,
        chap_id: str,
        shared_stats: Optional[Dict[str, Any]] = None,
        max_sem: int = 4
    ) -> Tuple[bool, List[Dict[str, Any]]]:
        sem = asyncio.Semaphore(max_sem)
        page_results: List[Optional[Dict[str, Any]]] = [None] * len(urls)

        async def download_page(idx: int, url: str) -> bool:
            async with sem:
                ext = ".jpg"
                if "." in url[-5:]:
                    ext = os.path.splitext(url.split("?")[0])[1].lower()
                
                file_name = f"{idx+1:03d}{ext}"
                full_path = os.path.join(chap_path, file_name) if chap_path else None
                
                bytes_data = None
                # Check if already exists on disk
                if full_path and os.path.exists(full_path) and os.path.getsize(full_path) > 0:
                    try:
                        loop = asyncio.get_running_loop()
                        bytes_data = await loop.run_in_executor(None, self._read_file, full_path)
                    except Exception as e:
                        logger.error(f"Error reading cached image for preview: {e}")

                if not bytes_data:
                    bytes_data = await mangadex_service.download_image_bytes(url)
                    if not bytes_data:
                        return False

                # Always upload to MinIO storage
                content_type = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"
                try:
                    obj_key, fsize, width, height, md5_h = minio_service.upload_chapter_page(
                        manga_id=manga_id,
                        chapter_id=chap_id,
                        filename=file_name,
                        data=bytes_data,
                        content_type=content_type
                    )
                except Exception as me:
                    logger.error(f"Error uploading page {file_name} to MinIO: {me}")
                    return False

                # Save bytes to disk if path provided
                if full_path:
                    try:
                        loop = asyncio.get_running_loop()
                        await loop.run_in_executor(None, self._write_file, full_path, bytes_data)
                    except Exception as e:
                        logger.error(f"Error saving image {file_name} to disk: {e}")

                page_results[idx] = {
                    "page_number": idx + 1,
                    "filename": file_name,
                    "object_key": obj_key,
                    "file_size": fsize,
                    "width": width,
                    "height": height,
                    "md5_hash": md5_h
                }

                # Compute statistics
                speed_p = None
                speed_mb = None
                elapsed_sec = None
                eta_sec = None
                total_p = None
                total_b = None
                rem_ch = None

                if shared_stats:
                    shared_stats["pages_done"] = shared_stats.get("pages_done", 0) + 1
                    shared_stats["bytes_done"] = shared_stats.get("bytes_done", 0) + fsize
                    elapsed_sec = max(0.1, round(time.time() - shared_stats.get("start_time", time.time()), 1))
                    total_p = shared_stats["pages_done"]
                    total_b = shared_stats["bytes_done"]
                    speed_p = round(total_p / elapsed_sec, 1)
                    speed_mb = round((total_b / (1024 * 1024)) / elapsed_sec, 2)
                    
                    cur_ch = shared_stats.get("current_chap_index", 1)
                    tot_ch = shared_stats.get("total_chapters", 1)
                    rem_ch = max(0, tot_ch - cur_ch)
                    # estimate remaining pages
                    avg_pages_per_ch = total_p / max(1, cur_ch)
                    est_rem_pages = int(rem_ch * avg_pages_per_ch + max(0, len(urls) - (idx + 1)))
                    eta_sec = round(est_rem_pages / max(0.1, speed_p), 1)

                # Update progress preview
                await self._update_page_progress(
                    task_id=task_id,
                    chap_num=chap_num,
                    page_num=idx + 1,
                    page_total=len(urls),
                    bytes_data=bytes_data,
                    filename=file_name,
                    file_size=fsize,
                    speed_pages=speed_p,
                    speed_mb=speed_mb,
                    elapsed_sec=elapsed_sec,
                    eta_sec=eta_sec,
                    total_pages_downloaded=total_p,
                    total_bytes_downloaded=total_b,
                    remaining_chapters=rem_ch
                )
                return True

        tasks = [download_page(idx, url) for idx, url in enumerate(urls)]
        results = await asyncio.gather(*tasks)
        success = all(results)
        valid_pages = [p for p in page_results if p is not None]
        return success, valid_pages

    def _write_file(self, path: str, data: bytes):
        with open(path, "wb") as f:
            f.write(data)

download_service = DownloadService()

