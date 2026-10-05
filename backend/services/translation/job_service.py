"""Translation job orchestration service.

Handles durable job creation, MongoDB persistence, ARQ queue dispatching,
cancellation, retry, and status reconciliation.
"""

import asyncio
import logging
import uuid
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException

from backend.database.connection import get_db
from backend.models.translation import (
    TranslationJobCreate,
    TranslationJobInDB,
    TranslationJobPageInDB,
    utc_now,
)

logger = logging.getLogger(__name__)

# Concurrency throttle for in-process background worker execution
_in_process_semaphore: Optional[asyncio.Semaphore] = None


def _get_semaphore() -> asyncio.Semaphore:
    global _in_process_semaphore
    if _in_process_semaphore is None:
        _in_process_semaphore = asyncio.Semaphore(1)
    return _in_process_semaphore


async def enqueue_page_task(job_id: str, page_identity: str, attempt: int = 1) -> bool:
    """Enqueues a translation page execution task into the dedicated arq:translation queue.
    Also dispatches in-process background execution via asyncio.create_task to ensure
    translation jobs run immediately without requiring a standalone external ARQ worker process.
    """
    enqueued_arq = False
    try:
        from backend.core.redis import get_arq_pool

        pool = await get_arq_pool()
        if pool:
            await pool.enqueue_job(
                "execute_translation_job_page",
                job_id=job_id,
                page_identity=page_identity,
                attempt=attempt,
                _queue_name="arq:translation",
            )
            enqueued_arq = True
    except Exception as e:
        logger.warning(f"Could not enqueue translation task to Redis immediately: {e}")

    # In-process asynchronous task dispatch fallback:
    # Always spawn in-process task so development & standalone instances immediately process translations.
    # Idempotency is guaranteed by the CAS fencing token in execute_translation_job_page.
    async def _in_process_runner():
        sem = _get_semaphore()
        async with sem:
            try:
                from backend.tasks.translation import execute_translation_job_page

                await execute_translation_job_page({}, job_id, page_identity, attempt)
            except Exception as exc:
                logger.error(f"In-process translation task failed for {job_id}/{page_identity}: {exc}", exc_info=True)

    try:
        asyncio.create_task(_in_process_runner())
    except Exception as e:
        logger.warning(f"Could not schedule in-process translation task: {e}")

    return enqueued_arq or True


