import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage } from "../api/client";
import {
	type PageBinding,
	type TranslationJob,
	type TranslationProfile,
	translationApi,
} from "../api/translation";
import type { PageItem } from "../types/chapter";

export type TranslationDisplayMode = "original" | "translated" | "compare";

export interface UseTranslationOptions {
	chapterId?: string;
	mangaId?: string;
	pages: PageItem[];
	initialLanguage?: string;
}

export function useTranslation({
	chapterId,
	mangaId,
	pages,
	initialLanguage = "vi",
}: UseTranslationOptions) {
	const [targetLanguage, setTargetLanguage] = useState<string>(initialLanguage);
	const [displayMode, setDisplayMode] =
		useState<TranslationDisplayMode>("original");
	const [compareSplit, setCompareSplit] = useState<number>(50); // 0 to 100%
	const [profiles, setProfiles] = useState<TranslationProfile[]>([]);
	const [selectedProfileId, setSelectedProfileId] = useState<string>("");
	const [bindings, setBindings] = useState<Record<string, PageBinding>>({});
	const [loadingBindings, setLoadingBindings] = useState<boolean>(false);
	const [activeJob, setActiveJob] = useState<TranslationJob | null>(null);
	const [jobProgress, setJobProgress] = useState<{
		completed: number;
		total: number;
	}>({ completed: 0, total: 0 });
	const [isTranslating, setIsTranslating] = useState<boolean>(false);
	const [errorMessage, setErrorMessage] = useState<string>("");

	const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Load profiles
	useEffect(() => {
		translationApi
			.listProfiles()
			.then((data) => {
				setProfiles(data);
				const defaultProf = data.find((p) => p.is_default) || data[0];
				if (defaultProf) setSelectedProfileId(defaultProf.profile_id);
			})
			.catch((err) =>
				console.error("Error loading translation profiles:", err),
			);
	}, []);

	// Load chapter bindings when chapter or targetLanguage changes
	const fetchBindings = useCallback(async () => {
		if (!chapterId) return;
		setLoadingBindings(true);
		try {
			const res = await translationApi.getChapterBindings(
				chapterId,
				targetLanguage,
			);
			setBindings(res.bindings || {});
		} catch (err) {
			console.error("Error fetching translation bindings:", err);
		} finally {
			setLoadingBindings(false);
		}
	}, [chapterId, targetLanguage]);

	useEffect(() => {
		void fetchBindings();
	}, [fetchBindings]);

	// Polling worker for active job
	const startPollingJob = useCallback(
		(jobId: string) => {
			if (pollTimerRef.current) clearInterval(pollTimerRef.current);
			setIsTranslating(true);

			pollTimerRef.current = setInterval(async () => {
				try {
					const job = await translationApi.getJobStatus(jobId);
					setActiveJob(job);
					setJobProgress({
						completed: job.completed_pages || 0,
						total: job.total_pages || 1,
					});

					if (
						["completed", "partial", "failed", "cancelled"].includes(job.state)
					) {
						if (pollTimerRef.current) clearInterval(pollTimerRef.current);
						setIsTranslating(false);
						void fetchBindings();
						if (job.state === "completed" || job.completed_pages > 0) {
							setDisplayMode("translated");
						}
					}
				} catch (err) {
					console.error("Error polling job status:", err);
					if (pollTimerRef.current) clearInterval(pollTimerRef.current);
					setIsTranslating(false);
				}
			}, 1500);
		},
		[fetchBindings],
	);

	useEffect(() => {
		return () => {
			if (pollTimerRef.current) clearInterval(pollTimerRef.current);
		};
	}, []);

	// Trigger translation for a single page
	const translatePage = useCallback(
		async (pageUid: string) => {
			if (!chapterId || !mangaId) return;
			setErrorMessage("");
			try {
				const res = await translationApi.createJob({
					source: {
						kind: "chapter_pages",
						manga_id: mangaId,
						chapter_id: chapterId,
						page_uids: [pageUid],
					},
					profile_id: selectedProfileId || undefined,
					target_language: targetLanguage,
					reuse_policy: "regenerate",
				});
				startPollingJob(res.job_id);
			} catch (err: unknown) {
				setErrorMessage(
					apiErrorMessage(err, "Không thể khởi động dịch trang."),
				);
			}
		},
		[chapterId, mangaId, selectedProfileId, targetLanguage, startPollingJob],
	);

	// Trigger translation for the whole chapter
	const translateChapter = useCallback(async () => {
		if (!chapterId || !mangaId || pages.length === 0) return;
		setErrorMessage("");
		const pageUids = pages.map((p) => p.page_uid).filter(Boolean) as string[];
		try {
			const res = await translationApi.createJob({
				source: {
					kind: "chapter_pages",
					manga_id: mangaId,
					chapter_id: chapterId,
					page_uids: pageUids,
				},
				profile_id: selectedProfileId || undefined,
				target_language: targetLanguage,
				reuse_policy: "regenerate",
			});
			startPollingJob(res.job_id);
		} catch (err: unknown) {
			setErrorMessage(
				apiErrorMessage(err, "Không thể khởi động dịch chapter."),
			);
		}
	}, [
		chapterId,
		mangaId,
		pages,
		selectedProfileId,
		targetLanguage,
		startPollingJob,
	]);

	// Helper to resolve display image for a page
	const getPageImageSource = useCallback(
		(page: PageItem) => {
			const binding = page.page_uid ? bindings[page.page_uid] : undefined;
			const hasTranslation = Boolean(binding?.url);

			if (displayMode === "translated" && hasTranslation && binding?.url) {
				return {
					url: binding.url,
					isTranslated: true,
					hasTranslation: true,
					binding,
				};
			}

			return {
				url: page.url || "",
				isTranslated: false,
				hasTranslation,
				binding,
			};
		},
		[bindings, displayMode],
	);

	return {
		targetLanguage,
		setTargetLanguage,
		displayMode,
		setDisplayMode,
		compareSplit,
		setCompareSplit,
		profiles,
		selectedProfileId,
		setSelectedProfileId,
		bindings,
		loadingBindings,
		activeJob,
		jobProgress,
		isTranslating,
		errorMessage,
		translatePage,
		translateChapter,
		getPageImageSource,
		refetchBindings: fetchBindings,
	};
}
