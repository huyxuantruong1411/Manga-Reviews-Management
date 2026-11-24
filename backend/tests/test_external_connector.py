"""TDD test suite for External Source Connector API (ETL v2.0 + Media Proxy + CDC + Tunnel Security)."""

from __future__ import annotations

import hashlib
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from starlette.testclient import TestClient

from backend.models.reader_contract import ReaderPackage


def _sample_published_manga(
    pool_manga_id: str = "pm_live001", is_etl_ready: bool = True, pool_state: str = "published"
):
    # Intentionally naive datetimes (as returned by Motor/MongoDB) to verify RFC 3339 UTC serialization!
    naive_ts = datetime(2026, 11, 14, 10, 24, 16)
    return {
        "_id": "65f000000000000000000099",
        "pool_manga_id": pool_manga_id,
        "source_manga_id": "65e000000000000000000099",
        "mangadex_id": "a1c7c817-4e59-43b7-9365-09675a149a6f",
        "slug": "frieren-beyond-journeys-end",
        "title": "Frieren: Beyond Journey's End",
        "alt_titles": ["Sousou no Frieren"],
        "description": "An elf mage journeys after the hero's party disbands.",
        "author": "Kanehito Yamada",
        "artist": "Tsukasa Abe",
        "creators": [
            {
                "creator_id": "11111111-1111-4111-8111-111111111111",
                "slug": "kanehito-yamada",
                "name": "Kanehito Yamada",
                "role": "author",
                "biography": {"en": "Manga writer"},
                "links": {},
            },
            {
                "creator_id": "22222222-2222-4222-8222-222222222222",
                "slug": "tsukasa-abe",
                "name": "Tsukasa Abe",
                "role": "artist",
                "biography": {"en": "Manga illustrator"},
                "links": {},
            },
        ],
        "year": "2020",
        "status": "ongoing",
        "content_rating": "safe",
        "publication_demographic": "shounen",
        "original_language": "ja",
        "tags": [
            {
                "source_tag_id": "tag_fantasy",
                "name": {"en": "Fantasy", "vi": "Giả tưởng"},
                "group": "genre",
            }
        ],
        "links": [{"title": "MangaDex", "url": "https://mangadex.org/title/a1c7c817-4e59-43b7-9365-09675a149a6f"}],
        "primary_cover": {
            "minio_bucket": "manga-library",
            "object_key": "covers/frieren/main.webp",
            "content_type": "image/webp",
            "file_size": 4096,
        },
        "cover_arts": [
            {
                "cover_id": "cov_1",
                "volume": "1",
                "locale": "ja",
                "minio_bucket": "manga-library",
                "object_key": "covers/frieren/v1.webp",
                "included": True,
            }
        ],
        "pool_state": pool_state,
        "is_etl_ready": is_etl_ready,
        "stats": {
            "total_chapters": 1,
            "total_pages": 2,
            "total_size_bytes": 3000,
            "available_languages": ["en"],
        },
        "lineage": {
            "source_metadata_revision": 2,
            "pool_revision": 4,
            "manifest_sha256": "a" * 64,
            "published_at": naive_ts,
            "updated_at": naive_ts,
        },
    }


