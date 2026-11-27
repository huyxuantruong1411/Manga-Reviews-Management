# 01 — Phase 0: MongoDB Discovery and Schema Contract

## Objective

Audit repository code **and the user's live local MongoDB data read-only**. Generate an exact `analytics/schema_contract.yml` and `analytics/DISCOVERY_NOTES.md`. No extractor or dbt model may be written against assumed fields before this phase passes.

## 0.1 Repository audit — exact entry points

Inspect at minimum:

- `backend/config.py`, `backend/.env.example`, `backend/database/connection.py`
- `backend/models/manga.py`, `review.py`, `chapter.py`, `creator.py`, `external_review.py`, `tierlist.py`, `audit_log.py`, `datalake_pool.py`, `connector.py`
- `backend/services/analytics_service.py`, `review_export_service.py`, `panel_scanner_service.py`, `external_review_service.py`, `datalake_pool_service.py`, `chapter_slot_service.py`
- `backend/routers/analytics.py`, `reviews.py`, `external_reviews.py`, `chapters.py`, `vision.py`, `tierlists.py`
- `backend/database/indexes.py` and all migrations relevant to the above entities
- `docs/ai-context.md`, `docs/architecture.md`, `docs/code-map.md`, `AGENTS.md`

Code and tests are authoritative if documentation disagrees.

## 0.2 MongoDB databases and collections to discover

The `.env.example` currently declares:

- `DATABASE_NAME=manga_library` — primary business data.
- `POOL_DATABASE_NAME=manga_datalake_pool` — separate curated content/connector pool.

Do not hard-code these values; read environment configuration. Inspect `list_collection_names()` and row counts in read-only mode. The following are **expected from code inspection**, not a guarantee that every collection exists or is populated in the user's live DB:

| Logical entity | Expected database | Expected collection | Key role |
|---|---|---|---|
| Manga | primary | `mangas` | Core catalogue, `personal_rating`, `read_status`, `tag_ids`, creators, status timestamps and metadata |
| Personal reviews | primary | `reviews` | TipTap `content_json`, `manga_id`, created/updated, soft-delete |
| Tags | primary | `tags` | Tag labels, groups/source and lookup metadata |
| Creators | primary | `creators` | Canonical creator UUID, name, roles and external IDs |
| Chapter releases | primary | `chapters` | Physical releases, source/language/group, page inventory |
| Reading progress | primary | `reading_progress` | Current last-read position and read chapter IDs; snapshot only |
| Audit events | primary | `audit_logs` | Recorded create/update/status/rating/review events |
| External reviews | primary | `external_reviews` | Crawled external review records, source, score/status, reactions and content |
| OCR panels | primary | `manga_panels` | Panel-level text, lemmas, vocabulary, chapter/page references and pipeline metadata |
| OCR page state | primary | `panel_scan_pages` | Page hash, scan generation/version and scan timestamp |
| Tier lists | primary | `tierlists` | Current creator tier boards and ordered manga entries |
| Pool manga/chapters | pool | `pool_mangas`, `pool_chapters` | Optional published package lineage, not the personal library source of truth |
| Pool CDC | pool | `pool_cdc_events`, `pool_cdc_deliveries`, `pool_cdc_subscriptions` | Optional connector operations analysis only |

Also inspect for actual collection names used by services, including any source binding, datasource or chapter-slot collections. Record absence explicitly.

## 0.3 Required semantic discoveries

For every collection record: existence, estimated document count, primary key BSON type, nested paths, observed BSON types, null/missing frequency for analytical fields, first/last timestamps, and whether it is append-only, current-state, or mutable snapshot data.

### Manga

Verify at least:

- `_id`, `title`, `alt_titles`, `year`, publication `status`;
- `personal_rating` scale (model states 0–10 in 0.5 increments; verify live bounds and actual usage);
- `read_status` enum and historical status timestamp fields such as `completed_at`;
- `tag_ids` array and lookup to `tags._id`;
- embedded `creators` array, plus legacy `author` / `artist` fields;
- `content_rating`, `publication_demographic`, `original_language`;
- `added_at`, `updated_at`, `published_start_date`, `published_end_date`;
- `tracker_metadata`, `source_metrics`, `metadata_provenance`, `metadata_locks` shapes.

### Reviews

- `reviews` is a separate collection and stores `content_json` (TipTap/ProseMirror JSON).
- Personal rating is on the linked manga document, not inherently on the review document.
- Verify `is_deleted` semantics and date fields. Determine whether multiple reviews per manga are possible.
- Inspect `mangaReference`, image and embed nodes without exporting private media URLs to analytical artifacts.

### Tags and creators

- `mangas.tag_ids` is expected to be an array of string identifiers, not a relational junction collection. Verify values and dangling IDs.
- Creator data may be represented by embedded references with `creator_id`, `slug`, `name`, `role`, `mangadex_id`, and also legacy author/artist strings. Discover duplicate or conflicting identity records.
- Preserve whether a creator join came from canonical UUID, MangaDex UUID, lookup document, legacy string or fallback name.

