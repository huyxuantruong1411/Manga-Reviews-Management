"""Domain service for the External Source Connector (ETL v2.0 + Zero-Copy Media Proxy + CDC).

Acts as the upstream third-party manga provider for downstream reader systems (such as
QL-DocTruyen), exposing:
1. Capability discovery & strict JSON Schema Draft 2020-12 (`manga-reader-package:2.0`).
2. External-safe ready-for-ETL catalog listing (published + is_etl_ready only).
3. Self-contained Package v2.0 and single-chapter exports with exact raw payload SHA-256.
4. Pool-scoped Zero-Copy MinIO media streaming proxy (single-tunnel ngrok friendly).
5. Per-manga CDC webhook subscriptions, durable event outbox, signed HTTP delivery with retry,
   and pull-based event polling fallback.
6. Local ngrok tunnel inspection for the Data Lake Pool Admin UI.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import httpx

from backend.config import settings
from backend.core.connector_security import (
    sign_webhook_payload,
    validate_callback_url,
    validate_safe_media_ref,
)
from backend.database.connection import get_pool_db
from backend.models.connector import (
    CdcDeliveryListResponse,
    CdcDeliveryRecord,
    CdcEventEnvelope,
    CdcEventFeedResponse,
    CdcEventType,
    CdcSubscriptionCreateRequest,
    CdcSubscriptionListResponse,
    CdcSubscriptionResponse,
    ConnectorCatalogItem,
    ConnectorCatalogResponse,
    ConnectorInfoResponse,
    ConnectorPoolSummary,
    ConnectorStatusResponse,
    NgrokTunnelInfo,
)
from backend.models.reader_contract import (
    READER_CONTRACT_NAME,
    READER_CONTRACT_VERSION,
)
from backend.services.minio_service import minio_service
from backend.services.reader_contract_service import (
    CONTRACT_SCHEMA_ID,
    build_reader_chapter,
    build_reader_package,
    build_reader_package_dict,
    normalize_content_rating,
    normalize_status,
)

logger = logging.getLogger(__name__)

CONNECTOR_API_PREFIX = "/api/connector/v1"

CONNECTOR_ENDPOINTS: Dict[str, str] = {
    "info": f"{CONNECTOR_API_PREFIX}/info",
    "contract_schema": f"{CONNECTOR_API_PREFIX}/contract/schema",
    "catalog": f"{CONNECTOR_API_PREFIX}/catalog",
    "package": f"{CONNECTOR_API_PREFIX}/packages/{{pool_manga_id}}",
    "chapter": f"{CONNECTOR_API_PREFIX}/packages/{{pool_manga_id}}/chapters/{{pool_chapter_id}}",
    "media": f"{CONNECTOR_API_PREFIX}/media/{{bucket}}/{{object_key}}",
    "cdc_subscriptions": f"{CONNECTOR_API_PREFIX}/cdc/subscriptions",
    "cdc_subscription_detail": f"{CONNECTOR_API_PREFIX}/cdc/subscriptions/{{subscription_key}}",
    "cdc_subscription_test": f"{CONNECTOR_API_PREFIX}/cdc/subscriptions/{{subscription_key}}/test",
    "cdc_events": f"{CONNECTOR_API_PREFIX}/cdc/events",
    "cdc_deliveries": f"{CONNECTOR_API_PREFIX}/cdc/deliveries",
    "cdc_delivery_retry": f"{CONNECTOR_API_PREFIX}/cdc/deliveries/{{delivery_id}}/retry",
}

CONNECTOR_CAPABILITIES: List[str] = [
    "catalog",
    "package_v2",
    "metadata_only_package",
    "chapter_fetch",
    "media_proxy",
    "cdc_webhook",
    "cdc_polling",
    "hmac_sha256_signatures",
]


@dataclass(frozen=True)
class ExportedPackageArtifact:
    raw_bytes: bytes
    payload_sha256: str
    manifest_sha256: str
    pool_revision: int
    exported_at: datetime


@dataclass(frozen=True)
class ConnectorMediaArtifact:
    bucket: str
    object_key: str
    content_type: str
    content_length: int
    etag: Optional[str]
    sha256: Optional[str]
    data: Optional[bytes] = None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    return None


def _canonical_json_bytes(obj: Any) -> bytes:
    """Serialize JSON deterministically (UTF-8, compact separators, sorted keys)."""
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _build_media_proxy_path(bucket: str, object_key: str) -> str:
    quoted_key = quote(object_key, safe="/")
    return f"{CONNECTOR_API_PREFIX}/media/{quote(bucket, safe='')}/{quoted_key}"


class ExternalConnectorService:
    def __init__(self) -> None:
        self._background_tasks: set[asyncio.Task[Any]] = set()

    def _get_pool_db(self):
        return get_pool_db()

    def _track_background_task(self, coro) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        task = loop.create_task(coro)
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    async def _compute_ready_pool_summary(self) -> ConnectorPoolSummary:
        pool_db = self._get_pool_db()
        ready_filter = {"pool_state": "published", "is_etl_ready": True}
        ready_mangas = await pool_db.pool_mangas.count_documents(ready_filter)
        pipeline = [
            {"$match": ready_filter},
            {
                "$group": {
                    "_id": None,
                    "ready_chapters": {"$sum": "$stats.total_chapters"},
                    "ready_pages": {"$sum": "$stats.total_pages"},
                    "total_size_bytes": {"$sum": "$stats.total_size_bytes"},
                }
            },
        ]
        agg = await pool_db.pool_mangas.aggregate(pipeline).to_list(length=1)
        if agg:
            return ConnectorPoolSummary(
                ready_mangas=ready_mangas,
                ready_chapters=int(agg[0].get("ready_chapters") or 0),
                ready_pages=int(agg[0].get("ready_pages") or 0),
                total_size_bytes=int(agg[0].get("total_size_bytes") or 0),
            )
        return ConnectorPoolSummary(ready_mangas=ready_mangas)

    async def get_connector_info(self, auth_mode: str = "api_key") -> ConnectorInfoResponse:
        summary = await self._compute_ready_pool_summary()
        return ConnectorInfoResponse(
            source_system=settings.connector_source_system,
            service_version="1.0.0",
            contract_name=READER_CONTRACT_NAME,
            contract_version=READER_CONTRACT_VERSION,
            schema_id=CONTRACT_SCHEMA_ID,
            auth_mode="local_open" if auth_mode == "local_open" else "api_key",
            capabilities=list(CONNECTOR_CAPABILITIES),
            endpoints=dict(CONNECTOR_ENDPOINTS),
            pool_stats=summary,
            server_time=_utc_now(),
        )

    async def list_ready_catalog(
        self,
        *,
        search: Optional[str] = None,
        language: Optional[str] = None,
        status: Optional[str] = None,
        content_rating: Optional[str] = None,
        updated_since: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 24,
    ) -> ConnectorCatalogResponse:
        """Return paginated external-safe catalog of published, ETL-ready manga packages."""
        pool_db = self._get_pool_db()
        query: Dict[str, Any] = {"pool_state": "published", "is_etl_ready": True}

        if search and search.strip():
            escaped = re.escape(search.strip())
            query["$or"] = [
                {"title": {"$regex": escaped, "$options": "i"}},
                {"alt_titles": {"$regex": escaped, "$options": "i"}},
                {"pool_manga_id": {"$regex": escaped, "$options": "i"}},
                {"slug": {"$regex": escaped, "$options": "i"}},
            ]
        if language and language.strip():
            query["stats.available_languages"] = language.strip().lower()
        if updated_since is not None:
            query["lineage.updated_at"] = {"$gte": _as_utc(updated_since)}

        cursor = pool_db.pool_mangas.find(query).sort("lineage.updated_at", -1)
        all_docs = await cursor.to_list(length=2000)

        norm_status_filter = normalize_status(status) if status else None
        norm_rating_filter = normalize_content_rating(content_rating) if content_rating else None

        catalog_items: List[ConnectorCatalogItem] = []
        for doc in all_docs:
            pkg = build_reader_package(doc, [])
            m = pkg.manga
            # Use stored pool stats for catalog preview so we don't scan every chapter document on list!
            raw_stats = doc.get("stats") or {}
            m.stats.chapter_count = max(0, int(raw_stats.get("total_chapters") or 0))
            m.stats.page_count = max(0, int(raw_stats.get("total_pages") or 0))
            m.stats.total_size_bytes = max(0, int(raw_stats.get("total_size_bytes") or 0))
            m.stats.languages = sorted(
                {str(lang).strip().lower() for lang in (raw_stats.get("available_languages") or []) if lang}
            )

            if norm_status_filter and m.status != norm_status_filter:
                continue
            if norm_rating_filter and m.content_rating != norm_rating_filter:
                continue

            cover_path = (
                _build_media_proxy_path(m.primary_cover.bucket, m.primary_cover.object_key)
                if m.primary_cover is not None
                else None
            )
            catalog_items.append(
                ConnectorCatalogItem(
                    pool_manga_id=m.pool_manga_id,
                    source_manga_id=m.source_manga_id,
                    slug=m.slug,
                    mangadex_id=m.mangadex_id,
                    title=m.title,
                    alt_titles=m.alt_titles,
                    status=m.status,
                    content_rating=m.content_rating,
                    publication_demographic=m.publication_demographic,
                    original_language=m.original_language,
                    year=m.year,
                    primary_cover=m.primary_cover,
                    primary_cover_media_path=cover_path,
                    stats=m.stats,
                    lineage=m.lineage,
                    package_url=f"{CONNECTOR_API_PREFIX}/packages/{m.pool_manga_id}",
                    cdc_supported=True,
                )
            )

        total = len(catalog_items)
        skip = max(0, (page - 1) * page_size)
        paged = catalog_items[skip : skip + page_size]

        return ConnectorCatalogResponse(
            source_system=settings.connector_source_system,
            contract_name=READER_CONTRACT_NAME,
            contract_version=READER_CONTRACT_VERSION,
            items=paged,
            total=total,
            page=page,
            page_size=page_size,
            has_next=(skip + page_size) < total,
        )

    async def export_package_bytes(
        self,
        pool_manga_id: str,
        *,
        include_chapters: bool = True,
    ) -> Optional[ExportedPackageArtifact]:
        """Export strict `manga-reader-package` v2.0 JSON bytes + exact raw SHA-256."""
        pool_db = self._get_pool_db()
        manga = await pool_db.pool_mangas.find_one(
            {
                "pool_manga_id": pool_manga_id,
                "pool_state": "published",
                "is_etl_ready": True,
            }
        )
        if not manga:
            return None

        chapters: List[Dict[str, Any]] = []
        cursor = pool_db.pool_chapters.find({"pool_manga_id": pool_manga_id}).sort(
            [("chapter_numeric", 1), ("language", 1)]
        )
        chapters = await cursor.to_list(length=5000)

        now = _utc_now()
        payload_dict = build_reader_package_dict(
            manga,
            chapters,
            include_chapters=include_chapters,
            exported_at=now,
        )
        raw_bytes = json.dumps(payload_dict, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        payload_sha256 = hashlib.sha256(raw_bytes).hexdigest()

        lineage = payload_dict["manga"]["lineage"]
        return ExportedPackageArtifact(
            raw_bytes=raw_bytes,
            payload_sha256=payload_sha256,
            manifest_sha256=str(lineage.get("manifest_sha256") or ""),
            pool_revision=int(lineage.get("pool_revision") or 1),
            exported_at=now,
        )

    async def export_single_chapter_bytes(
        self,
        pool_manga_id: str,
        pool_chapter_id: str,
    ) -> Optional[Tuple[bytes, str, int]]:
        """Export a single strict `ReaderChapter` v2.0 object for targeted CDC/resync fetches."""
        pool_db = self._get_pool_db()
        manga = await pool_db.pool_mangas.find_one(
            {
                "pool_manga_id": pool_manga_id,
                "pool_state": "published",
                "is_etl_ready": True,
            }
        )
        if not manga:
            return None

        ch_doc = await pool_db.pool_chapters.find_one(
            {"pool_manga_id": pool_manga_id, "pool_chapter_id": pool_chapter_id}
        )
        if not ch_doc:
            return None

        chapter = build_reader_chapter(ch_doc, pool_manga_id)
        if chapter is None:
            return None

        raw_bytes = json.dumps(chapter.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
        payload_sha256 = hashlib.sha256(raw_bytes).hexdigest()
        return raw_bytes, payload_sha256, chapter.pages_revision

    async def _is_media_authorized_in_pool(self, bucket: str, object_key: str) -> bool:
        """Verify `(bucket, object_key)` belongs to a published, ETL-ready pooled manga."""
        pool_db = self._get_pool_db()
        ready_manga = await pool_db.pool_mangas.find_one(
            {
                "pool_state": "published",
                "is_etl_ready": True,
                "$or": [
                    {"primary_cover.object_key": object_key},
                    {
                        "cover_arts": {
                            "$elemMatch": {
                                "object_key": object_key,
                                "included": {"$ne": False},
                            }
                        }
                    },
                ],
            }
        )
        if ready_manga:
            return True

        chapter_match = await pool_db.pool_chapters.find_one(
            {
                "included": {"$ne": False},
                "pages": {
                    "$elemMatch": {
                        "object_key": object_key,
                        "included": {"$ne": False},
                    }
                },
            }
        )
        if not chapter_match:
            return False

        parent_manga = await pool_db.pool_mangas.find_one(
            {
                "pool_manga_id": chapter_match.get("pool_manga_id"),
                "pool_state": "published",
                "is_etl_ready": True,
            }
        )
        return parent_manga is not None

    async def authorize_and_fetch_media(
        self,
        bucket: str,
        object_key: str,
        *,
        head_only: bool = False,
    ) -> Optional[ConnectorMediaArtifact]:
        """Authorize a Zero-Copy media pointer against the published pool and read/stat from MinIO."""
        clean_bucket, clean_key = validate_safe_media_ref(
            bucket,
            object_key,
            allowed_buckets={minio_service.bucket},
        )
        is_authorized = await self._is_media_authorized_in_pool(clean_bucket, clean_key)
        if not is_authorized:
            return None

        if head_only:
            try:
                stat = await asyncio.to_thread(minio_service.client.stat_object, clean_bucket, clean_key)
            except Exception as exc:
                logger.warning(f"MinIO stat_object failed for {clean_bucket}/{clean_key}: {exc}")
                return None
            return ConnectorMediaArtifact(
                bucket=clean_bucket,
                object_key=clean_key,
                content_type=getattr(stat, "content_type", None) or "application/octet-stream",
                content_length=int(getattr(stat, "size", 0) or 0),
                etag=getattr(stat, "etag", None),
                sha256=None,
                data=None,
            )

        try:
            data, content_type = await asyncio.to_thread(minio_service.get_object_stream, clean_key)
        except Exception as exc:
            logger.warning(f"MinIO get_object_stream failed for {clean_bucket}/{clean_key}: {exc}")
            return None

        sha256_hex = hashlib.sha256(data).hexdigest()
        etag_md5 = hashlib.md5(data).hexdigest()
        return ConnectorMediaArtifact(
            bucket=clean_bucket,
            object_key=clean_key,
            content_type=content_type or "application/octet-stream",
            content_length=len(data),
            etag=etag_md5,
            sha256=sha256_hex,
            data=data,
        )

    # ------------------------------------------------------------------
    # CDC Subscriptions
    # ------------------------------------------------------------------

    @staticmethod
    def _subscription_to_response(doc: Dict[str, Any]) -> CdcSubscriptionResponse:
        return CdcSubscriptionResponse(
            provider_subscription_key=str(doc["subscription_key"]),
            pool_manga_id=str(doc["pool_manga_id"]),
            consumer_id=str(doc.get("consumer_id") or "manga-reader"),
            callback_url=str(doc["callback_url"]),
            events=list(doc.get("events") or []),
            status=doc.get("status", "ACTIVE"),
            has_custom_secret=bool(doc.get("webhook_secret")),
            subscribed_at=_as_utc(doc.get("subscribed_at")) or _utc_now(),
            unsubscribed_at=_as_utc(doc.get("unsubscribed_at")),
            last_event_at=_as_utc(doc.get("last_event_at")),
            updated_at=_as_utc(doc.get("updated_at")) or _utc_now(),
        )

    async def create_or_update_subscription(
        self,
        request: CdcSubscriptionCreateRequest,
    ) -> CdcSubscriptionResponse:
        """Idempotently register or re-activate a per-manga CDC webhook subscription."""
        pool_db = self._get_pool_db()
        clean_callback = validate_callback_url(request.callback_url)

        manga = await pool_db.pool_mangas.find_one(
            {
                "pool_manga_id": request.pool_manga_id,
                "pool_state": "published",
                "is_etl_ready": True,
            }
        )
        if not manga:
            raise LookupError(f"Published ETL-ready manga '{request.pool_manga_id}' not found in pool")

        now = _utc_now()
        dedupe_filter = {
            "consumer_id": request.consumer_id,
            "pool_manga_id": request.pool_manga_id,
            "callback_url": clean_callback,
        }
        existing = await pool_db.pool_cdc_subscriptions.find_one(dedupe_filter)
        subscription_key = existing["subscription_key"] if existing else f"sub_{uuid.uuid4().hex[:16]}"
        subscribed_at = _as_utc(existing.get("subscribed_at")) if existing else now

        doc: Dict[str, Any] = {
            "subscription_key": subscription_key,
            "pool_manga_id": request.pool_manga_id,
            "consumer_id": request.consumer_id,
            "callback_url": clean_callback,
            "events": sorted(set(request.events)),
            "status": "ACTIVE",
            "subscribed_at": subscribed_at or now,
            "unsubscribed_at": None,
            "last_event_at": _as_utc(existing.get("last_event_at")) if existing else None,
            "updated_at": now,
        }
        if request.webhook_secret:
            doc["webhook_secret"] = request.webhook_secret
        elif existing and existing.get("webhook_secret"):
            doc["webhook_secret"] = existing["webhook_secret"]

        await pool_db.pool_cdc_subscriptions.update_one(
            dedupe_filter,
            {"$set": doc},
            upsert=True,
        )
        return self._subscription_to_response(doc)

    async def list_subscriptions(
        self,
        *,
        pool_manga_id: Optional[str] = None,
        status: Optional[str] = None,
        consumer_id: Optional[str] = None,
        limit: int = 100,
    ) -> CdcSubscriptionListResponse:
        pool_db = self._get_pool_db()
        query: Dict[str, Any] = {}
        if pool_manga_id:
            query["pool_manga_id"] = pool_manga_id
        if status:
            query["status"] = status.upper()
        if consumer_id:
            query["consumer_id"] = consumer_id

        cursor = pool_db.pool_cdc_subscriptions.find(query).sort("updated_at", -1)
        docs = await cursor.to_list(length=limit)
        items = [self._subscription_to_response(d) for d in docs]
        return CdcSubscriptionListResponse(items=items, total=len(items))

    async def get_subscription(self, subscription_key: str) -> Optional[CdcSubscriptionResponse]:
        pool_db = self._get_pool_db()
        doc = await pool_db.pool_cdc_subscriptions.find_one({"subscription_key": subscription_key})
        return self._subscription_to_response(doc) if doc else None

    async def cancel_subscription(self, subscription_key: str) -> Optional[CdcSubscriptionResponse]:
        pool_db = self._get_pool_db()
        doc = await pool_db.pool_cdc_subscriptions.find_one({"subscription_key": subscription_key})
        if not doc:
            return None

        now = _utc_now()
        unsubscribed_at = _as_utc(doc.get("unsubscribed_at")) or now
        await pool_db.pool_cdc_subscriptions.update_one(
            {"subscription_key": subscription_key},
            {
                "$set": {
                    "status": "CANCELLED",
                    "unsubscribed_at": unsubscribed_at,
                    "updated_at": now,
                }
            },
        )
        updated = dict(doc)
        updated["status"] = "CANCELLED"
        updated["unsubscribed_at"] = unsubscribed_at
        updated["updated_at"] = now
        return self._subscription_to_response(updated)

    # ------------------------------------------------------------------
    # CDC Event Outbox & Signed Webhook Delivery
    # ------------------------------------------------------------------

    async def emit_and_dispatch_event(
        self,
        *,
        event_type: CdcEventType,
        pool_manga_id: str,
        pool_revision: int,
        payload: Dict[str, Any],
        pool_chapter_id: Optional[str] = None,
        dispatch_sync: bool = False,
        target_subscription_key: Optional[str] = None,
    ) -> CdcEventEnvelope:
        """Persist a canonical CDC event envelope and dispatch signed HTTP webhooks to subscribers."""
        pool_db = self._get_pool_db()
        now = _utc_now()
        event_id = f"evt_{uuid.uuid4().hex}"
        payload_bytes = _canonical_json_bytes(payload)
        payload_sha256 = hashlib.sha256(payload_bytes).hexdigest()

        envelope = CdcEventEnvelope(
            eventId=event_id,
            eventType=event_type,
            occurredAt=now,
            contractName=READER_CONTRACT_NAME,
            contractVersion=READER_CONTRACT_VERSION,
            poolMangaId=pool_manga_id,
            poolChapterId=pool_chapter_id,
            poolRevision=max(1, int(pool_revision or 1)),
            payloadSha256=payload_sha256,
            payload=payload,
        )

        event_doc = {
            "event_id": event_id,
            "event_type": event_type,
            "occurred_at": now,
            "contract_name": READER_CONTRACT_NAME,
            "contract_version": READER_CONTRACT_VERSION,
            "pool_manga_id": pool_manga_id,
            "pool_chapter_id": pool_chapter_id,
            "pool_revision": envelope.poolRevision,
            "payload_sha256": payload_sha256,
            "payload": payload,
            "envelope_json": envelope.model_dump(mode="json"),
        }
        await pool_db.pool_cdc_events.insert_one(event_doc)

        if dispatch_sync:
            await self._dispatch_event_to_subscribers(envelope, target_subscription_key=target_subscription_key)
        else:
            self._track_background_task(
                self._dispatch_event_to_subscribers(envelope, target_subscription_key=target_subscription_key)
            )
        return envelope

    async def _dispatch_event_to_subscribers(
        self,
        envelope: CdcEventEnvelope,
        *,
        target_subscription_key: Optional[str] = None,
    ) -> List[CdcDeliveryRecord]:
        pool_db = self._get_pool_db()
        sub_query: Dict[str, Any] = {"pool_manga_id": envelope.poolMangaId, "status": "ACTIVE"}
        if target_subscription_key:
            sub_query = {"subscription_key": target_subscription_key}

        cursor = pool_db.pool_cdc_subscriptions.find(sub_query)
        subs = await cursor.to_list(length=200)

        results: List[CdcDeliveryRecord] = []
        raw_body = json.dumps(envelope.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )

        for sub in subs:
            subscribed_events = set(sub.get("events") or [])
            if (
                envelope.eventType != "SUBSCRIPTION_PING"
                and subscribed_events
                and envelope.eventType not in subscribed_events
            ):
                continue
            rec = await self._deliver_single_webhook(envelope, raw_body, sub)
            results.append(rec)

        return results

    async def _deliver_single_webhook(
        self,
        envelope: CdcEventEnvelope,
        raw_body: bytes,
        subscription: Dict[str, Any],
        *,
        existing_delivery_id: Optional[str] = None,
    ) -> CdcDeliveryRecord:
        pool_db = self._get_pool_db()
        now = _utc_now()
        delivery_id = existing_delivery_id or f"dlv_{uuid.uuid4().hex[:16]}"
        sub_key = str(subscription["subscription_key"])
        callback_url = str(subscription["callback_url"])
        signing_secret = str(subscription.get("webhook_secret") or settings.connector_webhook_secret or "")

        if not existing_delivery_id:
            await pool_db.pool_cdc_deliveries.insert_one(
                {
                    "delivery_id": delivery_id,
                    "event_id": envelope.eventId,
                    "event_type": envelope.eventType,
                    "subscription_key": sub_key,
                    "pool_manga_id": envelope.poolMangaId,
                    "callback_url": callback_url,
                    "status": "PENDING",
                    "attempt_count": 0,
                    "response_status": None,
                    "last_error": None,
                    "created_at": now,
                    "delivered_at": None,
                    "updated_at": now,
                }
            )

        max_attempts = max(1, int(settings.connector_webhook_max_retries or 3))
        timeout_s = max(1.0, float(settings.connector_webhook_timeout_s or 10.0))

        attempt = 0
        response_status: Optional[int] = None
        last_error: Optional[str] = None
        final_status = "FAILED"
        delivered_at: Optional[datetime] = None

        for attempt_idx in range(1, max_attempts + 1):
            attempt = attempt_idx
            headers = {
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "MangaDataLake-Connector/1.0",
                "X-Manga-Source-Event-Id": envelope.eventId,
                "X-Manga-Source-Event-Type": envelope.eventType,
                "X-Manga-Source-Delivery-Id": delivery_id,
                "X-Manga-Source-Contract": f"{READER_CONTRACT_NAME}:{READER_CONTRACT_VERSION}",
                "ngrok-skip-browser-warning": "true",
            }
            if signing_secret:
                headers.update(sign_webhook_payload(signing_secret, raw_body))

            try:
                async with httpx.AsyncClient(timeout=timeout_s) as client:
                    resp = await client.post(callback_url, content=raw_body, headers=headers)
                response_status = int(resp.status_code)
                if 200 <= response_status < 300:
                    final_status = "DELIVERED"
                    delivered_at = _utc_now()
                    last_error = None
                    break
                last_error = f"HTTP {response_status}: {(resp.text or '')[:300]}"
                if 400 <= response_status < 500 and response_status not in (408, 429):
                    # Non-retryable client error
                    break
            except Exception as exc:
                last_error = f"{type(exc).__name__}: {exc}"

            if attempt_idx < max_attempts:
                await asyncio.sleep(min(2.0 ** (attempt_idx - 1), 4.0))

        finished_at = _utc_now()
        update_fields: Dict[str, Any] = {
            "status": final_status,
            "attempt_count": attempt,
            "response_status": response_status,
            "last_error": last_error,
            "delivered_at": delivered_at,
            "updated_at": finished_at,
            "next_retry_at": None if final_status == "DELIVERED" else (finished_at + timedelta(minutes=5)),
        }
        await pool_db.pool_cdc_deliveries.update_one(
            {"delivery_id": delivery_id},
            {"$set": update_fields},
        )
        if final_status == "DELIVERED":
            await pool_db.pool_cdc_subscriptions.update_one(
                {"subscription_key": sub_key},
                {"$set": {"last_event_at": finished_at, "updated_at": finished_at}},
            )

        return CdcDeliveryRecord(
            delivery_id=delivery_id,
            event_id=envelope.eventId,
            event_type=envelope.eventType,
            subscription_key=sub_key,
            pool_manga_id=envelope.poolMangaId,
            callback_url=callback_url,
            status=final_status,  # type: ignore[arg-type]
            attempt_count=attempt,
            response_status=response_status,
            last_error=last_error,
            created_at=now,
            delivered_at=delivered_at,
            updated_at=finished_at,
        )

    async def send_test_ping(self, subscription_key: str) -> Optional[CdcDeliveryRecord]:
        """Emit a signed `SUBSCRIPTION_PING` event to verify connectivity & HMAC verification."""
        pool_db = self._get_pool_db()
        sub = await pool_db.pool_cdc_subscriptions.find_one({"subscription_key": subscription_key})
        if not sub:
            return None

        manga = await pool_db.pool_mangas.find_one({"pool_manga_id": sub["pool_manga_id"]})
        pool_rev = int((manga or {}).get("lineage", {}).get("pool_revision") or 1)
        envelope = await self.emit_and_dispatch_event(
            event_type="SUBSCRIPTION_PING",
            pool_manga_id=str(sub["pool_manga_id"]),
            pool_revision=pool_rev,
            payload={
                "ping": True,
                "source_system": settings.connector_source_system,
                "subscription_key": subscription_key,
            },
            dispatch_sync=False,
        )
        # Deliver synchronously for immediate caller feedback
        raw_body = json.dumps(envelope.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
        return await self._deliver_single_webhook(envelope, raw_body, sub)

    async def list_cdc_events(
        self,
        *,
        pool_manga_id: Optional[str] = None,
        event_type: Optional[str] = None,
        since: Optional[datetime] = None,
        after_event_id: Optional[str] = None,
        limit: int = 50,
    ) -> CdcEventFeedResponse:
        """Pull/polling CDC event feed (oldest-first when cursoring with `after_event_id`/`since`)."""
        pool_db = self._get_pool_db()
        query: Dict[str, Any] = {}
        if pool_manga_id:
            query["pool_manga_id"] = pool_manga_id
        if event_type:
            query["event_type"] = event_type.upper()

        sort_dir = -1
        if after_event_id:
            anchor = await pool_db.pool_cdc_events.find_one({"event_id": after_event_id})
            if anchor and anchor.get("occurred_at") is not None:
                query["occurred_at"] = {"$gt": anchor["occurred_at"]}
                sort_dir = 1
        elif since is not None:
            query["occurred_at"] = {"$gte": _as_utc(since)}
            sort_dir = 1

        cursor = pool_db.pool_cdc_events.find(query).sort("occurred_at", sort_dir)
        docs = await cursor.to_list(length=limit + 1)
        has_more = len(docs) > limit
        docs = docs[:limit]

        items: List[CdcEventEnvelope] = []
        for d in docs:
            env = d.get("envelope_json")
            if isinstance(env, dict):
                items.append(CdcEventEnvelope.model_validate(env))
            else:
                items.append(
                    CdcEventEnvelope(
                        eventId=str(d["event_id"]),
                        eventType=d["event_type"],
                        occurredAt=_as_utc(d.get("occurred_at")) or _utc_now(),
                        contractName=str(d.get("contract_name") or READER_CONTRACT_NAME),
                        contractVersion=str(d.get("contract_version") or READER_CONTRACT_VERSION),
                        poolMangaId=str(d["pool_manga_id"]),
                        poolChapterId=d.get("pool_chapter_id"),
                        poolRevision=int(d.get("pool_revision") or 1),
                        payloadSha256=str(d.get("payload_sha256") or ("0" * 64)),
                        payload=dict(d.get("payload") or {}),
                    )
                )

        next_cursor = items[-1].eventId if items else after_event_id
        return CdcEventFeedResponse(
            items=items,
            total=len(items),
            has_more=has_more,
            next_after_event_id=next_cursor,
        )

    async def list_deliveries(
        self,
        *,
        subscription_key: Optional[str] = None,
        pool_manga_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
    ) -> CdcDeliveryListResponse:
        pool_db = self._get_pool_db()
        query: Dict[str, Any] = {}
        if subscription_key:
            query["subscription_key"] = subscription_key
        if pool_manga_id:
            query["pool_manga_id"] = pool_manga_id
        if status:
            query["status"] = status.upper()

        cursor = pool_db.pool_cdc_deliveries.find(query).sort("created_at", -1)
        docs = await cursor.to_list(length=limit)
        items = [
            CdcDeliveryRecord(
                delivery_id=str(d["delivery_id"]),
                event_id=str(d["event_id"]),
                event_type=str(d["event_type"]),
                subscription_key=str(d["subscription_key"]),
                pool_manga_id=str(d["pool_manga_id"]),
                callback_url=str(d["callback_url"]),
                status=d.get("status", "PENDING"),
                attempt_count=int(d.get("attempt_count") or 0),
                response_status=d.get("response_status"),
                last_error=d.get("last_error"),
                created_at=_as_utc(d.get("created_at")) or _utc_now(),
                delivered_at=_as_utc(d.get("delivered_at")),
                updated_at=_as_utc(d.get("updated_at")) or _utc_now(),
            )
            for d in docs
        ]
        return CdcDeliveryListResponse(items=items, total=len(items))

    async def retry_delivery(self, delivery_id: str) -> Optional[CdcDeliveryRecord]:
        pool_db = self._get_pool_db()
        dlv = await pool_db.pool_cdc_deliveries.find_one({"delivery_id": delivery_id})
        if not dlv:
            return None

        event_doc = await pool_db.pool_cdc_events.find_one({"event_id": dlv["event_id"]})
        sub_doc = await pool_db.pool_cdc_subscriptions.find_one({"subscription_key": dlv["subscription_key"]})
        if not event_doc or not sub_doc:
            return None

        envelope = CdcEventEnvelope.model_validate(event_doc["envelope_json"])
        raw_body = json.dumps(envelope.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
        return await self._deliver_single_webhook(envelope, raw_body, sub_doc, existing_delivery_id=delivery_id)

    # ------------------------------------------------------------------
    # Pool Mutation Event Hooks (called by DatalakePoolService)
    # ------------------------------------------------------------------

    async def emit_pool_sync_events(
        self,
        *,
        pool_manga_doc: Dict[str, Any],
        new_chapters: List[Dict[str, Any]],
        previous_chapters: List[Dict[str, Any]],
        is_new_manga: bool,
    ) -> None:
        """Emit fine-grained CDC events after a pool publish or re-sync (failure-isolated)."""
        if pool_manga_doc.get("pool_state") != "published" or not pool_manga_doc.get("is_etl_ready"):
            return

        try:
            pool_manga_id = str(pool_manga_doc["pool_manga_id"])
            pool_revision = int(pool_manga_doc.get("lineage", {}).get("pool_revision") or 1)
            pkg = build_reader_package(pool_manga_doc, new_chapters)
            lineage_dict = pkg.manga.lineage.model_dump(mode="json")
            stats_dict = pkg.manga.stats.model_dump(mode="json")

            prev_by_id = {str(c["pool_chapter_id"]): c for c in previous_chapters if c.get("pool_chapter_id")}
            new_by_id = {c.pool_chapter_id: c for c in pkg.chapters}

            # 1. Always emit metadata-only update (omits chapters per ADR-012)
            meta_payload = build_reader_package_dict(pool_manga_doc, new_chapters, include_chapters=False)
            await self.emit_and_dispatch_event(
                event_type="MANGA_METADATA_UPDATED",
                pool_manga_id=pool_manga_id,
                pool_revision=pool_revision,
                payload=meta_payload,
            )

            # 2. Emit per-chapter CREATED / UPDATED / DELETED on subsequent syncs
            if not is_new_manga:
                for ch_id, ch_obj in new_by_id.items():
                    old = prev_by_id.get(ch_id)
                    if old is None:
                        await self.emit_and_dispatch_event(
                            event_type="CHAPTER_CREATED",
                            pool_manga_id=pool_manga_id,
                            pool_chapter_id=ch_id,
                            pool_revision=pool_revision,
                            payload={
                                "chapter": ch_obj.model_dump(mode="json"),
                                "manga_lineage": lineage_dict,
                                "manga_stats": stats_dict,
                            },
                        )
                    elif (
                        str(old.get("manifest_sha256") or "") != ch_obj.manifest_sha256
                        or int(old.get("pages_revision") or 1) != ch_obj.pages_revision
                    ):
                        await self.emit_and_dispatch_event(
                            event_type="CHAPTER_UPDATED",
                            pool_manga_id=pool_manga_id,
                            pool_chapter_id=ch_id,
                            pool_revision=pool_revision,
                            payload={
                                "chapter": ch_obj.model_dump(mode="json"),
                                "manga_lineage": lineage_dict,
                                "manga_stats": stats_dict,
                            },
                        )

                for old_id in prev_by_id:
                    if old_id not in new_by_id:
                        await self.emit_and_dispatch_event(
                            event_type="CHAPTER_DELETED",
                            pool_manga_id=pool_manga_id,
                            pool_chapter_id=old_id,
                            pool_revision=pool_revision,
                            payload={
                                "pool_manga_id": pool_manga_id,
                                "pool_chapter_id": old_id,
                                "reason": "removed_in_pool_resync",
                                "manga_lineage": lineage_dict,
                                "manga_stats": stats_dict,
                            },
                        )
        except Exception as exc:
            logger.warning(f"CDC emit_pool_sync_events failed (non-blocking): {exc}")

    async def emit_manga_metadata_updated(self, pool_manga_id: str) -> None:
        """Emit metadata-only CDC event after pool manga edit."""
        try:
            pool_db = self._get_pool_db()
            manga = await pool_db.pool_mangas.find_one({"pool_manga_id": pool_manga_id})
            if not manga or manga.get("pool_state") != "published" or not manga.get("is_etl_ready"):
                return
            chapters = await pool_db.pool_chapters.find({"pool_manga_id": pool_manga_id}).to_list(length=5000)
            payload = build_reader_package_dict(manga, chapters, include_chapters=False)
            pool_rev = int(manga.get("lineage", {}).get("pool_revision") or 1)
            await self.emit_and_dispatch_event(
                event_type="MANGA_METADATA_UPDATED",
                pool_manga_id=pool_manga_id,
                pool_revision=pool_rev,
                payload=payload,
            )
        except Exception as exc:
            logger.warning(f"CDC emit_manga_metadata_updated failed (non-blocking): {exc}")

    async def emit_chapter_updated(self, pool_manga_id: str, pool_chapter_id: str) -> None:
        """Emit CHAPTER_UPDATED or CHAPTER_DELETED (if included flipped to False)."""
        try:
            pool_db = self._get_pool_db()
            manga = await pool_db.pool_mangas.find_one({"pool_manga_id": pool_manga_id})
            if not manga or manga.get("pool_state") != "published" or not manga.get("is_etl_ready"):
                return
            ch_doc = await pool_db.pool_chapters.find_one({"pool_chapter_id": pool_chapter_id})
            chapters = await pool_db.pool_chapters.find({"pool_manga_id": pool_manga_id}).to_list(length=5000)
            pkg = build_reader_package(manga, chapters)
            pool_rev = pkg.manga.lineage.pool_revision
            lineage_dict = pkg.manga.lineage.model_dump(mode="json")
            stats_dict = pkg.manga.stats.model_dump(mode="json")

            chapter_v2 = build_reader_chapter(ch_doc, pool_manga_id) if ch_doc else None
            if chapter_v2 is None:
                await self.emit_and_dispatch_event(
                    event_type="CHAPTER_DELETED",
                    pool_manga_id=pool_manga_id,
                    pool_chapter_id=pool_chapter_id,
                    pool_revision=pool_rev,
                    payload={
                        "pool_manga_id": pool_manga_id,
                        "pool_chapter_id": pool_chapter_id,
                        "reason": "excluded_or_empty_chapter",
                        "manga_lineage": lineage_dict,
                        "manga_stats": stats_dict,
                    },
                )
            else:
                await self.emit_and_dispatch_event(
                    event_type="CHAPTER_UPDATED",
                    pool_manga_id=pool_manga_id,
                    pool_chapter_id=pool_chapter_id,
                    pool_revision=pool_rev,
                    payload={
                        "chapter": chapter_v2.model_dump(mode="json"),
                        "manga_lineage": lineage_dict,
                        "manga_stats": stats_dict,
                    },
                )
        except Exception as exc:
            logger.warning(f"CDC emit_chapter_updated failed (non-blocking): {exc}")

    async def emit_chapter_deleted(self, pool_manga_id: str, pool_chapter_id: str) -> None:
        """Emit explicit CHAPTER_DELETED event (per 05_PACKAGE_V2_ETL_CDC.md §7.3)."""
        try:
            pool_db = self._get_pool_db()
            manga = await pool_db.pool_mangas.find_one({"pool_manga_id": pool_manga_id})
            if not manga:
                return
            chapters = await pool_db.pool_chapters.find({"pool_manga_id": pool_manga_id}).to_list(length=5000)
            pkg = build_reader_package(manga, chapters)
            await self.emit_and_dispatch_event(
                event_type="CHAPTER_DELETED",
                pool_manga_id=pool_manga_id,
                pool_chapter_id=pool_chapter_id,
                pool_revision=pkg.manga.lineage.pool_revision,
                payload={
                    "pool_manga_id": pool_manga_id,
                    "pool_chapter_id": pool_chapter_id,
                    "reason": "deleted_from_pool",
                    "manga_lineage": pkg.manga.lineage.model_dump(mode="json"),
                    "manga_stats": pkg.manga.stats.model_dump(mode="json"),
                },
            )
        except Exception as exc:
            logger.warning(f"CDC emit_chapter_deleted failed (non-blocking): {exc}")

    async def emit_manga_removed(self, pool_manga_id: str, pool_revision: int = 1) -> None:
        """Emit MANGA_REMOVED notification when a manga is removed from the pool."""
        try:
            await self.emit_and_dispatch_event(
                event_type="MANGA_REMOVED",
                pool_manga_id=pool_manga_id,
                pool_revision=max(1, pool_revision),
                payload={
                    "pool_manga_id": pool_manga_id,
                    "reason": "removed_from_pool",
                },
            )
        except Exception as exc:
            logger.warning(f"CDC emit_manga_removed failed (non-blocking): {exc}")

    # ------------------------------------------------------------------
    # ngrok Local Inspection & Admin Status
    # ------------------------------------------------------------------

    async def detect_ngrok_tunnels(self) -> List[NgrokTunnelInfo]:
        """Query local ngrok inspector API (default http://127.0.0.1:4040/api/tunnels) safely."""
        api_url = (settings.connector_ngrok_api_url or "").strip()
        if not api_url:
            return []
        try:
            async with httpx.AsyncClient(timeout=0.8) as client:
                resp = await client.get(api_url)
            if resp.status_code != 200:
                return []
            data = resp.json()
            tunnels: List[NgrokTunnelInfo] = []
            for item in data.get("tunnels") or []:
                pub_url = str(item.get("public_url") or "").strip()
                if not pub_url:
                    continue
                tunnels.append(
                    NgrokTunnelInfo(
                        name=str(item.get("name") or "command_line"),
                        proto=str(item.get("proto") or "https"),
                        public_url=pub_url,
                        addr=str((item.get("config") or {}).get("addr") or ""),
                    )
                )
            return tunnels
        except Exception:
            return []

    async def get_admin_connector_status(self) -> ConnectorStatusResponse:
        """Return safe non-secret operational snapshot for the local Data Lake Pool Admin UI."""
        pool_db = self._get_pool_db()
        summary = await self._compute_ready_pool_summary()
        tunnels = await self.detect_ngrok_tunnels()

        https_tunnel = next((t.public_url for t in tunnels if t.proto == "https"), None)
        first_tunnel = tunnels[0].public_url if tunnels else None
        configured_url = (settings.connector_public_base_url or "").strip().rstrip("/") or None
        active_url = (https_tunnel or first_tunnel or configured_url or "").rstrip("/") or None

        active_subs = await pool_db.pool_cdc_subscriptions.count_documents({"status": "ACTIVE"})
        total_events = await pool_db.pool_cdc_events.count_documents({})
        failed_deliveries = await pool_db.pool_cdc_deliveries.count_documents({"status": "FAILED"})

        return ConnectorStatusResponse(
            connector_enabled=settings.connector_enabled,
            source_system=settings.connector_source_system,
            contract_name=READER_CONTRACT_NAME,
            contract_version=READER_CONTRACT_VERSION,
            schema_id=CONTRACT_SCHEMA_ID,
            dedicated_port=settings.connector_port,
            api_key_configured=bool((settings.connector_api_key or "").strip()),
            webhook_secret_configured=bool((settings.connector_webhook_secret or "").strip()),
            tunnel_path_guard_enabled=settings.connector_enforce_tunnel_path_guard,
            allow_unauthenticated_local=settings.connector_allow_unauthenticated_local,
            configured_public_base_url=configured_url,
            active_public_base_url=active_url,
            ngrok_active=len(tunnels) > 0,
            ngrok_tunnels=tunnels,
            pool_stats=summary,
            active_subscriptions_count=active_subs,
            total_events_count=total_events,
            failed_deliveries_count=failed_deliveries,
            endpoints=dict(CONNECTOR_ENDPOINTS),
        )


connector_service = ExternalConnectorService()
