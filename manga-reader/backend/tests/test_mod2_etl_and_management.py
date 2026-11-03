"""Phase 3 Verification Tests: Module 2 (ETL Data Contract v2.0, CDC Webhook, Hide/Show/Delete, Analytics)."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.main import app
from app.models import (
    AccountStatus,
    AdminAuditLog,
    Chapter,
    ChapterPage,
    Manga,
    MangaCoverArt,
    MangaDailyMetric,
    MangaRecommendationsCache,
    User,
    UserRole,
)
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

EXAMPLE_PACKAGE_PATH = Path(__file__).resolve().parent.parent / "contracts" / "manga_reader_example_v2.json"


@pytest.fixture(autouse=True)
async def _clean_mod2_data() -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(delete(AdminAuditLog))
        await db.execute(delete(User).where(User.email.like("%@test-mr3.com")))
        await db.execute(delete(Manga).where(Manga.pool_manga_id.in_(["pm_1a2b3c4d5e6f", "pm_test_sync_lock"])))
        await db.commit()


async def _get_admin_headers(client: AsyncClient) -> dict[str, str]:
    async with AsyncSessionLocal() as db:
        admin = User(
            email="admin_p3@test-mr3.com",
            username="admin_p3",
            password_hash=hash_password("AdminPass123"),
            display_name="Admin P3",
            role=UserRole.admin,
            status=AccountStatus.active,
        )
        db.add(admin)
        await db.commit()

    res = await client.post("/api/v1/auth/login", json={"email": "admin_p3@test-mr3.com", "password": "AdminPass123"})
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_uc2_3_etl_ingest_idempotent_and_cdc_webhook() -> None:
    package_data = json.loads(EXAMPLE_PACKAGE_PATH.read_text(encoding="utf-8"))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await _get_admin_headers(client)

        # 1. List ETL sources
        sources_res = await client.get("/api/v1/admin/etl/sources", headers=headers)
        assert sources_res.status_code == 200
        assert "local_contracts" in sources_res.json()

        # 2. Ingest MangaReaderPackage v2.0 with cdc_enabled=False initially
        ingest_res = await client.post(
            "/api/v1/admin/etl/ingest",
            headers=headers,
            json={"package": package_data, "cdc_enabled": False},
        )
        assert ingest_res.status_code == 200, ingest_res.text
        ingested = ingest_res.json()
        assert ingested["pool_manga_id"] == "pm_1a2b3c4d5e6f"
        assert ingested["chapter_count"] == 1
        assert ingested["page_count"] == 1

        # Verify DB rows: Manga, CoverArt, Chapters, Pages, and RecommendationsCache feature vector
        async with AsyncSessionLocal() as db:
            manga = (await db.execute(select(Manga).where(Manga.pool_manga_id == "pm_1a2b3c4d5e6f"))).scalar_one()
            assert manga.title == "Example Manga"
            assert len(manga.external_links) == 1
            covers = (
                (await db.execute(select(MangaCoverArt).where(MangaCoverArt.manga_id == "pm_1a2b3c4d5e6f")))
                .scalars()
                .all()
            )
            assert len(covers) == 1
            rec_cache = (
                await db.execute(
                    select(MangaRecommendationsCache).where(MangaRecommendationsCache.manga_id == "pm_1a2b3c4d5e6f")
                )
            ).scalar_one_or_none()
            assert rec_cache is not None
            assert "tags" in rec_cache.content_feature_vec

        # 3. Idempotent re-ingest (same revision) succeeds without duplicating rows
        reingest_res = await client.post(
            "/api/v1/admin/etl/ingest",
            headers=headers,
            json={"package": package_data, "cdc_enabled": True},
        )
        assert reingest_res.status_code == 200
        assert reingest_res.json()["cdc_enabled"] is True

        # 4. CDC Webhook adds Chapter 2
        cdc_payload = {
            "pool_manga_id": "pm_1a2b3c4d5e6f",
            "pool_revision": 4,
            "chapters": [
                {
                    "pool_chapter_id": "pch_ch2_new",
                    "pool_manga_id": "pm_1a2b3c4d5e6f",
                    "source_chapter_id": "src_ch2",
                    "chapter_number": "2",
                    "chapter_numeric": 2.0,
                    "volume": "1",
                    "title": "Chapter Two via CDC",
                    "language": "en",
                    "scanlation_group": "Example Scans",
                    "publish_at": "2026-01-02T00:00:00Z",
                    "source": "mangadex",
                    "page_count": 1,
                    "total_size_bytes": 120000,
                    "pages_revision": 1,
                    "manifest_sha256": "2" * 64,
                    "pages": [
                        {
                            "page_uid": "pg_ch2_001",
                            "page_number": 1,
                            "filename": "001.webp",
                            "media": {
                                "bucket": "manga-library",
                                "object_key": "chapters/example-manga/en/ch-2/001.webp",
                                "content_type": "image/webp",
                                "width": 1080,
                                "height": 1620,
                                "file_size": 120000,
                            },
                        }
                    ],
                }
            ],
        }
        cdc_res = await client.post("/api/v1/webhooks/cdc/chapters", json=cdc_payload)
        assert cdc_res.status_code == 200, cdc_res.text
        assert cdc_res.json()["chapter_count"] == 2

        async with AsyncSessionLocal() as db:
            ch_rows = (await db.execute(select(Chapter).where(Chapter.manga_id == "pm_1a2b3c4d5e6f"))).scalars().all()
            assert len(ch_rows) == 2
            pg_rows = (
                (await db.execute(select(ChapterPage).where(ChapterPage.chapter_id == "pch_ch2_new"))).scalars().all()
            )
            assert len(pg_rows) == 1


@pytest.mark.asyncio
async def test_uc2_1_2_2_2_4_2_5_hide_show_delete_sync_lock_and_analytics() -> None:
    package_data = json.loads(EXAMPLE_PACKAGE_PATH.read_text(encoding="utf-8"))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = await _get_admin_headers(client)

        await client.post(
            "/api/v1/admin/etl/ingest",
            headers=headers,
            json={"package": package_data, "cdc_enabled": True},
        )

        # UC-2.1: Hide manga
        hide_res = await client.post(
            "/api/v1/admin/mangas/pm_1a2b3c4d5e6f/hide",
            headers=headers,
            json={"reason": "Pending copyright verification"},
        )
        assert hide_res.status_code == 200
        assert hide_res.json()["visibility_status"] == "hidden"

        # UC-2.2: Show manga
        show_res = await client.post(
            "/api/v1/admin/mangas/pm_1a2b3c4d5e6f/show",
            headers=headers,
            json={"reason": "Copyright cleared"},
        )
        assert show_res.status_code == 200
        assert show_res.json()["visibility_status"] == "public"

        # UC-2.5: Manga interaction analytics
        async with AsyncSessionLocal() as db:
            db.add(
                MangaDailyMetric(
                    metric_date=date.today(),
                    manga_id="pm_1a2b3c4d5e6f",
                    views=150,
                    list_adds=12,
                    ratings_count=8,
                    comments_count=5,
                )
            )
            await db.commit()

        stats_res = await client.get(
            "/api/v1/admin/analytics/mangas",
            params={"period": "month", "manga_id": "pm_1a2b3c4d5e6f"},
            headers=headers,
        )
        assert stats_res.status_code == 200
        stats_data = stats_res.json()
        assert stats_data["summary"]["total_views"] >= 150
        assert len(stats_data["top_mangas"]) >= 1

        # UC-2.4 Activity Diagram: If manga.is_syncing == True -> block deletion with 409 Conflict!
        async with AsyncSessionLocal() as db:
            manga = (await db.execute(select(Manga).where(Manga.pool_manga_id == "pm_1a2b3c4d5e6f"))).scalar_one()
            manga.is_syncing = True
            await db.commit()

        del_locked_res = await client.request(
            "DELETE",
            "/api/v1/admin/mangas/pm_1a2b3c4d5e6f",
            headers=headers,
            json={"reason": "Try deleting while syncing"},
        )
        assert del_locked_res.status_code == 409

        # Release sync lock -> Delete succeeds
        async with AsyncSessionLocal() as db:
            manga = (await db.execute(select(Manga).where(Manga.pool_manga_id == "pm_1a2b3c4d5e6f"))).scalar_one()
            manga.is_syncing = False
            await db.commit()

        del_ok_res = await client.request(
            "DELETE",
            "/api/v1/admin/mangas/pm_1a2b3c4d5e6f",
            headers=headers,
            json={"reason": "Remove test manga"},
        )
        assert del_ok_res.status_code == 200
        assert del_ok_res.json()["deleted"] is True