def _sample_published_chapters(pool_manga_id: str = "pm_live001"):
    naive_ts = datetime(2026, 11, 14, 11, 0, 0)
    return [
        {
            "_id": "65f000000000000000000101",
            "pool_chapter_id": "pch_live001",
            "pool_manga_id": pool_manga_id,
            "source_manga_id": "65e000000000000000000099",
            "source_chapter_id": "65e000000000000000000201",
            "chapter_number": "1",
            "chapter_numeric": 1.0,
            "volume": "1",
            "title": "The Journey's End",
            "language": "en",
            "scanlation_group": "Kirei Cake",
            "publish_at": naive_ts,
            "source": "mangadex",
            "source_id": "ch-dex-001",
            "pages": [
                {
                    "page_uid": "pg_001",
                    "page_number": 1,
                    "filename": "001.webp",
                    "minio_bucket": "manga-library",
                    "object_key": "chapters/frieren/ch1/001.webp",
                    "file_size": 1000,
                    "width": 1080,
                    "height": 1620,
                    "content_type": "image/webp",
                    "md5_hash": "d41d8cd98f00b204e9800998ecf8427e",
                    "sha256": "b" * 64,
                    "included": True,
                },
                {
                    "page_uid": "pg_002",
                    "page_number": 2,
                    "filename": "002.webp",
                    "minio_bucket": "manga-library",
                    "object_key": "chapters/frieren/ch1/002.webp",
                    "file_size": 2000,
                    "width": 1080,
                    "height": 1620,
                    "content_type": "image/webp",
                    "md5_hash": "098f6bcd4621d373cade4e832627b4f6",
                    "sha256": "c" * 64,
                    "included": True,
                },
            ],
            "page_count": 2,
            "total_size_bytes": 3000,
            "pages_revision": 1,
            "manifest_sha256": "d" * 64,
            "included": True,
            "updated_at": naive_ts,
        }
    ]


class TestContractRfc3339AndMetadataOnly(unittest.TestCase):
    """Verify RFC 3339 timezone enforcement and ADR-012 metadata-only serialization."""

    def test_naive_mongo_datetimes_are_normalized_to_utc_rfc3339(self):
        from backend.services.reader_contract_service import build_reader_package

        pkg = build_reader_package(_sample_published_manga(), _sample_published_chapters())
        dumped = pkg.model_dump(mode="json")

        # Every datetime field must carry explicit UTC 'Z' (or +00:00) for strict Draft 2020-12 date-time validation
        self.assertTrue(dumped["exported_at"].endswith("Z"))
        self.assertTrue(dumped["manga"]["lineage"]["published_at"].endswith("Z"))
        self.assertTrue(dumped["manga"]["lineage"]["updated_at"].endswith("Z"))
        self.assertTrue(dumped["chapters"][0]["publish_at"].endswith("Z"))
        self.assertTrue(dumped["chapters"][0]["updated_at"].endswith("Z"))

    def test_metadata_only_package_omits_chapters_key_per_adr_012(self):
        from backend.services.reader_contract_service import build_reader_package_dict

        payload = build_reader_package_dict(
            _sample_published_manga(),
            _sample_published_chapters(),
            include_chapters=False,
        )
        self.assertEqual(payload["contract_name"], "manga-reader-package")
        self.assertEqual(payload["contract_version"], "2.0")
        self.assertIn("manga", payload)
        # Per ADR-012: omitting chapters prevents reader from interpreting empty array as chapter wipe
        self.assertNotIn("chapters", payload)