class TranslationJobService:
    def _get_jobs_col(self):
        return get_db().translation_jobs

    def _get_pages_col(self):
        return get_db().translation_job_pages

    def _get_chapters_col(self):
        return get_db().chapters

    async def create_job(self, req: TranslationJobCreate) -> Dict[str, Any]:
        """Creates a durable translation job and its constituent page records in MongoDB."""
        page_uids = []
        source_manifest: Dict[str, Any] = {"kind": req.source.kind}

        if req.source.kind == "chapter_pages":
            if not req.source.chapter_id:
                raise HTTPException(status_code=422, detail="chapter_id is required for chapter_pages source.")

            # Load chapter to resolve pages
            c_key = req.source.chapter_id
            filter_q = {"_id": ObjectId(c_key)} if ObjectId.is_valid(c_key) else {"_id": c_key}
            chap = await self._get_chapters_col().find_one(filter_q)
            if not chap:
                raise HTTPException(status_code=404, detail="Chapter not found.")

            stored_pages = chap.get("pages", [])
            modified_pages = False
            for p in stored_pages:
                if not p.get("page_uid"):
                    p["page_uid"] = str(uuid.uuid4())
                    modified_pages = True

            if modified_pages:
                up_fields = {"pages": stored_pages}
                if "pages_revision" not in chap:
                    up_fields["pages_revision"] = 1
                await self._get_chapters_col().update_one(filter_q, {"$set": up_fields})

            stored_uid_map = {p.get("page_uid"): p for p in stored_pages if p.get("page_uid")}
            page_num_map = {
                p.get("page_number", idx + 1): p.get("page_uid")
                for idx, p in enumerate(stored_pages)
                if p.get("page_uid")
            }

            if req.source.page_numbers:
                for num in req.source.page_numbers:
                    found_uid = page_num_map.get(num)
                    if found_uid and found_uid not in page_uids:
                        page_uids.append(found_uid)
            elif req.source.page_uids:
                # Specific page subset requested
                for uid in req.source.page_uids:
                    if uid in stored_uid_map:
                        page_uids.append(uid)
                    elif uid.isdigit() and int(uid) in page_num_map:
                        page_uids.append(page_num_map[int(uid)])
                    elif len(req.source.page_uids) == 1 and len(stored_pages) == 1:
                        page_uids.append(stored_pages[0]["page_uid"])
                    else:
                        raise HTTPException(status_code=422, detail=f"Page UID '{uid}' does not belong to chapter.")
            else:
                # All pages in chapter
                page_uids = [p["page_uid"] for p in stored_pages if p.get("page_uid")]

            source_manifest.update(
                {
                    "manga_id": req.source.manga_id or chap.get("manga_id"),
                    "chapter_id": req.source.chapter_id,
                    "pages_revision": chap.get("pages_revision", 1),
                    "total_pages": len(page_uids),
                }
            )
        elif req.source.kind == "demo_assets":
            page_uids = req.source.demo_asset_ids or []
            if not page_uids:
                raise HTTPException(status_code=422, detail="demo_asset_ids must not be empty.")
            source_manifest.update({"demo_asset_ids": page_uids, "total_pages": len(page_uids)})
        else:
            raise HTTPException(status_code=422, detail=f"Unsupported source kind '{req.source.kind}'.")

        job_id = f"job_{uuid.uuid4().hex[:16]}"
        now = utc_now()

        # 1. Insert Parent Job Document
        job_doc = TranslationJobInDB(
            job_id=job_id,
            scope="local",
            operation_kind="translate",
            state="queued",
            cancel_requested=False,
            total_pages=len(page_uids),
            completed_pages=0,
            failed_pages=0,
            source_manifest=source_manifest,
            profile_snapshot={
                "profile_id": req.profile_id or "default",
                "profile_revision": req.profile_revision or 1,
                "target_language": req.target_language,
                "context_policy": req.context_policy,
                "reuse_policy": req.reuse_policy,
            },
            idempotency_key=req.idempotency_key,
            created_at=now,
            updated_at=now,
        )
        job_data = job_doc.model_dump(by_alias=True, exclude={"id"})
        job_data.pop("_id", None)
        await self._get_jobs_col().insert_one(job_data)

        # 2. Insert Page Documents
        page_docs = []
        for idx, p_uid in enumerate(page_uids):
            page_doc = TranslationJobPageInDB(
                job_id=job_id,
                page_identity=p_uid,
                ordinal=idx + 1,
                state="queued",
                attempt=1,
                fencing_token=0,
            )
            p_data = page_doc.model_dump(by_alias=True, exclude={"id"})
            p_data.pop("_id", None)
            page_docs.append(p_data)

        if page_docs:
            await self._get_pages_col().insert_many(page_docs)

        # 3. Enqueue Tasks to Redis
        for p_uid in page_uids:
            await enqueue_page_task(job_id, p_uid, attempt=1)

        return {
            "job_id": job_id,
            "state": "queued",
            "total_pages": len(page_uids),
            "links": {
                "status": f"/api/translation/jobs/{job_id}",
                "pages": f"/api/translation/jobs/{job_id}/pages",
            },
        }

    async def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves durable job aggregate and reconciles state from constituent pages."""
        job = await self._get_jobs_col().find_one({"job_id": job_id})
        if not job:
            return None

        # Reconcile counts from pages collection
        cursor = self._get_pages_col().find({"job_id": job_id})
        pages = await cursor.to_list(length=1000)

        completed = sum(1 for p in pages if p.get("state") == "completed")
        failed = sum(1 for p in pages if p.get("state") == "failed")
        cancelled = sum(1 for p in pages if p.get("state") == "cancelled")
        running = sum(1 for p in pages if p.get("state") in ("running", "preparing", "committing"))

        total = len(pages) or job.get("total_pages", 0)

        # Compute derived parent state
        if job.get("cancel_requested") and (completed + failed + cancelled >= total):
            state = "cancelled"
        elif completed == total and total > 0:
            state = "completed"
        elif completed + failed + cancelled >= total and failed > 0:
            state = "partial" if completed > 0 else "failed"
        elif running > 0:
            state = "running"
        else:
            state = job.get("state", "queued")

        # Update if changed
        if state != job.get("state") or completed != job.get("completed_pages") or failed != job.get("failed_pages"):
            await self._get_jobs_col().update_one(
                {"job_id": job_id},
                {
                    "$set": {
                        "state": state,
                        "completed_pages": completed,
                        "failed_pages": failed,
                        "updated_at": utc_now(),
                    }
                },
            )
            job["state"] = state
            job["completed_pages"] = completed
            job["failed_pages"] = failed

        job.pop("_id", None)
        return job

    async def get_job_pages(self, job_id: str) -> List[Dict[str, Any]]:
        """Retrieves all page slot states for a job."""
        cursor = self._get_pages_col().find({"job_id": job_id})
        pages = await cursor.to_list(length=1000)
        pages.sort(key=lambda p: p.get("ordinal", 0))
        for p in pages:
            p.pop("_id", None)
        return pages

    async def cancel_job(self, job_id: str) -> Dict[str, Any]:
        """Marks the job as cancelled and cancels all non-terminal page slots."""
        job = await self._get_jobs_col().find_one({"job_id": job_id})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")

        await self._get_jobs_col().update_one(
            {"job_id": job_id},
            {"$set": {"cancel_requested": True, "updated_at": utc_now()}},
        )

        # Cancel all currently queued or preparing pages
        await self._get_pages_col().update_many(
            {"job_id": job_id, "state": {"$in": ["queued", "preparing"]}},
            {"$set": {"state": "cancelled"}},
        )

        return {"job_id": job_id, "cancel_requested": True, "success": True}

    async def retry_job(self, job_id: str) -> Dict[str, Any]:
        """Retries only failed or cancelled page slots in a job."""
        job = await self._get_jobs_col().find_one({"job_id": job_id})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")

        cursor = self._get_pages_col().find({"job_id": job_id, "state": {"$in": ["failed", "cancelled"]}})
        pages_to_retry = await cursor.to_list(length=1000)

        retried_count = 0
        for p in pages_to_retry:
            p_ident = p["page_identity"]
            new_attempt = p.get("attempt", 1) + 1
            await self._get_pages_col().update_one(
                {"job_id": job_id, "page_identity": p_ident},
                {
                    "$set": {"state": "queued", "error_code": None, "error_message": None},
                    "$inc": {"attempt": 1},
                },
            )
            await enqueue_page_task(job_id, p_ident, attempt=new_attempt)
            retried_count += 1

        if retried_count > 0:
            await self._get_jobs_col().update_one(
                {"job_id": job_id},
                {"$set": {"state": "queued", "cancel_requested": False, "updated_at": utc_now()}},
            )

        return {"job_id": job_id, "retried_count": retried_count}


translation_job_service = TranslationJobService()
