# Manga Deep Analytics — Operational & Security Runbook

## 1. Architecture Summary

`MongoDB (read-only) -> Bronze Parquet (dt=YYYY-MM-DD) -> DuckDB/dbt Silver & Gold -> Apache Arrow IPC Stream -> FastAPI Allow-Listed Delivery -> Perspective WASM Tab in Frontend`

All private snapshots, DuckDB warehouses, Arrow releases, and logs reside under `ANALYTICS_HOME` (default `.local/analytics/`, Git-ignored).

---

## 2. Standard CLI Operations

### Validate Schema Contract
```bash
uv run --project analytics python -m analytics.scripts.validate_contract
```

### Dry-Run Bronze Extraction
```bash
uv run --project analytics python -m analytics.scripts.run_pipeline --dry-run --allow-existing-uri
```

### Full End-to-End Refresh (Extract + Features + dbt Build + Arrow Export + Publish)
```bash
uv run --project analytics python -m analytics.scripts.run_pipeline --allow-existing-uri
```

### Rebuild & Publish from an Existing Daily Snapshot (Zero MongoDB Load)
```bash
uv run --project analytics python -m analytics.scripts.run_pipeline --skip-extract --existing-snapshot 2026-11-28
```

### Validate or Rollback a Release
```bash
uv run --project analytics python -m analytics.scripts.run_pipeline --validate-only --release <release_id>
uv run --project analytics python -m analytics.scripts.run_pipeline --rollback <previous_release_id>
```

### Purge Local Data (Preview First)
```bash
uv run --project analytics python -m analytics.scripts.run_pipeline --purge-local-data
uv run --project analytics python -m analytics.scripts.run_pipeline --purge-local-data --confirm-purge
```

---

## 3. Running the Workbench UI

1. Start the Backend API (`port 8000`):
   ```bash
   uv run --project backend uvicorn backend.main:app --reload --port 8000
   ```
2. Start the Frontend SPA (`port 5173`):
   ```bash
   pnpm --dir frontend dev
   ```
   Open `http://localhost:5173/analytics?tab=olap-lab` (or open **Analytics** in the sidebar and select the **Medallion OLAP Lab** tab).

---

## 4. Security & Privacy Checklist (Loopback vs LAN)

- **Dedicated Read-Only DB Principal**: Configure `ANALYTICS_MONGODB_URI` with a MongoDB user holding only the built-in `read` role on `DATABASE_NAME`. `--allow-existing-uri` is strictly for local development opt-in.
- **Zero Prose in Browser Exports**: `export_arrow.py` enforces a banned-column guard (`plain_text_private`, `content_json`, `content_text`, `raw_text`, `cleaned_text`, `_document_ejson`) and rejects nested/Decimal128 Arrow types.
- **No Arbitrary SQL / Path Traversal**: FastAPI `/api/analytics-lab/*` serves only allow-listed `.arrow` files declared in the active `manifest.json`, verifies paths stay inside `ANALYTICS_HOME/releases`, and rejects symlinks.
- **Loopback Default**: Keep `HOST=127.0.0.1` and `ANALYTICS_LAB_ALLOWED_ORIGINS` empty (or scoped to explicit trusted origins). Do not expose beyond localhost/LAN without adding an authentication reverse proxy and tightening CORS.
- **Never Commit Private Data**: Verify `git status` shows no `.local/analytics/`, `.env`, Parquet, DuckDB, or Arrow files before any commit.
