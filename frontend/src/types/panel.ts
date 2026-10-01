export interface PanelResult {
	panel_id: string;
	manga_id: string;
	manga_title: string;
	manga_cover_url?: string | null;
	chapter_id: string;
	chapter_number: string;
	chapter_title?: string;
	volume?: string | null;
	page_number: number;
	panel_index: number;
	coords: [number, number, number, number];
	raw_text: string;
	cleaned_text: string;
	highlighted_text?: string;
	language?: string;
	scan_mode?: string;
	vocabulary?: Array<{
		term: string;
		lemma: string;
		pos_tag: string;
		frequency: number;
	}>;
}

export interface PanelScanStatus {
	stage: string;
	current: number;
	total: number;
	percent: number;
	message: string;
	is_scanning: boolean;
	manga_id?: string;
}

export interface GlobalScanStatus {
	stage: string;
	current_manga_id?: string | null;
	current_manga_title: string;
	mangas_scanned: number;
	total_mangas: number;
	total_manga?: number;
	current_manga_index?: number;
	current_page: number;
	total_pages: number;
	panels_extracted: number;
	percent: number;
	message: string;
	is_scanning: boolean;
}

export interface PanelStats {
	manga_id: string;
	total_panels: number;
	total_pages_scanned: number;
	total_chapters_scanned: number;
	total_unique_words: number;
	is_scanning: boolean;
}

export interface GlobalPanelStats {
	total_panels: number;
	total_pages_scanned: number;
	total_mangas_scanned: number;
	total_chapters_scanned: number;
	total_unique_words: number;
	is_scanning: boolean;
}

export interface ScannedMangaItem {
	manga_id: string;
	title: string;
	cover_url?: string | null;
	chapters_count: number;
	panels_count: number;
}

export interface WordMeaning {
	part_of_speech: string;
	definition: string;
	example?: string;
}

export interface WordDefinition {
	word: string;
	phonetic: string;
	audio_url: string;
	meanings: WordMeaning[];
	cached?: boolean;
	status?: "ok" | "not_found" | "unavailable";
}
