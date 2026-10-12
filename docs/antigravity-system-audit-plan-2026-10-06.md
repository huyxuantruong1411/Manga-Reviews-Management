# System audit — execution ledger

Audit: 06–07 October 2026. Execution started: 09 October 2026 (Asia/Saigon).

The original detailed plan was absent from the checkout when execution started.
This ledger restores its 35 work-item identifiers from the audit handoff in the
conversation. It is not a claim that the original file was recovered byte for byte.
Starting revision: `e17c917`; working tree was clean. The earlier MangaDetailPage
changes are now committed, alongside chapter export functionality, and are preserved.

## Execution rules

Read AGENTS.md, ai-context, code-map and applicable skills. Reconfirm each issue on
the current revision. Write failing regression tests before business fixes. Keep
data mutation tests isolated. No destructive migration on the live library before
a verified restore path. Preserve originals and shared object references; record
partial cleanup rather than claiming success. Do not weaken tests, CI or lint rules.

Sequence: safety/readiness/backup → regression coverage → core data correctness →
translation orchestration → reading/reviews/mobile → operations/setup → optimization.
Each item is verified only when its complete acceptance criteria pass; partial
mitigations must remain marked Partial. Optional additions require a stable baseline.

## Item register

| ID | Priority | Work and acceptance | Status |
|---|---|---|---|
| F01 | P0 | Private MinIO, loopback runtime, TLS honored, old review media still readable | Verified locally: private buckets, loopback container, legacy media resolver and TLS regression |
| F02 | P0 | Synthetic runner explicitly labelled and excluded from publishing; real engine readiness and quality verified | Partial: fail-closed boundary implemented; real engine remains unavailable |
| F03 | P1 | Manga deletion cascades metadata/cache/jobs without orphaning or losing shared media | Partial: manga/chapter cascade, shared source objects, retry anchors and dependent translation cancellation verified; durable manifest and concurrent writer fencing remain |
| F04 | P1 | Page delete/dedup handles storage failure, page identity, OCR/progress/translation revisions | Partial: failed storage deletes retained and reported; identity/revision/cascade race work remains |
| F05 | P1 | Reference-aware translation cleanup; no false deleted state or batch overreach | Partial: reference checks and per-object success accounting; concurrent reference creation remains |
| F06 | P1 | Translation source validation, snapshot, fingerprints, idempotency, no empty jobs | Partial: foreign manga/page and stale revision rejected; empty selections rejected; snapshot/idempotency open |
| F07 | P1 | One queue owner, leases/fencing/cancel/recovery, accurate job aggregate | Partial: single ARQ owner, attempt guard, retry CAS and partial state; lease recovery/fencing open |
| F08 | P1 | Atomic revision edits and validated immutable publish/bindings | Partial: edit/render CAS, content-addressed outputs, source-validated publish; full revision history open |
| F09 | P1 | Translation export ObjectId/language/bytes/selected revision correct | Verified scoped fixes: ObjectId, target language, actual image format and pinned binding output |
| F10 | P1 | Rerender cannot silently generate blank artwork; font/overflow checks | Partial: missing/invalid clean artwork fails; typography/overflow still open |
| F11 | P1 | Analytics keeps empty filter scope and consistent metric semantics | Partial: empty scope cannot count unrelated completions; metric semantics open |
| F12 | P1 | Strict request DTOs, nonblank titles, finite ratings, required review body | Partial: nonblank manga titles, finite half-step ratings, required review body; DTO sweep open |
| F13 | P1 | Review create/save/cache and concurrent updates preserve content | Partial: title-based data loss and cleanup/finalize cache fixed; concurrent review editing/idempotency open |
| F14 | P1 | Review draft/save failure/navigation recovery | Open |
| F15 | P1 | Latest search wins, error differs from empty, URL/back/forward filters | Partial: latest search, retry/error and history restoration verified; pagination normalization remains |
| F16 | P1 | Reader retry, even-page completion, progress writes and responsive modes | Partial: retry, responsive single view, even-page completion, flush and tab write ordering; cross-tab/offline recovery open |
| F17 | P1 | Translation UI prevents stale chapter/language/job responses | Partial: chapter/language generation guards and sequential polling; full job lifecycle E2E remains |
| F18 | P1 | Sync schedule truly executes or is explicitly unavailable; success timestamps accurate | Verified mitigation: unsupported schedules rejected/labeled; success timestamp follows successful batch |
| F19 | P1 | Runtime CI path coverage, meaningful browser assertions and a11y failure gate | Partial: runtime path/tests included, fixture-based browser assertions, scoped WCAG gate; broad a11y open |
| F20 | P1 | Credential redaction, upload/resource bounds, local/LAN and file-root policies | Partial: key headers, nested redaction, bounded image/file reads and raster validation; video/resource/root/auth policies open |
| F21 | P1 | Safe indexes/backfills with Up/Down/dry-run and conflict report | Partial: reversible deletion-reference indexes tested in isolation; existing timestamp backfill safety remains open |
| F22 | P2 | Truthful dependency readiness, lifecycle and operational diagnostics | Open |
| F23 | P2 | Durable download ownership/restart and complete active-job visibility | Open |
| F24 | P2 | OCR/scanner durable checkpoints and measured language/search quality | Open |
| F25 | P1 | 375px layouts fit after data loads, including reader; no global overflow hiding | Partial: loaded library/reader/detector at 375px verified; analytics/sync/audit layouts remain |
| F26 | P1 | Accessible names, keyboard/focus, contrast and a11y assertions | Partial: keyboard retry and WCAG assertions for library error panel; whole-product coverage open |
| F27 | P2 | Shared resilient image states, retry, identity reset and correct loading priority | Partial: cover/reader skeleton, fallback, retry and identity reset; image priority audit remains |
| F28 | P2 | Measure production performance and defer editor/charts; bounded data loading | Open |
| F29 | P2 | New business logic in services; consistent public DTO/error contracts | In progress, scoped to touched domains |
| F30 | P2 | Portable locked setup without global installs/destructive seed/public policies | Partial: private bootstrap, no global pip, digest-pinned portable compose; other setup/seed scripts remain |
| F31 | P1 | Backup/restore drill and resumable repair manifests before live migrations | Partial: metadata restore and physical MinIO restore sampled successfully; coordinated snapshot still required |
| F32 | P2 | Recoverable upstream, cover/creator/tag/AI/image-tool workflows | Open |
| F33 | P2 | Consistent product language/statuses/notifications and complete journeys | Open |
| F34 | P2 | Documentation reflects implemented, synthetic and unavailable behavior | Partial: README/context/architecture/runbook/route table corrected; remaining stale feature claims need sweep |
| F35 | P3 | Optional saved searches, trash, selected offline chapters, OCR notebook, glossary, portability | Deferred until related P0/P1 pass |

