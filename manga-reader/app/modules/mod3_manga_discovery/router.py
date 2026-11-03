"""FastAPI Router for Module 3 (Manga Discovery, Filter, Search, Creators, Recommendations, History)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, get_optional_current_user
from app.models import ContentRating, PublicationDemographic, PublicationStatus, User
from app.modules.mod3_manga_discovery.schemas import UpdateReadingStatusRequest
from app.modules.mod3_manga_discovery.service import manga_discovery_service
from app.workers.recsys_engine import (
    get_content_based_recommendations,
    get_item_based_recommendations,
    get_user_based_recommendations,
)

router = APIRouter(prefix="/api/v1", tags=["Module 3 - Manga Discovery & Recommendations"])


@router.get("/mangas", status_code=status.HTTP_200_OK)
async def list_mangas(
    page: int = Query(default=1, ge=1),
    sort_by: str = Query(default="latest_update", pattern=r"^(latest_update|views|rating|title_asc)$"),
    include_tags: str | None = Query(default=None),
    include_mode: str = Query(default="AND", pattern=r"^(AND|OR|and|or)$"),
    exclude_tags: str | None = Query(default=None),
    demographic: PublicationDemographic | None = Query(default=None),
    pub_status: PublicationStatus | None = Query(default=None, alias="status"),
    original_language: str | None = Query(default=None),
    year: int | None = Query(default=None),
    content_rating: ContentRating | None = Query(default=None),
    caller: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """View and filter public manga catalog with fixed 24 items/page (UC-3.1, UC-3.2)."""
    return await manga_discovery_service.list_and_filter_mangas(
        db=db,
        caller=caller,
        page=page,
        sort_by=sort_by,
        include_tags=include_tags,
        include_mode=include_mode,
        exclude_tags=exclude_tags,
        demographic=demographic,
        pub_status=pub_status,
        original_language=original_language,
        year=year,
        content_rating=content_rating,
    )


@router.get("/mangas/search", status_code=status.HTTP_200_OK)
async def search_mangas(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=24, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Search mangas by title & alt_titles with accent-insensitive fuzzy matching (UC-3.3)."""
    return await manga_discovery_service.search_mangas(db, q, limit=limit)


@router.get("/mangas/autocomplete", status_code=status.HTTP_200_OK)
async def autocomplete_mangas(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Fast autocomplete returning up to 8 matches (UC-3.3)."""
    return await manga_discovery_service.search_mangas(db, q, limit=8)


@router.get("/creators", status_code=status.HTTP_200_OK)
async def list_creators(
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Search authors and artists by name or slug (UC-3.4)."""
    return await manga_discovery_service.list_creators(db, q=q, page=page, page_size=page_size)


@router.get("/creators/{creator_id}", status_code=status.HTTP_200_OK)
async def get_creator_detail(
    creator_id: str,
    tag_slug: str | None = Query(default=None),
    pub_status: PublicationStatus | None = Query(default=None, alias="status"),
    sort_by: str = Query(default="latest_update"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """View creator biography, social links, and their public works (UC-3.6)."""
    return await manga_discovery_service.get_creator_detail(
        db=db,
        creator_id=creator_id,
        tag_slug=tag_slug,
        pub_status=pub_status,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )


@router.get("/mangas/{id_or_slug}", status_code=status.HTTP_200_OK)
async def get_manga_detail(
    id_or_slug: str,
    caller: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get full manga metadata by pool_manga_id or slug (UC-3.5)."""
    return await manga_discovery_service.get_manga_detail(db, id_or_slug, caller)


@router.get("/mangas/{manga_id}/recommendations/content-based", status_code=status.HTTP_200_OK)
async def recommend_content_based(
    manga_id: str,
    limit: int = Query(default=10, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Content-Based Cosine Similarity recommendations with genre fallback (UC-3.9)."""
    manga = await manga_discovery_service.get_manga_for_recsys(db, manga_id)
    return await get_content_based_recommendations(db, manga, limit=limit)


@router.get("/mangas/{manga_id}/recommendations/item-based", status_code=status.HTTP_200_OK)
async def recommend_item_based(
    manga_id: str,
    limit: int = Query(default=10, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Item-Based Collaborative Filtering recommendations with cold-start fallback (UC-3.7)."""
    manga = await manga_discovery_service.get_manga_for_recsys(db, manga_id)
    return await get_item_based_recommendations(db, manga, limit=limit)


@router.get("/recommendations/user-based", status_code=status.HTTP_200_OK)
async def recommend_user_based(
    limit: int = Query(default=10, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """User-Based Collaborative Filtering recommendations excluding completed/dropped mangas (UC-3.8)."""
    return await get_user_based_recommendations(db, current_user.user_id, limit=limit)


@router.put("/users/me/reading-status/{manga_id}", status_code=status.HTTP_200_OK)
async def set_my_reading_status(
    manga_id: str,
    payload: UpdateReadingStatusRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Set or update reading status for a manga (UC-3.10)."""
    return await manga_discovery_service.set_reading_status(db, current_user, manga_id, payload.status)


@router.delete("/users/me/reading-status/{manga_id}", status_code=status.HTTP_200_OK)
async def delete_my_reading_status(
    manga_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Remove reading status for a manga (UC-3.10)."""
    return await manga_discovery_service.delete_reading_status(db, current_user, manga_id)


@router.get("/users/me/reading-history", status_code=status.HTTP_200_OK)
async def get_my_reading_history(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get reading history grouped by manga ordered by last_read_at DESC (UC-3.11)."""
    return await manga_discovery_service.get_reading_history(db, current_user, page=page, page_size=page_size)
