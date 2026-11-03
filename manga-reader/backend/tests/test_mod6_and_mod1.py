"""Phase 2 Verification Tests: Module 6 (Auth, Profile, Avatar WebP) & Module 1 (Admin, Activity Logs, Reports)."""

from __future__ import annotations

import io
import uuid

import pytest
from app.core.database import AsyncSessionLocal
from app.core.redis import get_email_otp, reset_login_failures
from app.core.security import hash_password
from app.main import app
from app.models import AccountStatus, AdminAuditLog, Comment, Manga, ReportStatus, User, UserRole
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import delete, select


def _create_png_bytes(width: int = 400, height: int = 300, color: tuple[int, int, int] = (200, 50, 50)) -> bytes:
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture(autouse=True)
async def _clean_mod6_mod1_data() -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(delete(AdminAuditLog))
        await db.execute(delete(User).where(User.email.like("%@test-mr2.%")))
        await db.execute(delete(Manga).where(Manga.pool_manga_id.like("pm_test_p2_%")))
        await db.commit()


async def _create_verified_user(
    email: str,
    username: str,
    password: str = "Pass123456",
    role: UserRole = UserRole.reader,
) -> User:
    async with AsyncSessionLocal() as db:
        user = User(
            email=email,
            username=username,
            password_hash=hash_password(password),
            display_name=username,
            role=role,
            status=AccountStatus.active,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user


@pytest.mark.asyncio
async def test_uc6_register_otp_verify_and_login_flow() -> None:
    email = "reader1@test-mr2.com"
    await reset_login_failures(email)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Weak password rejected
        res_weak = await client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "username": "reader_one",
                "display_name": "Reader One",
                "password": "short",
            },
        )
        assert res_weak.status_code == 400

        # 2. Valid registration -> pending_verification + 120s OTP in Redis
        res_reg = await client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "username": "reader_one",
                "display_name": "Reader One",
                "password": "ValidPass123",
            },
        )
        assert res_reg.status_code == 201, res_reg.text
        data_reg = res_reg.json()
        assert data_reg["status"] == "pending_verification"
        assert data_reg["otp_expires_in_seconds"] == 120

        # 3. Cannot login before verifying email
        res_unverified = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "ValidPass123"},
        )
        assert res_unverified.status_code == 403

        # 4. Verify OTP
        otp_code = await get_email_otp(email)
        assert otp_code is not None and len(otp_code) == 6

        res_verify = await client.post(
            "/api/v1/auth/verify-email",
            json={"email": email, "otp_code": otp_code},
        )
        assert res_verify.status_code == 200
        assert res_verify.json()["status"] == "active"

        # Single-use OTP: second attempt with same OTP must fail
        res_verify_again = await client.post(
            "/api/v1/auth/verify-email",
            json={"email": email, "otp_code": otp_code},
        )
        assert res_verify_again.status_code == 400

        # 5. Login succeeds
        res_login = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "ValidPass123"},
        )
        assert res_login.status_code == 200
        tokens = res_login.json()
        assert "access_token" in tokens
        assert "refresh_token" in tokens


@pytest.mark.asyncio
async def test_uc6_4_login_bruteforce_protection() -> None:
    email = "bruteforce@test-mr2.com"
    await reset_login_failures(email)
    await _create_verified_user(email, "brute_user", "CorrectPass123")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for _ in range(5):
            r = await client.post(
                "/api/v1/auth/login",
                json={"email": email, "password": "WrongPassword999"},
            )
            assert r.status_code == 401

        # 6th attempt even with right password is blocked with 429
        r_blocked = await client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "CorrectPass123"},
        )
        assert r_blocked.status_code == 429

    await reset_login_failures(email)


