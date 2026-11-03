"""FastAPI Entry Point for Manga Reader System v2.0."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.redis import close_redis, get_redis
from app.core.storage import storage_service
from app.modules.mod1_reader_activity.router import router as mod1_router
from app.modules.mod6_user_profile.router import router as mod6_router


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


@app.get("/health/live", tags=["Health"])
async def health_live() -> dict[str, str]:
    """Kubernetes Liveness Probe."""
    return {"status": "alive", "service": settings.PROJECT_NAME}
