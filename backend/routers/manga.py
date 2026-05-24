from fastapi import APIRouter, Query, Path, UploadFile, File, Form, HTTPException, status
from typing import List, Optional, Dict, Any
import json
from backend.models.manga import MangaResponse, MangaCreate, MangaCreateDex, MangaUpdate, ReadStatus, MangaPaginationResponse
from backend.services.manga_service import manga_service

router = APIRouter(prefix="/api/manga", tags=["Manga"])

@router.get("/", response_model=MangaPaginationResponse)
async def list_mangas(
    search: Optional[str] = Query(None, description="Search by title, author, artist"),
    read_status: Optional[str] = Query(None, description="Filter by read status"),
    tags: Optional[List[str]] = Query(None, description="Filter by tag IDs to include"),
    exclude_tags: Optional[List[str]] = Query(None, description="Filter by tag IDs to exclude"),
    tag_mode: str = Query("all", description="Tag matching mode: all or any"),
    content_ratings: Optional[List[str]] = Query(None, description="Filter by content ratings"),
    demographics: Optional[List[str]] = Query(None, description="Filter by publication demographics"),
    statuses: Optional[List[str]] = Query(None, description="Filter by publication statuses"),
    original_languages: Optional[List[str]] = Query(None, description="Filter by original languages"),
    author: Optional[str] = Query(None, description="Filter by author name"),
    artist: Optional[str] = Query(None, description="Filter by artist name"),
    authors: Optional[List[str]] = Query(None, description="Filter by multiple author names"),
    artists: Optional[List[str]] = Query(None, description="Filter by multiple artist names"),
    rating_min: Optional[float] = Query(None, description="Min rating"),
    rating_max: Optional[float] = Query(None, description="Max rating"),
    year: Optional[str] = Query(None, description="Filter by year"),
    year_start: Optional[str] = Query(None, description="Filter by start year range"),
    year_end: Optional[str] = Query(None, description="Filter by end year range"),
    sort_by: str = Query("added_at", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=10000)
):
    """List and search mangas with filters and sorting."""
    return await manga_service.get_mangas(
        search=search,
        read_status=read_status,
        tags=tags,
        exclude_tags=exclude_tags,
        tag_mode=tag_mode,
        content_ratings=content_ratings,
        demographics=demographics,
        statuses=statuses,
        original_languages=original_languages,
        author=author,
        artist=artist,
        authors=authors,
        artists=artists,
        rating_min=rating_min,
        rating_max=rating_max,
        year=year,
        year_start=year_start,
        year_end=year_end,
        sort_by=sort_by,
        sort_order=sort_order,
        skip=skip,
        limit=limit
    )

@router.get("/{manga_id}", response_model=MangaResponse)
async def get_manga(manga_id: str = Path(...)):
    """Get detail metadata for a single manga."""
    manga = await manga_service.get_manga_by_id(manga_id)
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found")
    return manga

@router.get("/resolve-reference/{identifier}", response_model=MangaResponse)
async def resolve_manga_reference(identifier: str = Path(...)):
    """Resolve a manga cross-reference by either MongoDB _id or MangaDex UUID."""
    manga = await manga_service.get_manga_by_any_id(identifier)
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found")
    return manga

@router.post("/dex", response_model=MangaResponse, status_code=status.HTTP_201_CREATED)
async def add_manga_from_dex(data: MangaCreateDex):
    """Add a new manga using a MangaDex UUID."""
    try:
        manga = await manga_service.add_manga_by_dex(data)
        return manga
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add manga: {e}")

@router.post("/manual", response_model=MangaResponse, status_code=status.HTTP_201_CREATED)
async def add_manga_manually(
    # Receive JSON payload as a Form field because of Multipart upload support
    metadata: str = Form(..., description="MangaCreate JSON string"),
    cover: Optional[UploadFile] = File(None)
):
    """Add a new manga manually with metadata and cover image upload."""
    try:
        data_dict = json.loads(metadata)
        manual_data = MangaCreate(**data_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid metadata JSON structure: {e}")

    cover_bytes = None
    if cover:
        cover_bytes = await cover.read()

    manga = await manga_service.add_manga_manual(manual_data, cover_bytes)
    return manga

@router.put("/{manga_id}", response_model=MangaResponse)
async def update_manga(
    manga_id: str = Path(...),
    metadata: Optional[str] = Form(None, description="MangaUpdate JSON string"),
    cover: Optional[UploadFile] = File(None)
):
    """Update manga metadata, read status, rating, tags, or cover."""
    update_data = None
    if metadata:
        try:
            data_dict = json.loads(metadata)
            update_data = MangaUpdate(**data_dict)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid metadata JSON structure: {e}")
    else:
        update_data = MangaUpdate()

    cover_bytes = None
    if cover:
        cover_bytes = await cover.read()

    manga = await manga_service.update_manga(manga_id, update_data, cover_bytes)
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found")
    return manga

@router.delete("/{manga_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_manga(manga_id: str = Path(...)):
    """Delete a manga, its reviews, and cover image."""
    deleted = await manga_service.delete_manga(manga_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Manga not found")
    return None

@router.post("/{manga_id}/sync", response_model=MangaResponse)
async def sync_manga_metadata(manga_id: str = Path(...)):
    """Force sync manga metadata and cover image from MangaDex."""
    manga = await manga_service.sync_manga_metadata(manga_id)
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found or not synced (manual entry)")
    return manga

@router.get("/{manga_id}/history")
async def get_manga_history(manga_id: str = Path(...)):
    """Get the audit log change history of a manga."""
    history = await manga_service.get_manga_history(manga_id)
    return history
