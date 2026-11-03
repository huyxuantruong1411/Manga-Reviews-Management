"""Pydantic v2 Schemas for Module 6 (Authentication, Profile, Avatar, Password, Account Report)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.\-]+$")
    display_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=1, max_length=128)


class RegisterResponse(BaseModel):
    user_id: uuid.UUID
    email: str
    username: str
    display_name: str
    status: str
    otp_expires_in_seconds: int = 120
    message: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6)


class ResendOtpRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict[str, Any]


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=100)
    bio: str | None = Field(default=None, max_length=500)
    birth_date: date | None = None
    show_birth_date: bool | None = None


class UpdatePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=1, max_length=128)
    confirm_password: str = Field(..., min_length=1, max_length=128)


class CreateAccountReportRequest(BaseModel):
    reason_category: str = Field(..., min_length=2, max_length=100)
    description: str = Field(default="", max_length=2000)


class UserProfileResponse(BaseModel):
    user_id: uuid.UUID
    email: str | None = None
    username: str
    display_name: str
    bio: str
    birth_date: date | None = None
    show_birth_date: bool
    avatar_bucket: str | None = None
    avatar_object_key: str | None = None
    avatar_url: str | None = None
    role: str
    status: str
    is_locked: bool = False
    warning: str | None = None
    lock_reason: str | None = None
    locked_at: datetime | None = None
    locked_until: datetime | None = None
    reader_settings: dict[str, Any] | None = None
    created_at: datetime
