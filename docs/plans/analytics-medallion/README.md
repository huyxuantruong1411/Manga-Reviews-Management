# Manga Deep Analytics — Medallion Implementation Plan

**Target repository:** `huyxuantruong1411/Manga-Reviews-Management`  
**Target agent:** Antigravity or another repository-aware coding agent  
**Architecture:** MongoDB (read-only extract) → Bronze Parquet → DuckDB/dbt Silver → Gold insight marts → Arrow IPC streams → Perspective Workbench

## Purpose

This plan upgrades the previous Analytics Lab proposal into a strict Medallion Architecture. The goal is not to duplicate `/analytics` or create a gallery of charts. The goal is to create a reproducible analytical lakehouse that answers well-defined questions about a personal manga library, review writing, external review consensus, chapter coverage, OCR-derived language, creator preference, and collection lifecycle.

## Read these files in order

1. `00-MASTER-ARCHITECTURE-ADR.md` — architecture, locked decisions, trade-offs and non-negotiable guardrails.
2. `01-PHASE0-MONGODB-DISCOVERY-AND-SCHEMA-CONTRACT.md` — repository/live-data discovery and exact source contract.
3. `02-PHASE1-BRONZE-PARQUET-AND-DBT-FOUNDATION.md` — isolated analytics environment, extractor, snapshot layout and Bronze models.
4. `03-PHASE2-SILVER-MODELS-AND-DATA-QUALITY.md` — cleaning, canonical keys, bridges, event history, feature engineering and tests.
5. `04-PHASE3-GOLD-INSIGHT-MARTS.md` — curated marts, grain, statistical safeguards and interpretation requirements.
6. `05-PHASE4-ARROW-AND-PERSPECTIVE-WORKBENCH.md` — Arrow exports, FastAPI delivery, standalone Perspective SPA and integration.
7. `06-PHASE5-OPERATIONS-SECURITY-AND-VERIFICATION.md` — orchestration, release protocol, tests, security and operational runbook.
8. `07-INSIGHT-CATALOG.md` — the research questions the product must answer.
9. `08-METRICS-DICTIONARY.md` — exact metric definitions and denominator rules.
10. `09-REPOSITORY-MAP-AND-AGENT-ACCEPTANCE.md` — code entry points, implementation boundaries and phase gates.

## Core implementation rule

**Execute Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5.** A phase is not complete until its verification gate passes. Do not create Gold models or visualizations from guessed schema.

## Important facts about the current repository

- The operational data store is MongoDB, accessed using Motor/PyMongo. The default database is configured by `DATABASE_NAME` (currently `manga_library` in `.env.example`); `POOL_DATABASE_NAME` (currently `manga_datalake_pool`) is a separate Data Lake Pool database.
- `mangas` contains personal rating, read status, tags and metadata. `reviews` is separate and stores rich TipTap `content_json`; personal rating is not a `reviews` column.
- `mangas.tag_ids` references the `tags` collection. Manga creator information is represented by embedded `creators` references plus legacy `author` / `artist` strings and a `creators` collection.
- `chapters` includes source/language/release information and embedded page metadata. Multi-source releases must not be mistaken for unique logical chapter slots.
- `external_reviews`, `manga_panels`, `panel_scan_pages`, `audit_logs`, `reading_progress`, and `tierlists` provide useful but differently scoped analytical sources.
- The existing `/api/analytics` and `frontend/src/pages/AnalyticsPage.tsx` already provide overview metrics, filters, distributions, timelines and review corpus export. Do not rebuild these as the new product.
- `reading_progress` is a current-position snapshot, not an event stream. It cannot support actual reading duration, session length, or page dwell-time claims.
- OCR rows cover only pages actually scanned. OCR counts are not a proxy for the full manga text.

## Deployment target

Place this plan in the repository at `docs/plans/analytics-medallion/`. Create the isolated data project under `analytics/`. Keep local source snapshots, DuckDB files and Arrow data under `.local/analytics/` (or another verified ignored local-data directory), not in Git.

## Final deliverables

- Verified `analytics/schema_contract.yml` and `analytics/DISCOVERY_NOTES.md`.
- MongoDB read-only Bronze extractor and immutable daily Parquet snapshots.
- A working `dbt-duckdb` project with explicit `bronze`, `silver`, and `gold` schemas.
- Tested Silver models and curated Gold insight marts.
- Versioned Arrow IPC stream artifacts and a manifest.
- A standalone Perspective workbench, linked from the main application.
- Reproducible CLI pipeline, quality checks, tests, and operational documentation.
