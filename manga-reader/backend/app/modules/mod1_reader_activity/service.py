"""Service Layer for Module 1 (Account Lock/Unlock, Activity Logs, Reading Analytics, Reports)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import delete, desc, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import (
    cache_get_json,
    cache_set_json,
    redis_delete_prefix,
    set_cached_token_version,
)
from app.core.sanitization import pick_localized_text
from app.core.storage import storage_service
from app.models import (
    AccountStatus,
    AdminAuditLog,
    Chapter,
    ChapterPage,
    Comment,
    Manga,
    MangaCoverArt,
    MangaRating,
    MangaTag,
    MangaVisibilityStatus,
    Report,
    ReportStatus,
    ReportTargetType,
    Tag,
    User,
    UserActivityLog,
    UserChapterRead,
    UserRole,
)
from app.modules.mod1_reader_activity.schemas import (
    LockUserRequest,
    ResolveReportRequest,
    UnlockUserRequest,
)
from app.modules.mod6_user_profile.service import serialize_user_profile

AVAILABLE_ACTIONS_BY_TARGET: dict[ReportTargetType, list[str]] = {
    ReportTargetType.account: ["lock_account", "ignore"],
    ReportTargetType.manga: ["delete_manga", "hide_manga", "ignore", "ignore_and_mute_future"],
    ReportTargetType.comment: ["delete_comment", "flag_spoiler", "lock_commenter_account", "ignore"],
}


class ReaderActivityService:
    """Domain service for Module 1 use cases (UC-1.1 -> UC-1.7)."""

    async def get_user_detail(
        self,
        db: AsyncSession,
        target_user_id: uuid.UUID,
        caller: User | None,
    ) -> dict[str, Any]:
        target = (await db.execute(select(User).where(User.user_id == target_user_id))).scalar_one_or_none()
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng.")

        is_owner_or_admin = caller is not None and (caller.user_id == target.user_id or caller.role == UserRole.admin)
        data = serialize_user_profile(target, is_owner_or_admin=is_owner_or_admin)

        if is_owner_or_admin:
            rep_count = (
                await db.execute(select(func.count(Report.report_id)).where(Report.target_account_id == target.user_id))
            ).scalar_one()
            data["reports_against_count"] = int(rep_count or 0)
        return data

    async def lock_user_account(
        self,
        db: AsyncSession,
        admin: User,
        target_user_id: uuid.UUID,
        payload: LockUserRequest,
    ) -> dict[str, Any]:
        target = (await db.execute(select(User).where(User.user_id == target_user_id))).scalar_one_or_none()
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản.")

        # UC-1.2 4a: Never allow an Admin to lock another Admin
        if target.role == UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Không được phép khóa tài khoản của một Quản trị viên khác.",
            )

        now = datetime.now(timezone.utc)
        target.status = AccountStatus.locked
        target.lock_reason = payload.reason.strip()
        target.locked_at = now
        target.locked_until = payload.locked_until or (now + timedelta(days=7))
        target.locked_by = admin.user_id
        target.token_version += 1

        db.add(
            AdminAuditLog(
                admin_id=admin.user_id,
                action_type="lock_user",
                target_type="account",
                target_id=str(target.user_id),
                reason=target.lock_reason,
                details={
                    "locked_until": target.locked_until.isoformat() if target.locked_until else None,
                    "new_token_version": target.token_version,
                },
            )
        )
        await db.commit()
        await db.refresh(target)

        # Immediately revoke all active sessions on Redis (UC-1.2 NFR1)
        await set_cached_token_version(str(target.user_id), target.token_version)
        return serialize_user_profile(target, is_owner_or_admin=True)

    async def unlock_user_account(
        self,
        db: AsyncSession,
        admin: User,
        target_user_id: uuid.UUID,
        payload: UnlockUserRequest,
    ) -> dict[str, Any]:
        target = (await db.execute(select(User).where(User.user_id == target_user_id))).scalar_one_or_none()
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản.")
        if target.status != AccountStatus.locked:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Tài khoản này không ở trạng thái khóa."
            )

        now = datetime.now(timezone.utc)
        # UC-1.3 Alternative Flow 2a: Check 7-day lock period / locked_until threshold
        min_unlock_time = target.locked_until or ((target.locked_at or now) + timedelta(days=7))
        if now < min_unlock_time and not payload.force_override:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Tài khoản chưa đủ thời hạn khóa tối thiểu (7 ngày). Cần bật force_override=True kèm lý do ghi đè của Admin.",
            )

        target.status = AccountStatus.active
        target.last_unlocked_at = now
        target.lock_reason = None
        target.locked_until = None
        target.locked_by = None

        db.add(
            AdminAuditLog(
                admin_id=admin.user_id,
                action_type="unlock_user",
                target_type="account",
                target_id=str(target.user_id),
                reason=payload.reason.strip(),
                details={"force_override": payload.force_override},
            )
        )
        await db.commit()
        await db.refresh(target)
        return serialize_user_profile(target, is_owner_or_admin=True)

    async def get_user_activity_logs(
        self,
        db: AsyncSession,
        target_user_id: uuid.UUID,
        action_type: str | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        conditions = [UserActivityLog.user_id == target_user_id]
        if action_type:
            conditions.append(UserActivityLog.action_type == action_type)
        if from_date:
            conditions.append(UserActivityLog.created_at >= from_date)
        if to_date:
            conditions.append(UserActivityLog.created_at <= to_date)

        count_stmt = select(func.count(UserActivityLog.log_id)).where(*conditions)
        total = int((await db.execute(count_stmt)).scalar_one() or 0)

        stmt = (
            select(UserActivityLog)
            .where(*conditions)
            .order_by(desc(UserActivityLog.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await db.execute(stmt)).scalars().all()
        items = [
            {
                "log_id": r.log_id,
                "user_id": str(r.user_id),
                "action_type": r.action_type,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "ip_address": r.ip_address,
                "user_agent": r.user_agent,
                "metadata": r.metadata_,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get_reading_analytics(
        self,
        db: AsyncSession,
        target_user_id: uuid.UUID,
        caller: User,
    ) -> dict[str, Any]:
        if caller.user_id != target_user_id and caller.role != UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn chỉ có thể xem thống kê đọc truyện của chính mình.",
            )

        cache_key = f"analytics:user:{target_user_id}"
        cached = await cache_get_json(cache_key)
        if cached is not None:
            return cached

        # 1. Total chapters & distinct mangas read
        reads_rows = (
            (await db.execute(select(UserChapterRead).where(UserChapterRead.user_id == target_user_id))).scalars().all()
        )
        total_chapters_read = len(reads_rows)
        distinct_manga_ids = {r.manga_id for r in reads_rows}
        total_mangas_read = len(distinct_manga_ids)

        # 2. Ratings distribution
        rating_rows = (
            (await db.execute(select(MangaRating).where(MangaRating.user_id == target_user_id))).scalars().all()
        )
        dist = {str(score): 0 for score in range(1, 11)}
        for rt in rating_rows:
            dist[str(rt.score)] = dist.get(str(rt.score), 0) + 1
        avg_score = round(sum(rt.score for rt in rating_rows) / len(rating_rows), 2) if rating_rows else 0.0

        if total_chapters_read == 0 and not rating_rows:
            empty_result = {
                "user_id": str(target_user_id),
                "is_empty": True,
                "total_mangas_read": 0,
                "total_chapters_read": 0,
                "top_tags": [],
                "reading_frequency": {"last_7_days": 0, "last_30_days": 0},
                "rating_distribution": dist,
                "average_score_given": 0.0,
                "total_ratings_given": 0,
                "suggested_discovery_actions": [
                    "Khám phá danh mục truyện mới cập nhật tại /api/v1/mangas",
                    "Thử tìm kiếm theo thể loại yêu thích",
                ],
            }
            return empty_result

        # 3. Top Genres/Tags read most
        top_tags: list[dict[str, Any]] = []
        if distinct_manga_ids:
            tag_stmt = (
                select(Tag.slug, Tag.name, func.count(MangaTag.manga_id).label("cnt"))
                .join(MangaTag, MangaTag.tag_id == Tag.id)
                .where(MangaTag.manga_id.in_(distinct_manga_ids))
                .group_by(Tag.id, Tag.slug, Tag.name)
                .order_by(desc("cnt"))
                .limit(10)
            )
            tag_res = (await db.execute(tag_stmt)).all()
            top_tags = [
                {"slug": row[0], "name": pick_localized_text(row[1], row[0]), "manga_count": int(row[2])}
                for row in tag_res
            ]

        now = datetime.now(timezone.utc)
        last_7 = sum(1 for r in reads_rows if r.last_read_at and r.last_read_at >= now - timedelta(days=7))
        last_30 = sum(1 for r in reads_rows if r.last_read_at and r.last_read_at >= now - timedelta(days=30))

        analytics_data = {
            "user_id": str(target_user_id),
            "is_empty": False,
            "total_mangas_read": total_mangas_read,
            "total_chapters_read": total_chapters_read,
            "top_tags": top_tags,
            "reading_frequency": {"last_7_days": last_7, "last_30_days": last_30},
            "rating_distribution": dist,
            "average_score_given": avg_score,
            "total_ratings_given": len(rating_rows),
        }
        await cache_set_json(cache_key, analytics_data, ttl_seconds=900)
        return analytics_data

    async def list_reports(
        self,
        db: AsyncSession,
        target_type: ReportTargetType | None = None,
        report_status: ReportStatus | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        conditions = []
        if target_type is not None:
            conditions.append(Report.target_type == target_type)
        if report_status is not None:
            conditions.append(Report.status == report_status)

        total = int((await db.execute(select(func.count(Report.report_id)).where(*conditions))).scalar_one() or 0)
        stmt = (
            select(Report)
            .where(*conditions)
            .order_by(desc(Report.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await db.execute(stmt)).scalars().all()
        return {
            "items": [
                {
                    "report_id": str(r.report_id),
                    "reporter_id": str(r.reporter_id),
                    "target_type": r.target_type.value,
                    "target_account_id": str(r.target_account_id) if r.target_account_id else None,
                    "target_manga_id": r.target_manga_id,
                    "target_comment_id": str(r.target_comment_id) if r.target_comment_id else None,
                    "reason_category": r.reason_category,
                    "description": r.description,
                    "status": r.status.value,
                    "resolution_action": r.resolution_action,
                    "created_at": r.created_at.isoformat(),
                }
                for r in rows
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    async def get_report_detail(self, db: AsyncSession, report_id: uuid.UUID) -> dict[str, Any]:
        report = (await db.execute(select(Report).where(Report.report_id == report_id))).scalar_one_or_none()
        if report is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy báo cáo.")

        reporter_total = int(
            (
                await db.execute(select(func.count(Report.report_id)).where(Report.reporter_id == report.reporter_id))
            ).scalar_one()
            or 0
        )

        # Activity Diagram UC-1.7: Verify target still exists; auto-close if already deleted
        target_exists = False
        target_snapshot: dict[str, Any] | None = None

        if report.target_type == ReportTargetType.account and report.target_account_id:
            acc = (await db.execute(select(User).where(User.user_id == report.target_account_id))).scalar_one_or_none()
            if acc is not None:
                target_exists = True
                target_snapshot = {
                    "user_id": str(acc.user_id),
                    "username": acc.username,
                    "display_name": acc.display_name,
                    "status": acc.status.value,
                }
        elif report.target_type == ReportTargetType.manga and report.target_manga_id:
            manga = (
                await db.execute(select(Manga).where(Manga.pool_manga_id == report.target_manga_id))
            ).scalar_one_or_none()
            if manga is not None:
                target_exists = True
                target_snapshot = {
                    "pool_manga_id": manga.pool_manga_id,
                    "title": manga.title,
                    "visibility_status": manga.visibility_status.value,
                }
        elif report.target_type == ReportTargetType.comment and report.target_comment_id:
            comment = (
                await db.execute(select(Comment).where(Comment.comment_id == report.target_comment_id))
            ).scalar_one_or_none()
            if comment is not None and not comment.is_deleted:
                target_exists = True
                target_snapshot = {
                    "comment_id": str(comment.comment_id),
                    "user_id": str(comment.user_id),
                    "content": comment.content,
                    "is_spoiler": comment.is_spoiler,
                    "spoiler_locked_by_admin": comment.spoiler_locked_by_admin,
                }

        if not target_exists and report.status == ReportStatus.pending:
            report.status = ReportStatus.closed
            report.resolution_action = "auto_closed"
            report.resolution_note = "Đối tượng bị báo cáo đã bị xóa trước đó."
            report.resolved_at = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(report)

        return {
            "report_id": str(report.report_id),
            "reporter_id": str(report.reporter_id),
            "reporter_total_reports": reporter_total,
            "target_type": report.target_type.value,
            "target_exists": target_exists,
            "target_snapshot": target_snapshot,
            "reason_category": report.reason_category,
            "description": report.description,
            "status": report.status.value,
            "available_actions": AVAILABLE_ACTIONS_BY_TARGET[report.target_type] if target_exists else [],
            "resolution_action": report.resolution_action,
            "resolution_note": report.resolution_note,
            "created_at": report.created_at.isoformat(),
        }

    async def resolve_report(
        self,
        db: AsyncSession,
        admin: User,
        report_id: uuid.UUID,
        payload: ResolveReportRequest,
    ) -> dict[str, Any]:
        report = (await db.execute(select(Report).where(Report.report_id == report_id))).scalar_one_or_none()
        if report is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy báo cáo.")
        if report.status != ReportStatus.pending:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Báo cáo này đã được xử lý.")

        allowed_actions = AVAILABLE_ACTIONS_BY_TARGET.get(report.target_type, [])
        action = payload.action.strip()
        if action not in allowed_actions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Hành động '{action}' không hợp lệ cho loại báo cáo '{report.target_type.value}'. Cho phép: {allowed_actions}",
            )

        if action in ("delete_manga", "lock_account", "lock_commenter_account") and admin.role != UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ Quản trị viên (Admin) mới có quyền xóa vĩnh viễn truyện hoặc khóa tài khoản.",
            )

        now = datetime.now(timezone.utc)
        note = payload.note.strip()
        duplicate_filter = [Report.status == ReportStatus.pending]
        minio_keys_to_cleanup: list[tuple[str, str]] = []
        revoked_user_token: tuple[str, int] | None = None

        # Execute domain action in the same ACID transaction (UC-1.7)
        if report.target_type == ReportTargetType.account:
            duplicate_filter.append(Report.target_account_id == report.target_account_id)
            if action == "lock_account":
                target_user = (
                    await db.execute(select(User).where(User.user_id == report.target_account_id))
                ).scalar_one_or_none()
                if target_user is None:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tài khoản không tồn tại.")
                if target_user.role == UserRole.admin:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không thể khóa Admin khác.")
                target_user.status = AccountStatus.locked
                target_user.lock_reason = note
                target_user.locked_at = now
                target_user.locked_until = now + timedelta(days=7)
                target_user.locked_by = admin.user_id
                target_user.token_version += 1
                revoked_user_token = (str(target_user.user_id), target_user.token_version)

        elif report.target_type == ReportTargetType.manga:
            duplicate_filter.append(Report.target_manga_id == report.target_manga_id)
            manga = (
                await db.execute(select(Manga).where(Manga.pool_manga_id == report.target_manga_id))
            ).scalar_one_or_none()
            if manga is None:
                report.status = ReportStatus.closed
                report.resolution_action = "auto_closed"
                await db.commit()
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Truyện đã bị xóa trước đó.")

            if action == "hide_manga":
                manga.visibility_status = MangaVisibilityStatus.hidden
                manga.hidden_reason = note
                manga.hidden_by = admin.user_id
                manga.hidden_at = now
            elif action == "delete_manga":
                if manga.is_syncing:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Truyện đang trong tiến trình đồng bộ chapter mới, không thể xóa lúc này.",
                    )
                if manga.cover_bucket and manga.cover_object_key:
                    minio_keys_to_cleanup.append((manga.cover_bucket, manga.cover_object_key))
                covers = (
                    (await db.execute(select(MangaCoverArt).where(MangaCoverArt.manga_id == manga.pool_manga_id)))
                    .scalars()
                    .all()
                )
                for c in covers:
                    minio_keys_to_cleanup.append((c.bucket, c.object_key))
                pages = (
                    await db.execute(
                        select(ChapterPage.bucket, ChapterPage.object_key)
                        .join(Chapter, Chapter.pool_chapter_id == ChapterPage.chapter_id)
                        .where(Chapter.manga_id == manga.pool_manga_id)
                    )
                ).all()
                for b, k in pages:
                    minio_keys_to_cleanup.append((b, k))
                await db.execute(delete(Manga).where(Manga.pool_manga_id == manga.pool_manga_id))
            elif action == "ignore_and_mute_future":
                manga.ignore_future_reports = True

        elif report.target_type == ReportTargetType.comment:
            duplicate_filter.append(Report.target_comment_id == report.target_comment_id)
            comment = (
                await db.execute(select(Comment).where(Comment.comment_id == report.target_comment_id))
            ).scalar_one_or_none()
            if comment is None or comment.is_deleted:
                report.status = ReportStatus.closed
                report.resolution_action = "auto_closed"
                await db.commit()
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bình luận đã bị xóa trước đó.")

            if action == "delete_comment":
                comment.is_deleted = True
                comment.deleted_by = admin.user_id
                comment.deleted_at = now
                await db.execute(
                    update(Manga)
                    .where(Manga.pool_manga_id == comment.manga_id, Manga.comment_count > 0)
                    .values(comment_count=Manga.comment_count - 1)
                )
            elif action == "flag_spoiler":
                comment.is_spoiler = True
                comment.spoiler_locked_by_admin = True
            elif action == "lock_commenter_account":
                commenter = (await db.execute(select(User).where(User.user_id == comment.user_id))).scalar_one_or_none()
                if commenter is not None:
                    if commenter.role == UserRole.admin:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không thể khóa Admin khác.")
                    commenter.status = AccountStatus.locked
                    commenter.lock_reason = note
                    commenter.locked_at = now
                    commenter.locked_until = now + timedelta(days=7)
                    commenter.locked_by = admin.user_id
                    commenter.token_version += 1
                    revoked_user_token = (str(commenter.user_id), commenter.token_version)

        new_status = ReportStatus.ignored if action in ("ignore", "ignore_and_mute_future") else ReportStatus.resolved

        # Update this report and all duplicate pending reports for the same target
        await db.execute(
            update(Report)
            .where(*duplicate_filter)
            .values(
                status=new_status,
                resolution_action=action,
                resolution_note=note,
                resolved_by=admin.user_id,
                resolved_at=now,
            )
        )

        db.add(
            AdminAuditLog(
                admin_id=admin.user_id,
                action_type="resolve_report",
                target_type=report.target_type.value,
                target_id=str(
                    report.target_account_id or report.target_manga_id or report.target_comment_id or report.report_id
                ),
                reason=note,
                details={"report_id": str(report.report_id), "action": action, "new_status": new_status.value},
            )
        )
        await db.commit()
        await db.refresh(report)

        if revoked_user_token is not None:
            await set_cached_token_version(revoked_user_token[0], revoked_user_token[1])
        if action in ("hide_manga", "delete_manga"):
            await redis_delete_prefix("catalog:")
        for b, k in minio_keys_to_cleanup:
            storage_service.delete_objects(b, [k])

        return {
            "report_id": str(report.report_id),
            "status": report.status.value,
            "resolution_action": report.resolution_action,
            "resolution_note": report.resolution_note,
            "resolved_at": report.resolved_at.isoformat() if report.resolved_at else None,
        }

    async def list_users(
        self,
        db: AsyncSession,
        q: str | None = None,
        user_status: AccountStatus | None = None,
        role: UserRole | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """Search and paginate users for Admin / Moderator governance console."""
        conditions = []
        if q and q.strip():
            term = f"%{q.strip()}%"
            conditions.append(
                or_(
                    User.username.ilike(term),
                    User.display_name.ilike(term),
                    User.email.ilike(term),
                )
            )
        if user_status is not None:
            conditions.append(User.status == user_status)
        if role is not None:
            conditions.append(User.role == role)

        total = int((await db.execute(select(func.count(User.user_id)).where(*conditions))).scalar_one() or 0)
        rows = (
            (
                await db.execute(
                    select(User)
                    .where(*conditions)
                    .order_by(desc(User.created_at))
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            )
            .scalars()
            .all()
        )
        return {
            "items": [
                {
                    "user_id": str(u.user_id),
                    "email": u.email,
                    "username": u.username,
                    "display_name": u.display_name,
                    "avatar_url": storage_service.build_media_url(u.avatar_bucket, u.avatar_object_key),
                    "role": u.role.value,
                    "status": u.status.value,
                    "lock_reason": u.lock_reason,
                    "locked_until": u.locked_until.isoformat() if u.locked_until else None,
                    "created_at": u.created_at.isoformat(),
                }
                for u in rows
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }


reader_activity_service = ReaderActivityService()
