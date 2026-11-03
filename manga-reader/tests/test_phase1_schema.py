"""Phase 1 Verification Tests: PostgreSQL 16 Schema, Enums, Extensions, and Indexes."""

from __future__ import annotations

import asyncpg
import pytest
from app.core.config import settings

EXPECTED_TABLES = {
    "users",
    "user_activity_logs",
    "admin_audit_logs",
    "mangas",
    "manga_cover_arts",
    "creators",
    "manga_creators",
    "tags",
    "manga_tags",
    "chapters",
    "chapter_pages",
    "user_reading_statuses",
    "user_manga_reading_history",
    "user_chapter_reads",
    "manga_ratings",
    "manga_rating_history",
    "manga_daily_metrics",
    "comments",
    "comment_edit_histories",
    "comment_reactions",
    "reports",
    "reading_lists",
    "reading_list_items",
    "etl_sync_jobs",
    "manga_recommendations_cache",
}

EXPECTED_ENUMS = {
    "publication_status",
    "content_rating",
    "publication_demographic",
    "creator_role",
    "tag_group",
    "manga_visibility_status",
    "user_role",
    "account_status",
    "reading_status_type",
    "report_target_type",
    "report_status",
    "comment_reaction_type",
}

EXPECTED_EXTENSIONS = {"uuid-ossp", "pg_trgm", "unaccent"}


async def _get_pg_conn() -> asyncpg.Connection:
    return await asyncpg.connect(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_HOST_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
    )


@pytest.mark.asyncio
async def test_postgresql_extensions_installed() -> None:
    conn = await _get_pg_conn()
    try:
        rows = await conn.fetch("SELECT extname FROM pg_extension;")
        installed = {r["extname"] for r in rows}
        assert EXPECTED_EXTENSIONS.issubset(installed)
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_all_schema_tables_and_enums_created() -> None:
    conn = await _get_pg_conn()
    try:
        table_rows = await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public';")
        actual_tables = {r["tablename"] for r in table_rows}
        missing_tables = EXPECTED_TABLES - actual_tables
        assert not missing_tables, f"Missing tables: {sorted(missing_tables)}"

        enum_rows = await conn.fetch("SELECT typname FROM pg_type WHERE typtype = 'e';")
        actual_enums = {r["typname"] for r in enum_rows}
        missing_enums = EXPECTED_ENUMS - actual_enums
        assert not missing_enums, f"Missing enums: {sorted(missing_enums)}"
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_critical_indexes_and_gin_trgm_exist() -> None:
    conn = await _get_pg_conn()
    try:
        idx_rows = await conn.fetch("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public';")
        indexes = {r["indexname"]: r["indexdef"] for r in idx_rows}

        required_indexes = {
            "idx_users_display_name_trgm",
            "idx_mangas_title_trgm",
            "idx_mangas_alt_titles_gin",
            "idx_mangas_public_latest",
            "idx_mangas_public_views",
            "idx_mangas_public_rating",
            "idx_chapters_manga_sort",
            "idx_chapter_pages_reader",
            "idx_comments_manga_time",
            "idx_reports_filter",
            "idx_reading_lists_owner",
        }
        missing_idx = required_indexes - set(indexes.keys())
        assert not missing_idx, f"Missing indexes: {sorted(missing_idx)}"
        assert "gin" in indexes["idx_mangas_title_trgm"].lower()
    finally:
        await conn.close()