### Chapters and OCR

- Chapter documents represent a physical release. Verify fields for `source`, `source_id`, `language`, `scanlation_group`, `chapter_numeric`, `pages[]`, `page_count`, page `page_uid`, `md5_hash`/`sha256`, and object keys.
- Identify the code's canonical logical chapter-slot identity. Do not assume a distinct `chapter_number` implies a unique slot across source/language variants.
- Verify `manga_panels.vocabulary` shape and whether each item represents a token occurrence; `lemmas` may be a set/list of unique lemmas. Do not infer frequency from `lemmas`.
- Verify scan modes and pipeline versions. Determine if old panels are removed/replaced on a re-scan and how `scan_generation` behaves.
- Join `panel_scan_pages` to actual chapter page inventory using page UID/hash where available, not only page number.

### Events and reading progress

- Inspect `audit_logs` action names, field names, old/new value encodings, actors and timestamps. Verify what proportion of current mangas have a full event history.
- `reading_progress` is only a latest-position snapshot unless code reveals an event collection. Do not infer session or dwell-time history.
- Compare manga status timestamps with audit transition records and record conflicts.

### External reviews and tierlists

- Separate `mangas.tracker_metadata` aggregate provider score (if populated) from `external_reviews.overall_rating` individual-review score.
- Preserve provider source, source review ID, preliminary/spoiler flags and crawl freshness.
- Tierlist revision number is not proof of immutable historical snapshots. Inspect storage/update logic before enabling tierlist movement-over-time analysis.

## 0.4 Read-only access strategy

1. Prefer `ANALYTICS_MONGODB_URI` with a dedicated MongoDB account granted only the built-in `read` role on the primary database. If the optional pool DB is profiled, grant `read` on that database separately.
2. The existing `.env.example` uses `MONGODB_URI`; do not silently repurpose a privileged credential as the analytics credential. A local development fallback may use `MONGODB_URI` only when the operator explicitly opts in and the pipeline logs a warning.
3. Default read preference is `primary`, appropriate for the repository's local/standalone deployment and freshest read semantics. A `secondary` preference is an optional replica-set deployment choice only after accepting replication lag and testing topology.
4. The extractor must only invoke read operations (`find`, `count_documents`, `list_collection_names`, and read-only metadata inspection). It must never call insert/update/delete/replace/bulk-write/create-index/drop-index/aggregate `$out`/`$merge`.
5. Do not print document contents, credentials, review text, OCR text, presigned URLs or object keys into logs. Log counts and redacted schema/type summaries only.
6. If live database access is unavailable, generate a **code-derived provisional contract** and fixture profile clearly marked `live_profile_complete: false`. Do not claim Phase 0 passed until the live DB gate is executed by the user/agent.

## 0.5 `analytics/schema_contract.yml` — MongoDB contract format

The old generic SQL template is insufficient. Use a Mongo-specific contract similar to the following; replace every `observed_*` field with verified facts and set optional collection/field paths to `null` when absent.

