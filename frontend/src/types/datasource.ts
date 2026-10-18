export type DatasourceProviderId = "mangadex" | "mangafire" | "comix";

export interface ProviderCapability {
	name: DatasourceProviderId | string;
	display_name: string;
	can_search: boolean;
	can_resolve_url: boolean;
	supports_languages: string[];
	requires_session: boolean;
	can_download: boolean;
	supported_url_patterns: string[];
	rate_limit_per_minute: number;
}

export interface SourceWork {
	source: string;
	source_work_id: string;
	title: string;
	url: string;
	alt_titles: string[];
	author?: string | null;
	artist?: string | null;
	cover_url?: string | null;
	status?: string | null;
	year?: string | null;
	description?: string;
	content_rating?: string | null;
	publication_demographic?: string | null;
	original_language?: string | null;
	available_languages: string[];
	external_ids: Record<string, string>;
	extra_metadata?: Record<string, any>;
}

export interface SourceRelease {
	id: string;
	source: string;
	source_work_id: string;
	chapter_number: string;
	title: string;
	volume?: string | null;
	language: string;
	unit_kind: string;
	release_type?: string | null;
	group_id?: string | null;
	group_name?: string | null;
	uploader?: string | null;
	uploader_id?: string | null;
	pages_count: number;
	version: number;
	publish_at?: string | null;
	readable_at?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	external_url?: string | null;
}

export interface ReleasePage {
	items: SourceRelease[];
	total: number;
	has_next: boolean;
	page: number;
	limit: number;
	catalogue_complete: boolean;
	observed_at: string;
}

export type DownloadSelectionPolicy =
	| "skip_existing_release"
	| "keep_alternative"
	| "replace_preferred_after_commit"
	| "retry_failed";

export interface DownloadPlanItem {
	item_id: string;
	source_release_id: string;
	chapter_number: string;
	volume?: string | null;
	title?: string;
	language: string;
	unit_kind: string;
	target_slot_id?: string | null;
	target_chapter_id?: string | null;
	action: string;
	status: string;
	reason?: string | null;
	expected_revision: number;
	error?: string | null;
}

export interface DownloadPlan {
	id: string;
	_id?: string;
	plan_id?: string;
	manga_id: string;
	source: string;
	source_work_id: string;
	selection_policy: DownloadSelectionPolicy;
	items: DownloadPlanItem[];
	total_items: number;
	download_count: number;
	skip_count: number;
	save_to_disk: boolean;
	download_path?: string | null;
	expires_at: string;
	created_at: string;
	updated_at: string;
}

export interface MangaSourceBinding {
	id?: string;
	manga_id: string;
	source: string;
	source_work_id: string;
	url: string;
	title_snapshot: string;
	status: string;
	is_preferred: boolean;
	linked_at: string;
	last_synced_at?: string | null;
}

export interface MetadataFieldDiff {
	field_path: string;
	current_value?: any;
	candidate_value?: any;
	source: string;
	decision_state: "identical" | "new" | "conflict" | "locked";
	is_locked: boolean;
	recommended_action: "keep" | "accept" | "manual_review";
}

export interface MetadataPreviewResponse {
	manga_id: string;
	source: string;
	source_work_id: string;
	current_metadata_revision: number;
	diffs: MetadataFieldDiff[];
	has_conflicts: boolean;
	protected_user_fields: string[];
}

export interface MetadataApplyRequest {
	source: string;
	source_work_id: string;
	expected_metadata_revision: number;
	accepted_fields: string[];
	field_locks?: Record<string, boolean>;
}

export interface MetadataApplyResponse {
	success: boolean;
	manga_id: string;
	applied_fields: string[];
	new_metadata_revision: number;
	updated_at: string;
}
