#!/usr/bin/env python3
"""Seed realistic demo interactions, Review-sourced comments, ratings, reading progress, lists & RecSys.

Idempotent script using Review Data Lake reviews + MinIO WebP avatars for demo & QA verification.
"""

from __future__ import annotations

import asyncio
import io
import json
import urllib.request
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.core.storage import storage_service
from app.models import (
    AccountStatus,
    Chapter,
    Comment,
    CommentReaction,
    CommentReactionType,
    Manga,
    MangaDailyMetric,
    MangaRating,
    MangaRatingHistory,
    ReadingList,
    ReadingListItem,
    ReadingStatusType,
    Report,
    ReportStatus,
    ReportTargetType,
    User,
    UserChapterRead,
    UserMangaReadingHistory,
    UserReadingStatus,
    UserRole,
)
from app.workers.tasks import recompute_all_recommendations_task
from PIL import Image, ImageDraw
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

EXTRA_DEMO_READERS = [
    {
        "email": "reader3@mangareader.com",
        "username": "kenji_manga",
        "display_name": "Kenji Sato",
        "password": "Reader123456",
        "bio": "Seinen, dark fantasy, and psychological mystery enthusiast.",
        "birth_date": date(1998, 5, 14),
        "color": (34, 197, 94),
    },
    {
        "email": "reader4@mangareader.com",
        "username": "linh_reader",
        "display_name": "Linh Nguyen",
        "password": "Reader123456",
        "bio": "Rom-com & action binge reader. Tracking weekly releases!",
        "birth_date": date(2000, 11, 8),
        "color": (56, 189, 248),
    },
]

USER_AVATAR_META: dict[str, tuple[date, tuple[int, int, int]]] = {
    "admin": (date(1995, 1, 10), (245, 158, 11)),
    "moderator": (date(1997, 3, 22), (168, 85, 247)),
    "reader1": (date(1999, 7, 19), (249, 115, 22)),
    "reader2": (date(2001, 9, 3), (236, 72, 153)),
    "kenji_manga": (date(1998, 5, 14), (34, 197, 94)),
    "linh_reader": (date(2000, 11, 8), (56, 189, 248)),
}

FALLBACK_COMMENTS_BY_SLUG: dict[str, list[tuple[str, str, bool]]] = {
    "chainsaw-man": [
        (
            "reader1",
            "Nhịp truyện dồn dập và cách Fujimoto cắt cảnh điện ảnh thật sự khác biệt so với shounen truyền thống.",
            False,
        ),
        ("reader2", "Art thô mộc nhưng cực kỳ giàu cảm xúc, nhất là các phân đoạn chiến đấu ở nửa sau Part 1.", False),
        (
            "kenji_manga",
            "Chi tiết giao kèo với Quỷ Bóng Tối và cái kết phần Public Safety thực sự ám ảnh người đọc.",
            True,
        ),
    ],
    "kaguya-sama-wa-kokurasetai-tensai-tachi-no-renai-zunousen": [
        ("linh_reader", "Mỗi chương đấu trí vừa hài hước vừa khéo léo phát triển tâm lý hai nhân vật chính.", False),
        (
            "reader1",
            "Tuyến nhân vật phụ như Ishigami hay Hayasaka có chiều sâu hơn hẳn một bộ rom-com thông thường.",
            False,
        ),
    ],
    "psyren": [
        ("reader1", "World-building và hệ thống Psi cuốn hút ngay từ những chương đầu tiên.", False),
        ("kenji_manga", "Một trong những bộ action sci-fi bị đánh giá thấp nhất thập niên 2000, pacing cực ổn.", False),
    ],
    "eden-its-an-endless-world": [
        ("kenji_manga", "Sci-fi hậu tận thế sắc lạnh, không né tránh hiện thực khắc nghiệt của chiến tranh.", False),
    ],
    "angel-densetsu": [
        ("reader2", "Hiểu lầm chồng chất tạo ra những tình huống hài kinh điển, đọc lại vẫn cười nghiêng ngả.", False),
    ],
    "shiki": [
        (
            "kenji_manga",
            "Không khí ngột ngạt ở ngôi làng cô lập xây dựng rất chắc tay, càng về sau càng căng thẳng.",
            False,
        ),
    ],
}


