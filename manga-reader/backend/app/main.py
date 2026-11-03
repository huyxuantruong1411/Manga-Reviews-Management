"""FastAPI Entry Point for Manga Reader System v2.0."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.redis import close_redis, get_redis
from app.core.security import get_current_admin
from app.core.storage import storage_service
from app.models import User
from app.modules.mod1_reader_activity.router import router as mod1_router
from app.modules.mod2_manga_management.router import router as mod2_router
from app.modules.mod3_manga_discovery.router import router as mod3_router
from app.modules.mod4_manga_reader.router import router as mod4_router
from app.modules.mod5_comments.router import router as mod5_router
from app.modules.mod6_user_profile.router import router as mod6_router
from app.modules.mod7_reading_lists.router import router as mod7_router
from app.modules.mod8_list_items.router import router as mod8_router
from app.workers.tasks import recompute_all_recommendations_task


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialize MinIO buckets and Redis pool on startup, close cleanly on shutdown."""
    try:
        storage_service.ensure_buckets()
    except Exception:
        pass
    await get_redis()
    yield
    await close_redis()


app = FastAPI(
    title="Manga Reader System v2.0 API",
    description="Standalone Manga Reader Platform receiving Data Contract v2.0 packages from Manga Data Lake & Storage Pool.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(mod6_router)
app.include_router(mod1_router)
app.include_router(mod2_router)
app.include_router(mod3_router)
app.include_router(mod4_router)
app.include_router(mod5_router)
app.include_router(mod8_router)
app.include_router(mod7_router)


@app.get("/health/live", tags=["Health"])
async def health_live() -> dict[str, str]:
    """Kubernetes Liveness Probe."""
    return {"status": "alive", "service": settings.PROJECT_NAME}


@app.get("/health/ready", tags=["Health"])
async def health_ready(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Kubernetes Readiness Probe checking PostgreSQL, Redis, and MinIO S3 buckets."""
    pg_ok = False
    try:
        await db.execute(text("SELECT 1"))
        pg_ok = True
    except Exception:
        pg_ok = False

    redis_ok = False
    try:
        r_client = await get_redis()
        if r_client is not None:
            await r_client.ping()
            redis_ok = True
    except Exception:
        redis_ok = False

    minio_ok = False
    try:
        storage_service.ensure_buckets()
        minio_ok = True
    except Exception:
        minio_ok = False

    overall = "ready" if (pg_ok and redis_ok and minio_ok) else "degraded"
    return {
        "status": overall,
        "service": settings.PROJECT_NAME,
        "checks": {
            "postgres": pg_ok,
            "redis": redis_ok,
            "minio": minio_ok,
        },
    }


@app.post("/api/v1/admin/workers/recompute-recommendations", tags=["Workers"])
async def trigger_recompute_recommendations(
    _admin: User = Depends(get_current_admin),
) -> dict[str, Any]:
    """Trigger full recommendation matrix recomputation (Content-Based & Item-Based CF)."""
    return await recompute_all_recommendations_task()
