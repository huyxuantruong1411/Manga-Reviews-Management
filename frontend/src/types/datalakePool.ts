export interface PoolMediaPointer {
	minio_bucket: string;
	object_key: string;
	url?: string | null;
}

export interface PoolPageItem {
	page_uid: string;
	page_number: number;
	filename: string;
	minio_bucket: string;
	object_key: string;
	file_size: number;
	width?: number | null;
	height?: number | null;
	md5_hash?: string | null;
	sha256?: string | null;
	content_type?: string | null;
	url?: string | null;
	included: boolean;
	duplicate_of_page_number?: number | null;
}

export interface PoolTagEmbedded {
	source_tag_id?: string | null;
	mangadex_id?: string | null;
	name: Record<string, string>;
	group?: string | null;
	color?: string | null;
}

export interface PoolCreatorEmbedded {
	creator_id: string;
	slug?: string;
	source_creator_id?: string | null;
	name: string;
	role: string;
	mangadex_id?: string | null;
	biography: Record<string, string>;
	links: Record<string, string>;
}

export interface PoolCreatorCatalogItem {
	creator_id: string;
	slug: string;
	name: string;
	mangadex_id?: string | null;
	source_creator_id?: string | null;
	roles: string[];
	biography: Record<string, string>;
	links: Record<string, string>;
	manga_count: number;
	pool_manga_ids: string[];
	sample_mangas: Array<{
		pool_manga_id: string;
		title: string;
		slug: string;
	}>;
	updated_at?: string | null;
}

export interface PoolCreatorListResponse {
	items: PoolCreatorCatalogItem[];
	total: number;
	page: number;
	page_size: number;
}

export interface PoolCreatorDetailResponse {
	creator: PoolCreatorCatalogItem;
	mangas: PoolMangaItem[];
}

export interface PoolCoverArtEmbedded {
	cover_id?: string | null;
	volume?: string | null;
	locale?: string | null;
	description?: string | null;
	minio_bucket: string;
	object_key: string;
	url?: string | null;
	included: boolean;
}

export interface PoolMangaStats {
	total_chapters: number;
	total_pages: number;
	total_size_bytes: number;
	available_languages: string[];
}

export interface PoolLineageInfo {
	source_metadata_revision: number;
	pool_revision: number;
	manifest_sha256: string;
	published_at: string;
	last_synced_from_source_at: string;
	updated_at: string;
	has_upstream_changes: boolean;
}

export interface PoolMangaItem {
	_id?: string;
	pool_manga_id: string;
	source_manga_id: string;
	mangadex_id?: string | null;
	slug: string;
	title: string;
	alt_titles: string[];
	description?: string | null;
	author?: string | null;
	artist?: string | null;
	creators: PoolCreatorEmbedded[];
	year?: string | null;
	status?: string | null;
	content_rating?: string | null;
	publication_demographic?: string | null;
	original_language?: string | null;
	published_start_date?: string | null;
	published_end_date?: string | null;
	volumes?: number | null;
	chapters?: number | null;
	tags: PoolTagEmbedded[];
	links: Array<{ title: string; url: string }>;
	tracker_metadata?: Record<string, unknown> | null;
	primary_cover?: PoolMediaPointer | null;
	cover_arts: PoolCoverArtEmbedded[];
	pool_state: "published" | "draft" | "archived";
	is_etl_ready: boolean;
	stats: PoolMangaStats;
	lineage: PoolLineageInfo;
}

export interface PoolChapterItem {
	_id?: string;
	pool_chapter_id: string;
	pool_manga_id: string;
	source_manga_id: string;
	source_chapter_id: string;
	chapter_number: string;
	chapter_numeric: number;
	volume?: string | null;
	title?: string | null;
	language: string;
	scanlation_group?: string | null;
	uploader?: string | null;
	publish_at?: string | null;
	source: string;
	source_id?: string | null;
	pages: PoolPageItem[];
	page_count: number;
	total_size_bytes: number;
	pages_revision: number;
	manifest_sha256: string;
	included: boolean;
	created_at: string;
	updated_at: string;
}

