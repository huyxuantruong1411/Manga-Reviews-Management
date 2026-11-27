# 10 — Reconciliation of Supplied References with the Repository

This file records how the three supplied reference documents were used. The intention is to preserve their useful architecture decisions while adapting generic assumptions that do not match the live repository design.

## Adopted as written or with only naming changes

- Strict Medallion path: Bronze → Silver → Gold.
- Snapshot-first Bronze Parquet with daily `dt=YYYY-MM-DD` partitions.
- DuckDB schemas named `bronze`, `silver`, `gold`.
- dbt as the deterministic SQL DAG and data-quality layer.
- Mandatory Phase 0 schema contract before SQL model work.
- Arrow IPC stream via `pyarrow.ipc.new_stream`, not Arrow file format.
- Standalone Perspective workbench in `analytics/ui/` with Vite + React.
- Curated initial Perspective presets rather than raw unconfigured tables.
- Sequential phase gates and no production mutation.

## Adapted for this repository

| Supplied reference assumption/choice | Repository reality | Updated plan |
|---|---|---|
| SQLite/Postgres/MySQL/JSON source options | Primary source is MongoDB through Motor/PyMongo. | Phase 0 contract explicitly supports `engine: mongodb`; extractor uses MongoDB driver and writes Parquet. |
| SQL `ATTACH ... READ_ONLY` examples | No MongoDB equivalent in the supplied DuckDB ATTACH examples. | Do not attach Mongo to DuckDB. Use a least-privilege MongoDB read account and allow-listed driver reads. DuckDB begins at Parquet. |
| `reviews.personal_rating` may hold the rating | Personal rating resides on `mangas`; `reviews` holds TipTap review documents. | Model manga rating and review text as separate Silver entities linked by `manga_id`. |
| `tags` could be a junction table or generic JSON array | Manga model has `tag_ids` and a separate tags lookup collection. | Build `slv_manga_tag_bridge` by unnesting `tag_ids` and joining tags. |
| Creators are an optional normalized table/column | Embedded creator refs, legacy author/artist strings and creator lookup exist. | Add creator identity resolution and confidence/provenance. |
| Generic external score field | Aggregate tracker metadata score and individual `external_reviews.overall_rating` are distinct. | Separate score facts and their source/scale/freshness. |
| `gld_pacing_fatigue` | Current progress is a snapshot, not session telemetry. | Replace with `gld_series_completion_friction`; no fatigue/session claim. |
| `gld_review_psychology` | Review text supports aspect mention evidence, not psychology inference. | Rename `gld_review_aspect_profile`; sentiment requires validation. |
| 6 marts, while 7 names are listed | Internal count mismatch; OCR and external consensus are also valuable. | Explicitly document nine marts, enabled individually based on data quality. |
| Arrow files under `analytics/ui/public/analytics-data/` | These files contain sensitive personal preference/review-derived analytics. | Store under `.local/analytics/releases/`; deliver through allow-listed FastAPI endpoints. Public folder is fixtures only. |
| Snapshot export removes OLTP read workload | Snapshot extraction still performs MongoDB reads. | State that dbt and UI operate only on snapshots; extraction remains a bounded read workload. |

## Version and documentation checks

At implementation time, the agent must re-check the official package documentation and lock exact versions. The reference's suggested `dbt-core >=1.8,<2.0` plus `dbt-duckdb >=1.9` should be treated as a candidate range, not a permanent guarantee. Current `dbt-duckdb` release notes may require a newer dbt-core within the same major line.

Likewise, Perspective's React binding and Vite/WASM instructions have changed over time. Verify its current official React and bundling guides, then test dev and production builds before locking versions.
