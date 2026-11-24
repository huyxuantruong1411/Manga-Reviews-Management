"""Standalone isolated FastAPI ASGI server for the External Source Connector.

Run via:
    uv run --project backend uvicorn backend.connector_app:app --host 127.0.0.1 --port 8001

Then expose safely with ngrok:
    ngrok http 8001

Security guarantee:
This ASGI application ONLY mounts `/api/connector/v1/*` and `/health`. None of the
personal review, manga management, deletion, or internal admin endpoints exist here.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.core.logging_config import setup_logging
from backend.core.request_logging import RequestLoggingMiddleware
from backend.database.connection import close_mongo_connection, connect_to_mongo
from backend.database.indexes import init_pool_db_indexes
from backend.routers import connector

setup_logging("connector", replace_uvicorn_access=True)
logger = logging.getLogger("backend.connector")


@asynccontextmanager
async def connector_lifespan(app: FastAPI):
    try:
        await connect_to_mongo()
        await init_pool_db_indexes()
        logger.info("External Source Connector initialized (pool database & indexes ready).")
    except Exception as exc:
        logger.critical(f"Failed to start External Source Connector: {exc}")
        await close_mongo_connection()
        raise
    yield
    await close_mongo_connection()


def _parse_allowed_origins() -> list[str]:
    base = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8020",
        "http://127.0.0.1:8020",
    ]
    extra = [o.strip() for o in (settings.connector_allowed_origins or "").split(",") if o.strip()]
    return list(dict.fromkeys([*base, *extra]))


def create_connector_app(*, enable_lifespan: bool = True) -> FastAPI:
    app = FastAPI(
        title="Manga Data Lake — External Source Connector",
        description=(
            "Isolated third-party Manga Source Gateway serving manga-reader-package v2.0, "
            "Zero-Copy pool-scoped media streaming, and signed CDC webhooks."
        ),
        version="1.0.0",
        lifespan=connector_lifespan if enable_lifespan else None,
        docs_url="/api/connector/v1/docs",
        redoc_url=None,
        openapi_url="/api/connector/v1/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_parse_allowed_origins(),
        allow_credentials=False,
        allow_methods=["GET", "HEAD", "POST", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "If-None-Match",
            "X-Connector-API-Key",
            "X-Request-ID",
            "ngrok-skip-browser-warning",
        ],
        expose_headers=[
            "ETag",
            "X-Request-ID",
            "X-Contract-Name",
            "X-Contract-Version",
            "X-Payload-SHA256",
            "X-Manifest-SHA256",
            "X-Pool-Revision",
            "X-Pages-Revision",
            "X-Content-SHA256",
            "X-Media-Bucket",
        ],
    )
    app.add_middleware(RequestLoggingMiddleware)

    app.include_router(connector.router)

    @app.get("/health")
    async def connector_health():
        return {
            "status": "ok",
            "service": "manga-datalake-connector",
            "source_system": settings.connector_source_system,
            "contract": "manga-reader-package:2.0",
        }

    return app


app = create_connector_app(enable_lifespan=True)


if __name__ == "__main__":
    import uvicorn

    logger.info(f"Starting External Source Connector on {settings.connector_host}:{settings.connector_port}...")
    uvicorn.run(
        "backend.connector_app:app",
        host=settings.connector_host,
        port=settings.connector_port,
        reload=False,
    )
