# 00 — Master Architecture and Architecture Decision Record

## 1. Product outcome

Build a local-first OLAP module named **Manga Deep Analytics**. It must transform the existing personal manga application data into statistically defensible findings. Every published insight must state:

1. the question being answered;
2. the population and grain being analyzed;
3. the source entities and transformations used;
4. the metric definition and denominator;
5. the comparison baseline;
6. sample size and data-completeness caveats;
7. what may and may not be inferred;
8. how a user can drill down to supporting manga/review/chapter/panel identifiers.

A chart is not an insight by itself. Perspective is the exploration surface for curated analytical datasets, not the place where domain truth is invented.

## 2. Current system facts and architectural implications

| Observed repository fact | Consequence for the analytics design |
|---|---|
| MongoDB is the operational source (`DATABASE_NAME`, currently `manga_library`). | Extract with PyMongo/Motor. Do not copy SQL `ATTACH` examples from a generic template. |
| A separate `POOL_DATABASE_NAME` exists (`manga_datalake_pool`). | Treat Data Lake Pool/connector entities as optional lineage/connector analytics, not as the canonical personal-library source. |
| Personal rating and `read_status` live in `mangas`. | Keep these fields in the manga fact; do not model personal rating as a row in `reviews`. |
| `reviews.content_json` is TipTap JSON in a separate collection. | Extract and parse review text independently; keep raw text private and out of default Arrow outputs. |
| `tag_ids` is an array of IDs; `tags` is a lookup collection. | Silver must unnest a manga-tag bridge and resolve labels. |
| `creators` is embedded on manga while author/artist legacy strings and a creator lookup collection also exist. | Build explicit creator resolution logic and preserve the identity-resolution method; do not join by fuzzy display name without a confidence flag. |
| `chapters` includes physical source releases and embedded pages. | Separate physical release grain from logical chapter-slot grain; do not double-count alternate releases or languages. |
| `manga_panels` contains both `lemmas` and `vocabulary`. | Treat `vocabulary` as token occurrences and `lemmas` as a distinct/normalized lemma list. They are not interchangeable. |
| `panel_scan_pages` tracks page scan provenance/hash and pipeline version. | Use it with chapter page inventory to calculate OCR coverage and stale scans. |
| `audit_logs` records some transitions. | Use only verified event coverage; do not fabricate historical events where no audit record exists. |
| `reading_progress` stores last position and read chapter IDs. | It is a snapshot, not read-session telemetry. No dwell time or reading-speed metric. |
| `tierlists` contains current ordered tiers and revision metadata. | Analyze the current ranking only unless code proves immutable revision history exists. |
| Existing Analytics UI already has basic distributions, KPI velocity, timelines and review-corpus export. | The new workbench must focus on deeper cross-entity analysis and not reproduce those views. |

## 3. End-to-end Medallion data flow

```text
MongoDB manga_library (strictly read-only access)
  ├─ mangas, reviews, tags, creators
  ├─ chapters, reading_progress, audit_logs, tierlists
  ├─ external_reviews, manga_panels, panel_scan_pages
  └─ optional: manga_datalake_pool (separate database)
          │
          ▼  Python extractor (PyMongo/Motor; no DuckDB Mongo attach assumed)
BRONZE — immutable daily Parquet snapshots + per-run manifests
          │
          ▼  dbt-duckdb / DuckDB schema bronze
BRONZE MODELS — thin views over raw Parquet; no business rules
          │
          ▼
SILVER — normalized current entities, snapshot history, event facts,
         canonical bridges, exploded chapter/page/token grains,
         data-quality flags and intermediate statistics
          │
          ▼
GOLD — flat, documented, question-oriented insight marts
          │
          ▼  PyArrow IPC Stream (`new_stream`) + release manifest
SERVING — versioned files stored outside public web assets
          │
          ▼  read-only FastAPI allow-listed file delivery
PERSPECTIVE WORKBENCH — standalone Vite + React + Perspective WebWorker/WASM
```

### Strict Medallion boundaries

- **Bronze:** faithfully preserve extracted source documents and technical ingestion metadata. No business filtering, status normalization, rating rescaling, fuzzy joins, token sentiment, or deduplication that changes source meaning.
- **Silver:** all source cleanup, BSON normalization, soft-delete handling, canonical IDs, array unnesting, joins, event derivation, deduplication, coverage calculations and intermediate statistics.
- **Gold:** only curated analytical outputs. Every mart has a declared grain, metric contract, population, freshness, sample-size fields and interpretation caveats. Gold reads Silver models only.

## 4. ADR — locked choices