```yaml
contract_version: "1.0"
discovered_at: "<generated UTC ISO-8601 timestamp>"
live_profile_complete: false

source:
  engine: mongodb
  uri_env_var: ANALYTICS_MONGODB_URI
  fallback_uri_env_var: MONGODB_URI
  primary_database_env_var: DATABASE_NAME
  pool_database_env_var: POOL_DATABASE_NAME
  default_read_preference: primary
  access_mode: read_only_by_code_and_read_role_when_enabled
  consistency: best_effort_collection_snapshot
  snapshot_partition: "dt=YYYY-MM-DD"
  rating_scale:
    personal_min: 0
    personal_max: 10
    personal_step: 0.5
    verified_live: false
    external_review_min: 1
    external_review_max: 10
    external_review_verified_live: false

capabilities:
  has_personal_rating: true
  has_read_status: true
  has_personal_review_text: true
  has_external_reviews: true
  has_external_aggregate_score: null
  has_tags: true
  has_canonical_creators: true
  has_chapter_inventory: true
  has_reading_progress_snapshot: true
  has_audit_events: true
  has_ocr_panels: true
  has_ocr_page_scan_state: true
  has_tierlists: true
  has_pool_cdc: null

entities:
  mangas:
    database: primary
    collection: mangas
    enabled: true
    primary_key: _id
    observed_document_count: null
    fields:
      personal_rating: personal_rating
      read_status: read_status
      tags_reference_array: tag_ids
      creators_reference_array: creators
      legacy_author: author
      legacy_artist: artist
      added_at: added_at
      updated_at: updated_at
      completed_at: completed_at
      publication_year: year
  reviews:
    database: primary
    collection: reviews
    enabled: true
    primary_key: _id
    fields:
      manga_id: manga_id
      rich_content: content_json
      created_at: created_at
      updated_at: updated_at
      soft_delete: is_deleted
  tags:
    database: primary
    collection: tags
    enabled: true
    primary_key: _id
    fields:
      localized_name: name
      group: group
      source: source
  creators:
    database: primary
    collection: creators
    enabled: true
    primary_key: _id
    fields:
      canonical_creator_id: creator_id
      name: name
      roles: roles
      mangadex_id: mangadex_id
  chapters:
    database: primary
    collection: chapters
    enabled: true
    primary_key: _id
    fields:
      manga_id: manga_id
      chapter_number: chapter_number
      chapter_numeric: chapter_numeric
      source: source
      source_id: source_id
      language: language
      pages: pages
      page_count: page_count
  external_reviews:
    database: primary
    collection: external_reviews
    enabled: true
    primary_key: _id
    fields:
      manga_id: manga_id
      source: source
      source_review_id: source_review_id
      overall_rating: overall_rating
      recommendation_status: recommendation_status
      is_preliminary: is_preliminary
      is_spoiler: is_spoiler
      content_text: content_text
      posted_at: posted_at
      fetched_at: fetched_at
  manga_panels:
    database: primary
    collection: manga_panels
    enabled: true
    primary_key: _id
    fields:
      manga_id: manga_id
      chapter_id: chapter_id
      page_number: page_number
      panel_index: panel_index
      cleaned_text: cleaned_text
      lemmas: lemmas
      vocabulary: vocabulary
      language: language
      scan_mode: scan_mode
      pipeline_version: pipeline_version
  panel_scan_pages:
    database: primary
    collection: panel_scan_pages
    enabled: true
    primary_key: composite(chapter_id,page_number)
    fields:
      manga_id: manga_id
      chapter_id: chapter_id
      page_number: page_number
      page_hash: page_hash
      pipeline_version: pipeline_version
      scanned_at: scanned_at
  audit_logs:
    database: primary
    collection: audit_logs
    enabled: true
    primary_key: _id
    fields:
      entity_type: entity_type
      entity_id: entity_id
      action: action
      field: field
      old_value: old_value
      new_value: new_value
      actor: actor
      timestamp: timestamp
  reading_progress:
    database: primary
    collection: reading_progress
    enabled: true
    primary_key: manga_id
    fields:
      manga_id: manga_id
      last_read_chapter_id: last_read_chapter_id
      last_read_page: last_read_page
      read_chapter_ids: read_chapter_ids
      updated_at: updated_at
  tierlists:
    database: primary
    collection: tierlists
    enabled: true
    primary_key: _id
    fields:
      creator_name: creator_name
      tiers: tiers
      revision: revision
      updated_at: updated_at
  pool_mangas:
    database: pool
    collection: pool_mangas
    enabled: false
    primary_key: _id
    fields: null
```

**Contract rules:**

- The block above is a discovery starting point based on repository code, not a certified live schema. The agent must correct it from live profiling.
- `observed_document_count: null` must be replaced with an integer after profiling (or a documented `not_accessible` state).
- A field path can be a nested path or an array path; record actual BSON type and nullable/missing rate in a companion `field_profile` section.
- Separate `capabilities` for schema support from `data_availability` for whether the collection contains enough populated rows.
- `has_external_aggregate_score` must not be set from the existence of individual external reviews. Verify a populated provider aggregate score field separately.
- Do not use `source.engine: sqlite|postgres|mysql|json`; this project is MongoDB-first.

## 0.6 Discovery output

Create:

- `analytics/schema_contract.yml` — verified machine-readable contract.
- `analytics/DISCOVERY_NOTES.md` — collection counts, schema/type quirks, coverage, identity caveats, extraction window, primary/optional marts.
- `analytics/profiling/phase0_profile.json` — redacted field statistics only, no values of private text fields.
- `analytics/profiling/phase0_summary.md` — readiness status for each insight family.

For each expected collection: `present`, `document_count`, `sampled_count`, schema fingerprint, null rates, known relationships and data classification.

## Verification gate — Phase 0

- [ ] Exact primary and optional pool database names are read from env configuration.
- [ ] Live collections and field paths have been checked; code-derived assumptions are marked separately.
- [ ] Personal score, external aggregate score and individual external-review score are distinct and scales verified.
- [ ] Tag/creator relationship and alias quality are profiled.
- [ ] Chapter physical-release vs logical-slot semantics are documented.
- [ ] OCR token/lemma schemas and scan-version coverage are profiled.
- [ ] Audit event completeness is quantified; no synthetic historical event rows are invented.
- [ ] Read-only connection is validated; no writes or index changes occurred.
- [ ] `schema_contract.yml` contains no placeholder `<...>` values and parses as YAML.
- [ ] All sensitive data values are excluded from profiling logs and committed files.

Do not proceed to Phase 1 until all checks pass or a signed-off `degraded` status documents exactly which modules are disabled.
