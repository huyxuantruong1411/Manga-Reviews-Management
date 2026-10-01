# Backend Service (FastAPI)

> **Documentation**: Refer to [`docs/ai-context.md`](../docs/ai-context.md) and [`docs/development.md`](../docs/development.md).

## Quick Overview

- **Framework**: FastAPI (Python 3.12) + Motor (Async MongoDB) + Pydantic v2
- **Tasks & Caching**: Redis 7+ pool & ARQ background task worker
- **Vision Pipeline**: OpenCV, RapidOCR (ONNX), MangaOCR, spaCy (`en_core_web_sm`)
- **Object Storage**: MinIO S3 client (presigned URLs and in-memory cropping streams)

## Common Commands

Run from the repository root:
```bash
# Start API dev server
uv run --project backend uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000

# Start ARQ background worker
uv run --project backend arq backend.tasks.worker.WorkerSettings

# Run test suites
uv run --project backend python -m unittest backend/tests/test_redis_cache_and_worker.py
uv run --project backend python -m unittest backend/tests/test_panel_regressions.py
uv run --project backend python -m unittest backend/tests/test_system_regressions.py
```
