import {
	AlertCircle,
	AlertTriangle,
	Check,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	FileText,
	Layers,
	Library,
	Loader2,
	RotateCw,
	ScanSearch,
	Search,
	Sparkles,
	StopCircle,
	Trash2,
	X,
} from "lucide-react";
import type React from "react";
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import client, { apiErrorMessage, apiUrl } from "../api/client";
import { FullPageModal } from "../components/manga/FullPageModal";
import { PanelCard } from "../components/manga/PanelCard";
import { WordPopover } from "../components/manga/WordPopover";
import { useAlert } from "../hooks/useAlert";
import { notifyTaskCompleted } from "../services/notificationService";
import type { Chapter } from "../types/chapter";
import type {
	GlobalPanelStats,
	GlobalScanStatus,
	PanelResult,
	ScannedMangaItem,
} from "../types/panel";

const SUGGESTED_QUERIES = [
	"devil",
	"chainsaw",
	"dream",
	"kill",
	"friend",
	"blood",
	"school",
	"happy",
];

const SKELETON_SLOTS = [
	"skel-card-1",
	"skel-card-2",
	"skel-card-3",
	"skel-card-4",
	"skel-card-5",
	"skel-card-6",
];

export const PanelWordsDetectorPage: React.FC = () => {
	const { showAlert } = useAlert();

	// Search & Filter state
	const [searchQuery, setSearchQuery] = useState("");
	const [activeQuery, setActiveQuery] = useState("");
	const [selectedMangaId, setSelectedMangaId] = useState<string>("all");
	const [selectedChapterId, setSelectedChapterId] = useState<string>("all");
	const [filterLanguage, setFilterLanguage] = useState<string>("all");
	const [filterScanMode, setFilterScanMode] = useState<string>("all");
	const [pageLimit, setPageLimit] = useState<number>(36);
	const [pageOffset, setPageOffset] = useState<number>(0);

	// Data states
	const [results, setResults] = useState<PanelResult[]>([]);
	const [totalResults, setTotalResults] = useState<number>(0);
	const [loading, setLoading] = useState<boolean>(false);
	const [stats, setStats] = useState<GlobalPanelStats | null>(null);
	const [mangaList, setMangaList] = useState<ScannedMangaItem[]>([]);
	const [chapterList, setChapterList] = useState<Chapter[]>([]);

	// Scanning states
	const [scanStatus, setScanStatus] = useState<GlobalScanStatus | null>(null);
	const [isScanModalOpen, setIsScanModalOpen] = useState(false);
	const [scanTargetMangaIds, setScanTargetMangaIds] = useState<string[]>([]);
	const [scanForceRescan, setScanForceRescan] = useState(false);
	const [scanLanguage, setScanLanguage] = useState<string>("en");
	const [scanMode, setScanMode] = useState<string>("panel");
	const [readingDirection, setReadingDirection] = useState<string>("rtl");
	const [scanChapterLanguage, setScanChapterLanguage] = useState<string>("all");
	const [skipBlankPages, setSkipBlankPages] = useState<boolean>(true);
	const [skipDuplicateCredits, setSkipDuplicateCredits] =
		useState<boolean>(true);
	const [startingScan, setStartingScan] = useState(false);
	const [cancellingScan, setCancellingScan] = useState(false);
	const [isDeletingAllPanels, setIsDeletingAllPanels] =
		useState<boolean>(false);
	const [showDeleteAllConfirm, setShowDeleteAllConfirm] =
		useState<boolean>(false);

	// Modals & Popover states
	const [selectedFullPagePanel, setSelectedFullPagePanel] =
		useState<PanelResult | null>(null);
	const [popoverWord, setPopoverWord] = useState<string | null>(null);
	const [popoverPosition, setPopoverPosition] = useState<{
		x: number;
		y: number;
	} | null>(null);

	const [loadError, setLoadError] = useState("");
	const searchRequestRef = useRef<AbortController | null>(null);
	const searchSequenceRef = useRef(0);
	useEffect(
		() => () => {
			searchRequestRef.current?.abort();
		},
		[],
	);

	// SSE ref
	const eventSourceRef = useRef<EventSource | null>(null);

	// Fetch initial stats and manga list
	const fetchTelemetry = useCallback(async () => {
		try {
			const [statsRes, mangasRes] = await Promise.all([
				client.get("/api/panels/stats"),
				client.get("/api/panels/mangas"),
			]);
			setLoadError("");
			setStats(statsRes.data);
			setMangaList(mangasRes.data || []);
		} catch (err) {
			setLoadError(
				apiErrorMessage(err, "Không tải được thống kê detector. Hãy thử lại."),
			);
		}
	}, []);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- State updates follow the async HTTP request.
		void fetchTelemetry();
	}, [fetchTelemetry]);

	// Fetch chapters for selected manga filter
	useEffect(() => {
		if (!selectedMangaId || selectedMangaId === "all") {
			return;
		}

		const controller = new AbortController();
		const fetchChapters = async () => {
			try {
				const res = await client.get(`/api/manga/${selectedMangaId}/chapters`, {
					signal: controller.signal,
				});
				if (!controller.signal.aborted) setChapterList(res.data.chapters || []);
			} catch (err) {
				if (!controller.signal.aborted) {
					setLoadError(
						apiErrorMessage(err, "Không tải được danh sách chương."),
					);
					setChapterList([]);
				}
			}
		};
		fetchChapters();
		return () => controller.abort();
	}, [selectedMangaId]);

	// Search execution
	const executeSearch = async (
		query: string,
		offset: number = 0,
		mangaId: string = selectedMangaId,
		chapterId: string = selectedChapterId,
		limit: number = pageLimit,
		lang: string = filterLanguage,
		mode: string = filterScanMode,
	) => {
		searchRequestRef.current?.abort();
		const controller = new AbortController();
		searchRequestRef.current = controller;
		const sequence = ++searchSequenceRef.current;
		const trimmed = query.trim();
		if (!trimmed) {
			setResults([]);
			setTotalResults(0);
			setActiveQuery("");
			return;
		}

		try {
			setLoading(true);
			setActiveQuery(trimmed);

			const params: Record<string, string | number> = {
				q: trimmed,
				limit,
				offset: offset,
			};

			if (mangaId && mangaId !== "all") {
				params.manga_id = mangaId;
			}
			if (chapterId && chapterId !== "all") {
				params.chapter_id = chapterId;
			}
			if (lang && lang !== "all") {
				params.language = lang;
			}
			if (mode && mode !== "all") {
				params.scan_mode = mode;
			}

			const res = await client.get("/api/panels/search", {
				params,
				signal: controller.signal,
			});
			if (sequence !== searchSequenceRef.current || controller.signal.aborted)
				return;
			setResults(res.data.results || []);
			setTotalResults(res.data.total || 0);
			setPageOffset(offset);
		} catch (err: unknown) {
			if (sequence !== searchSequenceRef.current || controller.signal.aborted)
				return;
			setResults([]);
			setTotalResults(0);
			console.error("Search failed:", err);
			showAlert({
				title: "Lỗi tìm kiếm",
				message: apiErrorMessage(err, "Không thể thực hiện tìm kiếm panels."),
				type: "error",
			});
		} finally {
			if (sequence === searchSequenceRef.current) setLoading(false);
		}
	};

	const onScanProgress = useEffectEvent((data: GlobalScanStatus) => {
		setScanStatus(data);
		if (
			["completed", "cancelled", "error"].includes(data.stage) &&
			!data.is_scanning
		) {
			if (data.stage === "completed") {
				notifyTaskCompleted({
					title: "Quét thư viện hoàn tất!",
					message: `Hệ thống đã phân tích xong ${data.total_pages || 0} trang trên toàn bộ thư viện.`,
					badge: "QUÉT HOÀN TẤT",
					type: "success",
				});
			}
			void fetchTelemetry();
			if (activeQuery)
				void executeSearch(
					activeQuery,
					pageOffset,
					selectedMangaId,
					selectedChapterId,
				);
		}
	});

	useEffect(() => {
		const sse = new EventSource(apiUrl("/api/panels/scan-progress"));
		eventSourceRef.current = sse;
		sse.onmessage = (event) => {
			try {
				onScanProgress(JSON.parse(event.data));
			} catch (error) {
				console.error("Invalid scan progress event", error);
			}
		};
		return () => {
			sse.close();
			eventSourceRef.current = null;
		};
	}, []);

	const handleSearchSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setPageOffset(0);
		executeSearch(searchQuery, 0);
	};

	const handleClearSearch = () => {
		searchRequestRef.current?.abort();
		++searchSequenceRef.current;
		setLoading(false);
		setSearchQuery("");
		setActiveQuery("");
		setResults([]);
		setTotalResults(0);
		setPageOffset(0);
	};

	const handleTagClick = (tag: string) => {
		setSearchQuery(tag);
		setPageOffset(0);
		executeSearch(tag, 0);
	};

	// Pagination Handlers
	const totalPages = Math.ceil(totalResults / pageLimit);
	const currentPage = Math.floor(pageOffset / pageLimit) + 1;

	const handlePageChange = (newPage: number) => {
		if (newPage < 1 || newPage > totalPages) return;
		const nextOffset = (newPage - 1) * pageLimit;
		setPageOffset(nextOffset);
		executeSearch(activeQuery, nextOffset);
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	// Dictionary Lookup Handler
	const handleWordClick = (word: string, event: React.MouseEvent) => {
		setPopoverWord(word);
		setPopoverPosition({ x: event.clientX, y: event.clientY });
	};

	// Trigger Global Scan
	const handleStartScan = async () => {
		if (!scanTargetMangaIds.length) return;
		try {
			setStartingScan(true);
			setScanStatus({
				total_mangas: scanTargetMangaIds.length,
				total_manga: scanTargetMangaIds.length,
				mangas_scanned: 0,
				current_manga_index: 0,
				current_manga_title: "Đang khởi tạo tác vụ quét...",
				total_pages: 0,
				current_page: 0,
				panels_extracted: 0,
				percent: 0,
				stage: "initializing",
				message: "Đang khởi tạo worker và chuẩn bị quét...",
				is_scanning: true,
			});
			setStats((prev) => (prev ? { ...prev, is_scanning: true } : prev));
			setIsScanModalOpen(false);

			const payload: {
				force_rescan: boolean;
				manga_ids?: string[];
				language?: string;
				scan_mode?: string;
				reading_direction?: string;
				chapter_language?: string;
				skip_blank_pages?: boolean;
				skip_duplicate_credits?: boolean;
			} = {
				force_rescan: scanForceRescan,
				language: scanLanguage,
				scan_mode: scanMode,
				reading_direction: readingDirection,
				chapter_language: scanChapterLanguage,
				skip_blank_pages: skipBlankPages,
				skip_duplicate_credits: skipDuplicateCredits,
			};
			if (scanTargetMangaIds.length > 0) {
				payload.manga_ids = scanTargetMangaIds;
			}

			await client.post("/api/panels/scan", payload);
			const status = await client.get("/api/panels/scan-status");
			setScanStatus(status.data);
			showAlert({
				title: "Bắt đầu quét",
				message:
					"Hệ thống đang tiến hành nhận diện thị giác & trích xuất lời thoại.",
				type: "info",
			});
		} catch (err: unknown) {
			console.error("Failed to start scan:", err);
			showAlert({
				title: "Khởi động quét thất bại",
				message: apiErrorMessage(err, "Không thể khởi động tác vụ quét."),
				type: "error",
			});
			setStats((prev) => (prev ? { ...prev, is_scanning: false } : prev));
		} finally {
			setStartingScan(false);
		}
	};

	const handleDeleteAllPanels = async () => {
		setIsDeletingAllPanels(true);
		try {
			await client.delete("/api/panels/all");
			setShowDeleteAllConfirm(false);
			showAlert({
				title: "Thành công",
				message: "Đã xóa toàn bộ metadata khung tranh trên toàn hệ thống.",
				type: "success",
			});
			void fetchTelemetry();
			setResults([]);
			setTotalResults(0);
		} catch (err) {
			showAlert({
				title: "Lỗi",
				message: apiErrorMessage(err, "Không thể xóa toàn bộ dữ liệu panel."),
				type: "error",
			});
		} finally {
			setIsDeletingAllPanels(false);
		}
	};

	// Cancel Scan
	const handleCancelScan = async () => {
		try {
			setCancellingScan(true);
			await client.post("/api/panels/scan/cancel");
			showAlert({
				title: "Dừng tác vụ",
				message: "Đã gửi yêu cầu dừng quét thư viện.",
				type: "warning",
			});
		} catch (err: unknown) {
			console.error("Failed to cancel scan:", err);
		} finally {
			setCancellingScan(false);
		}
	};

	const isScanning = Boolean(scanStatus?.is_scanning);

	return (
		<div className="flex-1 p-0 sm:p-4 md:p-6 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-300">
			{loadError && (
				<div
					role="alert"
					className="rounded-xl border border-red-500/40 p-4 text-red-500"
				>
					{loadError}{" "}
					<button type="button" onClick={fetchTelemetry} className="underline">
						Thử lại
					</button>
				</div>
			)}
			{/* 1. Header Banner & Telemetry Hero */}
			<div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-amber-500/10 via-zinc-900/40 to-amber-500/5 border border-amber-500/20 p-6 md:p-8 backdrop-blur-md shadow-xl">
				<div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
					<div className="space-y-2">
						<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold tracking-wide uppercase">
							<ScanSearch size={14} />
							<span>Thị giác Máy tính & Nhận diện Kịch bản Toàn Thư viện</span>
						</div>
						<h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[var(--text-primary)] font-spartan">
							Panel Words <span className="text-amber-500">Detector</span>
						</h1>
						<p className="text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
							Tìm lời thoại trong các trang truyện đã tải, xem khung tranh chứa
							câu nói và tra từ ngay trong ngữ cảnh. Tra từ và phân tích từ vựng
							hiện hỗ trợ tiếng Anh; kết quả nhận diện có thể cần đối chiếu với
							ảnh gốc.
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-3">
						<button
							type="button"
							onClick={() => setShowDeleteAllConfirm(true)}
							disabled={isScanning || !stats?.total_panels}
							className="flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
							title="Xóa toàn bộ dữ liệu khung tranh đã quét của toàn bộ manga trên hệ thống"
						>
							<Trash2 size={16} />
							<span>Xóa toàn bộ dữ liệu quét</span>
						</button>

						<button
							type="button"
							onClick={() => {
								setScanTargetMangaIds(mangaList.map((m) => m.manga_id));
								setScanForceRescan(false);
								setIsScanModalOpen(true);
							}}
							disabled={isScanning}
							className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm shadow-lg transition-all cursor-pointer ${
								isScanning
									? "bg-zinc-800 text-zinc-400 border border-zinc-700 cursor-not-allowed"
									: "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 shadow-amber-500/25 hover:scale-[1.02] active:scale-[0.98]"
							}`}
						>
							{isScanning ? (
								<>
									<Loader2 size={16} className="animate-spin" />
									<span>Đang quét thư viện...</span>
								</>
							) : (
								<>
									<RotateCw size={16} />
									<span>Quét & Trích xuất Thư viện</span>
								</>
							)}
						</button>
					</div>
				</div>

				{/* Telemetry Stat Cards */}
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-[var(--border-primary)]/40">
					<div className="p-4 rounded-2xl bg-[var(--bg-card)]/60 border border-[var(--border-primary)]">
						<div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] mb-1">
							<Layers size={14} className="text-amber-500" />
							<span>Tổng Panels</span>
						</div>
						<div className="text-2xl font-extrabold text-[var(--text-primary)] font-mono">
							{stats?.total_panels?.toLocaleString() || 0}
						</div>
					</div>

					<div className="p-4 rounded-2xl bg-[var(--bg-card)]/60 border border-[var(--border-primary)]">
						<div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] mb-1">
							<FileText size={14} className="text-amber-500" />
							<span>Trang đã quét</span>
						</div>
						<div className="text-2xl font-extrabold text-[var(--text-primary)] font-mono">
							{stats?.total_pages_scanned?.toLocaleString() || 0}
						</div>
					</div>

					<div className="p-4 rounded-2xl bg-[var(--bg-card)]/60 border border-[var(--border-primary)]">
						<div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] mb-1">
							<Library size={14} className="text-amber-500" />
							<span>Bộ Manga bao phủ</span>
						</div>
						<div className="text-2xl font-extrabold text-[var(--text-primary)] font-mono">
							{stats?.total_mangas_scanned || 0}
						</div>
					</div>

					<div className="p-4 rounded-2xl bg-[var(--bg-card)]/60 border border-[var(--border-primary)]">
						<div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] mb-1">
							<Sparkles size={14} className="text-amber-500" />
							<span>Từ vựng trích xuất</span>
						</div>
						<div className="text-2xl font-extrabold text-amber-500 font-mono">
							{stats?.total_unique_words?.toLocaleString() || 0}
						</div>
					</div>
				</div>
			</div>

			{/* 2. Real-time Scan Progress Card (Shows when scanning or just completed) */}
			{scanStatus &&
				(isScanning ||
					scanStatus.stage === "completed" ||
					scanStatus.stage === "error") && (
					<div
						className={`p-5 rounded-2xl border transition-all duration-300 shadow-md ${
							isScanning
								? "bg-amber-500/5 border-amber-500/30"
								: scanStatus.stage === "completed"
									? "bg-emerald-500/5 border-emerald-500/30"
									: "bg-red-500/5 border-red-500/30"
						}`}
					>
						<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
							<div className="flex items-center gap-3">
								{isScanning ? (
									<div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 animate-spin">
										<Loader2 size={18} />
									</div>
								) : scanStatus.stage === "completed" ? (
									<div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400">
										<CheckCircle2 size={18} />
									</div>
								) : (
									<div className="p-2.5 rounded-xl bg-red-500/20 text-red-400">
										<AlertCircle size={18} />
									</div>
								)}

								<div>
									<div className="flex items-center gap-2">
										<span className="text-xs font-bold uppercase tracking-wider text-amber-500">
											{scanStatus.stage === "ocr_processing"
												? "Đang nhận diện Thị giác & OCR"
												: scanStatus.stage === "indexing"
													? "Đang lập chỉ mục Database"
													: scanStatus.stage === "completed"
														? "Hoàn tất quét toàn bộ"
														: "Trạng thái tác vụ"}
										</span>
										{scanStatus.current_manga_title && (
											<span className="text-xs font-semibold text-[var(--text-primary)] px-2 py-0.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border-primary)]">
												{scanStatus.current_manga_title}
											</span>
										)}
									</div>
									<p className="text-xs text-[var(--text-secondary)] mt-0.5">
										{scanStatus.message}
									</p>
								</div>
							</div>

							<div className="flex items-center gap-4">
								<div className="text-right">
									<div className="text-sm font-extrabold font-mono text-[var(--text-primary)]">
										{scanStatus.percent}%
									</div>
									<div className="text-[10px] text-[var(--text-secondary)] font-mono">
										{scanStatus.current_page} / {scanStatus.total_pages} trang
									</div>
								</div>

								{isScanning && (
									<button
										type="button"
										onClick={handleCancelScan}
										disabled={cancellingScan}
										className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold transition cursor-pointer"
										title="Dừng tác vụ quét hiện tại"
									>
										<StopCircle size={14} />
										<span>{cancellingScan ? "Đang dừng..." : "Dừng lại"}</span>
									</button>
								)}
							</div>
						</div>

						{/* Progress bar */}
						<div className="w-full h-1.5 bg-zinc-800 rounded-full mt-4 overflow-hidden">
							<div
								className={`h-full transition-all duration-300 ${
									isScanning
										? "bg-amber-500"
										: scanStatus.stage === "completed"
											? "bg-emerald-500"
											: "bg-red-500"
								}`}
								style={{ width: `${scanStatus.percent}%` }}
							/>
						</div>
					</div>
				)}

			{/* 3. Global Search & Filter Bar */}
			<div className="space-y-4">
				<form
					onSubmit={handleSearchSubmit}
					className="relative flex flex-col md:flex-row gap-3"
				>
					{/* Main search text input */}
					<div className="relative flex-1">
						<Search
							size={18}
							className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
						/>
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Nhập từ khóa, cụm hội thoại hoặc bổ đề cần tra cứu (ví dụ: devil, chainsaw, dream, friend)..."
							className="w-full pl-11 pr-10 py-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/60 outline-hidden transition shadow-xs"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={handleClearSearch}
								className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-full hover:bg-zinc-700/30 transition cursor-pointer"
							>
								<X size={16} />
							</button>
						)}
					</div>

					{/* Manga Series Filter Dropdown */}
					<div className="w-full md:w-60">
						<select
							value={selectedMangaId}
							onChange={(e) => {
								setSelectedMangaId(e.target.value);
								setSelectedChapterId("all");
								setChapterList([]);
								setPageOffset(0);
								if (searchQuery.trim()) {
									executeSearch(searchQuery, 0, e.target.value, "all");
								}
							}}
							className="w-full py-3.5 px-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] focus:border-amber-500 text-sm text-[var(--text-primary)] outline-hidden cursor-pointer"
						>
							<option value="all">Tất cả Manga ({mangaList.length} bộ)</option>
							{mangaList.map((m) => (
								<option key={m.manga_id} value={m.manga_id}>
									{m.title} ({m.panels_count} panels)
								</option>
							))}
						</select>
					</div>

					{/* Chapter Filter Dropdown (Enabled when a specific manga is selected) */}
					{selectedMangaId !== "all" && chapterList.length > 0 && (
						<div className="w-full md:w-44">
							<select
								value={selectedChapterId}
								onChange={(e) => {
									setSelectedChapterId(e.target.value);
									setPageOffset(0);
									if (searchQuery.trim()) {
										executeSearch(
											searchQuery,
											0,
											selectedMangaId,
											e.target.value,
											pageLimit,
											filterLanguage,
											filterScanMode,
										);
									}
								}}
								className="w-full py-3.5 px-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] focus:border-amber-500 text-xs font-bold text-[var(--text-primary)] outline-hidden cursor-pointer"
							>
								<option value="all">
									Tất cả Chapter ({chapterList.length})
								</option>
								{chapterList.map((c) => (
									<option key={c.id} value={c.id}>
										Ch. {c.chapter_number}
										{c.title ? ` - ${c.title}` : ""}
									</option>
								))}
							</select>
						</div>
					)}

					{/* Language Filter Dropdown */}
					<div className="w-full md:w-36">
						<select
							value={filterLanguage}
							onChange={(e) => {
								setFilterLanguage(e.target.value);
								setPageOffset(0);
								if (searchQuery.trim()) {
									executeSearch(
										searchQuery,
										0,
										selectedMangaId,
										selectedChapterId,
										pageLimit,
										e.target.value,
										filterScanMode,
									);
								}
							}}
							className="w-full py-3.5 px-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] focus:border-amber-500 text-xs font-bold text-[var(--text-primary)] outline-hidden cursor-pointer"
						>
							<option value="all">Mọi ngôn ngữ</option>
							<option value="en">Tiếng Anh (EN)</option>
							<option value="vi">Tiếng Việt (VI)</option>
						</select>
					</div>

					{/* Scan Mode Filter Dropdown */}
					<div className="w-full md:w-40">
						<select
							value={filterScanMode}
							onChange={(e) => {
								setFilterScanMode(e.target.value);
								setPageOffset(0);
								if (searchQuery.trim()) {
									executeSearch(
										searchQuery,
										0,
										selectedMangaId,
										selectedChapterId,
										pageLimit,
										filterLanguage,
										e.target.value,
									);
								}
							}}
							className="w-full py-3.5 px-3 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] focus:border-amber-500 text-xs font-bold text-[var(--text-primary)] outline-hidden cursor-pointer"
						>
							<option value="all">Mọi chế độ</option>
							<option value="panel">Khung tranh (Panel)</option>
							<option value="bubble">Bong bóng (Bubble)</option>
							<option value="fullpage">Toàn trang (Full-page)</option>
						</select>
					</div>

					{/* Submit Search Button */}
					<button
						type="submit"
						disabled={loading}
						className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm shadow-md shadow-amber-500/20 transition cursor-pointer shrink-0"
					>
						{loading ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							<Search size={16} />
						)}
						<span>Tìm kiếm</span>
					</button>
				</form>

				{/* Suggested Quick Keyword Chips */}
				<div className="flex items-center flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
					<span className="font-semibold text-[11px] text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1">
						<Sparkles size={12} className="text-amber-500" />
						Gợi ý từ khóa:
					</span>
					{SUGGESTED_QUERIES.map((q) => (
						<button
							key={q}
							type="button"
							onClick={() => handleTagClick(q)}
							className="px-2.5 py-1 rounded-lg bg-[var(--bg-card)] hover:bg-amber-500/15 hover:text-amber-400 border border-[var(--border-primary)] hover:border-amber-500/40 text-[11px] font-mono transition cursor-pointer"
						>
							#{q}
						</button>
					))}
				</div>
			</div>

			{/* 4. Search Results Content Area */}
			<div className="space-y-6">
				{/* Results Header Meta */}
				{activeQuery && (
					<div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[var(--border-primary)]/60">
						<div className="text-sm text-[var(--text-secondary)]">
							Tìm thấy{" "}
							<span className="font-bold text-amber-500 font-mono">
								{totalResults.toLocaleString()}
							</span>{" "}
							panels chứa từ khóa &quot;
							<span className="font-semibold text-[var(--text-primary)]">
								{activeQuery}
							</span>
							&quot;
							{selectedMangaId !== "all" && (
								<span className="ml-1 text-xs text-[var(--text-secondary)]">
									(trong bộ{" "}
									{mangaList.find((m) => m.manga_id === selectedMangaId)
										?.title || "đã chọn"}
									)
								</span>
							)}
						</div>

						{/* Results limit selector */}
						<div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
							<span>Hiển thị:</span>
							{[24, 36, 48].map((lim) => (
								<button
									key={lim}
									type="button"
									onClick={() => {
										setPageLimit(lim);
										setPageOffset(0);
										executeSearch(
											activeQuery,
											0,
											selectedMangaId,
											selectedChapterId,
											lim,
										);
									}}
									className={`px-2 py-0.5 rounded-md font-mono transition cursor-pointer ${
										pageLimit === lim
											? "bg-amber-500 text-zinc-950 font-bold"
											: "bg-[var(--bg-card)] hover:bg-zinc-800 text-[var(--text-secondary)]"
									}`}
								>
									{lim}
								</button>
							))}
						</div>
					</div>
				)}

				{/* Loading State Skeleton */}
				{loading && (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{SKELETON_SLOTS.map((slotId) => (
							<div
								key={slotId}
								className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-card)]/50 p-4 space-y-4 animate-pulse"
							>
								<div className="flex items-center gap-3">
									<div className="w-8 h-11 bg-zinc-800 rounded-md" />
									<div className="space-y-1.5 flex-1">
										<div className="h-3 w-3/4 bg-zinc-800 rounded" />
										<div className="h-2.5 w-1/2 bg-zinc-800/60 rounded" />
									</div>
								</div>
								<div className="w-full aspect-[4/3] bg-zinc-800 rounded-xl" />
								<div className="space-y-2">
									<div className="h-3 w-full bg-zinc-800 rounded" />
									<div className="h-3 w-4/5 bg-zinc-800 rounded" />
								</div>
							</div>
						))}
					</div>
				)}

				{/* Empty State: Initial Visit */}
				{!loading && !activeQuery && (
					<div className="p-12 text-center rounded-3xl bg-[var(--bg-card)]/40 border border-dashed border-[var(--border-primary)] max-w-xl mx-auto space-y-4">
						<div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto border border-amber-500/20">
							<ScanSearch size={32} />
						</div>
						<div className="space-y-1">
							<h3 className="text-base font-bold text-[var(--text-primary)]">
								Tra cứu hội thoại & khung tranh toàn hệ thống
							</h3>
							<p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
								Nhập bất kỳ từ vựng hoặc câu thoại nào vào thanh tìm kiếm ở trên
								để xem chính xác khung cảnh xuất hiện, kèm theo manga, volume,
								chapter và số trang gốc.
							</p>
						</div>
					</div>
				)}

				{/* Empty State: No Results */}
				{!loading && activeQuery && results.length === 0 && (
					<div className="p-12 text-center rounded-3xl bg-[var(--bg-card)]/40 border border-dashed border-[var(--border-primary)] max-w-xl mx-auto space-y-4">
						<div className="w-16 h-16 rounded-2xl bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
							<Search size={28} />
						</div>
						<div className="space-y-1">
							<h3 className="text-base font-bold text-[var(--text-primary)]">
								Không tìm thấy panel nào phù hợp với &quot;{activeQuery}&quot;
							</h3>
							<p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
								Hãy thử tìm kiếm với các từ đơn, từ đồng nghĩa hoặc bấm nút{" "}
								<strong className="text-amber-500">
									&quot;Quét & Trích xuất Thư viện&quot;
								</strong>{" "}
								để phân tích thêm các manga khác trong hệ thống.
							</p>
						</div>
					</div>
				)}

				{/* Results Grid */}
				{!loading && results.length > 0 && (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{results.map((panel) => (
							<PanelCard
								key={panel.panel_id}
								panel={panel}
								searchQuery={activeQuery}
								onOpenFullPage={(p) => setSelectedFullPagePanel(p)}
								onWordClick={handleWordClick}
							/>
						))}
					</div>
				)}

				{/* 5. Pagination Controls */}
				{!loading && totalPages > 1 && (
					<div className="pt-6 border-t border-[var(--border-primary)] flex items-center justify-between flex-wrap gap-4">
						<div className="text-xs text-[var(--text-secondary)] font-mono">
							Trang{" "}
							<span className="font-bold text-[var(--text-primary)]">
								{currentPage}
							</span>{" "}
							/ {totalPages} (Tổng {totalResults.toLocaleString()} panels)
						</div>

						<div className="flex items-center gap-1.5">
							<button
								type="button"
								onClick={() => handlePageChange(currentPage - 1)}
								disabled={currentPage <= 1}
								className="p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
								title="Trang trước"
							>
								<ChevronLeft size={16} />
							</button>

							{/* Page numbers */}
							{Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
								let pNum = currentPage - 2 + i;
								if (pNum < 1) pNum = 1 + i;
								if (pNum > totalPages) return null;

								return (
									<button
										key={pNum}
										type="button"
										onClick={() => handlePageChange(pNum)}
										className={`w-9 h-9 rounded-xl font-mono text-xs font-bold transition cursor-pointer ${
											currentPage === pNum
												? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20"
												: "bg-[var(--bg-card)] border border-[var(--border-primary)] hover:bg-zinc-800 text-[var(--text-secondary)]"
										}`}
									>
										{pNum}
									</button>
								);
							})}

							<button
								type="button"
								onClick={() => handlePageChange(currentPage + 1)}
								disabled={currentPage >= totalPages}
								className="p-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-primary)] hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
								title="Trang tiếp theo"
							>
								<ChevronRight size={16} />
							</button>
						</div>
					</div>
				)}
			</div>

			{/* 6. Scan Manager Modal */}
			{isScanModalOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
					<div className="w-full max-w-lg rounded-3xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
						<div className="p-6 border-b border-[var(--border-primary)] flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
									<RotateCw size={20} />
								</div>
								<div>
									<h3 className="text-base font-bold text-[var(--text-primary)]">
										Quét & Trích xuất Đặc trưng Thư viện
									</h3>
									<p className="text-xs text-[var(--text-secondary)]">
										Phân tích ảnh toàn bộ các chapter đã tải xuống trên hệ thống
									</p>
								</div>
							</div>

							<button
								type="button"
								onClick={() => setIsScanModalOpen(false)}
								className="p-1.5 rounded-xl hover:bg-zinc-800 text-[var(--text-secondary)] transition cursor-pointer"
							>
								<X size={18} />
							</button>
						</div>

						<div className="p-6 space-y-5 overflow-y-auto flex-1 text-sm text-[var(--text-primary)]">
							{/* Language Selection */}
							<div className="grid grid-cols-2 gap-3 pt-1">
								<div>
									<label className="text-xs font-bold text-[var(--text-primary)] block mb-1">
										Ngôn ngữ truyện:
										<select
											value={scanLanguage}
											onChange={(e) => setScanLanguage(e.target.value)}
											className="w-full px-3 py-2 mt-1 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] text-xs font-bold text-[var(--text-primary)] focus:border-amber-500 transition cursor-pointer"
										>
											<option value="en">Tiếng Anh (English)</option>
											<option value="vi">Tiếng Việt (Vietnamese)</option>
										</select>
									</label>
								</div>

								<div>
									<label className="text-xs font-bold text-[var(--text-primary)] block mb-1">
										Thứ tự đọc (Direction):
										<select
											value={readingDirection}
											onChange={(e) => setReadingDirection(e.target.value)}
											className="w-full px-3 py-2 mt-1 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] text-xs font-bold text-[var(--text-primary)] focus:border-amber-500 transition cursor-pointer"
										>
											<option value="rtl">Phải sang Trái (RTL - Manga)</option>
											<option value="ltr">
												Trái sang Phải (LTR - Webtoon/Comic)
											</option>
										</select>
									</label>
								</div>
							</div>

							{/* Scan Mode Selection */}
							<div className="pt-1">
								<label className="text-xs font-bold text-[var(--text-primary)] block mb-1">
									Chế độ bóc tách thị giác (Scan Mode):
									<select
										value={scanMode}
										onChange={(e) => setScanMode(e.target.value)}
										className="w-full px-3 py-2 mt-1 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] text-xs font-bold text-[var(--text-primary)] focus:border-amber-500 transition cursor-pointer"
									>
										<option value="panel">
											Khung tranh Manga (Phân ô + Gom cụm thoại ngoài khung)
										</option>
										<option value="bubble">
											Bong bóng thoại (Speech Bubble Clustering -
											MangaTranslator)
										</option>
										<option value="fullpage">
											Toàn trang tranh (Webtoon / Cuộn dọc không viền)
										</option>
									</select>
								</label>
							</div>

							{/* Chapter Language Selection */}
							<div className="pt-1">
								<label className="text-xs font-bold text-[var(--text-primary)] block mb-1">
									Lọc ngôn ngữ Chapter nguồn (Chapter Language Filter):
									<select
										value={scanChapterLanguage}
										onChange={(e) => setScanChapterLanguage(e.target.value)}
										className="w-full px-3 py-2 mt-1 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] text-xs font-bold text-[var(--text-primary)] focus:border-amber-500 transition cursor-pointer"
									>
										<option value="all">
											Tất cả các ngôn ngữ (All Chapters)
										</option>
										<option value="en">Chỉ quét chapter tiếng Anh (en)</option>
										<option value="vi">Chỉ quét chapter tiếng Việt (vi)</option>
									</select>
								</label>
							</div>

							{/* Force Rescan Checkbox */}
							<label className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] cursor-pointer">
								<input
									type="checkbox"
									checked={scanForceRescan}
									onChange={(e) => setScanForceRescan(e.target.checked)}
									className="mt-0.5 rounded border-zinc-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
								/>
								<div className="space-y-0.5">
									<div className="font-semibold text-xs text-[var(--text-primary)]">
										Quét lại toàn bộ (Bỏ qua cache các trang đã quét)
									</div>
									<div className="text-[11px] text-[var(--text-secondary)]">
										Mặc định hệ thống sẽ tự động bỏ qua những trang đã có dữ
										liệu trong Database để tiết kiệm tài nguyên. Bật tùy chọn
										này nếu bạn muốn phân tích lại từ đầu.
									</div>
								</div>
							</label>

							{/* Skip Blank Pages */}
							<label className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] cursor-pointer">
								<input
									type="checkbox"
									checked={skipBlankPages}
									onChange={(e) => setSkipBlankPages(e.target.checked)}
									className="mt-0.5 rounded border-zinc-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
								/>
								<div className="space-y-0.5">
									<div className="font-semibold text-xs text-[var(--text-primary)]">
										Tự động bỏ qua trang trắng / đen / đơn sắc
									</div>
									<div className="text-[11px] text-[var(--text-secondary)]">
										Loại bỏ các trang chuyển cảnh hoặc trang không có nét vẽ /
										lời thoại để tăng tốc quét.
									</div>
								</div>
							</label>

							{/* Skip Duplicate Credits */}
							<label className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] cursor-pointer">
								<input
									type="checkbox"
									checked={skipDuplicateCredits}
									onChange={(e) => setSkipDuplicateCredits(e.target.checked)}
									className="mt-0.5 rounded border-zinc-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
								/>
								<div className="space-y-0.5">
									<div className="font-semibold text-xs text-[var(--text-primary)]">
										Khử trang credit nhóm dịch trùng lặp (Perceptual Hash)
									</div>
									<div className="text-[11px] text-[var(--text-secondary)]">
										Tự động nhận diện và bỏ qua trang credit/watermark xuất hiện
										lặp lại giữa các chapter.
									</div>
								</div>
							</label>

							{/* Manga Selection List */}
							<div className="space-y-2">
								<div className="flex items-center justify-between text-xs">
									<span className="font-bold text-[var(--text-secondary)] uppercase tracking-wider">
										Chọn Manga để quét (
										{`${scanTargetMangaIds.length} bộ đã chọn`})
									</span>
									<div className="flex items-center gap-2 text-[11px]">
										<button
											type="button"
											onClick={() =>
												setScanTargetMangaIds(mangaList.map((m) => m.manga_id))
											}
											className="text-amber-500 hover:underline cursor-pointer"
										>
											Chọn tất cả
										</button>
										<span>•</span>
										<button
											type="button"
											onClick={() => setScanTargetMangaIds([])}
											className="text-amber-500 hover:underline cursor-pointer"
										>
											Bỏ chọn tất cả
										</button>
									</div>
								</div>

								<div className="max-h-56 overflow-y-auto space-y-1.5 border border-[var(--border-primary)] rounded-2xl p-2 bg-[var(--bg-primary)]/50">
									{mangaList.map((m) => {
										const isSelected = scanTargetMangaIds.includes(m.manga_id);

										return (
											<button
												type="button"
												key={m.manga_id}
												onClick={() => {
													if (scanTargetMangaIds.includes(m.manga_id)) {
														const filtered = scanTargetMangaIds.filter(
															(id) => id !== m.manga_id,
														);
														setScanTargetMangaIds(filtered);
													} else {
														setScanTargetMangaIds([
															...scanTargetMangaIds,
															m.manga_id,
														]);
													}
												}}
												className={`w-full text-left flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer text-xs ${
													isSelected
														? "bg-amber-500/10 border-amber-500/40 text-[var(--text-primary)]"
														: "bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-secondary)] opacity-60 hover:opacity-100"
												}`}
											>
												<div className="flex items-center gap-2.5 min-w-0">
													<div className="w-5 h-7 rounded bg-zinc-800 overflow-hidden shrink-0">
														{m.cover_url ? (
															<img
																src={m.cover_url}
																alt=""
																className="w-full h-full object-cover"
															/>
														) : null}
													</div>
													<span className="font-semibold truncate">
														{m.title}
													</span>
												</div>

												<div className="flex items-center gap-3 shrink-0 text-[11px] font-mono">
													<span>{m.chapters_count} chaps</span>
													<span className="text-amber-500">
														{m.panels_count} panels
													</span>
													{isSelected && (
														<Check size={14} className="text-amber-500" />
													)}
												</div>
											</button>
										);
									})}
								</div>
							</div>
						</div>

						<div className="p-6 border-t border-[var(--border-primary)] flex items-center justify-end gap-3 bg-[var(--bg-primary)]/40">
							<button
								type="button"
								onClick={() => setIsScanModalOpen(false)}
								className="px-4 py-2.5 rounded-xl hover:bg-zinc-800 text-[var(--text-secondary)] font-semibold text-xs transition cursor-pointer"
							>
								Hủy bỏ
							</button>

							<button
								type="button"
								onClick={handleStartScan}
								disabled={startingScan || scanTargetMangaIds.length === 0}
								className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition cursor-pointer"
							>
								{startingScan ? (
									<Loader2 size={14} className="animate-spin" />
								) : (
									<RotateCw size={14} />
								)}
								<span>Bắt đầu quét</span>
							</button>
						</div>
					</div>
				</div>
			)}

			{/* 6.5. Delete All Panels Confirmation Modal */}
			{showDeleteAllConfirm && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
					<div className="relative w-full max-w-md p-6 rounded-3xl bg-[var(--bg-card)] border border-red-500/40 shadow-2xl space-y-4">
						<div className="flex items-center space-x-3 text-red-500">
							<AlertTriangle size={24} />
							<h3 className="text-lg font-bold text-[var(--text-primary)]">
								Xác nhận xóa toàn bộ dữ liệu quét
							</h3>
						</div>
						<p className="text-xs text-[var(--text-secondary)] leading-relaxed">
							Hành động này sẽ xóa vĩnh viễn toàn bộ các khung tranh, dữ liệu
							OCR và từ vựng đã trích xuất của tất cả manga trong toàn bộ hệ
							thống. Bạn có chắc chắn muốn tiếp tục?
						</p>
						<div className="flex justify-end space-x-3 pt-2">
							<button
								type="button"
								onClick={() => setShowDeleteAllConfirm(false)}
								disabled={isDeletingAllPanels}
								className="px-4 py-2 rounded-xl border border-[var(--border-primary)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
							>
								Hủy
							</button>
							<button
								type="button"
								onClick={handleDeleteAllPanels}
								disabled={isDeletingAllPanels}
								className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-sm cursor-pointer flex items-center space-x-2"
							>
								{isDeletingAllPanels ? (
									<>
										<Loader2 size={14} className="animate-spin" />
										<span>Đang xóa...</span>
									</>
								) : (
									<>
										<Trash2 size={14} />
										<span>Xóa toàn bộ thư viện</span>
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* 7. Full Page Modal with Golden Focus Frame */}
			{selectedFullPagePanel && (
				<FullPageModal
					key={selectedFullPagePanel?.panel_id}
					panel={selectedFullPagePanel}
					onClose={() => setSelectedFullPagePanel(null)}
				/>
			)}

			{/* 8. Interactive Word Popover (IPA, Audio, Meaning) */}
			{popoverWord && popoverPosition && (
				<WordPopover
					key={popoverWord}
					word={popoverWord}
					position={popoverPosition}
					onClose={() => {
						setPopoverWord(null);
						setPopoverPosition(null);
					}}
				/>
			)}
		</div>
	);
};

export default PanelWordsDetectorPage;
