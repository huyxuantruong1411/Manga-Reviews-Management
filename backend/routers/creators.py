from typing import List, Optional

from fastapi import APIRouter, HTTPException, Path, Query

from backend.models.creator import CreatorResponse
from backend.services.creator_service import creator_service

router = APIRouter(prefix="/api/creators", tags=["Creators"])


@router.get("/suggestions", response_model=List[str])
async def get_suggestions(query: Optional[str] = Query(None), role: Optional[str] = Query(None)):
    """
    Get author/artist name suggestions.
    - query: Search string, matches case-insensitive, word-independent
    - role: Filter by creator role (e.g. 'author' or 'artist')
    """
    return await creator_service.get_suggestions(query, role)


@router.get("/{identifier}", response_model=CreatorResponse)
async def get_creator(
    identifier: str = Path(..., description="Creator UUID (creator_id / mangadex_id) or display name"),
):
    """
    Get creator profile details by canonical UUID (creator_id / mangadex_id), slug, or display name.
    Disambiguates homonymous creators when queried by UUID.
    """
    creator = await creator_service.get_creator_by_id_or_name(identifier)
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found")
    return creator


@router.get("/{creator_id}/{slug}", response_model=CreatorResponse)
async def get_creator_with_slug(
    creator_id: str = Path(..., description="Canonical Creator UUID (e.g. 7918d851-d77f-4ad6-9ec5-2c097320dc7e)"),
    slug: str = Path(..., description="URL-friendly creator slug (e.g. nakamura-moto)"),
):
    """
    MangaDex-style creator lookup by UUID + slug (/api/creators/{creator_id}/{slug}).
    Resolves strictly by creator_id first, falling back to slug if needed.
    """
    creator = await creator_service.get_creator_by_id_or_name(creator_id)
    if not creator and slug:
        creator = await creator_service.get_creator_by_id_or_name(slug)
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found")
    return creator
