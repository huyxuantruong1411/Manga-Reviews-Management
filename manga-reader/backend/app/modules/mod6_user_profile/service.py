"""Service Layer for Module 6 (Authentication, Email OTP, Profile, WebP Avatar, Password, Reports)."""

from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import (
    check_and_increment_rate_limit,
    consume_email_otp,
    get_email_otp,
    get_login_failures,
    record_login_failure,
    reset_login_failures,
    set_cached_token_version,
    store_email_otp,
)
from app.core.sanitization import is_display_name_impersonating, sanitize_plain_text
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    validate_password_policy,
    verify_password,
)
from app.core.storage import storage_service
from app.models import (
    AccountStatus,
    Report,
    ReportStatus,
    ReportTargetType,
    User,
    UserActivityLog,
    UserRole,
)
from app.modules.mod6_user_profile.schemas import (
    CreateAccountReportRequest,
    LoginRequest,
    RegisterRequest,
    UpdatePasswordRequest,
    UpdateProfileRequest,
    VerifyEmailRequest,
)


def _generate_otp_code() -> str:
    return f"{secrets.randbelow(900000) + 100000:06d}"


def _validate_birth_date(bdate: date) -> None:
    today = datetime.now(timezone.utc).date()
    if bdate > today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ngày sinh không được nằm ở tương lai.",
        )
    age = today.year - bdate.year - ((today.month, today.day) < (bdate.month, bdate.day))
    if age < 5 or age > 120:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Độ tuổi không hợp lệ (yêu cầu từ 5 đến 120 tuổi).",
        )


def serialize_user_profile(user: User, is_owner_or_admin: bool = False) -> dict[str, Any]:
    avatar_url = storage_service.build_media_url(user.avatar_bucket, user.avatar_object_key)
    is_locked = user.status == AccountStatus.locked
    data: dict[str, Any] = {
        "user_id": user.user_id,
        "username": user.username,
        "display_name": user.display_name,
        "bio": user.bio,
        "birth_date": user.birth_date if (is_owner_or_admin or user.show_birth_date) else None,
        "show_birth_date": user.show_birth_date,
        "avatar_bucket": user.avatar_bucket,
        "avatar_object_key": user.avatar_object_key,
        "avatar_url": avatar_url,
        "role": user.role.value if isinstance(user.role, UserRole) else str(user.role),
        "status": user.status.value if isinstance(user.status, AccountStatus) else str(user.status),
        "is_locked": is_locked,
        "warning": "Tài khoản này đã bị khóa" if is_locked else None,
        "created_at": user.created_at,
    }
    if is_owner_or_admin:
        data["email"] = user.email
        data["lock_reason"] = user.lock_reason
        data["locked_at"] = user.locked_at
        data["locked_until"] = user.locked_until
        data["reader_settings"] = user.reader_settings
    return data


