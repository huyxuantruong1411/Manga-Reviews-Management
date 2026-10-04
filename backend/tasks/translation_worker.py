"""ARQ background worker settings for Translation Studio.

Runs on dedicated queue 'arq:translation' with strict concurrency control.
Command to launch:
    uv run --project backend arq backend.tasks.translation_worker.WorkerSettings
"""

import logging
from typing import Any, Dict

from backend.core.redis import close_redis_pool, get_redis_settings, init_redis_pool
from backend.database.connection import close_mongo_connection, connect_to_mongo
from backend.database.indexes import init_db_indexes
from backend.tasks.translation import execute_translation_job_page

logger = logging.getLogger("translation_worker")


async def startup(ctx: Dict[str, Any]) -> None:
    """Initializes MongoDB and Redis resources upon translation worker launch."""
    logger.info("Initializing Translation ARQ worker...")
    try:
        await connect_to_mongo()
        await init_db_indexes()
        await init_redis_pool()
        logger.info("Translation ARQ Worker initialized with DB & Redis connections.")
    except Exception as e:
        logger.error(f"Failed during translation worker startup: {e}")
        raise


async def shutdown(ctx: Dict[str, Any]) -> None:
    """Gracefully closes resources upon worker shutdown."""
    logger.info("Shutting down Translation ARQ worker...")
    await close_redis_pool()
    await close_mongo_connection()
    logger.info("Translation ARQ Worker shutdown complete.")


class WorkerSettings:
    """
    Dedicated ARQ Worker configuration for manga translation.
    Default max_jobs is 1 to protect GPU/VRAM from concurrent inference crashes.
    """

    functions = [execute_translation_job_page]
    queue_name = "arq:translation"
    redis_settings = get_redis_settings()
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 1
    job_timeout = 600
    keep_result = 86400  # 24 hours
