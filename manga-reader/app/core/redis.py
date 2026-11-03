"""Redis 7 async connection pool, caching, OTP, brute-force, rate-limit, and session revocation."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_clients: dict[int, aioredis.Redis] = {}
_fallback_store: dict[str, tuple[Any, float | None]] = {}


def _get_loop_id() -> int:
    try:
        return id(asyncio.get_running_loop())
    except RuntimeError:
        return 0


async def get_redis() -> aioredis.Redis | None:
    """Return a loop-bound Redis client, or None if unavailable."""
    loop_id = _get_loop_id()
    client = _redis_clients.get(loop_id)
    if client is not None:
        return client
    try:
        client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2.0,
            socket_timeout=2.0,
        )
        await client.ping()
        _redis_clients[loop_id] = client
        return client
    except Exception as exc:
        logger.warning("Redis connection unavailable (%s), using in-memory fallback", exc)
        return None


async def close_redis() -> None:
    """Close loop-bound Redis client if open."""
    loop_id = _get_loop_id()
    client = _redis_clients.pop(loop_id, None)
    if client is not None:
        await client.aclose()


def _fallback_get(key: str) -> str | None:
    entry = _fallback_store.get(key)
    if entry is None:
        return None
    val, exp = entry
    if exp is not None and time.time() > exp:
        _fallback_store.pop(key, None)
        return None
    return str(val)


def _fallback_set(key: str, value: str, ttl_seconds: int | None = None) -> None:
    exp = (time.time() + ttl_seconds) if ttl_seconds else None
    _fallback_store[key] = (value, exp)


async def redis_get(key: str) -> str | None:
    client = await get_redis()
    if client is not None:
        try:
            val = await client.get(key)
            if val is not None:
                return str(val)
        except Exception as exc:
            logger.debug("Redis GET failed for %s: %s", key, exc)
    return _fallback_get(key)


async def redis_set(key: str, value: str, ttl_seconds: int | None = None) -> None:
    _fallback_set(key, value, ttl_seconds)
    client = await get_redis()
    if client is not None:
        try:
            if ttl_seconds:
                await client.setex(key, ttl_seconds, value)
            else:
                await client.set(key, value)
        except Exception as exc:
            logger.debug("Redis SET failed for %s: %s", key, exc)


async def redis_delete(key: str) -> None:
    _fallback_store.pop(key, None)
    client = await get_redis()
    if client is not None:
        try:
            await client.delete(key)
        except Exception as exc:
            logger.debug("Redis DEL failed for %s: %s", key, exc)


async def redis_delete_prefix(prefix: str) -> None:
    for k in [k for k in list(_fallback_store.keys()) if k.startswith(prefix)]:
        _fallback_store.pop(k, None)
    client = await get_redis()
    if client is not None:
        try:
            keys = [k async for k in client.scan_iter(match=f"{prefix}*")]
            if keys:
                await client.delete(*keys)
        except Exception as exc:
            logger.debug("Redis DEL prefix failed for %s: %s", prefix, exc)


async def cache_get_json(key: str) -> Any | None:
    raw = await redis_get(key)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


async def cache_set_json(key: str, data: Any, ttl_seconds: int = 300) -> None:
    await redis_set(key, json.dumps(data, default=str), ttl_seconds=ttl_seconds)


# --- OTP Management (UC-6.5: 120s TTL) ---
async def store_email_otp(email: str, otp_code: str, ttl_seconds: int | None = None) -> None:
    ttl = ttl_seconds or settings.EMAIL_OTP_EXPIRE_SECONDS
    await redis_set(f"otp:verify:{email.lower()}", otp_code, ttl_seconds=ttl)


async def get_email_otp(email: str) -> str | None:
    return await redis_get(f"otp:verify:{email.lower()}")


async def consume_email_otp(email: str) -> None:
    await redis_delete(f"otp:verify:{email.lower()}")


# --- Login Brute-Force Protection (UC-6.4: lock 15 min on >= 5 failed attempts) ---
async def get_login_failures(identifier: str) -> int:
    val = await redis_get(f"login_fail:{identifier.lower()}")
    return int(val) if val and val.isdigit() else 0


async def record_login_failure(identifier: str, window_seconds: int = 900) -> int:
    key = f"login_fail:{identifier.lower()}"
    current = await get_login_failures(identifier) + 1
    await redis_set(key, str(current), ttl_seconds=window_seconds)
    return current


async def reset_login_failures(identifier: str) -> None:
    await redis_delete(f"login_fail:{identifier.lower()}")


# --- Instant Session / Token Version Sync (UC-1.2 NFR1, UC-6.3) ---
async def set_cached_token_version(user_id: str, token_version: int) -> None:
    await redis_set(f"user:token_ver:{user_id}", str(token_version), ttl_seconds=86400 * 7)


async def get_cached_token_version(user_id: str) -> int | None:
    val = await redis_get(f"user:token_ver:{user_id}")
    return int(val) if val and val.isdigit() else None


# --- Rate Limiting & Comment Cooldown (UC-5.2, UC-4.9, UC-5.7, UC-6.6) ---
async def check_and_increment_rate_limit(scope: str, identifier: str, max_requests: int, window_seconds: int) -> bool:
    """Return True if allowed, False if rate limit exceeded."""
    key = f"ratelimit:{scope}:{identifier}"
    val = await redis_get(key)
    count = int(val) if val and val.isdigit() else 0
    if count >= max_requests:
        return False
    await redis_set(key, str(count + 1), ttl_seconds=window_seconds)
    return True


# --- Anti-F5 View Count Filter (UC-2.5 BR1) ---
async def acquire_view_count_slot(identifier: str, chapter_id: str, cooldown_seconds: int = 1800) -> bool:
    """Return True if this (user_or_ip, chapter_id) has not been counted within cooldown window."""
    key = f"view_cooldown:{identifier}:{chapter_id}"
    existing = await redis_get(key)
    if existing is not None:
        return False
    await redis_set(key, "1", ttl_seconds=cooldown_seconds)
    return True