## Baseline findings retained

The original audit found 109 backend passes/1 opt-in skip, 10 runtime protocol
passes and 4 Playwright smoke passes despite reproduced defects. Biome exited zero
with 911 warnings/23 infos. Forty initial UI route/theme/viewport scans found
375px overflow in library (484px), analytics (378px), sync (396px), audit (431px).
The separate reader fixture overflowed to 636px in single mode; Retry sent no new
request, and two-page spread completion persisted `mark_as_read=false`.

Other reproduced defects: empty analytics scope counted unrelated completions;
translation export missed ObjectId chapters; invalid page selection created zero-page
jobs; repeated idempotency keys created multiple jobs; runtime copied input and
returned sample text as a completed translation; invalid publish succeeded; missing
review body caused 500; manga deletion left related records; failed object deletion
was reported as success. All require reconfirmation against the current revision.

## Verification and rollout

Run targeted regression tests before broad gates. Required local gates: Python
quality, backend pytest, translator-runtime pytest, Biome, TypeScript, build,
Playwright, docs and generated-route drift check. Use a fresh locked environment
for reproducibility; never sync a serving venv blindly. Integration tests create
UUID databases/buckets and clean only resources owned by that run.

Migration protocol: inventory → dry-run manifest → backup plus restore drill →
idempotent Up with checkpoint → counts/hash/references verified → explicit Down or
documented backup restoration. Never `docker compose down -v`. Snapshot object
storage only after writers are quiesced or with a documented consistency strategy.

Before handoff check git status, diff and staged diff. No secrets, library images,
database dumps or user screenshots enter Git. Remote verification is unverified
until an actual required `ci-gate` succeeds for the exact source revision.

## Implementation notes

- Review media now uses a stable same-origin resolver and adapts legacy local
  storage links on read; no data rewrite is required for this compatibility path.
