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

### Scenario D: Chapter Metadata Operations & Re-sync
- To re-sync missing chapter titles or volumes across an entire manga library from upstream providers:
  ```bash
  curl -X POST http://127.0.0.1:8000/api/manga/{manga_id}/chapters/sync-metadata
  ```
- For manual batch volume assignments or sequential renumbering, invoke `/api/manga/{manga_id}/chapters/batch-metadata` with selected `chapter_ids`.

### Scenario E: Live Progress Monitoring for Storage Operations
- All long-running asynchronous and bulk mutation operations (bulk chapter deletion, metadata synchronization, batch editing) provide real-time visual progress feedback in the UI:
  - Deletion Tracker: calculates completion percentages per chapter and surfaces exact chapter identifiers and MinIO cleanup states.
  - Sync Banner: displays active provider polling progress and library reconciliation summaries.

---

## 5. Comix Datasource & Anti-Bot Stealth Pipeline

[`ComixProvider`](../../backend/services/datasources/comix.py) integrates `comix.to` with anti-bot stealth transport, cookie/session persistence, and local AI CAPTCHA solving.

### Configuration & Flags

| Variable | Default | Purpose |
|---|---|---|
| `DATASOURCE_COMIX_ENABLED` | `true` | Enables Comix provider registration and chapter downloading |
| `DATASOURCE_COMIX_BASE_URL` | `https://comix.to` | Canonical root domain for Comix catalogue and media |
| `DATASOURCE_COMIX_TRANSPORT` | `stealth_auto` | Transport mode: `stealth_auto`, `http_impersonate`, or `stealth_browser` |
| `DATASOURCE_COMIX_MAX_CONCURRENT_CHAPTERS` | `1` | Max concurrent chapter downloads to avoid rate limits |
| `DATASOURCE_COMIX_MAX_CONCURRENT_PAGES` | `2` | Max concurrent image streams per chapter |
| `DATASOURCE_COMIX_RATE_LIMIT_RPM` | `30` | Requests per minute budget |
| `DATASOURCE_CAPTCHA_AUTO_SOLVE_ENABLED` | `true` | Enables autonomous local AI CAPTCHA solving pipeline |
| `DATASOURCE_CAPTCHA_MAX_ATTEMPTS` | `3` | Maximum retry attempts before escalating to HITL |
| `DATASOURCE_CAPTCHA_VLM_PROVIDER` | `local_or_gemini` | Solver strategy: `none`, `ollama`, `gemini`, or `local_or_gemini` |
| `DATASOURCE_SESSION_DIR` | `backend/data/datasource-sessions` | Storage directory for session cookies and storage state |

### Session Store & State Persistence

The anti-bot subsystem caches validated browser state in `backend/data/datasource-sessions/comix/storage_state.json`:
- **Persisted Tokens**: Cookies (`cf_clearance`, session IDs, consent cookies), `localStorage`, and security tokens.
- **TTL & Expiry**: Session records default to a 24-hour validity window. If a request receives HTTP 403 or Cloudflare challenge detection, the session is marked `expired` or `challenge_required`.
- **Fast-Path Reuse**: Active downloads read directly from `storage_state.json` via HTTP impersonate headers without launching heavy browser instances.

### Local AI CAPTCHA Auto-Solver

When Cloudflare Turnstile or custom canvas puzzle challenges appear:
1. **Detection**: [`ChallengeDetector`](../../backend/services/datasources/anti_bot/challenge_detector.py) flags `CHALLENGE_REQUIRED`.
2. **Auto-Solve Pipeline**: [`LocalAiCaptchaSolver`](../../backend/services/datasources/anti_bot/local_ai_solver.py):
   - Uses `RapidOCR` and OpenCV template/contour matching to detect target prompt icons and slide offset coordinates.
   - Generates human-like curved cursor trajectories with non-linear velocity via [`BezierMouseHumanizer`](../../backend/services/datasources/anti_bot/mouse_humanizer.py).
   - Simulates realistic drag-and-drop or checkbox interactions on the Playwright stealth page.
3. **Escalation to HITL**: If 3 automated attempts fail or confidence is below threshold, status escalates to `needs_hitl`.

### Human-in-the-Loop (HITL) Session Warmup

When automated solving is challenged or a fresh session is required:
- **One-Touch UI Warmup**:
  In `SourceDownloadDialog`, the `SessionVerificationBanner` alerts operators if the Comix session requires attention. Clicking **"Warm Up Session"** calls `POST /api/datasources/comix/warmup-session`.
  FastAPI launches a headed stealth browser context for the operator to complete the challenge. Upon completion, the new cookies and storage tokens are saved automatically to `storage_state.json`.
- **CLI Session Status Inspection**:
  ```bash
  uv run --project backend python -c "from backend.services.datasources.anti_bot.session_store import SessionStore; store = SessionStore(); print(store.get_status('comix'))"
  ```
- **Session Reset**:
  To clear a corrupted or rate-limited session:
  ```bash
  uv run --project backend python -c "from backend.services.datasources.anti_bot.session_store import SessionStore; store = SessionStore(); store.clear('comix')"
  ```

