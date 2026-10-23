import {
	Check,
	ChevronDown,
	ChevronUp,
	Copy,
	Database,
	Download,
	FileText,
	Info,
	Layers,
	Loader2,
	RefreshCw,
	Save,
	Search,
	ShieldCheck,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
	cleanupPoolDuplicates,
	deletePoolChapter,
	deletePoolChapterPages,
	exportEtlManifest,
	getPoolChapterDetail,
	getPoolMangaChapters,
	getPoolMangaDetail,
	scanPoolDuplicates,
	syncPoolManga,
	updatePoolManga,
	verifyPoolMangaIntegrity,
} from "../../api/datalakePool";
import { useAlert } from "../../hooks/useAlert";
import type {
	PoolChapterItem,
	PoolDuplicateGroup,
	PoolIntegrityReport,
	PoolMangaItem,
} from "../../types/datalakePool";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface PoolMangaWorkspaceModalProps {
	poolMangaId: string | null;
	onClose: () => void;
	onUpdated?: () => void;
}

export const PoolMangaWorkspaceModal: React.FC<
	PoolMangaWorkspaceModalProps
> = ({ poolMangaId, onClose, onUpdated }) => {
	const { showToast } = useAlert();
	const [activeTab, setActiveTab] = useState<
		"metadata" | "chapters" | "manifest"
	>("metadata");

	const [loading, setLoading] = useState(true);
	const [manga, setManga] = useState<PoolMangaItem | null>(null);
	const [chapters, setChapters] = useState<PoolChapterItem[]>([]);
	const [saving, setSaving] = useState(false);
	const [syncing, setSyncing] = useState(false);

	// Editable metadata state
	const [formTitle, setFormTitle] = useState("");
	const [formAltTitles, setFormAltTitles] = useState("");
	const [formDescription, setFormDescription] = useState("");
	const [formAuthor, setFormAuthor] = useState("");
	const [formArtist, setFormArtist] = useState("");
	const [formYear, setFormYear] = useState("");
	const [formStatus, setFormStatus] = useState("ongoing");
	const [formDemographic, setFormDemographic] = useState("");
	const [formContentRating, setFormContentRating] = useState("safe");
	const [formPoolState, setFormPoolState] = useState<
		"published" | "draft" | "archived"
	>("published");
	const [formEtlReady, setFormEtlReady] = useState(true);

	// Chapter management state
	const [chapterFilterLang, setChapterFilterLang] = useState<string>("all");
	const [chapterSearch, setChapterSearch] = useState<string>("");
	const [expandedChapterId, setExpandedChapterId] = useState<string | null>(
		null,
	);
	const [expandedChapter, setExpandedChapter] =
		useState<PoolChapterItem | null>(null);
	const [loadingChapterPages, setLoadingChapterPages] = useState(false);
	const [selectedPageNumbers, setSelectedPageNumbers] = useState<number[]>([]);
	const [deletingPages, setDeletingPages] = useState(false);

	// Duplicate state
	const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
	const [scanningDuplicates, setScanningDuplicates] = useState(false);
	const [duplicateGroups, setDuplicateGroups] = useState<PoolDuplicateGroup[]>(
		[],
	);
	const [selectedDuplicateTargets, setSelectedDuplicateTargets] = useState<
		Array<{ pool_chapter_id: string; page_number: number }>
	>([]);
	const [cleaningDuplicates, setCleaningDuplicates] = useState(false);

	// Integrity & Manifest state
	const [verifyingIntegrity, setVerifyingIntegrity] = useState(false);
	const [integrityReport, setIntegrityReport] =
		useState<PoolIntegrityReport | null>(null);
	const [manifestJson, setManifestJson] = useState<string>("");
	const [loadingManifest, setLoadingManifest] = useState(false);
	const [copiedManifest, setCopiedManifest] = useState(false);

	// Load detail
	const loadMangaData = async () => {
		if (!poolMangaId) return;
		try {
			setLoading(true);
			const [detail, chList] = await Promise.all([
				getPoolMangaDetail(poolMangaId),
				getPoolMangaChapters(poolMangaId),
			]);
			setManga(detail);
			setChapters(chList);

			// Init form
			setFormTitle(detail.title || "");
			setFormAltTitles((detail.alt_titles || []).join(", "));
			setFormDescription(detail.description || "");
			setFormAuthor(detail.author || "");
			setFormArtist(detail.artist || "");
			setFormYear(detail.year || "");
			setFormStatus(detail.status || "ongoing");
			setFormDemographic(detail.publication_demographic || "");
			setFormContentRating(detail.content_rating || "safe");
			setFormPoolState(detail.pool_state || "published");
			setFormEtlReady(detail.is_etl_ready ?? true);
		} catch (err: unknown) {
			const msg =
				err instanceof Error
					? err.message
					: "Không thể tải thông tin bộ truyện trong pool";
			showToast(msg, "error");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void loadMangaData();
	}, [poolMangaId]);

	// Save metadata
	const handleSaveMetadata = async () => {
		if (!poolMangaId) return;
		try {
			setSaving(true);
			const altTitlesArray = formAltTitles
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);

			const updated = await updatePoolManga(poolMangaId, {
				title: formTitle,
				alt_titles: altTitlesArray,
				description: formDescription,
				author: formAuthor,
				artist: formArtist,
				year: formYear,
				status: formStatus,
				publication_demographic: formDemographic,
				content_rating: formContentRating,
				pool_state: formPoolState,
				is_etl_ready: formEtlReady,
			});

			setManga(updated);
			showToast(
				"Đã cập nhật metadata trên Data Lake Pool thành công!",
				"success",
			);
			onUpdated?.();
		} catch (err: unknown) {
			const msg =
				err instanceof Error ? err.message : "Cập nhật metadata thất bại";
			showToast(msg, "error");
		} finally {
			setSaving(false);
		}
	};

	// Re-sync from Review System
	const handleSync = async () => {
		if (!poolMangaId) return;
		try {
			setSyncing(true);
			await syncPoolManga(poolMangaId);
			showToast(
				"Đã đồng bộ lại dữ liệu mới nhất từ Review System sang Pool!",
				"success",
			);
			await loadMangaData();
			onUpdated?.();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Đồng bộ thất bại";
			showToast(msg, "error");
		} finally {
			setSyncing(false);
		}
	};

	// Toggle expand chapter
	const handleToggleExpandChapter = async (chapterId: string) => {
		if (expandedChapterId === chapterId) {
			setExpandedChapterId(null);
			setExpandedChapter(null);
			setSelectedPageNumbers([]);
			return;
		}

		setExpandedChapterId(chapterId);
		setSelectedPageNumbers([]);
		try {
			setLoadingChapterPages(true);
			const detail = await getPoolChapterDetail(chapterId);
			setExpandedChapter(detail);
		} catch (err: unknown) {
			const msg =
				err instanceof Error ? err.message : "Không thể tải trang của chương";
			showToast(msg, "error");
		} finally {
			setLoadingChapterPages(false);
		}
	};

	// Delete pages
	const handleDeletePages = async () => {
		if (!expandedChapterId || selectedPageNumbers.length === 0) return;
		if (
			!window.confirm(
				`Bạn có chắc chắn muốn xóa ${selectedPageNumbers.length} trang khỏi chương này trong Pool?\n(Lưu ý: Chỉ gỡ ánh xạ trong Pool, không xóa file gốc trên MinIO)`,
			)
		) {
			return;
		}

		try {
			setDeletingPages(true);
			const updated = await deletePoolChapterPages(
				expandedChapterId,
				selectedPageNumbers,
			);
			setExpandedChapter(updated);
			setSelectedPageNumbers([]);
			showToast("Đã xóa các trang khỏi Pool và đánh số lại 1..N!", "success");
			// Refresh chapter list
			if (poolMangaId) {
				const chList = await getPoolMangaChapters(poolMangaId);
				setChapters(chList);
			}
			onUpdated?.();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Xóa trang thất bại";
			showToast(msg, "error");
		} finally {
			setDeletingPages(false);
		}
	};

	// Delete chapter
	const handleDeleteChapter = async (
		chapterId: string,
		chapterNumber: string,
	) => {
		if (
			!window.confirm(
				`Bạn có chắc chắn muốn gỡ Chương ${chapterNumber} khỏi Pool?\n(Lưu ý: File gốc trên MinIO và dữ liệu Review System vẫn được bảo vệ an toàn)`,
			)
		) {
			return;
		}

		try {
			await deletePoolChapter(chapterId);
			showToast(`Đã gỡ Chương ${chapterNumber} khỏi Pool!`, "success");
			if (expandedChapterId === chapterId) {
				setExpandedChapterId(null);
				setExpandedChapter(null);
			}
			if (poolMangaId) {
				const chList = await getPoolMangaChapters(poolMangaId);
				setChapters(chList);
			}
			onUpdated?.();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Gỡ chương thất bại";
			showToast(msg, "error");
		}
	};

	// Scan duplicates
	const handleScanDuplicates = async () => {
		if (!poolMangaId) return;
		try {
			setScanningDuplicates(true);
			setIsDuplicateModalOpen(true);
			const groups = await scanPoolDuplicates(poolMangaId);
			setDuplicateGroups(groups);
			// Auto select secondary duplicate pages by default
			const initialTargets: Array<{
				pool_chapter_id: string;
				page_number: number;
			}> = [];
			for (const g of groups) {
				// Keep items[0], select the rest
				for (let i = 1; i < g.items.length; i++) {
					initialTargets.push({
						pool_chapter_id: g.items[i].pool_chapter_id,
						page_number: g.items[i].page_number,
					});
				}
			}
			setSelectedDuplicateTargets(initialTargets);
		} catch (err: unknown) {
			const msg =
				err instanceof Error ? err.message : "Quét trùng trang thất bại";
			showToast(msg, "error");
		} finally {
			setScanningDuplicates(false);
		}
	};

	// Cleanup duplicates
	const handleCleanupDuplicates = async () => {
		if (!poolMangaId || selectedDuplicateTargets.length === 0) return;
		if (
			!window.confirm(
				`Xác nhận xóa ${selectedDuplicateTargets.length} trang ảnh trùng lặp được chọn khỏi Pool?\n(Hệ thống sẽ tự động đánh số lại trang cho các chương bị ảnh hưởng)`,
			)
		) {
			return;
		}

		try {
			setCleaningDuplicates(true);
			const res = await cleanupPoolDuplicates(
				poolMangaId,
				selectedDuplicateTargets,
			);
			showToast(
				`Đã dọn dẹp ${res.removed_pages_count} trang trùng trên ${res.modified_chapters} chương!`,
				"success",
			);
			setIsDuplicateModalOpen(false);
			await loadMangaData();
			onUpdated?.();
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "Dọn trùng thất bại";
			showToast(msg, "error");
		} finally {
			setCleaningDuplicates(false);
		}
	};

	// Verify integrity
	const handleVerifyIntegrity = async () => {
		if (!poolMangaId) return;
		try {
			setVerifyingIntegrity(true);
			const report = await verifyPoolMangaIntegrity(poolMangaId);
			setIntegrityReport(report);
			if (report.is_healthy) {
				showToast(
					`Toàn bộ ${report.total_checked} đối tượng MinIO đều hoàn toàn khả dụng!`,
					"success",
				);
			} else {
				showToast(
					`Phát hiện ${report.missing_keys.length} tệp MinIO bị thiếu!`,
					"warning",
				);
			}
		} catch (err: unknown) {
			const msg =
				err instanceof Error ? err.message : "Kiểm tra toàn vẹn thất bại";
			showToast(msg, "error");
		} finally {
			setVerifyingIntegrity(false);
		}
	};

	// Load manifest
	const handleLoadManifest = async () => {
		if (!poolMangaId) return;
		try {
			setLoadingManifest(true);
			const data = await exportEtlManifest(poolMangaId);
			setManifestJson(JSON.stringify(data, null, 2));
		} catch (err: unknown) {
			const msg =
				err instanceof Error ? err.message : "Không thể trích xuất manifest";
			showToast(msg, "error");
		} finally {
			setLoadingManifest(false);
		}
	};

	useEffect(() => {
		if (activeTab === "manifest" && !manifestJson) {
			void handleLoadManifest();
		}
	}, [activeTab]);

	// Filter chapters
	const filteredChapters = useMemo(() => {
		return chapters.filter((ch) => {
			if (chapterFilterLang !== "all" && ch.language !== chapterFilterLang) {
				return false;
			}
			if (chapterSearch) {
				const term = chapterSearch.toLowerCase();
				const matchNum = ch.chapter_number.toLowerCase().includes(term);
				const matchTitle = (ch.title || "").toLowerCase().includes(term);
				const matchGroup = (ch.scanlation_group || "")
					.toLowerCase()
					.includes(term);
				if (!matchNum && !matchTitle && !matchGroup) return false;
			}
			return true;
		});
	}, [chapters, chapterFilterLang, chapterSearch]);

	const availableLanguages = useMemo(() => {
		const set = new Set<string>();
		for (const ch of chapters) {
			if (ch.language) set.add(ch.language);
		}
		return Array.from(set).sort();
	}, [chapters]);

	if (!poolMangaId) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
			<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl w-full max-w-6xl 2xl:max-w-7xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
				{/* Top Header */}
				<div className="px-6 py-4 border-b border-[var(--border-primary)] flex items-center justify-between bg-zinc-900/50">
					<div className="flex items-center space-x-3 min-w-0">
						<div className="p-2 rounded-xl bg-orange-500/10 text-[var(--brand-orange)]">
							<Database size={22} />
						</div>
						<div className="min-w-0">
							<div className="flex items-center space-x-2">
								<h2 className="text-lg font-bold truncate text-[var(--text-primary)]">
									{manga?.title || "Quản lý Pool Manga"}
								</h2>
								{manga?.pool_state && (
									<Badge
										variant={
											manga.pool_state === "published" ? "default" : "secondary"
										}
										className={
											manga.pool_state === "published"
												? "bg-emerald-600 text-white"
												: "bg-zinc-700 text-zinc-300"
										}
									>
										{manga.pool_state.toUpperCase()}
									</Badge>
								)}
								{manga?.is_etl_ready && (
									<Badge className="bg-blue-600 text-white font-mono text-[10px]">
										ETL READY
									</Badge>
								)}
							</div>
							<p className="text-xs text-[var(--text-secondary)] font-mono truncate">
								ID: {poolMangaId} • Source: {manga?.source_manga_id} • Rev:{" "}
								{manga?.lineage?.pool_revision ?? 1}
							</p>
						</div>
					</div>

					<div className="flex items-center space-x-2">
						{manga?.lineage?.has_upstream_changes && (
							<Button
								variant="outline"
								size="sm"
								onClick={handleSync}
								disabled={syncing}
								className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10 flex items-center space-x-1.5"
								title="Bản gốc có thay đổi metadata hoặc chương mới. Bấm để đồng bộ lại!"
							>
								<RefreshCw
									size={14}
									className={syncing ? "animate-spin" : ""}
								/>
								<span className="hidden sm:inline">Sync từ Thư viện</span>
							</Button>
						)}

						<button
							type="button"
							onClick={onClose}
							className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-zinc-800 transition-colors cursor-pointer"
						>
							<X size={20} />
						</button>
					</div>
				</div>

				{/* Tabs Navigation */}
				<div className="flex border-b border-[var(--border-primary)] bg-zinc-900/30 px-6">
					<button
						type="button"
						onClick={() => setActiveTab("metadata")}
						className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors cursor-pointer ${
							activeTab === "metadata"
								? "border-[var(--brand-orange)] text-[var(--brand-orange)]"
								: "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
					>
						<FileText size={16} />
						<span>Metadata Đóng Gói</span>
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("chapters")}
						className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors cursor-pointer ${
							activeTab === "chapters"
								? "border-[var(--brand-orange)] text-[var(--brand-orange)]"
								: "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
					>
						<Layers size={16} />
						<span>Quản Lý Chapters & Pages ({chapters.length})</span>
					</button>

					<button
						type="button"
						onClick={() => setActiveTab("manifest")}
						className={`flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors cursor-pointer ${
							activeTab === "manifest"
								? "border-[var(--brand-orange)] text-[var(--brand-orange)]"
								: "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
					>
						<ShieldCheck size={16} />
						<span>ETL Manifest & Toàn Vẹn</span>
					</button>
				</div>

				{/* Modal Body */}
				<div className="p-6 overflow-y-auto flex-1 min-h-[400px]">
					{loading ? (
						<div className="py-24 flex flex-col items-center justify-center space-y-3">
							<Loader2
								className="animate-spin text-[var(--brand-orange)]"
								size={32}
							/>
							<p className="text-sm text-[var(--text-secondary)]">
								Đang tải dữ liệu bộ truyện trong Pool...
							</p>
						</div>
					) : (
						<>
							{/* TAB 1: METADATA ĐÓNG GÓI */}
							{activeTab === "metadata" && (
								<div className="space-y-6">
									<div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-400 flex items-start space-x-3">
										<Info size={18} className="shrink-0 mt-0.5" />
										<p>
											<strong>Lưu ý quan trọng:</strong> Mọi chỉnh sửa metadata
											dưới đây chỉ áp dụng cho tài liệu đóng gói trong{" "}
											<code>manga_datalake_pool</code> phục vụ bên thứ ba / ETL.
											Hệ thống Review gốc không bị thay đổi.
										</p>
									</div>

									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div className="space-y-1">
											<label className="text-xs font-semibold text-[var(--text-secondary)]">
												Tiêu Đề Chính (Title)
											</label>
											<input
												type="text"
												value={formTitle}
												onChange={(e) => setFormTitle(e.target.value)}
												className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-primary)] text-sm focus:outline-none focus:border-[var(--brand-orange)]"
											/>
										</div>

										<div className="space-y-1">
											<label className="text-xs font-semibold text-[var(--text-secondary)]">
												Tên Khác (Alt Titles - phân cách bằng dấu phẩy)
											</label>
											<input
												type="text"
												value={formAltTitles}
												onChange={(e) => setFormAltTitles(e.target.value)}
												className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-primary)] text-sm focus:outline-none focus:border-[var(--brand-orange)]"
											/>
										</div>

										<div className="space-y-1 md:col-span-2">
											<label className="text-xs font-semibold text-[var(--text-secondary)]">
												Tóm Tắt (Description / Synopsis)
											</label>
											<textarea
												rows={4}
												value={formDescription}
												onChange={(e) => setFormDescription(e.target.value)}
												className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-primary)] text-sm focus:outline-none focus:border-[var(--brand-orange)]"
											/>
										</div>

										<div className="space-y-1">
											<label className="text-xs font-semibold text-[var(--text-secondary)]">
												Tác Giả (Author)
											</label>
											<input
												type="text"
												value={formAuthor}
												onChange={(e) => setFormAuthor(e.target.value)}
												className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-primary)] text-sm focus:outline-none focus:border-[var(--brand-orange)]"
											/>
										</div>

										<div className="space-y-1">
											<label className="text-xs font-semibold text-[var(--text-secondary)]">
												Họa Sĩ (Artist)
											</label>
											<input
												type="text"
												value={formArtist}
												onChange={(e) => setFormArtist(e.target.value)}
												className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-primary)] text-sm focus:outline-none focus:border-[var(--brand-orange)]"
											/>
										</div>

										<div className="grid grid-cols-2 gap-2">
											<div className="space-y-1">
												<label className="text-xs font-semibold text-[var(--text-secondary)]">
													Năm Xuất Bản
												</label>
												<input
													type="text"
													value={formYear}
													onChange={(e) => setFormYear(e.target.value)}
													className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-primary)] text-sm focus:outline-none focus:border-[var(--brand-orange)]"
												/>
											</div>

											<div className="space-y-1">
												<label className="text-xs font-semibold text-[var(--text-secondary)]">
													Tình Trạng
												</label>
												<select
													value={formStatus}
													onChange={(e) => setFormStatus(e.target.value)}
													className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-primary)] text-sm focus:outline-none focus:border-[var(--brand-orange)]"
												>
													<option value="ongoing">
														Đang tiến hành (Ongoing)
													</option>
													<option value="completed">
														Hoàn thành (Completed)
													</option>
													<option value="hiatus">Tạm ngưng (Hiatus)</option>
													<option value="cancelled">Đã hủy (Cancelled)</option>
												</select>
											</div>
										</div>

										<div className="grid grid-cols-2 gap-2">
											<div className="space-y-1">
												<label className="text-xs font-semibold text-[var(--text-secondary)]">
													Demographic
												</label>
												<select
													value={formDemographic}
													onChange={(e) => setFormDemographic(e.target.value)}
													className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-primary)] text-sm focus:outline-none focus:border-[var(--brand-orange)]"
												>
													<option value="">Không xác định</option>
													<option value="shounen">Shounen</option>
													<option value="shoujo">Shoujo</option>
													<option value="seinen">Seinen</option>
													<option value="josei">Josei</option>
												</select>
											</div>

											<div className="space-y-1">
												<label className="text-xs font-semibold text-[var(--text-secondary)]">
													Độ Tuổi (Rating)
												</label>
												<select
													value={formContentRating}
													onChange={(e) => setFormContentRating(e.target.value)}
													className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-primary)] text-sm focus:outline-none focus:border-[var(--brand-orange)]"
												>
													<option value="safe">An toàn (Safe)</option>
													<option value="suggestive">
														Gợi cảm (Suggestive)
													</option>
													<option value="erotica">Erotica</option>
													<option value="pornographic">
														18+ (Pornographic)
													</option>
												</select>
											</div>
										</div>

										<div className="grid grid-cols-2 gap-2">
											<div className="space-y-1">
												<label className="text-xs font-semibold text-[var(--text-secondary)]">
													Trạng Thái Pool
												</label>
												<select
													value={formPoolState}
													onChange={(e) =>
														setFormPoolState(
															e.target.value as
																| "published"
																| "draft"
																| "archived",
														)
													}
													className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-primary)] text-sm focus:outline-none focus:border-[var(--brand-orange)]"
												>
													<option value="published">
														Xuất bản (Published)
													</option>
													<option value="draft">Bản nháp (Draft)</option>
													<option value="archived">Lưu trữ (Archived)</option>
												</select>
											</div>

											<div className="space-y-1 flex flex-col justify-end">
												<label className="flex items-center space-x-2 py-2 cursor-pointer">
													<input
														type="checkbox"
														checked={formEtlReady}
														onChange={(e) => setFormEtlReady(e.target.checked)}
														className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
													/>
													<span className="text-sm font-medium text-[var(--text-primary)]">
														Sẵn sàng cho ETL (ETL Ready)
													</span>
												</label>
											</div>
										</div>
									</div>

									{/* Denormalized tags display */}
									<div className="space-y-2 pt-2 border-t border-[var(--border-primary)]">
										<label className="text-xs font-semibold text-[var(--text-secondary)]">
											Thể Loại Đã Đóng Gói ({manga?.tags?.length || 0})
										</label>
										<div className="flex flex-wrap gap-1.5">
											{manga?.tags?.map((t, idx) => (
												<span
													key={t.source_tag_id || idx}
													style={{
														borderColor: t.color || "rgba(255,255,255,0.1)",
													}}
													className="px-2.5 py-1 text-xs rounded-full border bg-zinc-800/80 text-zinc-200"
												>
													{t.name?.en ||
														(typeof t.name === "string"
															? t.name
															: t.name?.vi || "Tag")}
												</span>
											))}
										</div>
									</div>

									{/* Action save */}
									<div className="pt-4 flex justify-end">
										<Button
											onClick={handleSaveMetadata}
											disabled={saving}
											className="bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white flex items-center space-x-2"
										>
											<Save size={16} />
											<span>
												{saving ? "Đang lưu..." : "Lưu Thay Đổi (Pool DB)"}
											</span>
										</Button>
									</div>
								</div>
							)}

							{/* TAB 2: QUẢN LÝ CHAPTERS & PAGES */}
							{activeTab === "chapters" && (
								<div className="space-y-4">
									{/* Filter bar */}
									<div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/40 border border-[var(--border-primary)]">
										<div className="flex items-center space-x-2 flex-1 min-w-[200px]">
											<Search
												size={16}
												className="text-[var(--text-secondary)]"
											/>
											<input
												type="text"
												placeholder="Tìm số chương, tiêu đề, nhóm dịch..."
												value={chapterSearch}
												onChange={(e) => setChapterSearch(e.target.value)}
												className="bg-transparent border-none text-sm text-[var(--text-primary)] focus:outline-none w-full"
											/>
										</div>

										<div className="flex items-center space-x-2">
											<select
												value={chapterFilterLang}
												onChange={(e) => setChapterFilterLang(e.target.value)}
												className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-primary)] text-xs text-[var(--text-secondary)] focus:outline-none"
											>
												<option value="all">Tất cả ngôn ngữ</option>
												{availableLanguages.map((l) => (
													<option key={l} value={l}>
														Ngôn ngữ: {l.toUpperCase()}
													</option>
												))}
											</select>

											<Button
												variant="outline"
												size="sm"
												onClick={handleScanDuplicates}
												disabled={scanningDuplicates}
												className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10 flex items-center space-x-1.5"
											>
												<Sparkles
													size={14}
													className={scanningDuplicates ? "animate-spin" : ""}
												/>
												<span>Quét Trùng Trang (MD5)</span>
											</Button>
										</div>
									</div>

									{/* Chapters list */}
									{filteredChapters.length === 0 ? (
										<div className="py-16 text-center text-sm text-[var(--text-secondary)]">
											Không tìm thấy chương nào phù hợp điều kiện lọc.
										</div>
									) : (
										<div className="space-y-3">
											{filteredChapters.map((ch) => {
												const isExpanded =
													expandedChapterId === ch.pool_chapter_id;
												return (
													<div
														key={ch.pool_chapter_id}
														className="rounded-xl border border-[var(--border-primary)] bg-zinc-900/20 overflow-hidden"
													>
														{/* Chapter Header Card */}
														<div className="p-3.5 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
															<div className="flex items-center space-x-3 min-w-0">
																<button
																	type="button"
																	onClick={() =>
																		handleToggleExpandChapter(
																			ch.pool_chapter_id,
																		)
																	}
																	className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
																>
																	{isExpanded ? (
																		<ChevronUp size={16} />
																	) : (
																		<ChevronDown size={16} />
																	)}
																</button>
																<div>
																	<div className="flex items-center space-x-2">
																		<span className="font-bold text-sm text-[var(--text-primary)]">
																			Chương {ch.chapter_number}
																		</span>
																		{ch.volume && (
																			<Badge
																				variant="outline"
																				className="text-xs"
																			>
																				Vol. {ch.volume}
																			</Badge>
																		)}
																		<Badge className="bg-orange-500/20 text-orange-400 text-[10px] font-mono uppercase">
																			{ch.language}
																		</Badge>
																		{ch.scanlation_group && (
																			<span className="text-xs text-[var(--text-secondary)] truncate">
																				{ch.scanlation_group}
																			</span>
																		)}
																	</div>
																	{ch.title && (
																		<p className="text-xs text-[var(--text-secondary)] truncate">
																			{ch.title}
																		</p>
																	)}
																</div>
															</div>

															<div className="flex items-center space-x-3 text-xs text-[var(--text-secondary)]">
																<span>{ch.page_count} trang</span>
																<span>
																	{(
																		ch.total_size_bytes /
																		(1024 * 1024)
																	).toFixed(1)}{" "}
																	MB
																</span>

																<button
																	type="button"
																	onClick={() =>
																		handleDeleteChapter(
																			ch.pool_chapter_id,
																			ch.chapter_number,
																		)
																	}
																	className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
																	title="Gỡ chương khỏi Pool"
																>
																	<Trash2 size={16} />
																</button>
															</div>
														</div>

														{/* Expanded Page Grid */}
														{isExpanded && (
															<div className="p-4 border-t border-[var(--border-primary)] bg-zinc-950/40 space-y-4">
																{loadingChapterPages ? (
																	<div className="py-12 flex justify-center">
																		<Loader2
																			className="animate-spin text-orange-500"
																			size={24}
																		/>
																	</div>
																) : (
																	<>
																		{/* Action bar for pages */}
																		<div className="flex items-center justify-between text-xs">
																			<div className="flex items-center space-x-2">
																				<span>
																					Đã chọn:{" "}
																					<strong>
																						{selectedPageNumbers.length}
																					</strong>{" "}
																					trang
																				</span>
																				{selectedPageNumbers.length > 0 && (
																					<button
																						type="button"
																						onClick={() =>
																							setSelectedPageNumbers([])
																						}
																						className="underline text-zinc-400 hover:text-white"
																					>
																						Bỏ chọn
																					</button>
																				)}
																			</div>

																			{selectedPageNumbers.length > 0 && (
																				<Button
																					size="sm"
																					variant="destructive"
																					onClick={handleDeletePages}
																					disabled={deletingPages}
																					className="flex items-center space-x-1"
																				>
																					<Trash2 size={14} />
																					<span>
																						{deletingPages
																							? "Đang xóa..."
																							: `Xóa ${selectedPageNumbers.length} trang đã chọn`}
																					</span>
																				</Button>
																			)}
																		</div>

																		{/* Pages Grid */}
																		<div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
																			{expandedChapter?.pages?.map((p) => {
																				const isSelected =
																					selectedPageNumbers.includes(
																						p.page_number,
																					);
																				return (
																					<div
																						key={p.page_uid || p.page_number}
																						onClick={() => {
																							setSelectedPageNumbers((prev) =>
																								isSelected
																									? prev.filter(
																											(n) =>
																												n !== p.page_number,
																										)
																									: [...prev, p.page_number],
																							);
																						}}
																						className={`group relative rounded-lg border overflow-hidden cursor-pointer transition-all aspect-[2/3] bg-zinc-900 ${
																							isSelected
																								? "border-orange-500 ring-2 ring-orange-500/50"
																								: "border-zinc-800 hover:border-zinc-700"
																						}`}
																					>
																						{p.url ? (
																							<img
																								src={p.url}
																								alt={`Trang ${p.page_number}`}
																								loading="lazy"
																								decoding="async"
																								className="w-full h-full object-cover"
																							/>
																						) : (
																							<div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
																								No URL
																							</div>
																						)}

																						<div className="absolute top-1.5 left-1.5">
																							<span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/70 text-white backdrop-blur-xs">
																								#{p.page_number}
																							</span>
																						</div>

																						<div className="absolute bottom-0 inset-x-0 p-1 bg-gradient-to-t from-black/90 to-transparent text-[9px] text-zinc-300 truncate text-center">
																							{(p.file_size / 1024).toFixed(0)}{" "}
																							KB
																						</div>

																						<div
																							className={`absolute top-1.5 right-1.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
																								isSelected
																									? "bg-orange-500 border-orange-500 text-white"
																									: "border-white/50 bg-black/40"
																							}`}
																						>
																							{isSelected && (
																								<Check size={12} />
																							)}
																						</div>
																					</div>
																				);
																			})}
																		</div>
																	</>
																)}
															</div>
														)}
													</div>
												);
											})}
										</div>
									)}
								</div>
							)}

							{/* TAB 3: ETL MANIFEST & KIỂM TRA TOÀN VẸN */}
							{activeTab === "manifest" && (
								<div className="space-y-6">
									{/* Integrity Check Deck */}
									<div className="p-4 rounded-xl border border-[var(--border-primary)] bg-zinc-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
										<div>
											<h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center space-x-2">
												<ShieldCheck size={18} className="text-emerald-500" />
												<span>Kiểm Tra Toàn Vẹn MinIO Object Keys</span>
											</h4>
											<p className="text-xs text-[var(--text-secondary)] mt-0.5">
												Quét trực tiếp từng object_key của trang và ảnh bìa để
												đảm bảo dữ liệu vật lý sẵn sàng cho ETL.
											</p>
											{integrityReport && (
												<div className="mt-2 flex items-center space-x-3 text-xs">
													<Badge
														variant={
															integrityReport.is_healthy
																? "default"
																: "destructive"
														}
													>
														{integrityReport.is_healthy
															? "100% HEALTHY"
															: `${integrityReport.missing_keys.length} TỆP THIẾU`}
													</Badge>
													<span className="text-zinc-400">
														Đã kiểm tra: {integrityReport.total_checked} keys
													</span>
												</div>
											)}
										</div>

										<Button
											variant="outline"
											onClick={handleVerifyIntegrity}
											disabled={verifyingIntegrity}
											className="shrink-0 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
										>
											{verifyingIntegrity
												? "Đang quét..."
												: "Chạy Kiểm Tra Ngay"}
										</Button>
									</div>

									{/* Manifest JSON section */}
									<div className="space-y-3">
										<div className="flex items-center justify-between">
											<h4 className="font-bold text-sm text-[var(--text-primary)]">
												Gói Hợp Đồng ETL Manifest (Data Contract v1.0)
											</h4>
											<div className="flex items-center space-x-2">
												<Button
													size="sm"
													variant="outline"
													onClick={() => {
														navigator.clipboard.writeText(manifestJson);
														setCopiedManifest(true);
														setTimeout(() => setCopiedManifest(false), 2000);
													}}
													className="text-xs flex items-center space-x-1"
												>
													<Copy size={13} />
													<span>
														{copiedManifest ? "Đã chép!" : "Sao chép JSON"}
													</span>
												</Button>

												<Button
													size="sm"
													variant="outline"
													onClick={() => {
														const blob = new Blob([manifestJson], {
															type: "application/json",
														});
														const url = URL.createObjectURL(blob);
														const a = document.createElement("a");
														a.href = url;
														a.download = `manifest_${manga?.slug || poolMangaId}.json`;
														a.click();
														URL.revokeObjectURL(url);
													}}
													className="text-xs flex items-center space-x-1"
												>
													<Download size={13} />
													<span>Tải về file</span>
												</Button>
											</div>
										</div>

										{loadingManifest ? (
											<div className="py-16 flex justify-center">
												<Loader2
													className="animate-spin text-orange-500"
													size={28}
												/>
											</div>
										) : (
											<pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 overflow-x-auto max-h-[350px]">
												{manifestJson || "Chưa có manifest"}
											</pre>
										)}
									</div>
								</div>
							)}
						</>
					)}
				</div>

				{/* DUPLICATE CLEANUP MODAL */}
				{isDuplicateModalOpen && (
					<div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
						<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
							<div className="px-5 py-4 border-b border-[var(--border-primary)] flex items-center justify-between">
								<h3 className="font-bold text-base flex items-center space-x-2 text-amber-400">
									<Sparkles size={18} />
									<span>Phát Hiện Trang Trùng Lặp (MD5 Deduplication)</span>
								</h3>
								<button
									type="button"
									onClick={() => setIsDuplicateModalOpen(false)}
									className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
								>
									<X size={18} />
								</button>
							</div>

							<div className="p-5 overflow-y-auto flex-1 space-y-4">
								{scanningDuplicates ? (
									<div className="py-12 flex justify-center">
										<Loader2
											className="animate-spin text-orange-500"
											size={28}
										/>
									</div>
								) : duplicateGroups.length === 0 ? (
									<div className="py-12 text-center text-sm text-zinc-400">
										Tuyệt vời! Không phát hiện trang truyện nào bị trùng mã băm
										MD5 trong Pool.
									</div>
								) : (
									<div className="space-y-4">
										<p className="text-xs text-zinc-400">
											Tìm thấy <strong>{duplicateGroups.length}</strong> nhóm
											trang trùng lặp. Đánh dấu các trang muốn xóa khỏi Pool
											(trang đầu tiên trong mỗi nhóm được mặc định giữ lại):
										</p>

										{duplicateGroups.map((g, gIdx) => (
											<div
												key={g.hash_value}
												className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-2"
											>
												<div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
													<span>
														Nhóm #{gIdx + 1} (MD5: {g.hash_value.slice(0, 12)}
														...)
													</span>
													<span>{(g.file_size / 1024).toFixed(0)} KB</span>
												</div>

												<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
													{g.items.map((item, itemIdx) => {
														const isChecked = selectedDuplicateTargets.some(
															(t) =>
																t.pool_chapter_id === item.pool_chapter_id &&
																t.page_number === item.page_number,
														);
														return (
															<div
																key={`${item.pool_chapter_id}-${item.page_number}`}
																onClick={() => {
																	setSelectedDuplicateTargets((prev) =>
																		isChecked
																			? prev.filter(
																					(t) =>
																						!(
																							t.pool_chapter_id ===
																								item.pool_chapter_id &&
																							t.page_number === item.page_number
																						),
																				)
																			: [
																					...prev,
																					{
																						pool_chapter_id:
																							item.pool_chapter_id,
																						page_number: item.page_number,
																					},
																				],
																	);
																}}
																className={`p-2 rounded-lg border cursor-pointer transition-all flex flex-col space-y-1.5 ${
																	isChecked
																		? "border-rose-500 bg-rose-500/10"
																		: itemIdx === 0
																			? "border-emerald-500/50 bg-emerald-500/5"
																			: "border-zinc-800"
																}`}
															>
																<div className="aspect-[2/3] rounded overflow-hidden bg-zinc-950 relative">
																	{item.url && (
																		<img
																			src={item.url}
																			alt="Trang trùng"
																			className="w-full h-full object-cover"
																		/>
																	)}
																	<span className="absolute bottom-1 right-1 px-1 rounded text-[9px] bg-black/70 font-bold">
																		Ch.{item.chapter_number} : P.
																		{item.page_number}
																	</span>
																</div>
																<span className="text-[10px] text-center font-medium">
																	{itemIdx === 0 && !isChecked ? (
																		<span className="text-emerald-400">
																			Giữ lại (Gốc)
																		</span>
																	) : isChecked ? (
																		<span className="text-rose-400">
																			Xóa khỏi Pool
																		</span>
																	) : (
																		<span className="text-zinc-400">
																			Chưa chọn
																		</span>
																	)}
																</span>
															</div>
														);
													})}
												</div>
											</div>
										))}
									</div>
								)}
							</div>

							<div className="px-5 py-3 border-t border-[var(--border-primary)] flex justify-between items-center bg-zinc-900/40">
								<span className="text-xs text-zinc-400">
									Đã chọn xóa: {selectedDuplicateTargets.length} trang
								</span>
								<div className="flex space-x-2">
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setIsDuplicateModalOpen(false)}
									>
										Đóng
									</Button>
									<Button
										size="sm"
										variant="destructive"
										onClick={handleCleanupDuplicates}
										disabled={
											cleaningDuplicates ||
											selectedDuplicateTargets.length === 0
										}
									>
										{cleaningDuplicates
											? "Đang dọn dẹp..."
											: `Xác nhận xóa ${selectedDuplicateTargets.length} trang`}
									</Button>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
