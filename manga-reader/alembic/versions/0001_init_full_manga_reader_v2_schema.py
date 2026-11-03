"""init_full_manga_reader_v2_schema

Revision ID: 0001_init_v2_schema
Revises:
Create Date: 2026-11-04 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0001_init_v2_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UPGRADE_SQL_STATEMENTS = [
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
    'CREATE EXTENSION IF NOT EXISTS "pg_trgm";',
    'CREATE EXTENSION IF NOT EXISTS "unaccent";',
    # Enums
    """DO $$ BEGIN
        CREATE TYPE publication_status AS ENUM ('ongoing', 'completed', 'hiatus', 'cancelled', 'unknown');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    """DO $$ BEGIN
        CREATE TYPE content_rating AS ENUM ('safe', 'suggestive', 'erotica', 'pornographic', 'unknown');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    """DO $$ BEGIN
        CREATE TYPE publication_demographic AS ENUM ('shounen', 'shoujo', 'seinen', 'josei', 'kodomo', 'unknown');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    """DO $$ BEGIN
        CREATE TYPE creator_role AS ENUM ('author', 'artist');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    """DO $$ BEGIN
        CREATE TYPE tag_group AS ENUM ('genre', 'theme', 'format', 'content', 'other');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    """DO $$ BEGIN
        CREATE TYPE manga_visibility_status AS ENUM ('public', 'hidden');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    """DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('reader', 'moderator', 'admin');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    """DO $$ BEGIN
        CREATE TYPE account_status AS ENUM ('pending_verification', 'active', 'locked');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    """DO $$ BEGIN
        CREATE TYPE reading_status_type AS ENUM ('reading', 'plan_to_read', 'completed', 'on_hold', 'dropped');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    """DO $$ BEGIN
        CREATE TYPE report_target_type AS ENUM ('account', 'manga', 'comment');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    """DO $$ BEGIN
        CREATE TYPE report_status AS ENUM ('pending', 'resolved', 'ignored', 'closed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    """DO $$ BEGIN
        CREATE TYPE comment_reaction_type AS ENUM ('like', 'dislike');
    EXCEPTION WHEN duplicate_object THEN null; END $$;""",
    # Subsystem A: Users & Logs
    """CREATE TABLE IF NOT EXISTS users (
        user_id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email                 VARCHAR(255) NOT NULL UNIQUE,
        username              VARCHAR(64) NOT NULL UNIQUE,
        password_hash         VARCHAR(255) NOT NULL,
        display_name          VARCHAR(100) NOT NULL,
        bio                   VARCHAR(500) NOT NULL DEFAULT '',
        birth_date            DATE NULL,
        show_birth_date       BOOLEAN NOT NULL DEFAULT FALSE,
        avatar_bucket         VARCHAR(63) NULL,
        avatar_object_key     TEXT NULL,
        role                  user_role NOT NULL DEFAULT 'reader',
        status                account_status NOT NULL DEFAULT 'pending_verification',
        email_verified_at     TIMESTAMPTZ NULL,
        lock_reason           TEXT NULL,
        locked_at             TIMESTAMPTZ NULL,
        locked_until          TIMESTAMPTZ NULL,
        locked_by             UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
        last_unlocked_at      TIMESTAMPTZ NULL,
        token_version         INTEGER NOT NULL DEFAULT 1,
        reader_settings       JSONB NOT NULL DEFAULT '{
            "reading_mode": "vertical",
            "direction": "ltr",
            "fit_mode": "width",
            "preload_pages": 3
        }'::jsonb,
        last_login_at         TIMESTAMPTZ NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);",
    "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);",
    "CREATE INDEX IF NOT EXISTS idx_users_display_name_trgm ON users USING GIN (display_name gin_trgm_ops);",
    """CREATE TABLE IF NOT EXISTS user_activity_logs (
        log_id         BIGSERIAL PRIMARY KEY,
        user_id        UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        action_type    VARCHAR(64) NOT NULL,
        target_type    VARCHAR(50) NULL,
        target_id      VARCHAR(128) NULL,
        ip_address     VARCHAR(64) NULL,
        user_agent     TEXT NULL,
        metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_activity_logs_user_time ON user_activity_logs(user_id, created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON user_activity_logs(user_id, action_type, created_at DESC);",
    """CREATE TABLE IF NOT EXISTS admin_audit_logs (
        audit_id       BIGSERIAL PRIMARY KEY,
        admin_id       UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
        action_type    VARCHAR(64) NOT NULL,
        target_type    VARCHAR(50) NOT NULL,
        target_id      VARCHAR(128) NOT NULL,
        reason         TEXT NOT NULL,
        details        JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_admin_audit_time ON admin_audit_logs(created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_logs(target_type, target_id);",
    # Subsystem B: Mangas, Covers, Creators, Tags, Chapters, Pages
    """CREATE TABLE IF NOT EXISTS mangas (
        pool_manga_id               VARCHAR(64) PRIMARY KEY,
        slug                        VARCHAR(255) NOT NULL UNIQUE,
        source_manga_id             VARCHAR(64) NOT NULL,
        mangadex_id                 UUID NULL,
        title                       VARCHAR(500) NOT NULL,
        alt_titles                  JSONB NOT NULL DEFAULT '[]'::jsonb,
        description                 TEXT NOT NULL DEFAULT '',
        status                      publication_status NOT NULL DEFAULT 'unknown',
        content_rating              content_rating NOT NULL DEFAULT 'unknown',
        publication_demographic     publication_demographic NOT NULL DEFAULT 'unknown',
        original_language           VARCHAR(10) NULL,
        year                        SMALLINT NULL,
        published_start_date        VARCHAR(50) NULL,
        published_end_date          VARCHAR(50) NULL,
        official_volumes            INTEGER NULL,
        official_chapters           INTEGER NULL,
        cover_bucket                VARCHAR(63) NULL,
        cover_object_key            TEXT NULL,
        cover_file_size             BIGINT NOT NULL DEFAULT 0,
        cover_width                 INTEGER NULL,
        cover_height                INTEGER NULL,
        cover_content_type          VARCHAR(100) NULL,
        cover_md5_hash              VARCHAR(64) NULL,
        cover_sha256                VARCHAR(64) NULL,
        external_links              JSONB NOT NULL DEFAULT '[]'::jsonb,
        chapter_count               INTEGER NOT NULL DEFAULT 0,
        page_count                  INTEGER NOT NULL DEFAULT 0,
        total_size_bytes            BIGINT NOT NULL DEFAULT 0,
        available_languages         JSONB NOT NULL DEFAULT '[]'::jsonb,
        pool_revision               INTEGER NOT NULL DEFAULT 1,
        source_metadata_revision    INTEGER NOT NULL DEFAULT 1,
        manifest_sha256             CHAR(64) NOT NULL DEFAULT '',
        pool_published_at           TIMESTAMPTZ NULL,
        pool_updated_at             TIMESTAMPTZ NULL,
        visibility_status           manga_visibility_status NOT NULL DEFAULT 'public',
        hidden_reason               TEXT NULL,
        hidden_by                   UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
        hidden_at                   TIMESTAMPTZ NULL,
        cdc_enabled                 BOOLEAN NOT NULL DEFAULT FALSE,
        is_syncing                  BOOLEAN NOT NULL DEFAULT FALSE,
        ignore_future_reports       BOOLEAN NOT NULL DEFAULT FALSE,
        view_count                  BIGINT NOT NULL DEFAULT 0,
        average_rating              NUMERIC(4, 2) NOT NULL DEFAULT 0.00,
        rating_count                INTEGER NOT NULL DEFAULT 0,
        comment_count               INTEGER NOT NULL DEFAULT 0,
        list_add_count              INTEGER NOT NULL DEFAULT 0,
        latest_chapter_published_at TIMESTAMPTZ NULL,
        created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_mangas_public_latest ON mangas(visibility_status, latest_chapter_published_at DESC NULLS LAST);",
    "CREATE INDEX IF NOT EXISTS idx_mangas_public_views ON mangas(visibility_status, view_count DESC);",
    "CREATE INDEX IF NOT EXISTS idx_mangas_public_rating ON mangas(visibility_status, average_rating DESC, rating_count DESC);",
    "CREATE INDEX IF NOT EXISTS idx_mangas_filters ON mangas(visibility_status, status, publication_demographic, content_rating, original_language, year);",
    "CREATE INDEX IF NOT EXISTS idx_mangas_title_trgm ON mangas USING GIN (title gin_trgm_ops);",
    "CREATE INDEX IF NOT EXISTS idx_mangas_alt_titles_gin ON mangas USING GIN (alt_titles);",
    """CREATE TABLE IF NOT EXISTS manga_cover_arts (
        id             BIGSERIAL PRIMARY KEY,
        manga_id       VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        cover_id       VARCHAR(64) NULL,
        volume         VARCHAR(20) NULL,
        locale         VARCHAR(10) NULL,
        description    TEXT NULL,
        bucket         VARCHAR(63) NOT NULL,
        object_key     TEXT NOT NULL,
        content_type   VARCHAR(100) NULL,
        width          INTEGER NULL,
        height         INTEGER NULL,
        file_size      BIGINT NOT NULL DEFAULT 0,
        md5_hash       VARCHAR(64) NULL,
        sha256         VARCHAR(64) NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_cover_arts_manga ON manga_cover_arts(manga_id);",
    """CREATE TABLE IF NOT EXISTS creators (
        creator_id   VARCHAR(64) PRIMARY KEY,
        slug         VARCHAR(255) NOT NULL,
        name         VARCHAR(255) NOT NULL,
        mangadex_id  UUID NULL,
        biography    JSONB NOT NULL DEFAULT '{}'::jsonb,
        links        JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_creators_slug ON creators(slug);",
    "CREATE INDEX IF NOT EXISTS idx_creators_name_trgm ON creators USING GIN (name gin_trgm_ops);",
    """CREATE TABLE IF NOT EXISTS manga_creators (
        manga_id     VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        creator_id   VARCHAR(64) NOT NULL REFERENCES creators(creator_id) ON DELETE CASCADE,
        role         creator_role NOT NULL,
        PRIMARY KEY (manga_id, creator_id, role)
    );""",
    "CREATE INDEX IF NOT EXISTS idx_mc_creator ON manga_creators(creator_id, role);",
    """CREATE TABLE IF NOT EXISTS tags (
        id             SERIAL PRIMARY KEY,
        slug           VARCHAR(100) NOT NULL UNIQUE,
        source_tag_id  VARCHAR(64) NULL,
        mangadex_id    UUID NULL,
        tag_group      tag_group NOT NULL DEFAULT 'genre',
        name           JSONB NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    """CREATE TABLE IF NOT EXISTS manga_tags (
        manga_id  VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (manga_id, tag_id)
    );""",
    "CREATE INDEX IF NOT EXISTS idx_mt_tag_manga ON manga_tags(tag_id, manga_id);",
    """CREATE TABLE IF NOT EXISTS chapters (
        pool_chapter_id    VARCHAR(64) PRIMARY KEY,
        manga_id           VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        source_chapter_id  VARCHAR(64) NOT NULL,
        chapter_number     VARCHAR(50) NOT NULL,
        chapter_numeric    DOUBLE PRECISION NOT NULL DEFAULT 0.0,
        volume             VARCHAR(20) NULL,
        title              VARCHAR(500) NOT NULL DEFAULT '',
        language           VARCHAR(10) NOT NULL DEFAULT 'en',
        scanlation_group   VARCHAR(255) NULL,
        publish_at         TIMESTAMPTZ NULL,
        source             VARCHAR(50) NOT NULL DEFAULT 'mangadex',
        source_id          VARCHAR(255) NULL,
        page_count         INTEGER NOT NULL DEFAULT 0,
        total_size_bytes   BIGINT NOT NULL DEFAULT 0,
        pages_revision     INTEGER NOT NULL DEFAULT 1,
        manifest_sha256    CHAR(64) NOT NULL DEFAULT '',
        source_updated_at  TIMESTAMPTZ NULL,
        view_count         BIGINT NOT NULL DEFAULT 0,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_chapters_manga_sort ON chapters(manga_id, chapter_numeric ASC, language);",
    "CREATE INDEX IF NOT EXISTS idx_chapters_manga_desc ON chapters(manga_id, chapter_numeric DESC, language);",
    """CREATE TABLE IF NOT EXISTS chapter_pages (
        page_uid      VARCHAR(64) PRIMARY KEY,
        chapter_id    VARCHAR(64) NOT NULL REFERENCES chapters(pool_chapter_id) ON DELETE CASCADE,
        page_number   INTEGER NOT NULL,
        filename      VARCHAR(255) NOT NULL,
        bucket        VARCHAR(63) NOT NULL,
        object_key    TEXT NOT NULL,
        file_size     BIGINT NOT NULL DEFAULT 0,
        width         INTEGER NULL,
        height        INTEGER NULL,
        content_type  VARCHAR(100) NULL,
        md5_hash      VARCHAR(64) NULL,
        sha256        VARCHAR(64) NULL,
        CONSTRAINT uq_chapter_page_number UNIQUE (chapter_id, page_number)
    );""",
    "CREATE INDEX IF NOT EXISTS idx_chapter_pages_reader ON chapter_pages(chapter_id, page_number ASC);",
    # Subsystem C: History, Statuses, Ratings, Daily Metrics
    """CREATE TABLE IF NOT EXISTS user_reading_statuses (
        user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        manga_id     VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        status       reading_status_type NOT NULL,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, manga_id)
    );""",
    "CREATE INDEX IF NOT EXISTS idx_urs_user_status ON user_reading_statuses(user_id, status, updated_at DESC);",
    """CREATE TABLE IF NOT EXISTS user_manga_reading_history (
        user_id                UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        manga_id               VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        last_read_chapter_id   VARCHAR(64) NOT NULL REFERENCES chapters(pool_chapter_id) ON DELETE CASCADE,
        last_read_page_number  INTEGER NOT NULL DEFAULT 1,
        is_chapter_completed   BOOLEAN NOT NULL DEFAULT FALSE,
        first_read_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_read_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, manga_id)
    );""",
    "CREATE INDEX IF NOT EXISTS idx_umrh_user_recent ON user_manga_reading_history(user_id, last_read_at DESC);",
    """CREATE TABLE IF NOT EXISTS user_chapter_reads (
        user_id            UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        chapter_id         VARCHAR(64) NOT NULL REFERENCES chapters(pool_chapter_id) ON DELETE CASCADE,
        manga_id           VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        last_page_number   INTEGER NOT NULL DEFAULT 1,
        is_completed       BOOLEAN NOT NULL DEFAULT FALSE,
        read_count         INTEGER NOT NULL DEFAULT 1,
        first_read_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_read_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, chapter_id)
    );""",
    "CREATE INDEX IF NOT EXISTS idx_ucr_user_manga ON user_chapter_reads(user_id, manga_id);",
    "CREATE INDEX IF NOT EXISTS idx_ucr_user_time ON user_chapter_reads(user_id, last_read_at DESC);",
    """CREATE TABLE IF NOT EXISTS manga_ratings (
        user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        manga_id     VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        score        SMALLINT NOT NULL CHECK (score >= 1 AND score <= 10),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, manga_id)
    );""",
    "CREATE INDEX IF NOT EXISTS idx_ratings_manga ON manga_ratings(manga_id, score);",
    "CREATE INDEX IF NOT EXISTS idx_ratings_user ON manga_ratings(user_id, updated_at DESC);",
    """CREATE TABLE IF NOT EXISTS manga_rating_history (
        history_id   BIGSERIAL PRIMARY KEY,
        user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        manga_id     VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        old_score    SMALLINT NULL,
        new_score    SMALLINT NULL,
        action       VARCHAR(20) NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_rating_history_user ON manga_rating_history(user_id, created_at DESC);",
    """CREATE TABLE IF NOT EXISTS manga_daily_metrics (
        metric_date    DATE NOT NULL,
        manga_id       VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        views          BIGINT NOT NULL DEFAULT 0,
        list_adds      INTEGER NOT NULL DEFAULT 0,
        ratings_count  INTEGER NOT NULL DEFAULT 0,
        comments_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (metric_date, manga_id)
    );""",
    "CREATE INDEX IF NOT EXISTS idx_daily_metrics_manga_date ON manga_daily_metrics(manga_id, metric_date DESC);",
    # Subsystem D: Comments, Edit Histories, Reactions
    """CREATE TABLE IF NOT EXISTS comments (
        comment_id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        manga_id                 VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        chapter_id               VARCHAR(64) NULL REFERENCES chapters(pool_chapter_id) ON DELETE CASCADE,
        user_id                  UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        parent_comment_id        UUID NULL REFERENCES comments(comment_id) ON DELETE CASCADE,
        content                  VARCHAR(2000) NOT NULL,
        is_spoiler               BOOLEAN NOT NULL DEFAULT FALSE,
        spoiler_locked_by_admin  BOOLEAN NOT NULL DEFAULT FALSE,
        is_edited                BOOLEAN NOT NULL DEFAULT FALSE,
        edited_at                TIMESTAMPTZ NULL,
        is_deleted               BOOLEAN NOT NULL DEFAULT FALSE,
        deleted_by               UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
        deleted_at               TIMESTAMPTZ NULL,
        like_count               INTEGER NOT NULL DEFAULT 0,
        dislike_count            INTEGER NOT NULL DEFAULT 0,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_comments_manga_time ON comments(manga_id, created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_comments_manga_likes ON comments(manga_id, like_count DESC, created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_comments_chapter_time ON comments(chapter_id, created_at DESC) WHERE chapter_id IS NOT NULL;",
    "CREATE INDEX IF NOT EXISTS idx_comments_user_history ON comments(user_id, created_at DESC);",
    """CREATE TABLE IF NOT EXISTS comment_edit_histories (
        edit_id          BIGSERIAL PRIMARY KEY,
        comment_id       UUID NOT NULL REFERENCES comments(comment_id) ON DELETE CASCADE,
        previous_content VARCHAR(2000) NOT NULL,
        edited_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_comment_edits_comment ON comment_edit_histories(comment_id, edited_at DESC);",
    """CREATE TABLE IF NOT EXISTS comment_reactions (
        comment_id   UUID NOT NULL REFERENCES comments(comment_id) ON DELETE CASCADE,
        user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        reaction     comment_reaction_type NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (comment_id, user_id)
    );""",
    # Subsystem E: Reports
    """CREATE TABLE IF NOT EXISTS reports (
        report_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        reporter_id           UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        target_type           report_target_type NOT NULL,
        target_account_id     UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
        target_manga_id       VARCHAR(64) NULL REFERENCES mangas(pool_manga_id) ON DELETE SET NULL,
        target_chapter_id     VARCHAR(64) NULL REFERENCES chapters(pool_chapter_id) ON DELETE SET NULL,
        target_comment_id     UUID NULL REFERENCES comments(comment_id) ON DELETE SET NULL,
        reason_category       VARCHAR(100) NOT NULL,
        description           TEXT NOT NULL DEFAULT '',
        status                report_status NOT NULL DEFAULT 'pending',
        resolution_action     VARCHAR(64) NULL,
        resolution_note       TEXT NULL,
        resolved_by           UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
        resolved_at           TIMESTAMPTZ NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_reports_filter ON reports(target_type, status, created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id, created_at DESC);",
    # Subsystem F: Reading Lists & Items
    """CREATE TABLE IF NOT EXISTS reading_lists (
        list_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        owner_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        name          VARCHAR(150) NOT NULL,
        description   VARCHAR(1000) NOT NULL DEFAULT '',
        visibility    VARCHAR(20) NOT NULL DEFAULT 'private',
        manga_count   INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_reading_list_owner_name UNIQUE (owner_id, name)
    );""",
    "CREATE INDEX IF NOT EXISTS idx_reading_lists_owner ON reading_lists(owner_id, updated_at DESC);",
    """CREATE TABLE IF NOT EXISTS reading_list_items (
        list_id       UUID NOT NULL REFERENCES reading_lists(list_id) ON DELETE CASCADE,
        manga_id      VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (list_id, manga_id)
    );""",
    "CREATE INDEX IF NOT EXISTS idx_rli_list_added ON reading_list_items(list_id, added_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_rli_manga ON reading_list_items(manga_id);",
    # Subsystem G: ETL Sync Jobs & Recommendations Cache
    """CREATE TABLE IF NOT EXISTS etl_sync_jobs (
        job_id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        triggered_by          UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
        job_type              VARCHAR(30) NOT NULL,
        pool_manga_id         VARCHAR(64) NOT NULL,
        package_revision      INTEGER NULL,
        manifest_sha256       CHAR(64) NULL,
        status                VARCHAR(30) NOT NULL DEFAULT 'queued',
        error_message         TEXT NULL,
        started_at            TIMESTAMPTZ NULL,
        finished_at           TIMESTAMPTZ NULL,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
    """CREATE TABLE IF NOT EXISTS manga_recommendations_cache (
        manga_id              VARCHAR(64) PRIMARY KEY REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
        content_feature_vec   JSONB NOT NULL DEFAULT '{}'::jsonb,
        content_based_ids     JSONB NOT NULL DEFAULT '[]'::jsonb,
        item_based_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
        computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );""",
]

DOWNGRADE_SQL_STATEMENTS = [
    "DROP TABLE IF EXISTS manga_recommendations_cache CASCADE;",
    "DROP TABLE IF EXISTS etl_sync_jobs CASCADE;",
    "DROP TABLE IF EXISTS reading_list_items CASCADE;",
    "DROP TABLE IF EXISTS reading_lists CASCADE;",
    "DROP TABLE IF EXISTS reports CASCADE;",
    "DROP TABLE IF EXISTS comment_reactions CASCADE;",
    "DROP TABLE IF EXISTS comment_edit_histories CASCADE;",
    "DROP TABLE IF EXISTS comments CASCADE;",
    "DROP TABLE IF EXISTS manga_daily_metrics CASCADE;",
    "DROP TABLE IF EXISTS manga_rating_history CASCADE;",
    "DROP TABLE IF EXISTS manga_ratings CASCADE;",
    "DROP TABLE IF EXISTS user_chapter_reads CASCADE;",
    "DROP TABLE IF EXISTS user_manga_reading_history CASCADE;",
    "DROP TABLE IF EXISTS user_reading_statuses CASCADE;",
    "DROP TABLE IF EXISTS chapter_pages CASCADE;",
    "DROP TABLE IF EXISTS chapters CASCADE;",
    "DROP TABLE IF EXISTS manga_tags CASCADE;",
    "DROP TABLE IF EXISTS tags CASCADE;",
    "DROP TABLE IF EXISTS manga_creators CASCADE;",
    "DROP TABLE IF EXISTS creators CASCADE;",
    "DROP TABLE IF EXISTS manga_cover_arts CASCADE;",
    "DROP TABLE IF EXISTS mangas CASCADE;",
    "DROP TABLE IF EXISTS admin_audit_logs CASCADE;",
    "DROP TABLE IF EXISTS user_activity_logs CASCADE;",
    "DROP TABLE IF EXISTS users CASCADE;",
    "DROP TYPE IF EXISTS comment_reaction_type CASCADE;",
    "DROP TYPE IF EXISTS report_status CASCADE;",
    "DROP TYPE IF EXISTS report_target_type CASCADE;",
    "DROP TYPE IF EXISTS reading_status_type CASCADE;",
    "DROP TYPE IF EXISTS account_status CASCADE;",
    "DROP TYPE IF EXISTS user_role CASCADE;",
    "DROP TYPE IF EXISTS manga_visibility_status CASCADE;",
    "DROP TYPE IF EXISTS tag_group CASCADE;",
    "DROP TYPE IF EXISTS creator_role CASCADE;",
    "DROP TYPE IF EXISTS publication_demographic CASCADE;",
    "DROP TYPE IF EXISTS content_rating CASCADE;",
    "DROP TYPE IF EXISTS publication_status CASCADE;",
]


def upgrade() -> None:
    for stmt in UPGRADE_SQL_STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    for stmt in DOWNGRADE_SQL_STATEMENTS:
        op.execute(stmt)
