# Phase 0 Discovery Notes — Manga Deep Analytics

**Profiled at:** 2026-11-28T01:37:39Z  
**Primary database (`DATABASE_NAME`):** `manga_library` (33 collections)  
**Pool database (`POOL_DATABASE_NAME`):** `manga_datalake_pool` (7 collections, optional/disabled in MVP Bronze)  
**Access mode:** Strictly read-only (`list_collection_names`, `count_documents`, `find` with `ReadPreference.PRIMARY`). Zero writes or index changes performed.

---

## 1. Collection Inventory & Live Counts

| Logical Entity | Database | Actual Collection | Count | Temporal Semantics | Classification |
|---|---|---|---:|---|---|
| Manga | `manga_library` | `mangas` | 2,864 | Mutable current state + status timestamps | Personal library core |
| Personal reviews | `manga_library` | `reviews` | 612 | Mutable with `is_deleted` soft-delete | Private prose (`content_json`) |
| Tags | `manga_library` | `tags` | 79 | Reference dimension | Reference |
| Creators | `manga_library` | `creators` | 3,035 | Canonical UUID dimension | Reference |
| Chapter releases | `manga_library` | `chapters` | 2,469 | Physical releases (`pages[]` embedded) | Inventory metadata |
| Chapter slots | `manga_library` | `chapter_slots` | 2,469 | Logical slot mapping | Inventory metadata |
| Reading progress | `manga_library` | `reading_progress` | 20 | **Latest-position snapshot only** | Personal snapshot |
| Audit events | `manga_library` | `audit_logs` | 10,659 | Append-only operational events | Event log |
| External reviews | `manga_library` | `external_reviews` | 23 | Crawled snapshot per `(source, work, review)` | External prose |
| OCR panels | `manga_library` | `manga_panels` | 80 | Scan-generation scoped OCR panels | OCR private text |
| OCR page state | `manga_library` | `panel_scan_pages` | 30 | Latest page scan state + `page_hash` | OCR scan state |
| Tier lists | `manga_library` | `creator_tierlists` | 2 | Mutable current board (`revision` counter only) | Personal ranking snapshot |
| Vision V3 analyses | `manga_library` | `vision_page_analyses` / `vision_regions` | 0 / 0 | Empty in live DB | Optional future |
| Data Lake Pool | `manga_datalake_pool` | `pool_mangas`, `pool_chapters`, etc. | 30 / 1,381 | Published reader package lineage | Disabled in MVP |

---

## 2. Critical Schema & Semantic Discoveries

1. **Tierlist collection naming correction**: Code (`backend/database/indexes.py`, `backend/services/tierlist_service.py`) and live DB use **`creator_tierlists`**, not `tierlists`. Only 2 boards exist (11 ranked items, revisions 1 and 3); no immutable revision archive exists, so only current-state ranking is supported.
2. **Personal rating scale & coverage**: `mangas.personal_rating` is populated on **574 / 2,864** manga (20.04%). All observed values fall in `[1.0, 10.0]` in `0.5` increments (`rating_out_of_bounds = 0`, `rating_step_invalid = 0`). `reviews` holds no rating field.
3. **Reviews & TipTap structure**: `612` total (`9` `is_deleted=True`, `603` active across `481` distinct manga; `68` manga have multiple active reviews up to `6`; `1` orphan `manga_id` from a deleted manga). TipTap nodes observed: `doc`, `paragraph`, `text`, `hardBreak`, `horizontalRule`, `bulletList`, `orderedList`, `listItem`, `heading` (38), `blockquote` (2), `image` (2), `mangaReference` (2). Plain-text extraction must preserve Vietnamese diacritics and exclude images/URLs from lexical counts.
4. **Tags**: `79` tags (`77` `mangadex`, `2` `custom`), `19,574` total tag references on `mangas` with **0 dangling tag IDs**. `tags.name` is an object with `en` / `vi` keys.
5. **Creators identity resolution**: `3,035` documents in `creators` (all have `creator_id`; `3,034` have `mangadex_id`; `6` duplicate normalized display names exist — confirming UUID disambiguation is mandatory). On `mangas`, `6,227`–`6,258` embedded `creators[]` references all carry `creator_id`, and `6,232` match `creators.creator_id` directly. Legacy `author`/`artist` strings contain commas on 140/94 manga respectively.
6. **Chapters, slots, and mixed `_id` BSON types**: `chapters._id` contains **both `ObjectId` (2,453) and `string` (16 `local_import` docs)**. Bronze `_source_id` normalizes both cleanly. All `2,469` physical chapters carry `logical_chapter_id` pointing to `chapter_slots` (`2,469` docs). All `64,014` embedded pages (`pages[]` across `chapters`) carry `page_uid` and `md5_hash` (`sha256` is absent). Note `chapters.publish_at` has mixed BSON types (`datetime` and `string`).
7. **OCR (`manga_panels` & `panel_scan_pages`)**:
   - **Coverage**: Only **1 manga / 1 chapter / 30 pages** (`80` panels) out of `64,014` chapter pages (`0.047%` page coverage). All 30 `panel_scan_pages` hashes match current chapter `md5_hash` (`pipeline_version: 2`, `scan_mode: 'panel'`, `language: 'en'`). `vision_page_analyses` and `vision_regions` are empty (0 rows).
   - **`vocabulary[]` vs `lemmas[]` semantics**: Live data proves `vocabulary[]` has `152` entries with `frequency > 1` and `1,218` with `frequency == 1` (`1,370` total items). Thus `vocabulary[]` is a per-panel aggregated lemma/term table whose `frequency` must be summed (`SUM(frequency)`), whereas `lemmas[]` is a set of distinct search lemmas/unaccented aliases. `manga_panels` does not store `pipeline_version`; it must be joined from `panel_scan_pages`.
8. **Audit logs & collection lifecycle**: `10,659` events spanning `2026-05-21` to `2026-11-24`. `1,002 / 2,864` (`34.99%`) manga have `update_status` transitions; `0` conflicts between latest audit `read_status` and current `mangas.read_status`. `unread` manga created as `unread` have `create` events rather than `update_status`. `773` manga have `completed_at` populated (`769` currently `completed`).
9. **External scores vs external reviews**:
   - Aggregate scores live on `mangas.tracker_metadata`: `anilist.mean_score` (36 docs, 0–100 int), `anilist.average_score` (29 docs, 0–100 int), `mal.score` / `mal_extended.score` (10 docs, 0–10 double). `tracker_metadata.myanimelist` is `null` on all 41 tracker-enriched docs.
   - Individual crawled reviews live in `external_reviews`: `23` reviews across `9` manga (`myanimelist` only, `overall_rating` 3–10 int, 0 duplicate natural keys, 0 orphans).
10. **Reading progress**: `20` documents in `reading_progress`, strictly latest-position snapshot (`last_read_chapter_id`, `last_read_page`, `read_chapter_ids`, `updated_at`). No session telemetry exists.
