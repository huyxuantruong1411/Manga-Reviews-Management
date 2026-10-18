import {
	AlertTriangle,
	ExternalLink,
	Filter,
	Globe,
	RefreshCw,
	RotateCw,
	Search,
	Star,
	Trash2,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import {
	clearMangaExternalReviews,
	deleteExternalReview,
	fetchExternalReviews,
	fetchSyncStatus,
	subscribeToSyncProgress,
	triggerExternalReviewSync,
} from "../../api/externalReviews";
import type {
	ExternalReview,
	ExternalReviewStatsSummary,
	ExternalReviewSyncProgress,
	TriggerExternalReviewSyncRequest,
} from "../../types/externalReview";
import { ExternalReviewCard } from "./ExternalReviewCard";
import { ExternalReviewSyncTelemetryBanner } from "./ExternalReviewSyncTelemetryBanner";

interface ExternalReviewsManagerPanelProps {
	mangaId: string;
	mangaTitle: string;
	initialMalId?: string;
	className?: string;
	onMetadataUpdated?: () => void;
}

export const ExternalReviewsManagerPanel: React.FC<
	ExternalReviewsManagerPanelProps
> = ({
	mangaId,
	mangaTitle,
	initialMalId,
	className = "",
	onMetadataUpdated,
}) => {
	// Query & filter states
	const [source, setSource] = useState<string>("all");
	const [recommendation, setRecommendation] = useState<string>("all");
	const [onlyPreliminary, setOnlyPreliminary] = useState<boolean>(false);
	const [onlySpoilers, setOnlySpoilers] = useState<boolean>(false);
	const [globalShowSpoilers, setGlobalShowSpoilers] = useState<boolean>(false);
	const [searchTerm, setSearchTerm] = useState<string>("");
	const [debouncedSearch, setDebouncedSearch] = useState<string>("");
	const [sortBy, setSortBy] = useState<string>("posted_at_desc");

	// Data states
	const [reviews, setReviews] = useState<ExternalReview[]>([]);
	const [summary, setSummary] = useState<ExternalReviewStatsSummary | null>(
		null,
	);
	const [totalCount, setTotalCount] = useState<number>(0);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	// Sync progress state
	const [syncProgress, setSyncProgress] = useState<ExternalReviewSyncProgress>({
		manga_id: mangaId,
		status: "idle",
		stage: "idle",
		stage_label: "",
		progress_pct: 0,
		current_page: 0,
		total_estimated_pages: 0,
		fetched_reviews_count: 0,
		total_expected_reviews: 0,
		inserted_count: 0,
		updated_count: 0,
		skipped_count: 0,
		logs: [],
	});

	// Manual MAL ID input modal/popover state
	const [showSyncConfig, setShowSyncConfig] = useState<boolean>(false);
	const [customMalInput, setCustomMalInput] = useState<string>("");
	const [syncExtendedMeta, setSyncExtendedMeta] = useState<boolean>(true);

	// Debounce search term
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedSearch(searchTerm);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchTerm]);

	// Load reviews
	const loadReviews = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetchExternalReviews(mangaId, {
				source: source !== "all" ? source : undefined,
				recommendation_status:
					recommendation !== "all" ? recommendation : undefined,
				only_preliminary: onlyPreliminary ? true : undefined,
				only_spoilers: onlySpoilers ? true : undefined,
				search: debouncedSearch ? debouncedSearch : undefined,
				sort_by: sortBy,
				limit: 100,
			});
			setReviews(res.items);
			setTotalCount(res.total);
			setSummary(res.summary);
		} catch (err: any) {
			console.error("Failed to load external reviews:", err);
			setError(err?.message || "Không thể tải danh sách đánh giá từ máy chủ");
		} finally {
			setIsLoading(false);
		}
	}, [
		mangaId,
		source,
		recommendation,
		onlyPreliminary,
		onlySpoilers,
		debouncedSearch,
		sortBy,
	]);

	useEffect(() => {
		loadReviews();
	}, [loadReviews]);

	// Fetch initial sync status
	useEffect(() => {
		let isMounted = true;
		fetchSyncStatus(mangaId)
			.then((st) => {
				if (isMounted && st && st.status === "running") {
					setSyncProgress(st);
				}
			})
			.catch(() => {});
		return () => {
			isMounted = false;
		};
	}, [mangaId]);

	// Subscribe to SSE stream while running
	useEffect(() => {
		if (syncProgress.status !== "running") return;

		const unsubscribe = subscribeToSyncProgress(
			mangaId,
			(prog) => {
				setSyncProgress(prog);
				if (prog.status === "completed") {
					loadReviews();
					if (onMetadataUpdated) onMetadataUpdated();
				}
			},
			(err) => {
				console.warn("SSE stream disconnected, polling status fallback:", err);
			},
		);

		return () => {
			unsubscribe();
		};
	}, [mangaId, syncProgress.status, loadReviews, onMetadataUpdated]);

	const handleStartSync = async (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		setShowSyncConfig(false);

		const req: TriggerExternalReviewSyncRequest = {
			source: "myanimelist",
			mal_url_or_id: customMalInput.trim() || undefined,
			sync_extended_metadata: syncExtendedMeta,
			apply_empty_manga_fields: true,
			include_spoilers: true,
			include_preliminary: true,
			max_pages: 50,
		};

		try {
			const initProgress = await triggerExternalReviewSync(mangaId, req);
			setSyncProgress(initProgress);
		} catch (err: any) {
			console.error("Failed to start external review sync:", err);
			setError(err?.message || "Lỗi khi bắt đầu đồng bộ reviews");
		}
	};

	const handleDeleteReview = async (reviewId: string) => {
		if (!window.confirm("Bạn có chắc chắn muốn xóa bài đánh giá này?")) return;
		try {
			await deleteExternalReview(mangaId, reviewId);
			setReviews((prev) => prev.filter((r) => r._id !== reviewId));
			setTotalCount((c) => Math.max(0, c - 1));
		} catch (err) {
			console.error("Failed to delete external review:", err);
		}
	};

	const handleClearAll = async () => {
		if (
			!window.confirm(
				"Xác nhận xóa TOÀN BỘ bài đánh giá bên thứ ba của manga này? (Thao tác này chỉ xóa bản lưu trữ cục bộ, bạn có thể đồng bộ lại bất kỳ lúc nào)",
			)
		)
			return;

		try {
			await clearMangaExternalReviews(mangaId);
			setReviews([]);
			setTotalCount(0);
			loadReviews();
		} catch (err) {
			console.error("Failed to clear reviews:", err);
		}
	};

	const linkedMalId = summary?.linked_mal_id || initialMalId;
	const linkedMalUrl =
		summary?.linked_mal_url ||
		(linkedMalId ? `https://myanimelist.net/manga/${linkedMalId}` : undefined);

	return (
		<div className={`space-y-6 ${className}`}>
			{/* KPI & Main Sync Action Bar */}
			<div className="bg-gradient-to-r from-[var(--bg-secondary)]/40 to-blue-500/5 border border-[var(--border-primary)] rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div>
						<div className="flex items-center flex-wrap gap-2.5">
							<span className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 font-black text-xs flex items-center justify-center">
								MAL
							</span>
							<h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
								External Community Reviews Hub
							</h3>
							{linkedMalId ? (
								<a
									href={linkedMalUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition"
								>
									<span>MAL #{linkedMalId}</span>
									<ExternalLink size={11} />
								</a>
							) : (
								<span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
									Chưa liên kết MAL
								</span>
							)}
						</div>
						<p className="text-xs text-[var(--text-secondary)] mt-1">
							Thu thập toàn bộ đánh giá cho {mangaTitle} từ cộng đồng
							MyAnimeList (bao gồm cả Preliminary và Spoiler)
						</p>
					</div>

					{/* Action Buttons */}
					<div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
						<button
							type="button"
							onClick={() => setShowSyncConfig(!showSyncConfig)}
							disabled={syncProgress.status === "running"}
							className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center space-x-2 transition shadow-sm cursor-pointer"
						>
							<RefreshCw
								size={14}
								className={
									syncProgress.status === "running" ? "animate-spin" : ""
								}
							/>
							<span>
								{syncProgress.status === "running"
									? "Đang thu thập..."
									: "Thu thập tất cả Reviews (MAL)"}
							</span>
						</button>

						{reviews.length > 0 && (
							<button
								type="button"
								onClick={handleClearAll}
								className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 transition cursor-pointer"
								title="Làm sạch toàn bộ reviews đã lưu"
							>
								<Trash2 size={15} />
							</button>
						)}
					</div>
				</div>

				{/* Quick Sync Config Form */}
				{showSyncConfig && (
					<form
						onSubmit={handleStartSync}
						className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] space-y-3 pt-4 transition-all"
					>
						<h4 className="text-xs font-bold text-[var(--text-primary)]">
							Cấu hình đồng bộ MyAnimeList
						</h4>
						<div className="flex flex-col sm:flex-row gap-3">
							<div className="flex-1">
								<input
									type="text"
									placeholder={
										linkedMalId
											? `Mặc định dùng MAL #${linkedMalId}`
											: "Nhập URL MAL (e.g. myanimelist.net/manga/130997) hoặc ID số"
									}
									value={customMalInput}
									onChange={(e) => setCustomMalInput(e.target.value)}
									className="w-full px-3.5 py-2 text-xs rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
								/>
							</div>

							<button
								type="submit"
								className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer self-start sm:self-auto"
							>
								Bắt đầu cào Reviews
							</button>
						</div>

						<div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
							<label className="flex items-center gap-1.5 cursor-pointer">
								<input
									type="checkbox"
									checked={syncExtendedMeta}
									onChange={(e) => setSyncExtendedMeta(e.target.checked)}
									className="rounded text-blue-600 focus:ring-0"
								/>
								<span>
									Làm giàu cả Metadata mở rộng (Tác giả, Volumes, Status)
								</span>
							</label>
						</div>
					</form>
				)}

				{/* KPI Metric Pills */}
				{summary && summary.total_reviews > 0 && (
					<div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-primary)]/40 text-xs">
						<span className="font-semibold text-[var(--text-primary)]">
							Tổng cộng: {summary.total_reviews} bài
						</span>
						<span>•</span>
						{summary.average_rating && (
							<>
								<span className="inline-flex items-center gap-1 font-bold text-amber-500">
									<Star size={12} className="fill-amber-500" />
									{summary.average_rating}/10
								</span>
								<span>•</span>
							</>
						)}
						{summary.by_recommendation.recommended && (
							<span className="text-emerald-600 dark:text-emerald-400 font-medium">
								{summary.by_recommendation.recommended} Khuyên đọc
							</span>
						)}
						{summary.by_recommendation.mixed_feelings && (
							<span className="text-amber-600 dark:text-amber-400 font-medium">
								• {summary.by_recommendation.mixed_feelings} Phân vân
							</span>
						)}
						{summary.by_recommendation.not_recommended && (
							<span className="text-rose-600 dark:text-rose-400 font-medium">
								• {summary.by_recommendation.not_recommended} Không khuyên
							</span>
						)}
						{summary.spoiler_count > 0 && (
							<span className="text-[var(--text-secondary)]">
								• {summary.spoiler_count} Spoilers
							</span>
						)}
						{summary.preliminary_count > 0 && (
							<span className="text-[var(--text-secondary)]">
								• {summary.preliminary_count} Đọc dở
							</span>
						)}
					</div>
				)}
			</div>

			{/* Telemetry Progress Banner */}
			<ExternalReviewSyncTelemetryBanner
				progress={syncProgress}
				onRetry={() => handleStartSync()}
				onDismiss={() =>
					setSyncProgress((prev) => ({ ...prev, status: "idle" }))
				}
			/>

			{/* Multi-Dimensional Filter Bar */}
			<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
				{/* Top filters: Source & Recommendation */}
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
					{/* Source & Recommendation filter pills */}
					<div className="flex flex-wrap items-center gap-3 text-xs">
						<div className="flex items-center gap-1.5">
							<span className="text-[var(--text-secondary)] font-medium flex items-center gap-1">
								<Globe size={12} />
								<span>Nguồn:</span>
							</span>
							{[
								{ id: "all", label: "Tất cả" },
								{ id: "myanimelist", label: "MyAnimeList" },
							].map((pill) => (
								<button
									key={pill.id}
									type="button"
									onClick={() => setSource(pill.id)}
									className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer text-xs ${
										source === pill.id
											? "bg-blue-600 text-white shadow-xs"
											: "bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 text-[var(--text-secondary)]"
									}`}
								>
									{pill.label}
								</button>
							))}
						</div>

						<div className="flex items-center gap-1.5">
							<span className="text-[var(--text-secondary)] font-medium flex items-center gap-1">
								<Filter size={12} />
								<span>Đánh giá:</span>
							</span>
							{[
								{ id: "all", label: "Tất cả" },
								{ id: "recommended", label: "Recommended" },
								{ id: "mixed_feelings", label: "Mixed Feelings" },
								{ id: "not_recommended", label: "Not Recommended" },
							].map((pill) => (
								<button
									key={pill.id}
									type="button"
									onClick={() => setRecommendation(pill.id)}
									className={`px-2.5 py-1 rounded-xl font-bold transition cursor-pointer text-xs ${
										recommendation === pill.id
											? "bg-[var(--brand-orange)] text-white shadow-xs"
											: "bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 text-[var(--text-secondary)]"
									}`}
								>
									{pill.label}
								</button>
							))}
						</div>
					</div>

					{/* Sorting dropdown */}
					<div className="flex items-center gap-2 self-start md:self-auto text-xs">
						<span className="text-[var(--text-secondary)]">Sắp xếp:</span>
						<select
							value={sortBy}
							onChange={(e) => setSortBy(e.target.value)}
							className="px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] font-semibold text-xs focus:outline-none"
						>
							<option value="posted_at_desc">Mới nhất trước</option>
							<option value="posted_at_asc">Cũ nhất trước</option>
							<option value="reactions_desc">Nhiều tương tác nhất</option>
							<option value="rating_desc">Điểm số cao nhất</option>
							<option value="rating_asc">Điểm số thấp nhất</option>
							<option value="words_desc">Bài phân tích dài nhất</option>
						</select>
					</div>
				</div>

				{/* Bottom filter options & search */}
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[var(--border-primary)]/40 pt-3">
					{/* Search input */}
					<div className="relative flex-1 max-w-md">
						<Search
							size={14}
							className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
						/>
						<input
							type="text"
							placeholder="Tìm kiếm nội dung bài viết hoặc tác giả..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="w-full pl-9 pr-3.5 py-1.5 text-xs rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-orange)]"
						/>
					</div>

					{/* Toggle switches */}
					<div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
						<label className="flex items-center gap-1.5 cursor-pointer">
							<input
								type="checkbox"
								checked={onlyPreliminary}
								onChange={(e) => setOnlyPreliminary(e.target.checked)}
								className="rounded text-[var(--brand-orange)] focus:ring-0"
							/>
							<span>Chỉ Preliminary</span>
						</label>

						<label className="flex items-center gap-1.5 cursor-pointer">
							<input
								type="checkbox"
								checked={onlySpoilers}
								onChange={(e) => setOnlySpoilers(e.target.checked)}
								className="rounded text-[var(--brand-orange)] focus:ring-0"
							/>
							<span>Chỉ Spoilers</span>
						</label>

						<label className="flex items-center gap-1.5 cursor-pointer font-bold text-[var(--brand-orange)]">
							<input
								type="checkbox"
								checked={globalShowSpoilers}
								onChange={(e) => setGlobalShowSpoilers(e.target.checked)}
								className="rounded text-[var(--brand-orange)] focus:ring-0"
							/>
							<span>Hiện toàn bộ Spoilers</span>
						</label>
					</div>
				</div>
			</div>

			{/* Reviews Content: 4-State handling */}
			{isLoading ? (
				<div className="space-y-4">
					{[1, 2, 3].map((n) => (
						<div
							key={n}
							className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 animate-pulse space-y-4"
						>
							<div className="flex items-center space-x-3">
								<div className="w-10 h-10 rounded-2xl bg-[var(--bg-secondary)]" />
								<div className="space-y-1.5 flex-1">
									<div className="w-32 h-4 rounded-md bg-[var(--bg-secondary)]" />
									<div className="w-20 h-3 rounded-md bg-[var(--bg-secondary)]" />
								</div>
							</div>
							<div className="space-y-2">
								<div className="w-full h-3 rounded-md bg-[var(--bg-secondary)]" />
								<div className="w-4/5 h-3 rounded-md bg-[var(--bg-secondary)]" />
								<div className="w-2/3 h-3 rounded-md bg-[var(--bg-secondary)]" />
							</div>
						</div>
					))}
				</div>
			) : error ? (
				<div className="py-12 text-center rounded-3xl border border-red-500/20 bg-red-500/5 space-y-3">
					<AlertTriangle size={32} className="mx-auto text-red-500" />
					<p className="text-sm font-bold text-red-600 dark:text-red-400">
						{error}
					</p>
					<button
						type="button"
						onClick={loadReviews}
						className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--brand-orange)] text-white hover:bg-[var(--brand-coral)] transition cursor-pointer inline-flex items-center gap-1.5"
					>
						<RotateCw size={13} />
						<span>Thử lại</span>
					</button>
				</div>
			) : reviews.length === 0 ? (
				<div className="py-16 text-center border-2 border-dashed border-[var(--border-primary)] rounded-3xl space-y-3">
					<Globe
						size={40}
						className="mx-auto text-[var(--text-secondary)] opacity-40"
					/>
					<h4 className="text-base font-bold text-[var(--text-primary)]">
						Chưa có bài đánh giá nào từ cộng đồng MyAnimeList
					</h4>
					<p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
						Nhấn nút bên dưới để bắt đầu quét và thu thập toàn bộ bài review từ
						trang MyAnimeList của manga này.
					</p>
					<button
						type="button"
						onClick={() => setShowSyncConfig(true)}
						className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
					>
						<RefreshCw size={13} />
						<span>Bắt đầu thu thập ngay</span>
					</button>
				</div>
			) : (
				<div className="space-y-4">
					<div className="flex items-center justify-between text-xs text-[var(--text-secondary)] px-1">
						<span>
							Hiển thị <strong>{reviews.length}</strong>
							{totalCount > reviews.length ? ` / ${totalCount}` : ""} bài đánh
							giá
						</span>
					</div>

					{reviews.map((rev) => (
						<ExternalReviewCard
							key={rev._id}
							review={rev}
							onDelete={handleDeleteReview}
							globalShowSpoilers={globalShowSpoilers}
						/>
					))}
				</div>
			)}
		</div>
	);
};

export default ExternalReviewsManagerPanel;