def _generate_avatar_webp(color: tuple[int, int, int]) -> bytes:
    """Create a clean 128x128 geometric WebP avatar in memory."""
    img = Image.new("RGB", (128, 128), color=(18, 22, 30))
    draw = ImageDraw.Draw(img)
    draw.ellipse([12, 12, 116, 116], fill=color)
    draw.ellipse([42, 34, 86, 78], fill=(248, 250, 252))
    draw.pieslice([26, 78, 102, 134], start=180, end=360, fill=(248, 250, 252))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=85)
    return buf.getvalue()


def _extract_tiptap_text(node: Any) -> str:
    """Recursively flatten Tiptap/ProseMirror JSON nodes into plain text."""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return " ".join(_extract_tiptap_text(child) for child in node).strip()
    if isinstance(node, dict):
        if isinstance(node.get("text"), str):
            return node["text"]
        if "content" in node:
            parts = [_extract_tiptap_text(child) for child in (node["content"] or [])]
            return " ".join(p for p in parts if p).strip()
    return ""


def _fetch_review_texts_for_manga(source_manga_id: str | None) -> list[str]:
    """Fetch published review excerpts directly from the Review backend (:8000) when available."""
    if not source_manga_id:
        return []
    review_base = (
        settings.DATA_LAKE_API_URL.rstrip("/")
        .replace("://localhost:", "://127.0.0.1:")
        .replace("/api/datalake-pool", "")
    )
    url = f"{review_base}/api/manga/{source_manga_id}/reviews"
    try:
        with urllib.request.urlopen(url, timeout=4) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        items = payload if isinstance(payload, list) else payload.get("items", payload.get("reviews", []))
        texts: list[str] = []
        for rev in items:
            if rev.get("is_deleted"):
                continue
            title = str(rev.get("title") or "").strip()
            body = _extract_tiptap_text(rev.get("content_json") or {})
            combined = f"{title}: {body}".strip(": ").strip()
            if len(combined) >= 12:
                texts.append(combined[:600])
        return texts
    except Exception:
        return []


