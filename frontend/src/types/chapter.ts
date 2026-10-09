export interface PageItem {
	page_uid?: string;
	page_number: number;
	filename: string;
	object_key: string;
	file_size: number;
	width?: number | null;
	height?: number | null;
	md5_hash?: string | null;
	url?: string | null;
}

export interface Chapter {
	id: string;
	manga_id: string;
	chapter_number: string;
	chapter_numeric: number;
	volume?: string | null;
	title?: string;
	language: string;
	scanlation_group?: string | null;
	source: string;
	source_id?: string | null;
	pages: PageItem[];
	page_count: number;
	pages_revision?: number;
	uploader?: string | null;
	publish_at?: string | null;
	created_at?: string;
	updated_at?: string;
}

export interface ReadingProgress {
	manga_id: string;
	last_read_chapter_id?: string | null;
	last_read_chapter_number?: string | null;
	last_read_page: number;
	read_chapter_ids: string[];
	reading_mode: "long_strip" | "single" | "double_ltr" | "double_rtl";
	fit_mode: "width" | "height" | "original";
	updated_at?: string;
}

export interface DetectedChapter {
	folder_name: string;
	folder_path: string;
	chapter_number: string;
	chapter_numeric: number;
	volume?: string | null;
	title?: string;
	scanlation_group?: string | null;
	page_count: number;
	image_files: string[];
	is_duplicate: boolean;
	existing_chapter_id?: string | null;
}

export interface FolderScanResponse {
	folder_path: string;
	is_valid: boolean;
	message: string;
	total_folders: number;
	detected_chapters: DetectedChapter[];
	unrecognized_folders: string[];
}

export interface StorageDuplicateItem {
	chapter_id: string;
	chapter_number: string;
	chapter_title?: string | null;
	page_number: number;
	filename: string;
	object_key: string;
	file_size: number;
	url?: string | null;
}

export interface StorageDuplicateGroup {
	md5_hash: string;
	file_size: number;
	items: StorageDuplicateItem[];
}

export type ExportFormat = "pdf" | "zip" | "cbz" | "folder";
export type ExportGrouping = "single_file" | "by_volume" | "by_chapter";
export type ExportDestination = "browser" | "local_folder";
export type ImageOptimization = "original" | "compressed";

export interface ChapterExportRequest {
	chapter_ids?: string[];
	language?: string;
	format: ExportFormat;
	grouping: ExportGrouping;
	destination: ExportDestination;
	local_path?: string;
	auto_open_explorer?: boolean;
	image_optimization?: ImageOptimization;
	include_metadata?: boolean;
	include_cover?: boolean;
	naming_template?: string;
}

export interface ExportLogItem {
	id: string;
	time: string;
	text: string;
	type: "info" | "success" | "warn" | "error";
}

export interface ChapterExportProgress {
	status: "idle" | "running" | "completed" | "error";
	percent: number;
	totalChapters: number;
	currentChapterNumber: string;
	currentChapterTitle: string;
	currentChapterIndex: number;
	currentPageNumber: number;
	currentChapterPageCount: number;
	totalPagesDone: number;
	totalPagesOverall: number;
	speedPagesPerSec: number;
	elapsedSeconds: number;
	etaSeconds: number;
	previewBase64: string | null;
	phaseMessage: string;
	downloadUrl?: string | null;
	destinationPath?: string | null;
	fileName?: string | null;
	totalSizeBytes?: number;
	isLocal?: boolean;
	logs: ExportLogItem[];
	error?: string;
}
