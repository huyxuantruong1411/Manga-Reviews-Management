"""Read-only FastAPI router for Manga Deep Analytics Arrow IPC stream delivery."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Response
from fastapi import Path as ApiPath
from pydantic import BaseModel

from backend.services.analytics_lab_service import (
    AnalyticsLabForbiddenError,
    AnalyticsLabInvalidInputError,
    AnalyticsLabNotFoundError,
    analytics_lab_service,
)

router = APIRouter(prefix="/api/analytics-lab", tags=["Analytics Lab"])

ARROW_MEDIA_TYPE = "application/vnd.apache.arrow.stream"


class AnalyticsLabHealthResponse(BaseModel):
    status: str
    active_release_id: Optional[str] = None
    snapshot_date: Optional[str] = None
    enabled_datasets: int = 0


def _translate_error(exc: Exception) -> HTTPException:
    if isinstance(exc, AnalyticsLabInvalidInputError):
        return HTTPException(status_code=422, detail=str(exc))
    if isinstance(exc, AnalyticsLabForbiddenError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, AnalyticsLabNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=500, detail="Analytics Lab delivery error")


@router.get("/health", response_model=AnalyticsLabHealthResponse)
async def get_analytics_lab_health() -> AnalyticsLabHealthResponse:
    return AnalyticsLabHealthResponse(**analytics_lab_service.get_health())


@router.get("/manifest")
async def get_active_manifest() -> Dict[str, Any]:
    try:
        return analytics_lab_service.get_manifest()
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.get("/releases/{release_id}/manifest")
async def get_release_manifest(release_id: str = ApiPath(...)) -> Dict[str, Any]:
    try:
        return analytics_lab_service.get_manifest(release_id)
    except Exception as exc:
        raise _translate_error(exc) from exc


@router.get("/releases/{release_id}/datasets/{dataset_name}.arrow")
async def get_dataset_arrow_stream(
    release_id: str = ApiPath(...),
    dataset_name: str = ApiPath(...),
) -> Response:
    try:
        arrow_path, ds_meta = analytics_lab_service.resolve_dataset_arrow_file(release_id, dataset_name)
    except Exception as exc:
        raise _translate_error(exc) from exc

    payload = arrow_path.read_bytes()
    sha256 = str(ds_meta.get("sha256") or "")
    headers = {
        "Content-Length": str(len(payload)),
        "Cache-Control": "public, max-age=31536000, immutable",
    }
    if sha256:
        headers["ETag"] = f'"{sha256}"'
        headers["X-Payload-SHA256"] = sha256

    return Response(content=payload, media_type=ARROW_MEDIA_TYPE, headers=headers)
