"""Phase 7 Verification Tests: Health Probes (/health/live, /health/ready) & Background Worker Recomputation."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.main import app
from app.models import AccountStatus, AdminAuditLog, Manga, User, UserRole
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

EXAMPLE_PACKAGE_PATH = Path(__file__).resolve().parent.parent / "contracts" / "manga_reader_example_v2.json"


@pytest.fixture(autouse=True)
async def _clean_phase7_data() -> None:
    async with AsyncSessionLocal() as db:
        await db.execute(delete(AdminAuditLog))
        await db.execute(delete(User).where(User.email.like("%@test-mr7.com")))
        await db.execute(delete(Manga).where(Manga.pool_manga_id == "pm_1a2b3c4d5e6f"))
        await db.commit()


@pytest.mark.asyncio
async def test_health_probes_and_recsys_worker_endpoint() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        live_res = await client.get("/health/live")
        assert live_res.status_code == 200
        assert live_res.json()["status"] == "alive"

        ready_res = await client.get("/health/ready")
        assert ready_res.status_code == 200
        ready_data = ready_res.json()
        assert ready_data["status"] == "ready"
        assert ready_data["checks"]["postgres"] is True
        assert ready_data["checks"]["redis"] is True
        assert ready_data["checks"]["minio"] is True

        async with AsyncSessionLocal() as db:
            admin = User(
                email="admin_p7@test-mr7.com",
                username="admin_p7",
                password_hash=hash_password("AdminPass123"),
                display_name="Admin P7",
                role=UserRole.admin,
                status=AccountStatus.active,
            )
            db.add(admin)
            await db.commit()

        admin_token = (
            await client.post("/api/v1/auth/login", json={"email": "admin_p7@test-mr7.com", "password": "AdminPass123"})
        ).json()["access_token"]
        admin_h = {"Authorization": f"Bearer {admin_token}"}

        pkg = json.loads(EXAMPLE_PACKAGE_PATH.read_text(encoding="utf-8"))
        await client.post("/api/v1/admin/etl/ingest", headers=admin_h, json={"package": pkg, "cdc_enabled": True})

        worker_res = await client.post("/api/v1/admin/workers/recompute-recommendations", headers=admin_h)
        assert worker_res.status_code == 200
        assert worker_res.json()["status"] == "completed"
        assert worker_res.json()["processed_mangas"] >= 1
