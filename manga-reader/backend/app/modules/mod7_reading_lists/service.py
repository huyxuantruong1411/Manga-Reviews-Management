"""Domain Service for Module 7: Personal Reading Lists, Privacy & Merge/Deduplicate."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import asc, delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sanitization import sanitize_plain_text
from app.models import ReadingList, ReadingListItem, User, UserActivityLog
from app.modules.mod7_reading_lists.schemas import (
    ReadingListCollectionResponse,
    ReadingListCreateRequest,
    ReadingListMergeRequest,
    ReadingListResponse,
    ReadingListUpdateRequest,
)


class ReadingListService:
    """Pure business logic for Module 7 (UC-7.1 -> UC-7.6)."""

    @staticmethod
    async def get_owned_list(db: AsyncSession, list_id: uuid.UUID, viewer: User) -> ReadingList:
        r_list = await db.get(ReadingList, list_id)
        if r_list is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy danh sách truyện.")
        if r_list.owner_id != viewer.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Danh sách truyện này là riêng tư. Bạn không có quyền truy cập.",
            )
        return r_list

    @staticmethod
    def _to_response(r_list: ReadingList) -> ReadingListResponse:
        return ReadingListResponse(
            list_id=r_list.list_id,
            owner_id=r_list.owner_id,
            name=r_list.name,
            description=r_list.description,
            visibility=r_list.visibility,
            manga_count=r_list.manga_count,
            created_at=r_list.created_at,
            updated_at=r_list.updated_at,
        )

    @staticmethod
    async def list_my_reading_lists(
        db: AsyncSession,
        viewer: User,
        q: str | None = None,
        sort_by: str = "newest",
    ) -> ReadingListCollectionResponse:
        """UC-7.1: View and search user's personal reading lists."""
        stmt = select(ReadingList).where(ReadingList.owner_id == viewer.user_id)
        if q:
            q_clean = q.strip()
            stmt = stmt.where(ReadingList.name.ilike(f"%{q_clean}%"))

        if sort_by == "name_asc":
            stmt = stmt.order_by(asc(ReadingList.name))
        elif sort_by == "most_items":
            stmt = stmt.order_by(desc(ReadingList.manga_count), desc(ReadingList.updated_at))
        else:
            stmt = stmt.order_by(desc(ReadingList.updated_at), desc(ReadingList.created_at))

        rows = (await db.execute(stmt)).scalars().all()
        return ReadingListCollectionResponse(
            total=len(rows),
            items=[ReadingListService._to_response(r) for r in rows],
        )

    @staticmethod
    async def create_reading_list(
        db: AsyncSession,
        viewer: User,
        payload: ReadingListCreateRequest,
    ) -> ReadingListResponse:
        """UC-7.2: Create a new personal reading list (unique name per user)."""
        clean_name = sanitize_plain_text(payload.name)
        clean_desc = sanitize_plain_text(payload.description) if payload.description else ""
        if not clean_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên danh sách không hợp lệ.")

        existing = (
            await db.execute(
                select(ReadingList).where(
                    ReadingList.owner_id == viewer.user_id,
                    func.lower(ReadingList.name) == clean_name.lower(),
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bạn đã có danh sách trùng tên này.",
            )

        new_list = ReadingList(
            owner_id=viewer.user_id,
            name=clean_name,
            description=clean_desc,
            visibility="private",
            manga_count=0,
        )
        db.add(new_list)
        await db.flush()
        db.add(
            UserActivityLog(
                user_id=viewer.user_id,
                action_type="reading_list_create",
                target_type="reading_list",
                target_id=str(new_list.list_id),
                metadata_={"name": clean_name},
            )
        )
        await db.commit()
        await db.refresh(new_list)
        return ReadingListService._to_response(new_list)

    @staticmethod
    async def get_reading_list_detail(
        db: AsyncSession,
        list_id: uuid.UUID,
        viewer: User,
    ) -> ReadingListResponse:
        """UC-7.3: Get detail of a personal reading list (strict owner privacy)."""
        r_list = await ReadingListService.get_owned_list(db, list_id, viewer)
        return ReadingListService._to_response(r_list)

    @staticmethod
    async def update_reading_list(
        db: AsyncSession,
        list_id: uuid.UUID,
        viewer: User,
        payload: ReadingListUpdateRequest,
    ) -> ReadingListResponse:
        """UC-7.4: Update name and description of a personal reading list."""
        r_list = await ReadingListService.get_owned_list(db, list_id, viewer)
        clean_name = sanitize_plain_text(payload.name)
        clean_desc = sanitize_plain_text(payload.description) if payload.description else ""
        if not clean_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên danh sách không hợp lệ.")

        dup = (
            await db.execute(
                select(ReadingList).where(
                    ReadingList.owner_id == viewer.user_id,
                    ReadingList.list_id != list_id,
                    func.lower(ReadingList.name) == clean_name.lower(),
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bạn đã có danh sách trùng tên này.")

        r_list.name = clean_name
        r_list.description = clean_desc
        await db.commit()
        await db.refresh(r_list)
        return ReadingListService._to_response(r_list)

    @staticmethod
    async def delete_reading_list(
        db: AsyncSession,
        list_id: uuid.UUID,
        viewer: User,
    ) -> dict[str, Any]:
        """UC-7.5: Delete reading list without affecting user reading history or ratings."""
        r_list = await ReadingListService.get_owned_list(db, list_id, viewer)
        await db.delete(r_list)
        await db.commit()
        return {"list_id": str(list_id), "deleted": True, "message": "Đã xóa danh sách truyện."}

    @staticmethod
    async def merge_reading_lists(
        db: AsyncSession,
        viewer: User,
        payload: ReadingListMergeRequest,
    ) -> ReadingListResponse:
        """UC-7.6: Merge >= 2 personal lists with DISTINCT manga_id deduplication."""
        unique_source_ids = list(dict.fromkeys(payload.source_list_ids))
        if len(unique_source_ids) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cần chọn ít nhất 2 danh sách khác nhau để gộp.",
            )

        source_lists: list[ReadingList] = []
        for sid in unique_source_ids:
            s_list = await ReadingListService.get_owned_list(db, sid, viewer)
            source_lists.append(s_list)

        clean_name = sanitize_plain_text(payload.new_list_name)
        clean_desc = sanitize_plain_text(payload.description) if payload.description else ""
        if not clean_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tên danh sách mới không hợp lệ.")

        # Check duplicate name (unless delete_source_lists is True and name matches one of the deleted source lists)
        dup = (
            await db.execute(
                select(ReadingList).where(
                    ReadingList.owner_id == viewer.user_id,
                    func.lower(ReadingList.name) == clean_name.lower(),
                )
            )
        ).scalar_one_or_none()
        if dup is not None and not (payload.delete_source_lists and dup.list_id in unique_source_ids):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bạn đã có danh sách trùng tên này.")

        # Query distinct manga_ids across all source lists
        distinct_manga_ids = (
            (
                await db.execute(
                    select(func.distinct(ReadingListItem.manga_id)).where(
                        ReadingListItem.list_id.in_(unique_source_ids)
                    )
                )
            )
            .scalars()
            .all()
        )

        # UC-7.6 Activity Diagram: If all source lists are empty and confirm_empty is False -> 409 Conflict!
        if len(distinct_manga_ids) == 0 and not payload.confirm_empty:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="SOURCE_LISTS_EMPTY_CONFIRMATION_REQUIRED: Tất cả danh sách nguồn đều trống. Vui lòng xác nhận nếu vẫn muốn tạo danh sách gộp rỗng.",
            )

        if payload.delete_source_lists:
            await db.execute(delete(ReadingList).where(ReadingList.list_id.in_(unique_source_ids)))
            await db.flush()

        merged_list = ReadingList(
            owner_id=viewer.user_id,
            name=clean_name,
            description=clean_desc,
            visibility="private",
            manga_count=len(distinct_manga_ids),
        )
        db.add(merged_list)
        await db.flush()

        for mid in distinct_manga_ids:
            db.add(ReadingListItem(list_id=merged_list.list_id, manga_id=mid))

        db.add(
            UserActivityLog(
                user_id=viewer.user_id,
                action_type="reading_list_merge",
                target_type="reading_list",
                target_id=str(merged_list.list_id),
                metadata_={
                    "source_list_ids": [str(x) for x in unique_source_ids],
                    "deduplicated_manga_count": len(distinct_manga_ids),
                },
            )
        )
        await db.commit()
        await db.refresh(merged_list)
        return ReadingListService._to_response(merged_list)