| Area | Decision | Reason |
|---|---|---|
| Warehouse pattern | Snapshot-first Bronze Parquet partitioned by `dt=YYYY-MM-DD`; DuckDB schemas `bronze`, `silver`, `gold`. | Builds run against local snapshots, not production MongoDB. Daily history permits basic trend and change reconstruction. |
| MongoDB extraction | Dedicated read-only MongoDB principal where authorization is enabled; allow-listed `find` operations through PyMongo/Motor; default read preference `primary`. | The current repository uses MongoDB, not SQL. Avoid stale secondary reads by default and keep access least-privileged. |
| Snapshot consistency | Best-effort collection snapshots with explicit extraction window and per-collection row counts; do not claim cross-collection point-in-time consistency unless deployment supports and extractor verifies a snapshot transaction. | A typical standalone/local MongoDB deployment does not provide the same cross-collection snapshot workflow as a replica-set snapshot transaction. |
| BSON preservation | Bronze Parquet envelope contains normalized source ID, collection, snapshot metadata and canonical Extended JSON document payload. Add typed technical columns only where stable. | Preserves BSON type information and avoids unstable nested Arrow schemas caused by heterogeneous Mongo documents. |
| Transformation | `dbt-core` + `dbt-duckdb`, pinned and locked after a compatibility smoke test. | Version compatibility moves; never install unpinned `latest` in an autonomous plan. |
| Data serving | Apache Arrow IPC **stream** per curated Gold mart (`pyarrow.ipc.new_stream`) plus `manifest.json`. | Columnar transfer into Perspective; manifest supports schema validation, release switching and cache busting. |
| Visualization | Standalone `analytics/ui/` Vite + React + Perspective. | Keeps WASM/WebGL bundling isolated from the existing React application and its frontend dependencies. |
| Data location | Bronze, warehouse, release and private Arrow files under ignored `.local/analytics/` (configurable). | Manga review text and preference profiles are private user data; do not put them under a public web directory. |
| Serving | FastAPI serves only allow-listed published Arrow artifacts and manifest; never executes user SQL and never runs dbt per request. | Small serving surface; calculations happen in Perspective WebWorker/WASM. |
| Runtime | Separate `analytics/pyproject.toml`, Python `>=3.11` (prefer 3.12). | Current backend project allows Python `>=3.10`; avoid raising backend minimum just for DuckDB. |

## 5. Important corrections to the supplied reference architecture

1. The generic source list (`SQLite/Postgres/MySQL/JSON`) must be extended with **MongoDB**. The project's primary source is MongoDB.
2. The Bronze extractor must not use `ATTACH` examples for SQLite/Postgres/MySQL against MongoDB. Use PyMongo/Motor and write Parquet. DuckDB starts at the Parquet boundary.
3. A Parquet snapshot decouples **dbt builds** from MongoDB, but the extract itself still issues reads and can create OLTP load. Add batch size, projection, throttling, maintenance window and abort controls.
4. The claim “eliminates OLTP read locks” is too strong. The correct claim is “dbt transformations and interactive queries do not query or lock the OLTP database; extraction remains a bounded read workload.”
5. The reference says “6 marts” but lists seven names. This plan replaces the count with an explicit catalog of nine marts, and revises unsupported names as below.
6. `gld_pacing_fatigue` is not supported by current `reading_progress` snapshots. Rename/re-scope the current-state analysis to `gld_series_completion_friction`; true session pacing requires new session events in a future phase.
7. `gld_review_psychology` overstates what review text can establish. Use `gld_review_aspect_profile`: observable textual aspects and sentiment evidence, not psychological traits or personality inference.
8. Arrow output should not live in `analytics/ui/public/` by default. Use private release storage and a controlled FastAPI endpoint so private user data is not bundled as public static assets.

## 6. Gold mart catalogue

Core marts:

- `gld_taste_calibration`
- `gld_tag_synergy`
- `gld_series_completion_friction`
- `gld_creator_consistency`
- `gld_review_aspect_profile`
- `gld_backlog_velocity`
- `gld_metadata_health`
- `gld_external_consensus_gap`
- `gld_ocr_lexical_atlas`

Some marts may be disabled or downgraded if Phase 0 finds inadequate data. `gld_review_aspect_profile` and `gld_ocr_lexical_atlas` are advanced modules and should not block a useful first release if data quality is poor.

## 7. Non-negotiable agent guardrails

1. Never write, migrate, index, update, or delete in the operational MongoDB database from the analytics pipeline.
2. Never read MinIO manga page bytes for this analytics MVP. Use chapter/page metadata and OCR metadata already present in MongoDB.
3. No schema guessing. Every physical collection, field path, BSON type, optional capability and relationship must be recorded in `analytics/schema_contract.yml`.
4. Bronze has no business logic. Silver owns semantics. Gold reads Silver only.
5. Gold marts must be flat and Perspective-friendly: stable primitive columns, no nested arrays/structs or raw TipTap JSON. Export numeric values as supported Arrow numeric types; do not leak `Decimal128` objects into the browser.
6. No raw review text, raw OCR dialogue or external-review content text in default Arrow exports. Use aggregate metrics and opaque supporting IDs; any opt-in evidence endpoint is local-only and separately guarded.
7. Every insight must include sample size, denominator, source coverage and reliability status.
8. Never interpret correlation, co-occurrence or observational differences as causal effects.
9. Do not create a “reading speed”, “dwell time”, “session duration” or “fatigue” metric from `reading_progress` snapshots.
10. Build/test/publish sequentially. A failed quality gate must leave the previous valid release active.
