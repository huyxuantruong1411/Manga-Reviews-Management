# Manga Reader Translation Studio - Operational Runbook

> **Audience**: Site Reliability Engineers, System Administrators & AI Pair Programmers.  
> **Architecture Reference**: [`docs/translation/adr-001-translation-studio-architecture.md`](adr-001-translation-studio-architecture.md)  
> **Upstream Parity Specification**: [`docs/translation/upstream-parity.md`](upstream-parity.md)

---

## 1. System Overview & Component Topology

The Translation Studio subsystem delivers automated, multi-engine translation for manga chapters and individual pages, alongside an isolated administrative workspace and a live reader integration.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)                         │
│   • MangaReaderPage: Inline Translation Panel & Compare Split Slider  │
│   • TranslationStudioPage: Profiles, Providers, Fonts, Demo & Jobs     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI Host API)                        │
│   • /api/translation/* (Profiles, Providers, Fonts, Jobs, Bindings)   │
│   • Pure-Canvas Re-render (Pillow, No-LLM Token Cost)                  │
│   • S3 Storage Asset Management & Presigned URL Resolution             │
└───────┬───────────────────────────┬────────────────────────────┬───────┘
        │ Enqueue Jobs              │ Query / Mutate             │ S3 API
        ▼                           ▼                            ▼
┌───────────────┐           ┌───────────────┐            ┌───────────────┐
│     Redis     │           │    MongoDB    │            │     MinIO     │
│ Task Queue    │           │ • jobs        │            │ • pages/ (RAW)│
│ & Cache       │           │ • bindings    │            │ • translation/│
│ (127.0.0.1)   │           │ • profiles    │            │   outputs/    │
└───────┬───────┘           │ • font_packs  │            │   clean/      │
        │ ARQ Lease         └───────────────┘            └───────────────┘
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│             BACKGROUND WORKER & TRANSLATOR RUNTIME (ARQ)               │
│   • backend/tasks/translation_worker.py                                │
│   • services/translator-runtime/ (Subprocess Envelope Isolation)       │
│   • Text Detection, RapidOCR/MangaOCR, LLM Translation & Clean Mask   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Runtime Prerequisites & Infrastructure Setup

### A. Core Services Checklist

| Component | Port / Host | Default Location / Image | Health Probe |
|---|---|---|---|
| **MongoDB** | `127.0.0.1:27017` | `mongodb:latest` | `db.runCommand({ ping: 1 })` |
| **Redis** | `127.0.0.1:6379` | `manga-redis` (`redis:alpine`) | `redis-cli ping` -> `PONG` |
| **MinIO** | `127.0.0.1:9000` | `minio/minio` (Bucket: `manga-library`) | `mc ping local` or `/minio/health/live` |
| **FastAPI Backend** | `127.0.0.1:8000` | Python 3.12 (`uv`) | `GET /api/translation/capabilities` |
| **ARQ Translation Worker**| Background daemon | `backend/tasks/translation_worker.py` | ARQ heartbeat logs |
| **Frontend Web** | `127.0.0.1:5173` | React 19 + Vite (`pnpm`) | `GET /` |

### B. Starting Storage & Queues

```powershell
# 1. Start Docker containers (Redis & MinIO)
docker compose -f backend/docker-compose.yml up -d redis minio

# 2. Verify Redis AOF storage mount
docker exec manga-redis redis-cli ping
```

### C. Launching Translation Worker

The background worker manages job execution, lease renewal, and fencing tokens:

```powershell
# Launch ARQ worker for translation tasks
uv run --project backend python -m backend.tasks.translation_worker
```

---

## 3. Storage Lifecycle & Reference-Aware Garbage Collection

### A. Raw Pages Immutability Rule
> [!CAUTION]
> **Strict Immutability**: All original manga chapter images located under `pages/{manga_id}/{chapter_id}/*` are strictly READ-ONLY. Translation operations NEVER overwrite, rename, or delete raw chapter pages.

### B. Translation Artifact Directory Segregation

All generated assets reside in isolated namespaces within MinIO:
- `translation/outputs/{result_id}_rev{N}.jpg`: Composite translated pages.
- `translation/clean/{result_id}.jpg`: Cleaned background canvas (text bubbles inpainted).
- `translation/demo_inputs/{sha256}.jpg`: Standalone synthetic test fixtures.
- `translation/fonts/{sha256}.ttf`: Uploaded font files.

### C. Executing Cleanup Preview & Non-Destructive Purge

Admins can inspect orphaned or expired assets before permanent removal:

```bash
# 1. Dry run preview (Read-only, calculates reclaimable bytes)
curl -X POST "http://127.0.0.1:8000/api/translation/assets/cleanup?dry_run=true"

# 2. Permanent deletion of assets flagged in 'deleting' state
curl -X POST "http://127.0.0.1:8000/api/translation/assets/cleanup?dry_run=false"
```

---

## 4. Upstream Subprocess Envelope & Parity Maintenance

### A. Protocol Envelope Verification

The isolated runtime is governed by JSON-Lines envelope protocol v1:

```bash
# Validate compatibility probe and protocol serialization
uv run --project backend python services/translator-runtime/probe_compatibility.py
uv run --project backend python -m pytest services/translator-runtime/tests/
```

### B. Upstream Update Procedure

1. Inspect upstream changes against pinned protocol:
   Refer to [`docs/translation/upstream-parity.md`](upstream-parity.md).
2. Validate that `services/translator-runtime/protocol.py` correctly handles all envelope messages:
   - `START_TASK`
   - `PROGRESS`
   - `PAGE_COMPLETED`
   - `TASK_FINISHED`
3. Execute adapter tests to confirm clean failure and retry behavior.

---

## 5. Backup, Disaster Recovery & Migration Rollback

### A. MongoDB Database Backup & Restore

```powershell
# Backup Translation collections
mongodump --db manga_library --collection translation_profiles --out ./backup_translation/
mongodump --db manga_library --collection translation_results --out ./backup_translation/
mongodump --db manga_library --collection translation_page_bindings --out ./backup_translation/
mongodump --db manga_library --collection translation_jobs --out ./backup_translation/
mongodump --db manga_library --collection translation_job_pages --out ./backup_translation/
mongodump --db manga_library --collection translation_font_packs --out ./backup_translation/
mongodump --db manga_library --collection translation_assets --out ./backup_translation/

# Restore Translation collections
mongorestore --db manga_library ./backup_translation/manga_library/
```

### B. Migration Rollback Guide

If schema migration `m_20261005_add_page_uid_and_translation_schemas.py` needs to be reverted:

```python
# To revert migration programmatically via Python repl:
import asyncio
from backend.database.migrations.m_20261005_add_page_uid_and_translation_schemas import down

asyncio.run(down())
```

The `down()` operation safely:
1. Removes the translation indexes from `translation_jobs`, `translation_results`, `translation_page_bindings`, `translation_profiles`, and `translation_font_packs`.
2. Leaves chapter records intact without data loss.

---

## 6. Verification & Health Monitoring

To verify all system components are operating nominally:

```powershell
# 1. Run Python linters and type verifications
uv run --project backend python scripts/ci/check_python.py

# 2. Run comprehensive backend test suite
uv run --project backend python -m pytest backend/tests

# 3. Verify frontend TypeScript build
pnpm --dir frontend run typecheck
pnpm --dir frontend run build

# 4. Verify API documentation sync
uv run --project backend python scripts/generate_api_routes.py --check
uv run --project backend python scripts/check_docs.py
```
