import {
	AlertTriangle,
	Database,
	HardDrive,
	Layers,
	Loader2,
	PackageCheck,
	Plus,
	Search,
	Settings2,
	ShieldCheck,
	Trash2,
	Upload,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import {
	getPoolStats,
	listPoolCandidates,
	listPoolMangas,
	publishToPool,
	removeMangaFromPool,
	syncPoolManga,
} from "../api/datalakePool";
import { PoolMangaWorkspaceModal } from "../components/datalake/PoolMangaWorkspaceModal";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { useAlert } from "../hooks/useAlert";
import type {
	PoolCandidateItem,
	PoolMangaItem,
	PoolStatsResponse,
} from "../types/datalakePool";

export const DataLakePoolPage: React.FC = () => {
	const { showToast } = useAlert();
	const [activeTab, setActiveTab] = useState<"repository" | "candidates">(
		"repository",
	);

	// Stats KPI
	const [stats, setStats] = useState<PoolStatsResponse | null>(null);
	const [loadingStats, setLoadingStats] = useState(false);

	// Repository Tab State
	const [mangas, setMangas] = useState<PoolMangaItem[]>([]);
	const [loadingMangas, setLoadingMangas] = useState(false);
	const [mangaError, setMangaError] = useState<string | null>(null);
	const [repoSearch, setRepoSearch] = useState("");
	const [repoStateFilter, setRepoStateFilter] = useState("all");
	const [repoEtlFilter, setRepoEtlFilter] = useState("all");
	const [repoPage, setRepoPage] = useState(1);
	const [repoTotal, setRepoTotal] = useState(0);

	// Candidates Tab State
	const [candidates, setCandidates] = useState<PoolCandidateItem[]>([]);
	const [loadingCandidates, setLoadingCandidates] = useState(false);
	const [candidateError, setCandidateError] = useState<string | null>(null);
	const [candSearch, setCandSearch] = useState("");
	const [candHasPagesOnly, setCandHasPagesOnly] = useState(true);
	const [candNotInPoolOnly, setCandNotInPoolOnly] = useState(false);
	const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>(
		[],
	);
	const [autoDeduplicate, setAutoDeduplicate] = useState(false);
	const [publishing, setPublishing] = useState(false);

	// Workspace Modal
	const [selectedPoolMangaId, setSelectedPoolMangaId] = useState<string | null>(
		null,
	);

	// Load Stats
	const loadStats = async () => {
		try {
			setLoadingStats(true);
			const data = await getPoolStats();
			setStats(data);
		} catch (err: unknown) {
			console.error("Failed to load pool stats:", err);
		} finally {
			setLoadingStats(false);
		}
	};

	// Load Repository Mangas
	const loadRepositoryMangas = async () => {
		try {
			setLoadingMangas(true);
			setMangaError(null);
			const params: Record<string, unknown> = {
				page: repoPage,
				page_size: 24,
				search: repoSearch.trim() || undefined,
			};
			if (repoStateFilter !== "all") params.pool_state = repoStateFilter;
			if (repoEtlFilter === "ready") params.is_etl_ready = true;
			if (repoEtlFilter === "not_ready") params.is_etl_ready = false;

			const res = await listPoolMangas(params);
			setMangas(res.items);
			setRepoTotal(res.total);
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: "Không thể tải danh sách manga trong Pool";
			setMangaError(msg);
		} finally {
			setLoadingMangas(false);
		}
	};

	// Load Candidates
	const loadCandidates = async () => {
		try {
			setLoadingCandidates(true);
			setCandidateError(null);
			const res = await listPoolCandidates({
				search: candSearch.trim() || undefined,
				has_pages_only: candHasPagesOnly,
				not_in_pool_only: candNotInPoolOnly,
				page: 1,
				page_size: 50,
			});
			setCandidates(res.items);
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: "Không thể tải danh sách manga ứng viên";
			setCandidateError(msg);
		} finally {
			setLoadingCandidates(false);
		}
	};

	useEffect(() => {
		void loadStats();
	}, []);

	useEffect(() => {
		if (activeTab === "repository") {
			void loadRepositoryMangas();
		} else {
			void loadCandidates();
		}
	}, [
		activeTab,
		repoPage,
		repoStateFilter,
		repoEtlFilter,
		candHasPagesOnly,
		candNotInPoolOnly,
	]);

	// Handle single or batch publish
	const handlePublish = async (ids: string[]) => {
		if (ids.length === 0) return;
		try {
			setPublishing(true);
			const res = await publishToPool({
				source_manga_ids: ids,
				auto_deduplicate_pages: autoDeduplicate,
				mark_etl_ready: true,
			});

			if (res.success_count > 0) {
				showToast(
					`Đã đẩy thành công ${res.success_count} bộ manga vào Data Lake Pool!`,
					"success",
				);
				setSelectedCandidateIds([]);
				await Promise.all([loadStats(), loadCandidates()]);
			}
			if (res.error_count > 0) {
				showToast(
					`${res.error_count} bộ manga gặp lỗi: ${res.results.find((r) => !r.success)?.error || "Lỗi không xác định"}`,
					"warning",
				);
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Đẩy vào Pool thất bại";
			showToast(msg, "error");
		} finally {
			setPublishing(false);
		}
	};

	// Remove manga from pool
	const handleRemove = async (poolMangaId: string, title: string) => {
		if (
			!window.confirm(
				`Bạn có chắc chắn muốn gỡ "${title}" khỏi Data Lake Pool?\n\n(Lưu ý: Thao tác này chỉ xóa bản ghi trong Pool; tuyệt đối KHÔNG xóa manga trong thư viện và KHÔNG xóa tệp ảnh trên MinIO)`,
			)
		) {
			return;
		}

		try {
			await removeMangaFromPool(poolMangaId);
			showToast(`Đã gỡ "${title}" khỏi Data Lake Pool!`, "success");
			await Promise.all([loadStats(), loadRepositoryMangas()]);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Gỡ khỏi Pool thất bại";
			showToast(msg, "error");
		}
	};

	// Quick Sync
	const handleSyncManga = async (poolMangaId: string) => {
		try {
			await syncPoolManga(poolMangaId);
			showToast("Đã đồng bộ lại dữ liệu mới nhất từ thư viện!", "success");
			await Promise.all([loadStats(), loadRepositoryMangas()]);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Đồng bộ thất bại";
			showToast(msg, "error");
		}
	};

	return (
		<div className="space-y-6 w-full pb-12">
			{/* Header Title & Intro */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<h1 className="text-2xl font-black text-[var(--text-primary)] flex items-center space-x-2.5">
						<span className="p-2 rounded-xl bg-orange-500/10 text-[var(--brand-orange)]">
							<Database size={26} />
						</span>
						<span>Manga Data Lake & Storage Pool</span>
					</h1>
					<p className="text-sm text-[var(--text-secondary)] mt-1">
						Quản lý nguồn dữ liệu đóng gói hoàn chỉnh, quản lý chương/trang và
						làm sạch trùng lặp với cơ chế Zero-Copy MinIO dành cho ETL
						Connector.
					</p>
				</div>

				<div className="flex items-center space-x-2">
					<Button
						variant={activeTab === "repository" ? "default" : "outline"}
						onClick={() => setActiveTab("repository")}
						className={
							activeTab === "repository"
								? "bg-[var(--brand-orange)] text-white hover:bg-[var(--brand-coral)]"
								: ""
						}
					>
						<Layers size={16} className="mr-2" />
						<span>
							Kho Trong Pool ({repoTotal || (stats?.total_mangas ?? 0)})
						</span>
					</Button>

					<Button
						variant={activeTab === "candidates" ? "default" : "outline"}
						onClick={() => setActiveTab("candidates")}
						className={
							activeTab === "candidates"
								? "bg-[var(--brand-orange)] text-white hover:bg-[var(--brand-coral)]"
								: ""
						}
					>
						<Plus size={16} className="mr-2" />
						<span>Tuyển Chọn Từ Thư Viện</span>
					</Button>
				</div>
			</div>

			{/* KPI Deck */}
			<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
				{/* KPI 1 */}
				<div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-xs">
					<span className="text-xs font-semibold text-[var(--text-secondary)] block">
						Manga Trong Pool
					</span>
					<div className="text-2xl font-black text-[var(--text-primary)] mt-1">
						{loadingStats ? "..." : (stats?.total_mangas ?? 0)}
					</div>
					<div className="text-[11px] text-emerald-500 flex items-center mt-1">
						<PackageCheck size={12} className="mr-1" />
						<span>Độc lập & đóng gói</span>
					</div>
				</div>

				{/* KPI 2 */}
				<div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-xs">
					<span className="text-xs font-semibold text-[var(--text-secondary)] block">
						Sẵn Sàng ETL (Ready)
					</span>
					<div className="text-2xl font-black text-blue-500 mt-1">
						{loadingStats ? "..." : (stats?.total_etl_ready ?? 0)}
					</div>
					<div className="text-[11px] text-blue-400 flex items-center mt-1">
						<ShieldCheck size={12} className="mr-1" />
						<span>Data Contract v1.0</span>
					</div>
				</div>

				{/* KPI 3 */}
				<div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-xs">
					<span className="text-xs font-semibold text-[var(--text-secondary)] block">
						Tổng Chương Quản Lý
					</span>
					<div className="text-2xl font-black text-[var(--text-primary)] mt-1">
						{loadingStats ? "..." : (stats?.total_chapters ?? 0)}
					</div>
					<div className="text-[11px] text-[var(--text-secondary)] mt-1">
						Đầy đủ release & group
					</div>
				</div>

				{/* KPI 4 */}
				<div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-xs">
					<span className="text-xs font-semibold text-[var(--text-secondary)] block">
						Tổng Trang Truyện
					</span>
					<div className="text-2xl font-black text-[var(--text-primary)] mt-1">
						{loadingStats ? "..." : (stats?.total_pages ?? 0)}
					</div>
					<div className="text-[11px] text-[var(--text-secondary)] mt-1">
						Ánh xạ MinIO object_key
					</div>
				</div>

				{/* KPI 5: Zero-Copy Saved */}
				<div className="p-4 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20 shadow-xs">
					<span className="text-xs font-semibold text-orange-400 block">
						Tiết Kiệm Zero-Copy
					</span>
					<div className="text-2xl font-black text-orange-400 mt-1">
						{loadingStats
							? "..."
							: `${((stats?.saved_storage_bytes ?? 0) / (1024 * 1024 * 1024)).toFixed(2)} GB`}
					</div>
					<div className="text-[11px] text-orange-300/80 flex items-center mt-1">
						<HardDrive size={12} className="mr-1" />
						<span>Tiết kiệm 100% dung lượng</span>
					</div>
				</div>
			</div>

			{/* ===================== TAB 1: POOLED REPOSITORY ===================== */}
			{activeTab === "repository" && (
				<div className="space-y-4">
					{/* Search & Filter Bar */}
					<div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
						<div className="flex items-center space-x-2 flex-1 min-w-[240px]">
							<Search size={18} className="text-[var(--text-secondary)]" />
							<input
								type="text"
								placeholder="Tìm kiếm manga trong Pool theo tiêu đề..."
								value={repoSearch}
								onChange={(e) => {
									setRepoSearch(e.target.value);
									setRepoPage(1);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") void loadRepositoryMangas();
								}}
								className="bg-transparent border-none text-sm text-[var(--text-primary)] focus:outline-none w-full"
							/>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<select
								value={repoStateFilter}
								onChange={(e) => {
									setRepoStateFilter(e.target.value);
									setRepoPage(1);
								}}
								className="px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-xs text-[var(--text-secondary)] focus:outline-none"
							>
								<option value="all">Tất cả trạng thái Pool</option>
								<option value="published">Đã xuất bản (Published)</option>
								<option value="draft">Bản nháp (Draft)</option>
								<option value="archived">Lưu trữ (Archived)</option>
							</select>

							<select
								value={repoEtlFilter}
								onChange={(e) => {
									setRepoEtlFilter(e.target.value);
									setRepoPage(1);
								}}
								className="px-3 py-1.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-primary)] text-xs text-[var(--text-secondary)] focus:outline-none"
							>
								<option value="all">Tất cả chuẩn ETL</option>
								<option value="ready">Chỉ ETL Ready</option>
								<option value="not_ready">Chưa bật ETL Ready</option>
							</select>
						</div>
					</div>

					{/* Content State: Loading, Error, Empty, Normal */}
					{loadingMangas ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
							{Array.from({ length: 12 }).map((_, i) => (
								<div
									key={i}
									className="rounded-2xl border border-[var(--border-primary)] p-4 space-y-3 bg-[var(--bg-card)]"
								>
									<Skeleton className="h-44 w-full rounded-xl" />
									<Skeleton className="h-5 w-3/4 rounded-md" />
									<Skeleton className="h-4 w-1/2 rounded-md" />
									<div className="flex gap-2">
										<Skeleton className="h-8 flex-1 rounded-lg" />
										<Skeleton className="h-8 w-8 rounded-lg" />
									</div>
								</div>
							))}
						</div>
					) : mangaError ? (
						<div className="p-8 text-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 space-y-3">
							<AlertTriangle size={32} className="mx-auto" />
							<p className="font-semibold text-sm">{mangaError}</p>
							<Button
								variant="outline"
								size="sm"
								onClick={loadRepositoryMangas}
								className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
							>
								Thử lại
							</Button>
						</div>
					) : mangas.length === 0 ? (
						<div className="py-20 text-center rounded-2xl border border-dashed border-[var(--border-primary)] p-8 bg-[var(--bg-card)] space-y-4">
							<div className="w-16 h-16 rounded-2xl bg-orange-500/10 text-[var(--brand-orange)] flex items-center justify-center mx-auto">
								<Database size={32} />
							</div>
							<div className="max-w-md mx-auto space-y-1">
								<h3 className="text-base font-bold text-[var(--text-primary)]">
									Chưa có bộ manga nào trong Storage Pool
								</h3>
								<p className="text-xs text-[var(--text-secondary)]">
									Hãy chuyển sang tab "Tuyển Chọn Từ Thư Viện" để chọn và đóng
									gói các bộ manga đã tải chương trang vào nguồn Data Lake.
								</p>
							</div>
							<Button
								onClick={() => setActiveTab("candidates")}
								className="bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white"
							>
								<Plus size={16} className="mr-1.5" />
								<span>Tuyển chọn manga ngay</span>
							</Button>
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
							{mangas.map((m) => (
								<div
									key={m.pool_manga_id}
									className="group rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-card)] overflow-hidden shadow-xs hover:border-orange-500/40 hover:shadow-md transition-all flex flex-col"
								>
									{/* Cover Banner */}
									<div className="relative h-44 w-full bg-zinc-950 overflow-hidden">
										{m.primary_cover?.url ? (
											<img
												src={m.primary_cover.url}
												alt={m.title}
												loading="lazy"
												decoding="async"
												className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
											/>
										) : (
											<div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 space-y-1">
												<Database size={28} />
												<span className="text-xs">Chưa có ảnh bìa</span>
											</div>
										)}

										{/* Badges on cover */}
										<div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
											<Badge
												className={
													m.pool_state === "published"
														? "bg-emerald-600/90 text-white backdrop-blur-xs text-[10px]"
														: "bg-zinc-800/90 text-zinc-300 backdrop-blur-xs text-[10px]"
												}
											>
												{m.pool_state.toUpperCase()}
											</Badge>
											{m.is_etl_ready && (
												<Badge className="bg-blue-600/90 text-white backdrop-blur-xs text-[10px] font-mono">
													ETL READY
												</Badge>
											)}
										</div>

										{/* Upstream changes alert badge */}
										{m.lineage?.has_upstream_changes && (
											<div className="absolute bottom-2.5 left-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-amber-500/90 text-black text-[11px] font-bold backdrop-blur-xs flex items-center justify-between">
												<span>Có cập nhật mới!</span>
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														void handleSyncManga(m.pool_manga_id);
													}}
													className="underline hover:text-white cursor-pointer"
												>
													Sync ngay
												</button>
											</div>
										)}
									</div>

									{/* Card Content */}
									<div className="p-4 flex-1 flex flex-col justify-between space-y-3">
										<div>
											<h3
												className="font-bold text-sm text-[var(--text-primary)] line-clamp-1"
												title={m.title}
											>
												{m.title}
											</h3>
											<p className="text-xs text-[var(--text-secondary)] line-clamp-1 mt-0.5">
												{m.author || "Không rõ tác giả"}
											</p>

											{/* Stats Row */}
											<div className="mt-2.5 grid grid-cols-2 gap-2 text-xs py-2 border-y border-[var(--border-primary)]">
												<div>
													<span className="text-[var(--text-secondary)] block text-[10px]">
														Chương / Trang
													</span>
													<span className="font-bold text-[var(--text-primary)]">
														{m.stats.total_chapters} ch / {m.stats.total_pages}{" "}
														trang
													</span>
												</div>
												<div>
													<span className="text-[var(--text-secondary)] block text-[10px]">
														Dung lượng ảo
													</span>
													<span className="font-bold text-[var(--text-primary)]">
														{(m.stats.total_size_bytes / (1024 * 1024)).toFixed(
															1,
														)}{" "}
														MB
													</span>
												</div>
											</div>

											{/* Languages & Tags preview */}
											<div className="flex flex-wrap gap-1 mt-2">
												{m.stats.available_languages.map((l) => (
													<span
														key={l}
														className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 uppercase font-mono"
													>
														{l}
													</span>
												))}
											</div>
										</div>

										{/* Actions */}
										<div className="pt-2 flex items-center space-x-2">
											<Button
												size="sm"
												onClick={() => setSelectedPoolMangaId(m.pool_manga_id)}
												className="flex-1 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs"
											>
												<Settings2 size={14} className="mr-1.5" />
												<span>Quản Lý (Workspace)</span>
											</Button>

											<button
												type="button"
												onClick={() => handleRemove(m.pool_manga_id, m.title)}
												className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
												title="Gỡ khỏi Pool (Giữ nguyên file gốc)"
											>
												<Trash2 size={16} />
											</button>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* ===================== TAB 2: CANDIDATE PICKER ===================== */}
			{activeTab === "candidates" && (
				<div className="space-y-4">
					{/* Candidate Filter & Batch Action Bar */}
					<div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center space-x-2 flex-1 min-w-[240px]">
								<Search size={18} className="text-[var(--text-secondary)]" />
								<input
									type="text"
									placeholder="Tìm kiếm manga trong thư viện hiện tại..."
									value={candSearch}
									onChange={(e) => setCandSearch(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") void loadCandidates();
									}}
									className="bg-transparent border-none text-sm text-[var(--text-primary)] focus:outline-none w-full"
								/>
							</div>

							<div className="flex flex-wrap items-center gap-3 text-xs">
								<label className="flex items-center space-x-2 cursor-pointer">
									<input
										type="checkbox"
										checked={candHasPagesOnly}
										onChange={(e) => setCandHasPagesOnly(e.target.checked)}
										className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
									/>
									<span className="text-[var(--text-secondary)]">
										Chỉ manga đủ điều kiện (có trang)
									</span>
								</label>

								<label className="flex items-center space-x-2 cursor-pointer">
									<input
										type="checkbox"
										checked={candNotInPoolOnly}
										onChange={(e) => setCandNotInPoolOnly(e.target.checked)}
										className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
									/>
									<span className="text-[var(--text-secondary)]">
										Chưa có trong Pool
									</span>
								</label>
							</div>
						</div>

						{/* Batch action row */}
						<div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-primary)] text-xs">
							<div className="flex items-center space-x-3">
								<label className="flex items-center space-x-2 cursor-pointer">
									<input
										type="checkbox"
										checked={
											candidates.filter((c) => c.is_eligible).length > 0 &&
											selectedCandidateIds.length ===
												candidates.filter((c) => c.is_eligible).length
										}
										onChange={(e) => {
											if (e.target.checked) {
												setSelectedCandidateIds(
													candidates
														.filter((c) => c.is_eligible)
														.map((c) => c.source_manga_id),
												);
											} else {
												setSelectedCandidateIds([]);
											}
										}}
										className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
									/>
									<span className="font-semibold text-[var(--text-primary)]">
										Chọn tất cả đủ điều kiện (
										{candidates.filter((c) => c.is_eligible).length})
									</span>
								</label>

								<span className="text-[var(--text-secondary)]">
									Đã chọn: <strong>{selectedCandidateIds.length}</strong> bộ
								</span>
							</div>

							<div className="flex items-center space-x-3">
								<label className="flex items-center space-x-2 cursor-pointer">
									<input
										type="checkbox"
										checked={autoDeduplicate}
										onChange={(e) => setAutoDeduplicate(e.target.checked)}
										className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
									/>
									<span className="text-[var(--text-secondary)]">
										Tự động dọn trùng (MD5) khi đẩy vào Pool
									</span>
								</label>

								<Button
									size="sm"
									disabled={publishing || selectedCandidateIds.length === 0}
									onClick={() => handlePublish(selectedCandidateIds)}
									className="bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white"
								>
									{publishing ? (
										<Loader2 size={14} className="animate-spin mr-1.5" />
									) : (
										<Upload size={14} className="mr-1.5" />
									)}
									<span>
										Đẩy {selectedCandidateIds.length} bộ vào Storage Pool
									</span>
								</Button>
							</div>
						</div>
					</div>

					{/* Candidates Table / Grid */}
					{loadingCandidates ? (
						<div className="space-y-3">
							{Array.from({ length: 6 }).map((_, i) => (
								<div
									key={i}
									className="p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] flex items-center justify-between"
								>
									<div className="flex items-center space-x-3">
										<Skeleton className="w-12 h-16 rounded-lg" />
										<div className="space-y-2">
											<Skeleton className="h-4 w-48 rounded-md" />
											<Skeleton className="h-3 w-32 rounded-md" />
										</div>
									</div>
									<Skeleton className="h-8 w-28 rounded-lg" />
								</div>
							))}
						</div>
					) : candidateError ? (
						<div className="p-8 text-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 space-y-3">
							<AlertTriangle size={32} className="mx-auto" />
							<p className="font-semibold text-sm">{candidateError}</p>
							<Button
								variant="outline"
								size="sm"
								onClick={loadCandidates}
								className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
							>
								Thử lại
							</Button>
						</div>
					) : candidates.length === 0 ? (
						<div className="py-16 text-center text-sm text-[var(--text-secondary)] border border-dashed border-[var(--border-primary)] rounded-2xl">
							Không tìm thấy bộ manga nào phù hợp trong thư viện.
						</div>
					) : (
						<div className="space-y-2.5">
							{candidates.map((c) => {
								const isSelected = selectedCandidateIds.includes(
									c.source_manga_id,
								);
								return (
									<div
										key={c.source_manga_id}
										className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
											isSelected
												? "border-orange-500 bg-orange-500/5"
												: "border-[var(--border-primary)] bg-[var(--bg-card)] hover:border-zinc-700"
										}`}
									>
										{/* Left: Checkbox + Thumbnail + Meta */}
										<div className="flex items-center space-x-3 min-w-0">
											<input
												type="checkbox"
												disabled={!c.is_eligible}
												checked={isSelected}
												onChange={(e) => {
													setSelectedCandidateIds((prev) =>
														e.target.checked
															? [...prev, c.source_manga_id]
															: prev.filter((id) => id !== c.source_manga_id),
													);
												}}
												className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500 disabled:opacity-30"
											/>

											<div className="w-12 h-16 rounded-lg bg-zinc-950 overflow-hidden shrink-0">
												{c.cover_url ? (
													<img
														src={c.cover_url}
														alt={c.title}
														loading="lazy"
														className="w-full h-full object-cover"
													/>
												) : (
													<div className="w-full h-full flex items-center justify-center text-zinc-700">
														<Database size={16} />
													</div>
												)}
											</div>

											<div className="min-w-0">
												<div className="flex items-center space-x-2">
													<h4 className="font-bold text-sm text-[var(--text-primary)] truncate">
														{c.title}
													</h4>
													{c.already_in_pool && (
														<Badge className="bg-emerald-600/20 text-emerald-400 text-[10px]">
															ĐÃ CÓ TRONG POOL
														</Badge>
													)}
													{c.needs_sync && (
														<Badge className="bg-amber-500/20 text-amber-400 text-[10px]">
															CẦN SYNC
														</Badge>
													)}
												</div>
												<p className="text-xs text-[var(--text-secondary)] truncate">
													{c.author || "Không rõ tác giả"} •{" "}
													{c.status || "Chưa rõ tình trạng"}
												</p>

												<div className="flex items-center space-x-3 text-xs text-[var(--text-secondary)] mt-1">
													<span>
														<strong>{c.ready_chapters_count}</strong> chương khả
														dụng
													</span>
													<span>•</span>
													<span>
														<strong>{c.total_pages_count}</strong> trang
													</span>
													{c.available_languages.length > 0 && (
														<>
															<span>•</span>
															<span>
																{c.available_languages.join(", ").toUpperCase()}
															</span>
														</>
													)}
												</div>
											</div>
										</div>

										{/* Right: Eligibility Badge & Button */}
										<div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
											{c.is_eligible ? (
												<Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
													Đủ điều kiện
												</Badge>
											) : (
												<Badge
													variant="outline"
													className="text-zinc-500 border-zinc-700 text-xs"
												>
													{c.eligibility_reason ||
														"Chưa có dữ liệu trang truyện"}
												</Badge>
											)}

											<Button
												size="sm"
												disabled={!c.is_eligible || publishing}
												onClick={() => handlePublish([c.source_manga_id])}
												className="bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs shrink-0"
											>
												<Plus size={14} className="mr-1" />
												<span>{c.already_in_pool ? "Đồng bộ" : "Thêm"}</span>
											</Button>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}

			{/* Workspace Modal */}
			{selectedPoolMangaId && (
				<PoolMangaWorkspaceModal
					poolMangaId={selectedPoolMangaId}
					onClose={() => setSelectedPoolMangaId(null)}
					onUpdated={() => {
						void loadStats();
						void loadRepositoryMangas();
					}}
				/>
			)}
		</div>
	);
};

export default DataLakePoolPage;
