from typing import List, Optional

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field

from backend.models.datasource import (
    DatasourceError,
    ProviderCapability,
    ReleasePage,
    ReleaseQuery,
    SourceWork,
    SSRFSecurityError,
)
from backend.services.datasources.registry import (
    get_datasource_provider,
    list_datasource_providers,
)
from backend.services.datasources.url_utils import validate_and_parse_source_url

router = APIRouter(prefix="/api/datasources", tags=["Datasources"])


class ResolveSourceRequest(BaseModel):
    url_or_id: str = Field(..., description="Remote manga URL or ID")
    provider_hint: str = Field("auto", description="Provider hint or 'auto'")


@router.get("", response_model=List[ProviderCapability])
async def list_datasources() -> List[ProviderCapability]:
    """
    List all supported datasource providers and their capabilities.
    """
    providers = list_datasource_providers()
    return [p.capabilities for p in providers]


@router.post("/resolve", response_model=SourceWork)
async def resolve_source_work(payload: ResolveSourceRequest) -> SourceWork:
    """
    Resolve a manga URL or identifier against registered providers.
    Performs security validation (SSRF rejection) and returns normalized SourceWork.
    """
    raw_input = payload.url_or_id.strip()

    # Determine provider
    provider_name = payload.provider_hint.lower()
    if provider_name == "auto" or not provider_name:
        try:
            detected_provider, _, _ = validate_and_parse_source_url(raw_input)
            provider_name = detected_provider
        except SSRFSecurityError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception:
            # If not a recognized URL, and no hint, default to mangadex
            provider_name = "mangadex"

    try:
        provider = get_datasource_provider(provider_name)
    except DatasourceError as e:
        raise HTTPException(status_code=404, detail=f"Datasource provider not found: {e}")

    try:
        work = await provider.resolve_work(raw_input)
        return work
    except SSRFSecurityError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to resolve source work: {e}")


@router.get("/{provider_name}/releases/{work_id}", response_model=ReleasePage)
async def list_source_releases(
    provider_name: str = Path(..., description="Provider identifier, e.g. 'mangadex'"),
    work_id: str = Path(..., description="Remote work identifier"),
    lang: str = Query("en", description="Language code"),
    limit: int = Query(500, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> ReleasePage:
    """
    List all available releases for a manga from a specific provider,
    preserving each individual release ID before deduplication.
    """
    try:
        provider = get_datasource_provider(provider_name)
    except DatasourceError:
        raise HTTPException(status_code=404, detail=f"Datasource '{provider_name}' not found")

    query = ReleaseQuery(language=lang, limit=limit, offset=offset)
    try:
        page = await provider.list_releases(work_id, query)
        return page
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch releases from '{provider_name}': {e}")


class WarmupSessionRequest(BaseModel):
    target_url: str = Field("https://comix.to", description="Target URL for session warmup")


@router.post("/{provider_name}/warmup-session")
async def warmup_provider_session(
    provider_name: str = Path(..., description="Provider identifier, e.g. 'comix'"),
    payload: Optional[WarmupSessionRequest] = None,
):
    """
    Triggers an interactive or local AI session warmup for a provider requiring human/browser clearance.
    """
    try:
        provider = get_datasource_provider(provider_name)
    except DatasourceError:
        raise HTTPException(status_code=404, detail=f"Datasource '{provider_name}' not found")

    if not hasattr(provider, "warmup_session_interactive"):
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider_name}' does not support interactive session warmup",
        )

    target_url = payload.target_url if payload else "https://comix.to"
    try:
        result = await provider.warmup_session_interactive(target_url=target_url)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Session warmup failed: {e}")
