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

### Step 1: Start MinIO and Redis Containers
MinIO and Redis are defined in [`backend/docker-compose.yml`](../backend/docker-compose.yml):
```bash
docker compose -f backend/docker-compose.yml up -d minio redis
```
*Note*: MongoDB is not part of this Compose file. Ensure your local MongoDB daemon is running on `127.0.0.1:27017`.

### Step 2: Configure Environment Variables
Copy the template to your local `.env`:
```bash
cp backend/.env.example backend/.env
```
Key configuration parameters:
- `MONGODB_URI`: `mongodb://localhost:27017`
- `MINIO_ENDPOINT`: `localhost:9000` (Access: `admin`, Secret: `password`, Bucket: `manga-library`)
- `REDIS_URL`: `redis://127.0.0.1:6379/0`
- `DOWNLOAD_DIR`: `./downloads`

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
uv run --project backend arq backend.tasks.worker.WorkerSettings
```

### 3. Frontend Development Server
Run from the workspace root:
```bash
pnpm --dir frontend dev
```
The application will be accessible at `http://localhost:5173`.

---

## 4. Test Suites & Verification

### A. Backend Unit & Regression Tests
Execute targeted unit tests using Python's standard unittest runner:
```bash
# Redis cache pool, invalidation & ARQ worker tests
uv run --project backend python -m unittest backend/tests/test_redis_cache_and_worker.py

# Manga panel segmentation & OCR pipeline regressions
uv run --project backend python -m unittest backend/tests/test_panel_regressions.py

# System-level regressions (SSRF, cascades, storage)
uv run --project backend python -m unittest backend/tests/test_system_regressions.py

# MangaOCR text cleaner unit tests
uv run --project backend python -m unittest backend/tests/test_manga_ocr_service.py
```

### B. Frontend TypeScript & Production Build
```bash
# Typecheck
pnpm --dir frontend tsc -b

# Production bundle build
pnpm --dir frontend build
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
- **Port Conflicts**: Ensure ports `8000` (FastAPI), `5173` (Vite), `9000/9001` (MinIO API/Console), `6379` (Redis), and `27017` (MongoDB) are available.
- **MangaDex Rate Limits (429)**: The backend automatically falls back to headless Playwright browser emulation when MangaDex enforces Cloudflare rate limiting.
