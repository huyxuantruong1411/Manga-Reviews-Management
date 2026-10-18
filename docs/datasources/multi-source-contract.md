# Multi-Source Datasource Contract & Identity Architecture

This document defines the interface contracts, identity model, and storage invariants governing multi-source ingestion (MangaDex, MangaFire, and future providers) in the Manga Reviews Management platform.

---

## 1. Provider Contract (`MangaSourceProvider`)

All external data sources implement the abstract interface defined in [`backend/services/datasources/contracts.py`](../../backend/services/datasources/contracts.py):

```python
class MangaSourceProvider(ABC):
    name: str

    @abstractmethod
    async def resolve_work(self, url_or_id: str) -> SourceWork:
        """Resolves canonical metadata for a manga title from URL or work ID."""
        ...

    @abstractmethod
    async def list_releases(self, work_id: str, query: ReleaseQuery) -> ReleasePage:
        """Lists releases for a given work, preserving all distinct release IDs."""
        ...

    @abstractmethod
    async def get_page_manifest(self, release_id: str) -> SourcePageManifest:
        """Fetches page image URLs, dimensions, and headers for download."""
        ...
```

### URL Normalization & SSRF Defense
All incoming URLs are sanitized via `validate_and_parse_source_url`:
- **Allowed Schemes**: Strictly `http` and `https`. Schemes like `file://`, `ftp://`, or `data:` raise `SSRFSecurityError`.
- **Domain Whitelist**: Hostnames must match registered provider origins exactly (`mangadex.org`, `mangafire.to`, `comix.to`). Subdomain spoofing (e.g. `comix.to.attacker.com` or `mangafire.to.attacker.com`) is rejected.
- **Private Network Blocking**: IP addresses pointing to loopback (`127.0.0.0/8`), link-local (`169.254.0.0/16`), or private RFC-1918 networks are blocked.
- **No Embedded Credentials**: Userinfo in URLs (`user:pass@host`) is rejected.

---

## 2. Source-Scoped Identity Model

To prevent collisions between different sources that share identical external IDs or chapter numbering:

1. **`manga_sources` Collection**:
   - Represents the verified binding between a local `manga_id` and a remote `(source, source_work_id)`.
   - Unique Index: `(source, source_work_id)`.
   - Prevents duplicate cross-links and cross-source metadata corruption.

2. **`chapters` Collection**:
   - Internal Primary Key: `_id` (ObjectId).
   - Source Identity: `source` (e.g., `mangadex`, `mangafire`, `comix`), `source_id` (provider-specific release ID).
   - Unique Index: `(manga_id, source, source_id, language)` ensuring multiple releases of chapter 14 can coexist cleanly.

3. **`chapter_slots` Collection**:
   - Logical representation of a chapter in reading order (e.g., Chapter 14 in English).
   - Unique Index: `(manga_id, numbering_scope_id, chapter_key, language, unit_kind)`.
   - Contains pointer `preferred_chapter_id` referencing the currently active stored chapter.

---

## 3. Storage & Staging Model

- **Immutable Media Revision Keys**:
  Pages are stored under revision-scoped object keys:
  `manga/{manga_id}/chapters/{chapter_id}/r{revision}/{page_number}.{ext}`
- **Dual Storage Compatibility**:
  Legacy chapters retaining flat `chapters/{manga_id}/{chapter_id}/{page}.jpg` keys remain 100% readable and exportable.
- **Staging & Commit**:
  Downloaded pages are staged and validated (SHA-256 integrity, MIME headers, non-empty bytes) before an atomic Compare-And-Swap (CAS) commit transitions the chapter from `pending` to `ready`.