- Gemini credentials use `x-goog-api-key`, per the [official API reference](https://ai.google.dev/api).
- Translation hardware/credential presence is not proof of a working engine.
  Until a real adapter is integrated, create/retry fails with a clear 503 before
  persistence. The isolated protocol harness requires explicit `--synthetic`.

## Verified execution checkpoint — 2026-10-09

This is a substantial implementation checkpoint, **not completion of all 35 items**.
Concurrent editor/export commits appeared during execution and were preserved; the
last observed base was `48d3102`. Changes from this audit remain in the working tree.
No commit or push was performed by this agent; remote CI is **unverified**.

### Local verification

- A fresh external virtual environment was installed with `uv sync --project backend
  --locked --group test --group lint --no-install-project`. The serving environment
  was not replaced. Backend plus translator-runtime: **172 passed, 1 opt-in skip,
  9 subtests passed, 28 warnings**.
- The skipped storage suite was also run explicitly with `RUN_STORAGE_INTEGRATION=1`:
  **1 passed**, using only its own UUID MongoDB database and S3 bucket.
- Playwright: **28 passed** across desktop 1440px and mobile 375px. Assertions cover
  delayed search/language responses, loaded reader width, image and cover retries,
  even-page completion, history restoration, reader-exit progress flush and serialized
  progress writes. The library error panel has an actual axe WCAG A/AA failure assertion.
- TypeScript and production build passed. Bundle warnings remain: MangaDetailPage
  about 974 kB and AnalyticsPage about 565 kB before gzip; no warning threshold was raised.
- Biome exited zero with **916 warnings, 23 infos**. These are not a clean a11y audit.
- Tracked Python quality gate passed; explicit Ruff lint/format also covers all new
  Python files (the tracked-file gate alone would omit untracked files).
- Documentation links/budgets and generated route drift passed (**162 routes**).

### Runtime changes and backup evidence

- MinIO was stopped for the final incremental physical copy, then recreated with
  the same data mount and existing image digest. Ports 9000/9001 now bind only to
  `127.0.0.1`; health returns 200. Redis remains loopback-bound.
- Both live buckets were checked private. An existing review image returned 403
  anonymously and 200 through the API resolver; response bytes matched the object.
- `mongo-live-snapshot`: BSON plus indexes/hashes for **27 collections**; restore into
  a generated database verified every document, then removed only that temporary DB.
  This metadata snapshot is explicitly **best_effort_live**.
- `minio-data`: offline final physical snapshot, copied successfully with zero failed
  files. A second copy was started in an isolated MinIO container on port 19000:
  **90,191 library objects + 1 review image**, **60,466,408,239 bytes** listed;
  **38 sampled SHA-256 reads** matched the live source. This verifies inventory and
  sampled content, not a checksum of every object. The original snapshot was not mounted
  by the drill. Report: `minio-restore-verification.json` in the external backup root.
- The isolated restore container was removed. Automatic policy review rejected deletion
  of the temporary `minio-restore-drill` directory (reason: `blocked by policy`), so that
  additional approximately 60 GB copy remains. Do not confuse it with the original backup.
- Metadata and MinIO snapshots were taken at different times. They do **not** constitute
  a coordinated point-in-time backup; no live schema migration/repair was run on that basis.

### Required continuation and acceptance details

1. **F03/F04/F05 data lifecycle:** design resumable deletion with a dry-run manifest and
   shared-object ownership; fence page mutations, cancel dependent jobs, reconcile V3 OCR,
   progress and translation references. Test storage failures, restart between phases,
   shared keys and concurrent import. Do not run broad live cleanup from these partial fixes.
2. **F02/F06/F07 engine and jobs:** integrate a real adapter with pinned models/license
   inventory; verify source fingerprints, immutable profile snapshots, idempotency,
   durable outbox/recovery, lease renewal and fencing on every commit. Test cancel/retry
   races and worker death. The current synthetic runner must remain blocked from real jobs.
3. **F08/F10/F13/F14 editing:** add versioned immutable region/profile history and review
   concurrency contracts; test conflict UX, unsaved draft recovery and missing font glyphs.
   Rerender must fit all text without silently truncating; font coverage must inspect cmap.
4. **F15/F16/F17/F25–F28 UX:** normalize URL/page-size values and out-of-range pages;
   handle cross-tab/failed/offline progress; exercise jobs across chapter changes; measure
   loaded analytics/sync/audit layouts, keyboard/focus and light/dark contrast. Optimize
   editor/chart loading from measured bundle/network traces, preserving concurrent editor work.
5. **F18/F21–F24/F30/F31 operations:** retain manual-only sync until a durable scheduler
   exists; fix index/backfill replay safety, download/scanner ownership and readiness;
   validate setup scripts in clean environments; create a coordinated backup/restore drill
   before deploying migrations. Preserve actual user data and credentials outside Git.
6. **F11/F12/F20/F29/F32–F34 contracts:** agree and test analytics metric definitions,
   complete strict DTO/resource bounds, profile-secret update semantics, local file-root
   restrictions and LAN authorization; handle upstream retry/failure without false success.
   Keep new logic in services and reconcile remaining documentation with actual code.
7. **F35 optional features:** only after relevant P0/P1 acceptance criteria are closed.

The passing tests prove the named cases above. They do not prove full system correctness,
real translation quality, full WCAG compliance, or production readiness.

### Deletion follow-up: observed behavior before changes

Code inspection found that manga deletion leaves chapters/progress behind, ignores cover
storage failure, and chapter deletion removes its retry anchor before OCR cleanup. The
scanner cleanup helper swallows database errors. The code map's "cascading delete" wording
therefore overstates the behavior. V3 collections/indexes are declared but no current
service/router writer was found for them; cleanup must support their declared references
without claiming the running scanner already persists V3 analyses. Regression tests use
mocked storage; any integration verification must use a new isolated database and bucket.

### Deletion follow-up: implemented behavior and acceptance

- `content_deletion_service.py` centralizes source ownership checks and dependency cleanup.
  Chapter deletion removes legacy OCR, V3 regions/analyses and local publication bindings,
  updates reading progress, then removes the chapter document. Cleanup errors propagate.
  V3 regions are deleted before their analysis record, preserving IDs for retry on failure.
- Manga deletion cascades its chapters before covers, removes progress and remaining OCR,
  soft-deletes reviews, and invalidates detail/review caches. Existing audit and translation
  result/asset history are retained. Cover keys are deduplicated and every storage failure
  stops deletion before the manga document disappears.
- A source object referenced by another chapter, manga cover or cover-art record is retained.
  This protects already-existing owners; it is **not** an atomic ownership fence against
  a reference created concurrently after the check. Individual page deletion/dedup still
  needs equivalent ownership/cascade handling and its own concurrency contract.
- Waiting dependent translation jobs are cancelled. Running page work requests cancellation
  and blocks deletion with HTTP 409; storage-deletion rejection returns HTTP 503 with retry
  guidance. Completed job history is not rewritten by the cancellation query.
- Seven new indexes cover existing ownership/dependency fields. Their definitions live in
  `backend/database/indexes.py`; index-only Up/Down lives in
  `backend/database/migrations/m_20261009_deletion_reference_indexes.py`. Upgrade creates
  only these indexes, and downgrade removes only their explicitly named indexes. Neither
  direction calls the legacy timestamp backfill or rewrites documents. With a connected
  database, invoke this module's async `upgrade()` / `downgrade()`; normal startup also
  creates the indexes. Do not use the full legacy initializer as a rollback command.
- Regression coverage: **12 deletion tests**, including 4 route/error subtests. The first
  seven failed before implementation. Failure injection covers storage, OCR/region cleanup,
  reading progress, running translation work, and successful retry after a region failure.
- The opt-in integration test passed against a new UUID MongoDB and MinIO bucket: actual
  OCR/reader, V3 and publication cleanup, queued-job cancellation, manga cascade, shared
  object retained after first owner deletion and removed after last owner deletion. Index
  Up/Down each ran twice before a final Up. Temporary DB and bucket were removed in `finally`.
  No existing library item was deleted for verification.

**Still required for F03/F04/F05 closure:** persisted dry-run/deletion manifests, recovery
after process death, fencing all import/download/OCR/page-mutating writers, a declared
ownership policy for retained review documents, and reconciliation of old orphan records.
Partial deletion can already remove some objects before a later failure: retaining the
parent enables retry but does not restore removed bytes or provide rollback. Do not treat
these scoped fixes as permission to run a broad orphan cleanup on the live library.

### Status-history backfill: observed behavior before changes

The index initializer also executes a history backfill. A single missing timestamp makes
that backfill overwrite all seven status timestamps, including valid existing values.
It treats the manga's current status as its status at creation and can invent a completion
time from `added_at` or the current clock. This contradicts its "missing timestamps" name
and can distort analytics on startup. The next remediation separates explicit repair from
index startup, preserves every existing field (including null), and reports CAS conflicts.

