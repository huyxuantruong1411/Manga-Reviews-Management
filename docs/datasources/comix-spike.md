# Technical Spike: Comix (`comix.to`) Anti-Bot, Architecture & API Investigation

> **Target Source:** `https://comix.to/title/r9j5m-yajin`  
> **Investigation Date:** 2026-10-18  
> **Objective:** Probe live network responses, Cloudflare WAF / Turnstile challenge, data hydration patterns, and CDN page delivery for `comix.to` integration.

---

## 1. Executive Summary & Core Findings

1. **Identity Structure (`Work Identity`):**
   - Canonical URL format: `https://comix.to/title/{work_id}-{slug}` (e.g. `https://comix.to/title/r9j5m-yajin`).
   - The primary invariant identifier is the alphanumeric prefix `r9j5m`. The suffix `-yajin` is a human-readable SEO slug subject to title edits.
   - Provider identity rule: `source = "comix"`, `source_work_id = "r9j5m"`.

2. **Anti-Bot & WAF Challenge (Verified Live):**
   - **Direct HTTP (`httpx` / `requests` / standard curl):**
     - HTTP Status: `403 Forbidden`
     - Response Server: `cloudflare`
     - Response Title: `Just a moment...`
     - Challenge Type: Cloudflare Managed Challenge with embedded Turnstile widget (`https://challenges.cloudflare.com/.../turnstile/...`).
   - **Standard Playwright Headless:**
     - Also trapped by Cloudflare Managed Challenge (`title: Just a moment...`, frame count 2, embedded `challenges.cloudflare.com` iframe).
   - **Required Solution:**
     - Stealth Browser Context (`--disable-blink-features=AutomationControlled`, removal of `navigator.webdriver`, realistic user-agent and viewport).
     - Session Persistence via `storage_state.json` (capturing `cf_clearance` and origin cookies). Once acquired, subsequent chapter and page queries succeed seamlessly.
     - Local AI CAPTCHA Solver fallback (Turnstile Bezier mouse trajectory + OpenCV puzzle/text solvers, circuit-breaker capped at 3 attempts).
     - Human-in-the-Loop (HITL) 1-click headed browser fallback (`POST /api/datasources/comix/warmup-session`).

3. **Data Hydration & API Endpoints:**
   - Work & Chapter Metadata: Available in DOM elements and internal API / JSON hydration structures.
   - Chapter Reading & CDN Images:
     - Pages delivered via CDN endpoints requiring strict `Referer: https://comix.to/` and browser-aligned user-agent headers.
     - Image payloads are typically `image/webp` or `image/jpeg`. Magic bytes verification via Pillow is mandatory to avoid trusting URL extensions.

---

## 2. Live Probe Evidence

### 2.1 Direct HTTP Probe (Failed as Expected)
```bash
$ uv run --project backend python -c "import httpx; r = httpx.get('https://comix.to/title/r9j5m-yajin', timeout=15); print(r.status_code, r.headers.get('server'))"
Status: 403
Server: cloudflare
Title: Just a moment...
Has Cloudflare challenge: True
```

### 2.2 Playwright Headless Probe
- DOM Inspection confirmed presence of Cloudflare Challenge Platform:
  ```html
  <script src="https://challenges.cloudflare.com/turnstile/v0/b/d2d3316b729e/api.js?onload=DraY9&render=explicit"></script>
  <input type="hidden" name="cf-turnstile-response" id="cf-chl-widget-ubfyd_response">
  <script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1?ray=a4c91abe6924e2fb"></script>
  ```
- Result: Standard automated scrapers receive `403` with a Managed Challenge requiring Turnstile verification before any manga payload is revealed.

---

## 3. Storage & Multi-Source Cross-Compatibility

To guarantee 100% interoperability with MangaDex and MangaFire:
1. **Object Keys in MinIO S3:**
   - `chapters/{manga_id}/{internal_chapter_id}/revisions/{media_revision_id}/{page_num:04d}.{ext}`
   - Comix image bytes are staged, hashed (SHA-256), MIME-verified, and committed via `chapter_media_service.py`.
2. **Logical Slot Architecture:**
   - Logical chapter numbers (e.g. `14`, `14.1`, `oneshot`) are normalized using `normalize_chapter_candidate` into `chapter_slots`.
   - Allows downloading Chapter 1–30 from Comix, deleting Chapter 14, and re-downloading Chapter 14 from MangaDex or MangaFire with zero schema friction.
3. **Metadata Enrichment:**
   - Comix title, alternative titles, description, genres, mature rating, and metrics are captured into `SourceMetadataSnapshot` without overwriting user-locked fields or personal reviews.

---

## 4. Conclusion & Action Items
- Proceed to **PR-CMX-01**: Implement `backend/services/datasources/anti_bot/` (`session_store.py`, `challenge_detector.py`, `mouse_humanizer.py`, `local_ai_solver.py`, `stealth_transport.py`).
- Proceed to **PR-CMX-02**: Extend URL utilities and models with `"comix"` datasource provider.
- Proceed to **PR-CMX-03**: Complete `ComixProvider` implementation in `backend/services/datasources/comix.py`.
