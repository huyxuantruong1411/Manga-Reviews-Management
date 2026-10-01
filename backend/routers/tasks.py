import logging
from typing import Any, Optional, Union

from arq.jobs import Job, JobStatus
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Path, status
from pydantic import BaseModel, Field

from backend.core.redis import get_arq_pool, get_cache
from backend.database.connection import get_db

logger = logging.getLogger("routers.tasks")

router = APIRouter(tags=["Tasks"])


# ─── Pydantic DTOs ────────────────────────────────────────────────────


class PanelOCRTaskRequest(BaseModel):
    panel_id: Union[int, str] = Field(..., description="Panel ID or sequential index")
    image_path: str = Field(..., min_length=1, description="Local file path or MinIO object key")
    language: str = Field("en", description="Target OCR language: 'en' or 'vi'")


class TaskEnqueueResponse(BaseModel):
    task_id: str
    status: str = "queued"
    message: str
    panel_id: str


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str = Field(..., description="Task status: queued, in_progress, completed, failed, not_found")
    result: Optional[Any] = None
    error: Optional[str] = None
    panel_id: Optional[str] = None
    image_path: Optional[str] = None
    completed_at: Optional[str] = None


# ─── Core Task Logic ──────────────────────────────────────────────────


async def _resolve_task_status(task_id: str) -> TaskStatusResponse:
    """Retrieve task state from Redis cache or ARQ job query."""
    # 1. Check Redis cache for fast indexed results
    cached_info = await get_cache(f"task:ocr:{task_id}")
    if cached_info and isinstance(cached_info, dict):
        return TaskStatusResponse(
            task_id=task_id,
            status=cached_info.get("status", "completed"),
            result=cached_info if cached_info.get("status") == "completed" else None,
            error=cached_info.get("error"),
            panel_id=str(cached_info.get("panel_id", "")),
            image_path=cached_info.get("image_path"),
            completed_at=cached_info.get("completed_at"),
        )

    # 2. Check ARQ Job status if available
    pool = await get_arq_pool()
    if pool is not None:
        try:
            job = Job(job_id=task_id, redis=pool)
            job_status = await job.status()

            if job_status == JobStatus.not_found:
                return TaskStatusResponse(task_id=task_id, status="not_found")

            status_str = "queued"
            if job_status == JobStatus.in_progress:
                status_str = "in_progress"
            elif job_status == JobStatus.complete:
                status_str = "completed"
            elif job_status == JobStatus.deferred:
                status_str = "queued"

            result_val = None
            err_msg = None
            if job_status == JobStatus.complete:
                try:
                    result_info = await job.result_info()
                    if result_info:
                        if result_info.success:
                            result_val = result_info.result
                        else:
                            status_str = "failed"
                            err_msg = str(result_info.result)
                except Exception as ex:
                    logger.warning(f"Could not read ARQ job result for {task_id}: {ex}")

            return TaskStatusResponse(
                task_id=task_id,
                status=status_str,
                result=result_val,
                error=err_msg,
            )
        except Exception as e:
            logger.warning(f"Error querying ARQ job status for {task_id}: {e}")

    return TaskStatusResponse(task_id=task_id, status="not_found")


# ─── Endpoints ────────────────────────────────────────────────────────


@router.get("/tasks/{task_id}", response_model=TaskStatusResponse)
@router.get("/api/tasks/{task_id}", response_model=TaskStatusResponse, include_in_schema=False)
async def get_task_status(task_id: str = Path(..., description="ARQ Job/Task ID")):
    """
    Retrieve current processing state, telemetry, and results for a background task.
    Supports querying both active jobs and completed historical results.
    """
    res = await _resolve_task_status(task_id)
    if res.status == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with ID '{task_id}' not found",
        )
    return res


@router.post("/tasks/ocr", response_model=TaskEnqueueResponse, status_code=status.HTTP_202_ACCEPTED)
@router.post(
    "/api/tasks/ocr", response_model=TaskEnqueueResponse, status_code=status.HTTP_202_ACCEPTED, include_in_schema=False
)
async def enqueue_ocr_task(payload: PanelOCRTaskRequest):
    """
    Enqueue an asynchronous OCR task for a manga panel to the background ARQ worker.
    Decouples heavy OCR inference from synchronous HTTP request cycles.
    """
    pool = await get_arq_pool()
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Background task worker service (Redis/ARQ) is currently unavailable",
        )

    try:
        job = await pool.enqueue_job(
            "process_manga_panel_ocr",
            panel_id=payload.panel_id,
            image_path=payload.image_path,
            language=payload.language,
        )
        if not job:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to enqueue OCR job to worker",
            )

        return TaskEnqueueResponse(
            task_id=job.job_id,
            status="queued",
            message="OCR task successfully enqueued to background worker",
            panel_id=str(payload.panel_id),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enqueuing OCR task: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enqueue background task: {e}",
        )


@router.post(
    "/api/panels/{panel_id}/ocr-async", response_model=TaskEnqueueResponse, status_code=status.HTTP_202_ACCEPTED
)
async def enqueue_panel_ocr_by_id(
    panel_id: str = Path(..., description="Manga panel ID"),
    language: str = "en",
):
    """
    Trigger async OCR execution for an existing manga panel in the database.
    Fetches the panel's MinIO image key and submits the task to ARQ.
    """
    db = get_db()
    filter_q = {"_id": ObjectId(panel_id)} if ObjectId.is_valid(panel_id) else {"_id": panel_id}
    panel = await db.manga_panels.find_one(filter_q)
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")

    image_key = panel.get("page_minio_key")
    if not image_key:
        raise HTTPException(status_code=400, detail="Panel has no associated page_minio_key")

    pool = await get_arq_pool()
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Background task worker service (Redis/ARQ) is currently unavailable",
        )

    job = await pool.enqueue_job(
        "process_manga_panel_ocr",
        panel_id=panel_id,
        image_path=image_key,
        language=language,
    )
    if not job:
        raise HTTPException(status_code=500, detail="Failed to enqueue task")

    return TaskEnqueueResponse(
        task_id=job.job_id,
        status="queued",
        message="Panel OCR task dispatched to background worker",
        panel_id=panel_id,
    )
