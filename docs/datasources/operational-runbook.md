# Operational Runbook: Multi-Source Datasources & MangaFire Pipeline

This runbook guides operators on managing, troubleshooting, and tuning multi-source integrations, background workers, and Playwright headless transport.

---

## 1. Feature Flags & Configuration

Settings are declared in `.env` and loaded via [`backend/config.py`](../../backend/config.py):

| Variable | Default | Purpose |
|---|---|---|
| `DATASOURCE_MANGAFIRE_ENABLED` | `true` | Enables MangaFire resolution and catalogue browsing |
| `DATASOURCE_MANGAFIRE_HEADLESS` | `true` | Runs Playwright Chromium context in headless mode |
| `DATASOURCE_DOWNLOAD_CONCURRENCY` | `3` | Max concurrent page downloads per chapter |
| `MANGAFIRE_RATE_LIMIT_DELAY` | `1.5` | Politeness delay (seconds) between catalogue requests |

---

## 2. MangaFire Playwright Lifecycle

MangaFire utilizes a modern SPA architecture where chapter catalogues and reader pages are hydrated dynamically by client-side JavaScript.

### Transport Architecture
- **Worker Thread Execution**: Playwright operations run in isolated background threads to prevent blocking the async FastAPI event loop.
- **Short-Lived Browser Contexts**: Browser contexts are opened with standard headers (User-Agent, Accept-Language), navigate to the target work or reader URL, wait for DOM hydration (`networkidle` / selector detection), extract manifest data, and immediately close.
- **Image Page Streaming**: After manifest URLs and Referer headers are retrieved, individual image pages are fetched via fast HTTP streaming (httpx) with domain-specific Referers (`Referer: https://mangafire.to/`).

### Troubleshooting Browser Transport Failures
- **Symptom: Missing Playwright Browser**:
  ```bash
  uv run --project backend playwright install chromium
  ```
- **Symptom: Headless Detection / 403 Challenge**:
  If MangaFire prompts with Cloudflare or CAPTCHA, the adapter returns `DatasourceError(code="CHALLENGE_REQUIRED", retryable=False)`.
  The UI displays a clear degraded status dialog prompting manual interaction or alternative source fallback.

---

## 3. Database Indexes & Integrity Maintenance

All required multi-source indexes are registered in [`backend/database/indexes.py`](../../backend/database/indexes.py).

To apply or verify indexes:
```bash
uv run --project backend python -c "import asyncio; from backend.database.indexes import ensure_indexes; asyncio.run(ensure_indexes())"
```

Mandatory indexes:
- `manga_sources`: `[("source", 1), ("source_work_id", 1)]` (unique)
- `chapters`: `[("manga_id", 1), ("source", 1), ("source_id", 1), ("language", 1)]` (unique)
- `chapter_slots`: `[("manga_id", 1), ("numbering_scope_id", 1), ("chapter_key", 1), ("language", 1), ("unit_kind", 1)]` (unique)

---

## 4. Runbook Scenarios

### Scenario A: Chapter Replacement & Slot Reassignment
- **Action**: When a chapter from MangaFire is deleted, [`ChapterLifecycleService`](../../backend/services/chapter_lifecycle_service.py) automatically inspects the slot.
- If an alternative ready chapter exists (e.g. MangaDex), `preferred_chapter_id` switches to it.
- If no alternative exists, `preferred_chapter_id` is set to `None`, correctly indicating 30/31 coverage.

### Scenario B: Storage Deletion Failures
- If MinIO reports an error during chapter deletion, the state transitions to `cleanup_failed`.
- The database record is retained to prevent orphan object leaks until a retry succeeds.

### Scenario C: Redis Cache Invalidation
- Manga detail updates trigger `manga:detail:{manga_id}` eviction.
- Chapter updates trigger `chapters:manga:{manga_id}` eviction.
