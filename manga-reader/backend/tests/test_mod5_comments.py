"""Phase 5 Verification Tests: Module 5 (Comments, 2-Level Spoiler Lock, Edit History, Reactions, Reports)."""

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
async def _clean_mod5_data() -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(delete(AdminAuditLog))
        await db.execute(delete(User).where(User.email.like("%@test-mr5.com")))
        await db.execute(delete(Manga).where(Manga.pool_manga_id == "pm_1a2b3c4d5e6f"))
        await db.commit()


async def _setup_mod5_fixture(client: AsyncClient) -> tuple[dict[str, str], dict[str, str], dict[str, str], User]:
    async with AsyncSessionLocal() as db:
        admin = User(
            email="admin_p5@test-mr5.com",
            username="admin_p5",
            password_hash=hash_password("AdminPass123"),
            display_name="Admin P5",
            role=UserRole.admin,
            status=AccountStatus.active,
        )
        reader1 = User(
            email="reader1_p5@test-mr5.com",
            username="reader1_p5",
            password_hash=hash_password("ReaderPass123"),
            display_name="Reader One P5",
            role=UserRole.reader,
            status=AccountStatus.active,
        )
        reader2 = User(
            email="reader2_p5@test-mr5.com",
            username="reader2_p5",
            password_hash=hash_password("ReaderPass123"),
            display_name="Reader Two P5",
            role=UserRole.reader,
            status=AccountStatus.active,
        )
        db.add_all([admin, reader1, reader2])
        await db.commit()
        await db.refresh(reader1)

    admin_token = (
        await client.post("/api/v1/auth/login", json={"email": "admin_p5@test-mr5.com", "password": "AdminPass123"})
    ).json()["access_token"]
    r1_token = (
        await client.post("/api/v1/auth/login", json={"email": "reader1_p5@test-mr5.com", "password": "ReaderPass123"})
    ).json()["access_token"]
    r2_token = (
        await client.post("/api/v1/auth/login", json={"email": "reader2_p5@test-mr5.com", "password": "ReaderPass123"})
    ).json()["access_token"]

    admin_h = {"Authorization": f"Bearer {admin_token}"}
    r1_h = {"Authorization": f"Bearer {r1_token}"}
    r2_h = {"Authorization": f"Bearer {r2_token}"}

    pkg = json.loads(EXAMPLE_PACKAGE_PATH.read_text(encoding="utf-8"))
    await client.post("/api/v1/admin/etl/ingest", headers=admin_h, json={"package": pkg, "cdc_enabled": True})

    return admin_h, r1_h, r2_h, reader1


@pytest.mark.asyncio
async def test_uc5_post_edit_history_spoiler_lock_and_soft_delete() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        admin_h, r1_h, r2_h, reader1 = await _setup_mod5_fixture(client)

        # UC-5.2: Post comment on chapter
        post_res = await client.post(
            "/api/v1/mangas/pm_1a2b3c4d5e6f/comments",
            headers=r1_h,
            json={
                "chapter_id": "pch_0a1b2c3d4e5f",
                "content": "Chương đầu tiên rất hấp dẫn!",
                "is_spoiler": False,
                "bypass_cooldown": True,
            },
        )
        assert post_res.status_code == 201
        comment_id = post_res.json()["comment_id"]

        # UC-5.4: Edit comment -> saves previous_content into comment_edit_histories
        edit_res = await client.put(
            f"/api/v1/comments/{comment_id}",
            headers=r1_h,
            json={"content": "Chương đầu tiên cực kỳ cuốn hút (đã chỉnh sửa)!"},
        )
        assert edit_res.status_code == 200
        assert edit_res.json()["is_edited"] is True

        # View edit history
        hist_res = await client.get(f"/api/v1/comments/{comment_id}/edit-history")
        assert hist_res.status_code == 200
        assert len(hist_res.json()["items"]) == 1
        assert hist_res.json()["items"][0]["previous_content"] == "Chương đầu tiên rất hấp dẫn!"

        # UC-5.5: View user's comments
        user_cmts = await client.get(f"/api/v1/users/{reader1.user_id}/comments")
        assert user_cmts.status_code == 200
        assert len(user_cmts.json()["items"]) == 1

        # UC-5.3: Author toggles spoiler ON and OFF freely before Admin lock
        sp_author = await client.patch(
            f"/api/v1/comments/{comment_id}/spoiler",
            headers=r1_h,
            json={"is_spoiler": True},
        )
        assert sp_author.status_code == 200
        assert sp_author.json()["is_spoiler"] is True
        assert sp_author.json()["spoiler_locked_by_admin"] is False

        # Admin locks spoiler ON -> sets spoiler_locked_by_admin = True
        sp_admin = await client.patch(
            f"/api/v1/comments/{comment_id}/spoiler",
            headers=admin_h,
            json={"is_spoiler": True},
        )
        assert sp_admin.status_code == 200
        assert sp_admin.json()["is_spoiler"] is True
        assert sp_admin.json()["spoiler_locked_by_admin"] is True

        # Author tries to unmark spoiler after Admin lock -> MUST FAIL with 403 Forbidden!
        sp_unmark_fail = await client.patch(
            f"/api/v1/comments/{comment_id}/spoiler",
            headers=r1_h,
            json={"is_spoiler": False},
        )
        assert sp_unmark_fail.status_code == 403

        # UC-5.8: Reader 2 likes, then switches to dislike (mutually exclusive state machine)
        like_res = await client.post(
            f"/api/v1/comments/{comment_id}/reactions",
            headers=r2_h,
            json={"reaction": "like"},
        )
        assert like_res.status_code == 200
        assert like_res.json()["like_count"] == 1
        assert like_res.json()["dislike_count"] == 0

        dislike_res = await client.post(
            f"/api/v1/comments/{comment_id}/reactions",
            headers=r2_h,
            json={"reaction": "dislike"},
        )
        assert dislike_res.status_code == 200
        assert dislike_res.json()["like_count"] == 0
        assert dislike_res.json()["dislike_count"] == 1

        # UC-5.7: Report comment (block self-report with 400, block duplicate pending report with 409)
        self_rep = await client.post(
            f"/api/v1/comments/{comment_id}/reports",
            headers=r1_h,
            json={"reason_code": "spam", "description": "Self report"},
        )
        assert self_rep.status_code == 400

        rep_ok = await client.post(
            f"/api/v1/comments/{comment_id}/reports",
            headers=r2_h,
            json={"reason_code": "unmarked_spoiler", "description": "Spoiler nội dung"},
        )
        assert rep_ok.status_code == 201

        rep_dup = await client.post(
            f"/api/v1/comments/{comment_id}/reports",
            headers=r2_h,
            json={"reason_code": "unmarked_spoiler", "description": "Duplicate"},
        )
        assert rep_dup.status_code == 409

        # UC-5.6 & UC-5.1: Soft delete comment -> list returns "[Bình luận đã bị xóa]"
        del_res = await client.delete(f"/api/v1/comments/{comment_id}", headers=admin_h)
        assert del_res.status_code == 200

        list_res = await client.get("/api/v1/mangas/pm_1a2b3c4d5e6f/comments")
        assert list_res.status_code == 200
        items = list_res.json()["items"]
        assert len(items) == 1
        assert items[0]["is_deleted"] is True
        assert items[0]["content"] == "[Bình luận đã bị xóa]"
