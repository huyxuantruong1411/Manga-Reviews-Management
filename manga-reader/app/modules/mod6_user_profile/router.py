"""FastAPI Router for Module 6 (Authentication, Profile, Avatar WebP, Password, Account Report)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_client_ip, get_current_user
from app.models import User
from app.modules.mod6_user_profile.schemas import (
    CreateAccountReportRequest,
    LoginRequest,
    RegisterRequest,
    RegisterResponse,
    ResendOtpRequest,
    TokenResponse,
    UpdatePasswordRequest,
    UpdateProfileRequest,
    VerifyEmailRequest,
)
from app.modules.mod6_user_profile.service import serialize_user_profile, user_profile_service

router = APIRouter(prefix="/api/v1", tags=["Module 6 - Auth & User Profile"])


@router.post("/auth/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Register a new reader account and generate 120s email verification OTP (UC-6, UC-6.5)."""
    return await user_profile_service.register_user(db, payload)


@router.post("/auth/verify-email", status_code=status.HTTP_200_OK)
async def verify_email(
    payload: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Verify email via single-use 6-digit OTP within 120s TTL (UC-6.5)."""
    return await user_profile_service.verify_email_otp(db, payload)


@router.post("/auth/resend-otp", status_code=status.HTTP_200_OK)
async def resend_otp(
    payload: ResendOtpRequest,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Resend a fresh 6-digit OTP code with 120s TTL (UC-6.5)."""
    return await user_profile_service.resend_otp(db, payload.email)


@router.post("/auth/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Authenticate reader/admin with Redis brute-force protection and session version binding (UC-6.4)."""
    return await user_profile_service.login(
        db=db,
        payload=payload,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.get("/users/me", status_code=status.HTTP_200_OK)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get own profile details."""
    return serialize_user_profile(current_user, is_owner_or_admin=True)


@router.put("/users/me/avatar", status_code=status.HTTP_200_OK)
async def update_my_avatar(
    request: Request,
    file: UploadFile = File(...),
    crop_left: int | None = Form(default=None),
    crop_top: int | None = Form(default=None),
    crop_right: int | None = Form(default=None),
    crop_bottom: int | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Upload, crop, and convert user avatar to WebP on MinIO user-avatars bucket (UC-6.1)."""
    file_bytes = await file.read()
    crop_box = None
    if all(v is not None for v in (crop_left, crop_top, crop_right, crop_bottom)):
        crop_box = (int(crop_left), int(crop_top), int(crop_right), int(crop_bottom))
    return await user_profile_service.update_avatar(
        db=db,
        user=current_user,
        file_bytes=file_bytes,
        content_type=file.content_type,
        crop_box=crop_box,
        ip_address=get_client_ip(request),
    )


@router.patch("/users/me/profile", status_code=status.HTTP_200_OK)
async def update_my_profile(
    payload: UpdateProfileRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Update display name, bio, birth date, and visibility with XSS and impersonation filters (UC-6.2)."""
    return await user_profile_service.update_profile(
        db=db,
        user=current_user,
        payload=payload,
        ip_address=get_client_ip(request),
    )


@router.put("/users/me/password", status_code=status.HTTP_200_OK)
async def update_my_password(
    payload: UpdatePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Update password and immediately revoke all active JWT sessions via token_version (UC-6.3)."""
    return await user_profile_service.update_password(
        db=db,
        user=current_user,
        payload=payload,
        ip_address=get_client_ip(request),
    )


@router.post("/users/{target_user_id}/reports", status_code=status.HTTP_201_CREATED)
async def report_user_account(
    target_user_id: uuid.UUID,
    payload: CreateAccountReportRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Submit an account report with self-report block and Redis rate limiting (UC-6.6)."""
    return await user_profile_service.report_account(
        db=db,
        reporter=current_user,
        target_user_id=target_user_id,
        payload=payload,
        ip_address=get_client_ip(request),
    )
