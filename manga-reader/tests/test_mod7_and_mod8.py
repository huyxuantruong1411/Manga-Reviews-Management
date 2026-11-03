"""Phase 6 Verification Tests: Module 7 (Reading Lists, Privacy, Merge & Deduplicate) & Module 8 (List Items & Analytics)."""

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
async def _clean_mod7_mod8_data() -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(delete(AdminAuditLog))
        await db.execute(delete(User).where(User.email.like("%@test-mr6.com")))
        await db.execute(delete(Manga).where(Manga.pool_manga_id.in_(["pm_1a2b3c4d5e6f", "pm_second_manga"])))
        await db.commit()


async def _setup_mod7_mod8_fixture(client: AsyncClient) -> tuple[dict[str, str], dict[str, str]]:
    async with AsyncSessionLocal() as db:
        admin = User(
            email="admin_p6@test-mr6.com",
            username="admin_p6",
            password_hash=hash_password("AdminPass123"),
            display_name="Admin P6",
            role=UserRole.admin,
            status=AccountStatus.active,
        )
        owner = User(
            email="owner_p6@test-mr6.com",
            username="owner_p6",
            password_hash=hash_password("ReaderPass123"),
            display_name="Owner P6",
            role=UserRole.reader,
            status=AccountStatus.active,
        )
        other = User(
            email="other_p6@test-mr6.com",
            username="other_p6",
            password_hash=hash_password("ReaderPass123"),
            display_name="Other P6",
            role=UserRole.reader,
            status=AccountStatus.active,
        )
        db.add_all([admin, owner, other])
        await db.commit()

    admin_token = (
        await client.post("/api/v1/auth/login", json={"email": "admin_p6@test-mr6.com", "password": "AdminPass123"})
    ).json()["access_token"]
    owner_token = (
        await client.post("/api/v1/auth/login", json={"email": "owner_p6@test-mr6.com", "password": "ReaderPass123"})
    ).json()["access_token"]
    other_token = (
        await client.post("/api/v1/auth/login", json={"email": "other_p6@test-mr6.com", "password": "ReaderPass123"})
    ).json()["access_token"]

    admin_h = {"Authorization": f"Bearer {admin_token}"}
    owner_h = {"Authorization": f"Bearer {owner_token}"}
    other_h = {"Authorization": f"Bearer {other_token}"}

    pkg1 = json.loads(EXAMPLE_PACKAGE_PATH.read_text(encoding="utf-8"))
    await client.post("/api/v1/admin/etl/ingest", headers=admin_h, json={"package": pkg1, "cdc_enabled": True})

    pkg2 = json.loads(EXAMPLE_PACKAGE_PATH.read_text(encoding="utf-8"))
    pkg2["manga"]["pool_manga_id"] = "pm_second_manga"
    pkg2["manga"]["slug"] = "second-manga-p6"
    pkg2["manga"]["title"] = "Second Manga P6"
    pkg2["chapters"][0]["pool_chapter_id"] = "pch_p6_ch1"
    pkg2["chapters"][0]["pool_manga_id"] = "pm_second_manga"
    pkg2["chapters"][0]["pages"][0]["page_uid"] = "pg_p6_001"
    await client.post("/api/v1/admin/etl/ingest", headers=admin_h, json={"package": pkg2, "cdc_enabled": False})

    return owner_h, other_h


@pytest.mark.asyncio
async def test_uc7_and_uc8_lists_privacy_merge_dedup_and_analytics() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        owner_h, other_h = await _setup_mod7_mod8_fixture(client)

        # UC-7.2: Create two lists
        l1_res = await client.post(
            "/api/v1/reading-lists",
            headers=owner_h,
            json={"name": "Action Favorites", "description": "Top action manga"},
        )
        assert l1_res.status_code == 201
        l1_id = l1_res.json()["list_id"]

        l2_res = await client.post(
            "/api/v1/reading-lists",
            headers=owner_h,
            json={"name": "Weekend Read", "description": "Read on weekend"},
        )
        assert l2_res.status_code == 201
        l2_id = l2_res.json()["list_id"]

        # UC-7.6 Activity Diagram: Merging two EMPTY lists without confirm_empty=True -> 409 Conflict!
        merge_empty_fail = await client.post(
            "/api/v1/reading-lists/merge",
            headers=owner_h,
            json={
                "source_list_ids": [l1_id, l2_id],
                "new_list_name": "Merged Empty",
                "confirm_empty": False,
            },
        )
        assert merge_empty_fail.status_code == 409
        assert "SOURCE_LISTS_EMPTY_CONFIRMATION_REQUIRED" in merge_empty_fail.json()["detail"]

        # Privacy check: Another user accessing owner's list -> 403 Forbidden
        priv_fail = await client.get(f"/api/v1/reading-lists/{l1_id}", headers=other_h)
        assert priv_fail.status_code == 403

        # UC-8.3: Batch add pm_1a2b3c4d5e6f to BOTH l1 and l2, plus inline new list creation
        batch_res = await client.post(
            "/api/v1/reading-lists/batch-add-manga",
            headers=owner_h,
            json={
                "manga_id": "pm_1a2b3c4d5e6f",
                "list_ids": [l1_id, l2_id],
                "new_list_name": "Inline Created List",
            },
        )
        assert batch_res.status_code == 200
        assert batch_res.json()["added_count"] == 3

        # Add pm_second_manga to l2
        await client.post(
            "/api/v1/reading-lists/batch-add-manga",
            headers=owner_h,
            json={"manga_id": "pm_second_manga", "list_ids": [l2_id]},
        )

        # UC-7.6: Merge l1 (has pm_1) and l2 (has pm_1 + pm_second) -> deduplicated 2 unique mangas!
        merge_ok = await client.post(
            "/api/v1/reading-lists/merge",
            headers=owner_h,
            json={
                "source_list_ids": [l1_id, l2_id],
                "new_list_name": "Master Merged List",
                "delete_source_lists": False,
            },
        )
        assert merge_ok.status_code == 201
        merged_id = merge_ok.json()["list_id"]
        assert merge_ok.json()["manga_count"] == 2

        # UC-8.1 & UC-8.2: List items & filter within merged list
        items_res = await client.get(
            f"/api/v1/reading-lists/{merged_id}/items",
            headers=owner_h,
            params={"q": "Second Manga"},
        )
        assert items_res.status_code == 200
        assert items_res.json()["total"] == 1
        assert items_res.json()["items"][0]["pool_manga_id"] == "pm_second_manga"
        assert len(items_res.json()["available_tags_in_list"]) >= 1

        # UC-8.5: List metadata analytics
        analytics_res = await client.get(f"/api/v1/reading-lists/{merged_id}/analytics", headers=owner_h)
        assert analytics_res.status_code == 200
        an_data = analytics_res.json()
        assert an_data["total_mangas"] == 2
        assert an_data["total_chapters"] >= 2
        assert len(an_data["tag_distribution"]) >= 1
        assert len(an_data["top_creators"]) >= 1

        # UC-8.4: Remove item from list
        rem_res = await client.delete(
            f"/api/v1/reading-lists/{merged_id}/items/pm_second_manga",
            headers=owner_h,
        )
        assert rem_res.status_code == 200
        assert rem_res.json()["manga_count"] == 1
