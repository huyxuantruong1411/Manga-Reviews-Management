import client from "./client";

export interface TranslationProfile {
	profile_id: string;
	name: string;
	target_language: string;
	source_language: string;
	scope: string;
	is_default: boolean;
	description?: string;
	active_revision: number;
	config_hash: string;
	effective_config: Record<string, any>;
	created_at: string;
	updated_at: string;
}

export interface TranslationProvider {
	provider_id: string;
	name: string;
	kind: "gemini" | "openai_compatible" | "offline_stub";
	model_id: string;
	is_active: boolean;
	capabilities: Record<string, any>;
	capability_probe?: {
		configured: boolean;
		status: string;
		message: string;
	};
}

export interface TranslationFontPack {
	font_pack_id: string;
	name: string;
	scope: string;
	variants: Array<{ style: string; filename: string; object_key?: string }>;
	vietnamese_coverage: boolean;
	missing_glyphs: string[];
	license_note?: string;
	state: "available" | "archived" | "rejected";
	created_at: string;
}

export interface TranslationJobPage {
	job_id: string;
	page_identity: string;
	ordinal: number;
	source_sha256?: string;
	state:
		| "queued"
		| "preparing"
		| "running"
		| "committing"
		| "completed"
		| "failed"
		| "cancelled"
		| "skipped";
	stage?: string;
	attempt: number;
	result_id?: string;
	error_code?: string;
	error_message?: string;
}

export interface TranslationJob {
	job_id: string;
	scope: string;
	operation_kind: "translate" | "clean_only" | "upscale";
	state:
		| "queued"
		| "running"
		| "completed"
		| "partial"
		| "failed"
		| "cancelled";
	cancel_requested: boolean;
	total_pages: number;
	completed_pages: number;
	failed_pages: number;
	source_manifest: Record<string, any>;
	profile_snapshot: Record<string, any>;
	created_at: string;
	updated_at: string;
}

export interface RegionData {
	region_id: string;
	bounding_box: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	reading_order: number;
	source_text: string;
	translated_text: string;
	confidence?: number;
	quality_warning?: string;
}

export interface TranslationResult {
	result_id: string;
	scope?: string;
	fingerprint?: string;
	source_sha256?: string;
	chapter_id?: string;
	page_uid?: string;
	target_language: string;
	active_revision: number;
	output_object_key: string;
	clean_object_key?: string;
	width?: number;
	height?: number;
	regions: RegionData[];
	url?: string;
	clean_url?: string;
	created_at?: string;
}

export interface PageBinding {
	binding_id: string;
	page_uid: string;
	result_id: string;
	target_language: string;
	chosen_revision: number;
	output_object_key?: string;
	url?: string;
	clean_url?: string;
	width?: number;
	height?: number;
}

export interface ChapterBindingsResponse {
	chapter_id: string;
	target_language: string;
	total_bindings: number;
	bindings: Record<string, PageBinding>;
}

export interface StorageUsage {
	total_assets: number;
	total_bytes: number;
	by_kind: Record<string, number>;
	by_kind_count: Record<string, number>;
}