class UserProfileService:
    """Domain service for Module 6 use cases."""

    async def register_user(self, db: AsyncSession, payload: RegisterRequest) -> dict[str, Any]:
        validate_password_policy(payload.password)

        clean_display_name = sanitize_plain_text(payload.display_name)
        if len(clean_display_name) < 2:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên hiển thị quá ngắn.")
        if is_display_name_impersonating(clean_display_name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tên hiển thị không được chứa từ khóa giả mạo Quản trị viên hoặc Hệ thống.",
            )

        email_lower = payload.email.lower()
        username_lower = payload.username.strip()

        existing = await db.execute(select(User).where(or_(User.email == email_lower, User.username == username_lower)))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email hoặc Username đã tồn tại trên hệ thống.",
            )

        user = User(
            email=email_lower,
            username=username_lower,
            password_hash=hash_password(payload.password),
            display_name=clean_display_name,
            role=UserRole.reader,
            status=AccountStatus.pending_verification,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        otp_code = _generate_otp_code()
        await store_email_otp(email_lower, otp_code, ttl_seconds=settings.EMAIL_OTP_EXPIRE_SECONDS)

        return {
            "user_id": user.user_id,
            "email": user.email,
            "username": user.username,
            "display_name": user.display_name,
            "status": user.status.value,
            "otp_expires_in_seconds": settings.EMAIL_OTP_EXPIRE_SECONDS,
            "message": "Đăng ký thành công. Mã OTP xác thực email có hiệu lực trong 120 giây.",
        }

    async def verify_email_otp(self, db: AsyncSession, payload: VerifyEmailRequest) -> dict[str, Any]:
        email_lower = payload.email.lower()
        stmt = select(User).where(User.email == email_lower)
        user = (await db.execute(stmt)).scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản.")

        stored_otp = await get_email_otp(email_lower)
        if not stored_otp or stored_otp != payload.otp_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mã OTP không chính xác hoặc đã hết hạn (120s). Vui lòng gọi /api/v1/auth/resend-otp để nhận mã mới.",
            )

        # Single-use OTP: delete immediately
        await consume_email_otp(email_lower)

        user.status = AccountStatus.active
        user.email_verified_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(user)

        return {
            "user_id": str(user.user_id),
            "email": user.email,
            "status": user.status.value,
            "email_verified_at": user.email_verified_at.isoformat(),
            "message": "Xác thực email thành công.",
        }

    async def resend_otp(self, db: AsyncSession, email: str) -> dict[str, Any]:
        email_lower = email.lower()
        user = (await db.execute(select(User).where(User.email == email_lower))).scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản.")
        if user.status == AccountStatus.active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tài khoản đã được xác thực.")

        otp_code = _generate_otp_code()
        await store_email_otp(email_lower, otp_code, ttl_seconds=settings.EMAIL_OTP_EXPIRE_SECONDS)
        return {
            "email": email_lower,
            "otp_expires_in_seconds": settings.EMAIL_OTP_EXPIRE_SECONDS,
            "message": "Đã gửi lại mã OTP mới có hiệu lực trong 120 giây.",
        }

    async def login(
        self,
        db: AsyncSession,
        payload: LoginRequest,
        ip_address: str,
        user_agent: str | None,
    ) -> dict[str, Any]:
        identifier = payload.email.strip().lower()
        failures = await get_login_failures(identifier)
        if failures >= 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Tài khoản tạm khóa đăng nhập 15 phút do nhập sai mật khẩu quá 5 lần.",
            )

        stmt = select(User).where((User.email == identifier) | (User.username == identifier))
        user = (await db.execute(stmt)).scalar_one_or_none()
        if user is None or not verify_password(payload.password, user.password_hash):
            await record_login_failure(identifier)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Tài khoản (email hoặc username) hoặc mật khẩu không chính xác.",
            )

        await reset_login_failures(identifier)
        if user.email != identifier:
            await reset_login_failures(user.email.lower())

        if user.status == AccountStatus.locked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "Tài khoản của bạn đã bị khóa.",
                    "lock_reason": user.lock_reason,
                    "locked_until": user.locked_until.isoformat() if user.locked_until else None,
                },
            )

        if user.status == AccountStatus.pending_verification:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vui lòng xác thực email qua mã OTP trước khi đăng nhập.",
            )

        now = datetime.now(timezone.utc)
        user.last_login_at = now
        db.add(
            UserActivityLog(
                user_id=user.user_id,
                action_type="login",
                target_type="auth",
                target_id=str(user.user_id),
                ip_address=ip_address,
                user_agent=user_agent,
                metadata_={"email": user.email},
            )
        )
        await db.commit()
        await db.refresh(user)

        await set_cached_token_version(str(user.user_id), user.token_version)
        access_token = create_access_token(user.user_id, user.role, user.token_version)
        refresh_token = create_refresh_token(user.user_id, user.role, user.token_version)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user": serialize_user_profile(user, is_owner_or_admin=True),
        }

    async def update_avatar(
        self,
        db: AsyncSession,
        user: User,
        file_bytes: bytes,
        content_type: str | None,
        crop_box: tuple[int, int, int, int] | None,
        ip_address: str,
    ) -> dict[str, Any]:
        try:
            bucket, object_key = storage_service.upload_user_avatar(
                user_id=str(user.user_id),
                file_bytes=file_bytes,
                content_type=content_type,
                crop_box=crop_box,
                old_bucket=user.avatar_bucket,
                old_object_key=user.avatar_object_key,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

        user.avatar_bucket = bucket
        user.avatar_object_key = object_key
        db.add(
            UserActivityLog(
                user_id=user.user_id,
                action_type="avatar_update",
                target_type="account",
                target_id=str(user.user_id),
                ip_address=ip_address,
                metadata_={"bucket": bucket, "object_key": object_key},
            )
        )
        await db.commit()
        await db.refresh(user)
        return serialize_user_profile(user, is_owner_or_admin=True)

    async def update_profile(
        self,
        db: AsyncSession,
        user: User,
        payload: UpdateProfileRequest,
        ip_address: str,
    ) -> dict[str, Any]:
        if payload.display_name is not None:
            clean_name = sanitize_plain_text(payload.display_name)
            if len(clean_name) < 2:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên hiển thị quá ngắn.")
            if user.role != UserRole.admin and is_display_name_impersonating(clean_name):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Tên hiển thị không được chứa từ khóa giả mạo Quản trị viên / Hệ thống (UC-6.2 BR1).",
                )
            user.display_name = clean_name

        if payload.bio is not None:
            user.bio = sanitize_plain_text(payload.bio)[:500]

        if payload.birth_date is not None:
            _validate_birth_date(payload.birth_date)
            user.birth_date = payload.birth_date

        if payload.show_birth_date is not None:
            user.show_birth_date = payload.show_birth_date

        db.add(
            UserActivityLog(
                user_id=user.user_id,
                action_type="profile_update",
                target_type="account",
                target_id=str(user.user_id),
                ip_address=ip_address,
                metadata_={"display_name": user.display_name},
            )
        )
        await db.commit()
        await db.refresh(user)
        return serialize_user_profile(user, is_owner_or_admin=True)

    async def update_password(
        self,
        db: AsyncSession,
        user: User,
        payload: UpdatePasswordRequest,
        ip_address: str,
    ) -> dict[str, Any]:
        if not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mật khẩu hiện tại không chính xác.",
            )
        if payload.new_password != payload.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mật khẩu xác nhận không khớp.",
            )
        if payload.new_password == payload.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Mật khẩu mới phải khác mật khẩu hiện tại.",
            )
        validate_password_policy(payload.new_password)

        user.password_hash = hash_password(payload.new_password)
        user.token_version += 1
        db.add(
            UserActivityLog(
                user_id=user.user_id,
                action_type="password_change",
                target_type="account",
                target_id=str(user.user_id),
                ip_address=ip_address,
                metadata_={"new_token_version": user.token_version},
            )
        )
        await db.commit()
        await db.refresh(user)

        # Immediately revoke all active JWT sessions on Redis (UC-6.3)
        await set_cached_token_version(str(user.user_id), user.token_version)
        return {
            "message": "Cập nhật mật khẩu thành công. Toàn bộ phiên đăng nhập cũ đã được thu hồi.",
            "token_version": user.token_version,
        }

    async def report_account(
        self,
        db: AsyncSession,
        reporter: User,
        target_user_id: uuid.UUID,
        payload: CreateAccountReportRequest,
        ip_address: str,
    ) -> dict[str, Any]:
        if reporter.user_id == target_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bạn không thể tự báo cáo tài khoản của chính mình.",
            )

        allowed = await check_and_increment_rate_limit(
            scope="report_account",
            identifier=str(reporter.user_id),
            max_requests=5,
            window_seconds=600,
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Bạn đã gửi quá nhiều báo cáo. Vui lòng thử lại sau ít phút.",
            )

        target_user = (await db.execute(select(User).where(User.user_id == target_user_id))).scalar_one_or_none()
        if target_user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài khoản bị báo cáo không tồn tại.")

        report = Report(
            reporter_id=reporter.user_id,
            target_type=ReportTargetType.account,
            target_account_id=target_user.user_id,
            reason_category=sanitize_plain_text(payload.reason_category),
            description=sanitize_plain_text(payload.description),
            status=ReportStatus.pending,
        )
        db.add(report)
        await db.flush()

        db.add(
            UserActivityLog(
                user_id=reporter.user_id,
                action_type="report_submit",
                target_type="account",
                target_id=str(target_user.user_id),
                ip_address=ip_address,
                metadata_={"report_id": str(report.report_id), "reason_category": report.reason_category},
            )
        )
        await db.commit()
        await db.refresh(report)

        return {
            "report_id": str(report.report_id),
            "target_type": report.target_type.value,
            "target_account_id": str(target_user.user_id),
            "status": report.status.value,
            "created_at": report.created_at.isoformat(),
        }


user_profile_service = UserProfileService()
