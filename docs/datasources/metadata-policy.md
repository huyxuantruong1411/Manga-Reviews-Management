# Metadata Enrichment Policy & Provenance Architecture

This document specifies the rules governing metadata merging, conflict resolution, user field protection, and optimistic concurrency locks when synchronizing manga metadata from external data sources.

---

## 1. Absolute Protection of User Fields

External data sources (MangaDex, MangaFire, AniList, MAL) frequently report varying community scores, statuses, and tagging conventions. Under no circumstances may an external source overwrite user-owned fields.

The following fields are declared immutable to external sync in [`backend/services/metadata_merge_service.py`](../../backend/services/metadata_merge_service.py):
- `read_status`: The user's reading state (`reading`, `completed`, `plan_to_read`, etc.).
- `personal_rating`: The user's subjective score (e.g., 9.5/10), distinct from community scores.
- `reviews`: User written review text and critique.
- `notes`: Personal notes, bookmarks, and remarks.
- `download_path`: Local filesystem storage directory.

These fields are filtered out before diff generation and rejected during write-back.

---

## 2. Mergeable Fields & Normalization

The merge engine supports the following attributes:
- `title`: Primary display title.
- `alt_titles`: Multi-lingual alternative titles (additive merge without duplicates).
- `description`: Synopsis text.
- `author` & `artist`: Creator credits.
- `year`: Publication year.
- `status`: Normalized publication status (`ongoing`, `completed`, `hiatus`, `cancelled`).
- `content_rating`: Rating category (`safe`, `suggestive`, `erotica`, `pornographic`).
- `publication_demographic`: Demographic categorization (`shounen`, `seinen`, etc.).
- `links`: Additive cross-platform links (AniList, MAL, MangaDex, MangaFire).
- `cover_url`: Remote cover art URL.

---

## 3. User Field Locks & Concurrency Control

### User Field Locks (`metadata_locks`)
Users can lock any mergeable field directly from the UI or comparison drawer:
```json
{
  "metadata_locks": {
    "title": true,
    "description": false
  }
}
```
When a field is locked:
1. `generate_diff` marks the field as `decision_state: "locked"` and `recommended_action: "keep"`.
2. Automatic background syncs (e.g. MangaDex periodic updates) skip the locked field.
3. Only an explicit user override unlocking the field in the comparison drawer allows modifications.

### Optimistic Concurrency Control (`metadata_revision`)
Every mutation increments `metadata_revision` (integer).
Clients submitting field applications must supply `expected_metadata_revision`. If a concurrent update modified the document in the interim, the update returns `409 Conflict`, requiring the client to refresh the preview.

### Field Provenance Tracking (`metadata_provenance`)
Each updated field records its source provenance and timestamp:
```json
{
  "metadata_provenance": {
    "description": {
      "source": "mangafire",
      "source_work_id": "oj8n8",
      "updated_at": "2026-10-12T18:45:00Z"
    }
  }
}
```
Raw source responses are archived into `source_metadata_snapshots` with SHA-256 payload hashes for complete auditability.