@pytest.mark.asyncio
async def test_uc6_1_6_2_6_3_avatar_webp_profile_sanitization_and_password_revocation() -> None:
    email = "profile_user@test-mr2.com"
    await _create_verified_user(email, "profile_user", "InitialPass123")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login_res = await client.post("/api/v1/auth/login", json={"email": email, "password": "InitialPass123"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # UC-6.1: Upload PNG avatar -> converted to .webp in user-avatars bucket
        png_bytes = _create_png_bytes(400, 300)
        avatar_res = await client.put(
            "/api/v1/users/me/avatar",
            headers=headers,
            files={"file": ("my_avatar.png", png_bytes, "image/png")},
        )
        assert avatar_res.status_code == 200, avatar_res.text
        avatar_data = avatar_res.json()
        assert avatar_data["avatar_bucket"] == "user-avatars"
        assert avatar_data["avatar_object_key"].endswith(".webp")
        assert avatar_data["avatar_url"].endswith(".webp")

        # UC-6.2 BR1: Block display_name impersonating Admin/Moderator/System
        imp_res = await client.patch(
            "/api/v1/users/me/profile",
            headers=headers,
            json={"display_name": "Super Quản Trị Viên"},
        )
        assert imp_res.status_code == 400

        # UC-6.2 NFR2 & 4c: Sanitize XSS in bio and validate birth_date
        prof_res = await client.patch(
            "/api/v1/users/me/profile",
            headers=headers,
            json={
                "display_name": "Huy Reader",
                "bio": "<script>alert('xss')</script>Yêu thích truyện tranh!",
                "birth_date": "2002-05-15",
                "show_birth_date": True,
            },
        )
        assert prof_res.status_code == 200
        prof_json = prof_res.json()
        assert "<script>" not in prof_json["bio"]
        assert "Yêu thích truyện tranh!" in prof_json["bio"]

        # UC-6.3: Change password -> immediately revokes old JWT token
        pwd_res = await client.put(
            "/api/v1/users/me/password",
            headers=headers,
            json={
                "current_password": "InitialPass123",
                "new_password": "UpdatedPass456",
                "confirm_password": "UpdatedPass456",
            },
        )
        assert pwd_res.status_code == 200

        # Old token must now be rejected with 401
        old_token_check = await client.patch(
            "/api/v1/users/me/profile",
            headers=headers,
            json={"display_name": "Should Fail"},
        )
        assert old_token_check.status_code == 401


@pytest.mark.asyncio
async def test_uc1_lock_unlock_immutable_logs_and_report_engine() -> None:
    admin = await _create_verified_user("admin1@test-mr2.com", "admin_one", "AdminPass123", role=UserRole.admin)
    admin2 = await _create_verified_user("admin2@test-mr2.com", "admin_two", "AdminPass123", role=UserRole.admin)
    reader1 = await _create_verified_user("r_target@test-mr2.com", "r_target", "ReaderPass123")
    reporter = await _create_verified_user("r_reporter@test-mr2.com", "r_reporter", "ReaderPass123")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        admin_token = (
            await client.post("/api/v1/auth/login", json={"email": admin.email, "password": "AdminPass123"})
        ).json()["access_token"]
        reader_token = (
            await client.post("/api/v1/auth/login", json={"email": reader1.email, "password": "ReaderPass123"})
        ).json()["access_token"]
        reporter_token = (
            await client.post("/api/v1/auth/login", json={"email": reporter.email, "password": "ReaderPass123"})
        ).json()["access_token"]

        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        reader_headers = {"Authorization": f"Bearer {reader_token}"}
        reporter_headers = {"Authorization": f"Bearer {reporter_token}"}

        # UC-1.2 4a: Admin cannot lock another Admin
        lock_admin_res = await client.post(
            f"/api/v1/admin/users/{admin2.user_id}/lock",
            headers=admin_headers,
            json={"reason": "Try locking peer admin"},
        )
        assert lock_admin_res.status_code == 403

        # UC-1.2: Lock reader1 -> immediately revokes reader1's active session
        lock_res = await client.post(
            f"/api/v1/admin/users/{reader1.user_id}/lock",
            headers=admin_headers,
            json={"reason": "Spamming comments repeatedly"},
        )
        assert lock_res.status_code == 200
        assert lock_res.json()["status"] == "locked"

        # Reader1's token is instantly invalidated
        check_revoked = await client.patch(
            "/api/v1/users/me/profile",
            headers=reader_headers,
            json={"display_name": "Blocked"},
        )
        assert check_revoked.status_code in (401, 403)

        # UC-1.1: Another reader viewing locked user's profile sees lock warning
        view_locked = await client.get(f"/api/v1/users/{reader1.user_id}", headers=reporter_headers)
        assert view_locked.status_code == 200
        assert view_locked.json()["is_locked"] is True
        assert "email" not in view_locked.json()

        # UC-1.3 Alternative Flow 2a: Unlock before 7 days without force_override -> 409
        unlock_early = await client.post(
            f"/api/v1/admin/users/{reader1.user_id}/unlock",
            headers=admin_headers,
            json={"reason": "Early unlock without override", "force_override": False},
        )
        assert unlock_early.status_code == 409

        # Unlock with force_override=True succeeds
        unlock_ok = await client.post(
            f"/api/v1/admin/users/{reader1.user_id}/unlock",
            headers=admin_headers,
            json={"reason": "Appealed successfully, override approved", "force_override": True},
        )
        assert unlock_ok.status_code == 200
        assert unlock_ok.json()["status"] == "active"

        # UC-6.6: Self-report blocked
        self_rep = await client.post(
            f"/api/v1/users/{reporter.user_id}/reports",
            headers=reporter_headers,
            json={"reason_category": "spam", "description": "Self report"},
        )
        assert self_rep.status_code == 400

        # Create manga & comment to test UC-1.6 & UC-1.7 Report Resolution Engine
        manga_id = f"pm_test_p2_{uuid.uuid4().hex[:8]}"
        async with AsyncSessionLocal() as db:
            m = Manga(
                pool_manga_id=manga_id,
                slug=f"slug-{manga_id}",
                source_manga_id="src_1",
                title="Test Report Manga",
                comment_count=1,
            )
            db.add(m)
            await db.flush()
            c = Comment(
                manga_id=manga_id,
                user_id=reader1.user_id,
                content="Major endgame spoiler without tag!",
                is_spoiler=False,
            )
            db.add(c)
            await db.commit()
            comment_id = c.comment_id

        # Submit report on comment (via account report endpoint + direct report creation)
        acc_rep = await client.post(
            f"/api/v1/users/{reader1.user_id}/reports",
            headers=reporter_headers,
            json={"reason_category": "harassment", "description": "Toxic bio"},
        )
        assert acc_rep.status_code == 201

        # Create a comment report in DB to test UC-1.7 flag_spoiler atomic resolution
        from app.models import Report, ReportTargetType

        async with AsyncSessionLocal() as db:
            c_rep = Report(
                reporter_id=reporter.user_id,
                target_type=ReportTargetType.comment,
                target_comment_id=comment_id,
                target_manga_id=manga_id,
                reason_category="spoiler",
                description="Unmarked spoiler",
            )
            db.add(c_rep)
            await db.commit()
            c_rep_id = c_rep.report_id

        # UC-1.6: View report detail returns available_actions for comment
        rep_detail = await client.get(f"/api/v1/admin/reports/{c_rep_id}", headers=admin_headers)
        assert rep_detail.status_code == 200
        assert "flag_spoiler" in rep_detail.json()["available_actions"]

        # UC-1.7: Resolve comment report with flag_spoiler -> sets is_spoiler=True AND spoiler_locked_by_admin=True
        resolve_res = await client.post(
            f"/api/v1/admin/reports/{c_rep_id}/resolve",
            headers=admin_headers,
            json={"action": "flag_spoiler", "note": "Confirmed endgame spoiler"},
        )
        assert resolve_res.status_code == 200
        assert resolve_res.json()["status"] == "resolved"

        async with AsyncSessionLocal() as db:
            updated_c = (await db.execute(select(Comment).where(Comment.comment_id == comment_id))).scalar_one()
            assert updated_c.is_spoiler is True
            assert updated_c.spoiler_locked_by_admin is True
            updated_rep = (await db.execute(select(Report).where(Report.report_id == c_rep_id))).scalar_one()
            assert updated_rep.status == ReportStatus.resolved

        # UC-1.4: Admin can view immutable activity logs of reporter
        logs_res = await client.get(
            f"/api/v1/admin/users/{reporter.user_id}/activity-logs",
            headers=admin_headers,
        )
        assert logs_res.status_code == 200
        assert logs_res.json()["total"] >= 2

        # UC-1.5: Reading analytics returns empty state with discovery CTA for new user
        analytics_res = await client.get(
            f"/api/v1/users/{reporter.user_id}/reading-analytics",
            headers=reporter_headers,
        )
        assert analytics_res.status_code == 200
        assert analytics_res.json()["is_empty"] is True
