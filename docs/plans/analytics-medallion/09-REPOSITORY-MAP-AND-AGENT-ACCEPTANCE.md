# 09 — Repository Map and Agent Acceptance Contract

## Existing files to understand before editing

| Concern | Primary paths | Agent instruction |
|---|---|---|
| Repository architecture truth | `AGENTS.md`, `docs/ai-context.md`, `docs/architecture.md`, `docs/code-map.md` | Read before coding; code/tests override docs. |
| Mongo connection/config | `backend/config.py`, `backend/.env.example`, `backend/database/connection.py` | Reuse naming/config semantics; do not repurpose DB names. |
| Manga schema | `backend/models/manga.py` | Personal score/read status live here. |
| Reviews | `backend/models/review.py`, `backend/services/review_export_service.py`, `backend/routers/reviews.py` | `content_json` is TipTap JSON; review export logic is a text-extraction reference. |
| Chapter/page | `backend/models/chapter.py`, `backend/services/chapter_service.py`, `backend/services/chapter_slot_service.py` | Preserve page UID, multi-source release and logical slot semantics. |
| Creator/tag | `backend/models/creator.py`, `backend/models/tag.py`, `backend/services/creator_service.py` | Canonical identifiers and legacy fields must be reconciled explicitly. |
| External review | `backend/models/external_review.py`, `backend/services/external_review_service.py`, `backend/services/mal_enrichment_service.py` | Separate aggregate metadata scores from individual crawled review scores. |
| OCR | `backend/services/panel_scanner_service.py`, `backend/services/vision/*`, `backend/tasks/ocr.py` | `vocabulary`, `lemmas`, `scan_mode`, `pipeline_version` semantics require profiling. |
| Analytics already shipped | `backend/routers/analytics.py`, `backend/services/analytics_service.py`, `frontend/src/pages/AnalyticsPage.tsx`, `frontend/src/components/analytics/*` | Do not clone these charts/KPIs. Add a separate Lab. |
| Data Lake Pool | `backend/models/datalake_pool.py`, `backend/services/datalake_pool_service.py`, `backend/routers/datalake_pool.py` | Optional separate database; not full personal data. |
| Main UI route/nav | `frontend/src/App.tsx`, `frontend/src/components/layout/*` | Add discoverability only after workbench works independently. |
| Verification | `backend/tests/`, `frontend/tests/`, `scripts/ci/check_python.py`, `scripts/check_docs.py` | Follow `AGENTS.md`; use synthetic test data. |

## Files/folders to create (subject to discovery)

```text
docs/plans/analytics-medallion/       # this plan suite
analytics/
  pyproject.toml
  uv.lock
  schema_contract.yml
  DISCOVERY_NOTES.md
  scripts/
  dbt_project/
    dbt_project.yml
    profiles.example.yml
    macros/
    models/bronze/
    models/silver/
    models/gold/
    tests/
  ui/
    package.json
    pnpm-lock.yaml
    vite.config.ts
    src/
.local/analytics/                    # all real data; Git ignored
```

## Main implementation sequence

### Phase 0 — Discovery (no production code mutation)
Outputs: schema contract, discovery notes, redacted profile. Gate: all source and relationship semantics verified.

### Phase 1 — Bronze (first data pipeline code)
Outputs: isolated Python env, read-only Mongo extractor, daily Parquet, manifests, Bronze dbt views. Gate: Bronze round-trip and read-only guard tests.

### Phase 2 — Silver
Outputs: typed entities, history, bridges, events, OCR/page grains, data quality tests. Gate: all model grains and join semantics verified.

### Phase 3 — Gold
Outputs: enabled curated insight marts and documented metrics. Gate: statistical sanity tests and sensitivity checks pass.

### Phase 4 — Serving and UI
Outputs: Arrow streams, manifest, allow-listed API, Perspective SPA, main app discoverability. Gate: WASM build/load and privacy tests pass.

### Phase 5 — Operations
Outputs: single CLI pipeline, release rollback, structured run metadata, end-to-end docs. Gate: failure/rollback, CI and local verification pass.

## Agent behavior requirements

- Before a phase, summarize current repository state and list the exact files it intends to add/change.
- Do not conduct broad unrelated refactors or rewrite the existing Analytics page.
- Do not run migrations or modify operational Mongo collections/indexes.
- Do not introduce new backend requirements into `backend/pyproject.toml` without explicit necessity.
- Do not auto-commit or push.
- Keep private data out of Git and test reports.
- If a source capability is absent, update the contract and disable/degrade the mart instead of fabricating it.
- If a metric cannot be supported, document the gap and stop that metric; do not replace it with a misleading proxy.
- For every completed phase, report changed files, commands, pass/fail results, warnings, unimplemented parts and the next gate.

## Final acceptance checklist

- [ ] Medallion schemas are strictly separated.
- [ ] All SQL model fields trace to the verified schema contract.
- [ ] MongoDB extract is read-only and bounded; Bronze is daily Parquet with manifests.
- [ ] dbt lineage and data tests are present.
- [ ] Silver joins preserve source IDs, identity quality and row grains.
- [ ] Gold has insight definitions, sample size, denominator and reliability fields.
- [ ] Unsupported session/fatigue/psychology/causal claims are absent.
- [ ] Arrow is IPC stream and manifests hash/schema/row count are correct.
- [ ] Perspective is isolated in `analytics/ui/`, not bundled into main frontend dependency graph.
- [ ] Private Arrow artifacts are not served from public static assets.
- [ ] FastAPI cannot execute arbitrary SQL or arbitrary file reads.
- [ ] Failed runs cannot replace the last valid release.
- [ ] Existing manga/review/reader workflows remain unchanged.
- [ ] Repository tests, typechecks, builds and `git status` are clean.
