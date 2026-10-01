# AI Context & Project Orientation

> **Target Audience**: AI Coding Assistants (Claude, GPT, Gemini, Cursor, Copilot) & External Contributors.  
> **Source Commit Verified**: `c4a6dfb29309b0b0afd5343aa7c5327d31b252ad`  
> **Primary Rule**: Code, manifests, and test fixtures are the authoritative ground truth. This document is an orientation guide.

---

## 1. Project Purpose & Scope

**Manga Reviews Management** is a self-hosted personal manga management and computer vision exploration ecosystem. It provides:
- A MangaDex-synchronized library manager (metadata, covers, chapters, creators, tags).
- A high-speed reader supporting Webtoon, Single-page, and Double-page modes.
- A rich WYSIWYG review editor (TipTap) with interactive manga cards and Gemini AI writing assistance.
- A **Panel Words Detector**: comic panel dialogue extraction and lexical search via OpenCV contour segmentation, RapidOCR (PP-OCRv4), dictionary lemmatization (spaCy), and MangaOCR cleanups.
- An asynchronous task worker (ARQ + Redis) for background OCR and a Redis caching layer.

---

## 2. Technology Stack & Manifest Truth

Always refer to project manifests and lockfiles rather than assumptions:

| Component | Manifest Source | Pinned / Declared Stack | Role |
|---|---|---|---|
| **Backend** | [`backend/pyproject.toml`](../backend/pyproject.toml) | Python `>=3.12`, FastAPI `>=0.110.0`, Motor `>=3.3.2`, Pydantic `>=2.6.4`, Uvicorn | Async REST API, DB abstraction, background coordination |
| **Vision & NLP** | [`backend/pyproject.toml`](../backend/pyproject.toml) | OpenCV (headless), RapidOCR-ONNX, spaCy (`en_core_web_sm`), wordninja, manga-ocr | Panel segmentation, text detection, lemmatization |
| **Caching & Queue** | [`backend/pyproject.toml`](../backend/pyproject.toml) | Redis-py `>=5.0.0`, ARQ `>=0.26.0` | In-memory key-value cache, async background OCR queue |
| **Frontend** | [`frontend/package.json`](../frontend/package.json) | React `^19.2.6`, Vite `^8.0.12`, TypeScript `~6.0.2`, Tailwind CSS `^4.3.0`, shadcn/ui (`radix-nova`), TipTap `^3.23.5` | Single-Page Application (SPA) reader, review editor, search UI |
| **Datastores** | External / [`backend/docker-compose.yml`](../backend/docker-compose.yml) | MongoDB 6.0+ (standalone), MinIO S3 (pages/covers), Redis 7+ Alpine | Persistent metadata, S3 media storage, transient caching/jobs |

---

## 3. System Entry Points

- **Backend API**: [`backend/main.py`](../backend/main.py)
  - Run command: `uv run --project backend uvicorn backend.main:app --reload --port 8000`
  - Lifespan initializes: MongoDB client, MinIO bucket, Redis cache pool, ARQ task pool, and database indexes.
- **ARQ Task Worker**: [`backend/tasks/worker.py`](../backend/tasks/worker.py)
  - Run command: `uv run --project backend arq backend.tasks.worker.WorkerSettings`
  - Consumes queue jobs: `process_manga_panel_ocr` (defined in [`backend/tasks/ocr.py`](../backend/tasks/ocr.py)).
- **Frontend SPA**: [`frontend/src/main.tsx`](../frontend/src/main.tsx) & [`frontend/src/App.tsx`](../frontend/src/App.tsx)
  - Run command: `pnpm --dir frontend dev` (proxies `/api` to `http://localhost:8000`).
  - Global providers: `AlertProvider`, `DownloadProvider`, `TooltipProvider` (shadcn).

---

## 4. Two Distinct Asynchronous OCR Mechanisms

Do not confuse these two mechanisms when reading or editing code:

1. **In-Process Scanner (`PanelScannerService`)**:
   - Location: [`backend/services/panel_scanner_service.py`](../backend/services/panel_scanner_service.py)
   - Triggered by: `POST /api/vision/scan/manga/{id}` or `POST /api/vision/scan/library`
   - Execution: Launched inside the FastAPI process via `asyncio.create_task`.
   - Client Tracking: Server-Sent Events (SSE) via `GET /api/vision/scan-progress`.
   - Workflow: Reads page image from MinIO/disk $\rightarrow$ RapidOCR whole-page detection $\rightarrow$ selects bbox mode (`panel`, `bubble`, `fullpage`) $\rightarrow$ cleans text with `MangaOCRService` $\rightarrow$ linguistic extraction (spaCy) $\rightarrow$ writes to `manga_panels` collection.