export interface PoolCandidateItem {
	source_manga_id: string;
	title: string;
	cover_url?: string | null;
	author?: string | null;
	status?: string | null;
	ready_chapters_count: number;
	total_pages_count: number;
	available_languages: string[];
	is_eligible: boolean;
	eligibility_reason?: string | null;
	already_in_pool: boolean;
	pool_manga_id?: string | null;
	needs_sync: boolean;
}

export interface PoolStatsResponse {
	total_mangas: number;
	total_etl_ready: number;
	total_creators?: number;
	total_chapters: number;
	total_pages: number;
	total_size_bytes: number;
	saved_storage_bytes: number;
}

export interface PublishToPoolRequest {
	source_manga_ids: string[];
	languages?: string[] | null;
	auto_deduplicate_pages?: boolean;
	mark_etl_ready?: boolean;
}

export interface PublishItemResult {
	source_manga_id: string;
	pool_manga_id?: string | null;
	success: boolean;
	title: string;
	chapters_count: number;
	pages_count: number;
	error?: string | null;
}

export interface PublishToPoolResponse {
	success_count: number;
	error_count: number;
	results: PublishItemResult[];
}

export interface PoolDuplicateItem {
	pool_chapter_id: string;
	chapter_number: string;
	chapter_title?: string | null;
	page_number: number;
	page_uid: string;
	filename: string;
	object_key: string;
	file_size: number;
	url?: string | null;
}

export interface PoolDuplicateGroup {
	hash_type: string;
	hash_value: string;
	file_size: number;
	items: PoolDuplicateItem[];
}

export interface PoolIntegrityReport {
	pool_manga_id: string;
	is_healthy: boolean;
	total_checked: number;
	missing_keys: string[];
	checked_at: string;
}

export interface NgrokTunnelInfo {
	name: string;
	proto: string;
	public_url: string;
	addr: string;
}

export interface ConnectorPoolSummary {
	ready_mangas: number;
	ready_chapters: number;
	ready_pages: number;
	total_size_bytes: number;
}

export interface ConnectorStatusResponse {
	connector_enabled: boolean;
	source_system: string;
	contract_name: string;
	contract_version: string;
	schema_id: string;
	dedicated_port: number;
	api_key_configured: boolean;
	webhook_secret_configured: boolean;
	tunnel_path_guard_enabled: boolean;
	allow_unauthenticated_local: boolean;
	configured_public_base_url?: string | null;
	active_public_base_url?: string | null;
	ngrok_active: boolean;
	ngrok_tunnels: NgrokTunnelInfo[];
	pool_stats: ConnectorPoolSummary;
	active_subscriptions_count: number;
	total_events_count: number;
	failed_deliveries_count: number;
	endpoints: Record<string, string>;
}

export interface CdcSubscriptionItem {
	provider_subscription_key: string;
	pool_manga_id: string;
	consumer_id: string;
	callback_url: string;
	events: string[];
	status: "ACTIVE" | "PAUSED" | "CANCELLED" | "FAILED";
	signing_algorithm: string;
	signature_header: string;
	has_custom_secret: boolean;
	subscribed_at: string;
	unsubscribed_at?: string | null;
	last_event_at?: string | null;
	updated_at: string;
}

export interface CdcEventItem {
	eventId: string;
	eventType: string;
	occurredAt: string;
	contractName: string;
	contractVersion: string;
	poolMangaId: string;
	poolChapterId?: string | null;
	poolRevision: number;
	payloadSha256: string;
	payload: Record<string, unknown>;
}

export interface CdcDeliveryItem {
	delivery_id: string;
	event_id: string;
	event_type: string;
	subscription_key: string;
	pool_manga_id: string;
	callback_url: string;
	status: "PENDING" | "DELIVERED" | "FAILED";
	attempt_count: number;
	response_status?: number | null;
	last_error?: string | null;
	created_at: string;
	delivered_at?: string | null;
	updated_at: string;
}
