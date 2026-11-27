# 05 — Phase 4: Arrow Serving and Perspective Workbench

## Objective

Export each approved Gold mart to Apache Arrow IPC **stream**, serve only published and allow-listed artifacts, and create a standalone Perspective UI that opens with curated insight presets.

## 4.1 Workbench isolation

Create a separate Vite + React + TypeScript app under `analytics/ui/`.

- Do not add Perspective packages to the main `frontend/package.json` by default.
- Match the repository's supported Node/pnpm conventions where practical, but keep this package's lockfile independent.
- Candidate packages: `@perspective-dev/react`, `@perspective-dev/client`, `@perspective-dev/viewer`, `@perspective-dev/viewer-datagrid`, `@perspective-dev/viewer-charts`.
- Pin one mutually compatible Perspective package set after checking the official installation/bundling guide and performing a production Vite build. Do not use floating `latest`.
- Perspective requires WebAssembly initialization and plugin side-effect imports before rendering. Implement a singleton initializer; ensure it runs exactly once and surfaces a useful load error.
- Use the React binding `<PerspectiveViewer>` where it simplifies lifecycle; alternatively use the Web Component directly if the exact version's React API is not suitable.

## 4.2 Arrow export

Implement `analytics/scripts/export_arrow.py`.

For each enabled Gold model:

1. Read the mart from the just-built DuckDB warehouse/release.
2. Convert to a PyArrow table using an explicit schema mapping.
3. Normalize timestamps to timezone-aware UTC or an explicitly documented UTC-naive convention; choose one and keep it consistent.
4. Use primitive scalar columns only: strings, booleans, integers, float32/float64, date, timestamp. Avoid nested arrays/structs and raw BSON types.
5. Serialize with `pyarrow.ipc.new_stream(sink, schema)`; do not use `new_file`.
6. Write to a staging release directory, close the writer, reopen the Arrow stream, validate schema and row count, calculate SHA-256 and byte size.
7. Move to the final versioned release directory only after every artifact validates.

Use one Arrow file per mart, for example:

```text
.local/analytics/releases/<release_id>/
  manifest.json
  arrow/
    gld_taste_calibration.arrow
    gld_tag_synergy.arrow
    gld_series_completion_friction.arrow
    gld_creator_consistency.arrow
    gld_review_aspect_profile.arrow
    gld_backlog_velocity.arrow
    gld_metadata_health.arrow
    gld_external_consensus_gap.arrow
    gld_ocr_lexical_atlas.arrow
```

## 4.3 Manifest contract

`manifest.json` should contain:

- `release_id`, `created_at`, `snapshot_date`, `pipeline_version`, `git_commit` if known;
- overall `status`, dbt invocation ID and dbt test summary;
- per-dataset name, relative artifact path, rows, bytes, SHA-256, MIME type, Arrow schema, grain, description and enabled status;
- source snapshot dates/collection counts and known data coverage;
- `metric_definition_version`, caveat/reliability fields and data classification;
- minimum UI/workbench version required.

Do not include source database URI, credentials, raw review text, raw OCR text, local absolute paths or media URLs.

## 4.4 FastAPI read-only delivery

Add an isolated router/service such as:

- `GET /api/analytics-lab/manifest`
- `GET /api/analytics-lab/releases/{release_id}/manifest`
- `GET /api/analytics-lab/releases/{release_id}/datasets/{dataset_name}.arrow`
- `GET /api/analytics-lab/health`

Requirements:

- Only serve a dataset explicitly declared in the validated release manifest.
- Resolve paths under the configured release root and reject traversal, symlink escape and unrecognized dataset names.
- Return `application/vnd.apache.arrow.stream`, `Content-Length`, `ETag`/SHA-256 and cache policy tied to immutable release ID.
- Never accept SQL, Mongo filters, arbitrary file paths or arbitrary collection names from the client.
- Do not run dbt, DuckDB transformations or expensive aggregations inside a request.
- Keep private release data outside `analytics/ui/public/`. Static public folders may contain only synthetic demo fixtures.
- The project currently has no assumption of general user authentication. Default the Analytics Lab endpoint/workbench to loopback/local use. If exposing beyond localhost/LAN, require the operator to configure an authentication/authorization layer and restrict CORS/origins before enabling it.
- Raw personal review text and OCR dialogue must not be served by these Arrow routes.

