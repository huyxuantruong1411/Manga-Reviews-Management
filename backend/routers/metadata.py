from datetime import datetime, timezone
from typing import Any, Dict, Optional

from bson import ObjectId
from fastapi import APIRouter, Body, HTTPException, Path
from pydantic import BaseModel, Field

from backend.database.connection import get_db
from backend.models.datasource import (
    MetadataApplyRequest,
    MetadataApplyResponse,
    MetadataConflictError,
    MetadataPreviewResponse,
    SourceWork,
)
from backend.services.datasources.registry import get_datasource_provider
from backend.services.metadata_merge_service import metadata_merge_service

router = APIRouter(prefix="/api/manga", tags=["Metadata"])


class MetadataPreviewRequest(BaseModel):
    source: str = Field(..., description="Provider identifier, e.g. 'mangadex', 'mangafire'")
    source_work_id: str = Field(..., description="Source remote work identifier")
    source_work: Optional[SourceWork] = Field(None, description="Pre-resolved work if already fetched")


class MetadataLocksUpdateRequest(BaseModel):
    locks: Dict[str, bool] = Field(..., description="Field lock mapping e.g. {'title': true, 'description': false}")


@router.post("/{manga_id}/metadata/preview", response_model=MetadataPreviewResponse)
async def preview_metadata_merge(
    manga_id: str = Path(...),
    payload: MetadataPreviewRequest = Body(...),
) -> MetadataPreviewResponse:
    """
    Preview field diff and conflict states between existing manga metadata
    and candidate datasource work.
    """
    db = get_db()
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ObjectId")

    manga = await db.mangas.find_one({"_id": ObjectId(manga_id)})
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found")

    candidate = payload.source_work
    if not candidate:
        try:
            provider = get_datasource_provider(payload.source)
            candidate = await provider.resolve_work(payload.source_work_id)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch metadata from {payload.source}: {e}")

    return metadata_merge_service.generate_diff(manga, candidate)


@router.post("/{manga_id}/metadata/apply", response_model=MetadataApplyResponse)
async def apply_metadata_merge(
    manga_id: str = Path(...),
    payload: MetadataApplyRequest = Body(...),
) -> MetadataApplyResponse:
    """
    Apply accepted metadata candidate fields with optimistic concurrency control.
    """
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ObjectId")

    try:
        provider = get_datasource_provider(payload.source)
        candidate = await provider.resolve_work(payload.source_work_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to resolve candidate for application: {e}")

    try:
        res = await metadata_merge_service.apply_metadata(
            manga_id=manga_id,
            candidate=candidate,
            accepted_fields=payload.accepted_fields,
            field_locks=payload.field_locks,
            expected_metadata_revision=payload.expected_metadata_revision,
        )
        return res
    except MetadataConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{manga_id}/metadata/locks")
async def get_metadata_locks(manga_id: str = Path(...)) -> Dict[str, Any]:
    """
    Get current metadata locks and metadata revision for a manga.
    """
    db = get_db()
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ObjectId")

    manga = await db.mangas.find_one({"_id": ObjectId(manga_id)})
    if not manga:
        raise HTTPException(status_code=404, detail="Manga not found")

    return {
        "manga_id": manga_id,
        "metadata_revision": manga.get("metadata_revision", 1),
        "locks": manga.get("metadata_locks", {}),
        "provenance": manga.get("metadata_provenance", {}),
    }


@router.put("/{manga_id}/metadata/locks")
async def update_metadata_locks(
    manga_id: str = Path(...),
    payload: MetadataLocksUpdateRequest = Body(...),
) -> Dict[str, Any]:
    """
    Update field lock settings for a manga.
    """
    db = get_db()
    if not ObjectId.is_valid(manga_id):
        raise HTTPException(status_code=400, detail="Invalid manga ObjectId")

    res = await db.mangas.update_one(
        {"_id": ObjectId(manga_id)},
        {"$set": {"metadata_locks": payload.locks, "updated_at": datetime.now(timezone.utc)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Manga not found")

    return {
        "manga_id": manga_id,
        "locks": payload.locks,
        "updated": True,
    }
