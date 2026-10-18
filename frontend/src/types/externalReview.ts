export type ExternalReviewSource =
	| "myanimelist"
	| "anilist"
	| "mangaupdates"
	| "animeplanet";

export type RecommendationStatus =
	| "recommended"
	| "mixed_feelings"
	| "not_recommended"
	| "unknown";

export interface MALAuthorEntry {
	mal_id?: number;
	name: string;
	role: string;
	url?: string;
}

export interface MALExtendedMetadata {
	mal_id: number;
	canonical_url: string;
	japanese_title?: string;
	english_title?: string;
	synonyms: string[];
	media_type?: string;
	volumes?: number;
	chapters?: number;
	status?: string;
	published_string?: string;
	published_start_date?: string;
	published_end_date?: string;
	genres: string[];
	themes: string[];
	demographics: string[];
	serialization: string[];
	authors: MALAuthorEntry[];
	score?: number;
	scored_by?: number;
	rank?: number;
	popularity?: number;
	members?: number;
	favorites?: number;
	last_enriched_at: string;
}

export interface ExternalReviewReactions {
	total: number;
	nice: number;
	love_it: number;
	funny: number;
	confusing: number;
	informative: number;
	well_written: number;
	creative: number;
}

export interface ExternalReview {
	_id: string;
	manga_id: string;
	source: ExternalReviewSource;
	source_work_id: string;
	source_review_id: string;
	source_url: string;
	reviewer_name: string;
	reviewer_profile_url?: string;
	reviewer_avatar_url?: string;
	overall_rating?: number;
	recommendation_status: RecommendationStatus;
	is_preliminary: boolean;
	chapters_progress?: string;
	is_spoiler: boolean;
	content_text: string;
	word_count: number;
	character_count: number;
	reactions: ExternalReviewReactions;
	posted_at?: string;
	posted_at_raw?: string;
	fetched_at: string;
	updated_at: string;
}

export interface ExternalReviewStatsSummary {
	total_reviews: number;
	by_source: Record<string, number>;
	by_recommendation: Record<string, number>;
	spoiler_count: number;
	preliminary_count: number;
	average_rating?: number;
	last_synced_at?: string;
	linked_mal_id?: string;
	linked_mal_url?: string;
}

export interface ExternalReviewListResponse {
	items: ExternalReview[];
	total: number;
	skip: number;
	limit: number;
	summary: ExternalReviewStatsSummary;
}

export interface ExternalReviewSyncProgress {
	manga_id: string;
	source?: ExternalReviewSource;
	status: "idle" | "running" | "completed" | "failed" | "cancelled";
	stage: string;
	stage_label: string;
	progress_pct: number;
	current_page: number;
	total_estimated_pages: number;
	fetched_reviews_count: number;
	total_expected_reviews: number;
	inserted_count: number;
	updated_count: number;
	skipped_count: number;
	logs: string[];
	started_at?: string;
	completed_at?: string;
	error?: string;
}

export interface TriggerExternalReviewSyncRequest {
	source?: ExternalReviewSource;
	mal_url_or_id?: string;
	include_spoilers?: boolean;
	include_preliminary?: boolean;
	sync_extended_metadata?: boolean;
	apply_empty_manga_fields?: boolean;
	max_pages?: number;
	force_full_rescan?: boolean;
}
