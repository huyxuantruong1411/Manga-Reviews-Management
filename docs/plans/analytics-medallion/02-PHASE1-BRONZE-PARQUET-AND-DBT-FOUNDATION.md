# 02 — Phase 1: Bronze Parquet Lake and dbt-duckdb Foundation

## Objective

Create an isolated analytics runtime; implement a bounded, read-only MongoDB-to-Parquet extractor; persist daily Bronze snapshots; and create thin dbt Bronze views. Do not perform business transformations in this phase.

## 1.1 Directory layout

```text
analytics/
  pyproject.toml
  uv.lock
  schema_contract.yml
  DISCOVERY_NOTES.md
  scripts/
    extract_bronze.py
    validate_contract.py
    run_pipeline.py
  dbt_project/
    dbt_project.yml
    profiles.example.yml
    macros/
    models/bronze/
    tests/
  ui/                         # created in Phase 4
.local/analytics/              # git-ignored, configurable via ANALYTICS_HOME
  lake/bronze/<entity>/dt=YYYY-MM-DD/data.parquet
  lake/bronze/<entity>/dt=YYYY-MM-DD/manifest.json
  warehouse/releases/<release_id>/manga_medallion.duckdb
  releases/<release_id>/arrow/*.arrow
  releases/<release_id>/manifest.json
  staging/
  logs/
```

Use `ANALYTICS_HOME` to move private data away from the repository. Default it to `.local/analytics`. Add to root `.gitignore`:

```gitignore
# Manga Analytics private local artifacts
.local/analytics/
analytics/.venv/
analytics/dbt_project/target/
analytics/dbt_project/logs/
analytics/dbt_project/dbt_packages/
analytics/ui/node_modules/
analytics/ui/dist/
```

Do not ignore the source plan, schema contract, dbt SQL, test fixtures or documentation.

## 1.2 Isolated Python environment

Create `analytics/pyproject.toml` with Python `>=3.11` (prefer 3.12), and dependencies needed for the actual extractor/model/export path:

- `duckdb`
- `dbt-core` and `dbt-duckdb`
- `pyarrow`
- `pymongo` (or reuse supported Motor only if async extraction is genuinely beneficial)
- `python-dotenv`
- `pyyaml`
- `bson` support through PyMongo
- testing/quality group: `pytest`, `ruff`, `mypy` or chosen static checker

Do not copy version pins from an old sample uncritically. On Phase 1, select a mutually compatible `dbt-core`, `dbt-duckdb`, DuckDB and PyArrow set; run `dbt debug`, parse/build fixture and export/import tests; freeze exact versions in `uv.lock`. Keep `backend/pyproject.toml` untouched unless another independently justified task requires a change.

## 1.3 Read-only MongoDB extractor

Implement `analytics/scripts/extract_bronze.py` driven entirely by `schema_contract.yml`.

### Connection and safety

- Read `ANALYTICS_MONGODB_URI` first. If absent, use `MONGODB_URI` only with an explicit local opt-in flag such as `--allow-existing-uri`; print a warning without printing the URI.
- Resolve database names from `DATABASE_NAME` and, only for enabled optional pool extraction, `POOL_DATABASE_NAME`.
- Use a read-only DB user with MongoDB `read` role where auth is enabled. The driver does not provide a SQL-style `read_only=True` switch for MongoDB; enforce read-only via least-privilege credentials and a code path containing only read operations.
- Default to `primary` read preference. Only allow a replica-set secondary-read override as an explicit deployment setting with documented possible replication lag.
- Never call mutation methods. Add unit tests using a fake collection that raises if `insert`, `update`, `delete`, `bulk_write`, `create_index`, `drop_index`, `$out` or `$merge` is attempted.
- Do not query MinIO. Do not extract binary manga pages, cover images, presigned URLs or credentials.

### Collection allow-list

Read the active entity list from the contract. The initial expected primary set is `mangas`, `reviews`, `tags`, `creators`, `chapters`, `reading_progress`, `audit_logs`, `external_reviews`, `manga_panels`, `panel_scan_pages`, `tierlists`. If Phase 0 finds a collection absent, disabled or semantically unsafe, record it and skip it; do not fail unrelated core extracts unless the contract marks it required.

### Bronze record envelope

Use a stable Parquet envelope for heterogeneous BSON documents:

| Field | Type | Meaning |
|---|---|---|
| `_source_database` | string | `primary` or `pool` |
| `_source_collection` | string | Exact Mongo collection |
| `_source_id` | string | Canonical string representation of `_id` or composite key |
| `_ingested_at` | timestamp UTC | Extract timestamp for this record/batch |
| `_snapshot_date` | date | Daily partition date |
| `_batch_id` | string | UUID for the extraction run |
| `_document_hash` | string | Stable hash of canonical payload for change detection |
| `_document_ejson` | string | Canonical MongoDB Extended JSON payload preserving BSON type markers |