async def seed_demo_interactions() -> None:
    now = datetime.now(timezone.utc)
    default_reader_settings = {
        "reading_mode": "vertical_scroll",
        "reading_direction": "ltr",
        "fit_mode": "fit_width",
        "background_color": "dark",
        "preload_pages": 3,
    }

    async with AsyncSessionLocal() as db:
        # 1. Ensure extra readers exist and normalize reader_settings + avatars on all demo users
        for acc in EXTRA_DEMO_READERS:
            existing = (await db.execute(select(User).where(User.email == acc["email"]))).scalar_one_or_none()
            if existing is None:
                db.add(
                    User(
                        email=acc["email"],
                        username=acc["username"],
                        password_hash=hash_password(acc["password"]),
                        display_name=acc["display_name"],
                        role=UserRole.reader,
                        status=AccountStatus.active,
                        bio=acc["bio"],
                        birth_date=acc["birth_date"],
                        show_birth_date=False,
                        reader_settings=dict(default_reader_settings),
                        last_login_at=now,
                    )
                )
        await db.commit()

        users_list = (await db.execute(select(User))).scalars().all()
        users_by_name = {u.username: u for u in users_list}

        for u in users_list:
            meta = USER_AVATAR_META.get(u.username)
            if meta:
                bdate, color = meta
                if u.birth_date is None:
                    u.birth_date = bdate
                avatar_key = f"avatars/demo_{u.username}.webp"
                if not u.avatar_object_key or not storage_service.object_exists(
                    settings.MINIO_BUCKET_AVATARS, avatar_key
                ):
                    storage_service.put_bytes(
                        settings.MINIO_BUCKET_AVATARS,
                        avatar_key,
                        _generate_avatar_webp(color),
                        "image/webp",
                    )
                u.avatar_bucket = settings.MINIO_BUCKET_AVATARS
                u.avatar_object_key = avatar_key
            u.reader_settings = dict(default_reader_settings)
        await db.commit()

        # 2. Load mangas ordered cleanly (prioritize recognizable multi-chapter titles)
        mangas = (
            (await db.execute(select(Manga).order_by(Manga.chapter_count.desc(), Manga.title.asc()))).scalars().all()
        )
        if not mangas:
            print("[WARN] No mangas found in PostgreSQL. Run sync_from_datalake.py first.")
            return

        chapters_by_manga: dict[str, list[Chapter]] = {}
        all_chapters = (
            (await db.execute(select(Chapter).order_by(Chapter.manga_id, Chapter.chapter_numeric.asc())))
            .scalars()
            .all()
        )
        for ch in all_chapters:
            chapters_by_manga.setdefault(ch.manga_id, []).append(ch)

        # 3. Seed reading progress, statuses, and ratings across demo readers
        reader_names = [n for n in ("reader1", "reader2", "kenji_manga", "linh_reader") if n in users_by_name]
        status_cycle = [
            ReadingStatusType.reading,
            ReadingStatusType.completed,
            ReadingStatusType.plan_to_read,
            ReadingStatusType.reading,
            ReadingStatusType.on_hold,
        ]

        seeded_comments_count = int((await db.execute(select(func.count()).select_from(Comment))).scalar_one() or 0)

        for m_idx, manga in enumerate(mangas):
            m_chapters = chapters_by_manga.get(manga.pool_manga_id, [])
            if not m_chapters:
                continue

            # Assign varied realistic view counts & dates
            base_views = max(120, int(manga.chapter_count * 185 + (len(mangas) - m_idx) * 240))
            manga.view_count = max(int(manga.view_count), base_views)

            # Seed daily metrics over last 10 days for analytics dashboard
            for days_ago in range(10):
                m_date = (now - timedelta(days=days_ago)).date()
                daily_views = max(8, (base_views // 25) + ((m_idx + days_ago) % 19))
                await db.execute(
                    pg_insert(MangaDailyMetric)
                    .values(
                        metric_date=m_date,
                        manga_id=manga.pool_manga_id,
                        views=daily_views,
                        list_adds=1 if (days_ago + m_idx) % 3 == 0 else 0,
                        ratings_count=1 if (days_ago + m_idx) % 4 == 0 else 0,
                        comments_count=1 if (days_ago + m_idx) % 5 == 0 else 0,
                    )
                    .on_conflict_do_nothing(index_elements=["metric_date", "manga_id"])
                )

            # Simulate reader engagement
            for r_idx, r_name in enumerate(reader_names):
                user = users_by_name[r_name]
                # Different users engage with overlapping subsets so Item-CF & User-CF both activate!
                if (m_idx + r_idx) % 5 == 4 and m_idx > 6:
                    continue

                chosen_status = status_cycle[(m_idx + r_idx) % len(status_cycle)]
                await db.execute(
                    pg_insert(UserReadingStatus)
                    .values(
                        user_id=user.user_id,
                        manga_id=manga.pool_manga_id,
                        status=chosen_status,
                        updated_at=now - timedelta(hours=m_idx * 3 + r_idx),
                    )
                    .on_conflict_do_nothing(index_elements=["user_id", "manga_id"])
                )

                # Read first min(3, total) chapters
                num_read = min(len(m_chapters), 3 if r_idx == 0 else 2)
                last_ch = m_chapters[num_read - 1]
                for c_idx in range(num_read):
                    ch = m_chapters[c_idx]
                    is_done = c_idx < num_read - 1 or ch.page_count <= 2
                    last_pg = max(1, ch.page_count if is_done else min(3, ch.page_count))
                    await db.execute(
                        pg_insert(UserChapterRead)
                        .values(
                            user_id=user.user_id,
                            chapter_id=ch.pool_chapter_id,
                            manga_id=manga.pool_manga_id,
                            last_page_number=last_pg,
                            is_completed=is_done,
                            read_count=1,
                            first_read_at=now - timedelta(days=(m_idx % 7) + 1, hours=c_idx + 1),
                            last_read_at=now - timedelta(days=(m_idx % 6), hours=r_idx + 1),
                        )
                        .on_conflict_do_nothing(index_elements=["user_id", "chapter_id"])
                    )

                await db.execute(
                    pg_insert(UserMangaReadingHistory)
                    .values(
                        user_id=user.user_id,
                        manga_id=manga.pool_manga_id,
                        last_read_chapter_id=last_ch.pool_chapter_id,
                        last_read_page_number=min(3, max(1, last_ch.page_count)),
                        is_chapter_completed=last_ch.page_count <= 3,
                        first_read_at=now - timedelta(days=(m_idx % 7) + 1),
                        last_read_at=now - timedelta(hours=m_idx * 4 + r_idx),
                    )
                    .on_conflict_do_nothing(index_elements=["user_id", "manga_id"])
                )

                # Rate manga realistically (7..10 range)
                score = max(6, min(10, 10 - ((m_idx + r_idx * 2) % 4)))
                existing_rating = (
                    await db.execute(
                        select(MangaRating).where(
                            MangaRating.user_id == user.user_id,
                            MangaRating.manga_id == manga.pool_manga_id,
                        )
                    )
                ).scalar_one_or_none()
                if existing_rating is None:
                    db.add(
                        MangaRating(
                            user_id=user.user_id,
                            manga_id=manga.pool_manga_id,
                            score=score,
                        )
                    )
                    db.add(
                        MangaRatingHistory(
                            user_id=user.user_id,
                            manga_id=manga.pool_manga_id,
                            old_score=None,
                            new_score=score,
                            action="create",
                        )
                    )

            await db.flush()

            # Seed comments only if manga currently has no comments
            existing_comment_count = int(
                (
                    await db.execute(
                        select(func.count())
                        .select_from(Comment)
                        .where(
                            Comment.manga_id == manga.pool_manga_id,
                            Comment.is_deleted.is_(False),
                        )
                    )
                ).scalar_one()
                or 0
            )
            if existing_comment_count == 0:
                review_texts = _fetch_review_texts_for_manga(manga.source_manga_id)
                curated = FALLBACK_COMMENTS_BY_SLUG.get(manga.slug, [])
                comment_objs: list[Comment] = []

                for t_idx, text_val in enumerate(review_texts[:2]):
                    author = users_by_name[reader_names[t_idx % len(reader_names)]]
                    comment_objs.append(
                        Comment(
                            manga_id=manga.pool_manga_id,
                            user_id=author.user_id,
                            content=text_val,
                            is_spoiler=False,
                            like_count=4 + (m_idx + t_idx) % 7,
                        )
                    )

                for c_idx, (uname, ctext, is_sp) in enumerate(curated):
                    author = users_by_name.get(uname)
                    if author:
                        comment_objs.append(
                            Comment(
                                manga_id=manga.pool_manga_id,
                                chapter_id=m_chapters[0].pool_chapter_id if is_sp and m_chapters else None,
                                user_id=author.user_id,
                                content=ctext,
                                is_spoiler=is_sp,
                                spoiler_locked_by_admin=False,
                                like_count=6 + c_idx * 2,
                            )
                        )

                if not comment_objs and m_idx < 14:
                    author = users_by_name[reader_names[m_idx % len(reader_names)]]
                    comment_objs.append(
                        Comment(
                            manga_id=manga.pool_manga_id,
                            user_id=author.user_id,
                            content=f"{manga.title} có nhịp kể chuyện rất lôi cuốn, đáng để theo dõi dài lâu!",
                            is_spoiler=False,
                            like_count=3 + (m_idx % 5),
                        )
                    )

                for c in comment_objs:
                    db.add(c)
                await db.flush()

                # Add a reply & reaction on the first comment
                if comment_objs:
                    first_c = comment_objs[0]
                    replier = users_by_name[
                        reader_names[
                            (
                                reader_names.index(
                                    users_by_name["reader2"].username if "reader2" in users_by_name else reader_names[0]
                                )
                            )
                        ]
                    ]
                    if replier.user_id == first_c.user_id and len(reader_names) > 1:
                        replier = users_by_name[reader_names[-1]]
                    reply = Comment(
                        manga_id=manga.pool_manga_id,
                        user_id=replier.user_id,
                        parent_comment_id=first_c.comment_id,
                        content="Đồng ý luôn! Đặc biệt thích cách triển khai không khí ở những chương đầu.",
                        is_spoiler=False,
                        like_count=2,
                    )
                    db.add(reply)
                    await db.flush()
                    await db.execute(
                        pg_insert(CommentReaction)
                        .values(
                            comment_id=first_c.comment_id,
                            user_id=replier.user_id,
                            reaction=CommentReactionType.like,
                        )
                        .on_conflict_do_nothing(index_elements=["comment_id", "user_id"])
                    )
                    seeded_comments_count += len(comment_objs) + 1

            # Recalculate manga rating & comment counts accurately
            r_stats = (
                await db.execute(
                    select(func.count(MangaRating.score), func.coalesce(func.avg(MangaRating.score), 0)).where(
                        MangaRating.manga_id == manga.pool_manga_id
                    )
                )
            ).one()
            manga.rating_count = int(r_stats[0] or 0)
            manga.average_rating = Decimal(str(round(float(r_stats[1] or 0.0), 2)))

            c_cnt = int(
                (
                    await db.execute(
                        select(func.count())
                        .select_from(Comment)
                        .where(
                            Comment.manga_id == manga.pool_manga_id,
                            Comment.is_deleted.is_(False),
                        )
                    )
                ).scalar_one()
                or 0
            )
            manga.comment_count = c_cnt

        await db.commit()

        # 4. Seed Reading Lists & List Items (UC-7 / UC-8)
        list_specs = [
            (
                "reader1",
                "Action & Dark Fantasy Picks",
                "Top adrenaline & dark fantasy series currently reading.",
                "public",
                mangas[:5],
            ),
            (
                "reader1",
                "Weekend Mystery & Horror Vault",
                "Atmospheric psychological & supernatural short reads.",
                "private",
                mangas[5:9] if len(mangas) >= 9 else mangas[:3],
            ),
            (
                "reader2",
                "Rom-Com & Comedy Favorites",
                "Lighthearted series and timeless comedy classics.",
                "public",
                mangas[1:5],
            ),
        ]
        for uname, lname, ldesc, lvis, lmangas in list_specs:
            owner = users_by_name.get(uname)
            if not owner:
                continue
            existing_list = (
                await db.execute(
                    select(ReadingList).where(ReadingList.owner_id == owner.user_id, ReadingList.name == lname)
                )
            ).scalar_one_or_none()
            if existing_list is None:
                existing_list = ReadingList(
                    owner_id=owner.user_id,
                    name=lname,
                    description=ldesc,
                    visibility=lvis,
                    manga_count=0,
                )
                db.add(existing_list)
                await db.flush()

            for m in lmangas:
                await db.execute(
                    pg_insert(ReadingListItem)
                    .values(list_id=existing_list.list_id, manga_id=m.pool_manga_id)
                    .on_conflict_do_nothing(index_elements=["list_id", "manga_id"])
                )
            cnt = int(
                (
                    await db.execute(
                        select(func.count())
                        .select_from(ReadingListItem)
                        .where(ReadingListItem.list_id == existing_list.list_id)
                    )
                ).scalar_one()
                or 0
            )
            existing_list.manga_count = cnt

        await db.flush()
        for m in mangas:
            m.list_add_count = int(
                (
                    await db.execute(
                        select(func.count())
                        .select_from(ReadingListItem)
                        .where(ReadingListItem.manga_id == m.pool_manga_id)
                    )
                ).scalar_one()
                or 0
            )
        await db.commit()

        # 5. Ensure at least 2 pending moderation reports exist for live Admin/Moderator demo
        pending_count = int(
            (
                await db.execute(select(func.count()).select_from(Report).where(Report.status == ReportStatus.pending))
            ).scalar_one()
            or 0
        )
        if pending_count == 0 and mangas and "reader2" in users_by_name:
            reporter = users_by_name["reader2"]
            target_manga = mangas[0]
            first_ch = chapters_by_manga.get(target_manga.pool_manga_id, [None])[0]
            db.add(
                Report(
                    reporter_id=reporter.user_id,
                    target_type=ReportTargetType.manga,
                    target_manga_id=target_manga.pool_manga_id,
                    target_chapter_id=first_ch.pool_chapter_id if first_ch else None,
                    reason_category="broken_images",
                    description="Demo moderation ticket: Verify double-page spread alignment in Chapter 1.",
                    status=ReportStatus.pending,
                )
            )
            sample_comment = (
                await db.execute(
                    select(Comment).where(Comment.is_deleted.is_(False), Comment.is_spoiler.is_(False)).limit(1)
                )
            ).scalar_one_or_none()
            if sample_comment is not None:
                db.add(
                    Report(
                        reporter_id=reporter.user_id,
                        target_type=ReportTargetType.comment,
                        target_comment_id=sample_comment.comment_id,
                        reason_category="unmarked_spoiler",
                        description="Demo moderation ticket: Review whether this plot discussion needs a spoiler tag.",
                        status=ReportStatus.pending,
                    )
                )
            await db.commit()

    # 6. Recompute Content-Based, Item-Based & User-Based CF recommendation cache
    rec_result = await recompute_all_recommendations_task()
    print(f"[OK] Seeded demo interactions cleanly! RecSys recomputed: {rec_result}")


if __name__ == "__main__":
    asyncio.run(seed_demo_interactions())
