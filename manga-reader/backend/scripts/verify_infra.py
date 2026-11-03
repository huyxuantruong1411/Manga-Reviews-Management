#!/usr/bin/env python3
"""Infrastructure Verification Gate (Phase 0) for Manga Reader System v2.0.

Verifies:
1. All Docker bind-mount directories reside on Drive D (never Drive C).
2. PostgreSQL 16 connection on POSTGRES_HOST_PORT + extensions (uuid-ossp, pg_trgm, unaccent).
3. Redis connection on REDIS_HOST_PORT (PING -> PONG).
4. MinIO connection on MINIO_API_HOST_PORT + 3 buckets (manga-library, user-avatars, etl-staging).
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import asyncpg
import redis.asyncio as aioredis
from minio import Minio

BASE_DIR = Path(__file__).resolve().parent.parent


def load_dotenv_file(env_path: Path) -> dict[str, str]:
    """Parse key=value pairs from .env file without extra dependencies."""
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        values[k.strip()] = v.strip()
        os.environ.setdefault(k.strip(), v.strip())
    return values


def verify_drive_d_storage() -> None:
    """Confirm all Docker bind-mounted directories are on Drive D."""
    for folder in ("postgres_data", "redis_data", "minio_data"):
        p = (BASE_DIR / folder).resolve()
        if not p.exists():
            raise RuntimeError(f"Missing persistent folder: {p}")
        if not str(p).upper().startswith("D:"):
            raise RuntimeError(f"Persistent folder {p} is not on Drive D!")
    print("[PASS] Drive D Persistent Storage verified (postgres_data, redis_data, minio_data).")


async def verify_postgres() -> None:
    """Connect to PostgreSQL 16 and enable uuid-ossp, pg_trgm, unaccent extensions."""
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = int(os.environ.get("POSTGRES_HOST_PORT", "15432"))
    user = os.environ.get("POSTGRES_USER", "manga_user")
    password = os.environ.get("POSTGRES_PASSWORD", "manga_secret_pwd_change_me")
    database = os.environ.get("POSTGRES_DB", "manga_reader_db")

    conn = await asyncpg.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
    )
    try:
        version = await conn.fetchval("SELECT version();")
        for ext in ("uuid-ossp", "pg_trgm", "unaccent"):
            await conn.execute(f'CREATE EXTENSION IF NOT EXISTS "{ext}";')
        installed = await conn.fetch(
            "SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'pg_trgm', 'unaccent');"
        )
        ext_names = sorted(r["extname"] for r in installed)
        if len(ext_names) != 3:
            raise RuntimeError(f"Expected 3 extensions, found: {ext_names}")
        print(f"[PASS] PostgreSQL connected on port {port} ({version.split(',')[0]}). Extensions: {ext_names}")
    finally:
        await conn.close()


async def verify_redis() -> None:
    """Connect to Redis and verify PING -> PONG."""
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:16379/0")
    client = aioredis.from_url(redis_url, decode_responses=True)
    try:
        pong = await client.ping()
        if not pong:
            raise RuntimeError("Redis PING did not return True")
        print(f"[PASS] Redis connected ({redis_url}) -> PONG")
    finally:
        await client.aclose()


def verify_minio() -> None:
    """Connect to MinIO and verify required buckets exist."""
    endpoint = os.environ.get("MINIO_ENDPOINT", "localhost:19000")
    access_key = os.environ.get("MINIO_ROOT_USER", "minio_admin")
    secret_key = os.environ.get("MINIO_ROOT_PASSWORD", "minio_secret_pwd_change_me")
    secure = os.environ.get("MINIO_SECURE", "false").lower() == "true"

    required_buckets = [
        os.environ.get("MINIO_BUCKET_LIBRARY", "manga-library"),
        os.environ.get("MINIO_BUCKET_AVATARS", "user-avatars"),
        os.environ.get("MINIO_BUCKET_STAGING", "etl-staging"),
    ]

    client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
    for bucket in required_buckets:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
    existing = {b.name for b in client.list_buckets()}
    missing = [b for b in required_buckets if b not in existing]
    if missing:
        raise RuntimeError(f"Missing MinIO buckets: {missing}")
    print(f"[PASS] MinIO connected ({endpoint}). Buckets verified: {required_buckets}")


async def main() -> None:
    print("=== PHASE 0 INFRASTRUCTURE VERIFICATION GATE ===")
    load_dotenv_file(BASE_DIR / ".env")
    verify_drive_d_storage()
    await verify_postgres()
    await verify_redis()
    verify_minio()
    print("=== ALL PHASE 0 CHECKS PASSED 100% ===")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"[FAIL] Infrastructure verification failed: {exc}", file=sys.stderr)
        sys.exit(1)
