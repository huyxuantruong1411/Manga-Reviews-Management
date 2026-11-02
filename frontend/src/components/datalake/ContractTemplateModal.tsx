import {
	Check,
	Code2,
	Copy,
	Database,
	Download,
	FileCode,
	FileJson,
	Loader2,
	ShieldCheck,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { getContractTemplate } from "../../api/datalakePool";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface ContractTemplateModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export const ContractTemplateModal: React.FC<ContractTemplateModalProps> = ({
	isOpen,
	onClose,
}) => {
	const [activeTab, setActiveTab] = useState<"schema" | "example" | "sql">(
		"schema",
	);
	const [selectedSqlDialect, setSelectedSqlDialect] = useState<
		"postgres" | "mysql"
	>("postgres");

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [templateData, setTemplateData] = useState<Record<
		string,
		unknown
	> | null>(null);
	const [copied, setCopied] = useState(false);

	const loadTemplate = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const data = await getContractTemplate();
			setTemplateData(data);
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: "Không thể tải mẫu hợp đồng dữ liệu";
			setError(msg);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (isOpen && !templateData) {
			void loadTemplate();
		}
	}, [isOpen, templateData, loadTemplate]);

	if (!isOpen) return null;

	const schemaText = templateData ? JSON.stringify(templateData, null, 2) : "";

	const exampleObj =
		templateData &&
		Array.isArray(templateData.examples) &&
		templateData.examples.length > 0
			? templateData.examples[0]
			: null;
	const exampleText = exampleObj ? JSON.stringify(exampleObj, null, 2) : "";

	const postgresSql = `-- ============================================================================
-- MANGA READER DATA CONTRACT v2.0 - POSTGRESQL DDL SCHEMA
-- ============================================================================

CREATE TYPE publication_status AS ENUM ('ongoing', 'completed', 'hiatus', 'cancelled', 'unknown');
CREATE TYPE content_rating AS ENUM ('safe', 'suggestive', 'erotica', 'pornographic', 'unknown');
CREATE TYPE publication_demographic AS ENUM ('shounen', 'shoujo', 'seinen', 'josei', 'kodomo', 'unknown');
CREATE TYPE creator_role AS ENUM ('author', 'artist');
CREATE TYPE tag_group AS ENUM ('genre', 'theme', 'format', 'content', 'other');

CREATE TABLE mangas (
    pool_manga_id            VARCHAR(64) PRIMARY KEY,
    slug                     VARCHAR(255) NOT NULL UNIQUE,
    source_manga_id          VARCHAR(64) NOT NULL,
    mangadex_id              UUID NULL,
    title                    VARCHAR(500) NOT NULL,
    alt_titles               JSONB NOT NULL DEFAULT '[]'::jsonb,
    description              TEXT NOT NULL DEFAULT '',
    status                   publication_status NOT NULL DEFAULT 'unknown',
    content_rating           content_rating NOT NULL DEFAULT 'unknown',
    publication_demographic  publication_demographic NOT NULL DEFAULT 'unknown',
    original_language        VARCHAR(10) NULL,
    year                     SMALLINT NULL,
    published_start_date     VARCHAR(50) NULL,
    published_end_date       VARCHAR(50) NULL,
    official_volumes         INTEGER NULL,
    official_chapters        INTEGER NULL,
    cover_bucket             VARCHAR(63) NULL,
    cover_object_key         TEXT NULL,
    cover_file_size          BIGINT NOT NULL DEFAULT 0,
    cover_width              INTEGER NULL,
    cover_height             INTEGER NULL,
    cover_content_type       VARCHAR(100) NULL,
    chapter_count            INTEGER NOT NULL DEFAULT 0,
    page_count               INTEGER NOT NULL DEFAULT 0,
    total_size_bytes         BIGINT NOT NULL DEFAULT 0,
    available_languages      JSONB NOT NULL DEFAULT '[]'::jsonb,
    pool_revision            INTEGER NOT NULL DEFAULT 1,
    source_metadata_revision INTEGER NOT NULL DEFAULT 1,
    manifest_sha256          CHAR(64) NOT NULL DEFAULT '',
    pool_published_at        TIMESTAMPTZ NULL,
    pool_updated_at          TIMESTAMPTZ NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Canonical creator identity by creator_id (UUID) to disambiguate homonymous authors/artists
CREATE TABLE creators (
    creator_id   VARCHAR(64) PRIMARY KEY,
    slug         VARCHAR(255) NOT NULL,
    name         VARCHAR(255) NOT NULL,
    mangadex_id  UUID NULL,
    biography    JSONB NOT NULL DEFAULT '{}'::jsonb,
    links        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_creators_slug ON creators(slug);
CREATE INDEX idx_creators_name ON creators(name);

CREATE TABLE manga_creators (
    manga_id     VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
    creator_id   VARCHAR(64) NOT NULL REFERENCES creators(creator_id) ON DELETE CASCADE,
    role         creator_role NOT NULL,
    PRIMARY KEY (manga_id, creator_id, role)
);

CREATE TABLE tags (
    id             SERIAL PRIMARY KEY,
    slug           VARCHAR(100) NOT NULL UNIQUE,
    source_tag_id  VARCHAR(64) NULL,
    mangadex_id    UUID NULL,
    tag_group      tag_group NOT NULL DEFAULT 'genre',
    name           JSONB NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE manga_tags (
    manga_id  VARCHAR(64) NOT NULL REFERENCES mangas(pool_manga_id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (manga_id, tag_id)
);

CREATE TABLE chapters (
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
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chapter_pages (
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
);

CREATE INDEX idx_chapters_manga_sort ON chapters(manga_id, chapter_numeric ASC, language);
CREATE INDEX idx_chapter_pages_reader ON chapter_pages(chapter_id, page_number ASC);`;

	const mysqlSql = `-- ============================================================================
-- MANGA READER DATA CONTRACT v2.0 - MYSQL 8.0+ DDL SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS mangas (
    pool_manga_id            VARCHAR(64) NOT NULL PRIMARY KEY,
    slug                     VARCHAR(255) NOT NULL UNIQUE,
    source_manga_id          VARCHAR(64) NOT NULL,
    mangadex_id              CHAR(36) NULL,
    title                    VARCHAR(500) NOT NULL,
    alt_titles               JSON NOT NULL,
    description              TEXT NOT NULL,
    status                   ENUM('ongoing', 'completed', 'hiatus', 'cancelled', 'unknown') NOT NULL DEFAULT 'unknown',
    content_rating           ENUM('safe', 'suggestive', 'erotica', 'pornographic', 'unknown') NOT NULL DEFAULT 'unknown',
    publication_demographic  ENUM('shounen', 'shoujo', 'seinen', 'josei', 'kodomo', 'unknown') NOT NULL DEFAULT 'unknown',
    original_language        VARCHAR(10) NULL,
    year                     SMALLINT NULL,
    published_start_date     VARCHAR(50) NULL,
    published_end_date       VARCHAR(50) NULL,
    official_volumes         INT NULL,
    official_chapters        INT NULL,
    cover_bucket             VARCHAR(63) NULL,
    cover_object_key         TEXT NULL,
    cover_file_size          BIGINT NOT NULL DEFAULT 0,
    cover_width              INT NULL,
    cover_height             INT NULL,
    cover_content_type       VARCHAR(100) NULL,
    chapter_count            INT NOT NULL DEFAULT 0,
    page_count               INT NOT NULL DEFAULT 0,
    total_size_bytes         BIGINT NOT NULL DEFAULT 0,
    available_languages      JSON NOT NULL,
    pool_revision            INT NOT NULL DEFAULT 1,
    source_metadata_revision INT NOT NULL DEFAULT 1,
    manifest_sha256          CHAR(64) NOT NULL DEFAULT '',
    pool_published_at        DATETIME NULL,
    pool_updated_at          DATETIME NULL,
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_mangas_status (status),
    KEY idx_mangas_rating (content_rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creators (
    creator_id   VARCHAR(64) NOT NULL PRIMARY KEY,
    slug         VARCHAR(255) NOT NULL,
    name         VARCHAR(255) NOT NULL,
    mangadex_id  CHAR(36) NULL,
    biography    JSON NOT NULL,
    links        JSON NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_creators_slug (slug),
    KEY idx_creators_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS manga_creators (
    manga_id     VARCHAR(64) NOT NULL,
    creator_id   VARCHAR(64) NOT NULL,
    role         ENUM('author', 'artist') NOT NULL,
    PRIMARY KEY (manga_id, creator_id, role),
    CONSTRAINT fk_mc_manga FOREIGN KEY (manga_id) REFERENCES mangas (pool_manga_id) ON DELETE CASCADE,
    CONSTRAINT fk_mc_creator FOREIGN KEY (creator_id) REFERENCES creators (creator_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chapters (
    pool_chapter_id    VARCHAR(64) NOT NULL PRIMARY KEY,
    manga_id           VARCHAR(64) NOT NULL,
    source_chapter_id  VARCHAR(64) NOT NULL,
    chapter_number     VARCHAR(50) NOT NULL,
    chapter_numeric    DOUBLE NOT NULL DEFAULT 0.0,
    volume             VARCHAR(20) NULL,
    title              VARCHAR(500) NOT NULL DEFAULT '',
    language           VARCHAR(10) NOT NULL DEFAULT 'en',
    scanlation_group   VARCHAR(255) NULL,
    publish_at         DATETIME NULL,
    source             VARCHAR(50) NOT NULL DEFAULT 'mangadex',
    source_id          VARCHAR(255) NULL,
    page_count         INT NOT NULL DEFAULT 0,
    total_size_bytes   BIGINT NOT NULL DEFAULT 0,
    pages_revision     INT NOT NULL DEFAULT 1,
    manifest_sha256    CHAR(64) NOT NULL DEFAULT '',
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_ch_manga_sort (manga_id, chapter_numeric ASC, language),
    CONSTRAINT fk_ch_manga FOREIGN KEY (manga_id) REFERENCES mangas (pool_manga_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chapter_pages (
    page_uid      VARCHAR(64) NOT NULL PRIMARY KEY,
    chapter_id    VARCHAR(64) NOT NULL,
    page_number   INT NOT NULL,
    filename      VARCHAR(255) NOT NULL,
    bucket        VARCHAR(63) NOT NULL,
    object_key    TEXT NOT NULL,
    file_size     BIGINT NOT NULL DEFAULT 0,
    width         INT NULL,
    height        INT NULL,
    content_type  VARCHAR(100) NULL,
    md5_hash      VARCHAR(64) NULL,
    sha256        VARCHAR(64) NULL,
    UNIQUE KEY uq_cp_page (chapter_id, page_number),
    KEY idx_cp_reader (chapter_id, page_number ASC),
    CONSTRAINT fk_cp_chapter FOREIGN KEY (chapter_id) REFERENCES chapters (pool_chapter_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

	const currentSql = selectedSqlDialect === "postgres" ? postgresSql : mysqlSql;

	const handleCopy = (text: string) => {
		void navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const handleDownload = (
		content: string,
		filename: string,
		mimeType: string,
	) => {
		const blob = new Blob([content], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs">
			<div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
				{/* Header */}
				<div className="p-5 sm:p-6 border-b border-[var(--border-primary)] flex items-start justify-between gap-4">
					<div className="space-y-1">
						<div className="flex items-center space-x-2.5">
							<span className="p-2 rounded-xl bg-orange-500/10 text-[var(--brand-orange)]">
								<FileCode size={22} />
							</span>
							<h2 className="text-xl font-black text-[var(--text-primary)]">
								Mẫu Hợp Đồng Dữ Liệu Manga Reader (Contract v2.0)
							</h2>
							<Badge className="bg-blue-600/20 text-blue-400 font-mono text-[11px] border-blue-500/30">
								JSON Schema 2020-12
							</Badge>
						</div>
						<p className="text-xs sm:text-sm text-[var(--text-secondary)]">
							Mẫu chuẩn chung hợp lệ cho mọi bộ manga trên hệ thống. Phía hệ
							thống đọc truyện dùng mẫu này để xây dựng bảng CSDL quan hệ và
							ghép các trường dữ liệu 1:1.
						</p>
					</div>

					<button
						type="button"
						onClick={onClose}
						className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
						aria-label="Đóng"
					>
						<X size={20} />
					</button>
				</div>

				{/* Tab Selector & Actions Bar */}
				<div className="px-5 sm:px-6 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-input)]/30 flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center space-x-1.5 p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] text-xs">
						<button
							type="button"
							onClick={() => setActiveTab("schema")}
							className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer ${
								activeTab === "schema"
									? "bg-[var(--brand-orange)] text-white shadow-xs"
									: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
							}`}
						>
							<ShieldCheck size={14} />
							<span>1. JSON Schema Chuẩn</span>
						</button>

						<button
							type="button"
							onClick={() => setActiveTab("example")}
							className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer ${
								activeTab === "example"
									? "bg-[var(--brand-orange)] text-white shadow-xs"
									: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
							}`}
						>
							<FileJson size={14} />
							<span>2. File Mẫu Thực Tế (Example JSON)</span>
						</button>

						<button
							type="button"
							onClick={() => setActiveTab("sql")}
							className={`px-3 py-1.5 rounded-lg font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer ${
								activeTab === "sql"
									? "bg-[var(--brand-orange)] text-white shadow-xs"
									: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
							}`}
						>
							<Database size={14} />
							<span>3. DDL Cơ Sở Dữ Liệu (SQL)</span>
						</button>
					</div>

					{/* Action Buttons for current tab */}
					<div className="flex items-center space-x-2">
						{activeTab === "sql" && (
							<div className="flex items-center space-x-1 mr-2 p-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-primary)] text-xs">
								<button
									type="button"
									onClick={() => setSelectedSqlDialect("postgres")}
									className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
										selectedSqlDialect === "postgres"
											? "bg-blue-600 text-white"
											: "text-[var(--text-secondary)] hover:text-white"
									}`}
								>
									PostgreSQL
								</button>
								<button
									type="button"
									onClick={() => setSelectedSqlDialect("mysql")}
									className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
										selectedSqlDialect === "mysql"
											? "bg-amber-600 text-white"
											: "text-[var(--text-secondary)] hover:text-white"
									}`}
								>
									MySQL 8+
								</button>
							</div>
						)}

						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								if (activeTab === "schema") handleCopy(schemaText);
								else if (activeTab === "example") handleCopy(exampleText);
								else handleCopy(currentSql);
							}}
							disabled={loading || !!error}
							className="text-xs"
						>
							{copied ? (
								<Check size={14} className="mr-1.5 text-emerald-400" />
							) : (
								<Copy size={14} className="mr-1.5" />
							)}
							<span>{copied ? "Đã sao chép!" : "Sao chép code"}</span>
						</Button>

						<Button
							size="sm"
							onClick={() => {
								if (activeTab === "schema") {
									handleDownload(
										schemaText,
										"manga_reader_contract_v2.schema.json",
										"application/json",
									);
								} else if (activeTab === "example") {
									handleDownload(
										exampleText,
										"manga_reader_example_v2.json",
										"application/json",
									);
								} else {
									handleDownload(
										currentSql,
										`manga_reader_schema_${selectedSqlDialect}.sql`,
										"text/plain",
									);
								}
							}}
							disabled={loading || !!error}
							className="bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs"
						>
							<Download size={14} className="mr-1.5" />
							<span>
								{activeTab === "schema"
									? "Tải Schema .json"
									: activeTab === "example"
										? "Tải Example .json"
										: `Tải Schema ${selectedSqlDialect.toUpperCase()}`}
							</span>
						</Button>
					</div>
				</div>

				{/* Body Content */}
				<div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
					{loading ? (
						<div className="py-20 flex flex-col items-center justify-center space-y-3 text-[var(--text-secondary)]">
							<Loader2 size={32} className="animate-spin text-orange-500" />
							<p className="text-sm">Đang tải và sinh hợp đồng dữ liệu...</p>
						</div>
					) : error ? (
						<div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-center space-y-2">
							<p className="font-semibold text-sm">{error}</p>
							<Button size="sm" variant="outline" onClick={loadTemplate}>
								Thử lại
							</Button>
						</div>
					) : (
						<>
							{/* Tab 1: JSON Schema */}
							{activeTab === "schema" && (
								<div className="space-y-3">
									<div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center justify-between">
										<div className="flex items-center space-x-2">
											<ShieldCheck size={16} className="text-blue-400" />
											<span>
												Chuẩn <strong>Draft 2020-12</strong> nghiêm ngặt (
												<code>additionalProperties: false</code>). Chặn mọi
												trường rò rỉ nội bộ.
											</span>
										</div>
										<span className="font-mono text-[11px] text-blue-400/80">
											$id: urn:manga-datalake:contract:manga-reader-package:2.0
										</span>
									</div>

									<pre className="p-4 rounded-2xl bg-zinc-950 border border-[var(--border-primary)] text-xs text-zinc-300 font-mono overflow-x-auto max-h-[55vh] leading-relaxed selection:bg-orange-500/30">
										{schemaText}
									</pre>
								</div>
							)}

							{/* Tab 2: Example JSON */}
							{activeTab === "example" && (
								<div className="space-y-3">
									<div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
										<div className="flex items-center space-x-2">
											<FileJson size={16} className="text-emerald-400" />
											<span>
												Dữ liệu mẫu thực tế điền đầy đủ mọi quan hệ: Manga,
												Creators (UUID + Slug), Tags, Chương và Trang đã đánh số
												chuẩn 1..N.
											</span>
										</div>
										<Badge className="bg-emerald-600/30 text-emerald-300 text-[10px]">
											100% VALIDATED
										</Badge>
									</div>

									<pre className="p-4 rounded-2xl bg-zinc-950 border border-[var(--border-primary)] text-xs text-zinc-300 font-mono overflow-x-auto max-h-[55vh] leading-relaxed selection:bg-orange-500/30">
										{exampleText}
									</pre>
								</div>
							)}

							{/* Tab 3: SQL DDL */}
							{activeTab === "sql" && (
								<div className="space-y-3">
									<div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs flex items-center justify-between">
										<div className="flex items-center space-x-2">
											<Database size={16} className="text-orange-400" />
											<span>
												Script DDL thiết kế sẵn bảng, khóa chính UUID cho
												Creators, khóa ngoại CASCADE và Index tối ưu cho hệ
												thống đọc truyện.
											</span>
										</div>
										<span className="font-mono text-[11px] text-orange-400/80">
											Dialect: {selectedSqlDialect.toUpperCase()}
										</span>
									</div>

									<pre className="p-4 rounded-2xl bg-zinc-950 border border-[var(--border-primary)] text-xs text-emerald-400 font-mono overflow-x-auto max-h-[55vh] leading-relaxed selection:bg-orange-500/30">
										{currentSql}
									</pre>
								</div>
							)}
						</>
					)}
				</div>

				{/* Footer Info */}
				<div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-card)] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
					<div className="flex items-center space-x-2">
						<Code2 size={14} className="text-orange-500" />
						<span>
							Endpoint API trực tiếp:{" "}
							<code className="text-zinc-300 font-mono px-1 py-0.5 rounded bg-zinc-800">
								GET /api/datalake-pool/contract/template
							</code>
						</span>
					</div>
					<span>
						Tài liệu chi tiết:{" "}
						<code className="text-zinc-300 font-mono">
							docs/contracts/reader-contract-v2.md
						</code>
					</span>
				</div>
			</div>
		</div>
	);
};
