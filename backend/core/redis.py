import asyncio
import json
import logging
from datetime import date, datetime
from functools import wraps
from typing import Any, Callable, Dict, List, Optional

from arq.connections import ArqRedis, RedisSettings
from arq.connections import create_pool as create_arq_pool
from bson import ObjectId
from redis.asyncio import ConnectionPool, Redis
from redis.exceptions import RedisError

from backend.config import settings

logger = logging.getLogger("core.redis")

# Singleton pool and client references with loop tracking
_redis_pool: Optional[ConnectionPool] = None
_redis_client: Optional[Redis] = None
_redis_loop: Any = None


class JSONEncoderWithDefaults(json.JSONEncoder):
    """Custom JSON encoder handling ObjectId, datetime, and set."""

    def default(self, o: Any) -> Any:
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, set):
            return list(o)
        return super().default(o)


def serialize_for_cache(value: Any) -> str:
    """Serialize Python object to JSON string for Redis storage."""
    return json.dumps(value, cls=JSONEncoderWithDefaults)


def deserialize_from_cache(raw: str) -> Any:
    """Deserialize JSON string from Redis cache."""
    return json.loads(raw)


async def init_redis_pool() -> Optional[Redis]:
    """
    Initialize Redis connection pool and test connectivity.
    Falls back gracefully if Redis is unavailable, without raising fatal exceptions.
    """
    global _redis_pool, _redis_client, _redis_loop

    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _redis_client is not None and _redis_loop is current_loop:
        return _redis_client

    try:
        logger.info(f"Connecting to Redis at {settings.redis_url}...")
        _redis_pool = ConnectionPool.from_url(
            settings.redis_url,
            max_connections=20,
            decode_responses=True,
            socket_timeout=3.0,
            socket_connect_timeout=3.0,
        )
        client = Redis(connection_pool=_redis_pool)
        # Test connection ping
        await client.ping()
        _redis_client = client
        _redis_loop = current_loop
        logger.info("Connected to Redis successfully.")
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis connection failed ({e}). Running in fallback mode without caching/task queue.")
        _redis_client = None
        _redis_pool = None
        _redis_loop = None
        return None


async def close_redis_pool() -> None:
    """Close Redis client and connection pool during application shutdown."""
    global _redis_pool, _redis_client, _redis_loop
    if _redis_client is not None:
        try:
            if hasattr(_redis_client, "aclose"):
                await _redis_client.aclose()
            else:
                await _redis_client.close()
            logger.info("Redis client closed.")
        except Exception as e:
            logger.warning(f"Error closing Redis client: {e}")
        finally:
            _redis_client = None

    if _redis_pool is not None:
        try:
            if hasattr(_redis_pool, "aclose"):
                await _redis_pool.aclose()
            elif hasattr(_redis_pool, "disconnect"):
                await _redis_pool.disconnect()
            logger.info("Redis connection pool disconnected.")
        except Exception as e:
            logger.warning(f"Error disconnecting Redis pool: {e}")
        finally:
            _redis_pool = None

    _redis_loop = None


async def get_redis_client() -> Optional[Redis]:
    """Get active Redis client instance or attempt lazy initialization."""
    global _redis_client, _redis_pool, _redis_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _redis_client is not None and _redis_loop is not None and _redis_loop is not current_loop:
        # Reset references if event loop changed
        _redis_client = None
        _redis_pool = None
        _redis_loop = None

    if _redis_client is None:
        await init_redis_pool()
    return _redis_client


async def check_redis_health() -> Dict[str, Any]:
    """Check health and ping Redis server."""
    client = await get_redis_client()
    if client is None:
        return {"status": "unhealthy", "connected": False, "detail": "Redis client not initialized"}
    try:
        pong = await client.ping()
        return {"status": "healthy" if pong else "unhealthy", "connected": bool(pong)}
    except (RedisError, ConnectionError, OSError) as e:
        logger.warning(f"Redis health check failed: {e}")
        return {"status": "unhealthy", "connected": False, "error": str(e)}