Use `bson.json_util.dumps(..., json_options=CANONICAL_JSON_OPTIONS)` or equivalent canonical Extended JSON serialization. Verify round-trip semantics in tests. This keeps Bronze faithful and avoids Parquet schema instability across documents with optional or heterogeneous nested arrays. Add typed technical columns only if they are stable and documented; do not silently normalize business values here.

### Bounded extraction

- Use cursor `batch_size` and stream documents; never `to_list(None)` for a large collection.
- Use a contract-driven projection only if it preserves the complete fields required by the Bronze contract. For the first implementation, full document extraction may be acceptable for the allow-listed collections, but must be bounded and measured.
- Support `--collections`, `--date`, `--dry-run`, `--max-documents`, `--batch-size` and `--force`.
- Record collection count before and after extract where safe; record start/end times, extracted count, expected count if available, duration and warnings.
- A run should be aborted or explicitly marked incomplete if a required collection fails; never publish a partial manifest as a successful daily snapshot.
- Keep all temporary files in the same filesystem/directory as the final Parquet artifact, then use atomic file replacement (`os.replace`) after closing the Parquet writer and validating the result.
- Re-running on the same calendar date is idempotent: replace the daily collection file only after the staged extract validates. Daily history is one retained snapshot per entity/day; document that an additional same-day run replaces the prior day's partition. If intraday history is later required, introduce a separate run-id partition intentionally.

### Per-collection manifest

Write `manifest.json` next to Parquet containing:

- `batch_id`, `snapshot_date`, `started_at`, `completed_at`, `status`;
- database alias, collection, document count, file bytes, SHA-256, schema fingerprint;
- source count before/after if available;
- extraction duration, batch size, warnings, null/missing profiles where safe;
- `data_classification` and whether the dataset contains sensitive content;
- exact extractor version/commit if available.

Never put a credential, full source URI or raw document content in the manifest.

## 1.4 dbt-duckdb project

Create `analytics/dbt_project/dbt_project.yml`, `profiles.example.yml`, and `macros/`.

Use explicit schemas:

- Bronze → schema `bronze`, materialized `view`.
- Silver → schema `silver`, materialized `table` or incremental only after semantics are proven.
- Gold → schema `gold`, materialized `table` initially.

Create and test `generate_schema_name.sql` so actual schemas are exactly `bronze`, `silver`, `gold`, not prefixed with a default target schema. Keep connection profile secrets out of Git; runtime profiles should be generated/copied to local ignored files.

Implement macros/helpers to:

- resolve Bronze root path using `ANALYTICS_HOME`/dbt vars;
- enumerate daily Parquet snapshots;
- select latest snapshot for current-state entities;
- expose all daily snapshots for history comparisons;
- fail clearly when a required entity has no snapshot;
- avoid SQL string interpolation from user-controlled values.

Do not assume one `read_parquet` macro handles every optional/absent entity. Resolve availability from the validated contract.

## 1.5 Bronze dbt models

Create thin views only. Expected models:

- `brz_mangas`
- `brz_reviews`
- `brz_tags`
- `brz_creators`
- `brz_chapters`
- `brz_reading_progress`
- `brz_audit_logs`
- `brz_external_reviews`
- `brz_manga_panels`
- `brz_panel_scan_pages`
- `brz_tierlists`
- optional pool/CDC Bronze models only when enabled by contract.

Each Bronze view should expose the envelope columns and raw Extended JSON payload with no business predicates. Do not exclude soft-deleted reviews in Bronze; that is Silver semantics. Do not parse, re-scale or rewrite rating/status values in Bronze.

Create `brz_snapshot_audit` from the per-entity manifests: latest date, batch ID, row count, status and file hash.

## Verification gate — Phase 1

- [ ] Python analytics environment installs independently; backend lockfile and dependencies are unchanged.
- [ ] Read-only guard tests pass; no Mongo mutation path exists.
- [ ] The extractor streams large collections without unbounded in-memory lists.
- [ ] Canonical Extended JSON round-trips ObjectId, datetime, Decimal128, UUID and nested values used by actual sources.
- [ ] Same-day retry is atomic and idempotent; an interrupted run leaves prior published Bronze snapshot intact.
- [ ] Per-collection manifests are complete and redacted.
- [ ] Bronze Parquet files can be read by DuckDB; Bronze dbt views compile and pass tests.
- [ ] Bronze models contain no business logic.
