# Manga Reader System v2.0

Standalone Manga Reader Backend receiving Data Contract v2.0 packages (`manga-reader-package v2.0`) from the **Manga Data Lake & Storage Pool**.

## Key Architecture & Storage Guarantees

- **Isolated Ports**: Host ports default to `18000` (API), `15432` (PostgreSQL 16), `16379` (Redis 7), `19000` / `19001` (MinIO) — verified dynamically via `scripts/preflight_check.py`.
- **Drive D Persistent Storage Only**: All Docker container data is bind-mounted directly onto Drive D (`./postgres_data`, `./redis_data`, `./minio_data`), never using C-drive Docker named volumes.
- **Zero-Copy Object Storage**: Supports direct ingestion from the Manga Data Lake & Storage Pool (`/api/datalake-pool`) and staging manifests (`etl-staging`).
