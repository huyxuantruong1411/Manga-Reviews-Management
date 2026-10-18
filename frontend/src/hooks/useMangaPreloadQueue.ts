import { useEffect, useRef } from "react";
import type { PageItem } from "../types/chapter";

interface UseMangaPreloadQueueOptions {
	pages: PageItem[];
	currentPage: number;
	readingMode: "long_strip" | "single" | "double_rtl" | "double_ltr";
	maxConcurrent?: number;
	preloadWindow?: number;
}

/**
 * Intelligent progressive preloader hook for manga reading.
 * - Prioritizes current page target and adjacent pages.
 * - Preloads upcoming and previous pages into browser HTTP/memory cache non-blockingly.
 * - Controls concurrency to never saturate user bandwidth for active visible page.
 */
export function useMangaPreloadQueue({
	pages,
	currentPage,
	readingMode,
	maxConcurrent = 2,
	preloadWindow = 5,
}: UseMangaPreloadQueueOptions) {
	// Track successfully cached and currently loading URLs across renders
	const cachedUrlsRef = useRef<Set<string>>(new Set<string>());
	const activeLoadingRef = useRef<Set<string>>(new Set<string>());
	const cancelledRef = useRef<boolean>(false);

	useEffect(() => {
		cancelledRef.current = false;
		if (!pages.length || currentPage < 1) return;

		// Calculate candidate pages to preload based on reading direction
		const candidateIndexes: number[] = [];
		const total = pages.length;
		const currentIdx = Math.min(Math.max(1, currentPage), total) - 1;

		// 1. Next immediate pages (highest forward priority)
		const forwardStep =
			readingMode === "double_rtl" || readingMode === "double_ltr" ? 2 : 1;
		for (
			let i = currentIdx + 1;
			i < Math.min(total, currentIdx + 1 + preloadWindow * forwardStep);
			i++
		) {
			candidateIndexes.push(i);
		}

		// 2. Previous page (for quick back-tracking)
		if (currentIdx > 0) {
			candidateIndexes.push(currentIdx - 1);
			if (
				(readingMode === "double_rtl" || readingMode === "double_ltr") &&
				currentIdx - 2 >= 0
			) {
				candidateIndexes.push(currentIdx - 2);
			}
		}

		// Extract valid URLs that haven't been cached or currently loading
		const queue = candidateIndexes
			.map((idx) => pages[idx]?.url)
			.filter(
				(url): url is string =>
					Boolean(url) &&
					!cachedUrlsRef.current.has(url!) &&
					!activeLoadingRef.current.has(url!),
			);

		let queueIndex = 0;

		const loadNextInQueue = () => {
			if (cancelledRef.current) return;
			while (
				activeLoadingRef.current.size < maxConcurrent &&
				queueIndex < queue.length
			) {
				const nextUrl = queue[queueIndex++];
				if (!nextUrl || activeLoadingRef.current.has(nextUrl)) continue;

				activeLoadingRef.current.add(nextUrl);
				const img = new Image();
				img.decoding = "async";

				const onComplete = () => {
					activeLoadingRef.current.delete(nextUrl);
					cachedUrlsRef.current.add(nextUrl);
					if (!cancelledRef.current) {
						loadNextInQueue();
					}
				};

				img.onload = onComplete;
				img.onerror = onComplete;
				img.src = nextUrl;
			}
		};

		// Start queue execution asynchronously
		loadNextInQueue();

		return () => {
			cancelledRef.current = true;
		};
	}, [pages, currentPage, readingMode, maxConcurrent, preloadWindow]);
}
