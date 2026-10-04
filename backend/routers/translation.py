"""Translation Studio & Reader API Router.

Strictly adheres to Architecture Guard: handles HTTP routing, input validation
via Pydantic v2 schemas, and delegates domain orchestration to services.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Path, Query, Response, UploadFile, status
from pydantic import BaseModel, Field

from backend.models.translation import RegionData, TranslationJobCreate, TranslationProfileCreate
from backend.services.translation.editor_service import translation_editor_service
from backend.services.translation.export_service import translation_export_service
from backend.services.translation.fonts import translation_font_service
from backend.services.translation.job_service import translation_job_service
from backend.services.translation.profiles import translation_profile_service
from backend.services.translation.providers import translation_provider_service
from backend.services.translation.storage_service import translation_storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/translation", tags=["Translation Studio"])


class SaveRegionsPayload(BaseModel):
    regions: List[RegionData] = Field(..., description="Updated region annotations")
    expected_revision: int = Field(..., description="Optimistic locking revision number")


class PublishResultPayload(BaseModel):
    chapter_id: str = Field(..., description="Target chapter ID")
    page_uid: str = Field(..., description="Target page UID")
    revision: Optional[int] = Field(None, description="Optional chosen revision number")


@router.get("/capabilities")
async def get_capabilities() -> Dict[str, Any]:
    """Returns local runtime environment, CUDA status, and hardware capability report."""
    try:
        from services.translator_runtime.probe_compatibility import probe_environment
    except ImportError:
        import os
        import sys

        sys.path.insert(
            0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../services/translator-runtime"))
        )
        from probe_compatibility import probe_environment

    return probe_environment()


@router.post("/jobs", status_code=status.HTTP_202_ACCEPTED)
async def create_translation_job(payload: TranslationJobCreate) -> Dict[str, Any]:
    """Enqueues a durable translation job for specified chapter pages or demo assets."""
    return await translation_job_service.create_job(payload)


@router.get("/jobs")
async def list_jobs(limit: int = Query(20, ge=1, le=100)) -> List[Dict[str, Any]]:
    """Lists recent translation jobs with progress summary."""
    import backend.database.connection as db_conn

    db = db_conn.get_db()
    cursor = db["translation_jobs"].find({}).sort("created_at", -1).limit(limit)
    jobs = await cursor.to_list(length=limit)
    for j in jobs:
        j.pop("_id", None)
    return jobs


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str = Path(..., description="Target Job ID")) -> Dict[str, Any]:
    """Retrieves the aggregate durable status and progress for a translation job."""
    job = await translation_job_service.get_job_status(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Translation job not found.")
    return job


@router.get("/jobs/{job_id}/pages")
async def get_job_pages(job_id: str = Path(..., description="Target Job ID")) -> List[Dict[str, Any]]:
    """Retrieves all constituent page slot states and attempts for a translation job."""
    return await translation_job_service.get_job_pages(job_id)


@router.post("/jobs/{job_id}/cancel")
async def cancel_translation_job(job_id: str = Path(..., description="Target Job ID")) -> Dict[str, Any]:
    """Requests durable cancellation of a running or queued translation job."""
    return await translation_job_service.cancel_job(job_id)


@router.post("/jobs/{job_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_translation_job(job_id: str = Path(..., description="Target Job ID")) -> Dict[str, Any]:
    """Retries only failed or cancelled page slots for a translation job."""
    return await translation_job_service.retry_job(job_id)


# ─── PROFILES & REVISIONS ───────────────────────────────────────────────────


@router.get("/profiles")
async def list_profiles() -> List[Dict[str, Any]]:
    """Lists all translation profiles, initializing default if none exist."""
    profiles = await translation_profile_service.list_profiles()
    if not profiles:
        default_p = await translation_profile_service.get_or_create_default_profile()
        return [default_p]
    return profiles


@router.post("/profiles", status_code=status.HTTP_201_CREATED)
async def create_profile(payload: TranslationProfileCreate) -> Dict[str, Any]:
    """Creates a new translation profile and initializes its revision 1."""
    return await translation_profile_service.create_profile(payload)


@router.get("/profiles/{profile_id}")
async def get_profile(profile_id: str = Path(..., description="Profile ID")) -> Dict[str, Any]:
    """Retrieves a single translation profile."""
    profile = await translation_profile_service.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Translation profile not found.")
    return profile


@router.put("/profiles/{profile_id}")
async def update_profile(
    profile_id: str = Path(..., description="Profile ID"),
    payload: Dict[str, Any] = ...,
    expected_revision: Optional[int] = Query(None, description="Expected active revision number for conflict checking"),
) -> Dict[str, Any]:
    """Updates a profile by creating revision N+1, preventing lost updates with conflict checking."""
    try:
        return await translation_profile_service.update_profile(
            profile_id=profile_id,
            update_data=payload,
            expected_revision=expected_revision,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/profiles/{profile_id}/revisions")
async def get_profile_revisions(profile_id: str = Path(..., description="Profile ID")) -> List[Dict[str, Any]]:
    """Retrieves revision history for a profile."""
    return await translation_profile_service.get_revisions(profile_id)


@router.get("/profiles/{profile_id}/diff")
async def diff_profile_revisions(
    profile_id: str = Path(..., description="Profile ID"),
    rev1: int = Query(..., description="First revision number"),
    rev2: int = Query(..., description="Second revision number"),
) -> Dict[str, Any]:
    """Calculates parameter diffs between two revisions of a profile."""
    try:
        return await translation_profile_service.diff_revisions(profile_id, rev1, rev2)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/profiles/{profile_id}/export")
async def export_profile(profile_id: str = Path(..., description="Profile ID")) -> Dict[str, Any]:
    """Exports profile configuration with secrets and server paths redacted."""
    profile = await translation_profile_service.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Translation profile not found.")
    profile["effective_config"] = translation_profile_service.sanitize_config_for_export(
        profile.get("effective_config", {})
    )
    return profile


# ─── PROVIDERS ──────────────────────────────────────────────────────────────


@router.get("/providers")
async def list_providers() -> List[Dict[str, Any]]:
    """Lists registered translation backends with non-destructive credential capability status."""
    return await translation_provider_service.list_providers()


# ─── FONTS ──────────────────────────────────────────────────────────────────


@router.get("/fonts")
async def list_fonts() -> List[Dict[str, Any]]:
    """Lists registered font packs and their Vietnamese glyph coverage."""
    return await translation_font_service.list_fonts()


@router.post("/fonts", status_code=status.HTTP_201_CREATED)
async def upload_font(
    file: UploadFile = File(..., description="TTF or OTF font file"),
    name: str = Form(..., description="Font display name"),
    license_note: Optional[str] = Form(None, description="License information"),
) -> Dict[str, Any]:
    """Uploads a font file, checks Vietnamese glyph coverage, and registers the font pack."""
    file_bytes = await file.read()
    try:
        return await translation_font_service.upload_font_pack(
            name=name,
            file_bytes=file_bytes,
            filename=file.filename or "font.ttf",
            license_note=license_note,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── ASSETS & STORAGE ───────────────────────────────────────────────────────


@router.get("/assets/usage")
async def get_storage_usage() -> Dict[str, Any]:
    """Returns translation asset storage usage breakdown by kind."""
    return await translation_storage_service.get_storage_usage()


@router.post("/assets/cleanup")
async def preview_or_run_cleanup(dry_run: bool = Query(True, description="Dry run mode")) -> Dict[str, Any]:
    """Previews or runs reference-aware cleanup for deleting/unreferenced assets."""
    return await translation_storage_service.preview_cleanup(dry_run=dry_run)


@router.post("/assets/upload-demo", status_code=status.HTTP_201_CREATED)
async def upload_demo_asset(
    file: UploadFile = File(..., description="Synthetic demo page image"),
) -> Dict[str, Any]:
    """Uploads a standalone demo page image for Translation Studio testing."""
    file_bytes = await file.read()
    mime = file.content_type or "image/jpeg"
    return await translation_storage_service.register_demo_input_asset(
        file_bytes=file_bytes,
        filename=file.filename or "demo.jpg",
        mime_type=mime,
    )


@router.get("/assets/resolve-url")
async def resolve_asset_url(key: str = Query(..., description="MinIO object key")) -> Dict[str, str]:
    """Returns a presigned download URL for a translation asset."""
    url = translation_storage_service.resolve_asset_url(key)
    return {"object_key": key, "url": url}


# ─── BINDINGS & RESULTS ─────────────────────────────────────────────────────


@router.get("/bindings/{chapter_id}")
async def get_chapter_bindings(
    chapter_id: str = Path(..., description="Target Chapter ID"),
    target_language: str = Query("vi", description="Target language code"),
) -> Dict[str, Any]:
    """Retrieves all active translated page bindings for a chapter."""
    import backend.database.connection as db_conn

    db = db_conn.get_db()
    cursor = db["translation_page_bindings"].find({"chapter_id": chapter_id, "target_language": target_language})
    bindings_list = await cursor.to_list(length=1000)

    # Collect result details
    result_ids = [b["chosen_result_id"] for b in bindings_list if b.get("chosen_result_id")]
    results_map = {}
    if result_ids:
        r_cursor = db["translation_results"].find({"result_id": {"$in": result_ids}})
        r_list = await r_cursor.to_list(length=1000)
        for r in r_list:
            results_map[r["result_id"]] = r

    by_page_uid: Dict[str, Any] = {}
    for b in bindings_list:
        p_uid = b.get("page_uid")
        r_id = b.get("chosen_result_id")
        res_doc = results_map.get(r_id)
        if p_uid and res_doc:
            out_key = res_doc.get("output_object_key")
            by_page_uid[p_uid] = {
                "binding_id": str(b.get("_id", "")),
                "page_uid": p_uid,
                "result_id": r_id,
                "target_language": target_language,
                "chosen_revision": b.get("chosen_revision", 1),
                "output_object_key": out_key,
                "url": translation_storage_service.resolve_asset_url(out_key) if out_key else None,
                "clean_url": translation_storage_service.resolve_asset_url(res_doc["clean_object_key"])
                if res_doc.get("clean_object_key")
                else None,
                "width": res_doc.get("width"),
                "height": res_doc.get("height"),
            }

    return {
        "chapter_id": chapter_id,
        "target_language": target_language,
        "total_bindings": len(by_page_uid),
        "bindings": by_page_uid,
    }


@router.get("/results/{result_id}")
async def get_translation_result(
    result_id: str = Path(..., description="Target Result ID"),
) -> Dict[str, Any]:
    """Retrieves full translation result details including regions and transcripts."""
    import backend.database.connection as db_conn

    db = db_conn.get_db()
    res = await db["translation_results"].find_one({"result_id": result_id})
    if not res:
        raise HTTPException(status_code=404, detail="Translation result not found.")

    res.pop("_id", None)
    if res.get("output_object_key"):
        res["url"] = translation_storage_service.resolve_asset_url(res["output_object_key"])
    if res.get("clean_object_key"):
        res["clean_url"] = translation_storage_service.resolve_asset_url(res["clean_object_key"])
    return res


@router.post("/results/{result_id}/regions")
async def update_result_regions(
    result_id: str = Path(..., description="Target Result ID"),
    payload: SaveRegionsPayload = ...,
) -> Dict[str, Any]:
    """Updates region text and annotations with optimistic concurrency locking."""
    try:
        updated = await translation_editor_service.save_regions(
            result_id=result_id,
            regions=payload.regions,
            expected_revision=payload.expected_revision,
        )
        return updated
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.post("/results/{result_id}/rerender")
async def rerender_result(
    result_id: str = Path(..., description="Target Result ID"),
) -> Dict[str, Any]:
    """Re-renders text regions onto clean canvas with ZERO external LLM provider calls."""
    try:
        updated = await translation_editor_service.rerender_result(result_id)
        if updated.get("output_object_key"):
            updated["url"] = translation_storage_service.resolve_asset_url(updated["output_object_key"])
        return updated
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rerender result: {e}")


@router.post("/results/{result_id}/publish")
async def publish_result(
    result_id: str = Path(..., description="Target Result ID"),
    payload: PublishResultPayload = ...,
) -> Dict[str, Any]:
    """Binds a translation result to a specific chapter page."""
    try:
        return await translation_editor_service.publish_result(
            chapter_id=payload.chapter_id,
            page_uid=payload.page_uid,
            result_id=result_id,
            revision=payload.revision,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to publish result: {e}")


@router.get("/export/{chapter_id}")
async def export_chapter_translation(
    chapter_id: str = Path(..., description="Target Chapter ID"),
    target_language: str = Query("vi", description="Target language code"),
) -> Response:
    """Exports a chapter into a ZIP archive with translated pages, fallbacks, and manifest.json."""
    try:
        zip_bytes = await translation_export_service.export_chapter(
            chapter_id=chapter_id,
            target_language=target_language,
        )
        filename = f"chapter_{chapter_id}_{target_language}.zip"
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export chapter: {e}")
