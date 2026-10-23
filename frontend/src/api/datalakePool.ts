import type {
	PoolCandidateItem,
	PoolChapterItem,
	PoolDuplicateGroup,
	PoolIntegrityReport,
	PoolMangaItem,
	PoolStatsResponse,
	PublishToPoolRequest,
	PublishToPoolResponse,
} from "../types/datalakePool";
import client from "./client";

export const getPoolStats = async (): Promise<PoolStatsResponse> => {
	const res = await client.get("/api/datalake-pool/stats");
	return res.data;
};

export const listPoolCandidates = async (params: {
	search?: string;
	page?: number;
	page_size?: number;
	has_pages_only?: boolean;
	not_in_pool_only?: boolean;
}): Promise<{
	items: PoolCandidateItem[];
	total: number;
	page: number;
	page_size: number;
}> => {
	const res = await client.get("/api/datalake-pool/candidates", { params });
	return res.data;
};

export const publishToPool = async (
	data: PublishToPoolRequest,
): Promise<PublishToPoolResponse> => {
	const res = await client.post("/api/datalake-pool/publish", data);
	return res.data;
};

export const listPoolMangas = async (params: {
	search?: string;
	pool_state?: string;
	is_etl_ready?: boolean;
	language?: string;
	page?: number;
	page_size?: number;
	sort_by?: string;
	sort_order?: number;
}): Promise<{
	items: PoolMangaItem[];
	total: number;
	page: number;
	page_size: number;
}> => {
	const res = await client.get("/api/datalake-pool/mangas", { params });
	return res.data;
};

export const getPoolMangaDetail = async (
	poolMangaId: string,
): Promise<PoolMangaItem> => {
	const res = await client.get(`/api/datalake-pool/mangas/${poolMangaId}`);
	return res.data;
};

export const updatePoolManga = async (
	poolMangaId: string,
	data: Partial<PoolMangaItem>,
): Promise<PoolMangaItem> => {
	const res = await client.patch(
		`/api/datalake-pool/mangas/${poolMangaId}`,
		data,
	);
	return res.data;
};

export const syncPoolManga = async (
	poolMangaId: string,
): Promise<PoolMangaItem> => {
	const res = await client.post(
		`/api/datalake-pool/mangas/${poolMangaId}/sync`,
	);
	return res.data;
};

export const removeMangaFromPool = async (
	poolMangaId: string,
): Promise<void> => {
	await client.delete(`/api/datalake-pool/mangas/${poolMangaId}`);
};

export const getPoolMangaChapters = async (
	poolMangaId: string,
	language?: string,
): Promise<PoolChapterItem[]> => {
	const res = await client.get(
		`/api/datalake-pool/mangas/${poolMangaId}/chapters`,
		{
			params: { language },
		},
	);
	return res.data;
};

export const getPoolChapterDetail = async (
	poolChapterId: string,
): Promise<PoolChapterItem> => {
	const res = await client.get(`/api/datalake-pool/chapters/${poolChapterId}`);
	return res.data;
};

export const updatePoolChapter = async (
	poolChapterId: string,
	data: Partial<PoolChapterItem>,
): Promise<PoolChapterItem> => {
	const res = await client.patch(
		`/api/datalake-pool/chapters/${poolChapterId}`,
		data,
	);
	return res.data;
};

export const batchUpdatePoolChapters = async (
	poolMangaId: string,
	data: {
		pool_chapter_ids: string[];
		volume?: string;
		scanlation_group?: string;
		language?: string;
		renumber_start?: number;
		renumber_step?: number;
	},
): Promise<{ updated_count: number }> => {
	const res = await client.post(
		`/api/datalake-pool/mangas/${poolMangaId}/chapters/batch-metadata`,
		data,
	);
	return res.data;
};

export const deletePoolChapter = async (
	poolChapterId: string,
): Promise<void> => {
	await client.delete(`/api/datalake-pool/chapters/${poolChapterId}`);
};

export const deletePoolChapterPages = async (
	poolChapterId: string,
	pageNumbers: number[],
): Promise<PoolChapterItem> => {
	const res = await client.post(
		`/api/datalake-pool/chapters/${poolChapterId}/delete-pages`,
		{ page_numbers: pageNumbers },
	);
	return res.data;
};

export const scanPoolDuplicates = async (
	poolMangaId: string,
	poolChapterId?: string,
): Promise<PoolDuplicateGroup[]> => {
	const res = await client.get(
		`/api/datalake-pool/mangas/${poolMangaId}/duplicates`,
		{
			params: { pool_chapter_id: poolChapterId },
		},
	);
	return res.data;
};

export const cleanupPoolDuplicates = async (
	poolMangaId: string,
	targets: Array<{
		pool_chapter_id: string;
		page_number: number;
		page_uid?: string;
	}>,
): Promise<{
	success: boolean;
	modified_chapters: number;
	removed_pages_count: number;
}> => {
	const res = await client.post(
		`/api/datalake-pool/mangas/${poolMangaId}/duplicates/cleanup`,
		{ targets },
	);
	return res.data;
};

export const verifyPoolMangaIntegrity = async (
	poolMangaId: string,
): Promise<PoolIntegrityReport> => {
	const res = await client.get(
		`/api/datalake-pool/mangas/${poolMangaId}/verify`,
	);
	return res.data;
};

export const exportEtlManifest = async (
	poolMangaId: string,
): Promise<Record<string, unknown>> => {
	const res = await client.get(
		`/api/datalake-pool/mangas/${poolMangaId}/etl-manifest`,
	);
	return res.data;
};
