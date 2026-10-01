from fastapi import APIRouter, HTTPException, Path

from backend.services.cover_art_service import cover_art_service

router = APIRouter(prefix="/api/manga", tags=["Cover Arts"])


@router.get("/{manga_id}/covers")
async def get_manga_covers(manga_id: str = Path(...)):
    """Retrieve all synced cover arts for a manga."""
    try:
        covers = await cover_art_service.get_covers_for_manga(manga_id)
        return covers
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting cover arts: {e}")


@router.post("/{manga_id}/covers/sync")
async def sync_manga_covers(manga_id: str = Path(...)):
    """Trigger a sync of all cover arts from MangaDex for a manga."""
    try:
        result = await cover_art_service.sync_covers_for_manga(manga_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error syncing cover arts: {e}")


@router.delete("/{manga_id}/covers")
async def delete_manga_covers(manga_id: str = Path(...)):
    """Delete all synced cover arts for a manga (clean up MinIO and database)."""
    try:
        success = await cover_art_service.delete_covers_for_manga(manga_id)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting cover arts: {e}")
