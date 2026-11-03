"""Phase 4 Verification Tests: Module 3 (Discovery, Fuzzy/Unaccent Search, RecSys) & Module 4 (Reader, Ratings, Reports)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.main import app
from app.models import AccountStatus, AdminAuditLog, Manga, User, UserRole
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

EXAMPLE_PACKAGE_PATH = Path(__file__).resolve().parent.parent / "contracts" / "manga_reader_example_v2.json"


@pytest.fixture(autouse=True)
async def _clean_mod3_mod4_data() -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(delete(AdminAuditLog))
        await db.execute(delete(User).where(User.email.like("%@test-mr4.com")))
        await db.execute(delete(Manga).where(Manga.pool_manga_id.in_(["pm_1a2b3c4d5e6f", "pm_second_manga"])))
        await db.commit()


async def _setup_users_and_mangas(client: AsyncClient) -> tuple[dict[str, str], dict[str, str], User]:
    async with AsyncSessionLocal() as db:
        admin = User(
            email="admin_p4@test-mr4.com",
            username="admin_p4",
            password_hash=hash_password("AdminPass123"),
            display_name="Admin P4",
            role=UserRole.admin,
            status=AccountStatus.active,
        )
        reader = User(
            email="reader_p4@test-mr4.com",
            username="reader_p4",
            password_hash=hash_password("ReaderPass123"),
            display_name="Reader P4",
            role=UserRole.reader,
            status=AccountStatus.active,
        )
        db.add_all([admin, reader])
        await db.commit()
        await db.refresh(reader)

    admin_token = (
        await client.post("/api/v1/auth/login", json={"email": "admin_p4@test-mr4.com", "password": "AdminPass123"})
    ).json()["access_token"]
    reader_token = (
        await client.post("/api/v1/auth/login", json={"email": "reader_p4@test-mr4.com", "password": "ReaderPass123"})
    ).json()["access_token"]

    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    reader_headers = {"Authorization": f"Bearer {reader_token}"}

    # Ingest Manga 1 (Example Manga with Ch 1 & Ch 2)
    pkg1 = json.loads(EXAMPLE_PACKAGE_PATH.read_text(encoding="utf-8"))
    pkg1["chapters"].append(
        {
            "pool_chapter_id": "pch_0a1b2c3d4e60",
            "pool_manga_id": "pm_1a2b3c4d5e6f",
            "source_chapter_id": "src_ch2",
            "chapter_number": "10.5",
            "chapter_numeric": 10.5,
            "volume": "2",
            "title": "Extra Decimal Chapter",
            "language": "en",
            "scanlation_group": "Example Scans",
            "publish_at": "2026-01-05T00:00:00Z",
            "source": "mangadex",
            "page_count": 2,
            "total_size_bytes": 200000,
            "pages_revision": 1,
            "manifest_sha256": "3" * 64,
            "pages": [
                {
                    "page_uid": "pg_105_1",
                    "page_number": 1,
                    "filename": "001.webp",
                    "media": {"bucket": "manga-library", "object_key": "chapters/example-manga/en/ch-10.5/001.webp"},
                },
                {
                    "page_uid": "pg_105_2",
                    "page_number": 2,
                    "filename": "002.webp",
                    "media": {"bucket": "manga-library", "object_key": "chapters/example-manga/en/ch-10.5/002.webp"},
                },
            ],
        }
    )
    await client.post("/api/v1/admin/etl/ingest", headers=admin_headers, json={"package": pkg1, "cdc_enabled": True})

    # Ingest Manga 2 (shares "action" tag & author for recommendations)
    pkg2 = json.loads(EXAMPLE_PACKAGE_PATH.read_text(encoding="utf-8"))
    pkg2["manga"]["pool_manga_id"] = "pm_second_manga"
    pkg2["manga"]["slug"] = "second-action-manga"
    pkg2["manga"]["title"] = "Hành Trình Phương Đông"
    pkg2["manga"]["alt_titles"] = ["Eastern Journey"]
    pkg2["chapters"][0]["pool_chapter_id"] = "pch_second_ch1"
    pkg2["chapters"][0]["pool_manga_id"] = "pm_second_manga"
    pkg2["chapters"][0]["pages"][0]["page_uid"] = "pg_sec_001"
    await client.post("/api/v1/admin/etl/ingest", headers=admin_headers, json={"package": pkg2, "cdc_enabled": False})

    return admin_headers, reader_headers, reader


@pytest.mark.asyncio
async def test_uc3_catalog_filter_unaccent_search_creators_and_3_recsys() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _admin_headers, reader_headers, _reader = await _setup_users_and_mangas(client)

        # UC-3.1 & UC-3.2: Catalog pagination (fixed page_size=24) & tag filter
        cat_res = await client.get("/api/v1/mangas", params={"include_tags": "action", "sort_by": "latest_update"})
        assert cat_res.status_code == 200
        cat_data = cat_res.json()
        assert cat_data["page_size"] == 24
        assert cat_data["total"] >= 2

        # UC-3.3: Unaccented Vietnamese & Fuzzy Search ("vi du manga" -> matches "Ví Dụ Manga", "hanh trinh" -> matches "Hành Trình Phương Đông")
        search_res = await client.get("/api/v1/mangas/search", params={"q": "hanh trinh phuong dong"})
        assert search_res.status_code == 200
        titles = [item["title"] for item in search_res.json()["items"]]
        assert "Hành Trình Phương Đông" in titles

        auto_res = await client.get("/api/v1/mangas/autocomplete", params={"q": "vi du"})
        assert auto_res.status_code == 200
        assert any(item["pool_manga_id"] == "pm_1a2b3c4d5e6f" for item in auto_res.json()["items"])

        # UC-3.4 & UC-3.6: Creator search & Creator detail with works
        cr_res = await client.get("/api/v1/creators/00000000-0000-4000-8000-0000000000a1")
        assert cr_res.status_code == 200
        assert cr_res.json()["name"] == "Jane Author"
        assert len(cr_res.json()["works"]) >= 2

        # UC-3.5: Manga detail by slug
        detail_res = await client.get("/api/v1/mangas/example-manga", headers=reader_headers)
        assert detail_res.status_code == 200
        assert detail_res.json()["pool_manga_id"] == "pm_1a2b3c4d5e6f"

        # UC-3.7, UC-3.8, UC-3.9: 3 Recommendation models
        cb_res = await client.get("/api/v1/mangas/pm_1a2b3c4d5e6f/recommendations/content-based")
        assert cb_res.status_code == 200
        assert any(i["pool_manga_id"] == "pm_second_manga" for i in cb_res.json()["items"])

        ib_res = await client.get("/api/v1/mangas/pm_1a2b3c4d5e6f/recommendations/item-based")
        assert ib_res.status_code == 200
        assert len(ib_res.json()["items"]) >= 1

        ub_res = await client.get("/api/v1/recommendations/user-based", headers=reader_headers)
        assert ub_res.status_code == 200
        assert ub_res.json()["is_cold_start"] is True


@pytest.mark.asyncio
async def test_uc4_reader_continue_rating_prerequisite_and_anti_f5_views() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        _admin_headers, reader_headers, _reader = await _setup_users_and_mangas(client)

        # UC-4.7 Activity Diagram: Rating BEFORE reading any chapter MUST fail with 400 Bad Request!
        rate_before_read = await client.post(
            "/api/v1/mangas/pm_1a2b3c4d5e6f/ratings",
            headers=reader_headers,
            json={"score": 9},
        )
        assert rate_before_read.status_code == 400
        assert "đọc truyện trước khi chấm điểm" in rate_before_read.json()["detail"].lower()

        # UC-4.1 & UC-4.2: Filter chapters by decimal chapter_number '10.5'
        ch_filter = await client.get(
            "/api/v1/mangas/pm_1a2b3c4d5e6f/chapters",
            params={"q_chapter_number": "10.5"},
            headers=reader_headers,
        )
        assert ch_filter.status_code == 200
        assert len(ch_filter.json()["items"]) == 1
        assert ch_filter.json()["items"][0]["chapter_number"] == "10.5"

        # UC-4.5 & UC-4.6: Continue reading with no history falls back to first chapter (Ch 1, page 1)
        cont_init = await client.get("/api/v1/mangas/pm_1a2b3c4d5e6f/continue-reading", headers=reader_headers)
        assert cont_init.status_code == 200
        assert cont_init.json()["chapter_id"] == "pch_0a1b2c3d4e5f"
        assert cont_init.json()["page_number"] == 1

        # UC-4.3: Open chapter pages
        pages_res = await client.get("/api/v1/chapters/pch_0a1b2c3d4e5f/pages", headers=reader_headers)
        assert pages_res.status_code == 200
        assert len(pages_res.json()["pages"]) == 1
        assert pages_res.json()["next_chapter_id"] == "pch_0a1b2c3d4e60"

        # Record progress completing Ch 1 with dwell_seconds=15 -> counts 1 valid view
        prog1 = await client.post(
            "/api/v1/chapters/pch_0a1b2c3d4e5f/progress",
            headers=reader_headers,
            json={"page_number": 1, "is_completed": True, "dwell_seconds": 15, "pages_read_count": 2},
        )
        assert prog1.status_code == 200
        assert prog1.json()["view_counted"] is True

        # Anti-F5 spam: immediate second call on same chapter must NOT increment view count again
        prog1_spam = await client.post(
            "/api/v1/chapters/pch_0a1b2c3d4e5f/progress",
            headers=reader_headers,
            json={"page_number": 1, "is_completed": True, "dwell_seconds": 20, "pages_read_count": 2},
        )
        assert prog1_spam.status_code == 200
        assert prog1_spam.json()["view_counted"] is False

        # UC-4.6: Now that Ch 1 is completed, continue-reading advances to next chapter (10.5) at page 1!
        cont_next = await client.get("/api/v1/mangas/pm_1a2b3c4d5e6f/continue-reading", headers=reader_headers)
        assert cont_next.status_code == 200
        assert cont_next.json()["chapter_id"] == "pch_0a1b2c3d4e60"
        assert cont_next.json()["page_number"] == 1

        # UC-4.7 & UC-4.8: Now that user has reading history, rating succeeds and updates average_rating + history!
        rate_ok = await client.post(
            "/api/v1/mangas/pm_1a2b3c4d5e6f/ratings",
            headers=reader_headers,
            json={"score": 9},
        )
        assert rate_ok.status_code == 200
        assert rate_ok.json()["average_rating"] == 9.0
        assert rate_ok.json()["rating_count"] == 1

        # Update score to 10 -> recorded in rating_history
        rate_upd = await client.post(
            "/api/v1/mangas/pm_1a2b3c4d5e6f/ratings",
            headers=reader_headers,
            json={"score": 10},
        )
        assert rate_upd.status_code == 200
        assert rate_upd.json()["average_rating"] == 10.0

        r_hist = await client.get("/api/v1/users/me/rating-history", headers=reader_headers)
        assert r_hist.status_code == 200
        assert len(r_hist.json()["items"]) == 2
        assert r_hist.json()["items"][0]["action"] == "update"
        assert r_hist.json()["items"][0]["old_score"] == 9
        assert r_hist.json()["items"][0]["new_score"] == 10
