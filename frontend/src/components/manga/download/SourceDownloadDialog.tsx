import {
	AlertCircle,
	AlertTriangle,
	BookOpen,
	Check,
	CheckCheck,
	CheckCircle2,
	Database,
	Download,
	DownloadCloud,
	ExternalLink,
	FolderPlus,
	Globe,
	Info,
	Layers,
	Loader2,
	Plus,
	RefreshCw,
	Search,
	Sparkles,
	X,
	Zap,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import client from "../../../api/client";
import { useAlert } from "../../../hooks/useAlert";
import { useDownload } from "../../../hooks/useDownload";
import type {
	DownloadPlan,
	DownloadSelectionPolicy,
	ProviderCapability,
	ReleasePage,
	SourceRelease,
	SourceWork,
} from "../../../types/datasource";

export interface ResolveStepInfo {
	id: number;
	title: string;
	description: string;
}

export const RESOLVE_STEPS: ResolveStepInfo[] = [
	{
		id: 1,
		title: "Xác thực & Chuẩn hóa URL",
		description:
			"Kiểm tra định dạng đường dẫn, phân tích domain và quét an toàn",
	},
	{
		id: 2,
		title: "Khởi tạo kết nối nguồn dữ liệu",
		description: "Khởi chạy headless browser session để kết nối máy chủ nguồn",
	},
	{
		id: 3,
		title: "Trích xuất Metadata & Ngôn ngữ",
		description:
			"Bóc tách tiêu đề, ảnh bìa, tác giả và danh sách ngôn ngữ dịch",
	},
	{
		id: 4,
		title: "Liên kết Manga & Nạp chương",
		description: "Lưu nguồn vào cơ sở dữ liệu và nạp toàn bộ danh sách chương",
	},
];

export interface ResolveProgressState {
	step: number;
	percent: number;
	status: "idle" | "running" | "success" | "error";
	message: string;
	errorDetail?: string;
}

interface SourceDownloadDialogProps {
	isOpen: boolean;
	onClose: () => void;
	mangaId: string;
	mangaTitle: string;
	mangadexId?: string | null;
	defaultSource?: string;
	onDownloadStarted?: (taskId: string) => void;
}

interface VerifyResult {
	exists: boolean;
	writable: boolean;
	message: string;
}

interface StoredChapterInfo {
	chapter_number?: string;
	pages_count?: number;
	pages?: unknown[];
}

export const SourceDownloadDialog: React.FC<SourceDownloadDialogProps> = ({
	isOpen,
	onClose,
	mangaId,
	mangaTitle,
	mangadexId,
	defaultSource = "mangadex",
	onDownloadStarted,
}) => {
	const { showToast } = useAlert();
	const { registerNewTask } = useDownload();

	// Datasource providers
	const [providers, setProviders] = useState<ProviderCapability[]>([]);
	const [selectedProvider, setSelectedProvider] = useState<string>(
		defaultSource || "mangadex",
	);

	// Work resolution state & detailed progress tracking
	const [sourceUrlInput, setSourceUrlInput] = useState<string>("");
	const [resolvingWork, setResolvingWork] = useState<boolean>(false);
	const [activeWork, setActiveWork] = useState<SourceWork | null>(null);
	const [resolveProgress, setResolveProgress] = useState<ResolveProgressState>({
		step: 0,
		percent: 0,
		status: "idle",
		message: "",
	});
	const progressTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

	const clearProgressTimers = useCallback(() => {
		for (const timer of progressTimersRef.current) {
			clearTimeout(timer);
		}
		progressTimersRef.current = [];
	}, []);

	useEffect(() => {
		return () => {
			clearProgressTimers();
		};
	}, [clearProgressTimers]);

	// Linked datasource works
	const [mangaSources, setMangaSources] = useState<
		Array<{
			source: string;
			source_work_id: string;
			canonical_url: string;
			title?: string;
		}>
	>([]);

	// Releases catalogue state
	const [selectedLang, setSelectedLang] = useState<string>("en");
	const [availableLangs, setAvailableLangs] = useState<string[]>(["en"]);
	const [releases, setReleases] = useState<SourceRelease[]>([]);
	const [loadingReleases, setLoadingReleases] = useState<boolean>(false);
	const [releaseError, setReleaseError] = useState<string | null>(null);

	// Group selection filter
	const [selectedGroups, setSelectedGroups] = useState<string[]>(["all"]);

	// Storage coverage
	const [existingChapterIds, setExistingChapterIds] = useState<Set<string>>(
		new Set(),
	);
	const [storageChapterMap, setStorageChapterMap] = useState<
		Map<string, StoredChapterInfo>
	>(new Map());
	const [latestStoredChapter, setLatestStoredChapter] = useState<{
		chapter_number: string;
	} | null>(null);
	const [_loadingStorage, setLoadingStorage] = useState<boolean>(false);

	// Selection & Filters
	const [selectedReleaseIds, setSelectedReleaseIds] = useState<Set<string>>(
		new Set(),
	);
	const [onePerChapterMode, setOnePerChapterMode] = useState<boolean>(true);
	const [searchQuery, setSearchQuery] = useState<string>("");
	const [releaseTypeFilter, setReleaseTypeFilter] = useState<string>("all");
	const [selectionPolicy, setSelectionPolicy] =
		useState<DownloadSelectionPolicy>("skip_existing_release");

	// Disk storage options
	const [saveToDisk, setSaveToDisk] = useState<boolean>(false);
	const [customPath, setCustomPath] = useState<string>("");
	const [verifying, setVerifying] = useState<boolean>(false);
	const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
	const [isTitleModalOpen, setIsTitleModalOpen] = useState<boolean>(false);

	// Execution state
	const [executing, setExecuting] = useState<boolean>(false);

	// Load providers and storage info on modal open
	useEffect(() => {
		if (!isOpen) return;

		const fetchProviders = async () => {
			try {
				const res = await client.get<ProviderCapability[]>("/api/datasources");
				setProviders(res.data);
			} catch (e) {
				console.error("Failed to load datasources:", e);
			}
		};

		const fetchMangaSources = async () => {
			try {
				const res = await client.get(`/api/manga/${mangaId}/sources`);
				setMangaSources(res.data || []);
			} catch (e) {
				console.error("Failed to load manga sources:", e);
			}
		};

		const fetchStorageChapters = async () => {
			setLoadingStorage(true);
			try {
				const res = await client.get(`/api/manga/${mangaId}/chapters`);
				const chaps = res.data?.chapters || [];
				const set = new Set<string>();
				const sMap = new Map<string, StoredChapterInfo>();
				let highest: { chapter_number: string; numeric: number } | null = null;

				for (const c of chaps) {
					if (c.source_id) set.add(String(c.source_id));
					if (c.chapter_number) {
						const chapKey = String(c.chapter_number).trim().toLowerCase();
						set.add(`num:${chapKey}`);
						sMap.set(chapKey, c);
						const num = Number.parseFloat(c.chapter_number);
						if (!Number.isNaN(num) && (!highest || num > highest.numeric)) {
							highest = { chapter_number: c.chapter_number, numeric: num };
						}
					}
				}
				setExistingChapterIds(set);
				setStorageChapterMap(sMap);
				if (highest) {
					setLatestStoredChapter({ chapter_number: highest.chapter_number });
				}
			} catch (e) {
				console.error("Failed to fetch storage chapters:", e);
			} finally {
				setLoadingStorage(false);
			}
		};

		const fetchBasePath = async () => {
			try {
				const res = await client.get("/api/downloads/base-path");
				setCustomPath(res.data?.base_path || "");
			} catch (e) {
				console.error("Failed to load base path:", e);
			}
		};

		fetchProviders();
		fetchMangaSources();
		fetchStorageChapters();
		fetchBasePath();
	}, [isOpen, mangaId]);

	// Auto-resolve work when provider changes
	useEffect(() => {
		if (!isOpen) return;

		clearProgressTimers();
		setResolveProgress({
			step: 0,
			percent: 0,
			status: "idle",
			message: "",
		});
		setActiveWork(null);
		setReleases([]);
		setSelectedReleaseIds(new Set());
		setSelectedGroups(["all"]);
		setReleaseError(null);

		const initWork = async () => {
			if (selectedProvider === "mangadex" && mangadexId) {
				setResolvingWork(true);
				try {
					const res = await client.post<SourceWork>(
						"/api/datasources/resolve",
						{
							url_or_id: mangadexId,
							provider_hint: "mangadex",
						},
					);
					setActiveWork(res.data);
					setAvailableLangs(res.data.available_languages || ["en"]);
					if (res.data.available_languages?.includes("en")) {
						setSelectedLang("en");
					} else if (res.data.available_languages?.[0]) {
						setSelectedLang(res.data.available_languages[0]);
					}
				} catch (err: unknown) {
					console.error("Failed to resolve MangaDex work:", err);
					const error = err as { response?: { data?: { detail?: string } } };
					setReleaseError(
						error.response?.data?.detail || "Không thể kết nối với MangaDex",
					);
				} finally {
					setResolvingWork(false);
				}
			} else {
				// Check if there is already a linked work for this provider
				const linked = mangaSources.find((s) => s.source === selectedProvider);
				if (linked?.source_work_id || linked?.canonical_url) {
					setResolvingWork(true);
					try {
						const res = await client.post<SourceWork>(
							"/api/datasources/resolve",
							{
								url_or_id: linked.canonical_url || linked.source_work_id,
								provider_hint: selectedProvider,
							},
						);
						setActiveWork(res.data);
						setAvailableLangs(res.data.available_languages || ["en"]);
						if (res.data.available_languages?.includes("en")) {
							setSelectedLang("en");
						} else if (res.data.available_languages?.[0]) {
							setSelectedLang(res.data.available_languages[0]);
						}
					} catch (err: unknown) {
						console.error("Failed to auto-resolve linked source:", err);
					} finally {
						setResolvingWork(false);
					}
				}
			}
		};

		initWork();
	}, [isOpen, selectedProvider, mangadexId, mangaSources, clearProgressTimers]);

	// Resolve work from custom URL (e.g. MangaFire) with detailed progress tracking
	const handleResolveUrl = async () => {
		const trimmedUrl = sourceUrlInput.trim();
		if (!trimmedUrl) return;

		clearProgressTimers();
		setResolvingWork(true);
		setReleaseError(null);

		// Bước 1: Xác thực định dạng & An toàn URL
		setResolveProgress({
			step: 1,
			percent: 20,
			status: "running",
			message: "Đang kiểm tra định dạng URL và ranh giới an toàn...",
		});

		// Giả lập trực quan chuyển tiếp các bước trong khi chờ máy chủ xử lý
		const timer1 = setTimeout(() => {
			setResolveProgress((prev) => {
				if (prev.status !== "running") return prev;
				return {
					step: 2,
					percent: 45,
					status: "running",
					message: `Đang kết nối phiên làm việc với ${selectedProvider.toUpperCase()}...`,
				};
			});
		}, 700);

		const timer2 = setTimeout(() => {
			setResolveProgress((prev) => {
				if (prev.status !== "running") return prev;
				return {
					step: 3,
					percent: 75,
					status: "running",
					message:
						"Đang phân tích cây DOM, trích xuất metadata và danh sách ngôn ngữ dịch...",
				};
			});
		}, 2000);

		progressTimersRef.current = [timer1, timer2];

		try {
			const res = await client.post<SourceWork>("/api/datasources/resolve", {
				url_or_id: trimmedUrl,
				provider_hint: selectedProvider,
			});

			clearProgressTimers();

			// Bước 4: Liên kết Manga & Nạp danh mục chương
			setResolveProgress({
				step: 4,
				percent: 90,
				status: "running",
				message: `Đang liên kết "${res.data.title}" vào manga và nạp danh sách chương...`,
			});

			setActiveWork(res.data);
			setAvailableLangs(res.data.available_languages || ["en"]);
			if (res.data.available_languages?.includes("en")) {
				setSelectedLang("en");
			} else if (res.data.available_languages?.[0]) {
				setSelectedLang(res.data.available_languages[0]);
			}

			// Automatically link resolved work to this manga
			try {
				await client.post(`/api/manga/${mangaId}/sources`, {
					source: res.data.source,
					source_work_id: res.data.source_work_id,
					canonical_url: res.data.url,
					title: res.data.title,
				});
				setMangaSources((prev) => [
					...prev.filter((s) => s.source !== res.data.source),
					{
						source: res.data.source,
						source_work_id: res.data.source_work_id,
						canonical_url: res.data.url,
						title: res.data.title,
					},
				]);
			} catch (linkErr: unknown) {
				const linkError = linkErr as {
					response?: { status?: number; data?: { detail?: string } };
				};
				if (linkError.response?.status === 409) {
					const msg =
						linkError.response?.data?.detail ||
						"Nguồn này đã được liên kết với một manga khác trong hệ thống!";
					setReleaseError(msg);
					setResolveProgress({
						step: 4,
						percent: 90,
						status: "error",
						message: "Lỗi xung đột liên kết nguồn",
						errorDetail: msg,
					});
					showToast(msg, "error");
					return;
				}
			}

			setResolveProgress({
				step: 5,
				percent: 100,
				status: "success",
				message: `Đã nhận diện thành công: "${res.data.title}"`,
			});

			showToast(
				`Đã nhận diện & liên kết: "${res.data.title}" từ ${selectedProvider}`,
				"success",
			);
		} catch (err: unknown) {
			clearProgressTimers();
			const error = err as { response?: { data?: { detail?: string } } };
			const msg =
				error.response?.data?.detail || "Không thể phân tích URL của nguồn này";
			setReleaseError(msg);
			setResolveProgress((prev) => ({
				step: prev.step || 1,
				percent: prev.percent || 25,
				status: "error",
				message: "Phân tích URL thất bại",
				errorDetail: msg,
			}));
			showToast(msg, "error");
		} finally {
			setResolvingWork(false);
		}
	};

	// Fetch releases when work or language changes
	useEffect(() => {
		if (!activeWork) return;

		const fetchReleases = async () => {
			setLoadingReleases(true);
			setReleaseError(null);
			try {
				const res = await client.get<ReleasePage>(
					`/api/datasources/${activeWork.source}/releases/${activeWork.source_work_id}`,
					{
						params: {
							lang: selectedLang,
							limit: 500,
						},
					},
				);
				const items = res.data.items || [];
				setReleases(items);

				// Auto-select based on one-per-chapter mode
				const initialSelected = new Set<string>();
				const seenNumbers = new Set<string>();

				for (const rel of items) {
					if (onePerChapterMode) {
						if (!seenNumbers.has(rel.chapter_number)) {
							seenNumbers.add(rel.chapter_number);
							initialSelected.add(rel.id);
						}
					} else {
						initialSelected.add(rel.id);
					}
				}
				setSelectedReleaseIds(initialSelected);
			} catch (err: unknown) {
				console.error("Failed to load releases:", err);
				const error = err as { response?: { data?: { detail?: string } } };
				setReleaseError(
					error.response?.data?.detail || "Không thể tải danh sách chương",
				);
			} finally {
				setLoadingReleases(false);
			}
		};

		fetchReleases();
	}, [activeWork, selectedLang, onePerChapterMode]);

	// Extract unique scanlation groups
	const uniqueGroups = useMemo(() => {
		const counts = new Map<
			string,
			{ id: string; name: string; count: number }
		>();
		for (const r of releases) {
			const gid = r.group_name || "Mặc định";
			if (!counts.has(gid)) {
				counts.set(gid, { id: gid, name: gid, count: 0 });
			}
			const existingGroup = counts.get(gid);
			if (existingGroup) {
				existingGroup.count++;
			}
		}
		return Array.from(counts.values());
	}, [releases]);

	// Duplicates & Logical Chapter Numbers analysis
	const duplicatesInfo = useMemo(() => {
		const chapMap = new Map<string, SourceRelease[]>();
		for (const r of releases) {
			const key = String(r.chapter_number ?? "")
				.trim()
				.toLowerCase();
			if (!chapMap.has(key)) chapMap.set(key, []);
			const list = chapMap.get(key);
			if (list) {
				list.push(r);
			}
		}
		const duplicateKeys = new Set<string>();
		chapMap.forEach((list, key) => {
			if (list.length > 1) duplicateKeys.add(key);
		});
		return {
			chapMap,
			duplicateKeys,
			uniqueChaptersCount: chapMap.size,
			duplicateCount: duplicateKeys.size,
		};
	}, [releases]);

	// Storage coverage statistics
	const missingStats = useMemo(() => {
		const totalUnique = duplicatesInfo.uniqueChaptersCount;
		let storedUnique = 0;
		duplicatesInfo.chapMap.forEach((_, key) => {
			if (existingChapterIds.has(`num:${key}`)) {
				storedUnique++;
			}
		});
		return {
			totalUnique,
			storedUnique,
			missingUnique: Math.max(0, totalUnique - storedUnique),
		};
	}, [duplicatesInfo, existingChapterIds]);

	// Filtered releases based on search, group & release type
	const displayedReleases = useMemo(() => {
		return releases.filter((r) => {
			// Group filter
			if (!selectedGroups.includes("all")) {
				const gid = r.group_name || "Mặc định";
				if (!selectedGroups.includes(gid)) return false;
			}
			// Search filter
			if (searchQuery.trim()) {
				const q = searchQuery.toLowerCase();
				const matchNum = r.chapter_number.toLowerCase().includes(q);
				const matchTitle = r.title?.toLowerCase().includes(q);
				if (!matchNum && !matchTitle) return false;
			}
			// Release type filter
			if (releaseTypeFilter !== "all") {
				if (r.release_type?.toLowerCase() !== releaseTypeFilter) return false;
			}
			return true;
		});
	}, [releases, selectedGroups, searchQuery, releaseTypeFilter]);

	// Toggle single selection
	const toggleRelease = (id: string) => {
		setSelectedReleaseIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	// Select all displayed
	const handleSelectAll = () => {
		const next = new Set(selectedReleaseIds);
		for (const r of displayedReleases) {
			next.add(r.id);
		}
		setSelectedReleaseIds(next);
	};

	// Clear selection
	const handleClearSelection = () => {
		setSelectedReleaseIds(new Set());
	};

	// Toggle group selection
	const handleToggleGroup = (groupId: string) => {
		if (selectedGroups.includes("all")) {
			setSelectedGroups([groupId]);
		} else if (selectedGroups.includes(groupId)) {
			const next = selectedGroups.filter((g) => g !== groupId);
			setSelectedGroups(next.length === 0 ? ["all"] : next);
		} else {
			setSelectedGroups([...selectedGroups, groupId]);
		}
	};

	const handleSelectAllGroups = () => {
		setSelectedGroups(["all"]);
	};

	// Select only missing chapters (intelligent resume)
	const handleSelectMissing = () => {
		const next = new Set<string>();
		const seenMissingNumbers = new Set<string>();

		for (const rel of releases) {
			const chapKey = String(rel.chapter_number).trim().toLowerCase();
			const isStored =
				existingChapterIds.has(rel.id) ||
				existingChapterIds.has(`num:${chapKey}`);

			if (!isStored) {
				if (!seenMissingNumbers.has(chapKey)) {
					seenMissingNumbers.add(chapKey);
					next.add(rel.id);
				}
			}
		}

		setSelectedReleaseIds(next);
		showToast(
			`Đã chọn ${next.size} chương còn thiếu trong kho lưu trữ!`,
			"success",
		);
	};

	// Auto-deduplicate (choose exactly 1 release per chapter)
	const handleAutoDeduplicate = () => {
		const next = new Set<string>();
		const seen = new Set<string>();

		for (const rel of displayedReleases) {
			const chapKey = String(rel.chapter_number).trim().toLowerCase();
			if (!seen.has(chapKey)) {
				seen.add(chapKey);
				next.add(rel.id);
			}
		}

		setSelectedReleaseIds(next);
		showToast(`Đã tự động chọn ${next.size} chương duy nhất!`, "success");
	};

	// Path verification
	const handleVerifyPath = async () => {
		if (!customPath.trim()) return;
		setVerifying(true);
		setVerifyResult(null);
		try {
			const res = await client.post<VerifyResult>(
				"/api/downloads/verify-path",
				{ path: customPath.trim() },
			);
			setVerifyResult(res.data);
			showToast(res.data.message || "Đường dẫn hợp lệ!", "success");
		} catch (err: unknown) {
			const error = err as { response?: { data?: { detail?: string } } };
			const msg =
				error.response?.data?.detail || "Không thể kiểm tra đường dẫn thư mục";
			setVerifyResult({ exists: false, writable: false, message: msg });
			showToast(msg, "error");
		} finally {
			setVerifying(false);
		}
	};

	// Append cleaned title to destination path
	const appendCleanedTitle = (titleStr: string) => {
		const cleanedTitle = titleStr
			.replace(/[\\/:*?"<>|]/g, "")
			.replace(/\s+/g, " ")
			.trim();
		if (!cleanedTitle) return;

		let newPath = customPath.trim();
		if (newPath) {
			const separator = newPath.includes("\\") ? "\\" : "/";
			if (newPath.endsWith("/") || newPath.endsWith("\\")) {
				newPath += cleanedTitle;
			} else {
				newPath += separator + cleanedTitle;
			}
		} else {
			newPath = cleanedTitle;
		}
		setCustomPath(newPath);
		setVerifyResult(null);
		showToast(`Đã thêm tên "${cleanedTitle}" vào đường dẫn`, "success");
	};

	// Title options for Append Title modal
	const titleOptions = useMemo(() => {
		const list: { title: string; label: string }[] = [];
		if (mangaTitle) {
			list.push({ title: mangaTitle, label: "Tên chính của manga" });
		}
		if (activeWork?.title && activeWork.title !== mangaTitle) {
			list.push({
				title: activeWork.title,
				label: `Tên từ ${selectedProvider}`,
			});
		}
		if (activeWork?.alt_titles) {
			for (const alt of activeWork.alt_titles) {
				if (!list.some((item) => item.title === alt)) {
					list.push({ title: alt, label: "Tên phụ / Tên khác" });
				}
			}
		}
		return list;
	}, [mangaTitle, activeWork, selectedProvider]);

	// Execute Download Plan
	const handleStartDownload = async () => {
		if (!activeWork) return;
		if (selectedReleaseIds.size === 0) {
			showToast("Vui lòng chọn ít nhất một chương để tải.", "warning");
			return;
		}

		setExecuting(true);
		try {
			// 1. Ensure linkage exists
			try {
				await client.post(`/api/manga/${mangaId}/sources`, {
					source: activeWork.source,
					source_work_id: activeWork.source_work_id,
					canonical_url: activeWork.url,
					title: activeWork.title,
				});
			} catch {
				// Ignored if already linked
			}

			// 2. Create server-side Download Plan
			const createPlanRes = await client.post<DownloadPlan>(
				`/api/manga/${mangaId}/download-plans`,
				{
					source: activeWork.source,
					source_work_id: activeWork.source_work_id,
					release_ids: Array.from(selectedReleaseIds),
					selection_policy: selectionPolicy,
					save_to_disk: saveToDisk,
					download_path: customPath.trim() || undefined,
					auto_link: true,
					releases_metadata: Array.from(selectedReleaseIds).map((id) => {
						const r = releases.find((item) => String(item.id) === String(id));
						return r
							? {
									id: String(r.id),
									chapter_number: r.chapter_number,
									volume: r.volume,
									title: r.title,
									language: r.language,
									unit_kind: r.unit_kind,
									group_name: r.group_name,
								}
							: { id: String(id) };
					}),
				},
			);

			const planData = createPlanRes.data as DownloadPlan & { _id?: string };
			const planId = planData?.id || planData?._id || planData?.plan_id;
			if (!planId || planId === "undefined") {
				throw new Error(
					"Không nhận được mã định danh kế hoạch tải (Download Plan ID).",
				);
			}

			// 3. Execute Download Plan
			const execRes = await client.post(
				`/api/download-plans/${planId}/execute`,
				{},
			);
			const taskId = execRes.data?.task_id;

			if (taskId && !taskId.startsWith("noop_")) {
				registerNewTask(taskId);
				if (onDownloadStarted) onDownloadStarted(taskId);
			}

			showToast(
				`Đang tải ${createPlanRes.data.download_count} chương từ ${activeWork.source.toUpperCase()}.`,
				"success",
			);

			onClose();
		} catch (err: unknown) {
			console.error("Execution error:", err);
			const error = err as { response?: { data?: { detail?: string } } };
			showToast(
				error.response?.data?.detail || "Đã xảy ra lỗi khi tạo tác vụ.",
				"error",
			);
		} finally {
			setExecuting(false);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200">
			<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl w-full max-w-4xl lg:max-w-5xl max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
				{/* 1. Header */}
				<div className="px-6 py-4.5 border-b border-[var(--border-primary)] bg-[var(--bg-card)]/90 backdrop-blur flex justify-between items-center z-10 shrink-0">
					<div className="flex items-center space-x-3.5 min-w-0">
						<div className="p-2.5 rounded-2xl bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] shrink-0">
							<Download size={22} />
						</div>
						<div className="min-w-0">
							<h2 className="text-lg font-bold font-spartan text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
								<span>Download Chapters</span>
								<span className="text-xs font-normal text-zinc-400 hidden sm:inline">
									•
								</span>
								<span
									className="text-sm font-semibold text-[var(--brand-orange)] truncate max-w-[280px] sm:max-w-md"
									title={mangaTitle}
								>
									{mangaTitle}
								</span>
							</h2>
							<p className="text-xs text-[var(--text-secondary)] mt-0.5">
								Chọn nguồn, ngôn ngữ, nhóm dịch, phương thức lưu trữ và danh
								sách chương cần tải
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-2 rounded-xl text-zinc-400 hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer shrink-0 ml-2"
						title="Đóng modal"
					>
						<X size={18} />
					</button>
				</div>

				{/* 2. Scrollable Body */}
				<div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
					{/* Group 0: Datasource Selection */}
					<div className="bg-zinc-500/5 dark:bg-zinc-900/40 border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-3">
						<div className="flex items-center justify-between flex-wrap gap-2">
							<div className="flex items-center space-x-2 text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider">
								<Globe size={15} />
								<span>Nguồn Cung Cấp (Datasource Provider)</span>
							</div>
							<span className="text-[11px] text-zinc-400">
								Chuyển đổi linh hoạt giữa MangaDex và MangaFire
							</span>
						</div>

						<div className="flex flex-wrap gap-2.5">
							{providers.map((p) => {
								const isSelected = selectedProvider === p.name;
								return (
									<button
										key={p.name}
										type="button"
										onClick={() => setSelectedProvider(p.name)}
										className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
											isSelected
												? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-md ring-2 ring-[var(--brand-orange)]/30"
												: "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400 hover:text-[var(--text-primary)]"
										}`}
									>
										<Globe
											size={14}
											className={isSelected ? "text-white" : "text-zinc-400"}
										/>
										<span className="capitalize">{p.display_name}</span>
										{p.requires_session && (
											<span
												className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
													isSelected
														? "bg-white/20 text-white"
														: "bg-amber-500/10 text-amber-500 border border-amber-500/20"
												}`}
											>
												Browser Session
											</span>
										)}
									</button>
								);
							})}
						</div>

						{/* MangaFire URL Input & Linking Banner */}
						{selectedProvider === "mangafire" && (
							<div className="mt-3 space-y-3">
								<div className="p-3.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
									{activeWork ? (
										<div className="flex items-center space-x-3 min-w-0 flex-1">
											{activeWork.cover_url ? (
												<img
													src={activeWork.cover_url}
													alt={activeWork.title}
													className="w-10 h-14 object-cover rounded-lg shadow-sm border border-[var(--border-primary)] shrink-0"
												/>
											) : (
												<div className="w-10 h-14 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center shrink-0 border border-[var(--border-primary)]">
													<Layers className="w-4 h-4 text-[var(--text-secondary)]" />
												</div>
											)}
											<div className="min-w-0">
												<div className="flex items-center gap-2">
													<h4 className="text-xs font-bold text-[var(--text-primary)] truncate max-w-sm">
														{activeWork.title}
													</h4>
													<span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
														Đã kết nối
													</span>
												</div>
												<p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
													ID:{" "}
													<span className="font-mono text-zinc-400">
														{activeWork.source_work_id}
													</span>
												</p>
												<a
													href={activeWork.url}
													target="_blank"
													rel="noopener noreferrer"
													className="text-[11px] text-[var(--brand-orange)] hover:underline flex items-center gap-1 mt-0.5"
												>
													<span>Mở link gốc</span>
													<ExternalLink size={10} />
												</a>
											</div>
										</div>
									) : (
										<div className="w-full space-y-2">
											<p className="text-xs text-[var(--text-secondary)]">
												Nhập đường dẫn truyện trên MangaFire để tải chương (Ví
												dụ:{" "}
												<code className="text-zinc-400">
													https://mangafire.to/manga/sheeply-horned-witch-romi.48y2
												</code>
												):
											</p>
											<div className="flex gap-2">
												<input
													type="text"
													value={sourceUrlInput}
													onChange={(e) => setSourceUrlInput(e.target.value)}
													onKeyDown={(e) => {
														if (
															e.key === "Enter" &&
															!resolvingWork &&
															sourceUrlInput.trim()
														) {
															e.preventDefault();
															handleResolveUrl();
														}
													}}
													placeholder="https://mangafire.to/manga/..."
													className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] font-mono"
												/>
												<button
													type="button"
													onClick={handleResolveUrl}
													disabled={resolvingWork || !sourceUrlInput.trim()}
													className="px-4 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
												>
													{resolvingWork ? (
														<Loader2 size={13} className="animate-spin" />
													) : (
														<RefreshCw size={13} />
													)}
													<span>Phân tích URL</span>
												</button>
											</div>
										</div>
									)}

									{activeWork && (
										<button
											type="button"
											onClick={() => {
												setActiveWork(null);
												setSourceUrlInput("");
												setResolveProgress({
													step: 0,
													percent: 0,
													status: "idle",
													message: "",
												});
												clearProgressTimers();
											}}
											className="px-3 py-1.5 rounded-xl border border-[var(--border-primary)] text-[11px] font-semibold text-zinc-400 hover:text-[var(--text-primary)] transition shrink-0 cursor-pointer"
										>
											Đổi URL khác
										</button>
									)}
								</div>

								{/* Detailed Progress Tracker Card */}
								{resolveProgress.status !== "idle" && (
									<div className="p-4 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-card)]/90 backdrop-blur space-y-3.5 shadow-md animate-in fade-in zoom-in-95 duration-200">
										<div className="flex items-center justify-between flex-wrap gap-2">
											<div className="flex items-center space-x-2.5 min-w-0">
												<div
													className={`p-1.5 rounded-xl ${
														resolveProgress.status === "success"
															? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
															: resolveProgress.status === "error"
																? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
																: "bg-[var(--brand-orange)]/15 text-[var(--brand-orange)]"
													}`}
												>
													{resolveProgress.status === "success" ? (
														<CheckCircle2 size={16} />
													) : resolveProgress.status === "error" ? (
														<AlertCircle size={16} />
													) : (
														<Loader2 size={16} className="animate-spin" />
													)}
												</div>
												<div className="min-w-0">
													<div className="flex items-center gap-2 flex-wrap">
														<span className="text-xs font-bold text-[var(--text-primary)]">
															Tiến trình phân tích URL
														</span>
														<span
															className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
																resolveProgress.status === "success"
																	? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
																	: resolveProgress.status === "error"
																		? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
																		: "bg-[var(--brand-orange)]/15 text-[var(--brand-orange)]"
															}`}
														>
															{resolveProgress.status === "success"
																? "Hoàn tất 100%"
																: resolveProgress.status === "error"
																	? "Thất bại"
																	: `Bước ${Math.min(resolveProgress.step, 4)} / 4`}
														</span>
													</div>
													<p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
														{resolveProgress.message}
													</p>
												</div>
											</div>
											<div className="text-right">
												<span className="text-sm font-black font-mono text-[var(--brand-orange)]">
													{resolveProgress.percent}%
												</span>
											</div>
										</div>

										{/* Animated Progress Bar */}
										<div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden relative shadow-inner">
											<div
												className={`h-full transition-all duration-500 ease-out rounded-full ${
													resolveProgress.status === "success"
														? "bg-emerald-500"
														: resolveProgress.status === "error"
															? "bg-rose-500"
															: "bg-gradient-to-r from-[var(--brand-orange)] via-amber-400 to-[var(--brand-coral)]"
												}`}
												style={{ width: `${resolveProgress.percent}%` }}
											/>
										</div>

										{/* 4-Step Pipeline Grid */}
										<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
											{RESOLVE_STEPS.map((step) => {
												const isCompleted =
													resolveProgress.status === "success" ||
													resolveProgress.step > step.id;
												const isActive =
													resolveProgress.status === "running" &&
													resolveProgress.step === step.id;
												const isFailed =
													resolveProgress.status === "error" &&
													resolveProgress.step === step.id;

												return (
													<div
														key={step.id}
														className={`p-2.5 rounded-xl border text-left transition-all ${
															isCompleted
																? "bg-emerald-500/5 border-emerald-500/25"
																: isActive
																	? "bg-[var(--brand-orange)]/10 border-[var(--brand-orange)] ring-1 ring-[var(--brand-orange)]/30"
																	: isFailed
																		? "bg-rose-500/10 border-rose-500/30"
																		: "bg-zinc-500/5 border-[var(--border-primary)] opacity-60"
														}`}
													>
														<div className="flex items-center space-x-2">
															<div className="shrink-0">
																{isCompleted ? (
																	<CheckCircle2
																		size={14}
																		className="text-emerald-500"
																	/>
																) : isActive ? (
																	<Loader2
																		size={14}
																		className="text-[var(--brand-orange)] animate-spin"
																	/>
																) : isFailed ? (
																	<AlertCircle
																		size={14}
																		className="text-rose-500"
																	/>
																) : (
																	<div className="w-3.5 h-3.5 rounded-full border border-zinc-400 flex items-center justify-center text-[9px] font-mono text-zinc-400">
																		{step.id}
																	</div>
																)}
															</div>
															<span
																className={`text-[11px] font-bold truncate ${
																	isCompleted
																		? "text-emerald-600 dark:text-emerald-400"
																		: isActive
																			? "text-[var(--brand-orange)]"
																			: isFailed
																				? "text-rose-600 dark:text-rose-400"
																				: "text-[var(--text-secondary)]"
																}`}
															>
																{step.title}
															</span>
														</div>
														<p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-tight">
															{step.description}
														</p>
													</div>
												);
											})}
										</div>

										{/* Error Banner with Retry */}
										{resolveProgress.status === "error" &&
											resolveProgress.errorDetail && (
												<div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between gap-2">
													<div className="flex items-center gap-2 min-w-0">
														<AlertCircle size={14} className="shrink-0" />
														<span className="truncate">
															{resolveProgress.errorDetail}
														</span>
													</div>
													<button
														type="button"
														onClick={handleResolveUrl}
														className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold text-[11px] hover:bg-rose-700 transition cursor-pointer shrink-0"
													>
														Thử lại
													</button>
												</div>
											)}
									</div>
								)}
							</div>
						)}
					</div>

					{/* Group 1: Source & Translation */}
					<div className="bg-zinc-500/5 dark:bg-zinc-900/40 border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-4">
						<div className="flex items-center space-x-2 text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider">
							<Globe size={15} />
							<span>Ngôn ngữ & Nhóm dịch (Source & Translation)</span>
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							{/* Language Selector */}
							<div>
								<span className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-2">
									Ngôn ngữ (Language)
								</span>
								{availableLangs.length > 0 ? (
									<div className="flex flex-wrap gap-2">
										{availableLangs.map((lang) => {
											const isSelected = selectedLang === lang;
											return (
												<button
													key={lang}
													type="button"
													onClick={() => setSelectedLang(lang)}
													className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
														isSelected
															? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm ring-2 ring-[var(--brand-orange)]/30"
															: "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400 hover:text-[var(--text-primary)]"
													}`}
												>
													<span>{lang.toUpperCase()}</span>
												</button>
											);
										})}
									</div>
								) : (
									<span className="text-xs text-zinc-400 italic">
										{resolvingWork
											? "Đang nhận diện ngôn ngữ khả dụng..."
											: "Chưa có ngôn ngữ khả dụng."}
									</span>
								)}
							</div>

							{/* Group Selector */}
							<div>
								<div className="flex items-center justify-between mb-2">
									<span className="text-xs font-semibold text-[var(--text-secondary)] uppercase">
										Nhóm dịch & Bộ lọc gộp (Scanlation Groups & Merge)
									</span>
									{uniqueGroups.length > 1 && (
										<div className="flex items-center gap-2 text-[11px]">
											<button
												type="button"
												onClick={handleSelectAllGroups}
												className={`font-semibold transition cursor-pointer hover:underline ${
													selectedGroups.includes("all")
														? "text-[var(--brand-orange)] font-bold"
														: "text-zinc-400 hover:text-[var(--text-primary)]"
												}`}
											>
												Chọn tất cả
											</button>
											<span className="text-zinc-400">·</span>
											<span className="text-zinc-400">
												{uniqueGroups.length} nhóm khả dụng
											</span>
										</div>
									)}
								</div>

								{uniqueGroups.length > 1 ? (
									<div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
										{/* Option: Merge All Groups */}
										<button
											type="button"
											onClick={handleSelectAllGroups}
											className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
												selectedGroups.includes("all")
													? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm ring-2 ring-[var(--brand-orange)]/30"
													: "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400 hover:text-[var(--text-primary)]"
											}`}
											title="Gộp toàn bộ bản dịch của tất cả các nhóm dịch để hoàn thiện danh sách chương"
										>
											<Sparkles
												size={13}
												className={
													selectedGroups.includes("all")
														? "text-amber-200"
														: "text-[var(--brand-orange)]"
												}
											/>
											<span>Tất cả nhóm dịch (Gộp bản dịch)</span>
											<span
												className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-0.5 ${
													selectedGroups.includes("all")
														? "bg-white/20 text-white"
														: "bg-zinc-500/10 text-zinc-500"
												}`}
											>
												{releases.length} chap
											</span>
										</button>

										{/* Individual Groups */}
										{uniqueGroups.map((group) => {
											const isSelected =
												selectedGroups.includes("all") ||
												selectedGroups.includes(group.id);
											const isExplicitSingle =
												!selectedGroups.includes("all") &&
												selectedGroups.includes(group.id);

											return (
												<button
													key={group.id}
													type="button"
													onClick={() => handleToggleGroup(group.id)}
													className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 truncate max-w-full ${
														isExplicitSingle
															? "bg-amber-600 border-amber-600 text-white shadow-sm ring-2 ring-amber-500/30"
															: isSelected && selectedGroups.includes("all")
																? "bg-[var(--bg-primary)] border-zinc-300 dark:border-zinc-700 text-[var(--text-primary)] hover:border-[var(--brand-orange)]"
																: "bg-[var(--bg-primary)] border-[var(--border-primary)] text-zinc-400 hover:border-zinc-400 opacity-60 hover:opacity-100"
													}`}
													title={`${group.name} (${group.count} chương)`}
												>
													{isExplicitSingle && (
														<Check size={12} className="stroke-[3]" />
													)}
													<span className="truncate">{group.name}</span>
													<span
														className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
															isExplicitSingle
																? "bg-white/20 text-white"
																: "bg-zinc-500/10 text-zinc-500"
														}`}
													>
														{group.count}
													</span>
												</button>
											);
										})}
									</div>
								) : (
									<div className="text-xs text-[var(--text-secondary)] py-1 font-medium flex items-center gap-2">
										<span className="px-2.5 py-1 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] font-bold text-[var(--text-primary)]">
											{uniqueGroups[0]?.name || "Mặc định (Default)"}
										</span>
										<span className="text-zinc-400 text-[11px]">
											({releases.length} chương khả dụng)
										</span>
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Group 2: Storage Destination & Save to Disk Option */}
					<div className="bg-zinc-500/5 dark:bg-zinc-900/40 border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-4">
						<div className="flex items-center space-x-2 text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider">
							<Layers size={15} />
							<span>Điểm đến lưu trữ & Sao lưu (Storage & Backup)</span>
						</div>

						{/* Default System Storage Banner */}
						<div className="p-4 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
							<div className="flex items-start sm:items-center space-x-3.5 min-w-0">
								<div className="p-2.5 rounded-2xl bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] shrink-0">
									<Database size={20} />
								</div>
								<div className="min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<span className="text-sm font-bold text-[var(--text-primary)]">
											Lưu trữ System Storage
										</span>
										<span className="px-2 py-0.5 rounded-full bg-[var(--brand-orange)]/10 border border-[var(--brand-orange)]/20 text-[var(--brand-orange)] font-bold text-[10px] uppercase tracking-wider">
											Mặc định
										</span>
									</div>
									<p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
										Hệ thống tự động lưu trữ, lập chỉ mục và quản lý để bạn có
										thể đọc trực tiếp bất cứ lúc nào.
									</p>
								</div>
							</div>

							{/* Live pulsing badge */}
							<div className="shrink-0 self-start sm:self-center flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-bold text-xs whitespace-nowrap shadow-xs">
								<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
								<span>Sẵn sàng lưu trữ</span>
							</div>
						</div>

						{/* Policy & Selection Controls */}
						<div className="p-4 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl space-y-3.5">
							<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
								<label className="flex items-center space-x-2.5 cursor-pointer select-none">
									<input
										type="checkbox"
										checked={onePerChapterMode}
										onChange={(e) => setOnePerChapterMode(e.target.checked)}
										className="w-4 h-4 rounded text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] cursor-pointer"
									/>
									<span className="text-xs font-bold text-[var(--text-primary)]">
										Chỉ chọn 1 bản mỗi chương (Tránh tải trùng lặp giữa các
										nhóm/release)
									</span>
								</label>

								<div className="flex items-center gap-2">
									<span className="text-[11px] font-semibold text-[var(--text-secondary)] whitespace-nowrap">
										Chính sách xử lý:
									</span>
									<select
										value={selectionPolicy}
										onChange={(e) =>
											setSelectionPolicy(
												e.target.value as DownloadSelectionPolicy,
											)
										}
										className="px-2.5 py-1 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] cursor-pointer"
									>
										<option value="skip_existing_release">
											Bỏ qua nếu đã tải sẵn (Khuyến nghị)
										</option>
										<option value="replace_preferred">
											Thay thế bản lưu trữ hiện có
										</option>
										<option value="keep_alternative">
											Lưu song song cả hai bản
										</option>
									</select>
								</div>
							</div>

							{/* External Folder Backup Option */}
							<div className="pt-2 border-t border-[var(--border-primary)]">
								<label className="flex items-start sm:items-center space-x-3 cursor-pointer select-none">
									<input
										type="checkbox"
										checked={saveToDisk}
										onChange={(e) => setSaveToDisk(e.target.checked)}
										className="w-4 h-4 rounded text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] cursor-pointer mt-0.5 sm:mt-0"
									/>
									<div className="min-w-0">
										<span className="text-xs font-bold text-[var(--text-primary)] block sm:inline">
											Tải thêm một bản sao lưu ra thư mục ổ đĩa trên máy tính
										</span>
										<span className="text-[11px] text-[var(--text-secondary)] ml-0 sm:ml-1.5 block sm:inline">
											(Duplicate to external folder)
										</span>
									</div>
								</label>

								{saveToDisk && (
									<div className="pt-3 border-t border-[var(--border-primary)] space-y-3 animate-in fade-in duration-200">
										<div className="flex items-center justify-between">
											<span className="text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider flex items-center space-x-1.5">
												<FolderPlus size={14} />
												<span>Download Destination Path</span>
											</span>
											<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] border border-[var(--brand-orange)]/15">
												Editable Base Path
											</span>
										</div>

										<div className="flex flex-wrap gap-2">
											<input
												type="text"
												value={customPath}
												onChange={(e) => {
													setCustomPath(e.target.value);
													setVerifyResult(null);
												}}
												placeholder="e.g. C:\Downloads\Manga"
												className="flex-1 min-w-[220px] px-3.5 py-2.5 rounded-xl border border-[var(--border-primary)] focus:border-[var(--brand-orange)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/30 transition shadow-sm"
											/>
											<button
												type="button"
												onClick={handleVerifyPath}
												disabled={verifying || !customPath.trim()}
												className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-[var(--text-primary)] shadow-sm hover:shadow transition flex items-center space-x-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
											>
												{verifying ? (
													<Loader2 size={14} className="animate-spin" />
												) : (
													<Check size={14} />
												)}
												<span>Verify Path</span>
											</button>
											<button
												type="button"
												onClick={() => {
													setIsTitleModalOpen(true);
													setVerifyResult(null);
												}}
												title="Select and append manga title or alternative title as subfolder"
												className="px-4 py-2.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] border border-[var(--brand-orange)] rounded-xl text-xs font-bold text-white shadow-sm hover:shadow transition flex items-center space-x-1.5 whitespace-nowrap cursor-pointer"
											>
												<Plus size={14} className="stroke-[3]" />
												<span>Append Title</span>
											</button>
										</div>

										{verifyResult && (
											<div
												className={`p-3 rounded-xl text-xs font-semibold flex items-start space-x-2 border animate-in fade-in duration-200 ${
													verifyResult.writable
														? verifyResult.exists
															? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
															: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
														: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
												}`}
											>
												{verifyResult.writable ? (
													verifyResult.exists ? (
														<Check size={14} className="shrink-0 mt-0.5" />
													) : (
														<Info size={14} className="shrink-0 mt-0.5" />
													)
												) : (
													<AlertTriangle
														size={14}
														className="shrink-0 mt-0.5"
													/>
												)}
												<span className="leading-relaxed">
													{verifyResult.message}
												</span>
											</div>
										)}

										<div className="flex items-start space-x-1.5 text-xs text-[var(--text-secondary)]">
											<Info
												size={14}
												className="text-[var(--brand-orange)] shrink-0 mt-0.5"
											/>
											<span>
												Đường dẫn này được khởi tạo từ cấu hình mặc định. Bạn có
												thể chỉnh sửa trực tiếp. Nhấn{" "}
												<strong>Append Title</strong> để thêm tên manga vào thư
												mục con.
											</span>
										</div>
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Group 3: Chapters List */}
					<div className="bg-zinc-500/5 dark:bg-zinc-900/40 border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-4">
						<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
							<div className="flex items-center space-x-2 text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider flex-wrap">
								<BookOpen size={15} />
								<span>Danh sách chương ({displayedReleases.length})</span>
								{duplicatesInfo.uniqueChaptersCount > 0 &&
									duplicatesInfo.uniqueChaptersCount !==
										displayedReleases.length && (
										<span className="text-[11px] font-semibold text-zinc-400 normal-case">
											({duplicatesInfo.uniqueChaptersCount} chap duy nhất)
										</span>
									)}
								{selectedReleaseIds.size > 0 && (
									<div className="flex items-center gap-1.5">
										<span className="px-2 py-0.5 rounded-full bg-[var(--brand-orange)]/15 text-[var(--brand-orange)] text-[10px] font-bold">
											{selectedReleaseIds.size} đã chọn
										</span>
										<button
											type="button"
											onClick={handleClearSelection}
											className="px-2 py-0.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold border border-rose-500/25 transition cursor-pointer flex items-center gap-1 shadow-xs"
											title="Bỏ chọn tất cả các chương đang chọn"
										>
											<X size={10} />
											<span>Bỏ chọn hết</span>
										</button>
									</div>
								)}
							</div>

							<div className="flex items-center gap-2 flex-wrap">
								{/* Chapter Search Filter */}
								<div className="relative min-w-[150px] sm:min-w-[180px]">
									<Search
										size={13}
										className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
									/>
									<input
										type="text"
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										placeholder="Tìm số hoặc tên chương..."
										className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition"
									/>
									{searchQuery && (
										<button
											type="button"
											onClick={() => setSearchQuery("")}
											className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[var(--text-primary)] cursor-pointer"
										>
											<X size={12} />
										</button>
									)}
								</div>

								{/* Release Type Filter Dropdown */}
								<select
									value={releaseTypeFilter}
									onChange={(e) => setReleaseTypeFilter(e.target.value)}
									className="px-2.5 py-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition cursor-pointer"
								>
									<option value="all">Tất cả loại release</option>
									<option value="scanlation">Bản dịch nhóm (Scanlation)</option>
									<option value="official">Bản chính thức (Official)</option>
								</select>

								{/* Quick Action: Select Only Missing Chapters */}
								{missingStats.missingUnique > 0 && (
									<button
										type="button"
										onClick={handleSelectMissing}
										className="px-3 py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-xs font-bold text-blue-700 dark:text-blue-300 transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-xs"
										title="Chỉ chọn những chương chưa có trong kho lưu trữ (tự động loại bỏ trùng lặp)"
									>
										<CheckCircle2
											size={13}
											className="text-blue-600 dark:text-blue-400"
										/>
										<span>Chọn chap thiếu ({missingStats.missingUnique})</span>
									</button>
								)}

								{/* Auto Deduplicate Quick Action */}
								{duplicatesInfo.duplicateCount > 0 && (
									<button
										type="button"
										onClick={handleAutoDeduplicate}
										className="px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-bold text-amber-700 dark:text-amber-300 transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-xs"
										title="Tự động chọn 1 bản dịch duy nhất cho mỗi chương, loại bỏ các bản dịch trùng lặp"
									>
										<Sparkles
											size={13}
											className="text-amber-600 dark:text-amber-400"
										/>
										<span>Tự động lọc</span>
									</button>
								)}

								{/* Selection Actions: Distinct Select All and Deselect All */}
								<div className="flex items-center gap-1.5">
									<button
										type="button"
										onClick={handleSelectAll}
										disabled={displayedReleases.length === 0}
										className="px-3 py-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-[var(--brand-orange)] text-xs font-bold text-[var(--text-primary)] hover:text-[var(--brand-orange)] transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
										title="Chọn toàn bộ các bản phát hành đang hiển thị"
									>
										<CheckCheck
											size={13}
											className="text-[var(--brand-orange)]"
										/>
										<span>Chọn tất cả ({displayedReleases.length})</span>
									</button>
									<button
										type="button"
										onClick={handleClearSelection}
										disabled={selectedReleaseIds.size === 0}
										className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-xs ${
											selectedReleaseIds.size > 0
												? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 active:scale-95"
												: "border-[var(--border-primary)] bg-[var(--bg-primary)] text-zinc-400 opacity-40 cursor-not-allowed"
										}`}
										title="Bỏ chọn toàn bộ các chương đã chọn để chuẩn bị tải xuống"
									>
										<X
											size={13}
											className={
												selectedReleaseIds.size > 0
													? "text-rose-500 stroke-[2.5]"
													: "text-zinc-400"
											}
										/>
										<span>Bỏ chọn tất cả ({selectedReleaseIds.size})</span>
									</button>
								</div>
							</div>
						</div>

						{/* Storage & Resume Intelligence Banner */}
						{existingChapterIds.size > 0 && (
							<div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-900 dark:text-blue-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
								<div className="flex items-start gap-3 min-w-0">
									<div className="p-2 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
										<DownloadCloud size={18} />
									</div>
									<div className="min-w-0">
										<div className="flex items-center gap-2 flex-wrap">
											<span className="text-xs font-bold text-blue-800 dark:text-blue-200">
												Kho lưu trữ: Đã tải {missingStats.storedUnique} /{" "}
												{missingStats.totalUnique} chap
											</span>
											{missingStats.missingUnique > 0 ? (
												<span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold text-[10px]">
													Còn thiếu {missingStats.missingUnique} chap
												</span>
											) : (
												<span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
													Đã tải trọn bộ
												</span>
											)}
											{latestStoredChapter && (
												<span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
													(Chap cao nhất:{" "}
													<strong>
														Ch. {latestStoredChapter.chapter_number}
													</strong>
													)
												</span>
											)}
										</div>
										<p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
											{missingStats.missingUnique > 0
												? "Hệ thống phát hiện manga này đã có một phần chương trong kho. Bạn có thể chọn tải tiếp các chap còn thiếu."
												: "Toàn bộ các chương của manga này đã có trong bộ nhớ lưu trữ."}
										</p>
									</div>
								</div>

								{missingStats.missingUnique > 0 && (
									<button
										type="button"
										onClick={handleSelectMissing}
										className="flex-1 md:flex-initial px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
										title="Chỉ chọn những chương chưa được tải về máy (tự động loại bỏ chương trùng lặp)"
									>
										<CheckCircle2 size={14} />
										<span>
											Tải chap còn thiếu ({missingStats.missingUnique})
										</span>
									</button>
								)}
							</div>
						)}

						{/* Error Banner */}
						{releaseError && !resolvingWork && !loadingReleases && (
							<div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 text-xs flex items-start space-x-2.5">
								<AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
								<div className="flex-1">
									<p className="font-semibold">Lỗi tải dữ liệu</p>
									<p className="text-[11px] text-red-400 mt-0.5">
										{releaseError}
									</p>
								</div>
								<button
									type="button"
									onClick={() => setReleaseError(null)}
									className="text-red-400 hover:text-red-500"
								>
									<X size={14} />
								</button>
							</div>
						)}

						{/* Loading Releases Spinner */}
						{loadingReleases ? (
							<div className="py-12 flex flex-col items-center justify-center space-y-3">
								<Loader2
									size={28}
									className="animate-spin text-[var(--brand-orange)]"
								/>
								<span className="text-xs font-semibold text-zinc-400">
									Đang đồng bộ danh sách chương từ{" "}
									{selectedProvider.toUpperCase()}...
								</span>
							</div>
						) : displayedReleases.length > 0 ? (
							/* 3-Column Chapter Cards Grid */
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto p-1.5 border border-[var(--border-primary)] rounded-2xl bg-[var(--bg-primary)]/50">
								{displayedReleases.map((chap) => {
									const isSelected = selectedReleaseIds.has(chap.id);
									const chapKey = String(chap.chapter_number ?? "")
										.trim()
										.toLowerCase();
									const isDuplicate = duplicatesInfo.duplicateKeys.has(chapKey);
									const duplicateVariants = isDuplicate
										? duplicatesInfo.chapMap.get(chapKey)
										: [];
									const isStored =
										existingChapterIds.has(chap.id) ||
										existingChapterIds.has(`num:${chapKey}`);
									const storedChap = storageChapterMap.get(chapKey);
									const isLatestStored =
										latestStoredChapter &&
										String(latestStoredChapter.chapter_number)
											.trim()
											.toLowerCase() === chapKey;

									return (
										<button
											key={chap.id}
											type="button"
											onClick={() => toggleRelease(chap.id)}
											className={`p-3 rounded-xl border text-left transition-all duration-150 flex items-start gap-2.5 cursor-pointer select-none group relative w-full ${
												isSelected
													? "bg-[var(--brand-orange)]/10 border-[var(--brand-orange)] shadow-xs ring-1 ring-[var(--brand-orange)]/30"
													: isDuplicate
														? "bg-[var(--bg-card)] border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/5"
														: "bg-[var(--bg-card)] border-[var(--border-primary)] hover:border-zinc-400/70 dark:hover:border-zinc-600 hover:bg-zinc-500/5"
											}`}
										>
											{/* Selection Checkbox */}
											<div
												className={`w-4 h-4 mt-0.5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
													isSelected
														? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
														: isDuplicate
															? "border-amber-500/60 group-hover:border-[var(--brand-orange)]"
															: "border-zinc-400/50 dark:border-zinc-600 group-hover:border-[var(--brand-orange)]"
												}`}
											>
												{isSelected && (
													<Check size={11} className="stroke-[3]" />
												)}
											</div>

											{/* Chapter Details */}
											<div className="min-w-0 flex-1">
												<div className="flex items-center justify-between gap-1.5 flex-wrap">
													<div className="flex items-center gap-1.5 min-w-0 flex-wrap">
														<span
															className={`text-xs font-bold ${
																isSelected
																	? "text-[var(--brand-orange)]"
																	: "text-[var(--text-primary)]"
															}`}
														>
															Ch. {chap.chapter_number}
														</span>

														{/* Stored / Missing Badge */}
														{isStored ? (
															<span
																className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 shrink-0 flex items-center gap-1"
																title="Chương này đã có trong bộ nhớ lưu trữ"
															>
																<CheckCircle2 size={10} /> Đã tải
																{storedChap?.pages_count
																	? ` (${storedChap.pages_count} trang)`
																	: ""}
															</span>
														) : (
															<span className="text-[10px] font-medium px-1.5 py-0.2 rounded-full bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border border-[var(--border-primary)] shrink-0">
																Chưa tải
															</span>
														)}

														{/* Latest Stored Indicator */}
														{isLatestStored && (
															<span
																className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/25 shrink-0 flex items-center gap-1"
																title="Chương mới nhất đã tải"
															>
																<Zap size={10} /> Chap gần nhất
															</span>
														)}

														{/* Duplicate indicator */}
														{isDuplicate && (
															<span
																className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 shrink-0"
																title={`Có ${duplicateVariants?.length || 2} bản phát hành cho chương này`}
															>
																Trùng ({duplicateVariants?.length || 2})
															</span>
														)}
													</div>

													{chap.volume ? (
														<span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
															Vol. {chap.volume}
														</span>
													) : (
														<span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 shrink-0">
															No Vol
														</span>
													)}
												</div>

												{/* Chapter Title */}
												{chap.title ? (
													<p
														className="text-xs font-medium text-[var(--text-secondary)] mt-0.5 line-clamp-1 leading-snug break-words"
														title={chap.title}
													>
														{chap.title}
													</p>
												) : (
													<p className="text-[11px] italic text-zinc-400 mt-0.5">
														Không có tiêu đề
													</p>
												)}

												{/* Group, Pages, Uploader, Date & Source Badges */}
												<div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
													<span className="px-2 py-0.5 rounded-md bg-zinc-500/10 border border-[var(--border-primary)] text-[10px] font-medium text-[var(--text-secondary)] truncate max-w-full">
														👥 {chap.group_name || "No Group"}
													</span>
													{chap.pages_count > 0 && (
														<span className="px-1.5 py-0.5 rounded-md bg-zinc-500/10 border border-[var(--border-primary)] text-[10px] font-medium text-[var(--text-secondary)] shrink-0">
															{chap.pages_count} trang
														</span>
													)}
													{chap.uploader && (
														<span
															className="px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-600 dark:text-blue-400 shrink-0 truncate max-w-[120px]"
															title={`Người đăng: ${chap.uploader}`}
														>
															👤 {chap.uploader}
														</span>
													)}
													{chap.publish_at && (
														<span
															className="text-[10px] text-zinc-400 shrink-0"
															title={`Ngày đăng: ${new Date(chap.publish_at).toLocaleString()}`}
														>
															📅{" "}
															{new Date(chap.publish_at).toLocaleDateString()}
														</span>
													)}
													<span className="px-1.5 py-0.5 rounded-md bg-[var(--brand-orange)]/10 border border-[var(--brand-orange)]/20 text-[10px] font-semibold text-[var(--brand-orange)] uppercase shrink-0">
														{chap.source || selectedProvider}
													</span>
												</div>
											</div>
										</button>
									);
								})}
							</div>
						) : (
							<div className="py-8 text-center text-xs text-[var(--text-secondary)]">
								Không tìm thấy chương nào phù hợp với bộ lọc hiện tại.
							</div>
						)}
					</div>
				</div>

				{/* 3. Footer */}
				<div className="px-6 py-4 border-t border-[var(--border-primary)] bg-[var(--bg-card)]/90 backdrop-blur flex flex-col sm:flex-row items-center justify-between gap-3 z-10 shrink-0">
					<div className="text-xs text-[var(--text-secondary)] flex items-center gap-2 flex-wrap">
						<span>
							Đã chọn{" "}
							<strong className="text-[var(--brand-orange)] font-bold text-sm">
								{selectedReleaseIds.size}
							</strong>{" "}
							bản phát hành
						</span>
						{selectedReleaseIds.size > 0 && (
							<button
								type="button"
								onClick={handleClearSelection}
								className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs font-bold transition cursor-pointer flex items-center gap-1 shadow-xs"
								title="Bỏ chọn toàn bộ các chương đã chọn để chọn lại từ đầu"
							>
								<X size={12} />
								<span>Bỏ chọn tất cả</span>
							</button>
						)}
						{duplicatesInfo.uniqueChaptersCount > 0 && (
							<span className="text-zinc-400 hidden sm:inline">
								(tương ứng với các chương của {mangaTitle})
							</span>
						)}
					</div>

					<div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
						<button
							type="button"
							onClick={onClose}
							className="px-5 py-2.5 border border-[var(--border-primary)] rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
						>
							Hủy
						</button>
						<button
							type="button"
							onClick={handleStartDownload}
							disabled={executing || selectedReleaseIds.size === 0}
							className="px-6 py-2.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl shadow-lg transition disabled:opacity-50 flex items-center space-x-2 cursor-pointer disabled:cursor-not-allowed"
						>
							{executing ? (
								<>
									<Loader2 size={14} className="animate-spin" />
									<span>Đang khởi tạo...</span>
								</>
							) : (
								<>
									<Download size={14} />
									<span>Tải xuống ({selectedReleaseIds.size}) chương</span>
								</>
							)}
						</button>
					</div>
				</div>
			</div>

			{/* Append Title Popup Modal */}
			{isTitleModalOpen && (
				<div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
					<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
						<div className="flex justify-between items-center border-b border-[var(--border-primary)] pb-3">
							<div>
								<h3 className="text-base font-bold font-spartan text-[var(--text-primary)]">
									Chọn tên Manga để thêm vào đường dẫn
								</h3>
								<p className="text-xs text-[var(--text-secondary)] mt-0.5">
									Hệ thống sẽ tự động làm sạch các ký tự đặc biệt không hợp lệ
									trên Windows/Linux.
								</p>
							</div>
							<button
								type="button"
								onClick={() => setIsTitleModalOpen(false)}
								className="p-1 rounded-lg text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
							>
								<X size={18} />
							</button>
						</div>

						<div className="space-y-2 max-h-72 overflow-y-auto pr-1">
							{titleOptions.map((opt) => (
								<button
									key={opt.title}
									type="button"
									onClick={() => {
										appendCleanedTitle(opt.title);
										setIsTitleModalOpen(false);
									}}
									className="w-full text-left p-3 border border-[var(--border-primary)] rounded-2xl flex items-center justify-between gap-3 hover:bg-[var(--brand-orange)]/5 hover:border-[var(--brand-orange)]/40 transition cursor-pointer group"
								>
									<div className="min-w-0 flex-1">
										<p className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--brand-orange)] truncate">
											{opt.title}
										</p>
										<p className="text-[10px] text-zinc-400 mt-0.5">
											{opt.label}
										</p>
									</div>
									<Plus
										size={14}
										className="text-zinc-400 group-hover:text-[var(--brand-orange)] shrink-0"
									/>
								</button>
							))}
						</div>

						<div className="pt-3 border-t border-[var(--border-primary)] flex justify-end">
							<button
								type="button"
								onClick={() => setIsTitleModalOpen(false)}
								className="px-4 py-2 border border-[var(--border-primary)] rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
							>
								Đóng
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
