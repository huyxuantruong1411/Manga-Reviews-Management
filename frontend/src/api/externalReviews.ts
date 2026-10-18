import type {
	ExternalReviewListResponse,
	ExternalReviewSyncProgress,
	TriggerExternalReviewSyncRequest,
} from "../types/externalReview";
import { apiUrl, client } from "./client";

export interface ListExternalReviewsParams {
	source?: string;
	recommendation_status?: string;
	include_spoilers?: boolean;
	only_spoilers?: boolean;
	only_preliminary?: boolean;
	search?: string;
	sort_by?: string;
	skip?: number;
	limit?: number;
}

export const fetchExternalReviews = async (
	mangaId: string,
	params?: ListExternalReviewsParams,
): Promise<ExternalReviewListResponse> => {
	const response = await client.get<ExternalReviewListResponse>(
		`/api/manga/${mangaId}/external-reviews`,
		{ params },
	);
	return response.data;
};

export const triggerExternalReviewSync = async (
	mangaId: string,
	request: TriggerExternalReviewSyncRequest = {},
): Promise<ExternalReviewSyncProgress> => {
	const response = await client.post<ExternalReviewSyncProgress>(
		`/api/manga/${mangaId}/external-reviews/sync`,
		request,
	);
	return response.data;
};

export const fetchSyncStatus = async (
	mangaId: string,
): Promise<ExternalReviewSyncProgress> => {
	const response = await client.get<ExternalReviewSyncProgress>(
		`/api/manga/${mangaId}/external-reviews/sync-status`,
	);
	return response.data;
};

export const cancelExternalReviewSync = async (
	mangaId: string,
): Promise<{ status: string; message: string }> => {
	const response = await client.post<{ status: string; message: string }>(
		`/api/manga/${mangaId}/external-reviews/sync/cancel`,
	);
	return response.data;
};

export const deleteExternalReview = async (
	mangaId: string,
	reviewId: string,
): Promise<void> => {
	await client.delete(`/api/manga/${mangaId}/external-reviews/${reviewId}`);
};

export const clearMangaExternalReviews = async (
	mangaId: string,
	source?: string,
): Promise<{ message: string; deleted_count: number }> => {
	const response = await client.delete<{
		message: string;
		deleted_count: number;
	}>(`/api/manga/${mangaId}/external-reviews`, {
		params: source ? { source } : undefined,
	});
	return response.data;
};

/**
 * Establish a Server-Sent Events (SSE) connection to stream real-time sync progress.
 * Returns an unbind/close function for React useEffect cleanup.
 */
export const subscribeToSyncProgress = (
	mangaId: string,
	onProgress: (progress: ExternalReviewSyncProgress) => void,
	onError?: (error: Event) => void,
): (() => void) => {
	const streamUrl = apiUrl(
		`/api/manga/${mangaId}/external-reviews/sync-stream`,
	);
	const es = new EventSource(streamUrl);

	es.onmessage = (event) => {
		try {
			if (event.data && event.data.trim()) {
				const data = JSON.parse(event.data) as ExternalReviewSyncProgress;
				onProgress(data);
			}
		} catch (err) {
			console.error(
				"Failed to parse SSE external review progress payload:",
				err,
			);
		}
	};

	es.onerror = (err) => {
		if (onError) {
			onError(err);
		}
	};

	return () => {
		es.close();
	};
};
