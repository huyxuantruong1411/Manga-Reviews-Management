"""FastAPI Router for Module 1 (Reader Activity, Lock/Unlock, Activity Logs, Analytics, Reports)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_admin, get_current_user, get_optional_current_user
from app.models import ReportStatus, ReportTargetType, User
from app.modules.mod1_reader_activity.schemas import (
    LockUserRequest,
    ResolveReportRequest,
    UnlockUserRequest,
)
from app.modules.mod1_reader_activity.service import reader_activity_service

router = APIRouter(prefix="/api/v1", tags=["Module 1 - Reader Activity & Admin Moderation"])


@router.get("/users/{user_id}", status_code=status.HTTP_200_OK)
async def get_user_detail(
    user_id: uuid.UUID,
    caller: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """View user account details with privacy & lock warnings (UC-1.1)."""
    return await reader_activity_service.get_user_detail(db, user_id, caller)


@router.post("/admin/users/{user_id}/lock", status_code=status.HTTP_200_OK)
async def lock_user_account(
    user_id: uuid.UUID,
    payload: LockUserRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Lock a reader account and immediately revoke all active sessions (UC-1.2)."""
    return await reader_activity_service.lock_user_account(db, admin, user_id, payload)


@router.post("/admin/users/{user_id}/unlock", status_code=status.HTTP_200_OK)
async def unlock_user_account(
    user_id: uuid.UUID,
    payload: UnlockUserRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Unlock a locked reader account with 7-day check or admin override (UC-1.3)."""
    return await reader_activity_service.unlock_user_account(db, admin, user_id, payload)


@router.get("/admin/users/{user_id}/activity-logs", status_code=status.HTTP_200_OK)
async def get_user_activity_logs(
    user_id: uuid.UUID,
    action_type: str | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """View immutable reader activity logs (UC-1.4)."""
    return await reader_activity_service.get_user_activity_logs(
        db=db,
        target_user_id=user_id,
        action_type=action_type,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
    )


@router.get("/users/{user_id}/reading-analytics", status_code=status.HTTP_200_OK)
async def get_user_reading_analytics(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """View reader habit analytics cached in Redis for 15 minutes (UC-1.5)."""
    return await reader_activity_service.get_reading_analytics(db, user_id, current_user)


@router.get("/admin/reports", status_code=status.HTTP_200_OK)
async def list_reports(
    target_type: ReportTargetType | None = Query(default=None),
    report_status: ReportStatus | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List reports filtered by target_type and status (UC-1.6)."""
    return await reader_activity_service.list_reports(db, target_type, report_status, page, page_size)


@router.get("/admin/reports/{report_id}", status_code=status.HTTP_200_OK)
async def get_report_detail(
    report_id: uuid.UUID,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get report detail, auto-closing if target was already deleted (UC-1.6 & UC-1.7)."""
    return await reader_activity_service.get_report_detail(db, report_id)


@router.post("/admin/reports/{report_id}/resolve", status_code=status.HTTP_200_OK)
async def resolve_report(
    report_id: uuid.UUID,
    payload: ResolveReportRequest,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Atomically resolve a report and execute enforcement action in a single ACID transaction (UC-1.7)."""
    return await reader_activity_service.resolve_report(db, admin, report_id, payload)
