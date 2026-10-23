import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, status

from backend.models.datalake_pool import (
    PoolBatchChapterUpdateRequest,
    PoolChapterUpdateRequest,
    PoolDeletePagesRequest,
    PoolDuplicateCleanupRequest,
    PoolDuplicateGroup,
    PoolIntegrityReport,
    PoolMangaUpdateRequest,
    PoolStatsResponse,
    PublishToPoolRequest,
    PublishToPoolResponse,
)
from backend.services.datalake_pool_service import datalake_pool_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/datalake-pool", tags=["Data Lake & Storage Pool"])


@router.get("/stats", response_model=PoolStatsResponse)
async def get_pool_stats():
    """Retrieve overall KPI statistics for the publication pool."""
    return await datalake_pool_service.get_pool_stats()


@router.get("/candidates")
async def list_candidates(
    search: Optional[str] = Query(None, description="Search term for manga title"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    has_pages_only: bool = Query(False, description="Filter only eligible mangas with pages"),
    not_in_pool_only: bool = Query(False, description="Filter only mangas not currently in pool"),
):
    """List mangas from the review system with eligibility indicators for publishing into pool."""
    return await datalake_pool_service.list_eligible_candidates(
        search=search,
        page=page,
        page_size=page_size,
        has_pages_only=has_pages_only,
        not_in_pool_only=not_in_pool_only,
    )


@router.post("/publish", response_model=PublishToPoolResponse, status_code=status.HTTP_200_OK)
async def publish_to_pool(request: PublishToPoolRequest):
    """
    Publish one or more eligible mangas into the Data Lake Pool.
    Zero-Copy: only creates references to MinIO object keys without duplicating image files.
    """
    return await datalake_pool_service.publish_mangas_to_pool(request)


@router.get("/mangas")
async def list_pool_mangas(
    search: Optional[str] = Query(None),
    pool_state: Optional[str] = Query(None, description="'published' | 'draft' | 'archived'"),
    is_etl_ready: Optional[bool] = Query(None),
    language: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("lineage.updated_at"),
    sort_order: int = Query(-1),
):
    """List mangas in the storage pool with filtering, sorting, and pagination."""
    return await datalake_pool_service.list_pool_mangas(
        search=search,
        pool_state=pool_state,
        is_etl_ready=is_etl_ready,
        language=language,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("/mangas/{pool_manga_id}")
async def get_pool_manga_detail(pool_manga_id: str):
    """Get full self-contained metadata and details of a pooled manga."""
    manga = await datalake_pool_service.get_pool_manga_detail(pool_manga_id)
    if not manga:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pooled manga not found")
    return manga


@router.patch("/mangas/{pool_manga_id}")
async def update_pool_manga(pool_manga_id: str, request: PoolMangaUpdateRequest):
    """
    Update pooled manga display metadata directly on the pool database.
    Does not modify review library document.
    """
    updated = await datalake_pool_service.update_pool_manga(pool_manga_id, request.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pooled manga not found")
    return updated


@router.post("/mangas/{pool_manga_id}/sync")
async def sync_pool_manga(pool_manga_id: str):
    """Re-sync metadata and latest downloaded chapters from the review system into the pool."""
    manga = await datalake_pool_service.get_pool_manga_detail(pool_manga_id)
    if not manga:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pooled manga not found")

    res = await datalake_pool_service.publish_mangas_to_pool(
        PublishToPoolRequest(
            source_manga_ids=[manga["source_manga_id"]], mark_etl_ready=manga.get("is_etl_ready", True)
        )
    )
    if res.error_count > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=res.results[0].error or "Sync failed")
    return await datalake_pool_service.get_pool_manga_detail(pool_manga_id)


@router.delete("/mangas/{pool_manga_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_manga_from_pool(pool_manga_id: str):
    """
    Remove manga and its mapped chapters from the pool database.
    Strictly non-destructive: does not delete original files on MinIO.
    """
    success = await datalake_pool_service.remove_manga_from_pool(pool_manga_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pooled manga not found")
    return None


@router.get("/mangas/{pool_manga_id}/chapters")
async def get_pool_manga_chapters(pool_manga_id: str, language: Optional[str] = Query(None)):
    """List chapters belonging to a pooled manga sorted naturally by chapter_numeric."""
    return await datalake_pool_service.get_pool_manga_chapters(pool_manga_id, language=language)


@router.post("/mangas/{pool_manga_id}/chapters/batch-metadata")
async def batch_update_pool_chapters(pool_manga_id: str, request: PoolBatchChapterUpdateRequest):
    """Batch update chapters (volume, scanlation group, language, renumber) in pool."""
    count = await datalake_pool_service.batch_update_pool_chapters(request)
    return {"updated_count": count}


@router.get("/chapters/{pool_chapter_id}")
async def get_pool_chapter_detail(pool_chapter_id: str):
    """Get single chapter details with pages and dynamically signed preview URLs."""
    ch = await datalake_pool_service.get_pool_chapter_detail(pool_chapter_id, include_presigned_urls=True)
    if not ch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pooled chapter not found")
    return ch


@router.patch("/chapters/{pool_chapter_id}")
async def update_pool_chapter_metadata(pool_chapter_id: str, request: PoolChapterUpdateRequest):
    """Update single chapter metadata in pool."""
    ch = await datalake_pool_service.update_pool_chapter_metadata(
        pool_chapter_id, request.model_dump(exclude_unset=True)
    )
    if not ch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pooled chapter not found")
    return ch


@router.delete("/chapters/{pool_chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pool_chapter(pool_chapter_id: str):
    """Delete a chapter from the pool. Does not delete MinIO files."""
    success = await datalake_pool_service.delete_pool_chapter(pool_chapter_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pooled chapter not found")
    return None


@router.post("/chapters/{pool_chapter_id}/delete-pages")
async def delete_pool_chapter_pages(pool_chapter_id: str, request: PoolDeletePagesRequest):
    """
    Delete specified pages from a chapter in the pool and renumber remaining pages.
    Never deletes physical files on MinIO.
    """
    ch = await datalake_pool_service.delete_pool_chapter_pages(pool_chapter_id, request.page_numbers)
    if not ch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pooled chapter not found")
    return ch


@router.get("/mangas/{pool_manga_id}/duplicates", response_model=List[PoolDuplicateGroup])
async def scan_pool_duplicates(pool_manga_id: str, pool_chapter_id: Optional[str] = Query(None)):
    """Scan for duplicate pages by MD5 hash across chapters in a pooled manga."""
    return await datalake_pool_service.scan_pool_duplicates(pool_manga_id, pool_chapter_id=pool_chapter_id)


@router.post("/mangas/{pool_manga_id}/duplicates/cleanup")
async def cleanup_pool_duplicates(pool_manga_id: str, request: PoolDuplicateCleanupRequest):
    """
    Remove selected duplicate pages from the pool and renumber remaining pages.
    Never deletes physical files on MinIO.
    """
    return await datalake_pool_service.cleanup_pool_duplicates(pool_manga_id, request.targets)


@router.get("/mangas/{pool_manga_id}/verify", response_model=PoolIntegrityReport)
async def verify_pool_manga_integrity(pool_manga_id: str):
    """Verify physical presence of all referenced object keys in MinIO."""
    return await datalake_pool_service.verify_pool_manga_integrity(pool_manga_id)


@router.get("/mangas/{pool_manga_id}/etl-manifest")
async def export_etl_manifest(pool_manga_id: str):
    """Export self-contained data contract manifest JSON for downstream ETL."""
    manifest = await datalake_pool_service.export_etl_package_manifest(pool_manga_id)
    if not manifest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pooled manga not found")
    return manifest
