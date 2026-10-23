"""Migration: Add indexes for manga_datalake_pool database collections."""

from backend.database.connection import get_pool_db

POOL_MANGAS_INDEXES = [
    ("pool_manga_id", "idx_pool_manga_id", {"unique": True}),
    ("source_manga_id", "idx_source_manga_id", {"unique": True}),
    ("mangadex_id", "idx_pool_mangadex_id", {"sparse": True}),
    (
        [("pool_state", 1), ("is_etl_ready", 1), ("lineage.updated_at", -1)],
        "idx_pool_state_etl_updated",
        {},
    ),
    ("title", "idx_pool_title", {}),
    ("primary_cover.object_key", "idx_pool_primary_cover_key", {}),
    ("cover_arts.object_key", "idx_pool_cover_arts_key", {}),
]

POOL_CHAPTERS_INDEXES = [
    ("pool_chapter_id", "idx_pool_chapter_id", {"unique": True}),
    (
        [("pool_manga_id", 1), ("language", 1), ("chapter_numeric", 1)],
        "idx_pool_manga_lang_chapter",
        {},
    ),
    (
        [("source_manga_id", 1), ("source_chapter_id", 1)],
        "idx_pool_source_manga_chapter",
        {},
    ),
    ("pages.object_key", "idx_pool_pages_object_key", {}),
    ("pages.md5_hash", "idx_pool_pages_md5_hash", {}),
    ("pages.sha256", "idx_pool_pages_sha256", {}),
]

POOL_AUDIT_LOGS_INDEXES = [
    ([("pool_manga_id", 1), ("timestamp", -1)], "idx_pool_audit_manga_time", {}),
    ([("action", 1), ("timestamp", -1)], "idx_pool_audit_action_time", {}),
]


async def upgrade():
    """Create indexes for pool collections in the pool database."""
    pool_db = get_pool_db()
    for keys, name, kwargs in POOL_MANGAS_INDEXES:
        await pool_db.pool_mangas.create_index(keys, name=name, **kwargs)

    for keys, name, kwargs in POOL_CHAPTERS_INDEXES:
        await pool_db.pool_chapters.create_index(keys, name=name, **kwargs)

    for keys, name, kwargs in POOL_AUDIT_LOGS_INDEXES:
        await pool_db.pool_audit_logs.create_index(keys, name=name, **kwargs)


async def downgrade():
    """Drop indexes for pool collections in the pool database."""
    pool_db = get_pool_db()
    for col, defs in (
        (pool_db.pool_mangas, POOL_MANGAS_INDEXES),
        (pool_db.pool_chapters, POOL_CHAPTERS_INDEXES),
        (pool_db.pool_audit_logs, POOL_AUDIT_LOGS_INDEXES),
    ):
        existing = await col.index_information()
        for _, name, _ in defs:
            if name in existing:
                await col.drop_index(name)
