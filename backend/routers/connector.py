"""Thin FastAPI router for the External Source Connector API (`/api/connector/v1`).

All business logic, pool scoping, media authorization, and CDC dispatch reside in
`backend.services.connector_service`. Every route enforces API key authentication via
`verify_connector_auth`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from backend.core.connector_security import verify_connector_auth
from backend.models.connector import (
    CdcDeliveryListResponse,
    CdcDeliveryRecord,
    CdcEventFeedResponse,
    CdcSubscriptionCreateRequest,
    CdcSubscriptionListResponse,
    CdcSubscriptionResponse,
    ConnectorCatalogResponse,
    ConnectorInfoResponse,
)
from backend.models.reader_contract import READER_CONTRACT_NAME, READER_CONTRACT_VERSION
from backend.services.connector_service import connector_service
from backend.services.reader_contract_service import build_reader_contract_template

router = APIRouter(
    prefix="/api/connector/v1",
    tags=["External Source Connector"],
    dependencies=[Depends(verify_connector_auth)],
)


@router.get("/info", response_model=ConnectorInfoResponse)
async def get_connector_info(auth_mode: str = Depends(verify_connector_auth)):
    """Handshake and capability discovery endpoint for downstream ETL consumers."""
    return await connector_service.get_connector_info(auth_mode=auth_mode)


@router.get("/contract/schema")
async def get_connector_contract_schema():
    """Serve pinned JSON Schema Draft 2020-12 (`manga-reader-package:2.0`)."""
    return build_reader_contract_template()


@router.get("/catalog", response_model=ConnectorCatalogResponse)
async def list_connector_catalog(
    search: Optional[str] = Query(None, description="Search title, alt title, slug, or pool_manga_id"),
    language: Optional[str] = Query(None, description="Filter by exported chapter language (e.g. en, vi)"),
    manga_status: Optional[str] = Query(None, alias="status", description="Filter by normalized publication status"),
    content_rating: Optional[str] = Query(None, description="Filter by normalized content rating"),
    updated_since: Optional[datetime] = Query(
        None, description="Return packages updated at or after this UTC ISO-8601 timestamp"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
):
    """List published, ETL-ready manga packages available for ingestion."""
    return await connector_service.list_ready_catalog(
        search=search,
        language=language,
        status=manga_status,
        content_rating=content_rating,
        updated_since=updated_since,
        page=page,
        page_size=page_size,
    )


@router.get("/packages/{pool_manga_id}")
async def fetch_connector_package(
    pool_manga_id: str,
    request: Request,
    include_chapters: bool = Query(
        True,
        description="When false, omits `chapters` property for metadata-only sync (ADR-012).",
    ),
):
    """Fetch strict `manga-reader-package` v2.0 JSON with raw payload SHA-256 and ETag."""
    artifact = await connector_service.export_package_bytes(
        pool_manga_id,
        include_chapters=include_chapters,
    )
    if artifact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "PACKAGE_NOT_FOUND",
                "message": f"Published ETL-ready package '{pool_manga_id}' not found.",
            },
        )

    etag_value = f'"{artifact.manifest_sha256 or artifact.payload_sha256}-r{artifact.pool_revision}"'
    if_none_match = (request.headers.get("if-none-match") or "").strip()
    common_headers = {
        "ETag": etag_value,
        "X-Contract-Name": READER_CONTRACT_NAME,
        "X-Contract-Version": READER_CONTRACT_VERSION,
        "X-Payload-SHA256": artifact.payload_sha256,
        "X-Manifest-SHA256": artifact.manifest_sha256,
        "X-Pool-Revision": str(artifact.pool_revision),
        "Cache-Control": "no-cache",
    }
    if if_none_match and if_none_match == etag_value:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=common_headers)

    return Response(
        content=artifact.raw_bytes,
        media_type="application/json; charset=utf-8",
        headers=common_headers,
    )


@router.get("/packages/{pool_manga_id}/chapters/{pool_chapter_id}")
async def fetch_connector_chapter(pool_manga_id: str, pool_chapter_id: str):
    """Fetch a single strict `ReaderChapter` v2.0 JSON object for targeted chapter sync."""
    res = await connector_service.export_single_chapter_bytes(pool_manga_id, pool_chapter_id)
    if res is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "CHAPTER_NOT_FOUND",
                "message": f"Chapter '{pool_chapter_id}' not found in published package '{pool_manga_id}'.",
            },
        )
    raw_bytes, payload_sha256, pages_rev = res
    return Response(
        content=raw_bytes,
        media_type="application/json; charset=utf-8",
        headers={
            "X-Contract-Name": READER_CONTRACT_NAME,
            "X-Contract-Version": READER_CONTRACT_VERSION,
            "X-Payload-SHA256": payload_sha256,
            "X-Pages-Revision": str(pages_rev),
        },
    )


@router.get("/media/{bucket}/{object_key:path}")
async def download_connector_media(bucket: str, object_key: str):
    """Zero-Copy pool-scoped media proxy streaming cover/page bytes over the connector tunnel."""
    try:
        artifact = await connector_service.authorize_and_fetch_media(bucket, object_key, head_only=False)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_MEDIA_REF", "message": str(exc)},
        ) from exc

    if artifact is None or artifact.data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "MEDIA_NOT_FOUND", "message": "Media object not found in published ETL pool."},
        )

    headers = {
        "Content-Length": str(artifact.content_length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Media-Bucket": artifact.bucket,
    }
    if artifact.etag:
        headers["ETag"] = f'"{artifact.etag}"'
    if artifact.sha256:
        headers["X-Content-SHA256"] = artifact.sha256

    return Response(content=artifact.data, media_type=artifact.content_type, headers=headers)


@router.head("/media/{bucket}/{object_key:path}")
async def head_connector_media(bucket: str, object_key: str):
    """Verify media availability and headers without transferring image bytes."""
    try:
        artifact = await connector_service.authorize_and_fetch_media(bucket, object_key, head_only=True)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_MEDIA_REF", "message": str(exc)},
        ) from exc

    if artifact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "MEDIA_NOT_FOUND", "message": "Media object not found in published ETL pool."},
        )

    headers = {
        "Content-Type": artifact.content_type,
        "Content-Length": str(artifact.content_length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Media-Bucket": artifact.bucket,
    }
    if artifact.etag:
        headers["ETag"] = f'"{artifact.etag}"'
    return Response(status_code=status.HTTP_200_OK, headers=headers)


@router.post(
    "/cdc/subscriptions",
    response_model=CdcSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_cdc_subscription(request: CdcSubscriptionCreateRequest):
    """Register or re-activate a per-manga CDC webhook subscription."""
    try:
        return await connector_service.create_or_update_subscription(request)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_CALLBACK_URL", "message": str(exc)},
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "PACKAGE_NOT_FOUND", "message": str(exc)},
        ) from exc


@router.get("/cdc/subscriptions", response_model=CdcSubscriptionListResponse)
async def list_cdc_subscriptions(
    pool_manga_id: Optional[str] = Query(None),
    sub_status: Optional[str] = Query(None, alias="status"),
    consumer_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    """List CDC webhook subscriptions."""
    return await connector_service.list_subscriptions(
        pool_manga_id=pool_manga_id,
        status=sub_status,
        consumer_id=consumer_id,
        limit=limit,
    )


@router.get("/cdc/subscriptions/{subscription_key}", response_model=CdcSubscriptionResponse)
async def get_cdc_subscription(subscription_key: str):
    """Inspect a single CDC webhook subscription."""
    sub = await connector_service.get_subscription(subscription_key)
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SUBSCRIPTION_NOT_FOUND", "message": "CDC subscription not found."},
        )
    return sub


@router.delete("/cdc/subscriptions/{subscription_key}", response_model=CdcSubscriptionResponse)
async def cancel_cdc_subscription(subscription_key: str):
    """Cancel an active CDC subscription so no further webhooks are pushed."""
    sub = await connector_service.cancel_subscription(subscription_key)
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SUBSCRIPTION_NOT_FOUND", "message": "CDC subscription not found."},
        )
    return sub


@router.post("/cdc/subscriptions/{subscription_key}/test", response_model=CdcDeliveryRecord)
async def test_cdc_subscription(subscription_key: str):
    """Send a signed `SUBSCRIPTION_PING` event to verify webhook connectivity and signature verification."""
    record = await connector_service.send_test_ping(subscription_key)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SUBSCRIPTION_NOT_FOUND", "message": "CDC subscription not found."},
        )
    return record


@router.get("/cdc/events", response_model=CdcEventFeedResponse)
async def poll_cdc_events(
    pool_manga_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None, description="UTC ISO-8601 timestamp lower bound"),
    after_event_id: Optional[str] = Query(None, description="Cursor eventId for incremental polling"),
    limit: int = Query(50, ge=1, le=200),
):
    """Pull/polling CDC event feed for consumers without a public webhook callback URL."""
    return await connector_service.list_cdc_events(
        pool_manga_id=pool_manga_id,
        event_type=event_type,
        since=since,
        after_event_id=after_event_id,
        limit=limit,
    )


@router.get("/cdc/deliveries", response_model=CdcDeliveryListResponse)
async def list_cdc_deliveries(
    subscription_key: Optional[str] = Query(None),
    pool_manga_id: Optional[str] = Query(None),
    delivery_status: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
):
    """Inspect recent outbound CDC webhook delivery attempts."""
    return await connector_service.list_deliveries(
        subscription_key=subscription_key,
        pool_manga_id=pool_manga_id,
        status=delivery_status,
        limit=limit,
    )


@router.post("/cdc/deliveries/{delivery_id}/retry", response_model=CdcDeliveryRecord)
async def retry_cdc_delivery(delivery_id: str):
    """Retry a failed CDC webhook delivery attempt."""
    record = await connector_service.retry_delivery(delivery_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DELIVERY_NOT_FOUND", "message": "Delivery record or associated event not found."},
        )
    return record
