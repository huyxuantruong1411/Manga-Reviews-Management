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
	const [engineReady, setEngineReady] = useState(false);
	const [engineMessage, setEngineMessage] = useState(
		"Đang kiểm tra khả năng dịch...",
	);

	useEffect(() => {
		let cancelled = false;
		translationApi
			.getCapabilities()
			.then((capabilities) => {
				if (cancelled) return;
				setEngineReady(
					capabilities.ready_for_inference === true &&
						capabilities.engine?.status === "ready",
				);
				setEngineMessage(
					capabilities.engine?.message ||
						"Chưa xác minh được engine dịch thực.",
				);
			})
			.catch(() => {
				if (!cancelled)
					setEngineMessage(
						"Không kiểm tra được engine dịch. Hãy tải lại trang để thử lại.",
					);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const scopeGeneration = useRef(0);
	const bindingRequest = useRef(0);
	const pollingGeneration = useRef(0);

	// Invalidate requests on chapter/language changes, including A -> B -> A.
	useEffect(() => {
		scopeGeneration.current++;
		bindingRequest.current++;
		pollingGeneration.current++;
		if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
		setBindings({});
		setActiveJob(null);
		setIsTranslating(false);
		setJobProgress({ completed: 0, total: 0 });
		setErrorMessage("");
		setDisplayMode("original");
		return () => {
			scopeGeneration.current++;
			bindingRequest.current++;
			pollingGeneration.current++;
			if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
		};
	}, [chapterId, mangaId, targetLanguage]);

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
		const generation = scopeGeneration.current;
		const request = ++bindingRequest.current;
		const current = () =>
			generation === scopeGeneration.current &&
			request === bindingRequest.current;
		setLoadingBindings(true);
		try {
			const res = await translationApi.getChapterBindings(
				chapterId,
				targetLanguage,
			);
			if (current()) setBindings(res.bindings || {});
		} catch (err) {
			if (current())
				setErrorMessage(
					apiErrorMessage(err, "Không tải được bản dịch. Hãy thử tải lại."),
				);
		} finally {
			if (current()) setLoadingBindings(false);
		}
	}, [chapterId, targetLanguage]);

	useEffect(() => {
		void fetchBindings();
	}, [fetchBindings]);

	// Schedule only after a response settles, so slow requests cannot overlap.
	const startPollingJob = useCallback(
		(jobId: string) => {
			if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
			const scope = scopeGeneration.current;
			const pollId = ++pollingGeneration.current;
			const current = () =>
				scope === scopeGeneration.current &&
				pollId === pollingGeneration.current;
			setIsTranslating(true);
			const poll = async () => {
				try {
					const job = await translationApi.getJobStatus(jobId);
					if (!current()) return;
					setActiveJob(job);
					setJobProgress({
						completed: job.completed_pages || 0,
						total: job.total_pages || 1,
					});
					if (
						["completed", "partial", "failed", "cancelled"].includes(job.state)
					) {
						setIsTranslating(false);
						void fetchBindings();
						if (job.completed_pages > 0) setDisplayMode("translated");
						return;
					}
					pollTimerRef.current = setTimeout(poll, 1500);
				} catch (err) {
					if (!current()) return;
					setIsTranslating(false);
					setErrorMessage(
						apiErrorMessage(
							err,
							"Không tải được trạng thái dịch. Job vẫn có thể đang chạy.",
						),
					);
				}
			};
			pollTimerRef.current = setTimeout(poll, 1500);
		},
		[fetchBindings],
	);

	// Trigger translation for a single page
	const translatePage = useCallback(
		async (pageUid?: string, pageNumber?: number) => {
			if (!engineReady) {
				setErrorMessage(engineMessage);
				return;
			}
			if (!chapterId || !mangaId) return;
			const generation = scopeGeneration.current;
			setErrorMessage("");
			setIsTranslating(true);
			try {
				const res = await translationApi.createJob({
					source: {
						kind: "chapter_pages",
						manga_id: mangaId,
						chapter_id: chapterId,
						page_uids: pageUid ? [pageUid] : [],
						page_numbers:
							!pageUid && pageNumber !== undefined ? [pageNumber] : undefined,
					},
					profile_id: selectedProfileId || undefined,
					target_language: targetLanguage,
					reuse_policy: "reuse_existing",
				});
				if (generation === scopeGeneration.current) startPollingJob(res.job_id);
			} catch (err: unknown) {
				if (generation !== scopeGeneration.current) return;
				setIsTranslating(false);
				setErrorMessage(
					apiErrorMessage(err, "Không thể khởi động dịch trang."),
				);
			}
		},
		[
			chapterId,
			mangaId,
			selectedProfileId,
			targetLanguage,
			startPollingJob,
			engineReady,
			engineMessage,
		],
	);

	// Trigger translation for the whole chapter
	const translateChapter = useCallback(async () => {
		if (!engineReady) {
			setErrorMessage(engineMessage);
			return;
		}
		if (!chapterId || !mangaId || pages.length === 0) return;
		const generation = scopeGeneration.current;
		setErrorMessage("");
		setIsTranslating(true);
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
				reuse_policy: "reuse_existing",
			});
			if (generation === scopeGeneration.current) startPollingJob(res.job_id);
		} catch (err: unknown) {
			if (generation !== scopeGeneration.current) return;
			setIsTranslating(false);
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
		engineReady,
		engineMessage,
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
		engineReady,
		engineMessage,
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