## 4.5 Perspective loading and UI

Implement:

- `src/lib/perspective.ts`: WASM bootstrap singleton, worker creation, Arrow fetch/`arrayBuffer`, table lifecycle and cleanup.
- `src/config/presets.ts`: default viewer configurations per Gold mart.
- `src/components/InsightHeader.tsx`: question, interpretation, sample size, freshness, reliability and caveats.
- `src/components/PerspectivePanel.tsx`: loader/error/empty states, saved config and table lifecycle.
- `src/components/MetricDefinitionPopover.tsx`: formula, grain, denominator and source lineage.
- `src/components/QualityBadge.tsx`: reliability and coverage signals (not decorative badges for every metadata item).
- `src/App.tsx`: tabbed workbench grouped by research question.

Every tab must open a meaningful preset:

| Tab | Default Perspective view |
|---|---|
| Taste calibration | Ranked shrunk rating by tag/demographic with sample-size columns; allow raw mean comparison |
| Tag synergy | Pair support/lift table plus heatmap/scatter view; minimum support filter pre-set |
| Series completion friction | Chapter-count bucket vs observed status/completion metrics; maturity caveat visible |
| Creator consistency | Canonical creator × role ranking with rated-manga count, interval and dispersion |
| Review aspect profile | Aspect mention rates by rating band; do not show sentiment unless validated |
| Backlog velocity | Cohort-age heatmap and transition counts with immature cohort cells masked |
| Metadata health | Missing/conflict/freshness grid, sortable by severity and field |
| External consensus gap | Personal vs external score scatter/table with sample size, source and sync freshness |
| OCR lexical atlas | Coverage-first view; normalize by scanned pages/tokens and filter language/pipeline version |

No unconfigured raw table is a default tab.

## 4.6 Dataset sizing and privacy controls

- Perspective's client-only design downloads each Arrow dataset to the browser. Use this for curated, bounded marts, not every source record.
- Define per-dataset `max_rows` and `max_bytes` budgets in the manifest/contract. If a mart exceeds the budget, aggregate it further, export a filtered subset, or defer a server-side Perspective/DuckDB virtual-server design to a later phase.
- Review-level and OCR token-level data may be high cardinality. Prefer aggregate marts for the first workbench; provide drill-down identifiers, not bulk raw dialogue.
- Add a user-visible warning that exported personal analytics data is loaded into browser memory.
- Avoid localStorage persistence of sensitive row-level records. Persist only viewer configuration/preset where appropriate.

## 4.7 Integrating into the main application

Keep the workbench separate while still discoverable:

- Development: main app nav link uses a configurable `VITE_ANALYTICS_LAB_URL` (for example local Vite port `5180`); analytics Vite proxy points API calls to the FastAPI backend.
- Production: build `analytics/ui` independently and serve its `dist` under a controlled same-origin path such as `/analytics-lab/` from FastAPI/static hosting, or provide a clear launch URL. Choose one after checking existing deployment topology.
- Add a navigation entry from the main frontend only after the standalone UI production build and API contract tests pass.
- Do not iframe a dev server in production by default. If iframe is selected, define CSP/frame-ancestors, same-origin behavior and route fallback.

## Verification gate — Phase 4

- [ ] Arrow output is IPC stream (`new_stream`) and can be reopened with PyArrow.
- [ ] Manifest schema/row counts/hash match each Arrow file.
- [ ] No private source text or image URLs exist in default Arrow outputs.
- [ ] FastAPI only serves manifest-allow-listed immutable artifacts and rejects traversal/unknown files.
- [ ] Perspective initializes WASM in Vite dev and production builds.
- [ ] Every tab restores an insight-specific preset with visible denominator/sample size/caveats.
- [ ] UI handles loading, empty, stale-release, corrupted Arrow and network error states.
- [ ] Dataset size limits are enforced; large OCR rows are not loaded without explicit design approval.
- [ ] Main application link opens the workbench in dev and production as documented.
