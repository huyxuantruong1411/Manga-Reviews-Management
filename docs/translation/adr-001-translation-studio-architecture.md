# ADR-001: Manga Reader Translation Studio & Isolated Engine Architecture

- **Status**: Accepted
- **Date**: 2026-10-05
- **Context Snapshot Base**: `3001ec45fd3377bf96a34e4c1373b77d4a12cc7c`
- **Current HEAD Verified**: `0ee0c4fcde99879aa23be5b056f3cd7d572fad2d`
- **Drift Assessment**: 2 commits (`0ee0c4f`, `0fb3896`) modifying only frontend container/chart widths; zero changes to backend models, services, storage, or worker.

---

## 1. Context & Problem Statement

Manga-Reviews-Management requires automated translation capabilities accessible directly within the full-screen reader (`frontend/src/pages/MangaReaderPage.tsx`) and via a dedicated administrative and creative workspace (**Translation Studio** at `/translation`).

Prior prototypes (e.g. coursework integration) demonstrated the feasibility of invoking `translate_and_render` and storing outputs in MinIO S3. However, they exhibited critical architectural flaws:
1. Volatile RAM caches storing presigned S3 URLs keyed by mutable URL strings.
2. Direct synchronous execution inside FastAPI default threadpools without durable job tracking, cancellation, or recovery.
3. Heavy ML dependencies (PyTorch, Gradio, Diffusers, OpenCV-contrib) polluting the main web application environment.
4. Unstable page addressing relying on transient 1-based `page_number` values that break upon chapter renumbering or page deletions.
5. Inability to preserve original comic images or allow non-destructive region-level editing without re-triggering paid LLM/provider inference.

---

## 2. Decision Matrix & Architectural Principles

### 2.1 Boundary: Control Plane vs. Execution Plane
- **Control Plane (FastAPI Host)**:
  - Owns all domain models, immutable profile revisions, durable jobs in MongoDB, outbox dispatching, S3 asset references, and page display bindings.
  - Implements `/api/translation/*` endpoints, strictly validating inputs via Pydantic v2 schemas and delegating logic to domain services (`backend/services/translation/`).
  - Never imports heavy ML frameworks (Torch, Gradio, Diffusers, Skia).
- **Execution Plane (Dedicated Translator Runtime)**:
  - Lives in `services/translator-runtime/` in an isolated Python/container environment.
  - Pin upstream `meangrinch/MangaTranslator` at commit `924854a218dda3bc4a22c1a4e65dfe8dc9fa8ac0` (Apache-2.0).
  - Baseline communication occurs via **subprocess envelope over stdin/stdout** using versioned JSONL event streaming.
  - Subprocess receives verified local paths and temporary workdirs created by the parent worker; client credentials and API keys are passed through an isolated pipe/ephemeral secret envelope, never via CLI flags or URL query parameters.

### 2.2 Asynchronous Job Queue & Concurrency
- Uses a dedicated ARQ queue: `arq:translation`.
- Configured via `backend/tasks/translation_worker.py` with `WorkerSettings`:
  - Default concurrency: `max_jobs = 1` per runtime/device to guarantee VRAM stability and avoid GPU out-of-memory crashes.
  - Independent from the OCR scanner worker (`backend/tasks/worker.py`, `max_jobs = 8`).
  - Durable job tracking in MongoDB (`translation_jobs`, `translation_job_pages`) ensures jobs survive Redis restarts or worker crashes.

### 2.3 Stable Page Identity (`page_uid`) & Invariant Original Preservation
- Every page occurrence in `ChapterBase.pages` receives a persistent `page_uid` (UUIDv4) and `ChapterBase.pages_revision`.
- Deleting or renumbering pages in `chapter_service.delete_pages` or `delete_storage_duplicate_pages` updates `page_number` while preserving `page_uid`.
- Translation artifacts and cache entries are keyed by `page_uid` and content SHA-256 fingerprint; original comic page files in MinIO `pages/{manga_id}/{chapter_id}/` are strictly immutable and never overwritten.

### 2.4 User Experience: Native React Studio First
- Primary user experience is a modern native React workspace:
  - **Reader Tab**: Minimal controls in `MangaReaderPage.tsx` sidebar (Target language, profile selector, current/pair/range/chapter action, Original/Translated/Compare toggle).
  - **Translation Studio (`/translation`)**: Comprehensive management interface with 8 primary views: Overview, Demo Workspace, Profiles, Providers, Fonts, Assets & Storage, Jobs, and Result Editor.
- **Advanced Gradio Workbench**: Optional secondary bridge mounted as a client of the gateway only after passing strict capability and isolation gates.

### 2.5 Security, Secrets, and Data Sovereignty
- Single-user local scope (`scope="local"`).
- API keys (Gemini, OpenAI-compatible) are configured server-side; client API responses never expose plaintext secrets.
- Redacted logging and sanitized diagnostics ensure prompt contents, API keys, and bearer tokens are never leaked to logs or client diagnostics.

---

## 3. Consequences

- **Positive**:
  - Zero dependency collision: host FastAPI remains lean and fast.
  - Bulletproof cancellation and crash recovery: killing child process leaves host healthy.
  - Cost efficiency: region-level corrections in Editor re-render with cached clean images without calling external LLMs.
- **Negative / Trade-offs**:
  - Subprocess cold-start overhead per page (~1-2s for model initialization unless warmed process pool is activated in P3).
  - Dual environment management (host `uv` virtualenv + `services/translator-runtime` environment).
