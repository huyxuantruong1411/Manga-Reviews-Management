# 03 — Phase 2: Silver Models, Canonical Relationships and Data Quality

## Objective

Turn raw Bronze snapshots into clean, typed, deduplicated and auditable analytical entities. All domain semantics live in Silver. Gold must not read Bronze directly.

## 2.1 Silver design rules

- Every model declares its grain in a dbt `description` and this file/metrics dictionary.
- Every key is explicit: source Mongo `_id` becomes a stable string key; do not cast all IDs to integers.
- Preserve source lineage columns such as `_source_id`, `_snapshot_date`, `_batch_id`, `_document_hash` and `source_collection` where needed for traceability.
- Do not silently replace NULL with 0 for ratings or missing dates.
- Normalize string enums with explicit mapping tables/macros, but retain raw source values in companion `*_raw` columns for auditing.
- Deduplication keys must follow business identity (for example `source + source_review_id` for external reviews), not display text.
- Keep private text and raw content in private Silver only when needed for local feature engineering. Gold and Arrow should contain aggregates and opaque evidence IDs, not source prose.
- Never fuzzy-merge creators/tags without a retained identity method and confidence flag.

## 2.2 Current-state and historical snapshot models

Create:

- `slv_manga_current`: latest daily snapshot per manga ID; typed ratings, dates, statuses, source provenance and quality flags.
- `slv_manga_snapshot_history`: one row per `manga_id × snapshot_date`; includes selected attributes and a deterministic row/document hash. Used to compare rating, status and metadata drift across daily snapshots.
- `slv_review_current`: latest version per review ID, only non-deleted active reviews for analysis; parse TipTap JSON to plain text in a private column/model and preserve review ID, manga ID, created/updated timestamps.
- `slv_external_review_current`: current version per `(source, source_work_id, source_review_id)`; preserve preliminary/spoiler flags and crawl timestamp.
- `slv_tag_current` and `slv_creator_current`: typed lookup dimensions with canonical IDs and normalized display labels.

For mutable documents, latest-current logic should use snapshot date plus source update timestamp/hash, not assume `updated_at` is always reliable. For event collections, do not multiply the same historical event once per daily full snapshot; select latest snapshot and deduplicate by event `_id` (or verified natural key).

## 2.3 Bridges and normalized relationships

### Manga-tag bridge

`slv_manga_tag_bridge` grain: `manga_id × tag_id`.

- Unnest `mangas.tag_ids`.
- Resolve tag labels from `slv_tag_current`.
- Keep unmatched IDs with `tag_resolution_status='missing_dimension'` rather than dropping them.
- Retain localized names, source and tag group/category where verified.
- Deduplicate repeated IDs inside one manga array before counting manga-tag membership.

### Manga-creator bridge

`slv_manga_creator_bridge` grain: `manga_id × creator_id × role`.

Resolution precedence:

1. embedded `creators[].creator_id` canonical UUID;
2. verified MangaDex creator UUID;
3. matched creator lookup record using verified identifiers;
4. legacy author/artist string retained as unresolved pseudo-entity only if needed for descriptive coverage.

- Keep `identity_resolution_method`, `identity_confidence`, raw name and role.
- Do not treat the same person as identical solely because two names look similar.
- Do not split comma-containing legacy author/artist fields unless the existing parsing behavior and live data profiling confirms the delimiter semantics.

## 2.4 Review text features

Create `slv_review_text_private` with grain `review_id`.

- Parse TipTap nodes with logic consistent with `ReviewExportService.tiptap_to_plain_text`, while documenting nodes that are omitted (images, YouTube embeds, manga references, tables, code blocks, etc.).
- Preserve Unicode and Vietnamese diacritics. Do not lowercase away case-sensitive named entities before storing a normalized variant.
- Separate title, body, headings, quotes, lists and media references where useful.
- Remove URLs and media tokens from lexical counts; do not fetch remote media.
- Compute deterministic features first: word count, character count, paragraph count, sentence count (if language segmentation is reliable), review age, title/body length, and language profile.
- Create a controlled aspect taxonomy (for example art, character, plot, pacing, worldbuilding, theme, dialogue, ending, emotion, adaptation). Each aspect mention must keep evidence span/offset, classifier method, confidence and model/dictionary version.
- Start with transparent dictionary/rule matching or an explicitly opt-in local classifier. LLM-based analysis is an optional later step; never send the private review corpus to an external service by default.
- Sentiment labels require an annotated evaluation set and per-language precision/recall. Until that gate passes, expose mentions only, not positive/negative shares.
- Never label user personality, mental state or psychological traits from review text.

