"""Domain Service for Module 5: Comments, 2-Level Spoiler Lock, Edit History, Soft Delete & Reactions."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import asc, desc, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import check_and_increment_rate_limit
from app.core.sanitization import contains_forbidden_comment_words, sanitize_plain_text
from app.core.storage import storage_service
from app.models import (
    AdminAuditLog,
    Chapter,
    Comment,
    CommentEditHistory,
    CommentReaction,
    CommentReactionType,
    Manga,
    MangaDailyMetric,
    MangaVisibilityStatus,
    Report,
    ReportStatus,
    ReportTargetType,
    User,
    UserActivityLog,
    UserRole,
)
from app.modules.mod5_comments.schemas import (
    CommentCreateRequest,
    CommentEditHistoryItemResponse,
    CommentEditHistoryListResponse,
    CommentItemResponse,
    CommentListResponse,
    CommentReactionRequest,
    CommentReactionResponse,
    CommentReportCreateRequest,
    CommentSpoilerUpdateRequest,
    CommentUpdateRequest,
)


class CommentService:
    """Pure business logic for Module 5 (UC-5.1 -> UC-5.8)."""

    @staticmethod
    def _build_avatar_url(user: User) -> str | None:
        if user.avatar_bucket and user.avatar_object_key:
            return storage_service.build_media_url(user.avatar_bucket, user.avatar_object_key)
        return None

    @staticmethod
    async def list_manga_comments(
        db: AsyncSession,
        manga_id: str,
        viewer: User | None = None,
        chapter_id: str | None = None,
        include_spoilers: bool = True,
        sort_by: str = "newest",
        page: int = 1,
        page_size: int = 20,
    ) -> CommentListResponse:
        """UC-5.1: List comments by manga or chapter; mask deleted comments as '[Bình luận đã bị xóa]'."""
        manga = await db.get(Manga, manga_id)
        if manga is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ truyện.")

        stmt = select(Comment, User).join(User, User.user_id == Comment.user_id).where(Comment.manga_id == manga_id)
        count_stmt = select(func.count(Comment.comment_id)).where(Comment.manga_id == manga_id)

        if chapter_id:
            stmt = stmt.where(Comment.chapter_id == chapter_id)
            count_stmt = count_stmt.where(Comment.chapter_id == chapter_id)
        if not include_spoilers:
            stmt = stmt.where(Comment.is_spoiler.is_(False))
            count_stmt = count_stmt.where(Comment.is_spoiler.is_(False))

        if sort_by == "oldest":
            stmt = stmt.order_by(asc(Comment.created_at))
        elif sort_by == "top_liked":
            stmt = stmt.order_by(desc(Comment.like_count), desc(Comment.created_at))
        else:
            stmt = stmt.order_by(desc(Comment.created_at))

        total = int((await db.execute(count_stmt)).scalar_one() or 0)
        offset = (max(1, page) - 1) * page_size
        rows = (await db.execute(stmt.offset(offset).limit(page_size))).all()

        comment_ids = [c.comment_id for c, _u in rows]
        reaction_map: dict[uuid.UUID, str] = {}
        if viewer is not None and comment_ids:
            r_rows = (
                (
                    await db.execute(
                        select(CommentReaction).where(
                            CommentReaction.user_id == viewer.user_id,
                            CommentReaction.comment_id.in_(comment_ids),
                        )
                    )
                )
                .scalars()
                .all()
            )
            reaction_map = {r.comment_id: r.reaction.value for r in r_rows}

        items: list[CommentItemResponse] = []
        for c, u in rows:
            rendered_content = "[Bình luận đã bị xóa]" if c.is_deleted else c.content
            items.append(
                CommentItemResponse(
                    comment_id=c.comment_id,
                    manga_id=c.manga_id,
                    chapter_id=c.chapter_id,
                    user_id=c.user_id,
                    username=u.username,
                    display_name=u.display_name,
                    avatar_url=CommentService._build_avatar_url(u),
                    parent_comment_id=c.parent_comment_id,
                    content=rendered_content,
                    is_spoiler=c.is_spoiler,
                    spoiler_locked_by_admin=c.spoiler_locked_by_admin,
                    is_edited=c.is_edited,
                    edited_at=c.edited_at,
                    is_deleted=c.is_deleted,
                    like_count=c.like_count,
                    dislike_count=c.dislike_count,
                    user_reaction=reaction_map.get(c.comment_id),  # type: ignore[arg-type]
                    created_at=c.created_at,
                )
            )

        return CommentListResponse(total=total, page=page, page_size=page_size, items=items)

    @staticmethod
    async def create_comment(
        db: AsyncSession,
        manga_id: str,
        viewer: User,
        payload: CommentCreateRequest,
    ) -> CommentItemResponse:
        """UC-5.2: Post comment with cooldown check, XSS sanitization & forbidden words filter."""
        manga = await db.get(Manga, manga_id)
        if manga is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bộ truyện.")
        if manga.visibility_status == MangaVisibilityStatus.hidden and viewer.role != UserRole.admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Truyện hiện đang tạm ẩn và không thể bình luận.",
            )

        if payload.chapter_id:
            ch = await db.get(Chapter, payload.chapter_id)
            if ch is None or ch.manga_id != manga_id:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chương truyện không hợp lệ.")

        if payload.parent_comment_id:
            parent = await db.get(Comment, payload.parent_comment_id)
            if parent is None or parent.manga_id != manga_id or parent.is_deleted:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Bình luận gốc không tồn tại hoặc đã bị xóa.",
                )

        if not payload.bypass_cooldown:
            allowed = await check_and_increment_rate_limit(
                scope="comment_post",
                identifier=str(viewer.user_id),
                max_requests=5,
                window_seconds=15,
            )
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Bạn đang bình luận quá nhanh. Vui lòng đợi vài giây.",
                )

        cleaned_content = sanitize_plain_text(payload.content)
        if not cleaned_content or len(cleaned_content) > 2000:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nội dung bình luận phải từ 1 đến 2000 ký tự hợp lệ.",
            )
        if contains_forbidden_comment_words(cleaned_content):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nội dung bình luận chứa từ ngữ vi phạm quy tắc cộng đồng.",
            )

        comment = Comment(
            manga_id=manga_id,
            chapter_id=payload.chapter_id,
            user_id=viewer.user_id,
            parent_comment_id=payload.parent_comment_id,
            content=cleaned_content,
            is_spoiler=payload.is_spoiler,
            spoiler_locked_by_admin=False,
        )
        db.add(comment)
        manga.comment_count += 1

        today = datetime.now(timezone.utc).date()
        metric_stmt = (
            pg_insert(MangaDailyMetric)
            .values(
                manga_id=manga_id,
                metric_date=today,
                views=0,
                list_adds=0,
                ratings_count=0,
                comments_count=1,
            )
            .on_conflict_do_update(
                index_elements=["metric_date", "manga_id"],
                set_={"comments_count": MangaDailyMetric.comments_count + 1},
            )
        )
        await db.execute(metric_stmt)

        await db.flush()
        db.add(
            UserActivityLog(
                user_id=viewer.user_id,
                action_type="comment_create",
                target_type="comment",
                target_id=str(comment.comment_id),
                metadata_={"manga_id": manga_id, "chapter_id": payload.chapter_id, "is_spoiler": payload.is_spoiler},
            )
        )
        await db.commit()
        await db.refresh(comment)

        return CommentItemResponse(
            comment_id=comment.comment_id,
            manga_id=comment.manga_id,
            chapter_id=comment.chapter_id,
            user_id=comment.user_id,
            username=viewer.username,
            display_name=viewer.display_name,
            avatar_url=CommentService._build_avatar_url(viewer),
            parent_comment_id=comment.parent_comment_id,
            content=comment.content,
            is_spoiler=comment.is_spoiler,
            spoiler_locked_by_admin=comment.spoiler_locked_by_admin,
            is_edited=comment.is_edited,
            edited_at=comment.edited_at,
            is_deleted=comment.is_deleted,
            like_count=comment.like_count,
            dislike_count=comment.dislike_count,
            user_reaction=None,
            created_at=comment.created_at,
        )

    @staticmethod
    async def update_spoiler_flag(
        db: AsyncSession,
        comment_id: uuid.UUID,
        viewer: User,
        payload: CommentSpoilerUpdateRequest,
    ) -> CommentItemResponse:
        """UC-5.3: 2-level spoiler lock (Admin lock prevents author from unmarking spoiler)."""
        comment = await db.get(Comment, comment_id)
        if comment is None or comment.is_deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bình luận.")

        is_admin = viewer.role == UserRole.admin
        is_author = comment.user_id == viewer.user_id

        if not is_admin and not is_author:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền thay đổi nhãn Spoiler của bình luận này.",
            )

        if is_admin:
            comment.is_spoiler = payload.is_spoiler
            comment.spoiler_locked_by_admin = payload.is_spoiler
            if payload.is_spoiler:
                now = datetime.now(timezone.utc)
                await db.execute(
                    update(Report)
                    .where(
                        Report.target_type == ReportTargetType.comment,
                        Report.target_comment_id == comment_id,
                        Report.status == ReportStatus.pending,
                    )
                    .values(
                        status=ReportStatus.resolved,
                        resolution_action="mark_comment_spoiler",
                        resolved_by=viewer.user_id,
                        resolved_at=now,
                    )
                )
            db.add(
                AdminAuditLog(
                    admin_id=viewer.user_id,
                    action_type="comment_spoiler_lock",
                    target_type="comment",
                    target_id=str(comment_id),
                    reason="Admin cập nhật nhãn Spoiler",
                    details={
                        "is_spoiler": payload.is_spoiler,
                        "spoiler_locked_by_admin": comment.spoiler_locked_by_admin,
                    },
                )
            )
        else:
            # Author calling: if locked by Admin, reject unmarking spoiler!
            if comment.spoiler_locked_by_admin and not payload.is_spoiler:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Nhãn Spoiler đã bị khóa bởi Quản trị viên và không thể tự gỡ.",
                )
            comment.is_spoiler = payload.is_spoiler

        await db.commit()
        await db.refresh(comment)
        author = await db.get(User, comment.user_id)
        return CommentItemResponse(
            comment_id=comment.comment_id,
            manga_id=comment.manga_id,
            chapter_id=comment.chapter_id,
            user_id=comment.user_id,
            username=author.username if author else "",
            display_name=author.display_name if author else "",
            avatar_url=CommentService._build_avatar_url(author) if author else None,
            parent_comment_id=comment.parent_comment_id,
            content=comment.content,
            is_spoiler=comment.is_spoiler,
            spoiler_locked_by_admin=comment.spoiler_locked_by_admin,
            is_edited=comment.is_edited,
            edited_at=comment.edited_at,
            is_deleted=comment.is_deleted,
            like_count=comment.like_count,
            dislike_count=comment.dislike_count,
            user_reaction=None,
            created_at=comment.created_at,
        )

    @staticmethod
    async def edit_comment(
        db: AsyncSession,
        comment_id: uuid.UUID,
        viewer: User,
        payload: CommentUpdateRequest,
    ) -> CommentItemResponse:
        """UC-5.4: Author edits comment; snapshots previous_content into comment_edit_histories."""
        comment = await db.get(Comment, comment_id)
        if comment is None or comment.is_deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bình luận.")
        if comment.user_id != viewer.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Chỉ tác giả mới có quyền chỉnh sửa bình luận này.",
            )

        cleaned_content = sanitize_plain_text(payload.content)
        if not cleaned_content or len(cleaned_content) > 2000:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nội dung bình luận phải từ 1 đến 2000 ký tự hợp lệ.",
            )
        if contains_forbidden_comment_words(cleaned_content):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nội dung bình luận chứa từ ngữ vi phạm quy tắc cộng đồng.",
            )

        now = datetime.now(timezone.utc)
        db.add(
            CommentEditHistory(
                comment_id=comment.comment_id,
                previous_content=comment.content,
                edited_at=now,
            )
        )
        comment.content = cleaned_content
        comment.is_edited = True
        comment.edited_at = now

        db.add(
            UserActivityLog(
                user_id=viewer.user_id,
                action_type="comment_edit",
                target_type="comment",
                target_id=str(comment.comment_id),
                metadata_={"manga_id": comment.manga_id},
            )
        )
        await db.commit()
        await db.refresh(comment)

        return CommentItemResponse(
            comment_id=comment.comment_id,
            manga_id=comment.manga_id,
            chapter_id=comment.chapter_id,
            user_id=comment.user_id,
            username=viewer.username,
            display_name=viewer.display_name,
            avatar_url=CommentService._build_avatar_url(viewer),
            parent_comment_id=comment.parent_comment_id,
            content=comment.content,
            is_spoiler=comment.is_spoiler,
            spoiler_locked_by_admin=comment.spoiler_locked_by_admin,
            is_edited=comment.is_edited,
            edited_at=comment.edited_at,
            is_deleted=comment.is_deleted,
            like_count=comment.like_count,
            dislike_count=comment.dislike_count,
            user_reaction=None,
            created_at=comment.created_at,
        )

    @staticmethod
    async def get_comment_edit_history(
        db: AsyncSession,
        comment_id: uuid.UUID,
    ) -> CommentEditHistoryListResponse:
        """UC-5.4: View full edit history of a comment."""
        comment = await db.get(Comment, comment_id)
        if comment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bình luận.")

        rows = (
            (
                await db.execute(
                    select(CommentEditHistory)
                    .where(CommentEditHistory.comment_id == comment_id)
                    .order_by(desc(CommentEditHistory.edited_at), desc(CommentEditHistory.edit_id))
                )
            )
            .scalars()
            .all()
        )

        return CommentEditHistoryListResponse(
            items=[
                CommentEditHistoryItemResponse(
                    edit_id=r.edit_id,
                    comment_id=r.comment_id,
                    previous_content=r.previous_content,
                    edited_at=r.edited_at,
                )
                for r in rows
            ]
        )

    @staticmethod
    async def list_user_comments(
        db: AsyncSession,
        user_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> CommentListResponse:
        """UC-5.5: List non-deleted comments posted by a specific user."""
        user = await db.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy người dùng.")

        stmt = (
            select(Comment)
            .where(Comment.user_id == user_id, Comment.is_deleted.is_(False))
            .order_by(desc(Comment.created_at))
        )
        total = int(
            (
                await db.execute(
                    select(func.count(Comment.comment_id)).where(
                        Comment.user_id == user_id,
                        Comment.is_deleted.is_(False),
                    )
                )
            ).scalar_one()
            or 0
        )
        offset = (max(1, page) - 1) * page_size
        rows = (await db.execute(stmt.offset(offset).limit(page_size))).scalars().all()

        return CommentListResponse(
            total=total,
            page=page,
            page_size=page_size,
            items=[
                CommentItemResponse(
                    comment_id=c.comment_id,
                    manga_id=c.manga_id,
                    chapter_id=c.chapter_id,
                    user_id=c.user_id,
                    username=user.username,
                    display_name=user.display_name,
                    avatar_url=CommentService._build_avatar_url(user),
                    parent_comment_id=c.parent_comment_id,
                    content=c.content,
                    is_spoiler=c.is_spoiler,
                    spoiler_locked_by_admin=c.spoiler_locked_by_admin,
                    is_edited=c.is_edited,
                    edited_at=c.edited_at,
                    is_deleted=c.is_deleted,
                    like_count=c.like_count,
                    dislike_count=c.dislike_count,
                    user_reaction=None,
                    created_at=c.created_at,
                )
                for c in rows
            ],
        )

    @staticmethod
    async def soft_delete_comment(
        db: AsyncSession,
        comment_id: uuid.UUID,
        viewer: User,
    ) -> dict[str, Any]:
        """UC-5.6: Soft delete comment (author or Admin) preserving thread replies."""
        comment = await db.get(Comment, comment_id)
        if comment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bình luận.")

        is_admin = viewer.role == UserRole.admin
        is_author = comment.user_id == viewer.user_id
        if not is_admin and not is_author:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không có quyền xóa bình luận này.",
            )

        now = datetime.now(timezone.utc)
        comment.is_deleted = True
        comment.deleted_by = viewer.user_id
        comment.deleted_at = now

        if is_admin:
            await db.execute(
                update(Report)
                .where(
                    Report.target_type == ReportTargetType.comment,
                    Report.target_comment_id == comment_id,
                    Report.status == ReportStatus.pending,
                )
                .values(
                    status=ReportStatus.resolved,
                    resolution_action="delete_comment",
                    resolved_by=viewer.user_id,
                    resolved_at=now,
                )
            )
            db.add(
                AdminAuditLog(
                    admin_id=viewer.user_id,
                    action_type="comment_delete",
                    target_type="comment",
                    target_id=str(comment_id),
                    reason="Admin xóa bình luận",
                    details={"manga_id": comment.manga_id},
                )
            )

        await db.commit()
        return {"comment_id": str(comment_id), "is_deleted": True, "message": "Đã xóa bình luận."}

    @staticmethod
    async def report_comment(
        db: AsyncSession,
        comment_id: uuid.UUID,
        viewer: User,
        payload: CommentReportCreateRequest,
    ) -> dict[str, Any]:
        """UC-5.7: Report comment; block self-report (400) and duplicate pending report (409)."""
        comment = await db.get(Comment, comment_id)
        if comment is None or comment.is_deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bình luận.")

        if comment.user_id == viewer.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bạn không thể tự báo cáo bình luận của chính mình.",
            )

        dup = (
            await db.execute(
                select(Report).where(
                    Report.reporter_id == viewer.user_id,
                    Report.target_type == ReportTargetType.comment,
                    Report.target_comment_id == comment_id,
                    Report.status == ReportStatus.pending,
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bạn đã gửi báo cáo cho bình luận này và đang chờ xử lý.",
            )

        report = Report(
            reporter_id=viewer.user_id,
            target_type=ReportTargetType.comment,
            target_manga_id=comment.manga_id,
            target_chapter_id=comment.chapter_id,
            target_comment_id=comment_id,
            reason_category=payload.reason_code,
            description=sanitize_plain_text(payload.description) if payload.description else "",
            status=ReportStatus.pending,
        )
        db.add(report)
        await db.commit()
        await db.refresh(report)
        return {"report_id": str(report.report_id), "status": report.status.value}

    @staticmethod
    async def react_to_comment(
        db: AsyncSession,
        comment_id: uuid.UUID,
        viewer: User,
        payload: CommentReactionRequest,
    ) -> CommentReactionResponse:
        """UC-5.8: Mutually exclusive Like <-> Dislike state machine in ACID transaction."""
        comment = await db.get(Comment, comment_id)
        if comment is None or comment.is_deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bình luận.")

        existing = (
            await db.execute(
                select(CommentReaction).where(
                    CommentReaction.comment_id == comment_id,
                    CommentReaction.user_id == viewer.user_id,
                )
            )
        ).scalar_one_or_none()

        user_reaction: str | None = None
        if payload.reaction == "none":
            if existing is not None:
                if existing.reaction == CommentReactionType.like:
                    comment.like_count = max(0, comment.like_count - 1)
                else:
                    comment.dislike_count = max(0, comment.dislike_count - 1)
                await db.delete(existing)
        else:
            desired = CommentReactionType(payload.reaction)
            if existing is None:
                db.add(
                    CommentReaction(
                        comment_id=comment_id,
                        user_id=viewer.user_id,
                        reaction=desired,
                    )
                )
                if desired == CommentReactionType.like:
                    comment.like_count += 1
                else:
                    comment.dislike_count += 1
                user_reaction = desired.value
            elif existing.reaction == desired:
                # Toggle off if clicking same reaction
                if desired == CommentReactionType.like:
                    comment.like_count = max(0, comment.like_count - 1)
                else:
                    comment.dislike_count = max(0, comment.dislike_count - 1)
                await db.delete(existing)
                user_reaction = None
            else:
                # Switch Like <-> Dislike
                if desired == CommentReactionType.like:
                    comment.dislike_count = max(0, comment.dislike_count - 1)
                    comment.like_count += 1
                else:
                    comment.like_count = max(0, comment.like_count - 1)
                    comment.dislike_count += 1
                existing.reaction = desired
                user_reaction = desired.value

        await db.commit()
        await db.refresh(comment)
        return CommentReactionResponse(
            comment_id=comment.comment_id,
            user_reaction=user_reaction,  # type: ignore[arg-type]
            like_count=comment.like_count,
            dislike_count=comment.dislike_count,
        )
