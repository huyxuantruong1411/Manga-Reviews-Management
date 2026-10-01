import logging
from typing import Any, Dict

from backend.core.redis import close_redis_pool, get_redis_settings, init_redis_pool
from backend.database.connection import close_mongo_connection, connect_to_mongo
from backend.database.indexes import init_db_indexes
from backend.tasks.ocr import process_manga_panel_ocr

logger = logging.getLogger("worker")


async def startup(ctx: Dict[str, Any]) -> None:
    """Initialize database and redis resources upon ARQ worker startup."""
    logger.info("Initializing ARQ background worker...")
    try:
        await connect_to_mongo()
        await init_db_indexes()
        await init_redis_pool()
        logger.info("ARQ Worker initialized with DB & Redis connections.")
    except Exception as e:
        logger.error(f"Failed during worker startup: {e}")
        raise


async def shutdown(ctx: Dict[str, Any]) -> None:
    """Gracefully close database and redis connections on worker stop."""
    logger.info("Shutting down ARQ background worker...")
    await close_redis_pool()
    await close_mongo_connection()
    logger.info("ARQ Worker shutdown complete.")


class WorkerSettings:
    """
    ARQ Worker configuration.
    Run from command line using:
      uv run --project backend arq backend.tasks.worker.WorkerSettings
    """

    functions = [process_manga_panel_ocr]
    redis_settings = get_redis_settings()
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 8
    job_timeout = 300
    keep_result = 86400  # Keep finished task results for 24h
