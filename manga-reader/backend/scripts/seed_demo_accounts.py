#!/usr/bin/env python3
"""Seed sample test accounts for Manga Reader (Admin, Moderator, Readers).

Idempotent: updates existing accounts or inserts new active verified accounts.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models import AccountStatus, User, UserRole

DEMO_ACCOUNTS = [
    {
        "email": "admin@mangareader.com",
        "username": "admin",
        "display_name": "Quản Trị Viên (Admin)",
        "password": "Admin123456",
        "role": UserRole.admin,
        "bio": "Hệ thống Quản trị viên Manga Reader & Data Lake.",
    },
    {
        "email": "mod@mangareader.com",
        "username": "moderator",
        "display_name": "Kiểm Duyệt Viên (Moderator)",
        "password": "Mod123456",
        "role": UserRole.moderator,
        "bio": "Kiểm duyệt nội dung, xử lý báo cáo và khóa bình luận vi phạm.",
    },
    {
        "email": "reader1@mangareader.com",
        "username": "reader1",
        "display_name": "Độc Giả 01 (Huy Reader)",
        "password": "Reader123456",
        "role": UserRole.reader,
        "bio": "Độc giả đam mê Manga phiêu lưu hành động.",
    },
    {
        "email": "reader2@mangareader.com",
        "username": "reader2",
        "display_name": "Độc Giả 02 (Otaku VIP)",
        "password": "Reader123456",
        "role": UserRole.reader,
        "bio": "Tín đồ truyện tranh slice of life & romance.",
    },
]


async def seed_accounts() -> None:
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        for acc in DEMO_ACCOUNTS:
            stmt = select(User).where((User.email == acc["email"]) | (User.username == acc["username"]))
            res = await db.execute(stmt)
            existing = res.scalars().first()

            pw_hash = hash_password(acc["password"])

            if existing:
                existing.email = acc["email"]
                existing.password_hash = pw_hash
                existing.role = acc["role"]
                existing.status = AccountStatus.active
                existing.display_name = acc["display_name"]
                existing.bio = acc["bio"]
                existing.email_verified_at = now
                print(f"[UPDATED] {acc['username']} ({acc['email']}) -> role={acc['role'].value}, status=active")
            else:
                new_user = User(
                    user_id=uuid.uuid4(),
                    email=acc["email"],
                    username=acc["username"],
                    display_name=acc["display_name"],
                    password_hash=pw_hash,
                    role=acc["role"],
                    status=AccountStatus.active,
                    email_verified_at=now,
                    bio=acc["bio"],
                    created_at=now,
                    updated_at=now,
                )
                db.add(new_user)
                print(f"[CREATED] {acc['username']} ({acc['email']}) -> role={acc['role'].value}, status=active")

        await db.commit()
    print("\n[SUCCESS] All demo accounts seeded and ready for testing!")


if __name__ == "__main__":
    asyncio.run(seed_accounts())

