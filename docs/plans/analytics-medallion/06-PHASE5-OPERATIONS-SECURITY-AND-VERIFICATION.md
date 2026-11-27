# 06 — Phase 5: Operations, Security and End-to-End Verification

## Objective

Make the local analytics pipeline repeatable, auditable and safe. A failed refresh must not make the previous valid release unavailable.

## 5.1 Single orchestration entry point

Implement `analytics/scripts/run_pipeline.py` with explicit stages:

```text
validate contract
  → extract selected MongoDB collections into staged Bronze
  → validate Bronze files/manifests
  → publish daily Bronze snapshot
  → dbt build (bronze + silver + gold)
  → dbt tests + custom statistical sanity tests
  → export Arrow IPC streams to staged release
  → validate Arrow schema/hash/row counts
  → write immutable release manifest
  → atomically update current-release pointer
```

Recommended CLI:

```bash
uv run --project analytics python analytics/scripts/run_pipeline.py --dry-run
uv run --project analytics python analytics/scripts/run_pipeline.py --date 2026-11-28
uv run --project analytics python analytics/scripts/run_pipeline.py --collections mangas,reviews,tags
uv run --project analytics python analytics/scripts/run_pipeline.py --skip-extract --existing-snapshot 2026-11-28
uv run --project analytics python analytics/scripts/run_pipeline.py --validate-only --release <release_id>
```

Do not expose a user endpoint that triggers arbitrary ETL. Pipeline CLI is the first operational control plane.

## 5.2 Release protocol

- Each build writes to a unique staging/release directory.
- Build DuckDB database under a new versioned release path; do not mutate a DuckDB file that an API process may currently have open.
- Close DuckDB writer connections before verification/publish.
- Run dbt tests, custom tests and Arrow validation before publish.
- The previous `current_release.json` remains unchanged if any stage fails.
- Publish by atomically replacing a small pointer manifest after all immutable files are in place.
- Keep a configurable number of prior successful releases; do not delete the active or last-known-good release.
- API reads only the release referenced by the pointer or an explicit immutable release ID.
- If serving DuckDB directly later, API connections must use read-only mode. DuckDB read-only file connections are important for multiple-process read access; no separate process should write the same active file.

## 5.3 Scheduling and refresh policy

Start with manual CLI refresh. Once proven stable, optionally add OS scheduler/Task Scheduler or a lightweight local job runner. No Airflow, Kafka, Spark or cloud warehouse for the initial local workload.

Suggested initial frequency: daily snapshots or user-triggered refresh. Set frequency based on measured collection size, extraction duration and source load, not an arbitrary “real-time” promise.

## 5.4 Monitoring and run metadata

Persist run summaries under `.local/analytics/logs/` and the release manifest:

- run ID, start/end/duration, requested snapshot date;
- per-collection extracted docs, rows, bytes, errors, warnings, hash;
- dbt invocation ID, model status and test pass/fail counts;
- Gold mart row counts, reliability distributions;
- Arrow artifact bytes/hash and export timings;
- current/previous release IDs and publish result.

Use structured logging. Redact `ANALYTICS_MONGODB_URI`, usernames/passwords, tokens, review content, OCR text, presigned URLs and local absolute paths where not required.

## 5.5 Resource controls

Provide configuration for:

- Mongo cursor batch size and optional per-batch sleep;
- maximum docs and maximum runtime for discovery/testing;
- DuckDB memory limit and thread count;
- Parquet compression and row-group settings;
- dbt threads;
- max Arrow rows/bytes per dataset;
- cleanup retention for old staging and releases.

Do not assume the machine has a dedicated analytics server. Ensure a small-data fixture path can run with low memory. Expose high-water memory and duration in reports where feasible.

## 5.6 Security and privacy

- Keep `.local/analytics`, MongoDB URIs and all private snapshots out of Git.
- Do not run data-dump commands and commit the resulting Parquet/Arrow files.
- Keep review text and external review content text private; no raw text in browser marts by default.
- Never extract raw manga image bytes. Use metadata and stored OCR output only.
- Default serving to loopback. LAN/public exposure requires explicit operator action and authentication; do not assume existing backend has a general auth boundary.
- Restrict CORS to known workbench origin; protect against path traversal and symlink escape in file delivery.
- Apply CSP/security headers appropriate to the standalone SPA and its WASM/worker assets.
- Provide a `--purge-local-data` command only with an explicit confirmation flag and a dry-run preview; never auto-delete source data.

## 5.7 CI and local verification

CI must use synthetic fixtures only:

- no production MongoDB credentials;
- no real reviews or copyrighted manga files;
- fixture Parquet generated from small fake documents;
- test schema contract validation;
- test extractor serialization and read-only guards against fake Mongo collections;
- `dbt parse`, `dbt build`, `dbt test` on fixtures;
- Arrow round-trip tests and SHA/manifest validation;
- Perspective UI `pnpm install --frozen-lockfile`, typecheck, lint and production build;
- API path allow-list and error-state tests.

Local full validation follows repository guidance in `AGENTS.md` and `docs/development.md` without running unrelated destructive scripts.

## 5.8 Failure and rollback behavior

- Extract failure: no new Bronze manifest marked complete; prior daily snapshot remains available.
- dbt failure: no new Gold release.
- data-quality gate failure: report exact model/test and keep prior active release.
- Arrow export failure: do not move pointer to new release.
- Workbench asset/API failure: main Manga Reviews app remains functional; analytics route shows error state and retry.
- Rollback: set `current_release.json` to a prior immutable release; never rewrite its files.

## Verification gate — Phase 5

- [ ] One CLI command can run validate → extract → build → test → Arrow export → publish.
- [ ] Any failure leaves the previous release active.
- [ ] Run/release manifests are complete, hashed and redacted.
- [ ] All local data directories are Git-ignored; `git status` check confirms no private artifacts staged.
- [ ] Synthetic CI runs without a real MongoDB or external services.
- [ ] Main application tests, lint/typecheck/build and relevant API tests pass.
- [ ] A release rollback has been exercised.
- [ ] Security checklist for loopback/LAN access is documented.
