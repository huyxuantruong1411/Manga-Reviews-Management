"""Phase 8 TDD Tests: Media Proxy, Creator Search, Catalog Tags, History Covers, Report Cleanup Isolation, Moderator RBAC & Admin User List."""

from __future__ import annotations

import io
import json
from pathlib import Path
from unittest.mock import patch

import pytest
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.core.storage import storage_service
from app.main import app
from app.models import (
    AccountStatus,
    AdminAuditLog,
    Manga,
    Report,
    User,
    UserRole,
)
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import delete, select

EXAMPLE_PACKAGE_PATH = Path(__file__).resolve().parent.parent / "contracts" / "manga_reader_example_v2.json"


@pytest.fixture(autouse=True)
async def _clean_phase8_data():
    async def _cleanup() -> None:
        async with AsyncSessionLocal() as db:
            test_uids = select(User.user_id).where(User.email.like("%@test-mr8.com"))
            await db.execute(delete(AdminAuditLog).where(AdminAuditLog.admin_id.in_(test_uids)))
            await db.execute(delete(Report).where(Report.reporter_id.in_(test_uids)))
            await db.execute(delete(Manga).where(Manga.pool_manga_id.in_(["pm_1a2b3c4d5e6f", "pm_second_manga"])))
            await db.execute(delete(User).where(User.email.like("%@test-mr8.com")))
            await db.commit()

    await _cleanup()
    yield
    await _cleanup()


async def _setup_phase8_users_and_mangas(client: AsyncClient) -> dict[str, object]:
    async with AsyncSessionLocal() as db:
        admin = User(
            email="admin_p8@test-mr8.com",
            username="admin_p8",
            password_hash=hash_password("AdminPass123"),
            display_name="Admin P8",
            role=UserRole.admin,
            status=AccountStatus.active,
        )
        mod = User(
            email="mod_p8@test-mr8.com",
            username="mod_p8",
            password_hash=hash_password("ModPass123"),
            display_name="Moderator P8",
            role=UserRole.moderator,
            status=AccountStatus.active,
        )
        reader = User(
            email="reader_p8@test-mr8.com",
            username="reader_p8",
            password_hash=hash_password("ReaderPass123"),
            display_name="Reader P8",
            role=UserRole.reader,
            status=AccountStatus.active,
        )
        db.add_all([admin, mod, reader])
        await db.commit()
        await db.refresh(reader)

    admin_tok = (
        await client.post("/api/v1/auth/login", json={"email": "admin_p8@test-mr8.com", "password": "AdminPass123"})
    ).json()["access_token"]
    mod_tok = (
        await client.post("/api/v1/auth/login", json={"email": "mod_p8@test-mr8.com", "password": "ModPass123"})
    ).json()["access_token"]
    reader_tok = (
        await client.post("/api/v1/auth/login", json={"email": "reader_p8@test-mr8.com", "password": "ReaderPass123"})
    ).json()["access_token"]

    admin_h = {"Authorization": f"Bearer {admin_tok}"}
    mod_h = {"Authorization": f"Bearer {mod_tok}"}
    reader_h = {"Authorization": f"Bearer {reader_tok}"}

    pkg1 = json.loads(EXAMPLE_PACKAGE_PATH.read_text(encoding="utf-8"))
    await client.post("/api/v1/admin/etl/ingest", headers=admin_h, json={"package": pkg1, "cdc_enabled": False})

    pkg2 = json.loads(EXAMPLE_PACKAGE_PATH.read_text(encoding="utf-8"))
    pkg2["manga"]["pool_manga_id"] = "pm_second_manga"
    pkg2["manga"]["slug"] = "second-creator-manga"
    pkg2["manga"]["title"] = "Vương Quốc Ánh Sáng"
    pkg2["manga"]["creators"] = [
        {
            "creator_id": "00000000-0000-4000-8000-0000000000b2",
            "slug": "takashi-author",
            "name": "Takashi Author",
            "role": "author",
        }
    ]
    pkg2["chapters"][0]["pool_chapter_id"] = "pch_p8_second_ch1"
    pkg2["chapters"][0]["pool_manga_id"] = "pm_second_manga"
    pkg2["chapters"][0]["pages"][0]["page_uid"] = "pg_p8_sec_001"
    pkg2["chapters"][0]["pages"][0]["media"]["object_key"] = "chapters/second-creator-manga/en/ch-1/001.webp"
    await client.post("/api/v1/admin/etl/ingest", headers=admin_h, json={"package": pkg2, "cdc_enabled": False})

    return {
        "admin_h": admin_h,
        "mod_h": mod_h,
        "reader_h": reader_h,
        "reader_id": str(reader.user_id),
    }