class TestConnectorSecurityPrimitives(unittest.TestCase):
    """Verify webhook HMAC signing/verification and safe media reference checks."""

    def test_hmac_webhook_signature_roundtrip_and_tamper_detection(self):
        from backend.core.connector_security import sign_webhook_payload, verify_webhook_signature

        secret = "test-webhook-secret-key-123"
        raw_body = b'{"eventId":"evt_1","eventType":"CHAPTER_CREATED"}'
        ts = 1763640000

        headers = sign_webhook_payload(secret, raw_body, timestamp=ts)
        self.assertIn("X-Manga-Source-Signature", headers)
        self.assertIn("X-Webhook-Signature-256", headers)
        self.assertEqual(headers["X-Manga-Source-Timestamp"], str(ts))

        self.assertTrue(
            verify_webhook_signature(
                secret=secret,
                raw_body=raw_body,
                signature_header=headers["X-Manga-Source-Signature"],
                timestamp_header=headers["X-Manga-Source-Timestamp"],
            )
        )
        self.assertFalse(
            verify_webhook_signature(
                secret=secret,
                raw_body=b'{"eventId":"evt_1","eventType":"TAMPERED"}',
                signature_header=headers["X-Manga-Source-Signature"],
                timestamp_header=headers["X-Manga-Source-Timestamp"],
            )
        )
        self.assertFalse(
            verify_webhook_signature(
                secret="wrong-secret",
                raw_body=raw_body,
                signature_header=headers["X-Manga-Source-Signature"],
                timestamp_header=headers["X-Manga-Source-Timestamp"],
            )
        )

    def test_safe_media_ref_blocks_traversal_and_invalid_bucket(self):
        from backend.core.connector_security import validate_safe_media_ref

        self.assertEqual(
            validate_safe_media_ref(
                "manga-library", "chapters/frieren/ch1/001.webp", allowed_buckets={"manga-library"}
            ),
            ("manga-library", "chapters/frieren/ch1/001.webp"),
        )
        for bad_bucket, bad_key in [
            ("other-bucket", "covers/a.jpg"),
            ("manga-library", "../etc/passwd"),
            ("manga-library", "chapters/../../secret.txt"),
            ("manga-library", "/leading/slash.jpg"),
            ("manga-library", "chapters\\windows\\path.jpg"),
            ("manga-library", "chapters/null\x00byte.jpg"),
            ("manga-library", ""),
        ]:
            with self.assertRaises(ValueError):
                validate_safe_media_ref(bad_bucket, bad_key, allowed_buckets={"manga-library"})


