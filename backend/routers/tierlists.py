import io
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Path, Query
from fastapi.responses import Response, StreamingResponse

from backend.models.tierlist import (
    MangaCoverOption,
    TierlistCloneRequest,
    TierlistComparisonResponse,
    TierlistCreateRequest,
    TierlistDetailResponse,
    TierlistSummaryItem,
    TierlistUpdateRequest,
)
from backend.services.tierlist_service import (
    TierlistAccessDeniedError,
    TierlistNotFoundError,
    TierlistRevisionConflictError,
    tierlist_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Creator Tierlists"])


# -----------------------------------------------------------------------------
# Manga Cover Options & Image Streaming (Declared first to avoid route shadowing)
# -----------------------------------------------------------------------------


@router.get("/api/tierlists/manga/{manga_id}/cover-options", response_model=List[MangaCoverOption])
async def get_manga_cover_options(manga_id: str = Path(...)):
    """Retrieve all available cover options (default + volume covers) for a manga."""
    try:
        return await tierlist_service.get_manga_cover_options(manga_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching cover options for manga {manga_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/tierlists/manga/{manga_id}/cover-image")
async def stream_cover_image(
    manga_id: str = Path(...),
    minio_key: Optional[str] = Query(None, description="Optional volume cover key belonging to this manga"),
):
    """
    Stream cover image bytes directly with same-origin policy.
    Prevents CORS tainted canvas issues when exporting Tierlist boards to PNG.
    """
    try:
        data_bytes, content_type = await tierlist_service.stream_cover_image_bytes(manga_id, minio_key)
        return StreamingResponse(
            io.BytesIO(data_bytes),
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400",
                "Content-Length": str(len(data_bytes)),
            },
        )
    except TierlistNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TierlistAccessDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error(f"Error streaming cover image for manga {manga_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# -----------------------------------------------------------------------------
# Creator Tierlists Scoped Routes
# -----------------------------------------------------------------------------


@router.get(
    "/api/creators/{creator_name}/tierlists/compare",
    response_model=TierlistComparisonResponse,
)
async def compare_creator_tierlists(
    creator_name: str = Path(...),
    base_id: str = Query(..., description="ID of the baseline tierlist"),
    target_id: str = Query(..., description="ID of the target tierlist to compare against"),
):
    """Compare two tierlist versions of the same creator and calculate rank movements."""
    try:
        return await tierlist_service.compare_tierlists(base_id, target_id)
    except TierlistNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error comparing tierlists for creator {creator_name}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/api/creators/{creator_name}/tierlists",
    response_model=List[TierlistSummaryItem],
)
async def list_creator_tierlists(creator_name: str = Path(...)):
    """List summary items of all tierlists created for a given creator."""
    try:
        return await tierlist_service.list_creator_tierlists(creator_name)
    except Exception as e:
        logger.error(f"Error listing tierlists for {creator_name}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/api/creators/{creator_name}/tierlists",
    response_model=TierlistDetailResponse,
    status_code=201,
)
async def create_creator_tierlist(
    creator_name: str = Path(...),
    payload: TierlistCreateRequest = ...,
):
    """Create a new tierlist board for a creator."""
    try:
        return await tierlist_service.create_tierlist(creator_name, payload)
    except Exception as e:
        logger.error(f"Error creating tierlist for {creator_name}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# -----------------------------------------------------------------------------
# Tierlist Resource Direct Operations
# -----------------------------------------------------------------------------


@router.get("/api/tierlists/{tierlist_id}", response_model=TierlistDetailResponse)
async def get_tierlist(tierlist_id: str = Path(...)):
    """Get full hydrated detail of a tierlist by ID."""
    try:
        return await tierlist_service.get_tierlist_by_id(tierlist_id)
    except TierlistNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting tierlist {tierlist_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/api/tierlists/{tierlist_id}", response_model=TierlistDetailResponse)
async def update_tierlist(
    tierlist_id: str = Path(...),
    payload: TierlistUpdateRequest = ...,
):
    """Update tierlist configuration, settings, or tiers with optimistic locking."""
    try:
        return await tierlist_service.update_tierlist(tierlist_id, payload)
    except TierlistNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TierlistRevisionConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating tierlist {tierlist_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/api/tierlists/{tierlist_id}/clone",
    response_model=TierlistDetailResponse,
    status_code=201,
)
async def clone_tierlist(
    tierlist_id: str = Path(...),
    payload: TierlistCloneRequest = ...,
):
    """Clone an existing tierlist into a new version."""
    try:
        return await tierlist_service.clone_tierlist(tierlist_id, payload)
    except TierlistNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error cloning tierlist {tierlist_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/api/tierlists/{tierlist_id}/auto-seed",
    response_model=TierlistDetailResponse,
)
async def auto_seed_tierlist(tierlist_id: str = Path(...)):
    """Automatically seed items into tiers according to their personal ratings."""
    try:
        return await tierlist_service.auto_seed_tierlist(tierlist_id)
    except TierlistNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error auto-seeding tierlist {tierlist_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/api/tierlists/{tierlist_id}", status_code=204)
async def delete_tierlist(tierlist_id: str = Path(...)):
    """Delete a tierlist version."""
    try:
        await tierlist_service.delete_tierlist(tierlist_id)
        return Response(status_code=204)
    except TierlistNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting tierlist {tierlist_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
