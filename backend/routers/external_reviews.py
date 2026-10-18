import asyncio
import json
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Path, Query, status
from fastapi.responses import StreamingResponse

from backend.models.external_review import (
    ExternalReviewListResponse,
    TriggerExternalReviewSyncRequest,
)
from backend.services.external_review_service import external_review_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/manga/{manga_id}/external-reviews", tags=["External Reviews"])


@router.get("", response_model=ExternalReviewListResponse)
async def list_external_reviews(
    manga_id: str = Path(..., description="Manga ID"),
    source: Optional[str] = Query("all", description="Source filter (e.g. 'myanimelist' or 'all')"),
    recommendation_status: Optional[str] = Query(
        "all",
        description="Filter by recommendation status (recommended, mixed_feelings, not_recommended, all)",
    ),
    include_spoilers: bool = Query(True, description="Whether to include reviews marked as spoiler"),
    only_spoilers: Optional[bool] = Query(None, description="Only show reviews with spoilers"),
    only_preliminary: Optional[bool] = Query(None, description="Only show preliminary reviews"),
    search: Optional[str] = Query(None, description="Search term for content or reviewer name"),
    sort_by: str = Query("posted_at_desc", description="Sorting criteria"),
    skip: int = Query(0, ge=0, description="Offset for pagination"),
    limit: int = Query(20, ge=1, le=100, description="Page limit"),
) -> ExternalReviewListResponse:
    """List external reviews collected for a specific manga with filter, sort, and summary."""
    return await external_review_service.list_external_reviews(
        manga_id=manga_id,
        source=source,
        recommendation_status=recommendation_status,
        include_spoilers=include_spoilers,
        only_spoilers=only_spoilers,
        only_preliminary=only_preliminary,
        search=search,
        sort_by=sort_by,
        skip=skip,
        limit=limit,
    )


@router.post("/sync", status_code=status.HTTP_202_ACCEPTED)
async def trigger_external_review_sync(
    manga_id: str = Path(..., description="Manga ID"),
    request: TriggerExternalReviewSyncRequest = TriggerExternalReviewSyncRequest(),
) -> Dict[str, Any]:
    """
    Trigger async crawler for external reviews and optional MAL extended metadata.
    Returns 202 Accepted with immediate progress tracking state.
    """
    return await external_review_service.start_sync(manga_id, request)


@router.get("/sync-status")
async def get_sync_status(
    manga_id: str = Path(..., description="Manga ID"),
) -> Dict[str, Any]:
    """Retrieve current synchronization progress and logs snapshot."""
    return external_review_service.get_sync_status(manga_id)


@router.get("/sync-stream")
async def stream_sync_progress(
    manga_id: str = Path(..., description="Manga ID"),
):
    """
    Server-Sent Events (SSE) streaming real-time synchronization telemetry.
    Clients receive progress percentage, crawl stages, live logs, and completion status.
    """
    q = await external_review_service.register_queue(manga_id)

    async def event_generator():
        try:
            while True:
                try:
                    stat = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield f"data: {json.dumps(stat)}\n\n"
                    # If sync reached final terminal state, send final payload and terminate stream
                    if stat.get("status") in ("completed", "failed", "cancelled"):
                        break
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            external_review_service.unregister_queue(manga_id, q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sync/cancel")
async def cancel_sync(
    manga_id: str = Path(..., description="Manga ID"),
) -> Dict[str, Any]:
    """Cancel an active synchronization task for the manga."""
    cancelled = external_review_service.cancel_sync(manga_id)
    return {
        "status": "cancelled" if cancelled else "not_running",
        "message": "Tác vụ đồng bộ đã được yêu cầu dừng" if cancelled else "Không có tác vụ nào đang chạy",
    }


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_external_review(
    manga_id: str = Path(..., description="Manga ID"),
    review_id: str = Path(..., description="Review ID or Source Review ID"),
):
    """Delete a single third-party review from local storage."""
    deleted = await external_review_service.delete_external_review(manga_id, review_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Review '{review_id}' not found for manga '{manga_id}'",
        )


@router.delete("", status_code=status.HTTP_200_OK)
async def clear_manga_external_reviews(
    manga_id: str = Path(..., description="Manga ID"),
    source: Optional[str] = Query(None, description="Optional source to clear (e.g. 'myanimelist')"),
) -> Dict[str, Any]:
    """Clear all external reviews stored for a manga (optionally filtered by source)."""
    count = await external_review_service.clear_manga_external_reviews(manga_id, source)
    return {
        "message": f"Deleted {count} external review(s) for manga '{manga_id}'",
        "deleted_count": count,
    }
