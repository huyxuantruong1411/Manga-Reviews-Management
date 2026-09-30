import json
import asyncio
import logging
from typing import Optional, List, Dict, Any
from bson import ObjectId
from fastapi import APIRouter, Path, Query, Body, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.database.connection import get_db
from backend.services.vision_service import vision_service
from backend.services.panel_scanner_service import panel_scanner_service
from backend.services.dictionary_service import dictionary_service
from backend.services.minio_service import minio_service

logger = logging.getLogger("vision_router")
router = APIRouter(prefix="/api", tags=["vision"])


class ScanPanelsRequest(BaseModel):
    chapter_ids: Optional[List[str]] = None
    force_rescan: bool = False


@router.post("/manga/{manga_id}/scan-panels")
async def trigger_manga_scan(
    manga_id: str = Path(...),
    payload: ScanPanelsRequest = Body(default_factory=ScanPanelsRequest),
):
    """Trigger background scanning and panel/dialogue feature extraction for a manga."""
    try:
        res = await panel_scanner_service.trigger_scan(
            manga_id=manga_id,
            chapter_ids=payload.chapter_ids,
            force_rescan=payload.force_rescan,
        )
        return res
    except Exception as e:
        logger.error(f"Error triggering manga panels scan: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/manga/{manga_id}/scan-status")
async def get_scan_status(manga_id: str = Path(...)):
    """Retrieve current scan progress status."""
    return panel_scanner_service.get_scan_status(manga_id)


@router.get("/manga/{manga_id}/scan-progress")
async def stream_scan_progress(manga_id: str = Path(...)):
    """Server-Sent Events (SSE) endpoint streaming real-time feature extraction progress."""
    q = panel_scanner_service.register_queue(manga_id)

    async def event_generator():
        try:
            # Yield initial status immediately
            initial_stat = panel_scanner_service.get_scan_status(manga_id)
            yield f"data: {json.dumps(initial_stat)}\n\n"

            while True:
                try:
                    stat = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"data: {json.dumps(stat)}\n\n"
                    if stat.get("stage") in ("completed", "error") and not stat.get("is_scanning", False):
                        break
                except asyncio.TimeoutError:
                    # Heartbeat comment to keep SSE connection alive
                    yield ": ping\n\n"
        finally:
            panel_scanner_service.unregister_queue(manga_id, q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/manga/{manga_id}/panels/search")
async def search_manga_panels(
    manga_id: str = Path(...),
    q: str = Query(..., min_length=1, description="Keyword, dialogue phrase, or lemma"),
    chapter_id: Optional[str] = Query(None, description="Optional chapter filter"),
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    Search manga scene panels by character dialogue, phrase, or vocabulary lemma.
    Returns ranked panels with highlighted snippet and coordinates.
    """
    try:
        res = await panel_scanner_service.search_panels(
            manga_id=manga_id,
            query=q,
            chapter_id=chapter_id,
            limit=limit,
            offset=offset,
        )
        return res
    except Exception as e:
        logger.error(f"Error searching panels for manga {manga_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/manga/{manga_id}/panels/stats")
async def get_manga_panels_stats(manga_id: str = Path(...)):
    """Retrieve feature extraction stats: total panels, scanned pages, unique vocabulary."""
    try:
        stats = await panel_scanner_service.get_manga_stats(manga_id)
        return stats
    except Exception as e:
        logger.error(f"Error fetching panel stats for manga {manga_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/panels/{panel_id}/crop")
async def get_panel_crop(panel_id: str = Path(...)):
    """
    Dynamically crop panel directly in RAM from original page bytes in MinIO.
    Zero redundant disk files.
    """
    filter_q = {"_id": ObjectId(panel_id)} if ObjectId.is_valid(panel_id) else {"_id": panel_id}
    panel = await get_db().manga_panels.find_one(filter_q)
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")

    coords = panel.get("coords", [0.0, 0.0, 1.0, 1.0])
    obj_key = panel.get("page_minio_key")
    if not obj_key:
        raise HTTPException(status_code=404, detail="Original page key not associated with this panel")

    # Fetch original page image bytes from MinIO in thread pool
    try:
        def _get_bytes():
            resp = minio_service.client.get_object(minio_service.bucket, obj_key)
            data = resp.read()
            resp.close()
            resp.release_conn()
            return data

        image_bytes = await asyncio.to_thread(_get_bytes)
    except Exception as e:
        logger.error(f"Could not fetch original page {obj_key} from MinIO: {e}")
        raise HTTPException(status_code=404, detail="Could not read original page image")

    # Dynamically slice panel in RAM
    try:
        buffer = await asyncio.to_thread(
            vision_service.get_panel_crop_stream,
            image_bytes,
            tuple(coords),
            90,
        )
        return StreamingResponse(
            buffer,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=604800, immutable"},
        )
    except Exception as e:
        logger.error(f"Error cropping panel {panel_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to slice panel crop")


@router.get("/panels/{panel_id}/page-image")
async def get_panel_page_raw(panel_id: str = Path(...)):
    """Retrieve full raw original page image for the full-page modal view with golden focus frame."""
    filter_q = {"_id": ObjectId(panel_id)} if ObjectId.is_valid(panel_id) else {"_id": panel_id}
    panel = await get_db().manga_panels.find_one(filter_q)
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")

    obj_key = panel.get("page_minio_key")
    if not obj_key:
        raise HTTPException(status_code=404, detail="Original page key not associated")

    try:
        def _get_bytes():
            resp = minio_service.client.get_object(minio_service.bucket, obj_key)
            data = resp.read()
            resp.close()
            resp.release_conn()
            return data

        image_bytes = await asyncio.to_thread(_get_bytes)
        import io
        return StreamingResponse(
            io.BytesIO(image_bytes),
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=604800, immutable"},
        )
    except Exception as e:
        logger.error(f"Error fetching full page for panel {panel_id}: {e}")
        raise HTTPException(status_code=404, detail="Could not retrieve full page image")


@router.get("/dictionary/define/{word}")
async def define_word(word: str = Path(...)):
    """Fetch word definition, phonetic, audio pronunciation, and example sentences."""
    try:
        res = await dictionary_service.get_definition(word)
        return res
    except Exception as e:
        logger.error(f"Error looking up definition for '{word}': {e}")
        raise HTTPException(status_code=500, detail=str(e))
