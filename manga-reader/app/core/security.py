"""Authentication, Argon2 Password Hashing, JWT Tokens, and RBAC Dependencies."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.redis import get_cached_token_version, set_cached_token_version
from app.models import AccountStatus, User, UserRole

_ph = PasswordHasher()
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(plain_password: str) -> str:
    """Hash a password using Argon2id."""
    return _ph.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a password against an Argon2 hash."""
    try:
        return _ph.verify(password_hash, plain_password)
    except (VerifyMismatchError, Exception):
        return False


def validate_password_policy(password: str) -> None:
    """Enforce UC-6 & UC-6.3 password policy: >= 8 chars, must include both letters and digits."""
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu phải có ít nhất 8 ký tự.",
        )
    has_alpha = any(ch.isalpha() for ch in password)
    has_digit = any(ch.isdigit() for ch in password)
    if not (has_alpha and has_digit):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu phải bao gồm cả chữ cái và chữ số.",
        )


def create_access_token(user_id: uuid.UUID, role: UserRole, token_version: int) -> str:
    """Create JWT Access Token embedding user_id, role, and token_version."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role.value if isinstance(role, UserRole) else str(role),
        "token_version": token_version,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: uuid.UUID, role: UserRole, token_version: int) -> str:
    """Create JWT Refresh Token embedding user_id, role, and token_version."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": role.value if isinstance(role, UserRole) else str(role),
        "token_version": token_version,
        "type": "refresh",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_jwt_token(token: str) -> dict[str, Any]:
    """Decode and validate JWT token signature and expiration."""
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập đã hết hạn.",
        ) from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token xác thực không hợp lệ.",
        ) from exc


async def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Return authenticated User if valid Bearer token is provided, or None for guests."""
    if credentials is None or not credentials.credentials:
        return None
    payload = decode_jwt_token(credentials.credentials)
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Loại token không hợp lệ.",
        )
    sub = payload.get("sub")
    token_ver = payload.get("token_version")
    try:
        uid = uuid.UUID(str(sub))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User ID không hợp lệ.") from exc

    # Instant token revocation check on Redis first (UC-1.2 NFR1 & UC-6.3)
    cached_ver = await get_cached_token_version(str(uid))
    if cached_ver is not None and cached_ver != token_ver:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.",
        )

    stmt = select(User).where(User.user_id == uid)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản không tồn tại.",
        )

    if user.token_version != token_ver:
        await set_cached_token_version(str(user.user_id), user.token_version)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.",
        )

    if user.status == AccountStatus.locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tài khoản đã bị khóa. Lý do: {user.lock_reason or 'Vi phạm quy định'}",
        )

    if user.status == AccountStatus.pending_verification:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản chưa xác thực email.",
        )

    return user


async def get_current_user(
    user: User | None = Depends(get_optional_current_user),
) -> User:
    """Require an active, email-verified user."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Vui lòng đăng nhập để thực hiện chức năng này.",
        )
    return user


async def get_current_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Require an authenticated user with admin role."""
    if user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ Quản trị viên (Admin) mới có quyền thực hiện thao tác này.",
        )
    return user


def get_client_ip(request: Request) -> str:
    """Extract client IP address from request headers or client socket."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"
