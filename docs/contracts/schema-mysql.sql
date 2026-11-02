-- ============================================================================
-- MANGA READER DATA CONTRACT v2.0 - MYSQL 8.0+ DDL SCHEMA
-- Target: Downstream Manga Reader Application Database (InnoDB, utf8mb4)
-- Source: Manga Data Lake & Storage Pool (Manga Reviews Management)
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. TABLE: mangas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `mangas` (
    `pool_manga_id`            VARCHAR(64) NOT NULL,
    `slug`                     VARCHAR(255) NOT NULL,
    `source_manga_id`          VARCHAR(64) NOT NULL,
    `mangadex_id`              CHAR(36) NULL,

    `title`                    VARCHAR(500) NOT NULL,
    `alt_titles`               JSON NOT NULL,
    `description`              TEXT NOT NULL,

    `status`                   ENUM('ongoing', 'completed', 'hiatus', 'cancelled', 'unknown') NOT NULL DEFAULT 'unknown',
    `content_rating`           ENUM('safe', 'suggestive', 'erotica', 'pornographic', 'unknown') NOT NULL DEFAULT 'unknown',
    `publication_demographic`  ENUM('shounen', 'shoujo', 'seinen', 'josei', 'kodomo', 'unknown') NOT NULL DEFAULT 'unknown',
    `original_language`        VARCHAR(10) NULL,
    `year`                     SMALLINT NULL,

    `published_start_date`     VARCHAR(50) NULL,
    `published_end_date`       VARCHAR(50) NULL,
    `official_volumes`         INT NULL,
    `official_chapters`        INT NULL,

    -- Primary cover image (Zero-Copy S3 pointer)
    `cover_bucket`             VARCHAR(63) NULL,
    `cover_object_key`         TEXT NULL,
    `cover_file_size`          BIGINT NOT NULL DEFAULT 0,
    `cover_width`              INT NULL,
    `cover_height`             INT NULL,
    `cover_content_type`       VARCHAR(100) NULL,

    -- Aggregated cache stats
    `chapter_count`            INT NOT NULL DEFAULT 0,
    `page_count`               INT NOT NULL DEFAULT 0,
    `total_size_bytes`         BIGINT NOT NULL DEFAULT 0,
    `available_languages`      JSON NOT NULL,

    -- Lineage & revision tracking
    `pool_revision`            INT NOT NULL DEFAULT 1,
    `source_metadata_revision` INT NOT NULL DEFAULT 1,
    `manifest_sha256`          CHAR(64) NOT NULL DEFAULT '',
    `pool_published_at`        DATETIME NULL,
    `pool_updated_at`          DATETIME NULL,

    `created_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`pool_manga_id`),
    UNIQUE KEY `uq_mangas_slug` (`slug`),
    KEY `idx_mangas_status` (`status`),
    KEY `idx_mangas_rating` (`content_rating`),
    KEY `idx_mangas_demographic` (`publication_demographic`),
    KEY `idx_mangas_updated_at` (`updated_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. TABLE: creators & manga_creators
-- Keyed by canonical `creator_id` UUID so homonymous creators with the same
-- display `name` never collide!
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `creators` (
    `creator_id`   VARCHAR(64) NOT NULL,
    `slug`         VARCHAR(255) NOT NULL,
    `name`         VARCHAR(255) NOT NULL,
    `mangadex_id`  CHAR(36) NULL,
    `biography`    JSON NOT NULL,
    `links`        JSON NOT NULL,
    `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`creator_id`),
    KEY `idx_creators_slug` (`slug`),
    KEY `idx_creators_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `manga_creators` (
    `manga_id`     VARCHAR(64) NOT NULL,
    `creator_id`   VARCHAR(64) NOT NULL,
    `role`         ENUM('author', 'artist') NOT NULL,
    PRIMARY KEY (`manga_id`, `creator_id`, `role`),
    KEY `idx_mc_creator` (`creator_id`),
    CONSTRAINT `fk_mc_manga` FOREIGN KEY (`manga_id`) REFERENCES `mangas` (`pool_manga_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_mc_creator` FOREIGN KEY (`creator_id`) REFERENCES `creators` (`creator_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. TABLE: tags & manga_tags
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tags` (
    `id`             INT AUTO_INCREMENT PRIMARY KEY,
    `slug`           VARCHAR(100) NOT NULL,
    `source_tag_id`  VARCHAR(64) NULL,
    `mangadex_id`    CHAR(36) NULL,
    `tag_group`      ENUM('genre', 'theme', 'format', 'content', 'other') NOT NULL DEFAULT 'genre',
    `name`           JSON NOT NULL,
    `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_tags_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `manga_tags` (
    `manga_id`  VARCHAR(64) NOT NULL,
    `tag_id`    INT NOT NULL,
    PRIMARY KEY (`manga_id`, `tag_id`),
    KEY `idx_mt_tag` (`tag_id`),
    CONSTRAINT `fk_mt_manga` FOREIGN KEY (`manga_id`) REFERENCES `mangas` (`pool_manga_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_mt_tag` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. TABLE: manga_links
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `manga_links` (
    `id`        INT AUTO_INCREMENT PRIMARY KEY,
    `manga_id`  VARCHAR(64) NOT NULL,
    `site`      VARCHAR(100) NOT NULL,
    `url`       TEXT NOT NULL,
    KEY `idx_ml_manga` (`manga_id`),
    CONSTRAINT `fk_ml_manga` FOREIGN KEY (`manga_id`) REFERENCES `mangas` (`pool_manga_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. TABLE: cover_arts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cover_arts` (
    `id`           INT AUTO_INCREMENT PRIMARY KEY,
    `manga_id`     VARCHAR(64) NOT NULL,
    `cover_id`     VARCHAR(64) NULL,
    `volume`       VARCHAR(20) NULL,
    `locale`       VARCHAR(10) NULL,
    `description`  TEXT NULL,

    `bucket`       VARCHAR(63) NOT NULL,
    `object_key`   TEXT NOT NULL,
    `file_size`    BIGINT NOT NULL DEFAULT 0,
    `width`        INT NULL,
    `height`       INT NULL,
    `content_type` VARCHAR(100) NULL,
    `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    KEY `idx_ca_manga` (`manga_id`),
    CONSTRAINT `fk_ca_manga` FOREIGN KEY (`manga_id`) REFERENCES `mangas` (`pool_manga_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. TABLE: chapters
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `chapters` (
    `pool_chapter_id`    VARCHAR(64) NOT NULL,
    `manga_id`           VARCHAR(64) NOT NULL,
    `source_chapter_id`  VARCHAR(64) NOT NULL,

    `chapter_number`     VARCHAR(50) NOT NULL,
    `chapter_numeric`    DOUBLE NOT NULL DEFAULT 0.0,
    `volume`             VARCHAR(20) NULL,
    `title`              VARCHAR(500) NOT NULL DEFAULT '',
    `language`           VARCHAR(10) NOT NULL DEFAULT 'en',
    `scanlation_group`   VARCHAR(255) NULL,
    `publish_at`         DATETIME NULL,

    `source`             VARCHAR(50) NOT NULL DEFAULT 'mangadex',
    `source_id`          VARCHAR(255) NULL,

    `page_count`         INT NOT NULL DEFAULT 0,
    `total_size_bytes`   BIGINT NOT NULL DEFAULT 0,
    `pages_revision`     INT NOT NULL DEFAULT 1,
    `manifest_sha256`    CHAR(64) NOT NULL DEFAULT '',

    `created_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`pool_chapter_id`),
    KEY `idx_ch_manga_sort` (`manga_id`, `chapter_numeric` ASC, `language`),
    KEY `idx_ch_language` (`language`),
    CONSTRAINT `fk_ch_manga` FOREIGN KEY (`manga_id`) REFERENCES `mangas` (`pool_manga_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. TABLE: chapter_pages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `chapter_pages` (
    `page_uid`      VARCHAR(64) NOT NULL,
    `chapter_id`    VARCHAR(64) NOT NULL,
    `page_number`   INT NOT NULL,
    `filename`      VARCHAR(255) NOT NULL,

    `bucket`        VARCHAR(63) NOT NULL,
    `object_key`    TEXT NOT NULL,
    `file_size`     BIGINT NOT NULL DEFAULT 0,
    `width`         INT NULL,
    `height`        INT NULL,
    `content_type`  VARCHAR(100) NULL,
    `md5_hash`      VARCHAR(64) NULL,
    `sha256`        VARCHAR(64) NULL,

    PRIMARY KEY (`page_uid`),
    UNIQUE KEY `uq_cp_page` (`chapter_id`, `page_number`),
    KEY `idx_cp_reader` (`chapter_id`, `page_number` ASC),
    CONSTRAINT `fk_cp_chapter` FOREIGN KEY (`chapter_id`) REFERENCES `chapters` (`pool_chapter_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
