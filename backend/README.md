# Backend Service (FastAPI)

> **Documentation**: Refer to [`docs/ai-context.md`](../docs/ai-context.md) and [`docs/development.md`](../docs/development.md).

## Quick Overview

- **Framework**: FastAPI (Python 3.12) + Motor (Async MongoDB) + Pydantic v2
- **Tasks & Caching**: Redis 7+ pool & ARQ background task workers (`ocr`, `translation`)
- **Vision Pipeline**: OpenCV, RapidOCR (ONNX), MangaOCR, spaCy (`en_core_web_sm`)
- **Object Storage**: MinIO S3 client (presigned URLs, `.mgtile` optimization, in-memory panel crops)
- **Analytics & Connector**: Read-only Arrow IPC delivery (`/api/analytics-lab/*`) backed by [`analytics/`](../analytics/RUNBOOK.md), plus isolated Data Lake Connector ASGI (`backend/connector_app.py`, port `8001`)

## Common Commands

Run from the repository root:
```bash
# Start API dev server
uv run --project backend uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

# Start External Source Connector gateway (optional)
uv run --project backend uvicorn backend.connector_app:app --host 127.0.0.1 --port 8001

# Start ARQ background worker
uv run --project backend arq backend.tasks.worker.WorkerSettings

# Run Ruff checks & test suites
uv run --project backend python scripts/ci/check_python.py
uv run --project backend python -m pytest backend/tests services/translator-runtime/tests
uv run --project analytics python -m pytest analytics/tests/
```