@pytest.mark.asyncio
async def test_media_proxy_streams_minio_object_and_rejects_disallowed_bucket() -> None:
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), color=(10, 200, 120)).save(buf, format="WEBP")
    test_key = "avatars/test-phase8-probe.webp"
    storage_service.put_bytes("user-avatars", test_key, buf.getvalue(), "image/webp")

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            ok = await client.get(f"/api/v1/media/user-avatars/{test_key}")
            assert ok.status_code == 200
            assert ok.headers["content-type"].startswith("image/webp")
            assert len(ok.content) > 10

            missing = await client.get("/api/v1/media/user-avatars/does-not-exist-12345.webp")
            assert missing.status_code == 404

            forbidden = await client.get("/api/v1/media/etl-staging/secret.json")
            assert forbidden.status_code == 403
    finally:
        storage_service.delete_objects("user-avatars", [test_key])


@pytest.mark.asyncio
async def test_search_type_creator_catalog_tags_and_history_cover() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        ctx = await _setup_phase8_users_and_mangas(client)
        reader_h = ctx["reader_h"]

        # 1. Search strictly by creator
        by_creator = await client.get(
            "/api/v1/mangas/search",
            params={"q": "Takashi Author", "search_type": "creator"},
        )
        assert by_creator.status_code == 200
        creator_ids = [item["pool_manga_id"] for item in by_creator.json()["items"]]
        assert "pm_second_manga" in creator_ids
        assert "pm_1a2b3c4d5e6f" not in creator_ids

        # 2. Search strictly by title should NOT match creator-only name
        by_title = await client.get(
            "/api/v1/mangas/search",
            params={"q": "Takashi Author", "search_type": "title"},
        )
        assert by_title.status_code == 200
        assert by_title.json()["total"] == 0

        # 3. Catalog items include populated tags and accept included_tags alias
        cat = await client.get("/api/v1/mangas", params={"included_tags": "action"})
        assert cat.status_code == 200
        assert cat.json()["total"] >= 2
        first_item = next(i for i in cat.json()["items"] if i["pool_manga_id"] == "pm_second_manga")
        assert len(first_item["tags"]) >= 1

        # 4. Reading history includes cover_url & aligned reader_settings keys
        pages_res = await client.get("/api/v1/chapters/pch_p8_second_ch1/pages", headers=reader_h)
        assert pages_res.status_code == 200
        rs = pages_res.json()["reader_settings"]
        assert rs["reading_mode"] in ("vertical_scroll", "single_page", "double_page")
        assert "reading_direction" in rs
        assert rs["fit_mode"] in ("fit_width", "fit_height", "original")

        prog_res = await client.post(
            "/api/v1/chapters/pch_p8_second_ch1/progress",
            headers=reader_h,
            json={"page_number": 1, "is_completed": True, "dwell_seconds": 12, "pages_read_count": 1},
        )
        assert prog_res.status_code == 200

        hist_res = await client.get("/api/v1/users/me/reading-history", headers=reader_h)
        assert hist_res.status_code == 200
        hist_items = hist_res.json()["items"]
        assert len(hist_items) >= 1
        assert hist_items[0]["manga_id"] == "pm_second_manga"
        assert hist_items[0]["cover_url"] is not None


@pytest.mark.asyncio
async def test_moderator_rbac_admin_user_list_and_report_delete_manga_isolation() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        ctx = await _setup_phase8_users_and_mangas(client)
        admin_h = ctx["admin_h"]
        mod_h = ctx["mod_h"]
        reader_h = ctx["reader_h"]
        reader_id = ctx["reader_id"]

        # 1. Admin users directory accessible by admin/moderator
        users_res = await client.get("/api/v1/admin/users", params={"q": "reader_p8"}, headers=mod_h)
        assert users_res.status_code == 200
        assert any(u["user_id"] == reader_id for u in users_res.json()["items"])

        # 2. Reader submits manga report against pm_second_manga
        rep_res = await client.post(
            "/api/v1/mangas/pm_second_manga/reports",
            headers=reader_h,
            json={"reason_code": "broken_images", "description": "Broken panel check"},
        )
        assert rep_res.status_code == 201
        report_id = rep_res.json()["report_id"]

        # 3. Moderator can view & hide manga, but CANNOT delete_manga or lock_user (403)
        mod_list = await client.get("/api/v1/admin/reports", headers=mod_h)
        assert mod_list.status_code == 200

        mod_lock = await client.post(
            f"/api/v1/admin/users/{reader_id}/lock",
            headers=mod_h,
            json={"reason": "Mod cannot lock"},
        )
        assert mod_lock.status_code == 403

        mod_hide = await client.post(
            "/api/v1/admin/mangas/pm_second_manga/hide",
            headers=mod_h,
            json={"reason": "Moderator temporary hide"},
        )
        assert mod_hide.status_code == 200

        # 4. Admin resolves report with delete_manga -> MUST ONLY cleanup pm_second_manga objects!
        deleted_calls: list[tuple[str, list[str]]] = []

        def _capture_delete(bucket: str, keys: list[str]) -> int:
            deleted_calls.append((bucket, list(keys)))
            return len(keys)

        with patch.object(storage_service, "delete_objects", side_effect=_capture_delete):
            resolve_res = await client.post(
                f"/api/v1/admin/reports/{report_id}/resolve",
                headers=admin_h,
                json={"action": "delete_manga", "note": "Delete second test manga cleanly"},
            )
            assert resolve_res.status_code == 200

        cleaned_keys = [k for _b, keys in deleted_calls for k in keys]
        assert "chapters/second-creator-manga/en/ch-1/001.webp" in cleaned_keys
        assert "chapters/example-manga/en/ch-1/001.webp" not in cleaned_keys