2. **Background Task Queue (`ARQ Worker`)**:
   - Location: [`backend/tasks/ocr.py`](../backend/tasks/ocr.py) & [`backend/tasks/worker.py`](../backend/tasks/worker.py)
   - Triggered by: `POST /tasks/ocr` or `POST /api/panels/{id}/ocr-async`
   - Execution: Enqueued into Redis; consumed by an external ARQ worker process.
   - Client Tracking: Polling `GET /tasks/{task_id}`.
   - Note: The frontend UI currently uses Mechanism 1 for interactive scans. Mechanism 2 is designed for standalone asynchronous worker offloading.

---

## 5. Storage & Caching Layer

- **MongoDB Collections**:
  - `mangas`: Core manga metadata, reading statuses, MangaDex mappings.
  - `chapters`: Chapter numbers, volume mappings, page counts, storage metadata.
  - `manga_panels`: Extracted panels, normalized bounding boxes, OCR text, dialogue tokens, linguistic lemmas.
  - `reviews`: Rich reviews stored in TipTap JSON format (`content_json`).
  - `reading_progress`: User last-read chapter and page positions.
  - `tags`, `creators`, `audit_logs`: Auxiliary categorization and operational logs.
  - *Note*: Relationships are application-level logical references, not SQL foreign keys.
- **MinIO S3 (`manga-library` bucket)**:
  - Page keys: `pages/{manga_id}/{chapter_id}/{filename}`
  - Cover keys: `covers/{manga_id}/{filename}`
  - The API streams cropped panel bytes in-memory or generates presigned URLs for client viewing.
- **Redis Caching**:
  - Pool abstraction: [`backend/core/redis.py`](../backend/core/redis.py) (gracefully falls back to direct DB if Redis is offline).
  - Cache Keys & TTLs:
    - Manga Details: `manga:detail:{manga_id}` (TTL: 300s)
    - Manga Reviews: `reviews:manga:{manga_id}` (TTL: 180s)
    - OCR Task in-progress: `task:ocr:{task_id}` (TTL: 3,600s)
    - OCR Task completed: `task:ocr:{task_id}` (TTL: 86,400s)
  - Invalidation: Called on updates/deletions in [`backend/services/manga_service.py`](../backend/services/manga_service.py) and [`backend/routers/reviews.py`](../backend/routers/reviews.py).

---

## 6. Current Implementation Realities & Caveats

When reasoning about the codebase, take note of these verified facts:
1. **Docker Compose Scope**: [`backend/docker-compose.yml`](../backend/docker-compose.yml) configures MinIO and Redis. MongoDB is **not** inside Docker Compose; it runs as a standalone local/remote service (`MONGODB_URI=mongodb://localhost:27017`).
2. **Layer Boundary Exceptions**: While our design policy dictates `Router -> Service -> DB`, some existing routers query MongoDB directly (e.g. [`backend/routers/reviews.py`](../backend/routers/reviews.py) has no separate `review_service.py`). New features must adhere to Service encapsulation, but do not assume legacy code is completely refactored.
3. **Optional Model Dependencies**: [`backend/services/narrator_service.py`](../backend/services/narrator_service.py) checks dynamically for `torch` / `transformers`. If unavailable, it gracefully disables local speech transcription.
4. **External API Fallbacks**: [`backend/services/mangadex_service.py`](../backend/services/mangadex_service.py) uses Playwright headless browser emulation as a fallback when MangaDex Cloudflare rate-limits standard HTTP requests.

---

## 7. Fast Navigation: Where to Go Next

- To see module dependencies and call flows $\rightarrow$ [`docs/architecture.md`](./architecture.md)
- To map a user request or bug to exact files $\rightarrow$ [`docs/code-map.md`](./code-map.md)
- To set up local environment and run tests $\rightarrow$ [`docs/development.md`](./development.md)
- To inspect coding and contribution rules $\rightarrow$ [`AGENTS.md`](../AGENTS.md)
- To review security and data boundaries $\rightarrow$ [`SECURITY.md`](../SECURITY.md)
