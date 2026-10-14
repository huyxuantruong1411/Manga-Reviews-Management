"""Async Elasticsearch client management with graceful fallback and health checking."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from elasticsearch import AsyncElasticsearch

from backend.config import settings

logger = logging.getLogger("core.elasticsearch")

_es_client: AsyncElasticsearch | None = None
_es_loop: Any = None


async def init_es_client() -> AsyncElasticsearch | None:
    """Initialize async Elasticsearch client and test connectivity.

    Falls back gracefully if disabled or unavailable, without raising fatal exceptions.
    """
    global _es_client, _es_loop

    if not settings.es_enabled:
        logger.info("Elasticsearch is disabled (es_enabled=False). Running without ELK.")
        _es_client = None
        _es_loop = None
        return None

    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _es_client is not None and _es_loop is current_loop:
        return _es_client

    try:
        logger.info(f"Connecting to Elasticsearch at {settings.es_url}...")
        kwargs: dict[str, Any] = {
            "hosts": [settings.es_url],
            "request_timeout": settings.es_request_timeout_s,
        }
        if settings.es_username and settings.es_password:
            kwargs["basic_auth"] = (settings.es_username, settings.es_password)

        client = AsyncElasticsearch(**kwargs)
        is_alive = await client.ping()
        if not is_alive:
            logger.warning(f"Elasticsearch ping failed at {settings.es_url}. Running in fallback mode without ELK.")
            await client.close()
            _es_client = None
            _es_loop = None
            return None

        _es_client = client
        _es_loop = current_loop
        logger.info("Connected to Elasticsearch successfully.")
        return _es_client
    except Exception as e:
        logger.warning(f"Elasticsearch connection failed ({e}). Running in fallback mode without ELK.")
        _es_client = None
        _es_loop = None
        return None


async def close_es_client() -> None:
    """Close async Elasticsearch client during application shutdown."""
    global _es_client, _es_loop
    if _es_client is not None:
        try:
            await _es_client.close()
            logger.info("Elasticsearch client closed.")
        except Exception as e:
            logger.warning(f"Error closing Elasticsearch client: {e}")
        finally:
            _es_client = None
            _es_loop = None


def get_es_client() -> AsyncElasticsearch | None:
    """Return active AsyncElasticsearch client reference, or None if unavailable."""
    return _es_client


async def check_es_health() -> dict[str, Any]:
    """Check connectivity and cluster health status for FastAPI /health endpoint."""
    if not settings.es_enabled:
        return {"status": "disabled", "connected": False}

    client = get_es_client()
    if client is None:
        # Attempt reconnect once
        client = await init_es_client()
        if client is None:
            return {"status": "unhealthy", "connected": False}

    try:
        health = await client.cluster.health()
        return {
            "status": health.get("status", "unknown"),
            "connected": True,
            "cluster_name": health.get("cluster_name"),
            "number_of_nodes": health.get("number_of_nodes"),
        }
    except Exception as e:
        logger.warning(f"Error checking Elasticsearch health: {e}")
        return {"status": "unhealthy", "connected": False, "error": str(e)}
