import type {
	MangaCoverOption,
	PresetKind,
	TierBoardSettings,
	TierlistComparisonResponse,
	TierlistDetail,
	TierlistSummary,
	TierRowModel,
} from "../types/tierlist";
import client, { apiUrl } from "./client";

export interface CreateTierlistPayload {
	title: string;
	description?: string | null;
	category_tag?: string;
	preset?: PresetKind;
	auto_seed_by_rating?: boolean;
	is_default?: boolean;
	settings?: Partial<TierBoardSettings>;
	tiers?: TierRowModel[];
}

export interface UpdateTierlistPayload {
	title?: string;
	description?: string | null;
	category_tag?: string;
	is_default?: boolean;
	settings?: Partial<TierBoardSettings>;
	tiers?: TierRowModel[];
	expected_revision?: number;
}

/**
 * Fetch all tierlist summaries for a creator.
 */
export async function fetchCreatorTierlists(
	creatorName: string,
): Promise<TierlistSummary[]> {
	const res = await client.get<TierlistSummary[]>(
		`/api/creators/${encodeURIComponent(creatorName)}/tierlists`,
	);
	return res.data;
}

/**
 * Fetch a single tierlist's full hydrated detail.
 */
export async function fetchTierlistDetail(
	tierlistId: string,
): Promise<TierlistDetail> {
	const res = await client.get<TierlistDetail>(`/api/tierlists/${tierlistId}`);
	return res.data;
}

/**
 * Create a new tierlist board for a creator.
 */
export async function createCreatorTierlist(
	creatorName: string,
	payload: CreateTierlistPayload,
): Promise<TierlistDetail> {
	const res = await client.post<TierlistDetail>(
		`/api/creators/${encodeURIComponent(creatorName)}/tierlists`,
		payload,
	);
	return res.data;
}

/**
 * Update an existing tierlist with optimistic locking.
 */
export async function updateTierlist(
	tierlistId: string,
	payload: UpdateTierlistPayload,
): Promise<TierlistDetail> {
	const res = await client.put<TierlistDetail>(
		`/api/tierlists/${tierlistId}`,
		payload,
	);
	return res.data;
}

/**
 * Clone an existing tierlist.
 */
export async function cloneTierlist(
	tierlistId: string,
	newTitle: string,
	setAsDefault = false,
): Promise<TierlistDetail> {
	const res = await client.post<TierlistDetail>(
		`/api/tierlists/${tierlistId}/clone`,
		{
			new_title: newTitle,
			set_as_default: setAsDefault,
		},
	);
	return res.data;
}

/**
 * Trigger auto-seeding of items into tiers based on personal rating.
 */
export async function autoSeedTierlist(
	tierlistId: string,
): Promise<TierlistDetail> {
	const res = await client.post<TierlistDetail>(
		`/api/tierlists/${tierlistId}/auto-seed`,
	);
	return res.data;
}

/**
 * Delete a tierlist.
 */
export async function deleteTierlist(tierlistId: string): Promise<void> {
	await client.delete(`/api/tierlists/${tierlistId}`);
}

/**
 * Compare two tierlist versions of the same creator.
 */
export async function compareTierlists(
	creatorName: string,
	baseId: string,
	targetId: string,
): Promise<TierlistComparisonResponse> {
	const res = await client.get<TierlistComparisonResponse>(
		`/api/creators/${encodeURIComponent(creatorName)}/tierlists/compare`,
		{
			params: { base_id: baseId, target_id: targetId },
		},
	);
	return res.data;
}

/**
 * Fetch available cover art options (default + volume covers) for a manga.
 */
export async function fetchMangaCoverOptions(
	mangaId: string,
): Promise<MangaCoverOption[]> {
	const res = await client.get<MangaCoverOption[]>(
		`/api/tierlists/manga/${mangaId}/cover-options`,
	);
	return res.data;
}

/**
 * Construct URL for streaming cover image with same-origin header (CORS-safe for Canvas).
 */
export function getMangaCoverImageUrl(
	mangaId: string,
	minioKey?: string | null,
): string {
	const path = `/api/tierlists/manga/${mangaId}/cover-image`;
	if (minioKey) {
		return `${apiUrl(path)}?minio_key=${encodeURIComponent(minioKey)}`;
	}
	return apiUrl(path);
}