export const translationApi = {
	// Capabilities
	getCapabilities: async () => {
		const res = await client.get("/api/translation/capabilities");
		return res.data;
	},

	// Profiles
	listProfiles: async (): Promise<TranslationProfile[]> => {
		const res = await client.get<TranslationProfile[]>(
			"/api/translation/profiles",
		);
		return res.data;
	},
	createProfile: async (
		data: Partial<TranslationProfile>,
	): Promise<TranslationProfile> => {
		const res = await client.post<TranslationProfile>(
			"/api/translation/profiles",
			data,
		);
		return res.data;
	},
	getProfile: async (profileId: string): Promise<TranslationProfile> => {
		const res = await client.get<TranslationProfile>(
			`/api/translation/profiles/${profileId}`,
		);
		return res.data;
	},
	updateProfile: async (
		profileId: string,
		data: Partial<TranslationProfile>,
		expectedRevision?: number,
	): Promise<TranslationProfile> => {
		const params = expectedRevision
			? { expected_revision: expectedRevision }
			: {};
		const res = await client.put<TranslationProfile>(
			`/api/translation/profiles/${profileId}`,
			data,
			{ params },
		);
		return res.data;
	},
	diffRevisions: async (profileId: string, rev1: number, rev2: number) => {
		const res = await client.get(
			`/api/translation/profiles/${profileId}/diff`,
			{
				params: { rev1, rev2 },
			},
		);
		return res.data;
	},
	exportProfile: async (profileId: string): Promise<TranslationProfile> => {
		const res = await client.get<TranslationProfile>(
			`/api/translation/profiles/${profileId}/export`,
		);
		return res.data;
	},

	// Providers
	listProviders: async (): Promise<TranslationProvider[]> => {
		const res = await client.get<TranslationProvider[]>(
			"/api/translation/providers",
		);
		return res.data;
	},

	// Fonts
	listFonts: async (): Promise<TranslationFontPack[]> => {
		const res = await client.get<TranslationFontPack[]>(
			"/api/translation/fonts",
		);
		return res.data;
	},
	uploadFont: async (formData: FormData): Promise<TranslationFontPack> => {
		const res = await client.post<TranslationFontPack>(
			"/api/translation/fonts",
			formData,
			{
				headers: { "Content-Type": "multipart/form-data" },
			},
		);
		return res.data;
	},

	// Storage & Assets
	getStorageUsage: async (): Promise<StorageUsage> => {
		const res = await client.get<StorageUsage>("/api/translation/assets/usage");
		return res.data;
	},
	previewOrRunCleanup: async (dryRun = true) => {
		const res = await client.post("/api/translation/assets/cleanup", null, {
			params: { dry_run: dryRun },
		});
		return res.data;
	},
	uploadDemoAsset: async (formData: FormData) => {
		const res = await client.post(
			"/api/translation/assets/upload-demo",
			formData,
			{
				headers: { "Content-Type": "multipart/form-data" },
			},
		);
		return res.data;
	},
	resolveAssetUrl: async (key: string) => {
		const res = await client.get<{ object_key: string; url: string }>(
			"/api/translation/assets/resolve-url",
			{
				params: { key },
			},
		);
		return res.data.url;
	},

	// Jobs
	listJobs: async (limit = 20): Promise<TranslationJob[]> => {
		const res = await client.get<TranslationJob[]>("/api/translation/jobs", {
			params: { limit },
		});
		return res.data;
	},
	createJob: async (
		payload: any,
	): Promise<{ job_id: string; total_pages: number; state: string }> => {
		const res = await client.post("/api/translation/jobs", payload);
		return res.data;
	},
	getJobStatus: async (jobId: string): Promise<TranslationJob> => {
		const res = await client.get<TranslationJob>(
			`/api/translation/jobs/${jobId}`,
		);
		return res.data;
	},
	getJobPages: async (jobId: string): Promise<TranslationJobPage[]> => {
		const res = await client.get<TranslationJobPage[]>(
			`/api/translation/jobs/${jobId}/pages`,
		);
		return res.data;
	},
	cancelJob: async (jobId: string) => {
		const res = await client.post(`/api/translation/jobs/${jobId}/cancel`);
		return res.data;
	},
	retryJob: async (jobId: string) => {
		const res = await client.post(`/api/translation/jobs/${jobId}/retry`);
		return res.data;
	},

	// Bindings & Results
	getChapterBindings: async (
		chapterId: string,
		targetLanguage = "vi",
	): Promise<ChapterBindingsResponse> => {
		const res = await client.get<ChapterBindingsResponse>(
			`/api/translation/bindings/${chapterId}`,
			{
				params: { target_language: targetLanguage },
			},
		);
		return res.data;
	},
	getTranslationResult: async (resultId: string) => {
		const res = await client.get(`/api/translation/results/${resultId}`);
		return res.data;
	},
	updateResultRegions: async (
		resultId: string,
		regions: RegionData[],
		expectedRevision: number,
	) => {
		const res = await client.post(
			`/api/translation/results/${resultId}/regions`,
			{
				regions,
				expected_revision: expectedRevision,
			},
		);
		return res.data;
	},
	rerenderResult: async (resultId: string) => {
		const res = await client.post(
			`/api/translation/results/${resultId}/rerender`,
		);
		return res.data;
	},
	publishResult: async (
		resultId: string,
		chapterId: string,
		pageUid: string,
		revision?: number,
	) => {
		const res = await client.post(
			`/api/translation/results/${resultId}/publish`,
			{
				chapter_id: chapterId,
				page_uid: pageUid,
				revision,
			},
		);
		return res.data;
	},
	getChapterExportUrl: (chapterId: string, targetLanguage = "vi"): string => {
		return `/api/translation/export/${chapterId}?target_language=${targetLanguage}`;
	},
	exportChapterZip: async (
		chapterId: string,
		targetLanguage = "vi",
	): Promise<Blob> => {
		const res = await client.get(`/api/translation/export/${chapterId}`, {
			params: { target_language: targetLanguage },
			responseType: "blob",
		});
		return res.data;
	},
};
