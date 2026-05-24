from fastapi import APIRouter, Query, Path, HTTPException
from typing import List
from backend.services.mangadex_service import mangadex_service

router = APIRouter(prefix="/api/mangadex", tags=["MangaDex Proxy"])

@router.get("/search")
async def search_mangadex(query: str = Query(..., min_length=1)):
    """Search manga directly on MangaDex (proxy)."""
    try:
        results = await mangadex_service.search_manga(query)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching MangaDex: {e}")

@router.get("/manga/{mangadex_id}/languages")
async def get_manga_languages(mangadex_id: str = Path(...)):
    """Get list of available translated languages for a manga."""
    try:
        languages = await mangadex_service.get_available_languages(mangadex_id)
        return languages
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching languages: {e}")

@router.get("/manga/{mangadex_id}/chapters")
async def get_manga_chapters(
    mangadex_id: str = Path(...),
    lang: str = Query("en", description="Language code")
):
    """Get aggregate list of chapters for a manga in a specific language."""
    try:
        chapters = await mangadex_service.get_manga_chapters(mangadex_id, lang)
        return chapters
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching chapters: {e}")