@pytest.mark.asyncio
async def test_localized_tag_name_and_creator_biography_serialized_as_strings() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        ctx = await _setup_phase8_users_and_mangas(client)
        admin_h = ctx["admin_h"]
        reader_h = ctx["reader_h"]

        # Ingest manga whose creator biography & tag names are i18n JSONB maps
        pkg_loc = json.loads(EXAMPLE_PACKAGE_PATH.read_text(encoding="utf-8"))
        pkg_loc["manga"]["pool_manga_id"] = "pm_localized_test"
        pkg_loc["manga"]["slug"] = "localized-test-manga"
        pkg_loc["manga"]["tags"] = [
            {"slug": "psychological", "group": "genre", "name": {"en": "Psychological", "vi": "Tâm lý"}},
        ]
        pkg_loc["manga"]["creators"] = [
            {
                "creator_id": "00000000-0000-4000-8000-0000000000c3",
                "slug": "loc-author",
                "name": "Loc Author",
                "role": "author",
                "biography": {"en": "Localized author bio"},
                "links": {"twitter": "https://twitter.com/locauthor"},
            }
        ]
        pkg_loc["chapters"][0]["pool_chapter_id"] = "pch_loc_ch1"
        pkg_loc["chapters"][0]["pool_manga_id"] = "pm_localized_test"
        pkg_loc["chapters"][0]["pages"][0]["page_uid"] = "pg_loc_001"
        ingest_res = await client.post(
            "/api/v1/admin/etl/ingest",
            headers=admin_h,
            json={"package": pkg_loc, "cdc_enabled": False},
        )
        assert ingest_res.status_code == 200

        # Trigger reading history so analytics top_tags includes localized tag
        read_res = await client.get("/api/v1/chapters/pch_loc_ch1/pages", headers=reader_h)
        assert read_res.status_code == 200
        prog_res = await client.post(
            "/api/v1/chapters/pch_loc_ch1/progress",
            headers=reader_h,
            json={"page_number": 1, "is_completed": True, "dwell_seconds": 10, "pages_read_count": 1},
        )
        assert prog_res.status_code == 200

        cat_res = await client.get("/api/v1/mangas")
        assert cat_res.status_code == 200
        cat_item = next(i for i in cat_res.json()["items"] if i["pool_manga_id"] == "pm_localized_test")
        assert isinstance(cat_item["tags"][0]["name"], str)
        assert cat_item["tags"][0]["name"] == "Psychological"

        detail_res = await client.get("/api/v1/mangas/localized-test-manga")
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert isinstance(detail["tags"][0]["name"], str)
        assert detail["tags"][0]["name"] == "Psychological"
        assert isinstance(detail["creators"][0]["biography"], str)
        assert detail["creators"][0]["biography"] == "Localized author bio"

        cr_list = await client.get("/api/v1/creators", params={"q": "Loc Author"})
        assert cr_list.status_code == 200
        assert isinstance(cr_list.json()["items"][0]["biography"], str)
        assert cr_list.json()["items"][0]["biography"] == "Localized author bio"

        cr_detail = await client.get("/api/v1/creators/00000000-0000-4000-8000-0000000000c3")
        assert cr_detail.status_code == 200
        assert isinstance(cr_detail.json()["biography"], str)
        assert cr_detail.json()["biography"] == "Localized author bio"
        assert isinstance(cr_detail.json()["works"][0]["tags"][0]["name"], str)

        analytics = await client.get(f"/api/v1/users/{ctx['reader_id']}/reading-analytics", headers=reader_h)
        assert analytics.status_code == 200
        top_tags = analytics.json()["top_tags"]
        psych = next(t for t in top_tags if t["slug"] == "psychological")
        assert isinstance(psych["name"], str)
        assert psych["name"] == "Psychological"
