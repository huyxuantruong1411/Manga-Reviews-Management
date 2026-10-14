# Development Setup & Verification Guide

> **Source Reference**: [`docs/ai-context.md`](./ai-context.md)  
> **Source Commit Verified**: `c4a6dfb29309b0b0afd5343aa7c5327d31b252ad`

---

## 1. Prerequisites

- **Python**: `>=3.12` (managed via [`uv`](https://docs.astral.sh/uv/))
- **Node.js**: `>=20.x` & **pnpm**: `>=10.x`
- **Docker & Docker Compose**: For MinIO S3 and Redis services
- **MongoDB**: Standalone local instance or dedicated container running MongoDB 6.0+ on port `27017`

---

## 2. Infrastructure Setup

### Step 1: Configure Environment Variables
Copy the template to your local `.env`:
```bash
cp backend/.env.example backend/.env
```
Key configuration parameters:
- `MONGODB_URI`: `mongodb://localhost:27017`
- `MINIO_ENDPOINT`: `localhost:9000` (Access: `admin`, Secret: `password`, Bucket: `manga-library`)
- `REDIS_URL`: `redis://127.0.0.1:6379/0`
- `DOWNLOAD_DIR`: `./downloads`

### Step 2: Start MinIO and Redis Containers
MinIO and Redis are defined in [`backend/docker-compose.yml`](../backend/docker-compose.yml):
```bash
docker compose --env-file backend/.env -f backend/docker-compose.yml up -d minio redis
```
*Note*: MongoDB is not part of this Compose file. Ensure your local MongoDB daemon is running on `127.0.0.1:27017`.

### Step 3: Install Dependencies
```bash
# Backend dependencies (managed via uv)
uv sync --project backend

# Frontend dependencies (managed via pnpm)
pnpm --dir frontend install
```

### Step 4: Optional Browser Binaries (for Playwright MangaDex / Visual Testing)
```bash
uv run --project backend python -m playwright install chromium
```

---

## 3. Running the Services

Open separate terminal windows or process managers for each component:

### 1. Backend REST API
Run from the workspace root:
```bash
uv run --project backend uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```
Swagger UI will be available at `http://localhost:8000/docs`.

### 2. Asynchronous Task Worker (ARQ)
Run from the workspace root:
```bash
# Vision OCR worker
uv run --project backend arq backend.tasks.worker.WorkerSettings

# Translation Studio worker
uv run --project backend arq backend.tasks.translation_worker.WorkerSettings
```

### 3. Frontend Development Server
Run from the workspace root:
```bash
pnpm --dir frontend dev
```
The application will be accessible at `http://localhost:5173` (Observability at `/audit-logs`).

### 4. Standalone ELK Observability Stack (Optional)
Run from the workspace root:
```bash
python scripts/elk/bootstrap_env.py
docker compose -f infra/elk/docker-compose.elk.yml --env-file infra/elk/.env up -d
```
Kibana dashboard will be available at `http://localhost:5601` or via `/audit-logs?tab=kibana`. See [`docs/logging.md`](./logging.md).

---

## 4. Test Suites & Verification

### A. Backend Unit & Regression Tests
Execute the comprehensive test suite across backend and translator runtime:
```bash
# Run all backend and translator runtime tests
uv run --project backend python -m pytest backend/tests services/translator-runtime/tests
```

Or execute targeted tests:
```bash
# Redis cache pool, invalidation & ARQ worker tests
uv run --project backend python -m pytest backend/tests/test_redis_cache_and_worker.py

# Manga panel segmentation & OCR pipeline regressions
uv run --project backend python -m pytest backend/tests/test_panel_regressions.py

# System-level regressions (SSRF, cascades, storage)
uv run --project backend python -m pytest backend/tests/test_system_regressions.py

# Chapter export (PDF, ZIP, CBZ, Folder)
uv run --project backend python -m pytest backend/tests/test_chapter_export.py

# MangaOCR text cleaner unit tests
uv run --project backend python -m pytest backend/tests/test_manga_ocr_service.py

# Translation Studio: jobs, profiles, fonts, revisions & envelope tests
uv run --project backend python -m pytest backend/tests/test_translation_jobs.py backend/tests/test_translation_profiles.py backend/tests/test_translation_assets.py backend/tests/test_translation_revisions.py
uv run --project backend python -m pytest services/translator-runtime/tests/

# Structured Logging, Redaction, ES Sync & Observability APIs
uv run --project backend python -m pytest backend/tests/test_log_*.py backend/tests/test_logging_config.py backend/tests/test_request_logging.py backend/tests/test_elk_scripts.py backend/tests/test_system_logs_api.py backend/tests/test_audit_es_sync.py
```

### B. Frontend TypeScript, Linting & Production Build
```bash
# Typecheck
pnpm --dir frontend run typecheck

# Production bundle build
pnpm --dir frontend run build

# Playwright E2E & Observability tests
pnpm --dir frontend run test:e2e
```

### C. Visual Responsive Inspection (Playwright)
Capture multi-device screenshots (375px mobile, 768px tablet, 1280px desktop, 1920px FHD):
```bash
python scripts/visual_responsive_check.py --routes / manga/1 panel-words-detector
```

### D. Accessibility Audit (axe-core)
With the frontend dev server running on `http://localhost:5173`:
```bash
pnpm --dir frontend test:a11y
```

---

## 5. Troubleshooting & Common Issues

- **Redis Offline**: If Redis is offline, the API operates in fallback mode (direct DB reads). Background OCR enqueue calls (`POST /tasks/ocr`) will return HTTP 503.
- **Elasticsearch Offline**: If Elasticsearch is offline, the backend falls back to MongoDB for audit log queries and streams local NDJSON files (`logs/manga-*.ndjson`) for application logs without raising errors.
- **Port Conflicts**: Ensure ports `8000` (FastAPI), `5173` (Vite), `9000/9001` (MinIO API/Console), `6379` (Redis), `9200` (Elasticsearch), `5601` (Kibana), and `27017` (MongoDB) are available.
- **MangaDex Rate Limits (429)**: The backend automatically falls back to headless Playwright browser emulation when MangaDex enforces Cloudflare rate limiting.
