from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel

from backend.services.mangadex_service import mangadex_service
from backend.services.recommendation_service import recommendation_service

router = APIRouter(tags=["Recommendations"])


class ImportMangaRequest(BaseModel):
    mangadex_id: str


@router.get("/api/manga/{manga_id}/recommendations")
async def get_recommendations(manga_id: str = Path(...)):
    """Retrieve recommendations for a manga. Serves from cache, falling back to sync if needed."""
    try:
        recs = await recommendation_service.get_recommendations(manga_id)
        return recs
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting recommendations: {e}")


@router.post("/api/manga/{manga_id}/recommendations/sync")
async def force_sync_recommendations(manga_id: str = Path(...)):
    """Force fetch recommendations from MangaDex and update the cache."""
    try:
        result = await recommendation_service.sync_recommendations(manga_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error syncing recommendations: {e}")


@router.get("/api/mangadex/manga/{mangadex_id}/basic-info")
async def get_external_manga_basic_info(mangadex_id: str = Path(...)):
    """Fetch basic info from MangaDex for an external manga ID (e.g. for previewing recommendations)."""
    try:
        info = await mangadex_service.get_manga_basic_info(mangadex_id)
        if not info:
            raise HTTPException(status_code=404, detail="Manga details not found on MangaDex")
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching basic info: {e}")


@router.post("/api/manga/import-from-recommendation")
async def import_manga_from_rec(req: ImportMangaRequest):
    """Import a manga from recommendation into the system (creates a new entry in local DB)."""
    try:
        new_manga = await recommendation_service.import_manga_from_recommendation(req.mangadex_id)
        return new_manga
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error importing manga: {e}")