class TestConnectorService(unittest.IsolatedAsyncioTestCase):
    """Unit tests for ExternalConnectorService catalog, package export, media proxy, and CDC."""

    def setUp(self):
        from backend.services.connector_service import ExternalConnectorService

        self.service = ExternalConnectorService()
        self.pool_db = MagicMock()
        self.service._get_pool_db = MagicMock(return_value=self.pool_db)

    async def test_export_package_bytes_enforces_published_and_etl_ready(self):
        self.pool_db.pool_mangas.find_one = AsyncMock(return_value=None)
        res = await self.service.export_package_bytes("pm_unpublished")
        self.assertIsNone(res)

        # Verify query strictly filtered by pool_state=published and is_etl_ready=True
        query_arg = self.pool_db.pool_mangas.find_one.call_args[0][0]
        self.assertEqual(query_arg["pool_state"], "published")
        self.assertIs(query_arg["is_etl_ready"], True)

    async def test_export_package_bytes_computes_exact_payload_sha256(self):
        manga_doc = _sample_published_manga()
        chapters_docs = _sample_published_chapters()

        self.pool_db.pool_mangas.find_one = AsyncMock(return_value=manga_doc)
        cursor = MagicMock()
        cursor.sort = MagicMock(return_value=cursor)
        cursor.to_list = AsyncMock(return_value=chapters_docs)
        self.pool_db.pool_chapters.find = MagicMock(return_value=cursor)

        exported = await self.service.export_package_bytes("pm_live001", include_chapters=True)
        self.assertIsNotNone(exported)
        expected_sha = hashlib.sha256(exported.raw_bytes).hexdigest()
        self.assertEqual(exported.payload_sha256, expected_sha)
        self.assertEqual(exported.pool_revision, 4)

        parsed = json.loads(exported.raw_bytes.decode("utf-8"))
        pkg = ReaderPackage.model_validate(parsed)
        self.assertEqual(pkg.manga.pool_manga_id, "pm_live001")
        self.assertEqual(len(pkg.chapters), 1)
        self.assertTrue(parsed["manga"]["lineage"]["updated_at"].endswith("Z"))

    async def test_media_proxy_rejects_unreferenced_minio_object_key(self):
        self.pool_db.pool_mangas.find_one = AsyncMock(return_value=None)
        self.pool_db.pool_chapters.find_one = AsyncMock(return_value=None)

        result = await self.service.authorize_and_fetch_media("manga-library", "private/secret.png")
        self.assertIsNone(result)

    async def test_media_proxy_streams_pool_referenced_page_with_sha256(self):
        page_bytes = b"WEBP_FAKE_IMAGE_BYTES"
        expected_sha = hashlib.sha256(page_bytes).hexdigest()

        self.pool_db.pool_mangas.find_one = AsyncMock(return_value={"pool_manga_id": "pm_live001"})
        self.pool_db.pool_chapters.find_one = AsyncMock(return_value={"pool_manga_id": "pm_live001"})

        with patch("backend.services.connector_service.minio_service") as mock_minio:
            mock_minio.bucket = "manga-library"
            mock_minio.get_object_stream.return_value = (page_bytes, "image/webp")
            media = await self.service.authorize_and_fetch_media(
                "manga-library", "chapters/frieren/ch1/001.webp", head_only=False
            )

        self.assertIsNotNone(media)
        self.assertEqual(media.data, page_bytes)
        self.assertEqual(media.content_type, "image/webp")
        self.assertEqual(media.content_length, len(page_bytes))
        self.assertEqual(media.sha256, expected_sha)

    async def test_cdc_subscription_create_idempotent_and_cancel(self):
        from backend.models.connector import CdcSubscriptionCreateRequest

        manga_doc = _sample_published_manga()
        self.pool_db.pool_mangas.find_one = AsyncMock(return_value=manga_doc)
        self.pool_db.pool_cdc_subscriptions.find_one = AsyncMock(return_value=None)
        self.pool_db.pool_cdc_subscriptions.update_one = AsyncMock()

        req = CdcSubscriptionCreateRequest(
            pool_manga_id="pm_live001",
            callback_url="https://reader.example.com/api/v1/webhooks/cdc",
            consumer_id="ql-doctruyen",
        )
        sub = await self.service.create_or_update_subscription(req)
        self.assertTrue(sub.provider_subscription_key.startswith("sub_"))
        self.assertEqual(sub.status, "ACTIVE")
        self.assertEqual(sub.pool_manga_id, "pm_live001")
        self.pool_db.pool_cdc_subscriptions.update_one.assert_awaited_once()

        # Now cancel
        self.pool_db.pool_cdc_subscriptions.find_one = AsyncMock(
            return_value={
                "subscription_key": sub.provider_subscription_key,
                "pool_manga_id": "pm_live001",
                "consumer_id": "ql-doctruyen",
                "callback_url": "https://reader.example.com/api/v1/webhooks/cdc",
                "events": sub.events,
                "status": "ACTIVE",
                "subscribed_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        )
        cancelled = await self.service.cancel_subscription(sub.provider_subscription_key)
        self.assertIsNotNone(cancelled)
        self.assertEqual(cancelled.status, "CANCELLED")
        self.assertIsNotNone(cancelled.unsubscribed_at)

    async def test_emit_cdc_event_persists_canonical_envelope_and_dispatches_signed_webhook(self):
        self.pool_db.pool_cdc_events.insert_one = AsyncMock()

        sub_doc = {
            "subscription_key": "sub_abc123",
            "pool_manga_id": "pm_live001",
            "consumer_id": "ql-doctruyen",
            "callback_url": "https://reader.example.com/api/v1/webhooks/cdc",
            "webhook_secret": "shared-secret-xyz",
            "events": ["CHAPTER_CREATED", "CHAPTER_UPDATED", "CHAPTER_DELETED", "MANGA_METADATA_UPDATED"],
            "status": "ACTIVE",
        }
        sub_cursor = MagicMock()
        sub_cursor.to_list = AsyncMock(return_value=[sub_doc])
        self.pool_db.pool_cdc_subscriptions.find = MagicMock(return_value=sub_cursor)
        self.pool_db.pool_cdc_subscriptions.update_one = AsyncMock()
        self.pool_db.pool_cdc_deliveries.insert_one = AsyncMock()
        self.pool_db.pool_cdc_deliveries.update_one = AsyncMock()

        captured_request = {}

        class FakeResponse:
            status_code = 202
            text = '{"accepted":true}'

        class FakeAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def post(self, url, content=None, headers=None):
                captured_request["url"] = url
                captured_request["content"] = content
                captured_request["headers"] = headers
                return FakeResponse()

        with patch("backend.services.connector_service.httpx.AsyncClient", FakeAsyncClient):
            event = await self.service.emit_and_dispatch_event(
                event_type="CHAPTER_CREATED",
                pool_manga_id="pm_live001",
                pool_chapter_id="pch_live001",
                pool_revision=5,
                payload={"chapter": {"pool_chapter_id": "pch_live001"}},
                dispatch_sync=True,
            )

        self.assertTrue(event.eventId.startswith("evt_"))
        self.assertEqual(event.contractName, "manga-reader-package")
        self.assertEqual(event.contractVersion, "2.0")
        self.assertEqual(event.poolMangaId, "pm_live001")
        self.assertEqual(event.poolChapterId, "pch_live001")
        self.assertEqual(event.poolRevision, 5)
        self.assertEqual(captured_request["url"], "https://reader.example.com/api/v1/webhooks/cdc")
        self.assertIn("X-Manga-Source-Signature", captured_request["headers"])
        self.assertEqual(captured_request["headers"]["X-Manga-Source-Event-Id"], event.eventId)


class TestStableChapterIdsOnResync(unittest.IsolatedAsyncioTestCase):
    """Ensure re-publishing an existing manga preserves pool_chapter_id for idempotent Reader ETL/CDC."""

    async def test_resync_preserves_existing_pool_chapter_id(self):
        from bson import ObjectId

        from backend.models.datalake_pool import PublishToPoolRequest
        from backend.services.datalake_pool_service import DatalakePoolService

        manga_id = str(ObjectId())
        chapter_id = str(ObjectId())
        existing_pool_chapter_id = "pch_stable999999"

        review_db = MagicMock()
        pool_db = MagicMock()
        service = DatalakePoolService()
        service._get_source_db = MagicMock(return_value=review_db)
        service._get_pool_db = MagicMock(return_value=pool_db)

        class AsyncCursor:
            def __init__(self, docs):
                self.docs = docs

            def __aiter__(self):
                async def gen():
                    for d in self.docs:
                        yield d

                return gen()

            async def to_list(self, length=None):
                return list(self.docs)

        review_db.mangas.find_one = AsyncMock(
            return_value={
                "_id": ObjectId(manga_id),
                "title": "Stable Manga",
                "status": "ongoing",
                "tag_ids": [],
            }
        )
        review_db.chapters.find = MagicMock(
            return_value=AsyncCursor(
                [
                    {
                        "_id": ObjectId(chapter_id),
                        "manga_id": manga_id,
                        "chapter_number": "1",
                        "chapter_numeric": 1.0,
                        "language": "en",
                        "page_count": 1,
                        "pages": [
                            {
                                "page_uid": "pg_1",
                                "page_number": 1,
                                "filename": "001.webp",
                                "object_key": "chapters/m/c/001.webp",
                                "file_size": 1234,
                            }
                        ],
                    }
                ]
            )
        )
        review_db.tags.find = MagicMock(return_value=AsyncCursor([]))
        review_db.creators.find = MagicMock(return_value=AsyncCursor([]))
        review_db.cover_arts.find = MagicMock(return_value=AsyncCursor([]))

        pool_db.pool_mangas.find_one = AsyncMock(
            return_value={
                "pool_manga_id": "pm_stable001",
                "source_manga_id": manga_id,
                "slug": "stable-manga",
                "lineage": {"pool_revision": 2, "published_at": datetime(2026, 11, 1, tzinfo=timezone.utc)},
            }
        )
        pool_db.pool_mangas.update_one = AsyncMock()
        pool_db.pool_mangas.find = MagicMock(return_value=AsyncCursor([]))
        pool_db.pool_chapters.find = MagicMock(
            return_value=AsyncCursor(
                [
                    {
                        "pool_chapter_id": existing_pool_chapter_id,
                        "pool_manga_id": "pm_stable001",
                        "source_chapter_id": chapter_id,
                        "chapter_number": "1",
                        "language": "en",
                        "pages_revision": 3,
                        "manifest_sha256": "old_hash",
                    }
                ]
            )
        )
        pool_db.pool_chapters.delete_many = AsyncMock()
        pool_db.pool_chapters.insert_many = AsyncMock()
        pool_db.pool_audit_logs.insert_one = AsyncMock()
        pool_db.pool_creators.delete_many = AsyncMock()
        pool_db.pool_creators.update_one = AsyncMock()

        with patch("backend.services.connector_service.connector_service.emit_pool_sync_events", AsyncMock()):
            res = await service.publish_mangas_to_pool(PublishToPoolRequest(source_manga_ids=[manga_id]))

        self.assertEqual(res.success_count, 1)
        inserted_chapters = pool_db.pool_chapters.insert_many.call_args[0][0]
        self.assertEqual(inserted_chapters[0]["pool_chapter_id"], existing_pool_chapter_id)
        # Manifest changed vs "old_hash", so pages_revision incremented 3 -> 4
        self.assertEqual(inserted_chapters[0]["pages_revision"], 4)


@pytest.fixture
def isolated_connector_client():
    from backend.connector_app import create_connector_app

    app = create_connector_app(enable_lifespan=False)
    return TestClient(app)


@pytest.fixture
def main_app_client():
    from backend.main import app

    return TestClient(app)


def test_connector_requires_api_key_and_rejects_invalid_key(isolated_connector_client):
    with patch("backend.core.connector_security.settings") as mock_settings:
        mock_settings.connector_enabled = True
        mock_settings.connector_api_key = "super-secret-connector-key"
        mock_settings.connector_allow_unauthenticated_local = False

        # Missing key -> 401
        r_missing = isolated_connector_client.get("/api/connector/v1/info")
        assert r_missing.status_code == 401

        # Wrong key -> 401
        r_wrong = isolated_connector_client.get(
            "/api/connector/v1/info",
            headers={"X-Connector-API-Key": "wrong-key"},
        )
        assert r_wrong.status_code == 401

        # Valid X-Connector-API-Key -> 200
        with patch(
            "backend.routers.connector.connector_service.get_connector_info",
            AsyncMock(
                return_value={
                    "source_system": "manga-datalake-pool",
                    "service_version": "1.0.0",
                    "contract_name": "manga-reader-package",
                    "contract_version": "2.0",
                    "schema_id": "urn:manga-datalake:contract:manga-reader-package:2.0",
                    "auth_mode": "api_key",
                    "capabilities": ["catalog", "package_v2", "media_proxy", "cdc_webhook", "cdc_polling"],
                    "endpoints": {"catalog": "/api/connector/v1/catalog"},
                    "pool_stats": {"ready_mangas": 1, "ready_chapters": 1, "ready_pages": 2, "total_size_bytes": 3000},
                }
            ),
        ):
            r_ok = isolated_connector_client.get(
                "/api/connector/v1/info",
                headers={"X-Connector-API-Key": "super-secret-connector-key"},
            )
            assert r_ok.status_code == 200
            assert r_ok.json()["contract_version"] == "2.0"

            # Also accepts Authorization: Bearer <key>
            r_bearer = isolated_connector_client.get(
                "/api/connector/v1/info",
                headers={"Authorization": "Bearer super-secret-connector-key"},
            )
            assert r_bearer.status_code == 200


def test_isolated_connector_app_does_not_expose_personal_review_routes(isolated_connector_client):
    assert isolated_connector_client.get("/api/manga").status_code == 404
    assert isolated_connector_client.get("/api/reviews").status_code == 404
    assert isolated_connector_client.get("/api/datalake-pool/stats").status_code == 404


def test_main_app_tunnel_guard_blocks_non_connector_routes_from_ngrok_host(main_app_client):
    with patch("backend.core.connector_security.settings") as mock_settings:
        mock_settings.connector_enforce_tunnel_path_guard = True

        # Simulated ngrok external request hitting private review route -> 403 Forbidden!
        resp = main_app_client.get(
            "/api/datalake-pool/stats",
            headers={"Host": "demo-source.ngrok-free.app"},
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "CONNECTOR_ROUTE_RESTRICTED"

        # Simulated X-Forwarded-Host from ngrok hitting /api/manga -> 403 Forbidden!
        resp_fwd = main_app_client.get(
            "/api/manga",
            headers={"X-Forwarded-Host": "demo-source.ngrok-free.app"},
        )
        assert resp_fwd.status_code == 403

        # Connector route via ngrok host passes tunnel guard (reaches auth check -> 401 without key)
        mock_settings.connector_enabled = True
        mock_settings.connector_api_key = "secret-key"
        mock_settings.connector_allow_unauthenticated_local = False
        resp_conn = main_app_client.get(
            "/api/connector/v1/info",
            headers={"Host": "demo-source.ngrok-free.app"},
        )
        assert resp_conn.status_code == 401


def test_connector_package_etag_304_and_media_proxy_routes(isolated_connector_client):
    from backend.services.connector_service import ConnectorMediaArtifact, ExportedPackageArtifact

    sample_json = json.dumps(
        {
            "contract_name": "manga-reader-package",
            "contract_version": "2.0",
            "exported_at": "2026-11-20T14:00:00Z",
            "manga": {"pool_manga_id": "pm_live001"},
        }
    ).encode("utf-8")
    payload_sha = hashlib.sha256(sample_json).hexdigest()
    artifact = ExportedPackageArtifact(
        raw_bytes=sample_json,
        payload_sha256=payload_sha,
        manifest_sha256="e" * 64,
        pool_revision=7,
        exported_at=datetime(2026, 11, 20, 14, 0, 0, tzinfo=timezone.utc),
    )
    media_bytes = b"\x89PNG_FAKE_BYTES"
    media_artifact = ConnectorMediaArtifact(
        bucket="manga-library",
        object_key="covers/frieren/main.webp",
        content_type="image/webp",
        content_length=len(media_bytes),
        etag="abc123md5",
        sha256=hashlib.sha256(media_bytes).hexdigest(),
        data=media_bytes,
    )

    headers = {"X-Connector-API-Key": "valid-test-key"}
    with (
        patch("backend.core.connector_security.settings") as mock_settings,
        patch(
            "backend.routers.connector.connector_service.export_package_bytes",
            AsyncMock(return_value=artifact),
        ),
        patch(
            "backend.routers.connector.connector_service.authorize_and_fetch_media",
            AsyncMock(return_value=media_artifact),
        ),
    ):
        mock_settings.connector_enabled = True
        mock_settings.connector_api_key = "valid-test-key"
        mock_settings.connector_allow_unauthenticated_local = False

        # 1. Full package download with exact payload SHA-256 & ETag
        r_pkg = isolated_connector_client.get("/api/connector/v1/packages/pm_live001", headers=headers)
        assert r_pkg.status_code == 200
        assert r_pkg.headers["x-payload-sha256"] == payload_sha
        assert r_pkg.headers["x-pool-revision"] == "7"
        assert r_pkg.headers["x-contract-version"] == "2.0"
        etag = r_pkg.headers["etag"]

        # 2. Conditional GET with matching ETag -> 304 Not Modified
        r_304 = isolated_connector_client.get(
            "/api/connector/v1/packages/pm_live001",
            headers={**headers, "If-None-Match": etag},
        )
        assert r_304.status_code == 304

        # 3. Media GET & HEAD
        r_media = isolated_connector_client.get(
            "/api/connector/v1/media/manga-library/covers/frieren/main.webp",
            headers=headers,
        )
        assert r_media.status_code == 200
        assert r_media.content == media_bytes
        assert r_media.headers["x-content-sha256"] == media_artifact.sha256

        r_head = isolated_connector_client.head(
            "/api/connector/v1/media/manga-library/covers/frieren/main.webp",
            headers=headers,
        )
        assert r_head.status_code == 200
        assert r_head.headers["content-length"] == str(len(media_bytes))

        # 4. Contract schema endpoint
        r_schema = isolated_connector_client.get("/api/connector/v1/contract/schema", headers=headers)
        assert r_schema.status_code == 200
        assert r_schema.json()["$id"] == "urn:manga-datalake:contract:manga-reader-package:2.0"


def test_log_redaction_strips_connector_secrets():
    from backend.core.log_redaction import redact

    raw_line = (
        'X-Connector-API-Key: my-super-secret-123 {"webhook_secret": "whsec_abcdef", "connector_api_key": "ck_999"}'
    )
    cleaned = redact(raw_line)
    assert "my-super-secret-123" not in cleaned
    assert "whsec_abcdef" not in cleaned
    assert "ck_999" not in cleaned
    assert "[REDACTED]" in cleaned


class TestConnectorMigrationIndexes(unittest.IsolatedAsyncioTestCase):
    async def test_connector_cdc_migration_upgrade_and_downgrade(self):
        from backend.database.migrations import m_20261120_connector_cdc_indexes as mig

        pool_db = MagicMock()
        pool_db.pool_cdc_subscriptions.create_index = AsyncMock()
        pool_db.pool_cdc_events.create_index = AsyncMock()
        pool_db.pool_cdc_deliveries.create_index = AsyncMock()

        pool_db.pool_cdc_subscriptions.index_information = AsyncMock(
            return_value={name: {} for _, name, _ in mig.POOL_CDC_SUBSCRIPTIONS_INDEXES}
        )
        pool_db.pool_cdc_events.index_information = AsyncMock(
            return_value={name: {} for _, name, _ in mig.POOL_CDC_EVENTS_INDEXES}
        )
        pool_db.pool_cdc_deliveries.index_information = AsyncMock(
            return_value={name: {} for _, name, _ in mig.POOL_CDC_DELIVERIES_INDEXES}
        )
        pool_db.pool_cdc_subscriptions.drop_index = AsyncMock()
        pool_db.pool_cdc_events.drop_index = AsyncMock()
        pool_db.pool_cdc_deliveries.drop_index = AsyncMock()

        with patch.object(mig, "get_pool_db", return_value=pool_db):
            await mig.upgrade()
            self.assertEqual(
                pool_db.pool_cdc_subscriptions.create_index.await_count,
                len(mig.POOL_CDC_SUBSCRIPTIONS_INDEXES),
            )
            self.assertEqual(
                pool_db.pool_cdc_events.create_index.await_count,
                len(mig.POOL_CDC_EVENTS_INDEXES),
            )
            self.assertEqual(
                pool_db.pool_cdc_deliveries.create_index.await_count,
                len(mig.POOL_CDC_DELIVERIES_INDEXES),
            )

            await mig.downgrade()
            self.assertEqual(
                pool_db.pool_cdc_subscriptions.drop_index.await_count,
                len(mig.POOL_CDC_SUBSCRIPTIONS_INDEXES),
            )
            self.assertEqual(
                pool_db.pool_cdc_events.drop_index.await_count,
                len(mig.POOL_CDC_EVENTS_INDEXES),
            )
            self.assertEqual(
                pool_db.pool_cdc_deliveries.drop_index.await_count,
                len(mig.POOL_CDC_DELIVERIES_INDEXES),
            )
