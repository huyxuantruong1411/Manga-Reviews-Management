-- ============================================================================
-- MANGA READER DATA CONTRACT v2.0 - POSTGRESQL DDL SCHEMA
-- Target: Downstream Manga Reader Application Database
-- Source: Manga Data Lake & Storage Pool (Manga Reviews Management)
-- ============================================================================

-- Extensions (optional for UUID generation if needed)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE publication_status AS ENUM ('ongoing', 'completed', 'hiatus', 'cancelled', 'unknown');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE content_rating AS ENUM ('safe', 'suggestive', 'erotica', 'pornographic', 'unknown');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE publication_demographic AS ENUM ('shounen', 'shoujo', 'seinen', 'josei', 'kodomo', 'unknown');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE creator_role AS ENUM ('author', 'artist');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE tag_group AS ENUM ('genre', 'theme', 'format', 'content', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ----------------------------------------------------------------------------
-- 2. TABLE: mangas
-- Primary metadata for a manga title.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mangas (
    pool_manga_id            VARCHAR(64) PRIMARY KEY, -- e.g. pm_1a2b3c4d5e6f
    slug                     VARCHAR(255) NOT NULL UNIQUE,
    source_manga_id          VARCHAR(64) NOT NULL,
    mangadex_id              UUID NULL,

    title                    VARCHAR(500) NOT NULL,
    alt_titles               JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of strings
    description              TEXT NOT NULL DEFAULT '',

    status                   publication_status NOT NULL DEFAULT 'unknown',
    content_rating           content_rating NOT NULL DEFAULT 'unknown',
    publication_demographic  publication_demographic NOT NULL DEFAULT 'unknown',
    original_language        VARCHAR(10) NULL, -- e.g. 'ja', 'ko', 'zh'
    year                     SMALLINT NULL,

    published_start_date     VARCHAR(50) NULL,
    published_end_date       VARCHAR(50) NULL,
    official_volumes         INTEGER NULL,
    official_chapters        INTEGER NULL,

    -- Primary cover image (Zero-Copy S3 pointer)
    cover_bucket             VARCHAR(63) NULL,
    cover_object_key         TEXT NULL,
    cover_file_size          BIGINT NULL DEFAULT 0,
    cover_width              INTEGER NULL,
    cover_height             INTEGER NULL,
    cover_content_type       VARCHAR(100) NULL,

    -- Aggregated cache stats (computed on export)
    chapter_count            INTEGER NOT NULL DEFAULT 0,
    page_count               INTEGER NOT NULL DEFAULT 0,
    total_size_bytes         BIGINT NOT NULL DEFAULT 0,
    available_languages      JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Lineage & revision tracking (use for change detection)
    pool_revision            INTEGER NOT NULL DEFAULT 1,
    source_metadata_revision INTEGER NOT NULL DEFAULT 1,
    manifest_sha256          CHAR(64) NOT NULL DEFAULT '',
    pool_published_at        TIMESTAMPTZ NULL,
    pool_updated_at          TIMESTAMPTZ NULL,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mangas_status ON mangas(status);
CREATE INDEX IF NOT EXISTS idx_mangas_rating ON mangas(content_rating);
CREATE INDEX IF NOT EXISTS idx_mangas_demographic ON mangas(publication_demographic);
CREATE INDEX IF NOT EXISTS idx_mangas_updated_at ON mangas(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mangas_title_trgm ON mangas USING gin (title gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 3. TABLE: creators & manga_creators (Authors / Artists)
-- Keyed by canonical `creator_id` UUID (MangaDex UUID or deterministic UUIDv5)
-- so homonymous creators with the same display `name` never collide!
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creators (
    creator_id   VARCHAR(64) PRIMARY KEY, -- Canonical UUID (e.g. 7918d851-d77f-4ad6-9ec5-2c097320dc7e)
    slug         VARCHAR(255) NOT NULL,   -- URL slug (e.g. nakamura-moto) for /author/{creator_id}/{slug}
    name         VARCHAR(255) NOT NULL,   -- Display name (NOT unique: different creators may share a name)
    mangadex_id  UUID NULL,
    biography    JSONB NOT NULL DEFAULT '{}'::jsonb, -- localized bio e.g. {"en": "..."}
    links        JSONB NOT NULL DEFAULT '{}'::jsonb, -- social links e.g. {"twitter": "...", "pixiv": "..."}
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creators_slug ON creators(slug);
CREATE INDEX IF NOT EXISTS idx_creators_name ON creators(name);

CREATE TABLE IF NOT EXISTS manga_creators (
    manga_id     VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
    creator_id   VARCHAR(64) NOT NULL REFERENCES creators(creator_id) ON DELETE CASCADE,
    role         creator_role NOT NULL,
    PRIMARY KEY (manga_id, creator_id, role)
);

CREATE INDEX IF NOT EXISTS idx_manga_creators_creator ON manga_creators(creator_id);

-- ----------------------------------------------------------------------------
-- 4. TABLE: tags & manga_tags (Genres / Themes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
    id             SERIAL PRIMARY KEY,
    slug           VARCHAR(100) NOT NULL UNIQUE,
    source_tag_id  VARCHAR(64) NULL,
    mangadex_id    UUID NULL,
    tag_group      tag_group NOT NULL DEFAULT 'genre',
    name           JSONB NOT NULL, -- {"en": "Action", "vi": "Hành động"}
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manga_tags (
    manga_id  VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (manga_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_manga_tags_tag ON manga_tags(tag_id);

-- ----------------------------------------------------------------------------
-- 5. TABLE: manga_links (External URLs e.g. MangaDex, Official Site)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manga_links (
    id        SERIAL PRIMARY KEY,
    manga_id  VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
    site      VARCHAR(100) NOT NULL,
    url       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_manga_links_manga ON manga_links(manga_id);

-- ----------------------------------------------------------------------------
-- 6. TABLE: cover_arts (Alternative / Volume Covers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cover_arts (
    id           SERIAL PRIMARY KEY,
    manga_id     VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
    cover_id     VARCHAR(64) NULL,
    volume       VARCHAR(20) NULL,
    locale       VARCHAR(10) NULL,
    description  TEXT NULL,

    bucket       VARCHAR(63) NOT NULL,
    object_key   TEXT NOT NULL,
    file_size    BIGINT NOT NULL DEFAULT 0,
    width        INTEGER NULL,
    height       INTEGER NULL,
    content_type VARCHAR(100) NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cover_arts_manga ON cover_arts(manga_id);

-- ----------------------------------------------------------------------------
-- 7. TABLE: chapters
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chapters (
    pool_chapter_id    VARCHAR(64) PRIMARY KEY, -- e.g. pch_0a1b2c3d4e5f
    manga_id           VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
    source_chapter_id  VARCHAR(64) NOT NULL,

    chapter_number     VARCHAR(50) NOT NULL, -- display string e.g. "10.5", "Extra"
    chapter_numeric    DOUBLE PRECISION NOT NULL DEFAULT 0.0, -- for natural sorting
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

    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chapters_manga_sort ON chapters(manga_id, chapter_numeric ASC, language);
CREATE INDEX IF NOT EXISTS idx_chapters_language ON chapters(language);

-- ----------------------------------------------------------------------------
-- 8. TABLE: chapter_pages
-- Stored pages with strictly contiguous page_number (1..N).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chapter_pages (
    page_uid      VARCHAR(64) PRIMARY KEY,
    chapter_id    VARCHAR(64) NOT NULL REFERENCES chapters(pool_chapter_id) ON DELETE CASCADE,
    page_number   INTEGER NOT NULL,
    filename      VARCHAR(255) NOT NULL,

    -- Zero-Copy S3 pointer
    bucket        VARCHAR(63) NOT NULL,
    object_key    TEXT NOT NULL,
    file_size     BIGINT NOT NULL DEFAULT 0,
    width         INTEGER NULL,
    height        INTEGER NULL,
    content_type  VARCHAR(100) NULL,
    md5_hash      VARCHAR(64) NULL,
    sha256        VARCHAR(64) NULL,

    CONSTRAINT uq_chapter_page_number UNIQUE (chapter_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_chapter_pages_reader ON chapter_pages(chapter_id, page_number ASC);
