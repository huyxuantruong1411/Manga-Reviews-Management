import client from "./client";

interface ReadingProgressWrite {
	chapter_id: string;
	chapter_number: string;
	page: number;
	reading_mode: string;
	fit_mode: string;
	language?: string;
	mark_as_read: boolean;
}

// Survives reader remounts in this tab. Later writes wait for earlier requests.
const pendingWrites = new Map<string, Promise<void>>();

export function saveReadingProgress(
	mangaId: string,
	payload: ReadingProgressWrite,
): Promise<void> {
	const previous = pendingWrites.get(mangaId) || Promise.resolve();
	const write = previous
		.catch(() => undefined)
		.then(async () => {
			await client.post(`/api/manga/${mangaId}/reading-progress`, payload);
		});
	pendingWrites.set(mangaId, write);
	const cleanup = () => {
		if (pendingWrites.get(mangaId) === write) pendingWrites.delete(mangaId);
	};
	void write.then(cleanup, cleanup);
	return write;
}
