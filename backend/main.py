import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.database.connection import close_mongo_connection, connect_to_mongo
from backend.database.indexes import init_db_indexes
from backend.routers import (
    ai,
    analytics,
    audit_logs,
    chapters,
    cover_arts,
    creators,
    downloads,
    image_tools,
    manga,
    mangadex,
    recommendations,
    reviews,
    sync_manager,
    tags,
    tasks,
    vision,
)

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
logger = logging.getLogger("backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: connect to Mongo, init indexes, connect to Redis
    try:
        await connect_to_mongo()
        await init_db_indexes()

        # Initialize Redis connection pool (graceful fallback if offline)
        from backend.core.redis import init_redis_pool

        await init_redis_pool()

        # Auto-resume stuck or pending downloads
        from backend.services.download_service import download_service

        await download_service.auto_resume_tasks()
    except Exception as e:
        logger.critical(f"Failed to start database connections: {e}")
        await close_mongo_connection()
        raise
    yield
    # Shutdown: close Redis & Mongo connections
    from backend.core.redis import close_arq_pool, close_redis_pool

    await close_arq_pool()
    await close_redis_pool()
    await close_mongo_connection()


app = FastAPI(
    title="Manga Library API",
    description="Backend services for Manga Reviews & Library Management",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS setup
# Allow local React frontend (usually port 5173 or 3000)
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(manga.router)
app.include_router(reviews.router)
app.include_router(tags.router)
app.include_router(mangadex.router)
app.include_router(downloads.router)
app.include_router(analytics.router)
app.include_router(creators.router)
app.include_router(ai.router)
app.include_router(image_tools.router)
app.include_router(cover_arts.router)
app.include_router(recommendations.router)
app.include_router(sync_manager.router)
app.include_router(audit_logs.router)
app.include_router(chapters.router)
app.include_router(vision.router)
app.include_router(tasks.router)


@app.get("/health")
async def health_check():
    from backend.core.redis import check_redis_health

    redis_stat = await check_redis_health()
    return {
        "status": "ok",
        "service": "manga-library-backend",
        "redis": redis_stat,
    }


if __name__ == "__main__":
    import uvicorn

    logger.info(f"Starting server on {settings.host}:{settings.port}...")
    uvicorn.run("backend.main:app", host=settings.host, port=settings.port, reload=True)
