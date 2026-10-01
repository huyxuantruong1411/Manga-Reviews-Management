---
name: db-migration-safety
description: Enforce safe database schema evolution with bi-directional migrations (Up/Down) and mandatory foreign key indexing.
---

# Database Migration & Index Safety

See full documentation at [.antigravity/skills/db-migration-safety.md](file:///d:/Projects/Manga/Manga-Reviews-Management/.antigravity/skills/db-migration-safety.md).

## Core Rules:
1. **Migrations**: All schema changes must include idempotent `upgrade()` and `downgrade()` procedures.
2. **Index Enforcement**: Mandatory indexes on foreign keys (`manga_id`, `chapter_id`, `user_id`) and sort/filter fields (`created_at`, `read_status`, `timestamp`).
3. **Sparse Indexes**: Apply `sparse=True` for optional/nullable fields to minimize index memory overhead.
