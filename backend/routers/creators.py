from fastapi import APIRouter, Path, HTTPException, Query
from typing import List, Optional
from backend.models.creator import CreatorResponse
from backend.services.creator_service import creator_service

router = APIRouter(prefix="/api/creators", tags=["Creators"])

@router.get("/suggestions", response_model=List[str])
async def get_suggestions(
    query: Optional[str] = Query(None),
    role: Optional[str] = Query(None)
):
    """
    Get author/artist name suggestions.
    - query: Search string, matches case-insensitive, word-independent
    - role: Filter by creator role (e.g. 'author' or 'artist')
    """
    return await creator_service.get_suggestions(query, role)

@router.get("/{name}", response_model=CreatorResponse)
async def get_creator(name: str = Path(...)):
    """Get creator profile details by name. Matches local cache, or queries and caches from MangaDex on-demand."""
    creator = await creator_service.get_creator_by_name(name)
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found")
    return creator