## 2.5 Chapter and page grains

Create:

- `slv_chapter_release`: grain one physical chapter release document (manga × source × source ID × language/release identity).
- `slv_chapter_page`: grain one page occurrence (prefer `page_uid`; fallback to chapter ID + page number with quality flag).
- `slv_chapter_slot`: only if the existing chapter-slot service provides a verified logical-slot key; otherwise do not invent a logical slot.
- `slv_manga_chapter_coverage`: manga-level eligible physical/logical chapter counts and distinct language/source coverage.

The source metadata field `mangas.chapters` is an external publication metadata count, not a verified count of locally downloaded chapters. Keep those metrics separate.

## 2.6 OCR panel and token grains

Create:

- `slv_panel_current`: one panel document with current scan generation/version, source page reference and cleaned text presence flags.
- `slv_panel_token_occurrence`: grain one token occurrence from `vocabulary[]` (surface, lemma, POS, language, panel, chapter, page, manga, pipeline version). Use the stored `frequency` carefully; profile whether it is always 1 or can aggregate multiple occurrences.
- `slv_panel_lemma_membership`: grain one panel × lemma from `lemmas[]`, for distinct lemma coverage only.
- `slv_ocr_page_coverage`: grain one eligible chapter page, with `scanned`, `page_hash_matches`, `pipeline_version_current`, panel count, text/token presence.

Use `panel_scan_pages.page_hash` and chapter page hashes to flag stale scan artifacts. Do not count stale OCR rows as current coverage. Compare lexical metrics only within compatible language, scan mode, OCR/NLP pipeline version and comparable coverage.

## 2.7 Events and collection journey

Create `slv_manga_status_events` from verified `audit_logs` only.

- Normalize action/field and old/new status values using explicit mapping tables.
- Retain `event_id`, `manga_id`, `event_at`, `from_status`, `to_status`, actor and event provenance.
- Deduplicate events by audit record ID.
- Compare audit-derived latest state to current `mangas.read_status` and status timestamps; emit conflict flags.
- If event coverage is incomplete, record `event_history_coverage` by manga/cohort. Do not backfill missing status transitions from current status alone.

Create `slv_reading_progress_snapshot` as current-state only. It may power “last-known reading position” or “read chapter count” summaries, not time-on-task metrics.

## 2.8 Tierlist model

Create `slv_tierlist_item_current` grain `tierlist_id × manga_id` with:

- tier row order index and item order if relevant;
- tier label, color key, note and category;
- creator and source board identifiers;
- current manga rating/read status joined from current manga state.

Only build cross-revision movement facts if Phase 0 verifies archived JSON snapshots or immutable revision storage. An integer `revision` on the current record is not enough.

## 2.9 Tests and quality dimensions

At minimum include dbt tests for:

- unique/non-null canonical IDs at declared grains;
- valid status enums and rating range/step;
- orphan manga IDs in reviews/external reviews/chapters/panels;
- duplicate manga-tag or manga-creator bridge keys;
- tag/creator unresolved proportions;
- impossible date order (`added_at > completed_event_at`, negative ages);
- invalid chapter/page identity and duplicate page occurrences;
- audit latest state mismatch rate;
- stale OCR page hash rate and pipeline version distribution;
- vocabulary rows without required lemma/language metadata;
- external reviews duplicate natural keys and invalid scale;
- tierlist items referencing nonexistent manga IDs.

Classify checks:

- **Error:** invalidates the model/release (identity duplication, invalid schema, negative critical time, malformed Arrow-facing key).
- **Warning:** publish with clear caveat (low OCR coverage, unresolved creator aliases, sparse external sample).
- **Info:** descriptive profile only.

## Verification gate — Phase 2

- [ ] All Silver models source only from Bronze.
- [ ] All models have documented grains and key logic.
- [ ] Personal rating remains attached to manga, not review rows.
- [ ] Tag and creator bridges retain unresolved identities rather than silently dropping them.
- [ ] Soft-delete and duplicate external-review rules are tested.
- [ ] Status-event coverage and conflicts are quantified.
- [ ] `reading_progress` is explicitly snapshot-only.
- [ ] Chapter release / page / logical slot grains are not conflated.
- [ ] OCR token occurrences use `vocabulary`; distinct lemmas use `lemmas`.
- [ ] Raw review/OCR text is not exposed in Gold.
- [ ] `dbt build --select silver+` and quality tests pass on fixtures and real local snapshots.