async def get_cache(key: str) -> Optional[Any]:
    """
    Retrieve cached data from Redis.
    Returns None if cache misses or if Redis encounters an error (graceful fallback).
    """
    try:
        client = await get_redis_client()
        if client is None:
            return None
        val = await client.get(key)
        if val is None:
            return None
        return deserialize_from_cache(val)
    except (RedisError, ConnectionError, OSError, json.JSONDecodeError) as e:
        logger.warning(f"Cache GET error for key '{key}': {e}. Falling back to source.")
        return None


async def set_cache(key: str, value: Any, ttl: Optional[int] = 300) -> bool:
    """
    Store serialized data into Redis cache with TTL (in seconds).
    Returns False on failure without raising exceptions (graceful fallback).
    """
    try:
        client = await get_redis_client()
        if client is None:
            return False
        payload = serialize_for_cache(value)
        if ttl and ttl > 0:
            await client.setex(name=key, time=ttl, value=payload)
        else:
            await client.set(name=key, value=payload)
        return True
    except (RedisError, ConnectionError, OSError, TypeError) as e:
        logger.warning(f"Cache SET error for key '{key}': {e}.")
        return False


async def delete_cache(key: str) -> bool:
    """
    Delete a specific key from Redis cache.
    Returns False on failure without raising exceptions.
    """
    try:
        client = await get_redis_client()
        if client is None:
            return False
        await client.delete(key)
        return True
    except (RedisError, ConnectionError, OSError) as e:
        logger.warning(f"Cache DELETE error for key '{key}': {e}.")
        return False


async def delete_cache_pattern(pattern: str) -> int:
    """
    Delete all keys matching a glob-style pattern (e.g. 'manga:*').
    Returns count of deleted keys.
    """
    try:
        client = await get_redis_client()
        if client is None:
            return 0
        keys: List[str] = []
        async for k in client.scan_iter(match=pattern, count=100):
            keys.append(k)
        if keys:
            deleted = await client.delete(*keys)
            return deleted
        return 0
    except (RedisError, ConnectionError, OSError) as e:
        logger.warning(f"Cache DELETE pattern error for '{pattern}': {e}.")
        return 0


def cached(key_builder: Callable[..., str], ttl: int = 300):
    """
    Decorator for caching async function results in Redis.
    If Redis fails or key is missing, falls back transparently to underlying function.
    """

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = key_builder(*args, **kwargs)
            cached_val = await get_cache(key)
            if cached_val is not None:
                return cached_val
            result = await func(*args, **kwargs)
            if result is not None:
                await set_cache(key, result, ttl=ttl)
            return result

        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# ARQ Background Task Queue Connection Helpers
# ---------------------------------------------------------------------------

_arq_pool: Optional[ArqRedis] = None
_arq_loop: Any = None


def get_redis_settings() -> RedisSettings:
    """Parse application REDIS_URL into ARQ RedisSettings."""
    return RedisSettings.from_dsn(settings.redis_url)


async def get_arq_pool() -> Optional[ArqRedis]:
    """Get or initialize singleton ArqRedis pool for task enqueuing."""
    global _arq_pool, _arq_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _arq_pool is not None and _arq_loop is not None and _arq_loop is not current_loop:
        _arq_pool = None
        _arq_loop = None

    if _arq_pool is None:
        try:
            _arq_pool = await create_arq_pool(get_redis_settings())
            _arq_loop = current_loop
        except Exception as e:
            logger.warning(f"Failed to create ARQ Redis pool ({e}). Background task enqueuing unavailable.")
            return None
    return _arq_pool


async def close_arq_pool() -> None:
    """Close ARQ Redis pool on shutdown."""
    global _arq_pool, _arq_loop
    if _arq_pool is not None:
        try:
            if hasattr(_arq_pool, "aclose"):
                await _arq_pool.aclose()
            else:
                await _arq_pool.close()
            logger.info("ARQ Redis pool closed.")
        except Exception as e:
            logger.warning(f"Error closing ARQ Redis pool: {e}")
        finally:
            _arq_pool = None
    _arq_loop = None
