import {
	AlertCircle,
	Check,
	CheckCircle2,
	Download,
	ExternalLink,
	Folder,
	Globe,
	Layers,
	Loader2,
	RefreshCw,
	Search,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../ui/dialog";

interface SourceDownloadDialogProps {
	isOpen: boolean;
	onClose: () => void;
	mangaId: string;
	mangaTitle: string;
	mangadexId?: string | null;
	defaultSource?: string;
	onDownloadStarted?: (taskId: string) => void;
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

	// Work resolution state
	const [sourceUrlInput, setSourceUrlInput] = useState<string>("");
	const [resolvingWork, setResolvingWork] = useState<boolean>(false);
	const [activeWork, setActiveWork] = useState<SourceWork | null>(null);

	// Releases catalogue state
	const [selectedLang, setSelectedLang] = useState<string>("en");
	const [availableLangs, setAvailableLangs] = useState<string[]>(["en"]);
	const [releases, setReleases] = useState<SourceRelease[]>([]);
	const [loadingReleases, setLoadingReleases] = useState<boolean>(false);
	const [releaseError, setReleaseError] = useState<string | null>(null);

	// Storage coverage
	const [existingChapterIds, setExistingChapterIds] = useState<Set<string>>(
		new Set(),
	);
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

	// Execution state
	const [executing, setExecuting] = useState<boolean>(false);

	// Load providers on open
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

		const fetchStorageChapters = async () => {
			setLoadingStorage(true);
			try {
				const res = await client.get(`/api/manga/${mangaId}/chapters`);
				const chaps = res.data?.chapters || [];
				const set = new Set<string>();
				for (const c of chaps) {
					if (c.source_id) set.add(String(c.source_id));
					if (c.chapter_number) set.add(`num:${c.chapter_number}`);
				}
				setExistingChapterIds(set);
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
		fetchStorageChapters();
		fetchBasePath();
	}, [isOpen, mangaId]);

	// Auto-resolve work when provider changes
	useEffect(() => {
		if (!isOpen) return;

		setActiveWork(null);
		setReleases([]);
		setSelectedReleaseIds(new Set());
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
				} catch (err: any) {
					console.error("Failed to resolve MangaDex work:", err);
					setReleaseError(
						err.response?.data?.detail || "Không thể kết nối với MangaDex",
					);
				} finally {
					setResolvingWork(false);
				}
			}
		};

		initWork();
	}, [isOpen, selectedProvider, mangadexId]);

	// Resolve work from custom URL (e.g. MangaFire)
	const handleResolveUrl = async () => {
		if (!sourceUrlInput.trim()) return;
		setResolvingWork(true);
		setReleaseError(null);
		try {
			const res = await client.post<SourceWork>("/api/datasources/resolve", {
				url_or_id: sourceUrlInput.trim(),
				provider_hint: selectedProvider,
			});
			setActiveWork(res.data);
			setAvailableLangs(res.data.available_languages || ["en"]);
			if (res.data.available_languages?.includes("en")) {
				setSelectedLang("en");
			} else if (res.data.available_languages?.[0]) {
				setSelectedLang(res.data.available_languages[0]);
			}
			showToast(
				`Đã nhận diện: "${res.data.title}" từ ${selectedProvider}`,
				"success",
			);
		} catch (err: any) {
			const msg =
				err.response?.data?.detail || "Không thể phân tích URL của nguồn này";
			setReleaseError(msg);
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
				setReleases(res.data.items || []);

				// Auto-select based on one-per-chapter mode
				const initialSelected = new Set<string>();
				const seenNumbers = new Set<string>();

				for (const rel of res.data.items || []) {
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
			} catch (err: any) {
				console.error("Failed to load releases:", err);
				setReleaseError(
					err.response?.data?.detail || "Không thể tải danh sách chương",
				);
			} finally {
				setLoadingReleases(false);
			}
		};

		fetchReleases();
	}, [activeWork, selectedLang, onePerChapterMode]);

	// Filtered releases based on search & release type
	const filteredReleases = useMemo(() => {
		return releases.filter((r) => {
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
	}, [releases, searchQuery, releaseTypeFilter]);

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

	// Select all in view
	const handleSelectAll = () => {
		const next = new Set(selectedReleaseIds);
		for (const r of filteredReleases) {
			next.add(r.id);
		}
		setSelectedReleaseIds(next);
	};

	// Clear selection
	const handleClearSelection = () => {
		setSelectedReleaseIds(new Set());
	};

	// Select only missing in storage
	const handleSelectMissing = () => {
		const next = new Set<string>();
		const seenNumbers = new Set<string>();

		for (const r of filteredReleases) {
			const isStored =
				existingChapterIds.has(r.id) ||
				existingChapterIds.has(`num:${r.chapter_number}`);
			if (!isStored) {
				if (onePerChapterMode) {
					if (!seenNumbers.has(r.chapter_number)) {
						seenNumbers.add(r.chapter_number);
						next.add(r.id);
					}
				} else {
					next.add(r.id);
				}
			}
		}
		setSelectedReleaseIds(next);
	};

	// Execute Download Plan
	const handleStartDownload = async () => {
		if (!activeWork) return;
		if (selectedReleaseIds.size === 0) {
			showToast("Vui lòng chọn ít nhất một chương để tải.", "warning");
			return;
		}

		setExecuting(true);
		try {
			// 1. Create Download Plan
			const createPlanRes = await client.post<DownloadPlan>(
				`/api/manga/${mangaId}/download-plans`,
				{
					source: activeWork.source,
					source_work_id: activeWork.source_work_id,
					release_ids: Array.from(selectedReleaseIds),
					selection_policy: selectionPolicy,
					save_to_disk: saveToDisk,
					download_path: customPath.trim() || undefined,
				},
			);

			const planId = createPlanRes.data.id;

			// 2. Execute Download Plan
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
		} catch (err: any) {
			console.error("Execution error:", err);
			showToast(
				err.response?.data?.detail || "Đã xảy ra lỗi khi tạo tác vụ.",
				"error",
			);
		} finally {
			setExecuting(false);
		}
	};

	// Summary statistics
	const totalSelected = selectedReleaseIds.size;
	const readyCount = useMemo(() => {
		let count = 0;
		for (const id of selectedReleaseIds) {
			const r = releases.find((item) => item.id === id);
			if (
				r &&
				(existingChapterIds.has(r.id) ||
					existingChapterIds.has(`num:${r.chapter_number}`))
			) {
				count++;
			}
		}
		return count;
	}, [selectedReleaseIds, releases, existingChapterIds]);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-primary)]">
				{/* Header */}
				<DialogHeader className="px-6 py-4 border-b border-[var(--border-primary)] shrink-0">
					<div className="flex items-center justify-between">
						<div className="flex items-center space-x-2">
							<div className="p-2 rounded-lg bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]">
								<Download className="w-5 h-5" />
							</div>
							<div>
								<DialogTitle className="text-lg font-bold">
									Tải Chương Đa Nguồn (Multi-Source Downloader)
								</DialogTitle>
								<DialogDescription className="text-xs text-[var(--text-secondary)]">
									{mangaTitle}
								</DialogDescription>
							</div>
						</div>
					</div>
				</DialogHeader>

				{/* Body Content */}
				<div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
					{/* 1. Source Selector Tabs */}
					<div className="space-y-2">
						<label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
							Chọn Nguồn Cung Cấp (Datasource)
						</label>
						<div className="flex flex-wrap gap-2">
							{providers.map((p) => {
								const isSelected = selectedProvider === p.name;
								return (
									<button
										key={p.name}
										type="button"
										onClick={() => setSelectedProvider(p.name)}
										className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg border text-xs font-medium transition ${
											isSelected
												? "border-[var(--brand-orange)] bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] shadow-sm"
												: "border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 text-[var(--text-secondary)]"
										}`}
									>
										<Globe className="w-4 h-4" />
										<span className="capitalize">{p.display_name}</span>
										{p.requires_session && (
											<Badge
												variant="secondary"
												className="text-[10px] px-1.5 py-0 h-4 bg-amber-500/10 text-amber-500 border-amber-500/20"
											>
												Browser Session
											</Badge>
										)}
									</button>
								);
							})}
						</div>
					</div>

					{/* 2. Source Work Resolution & URL Input (especially for MangaFire) */}
					{selectedProvider === "mangafire" && !activeWork && (
						<div className="p-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]/40 space-y-3">
							<div className="flex items-center space-x-2 text-xs font-semibold text-[var(--text-primary)]">
								<Sparkles className="w-4 h-4 text-[var(--brand-orange)]" />
								<span>Liên kết tác phẩm MangaFire</span>
							</div>
							<p className="text-xs text-[var(--text-secondary)]">
								Nhập đường link truyện trên MangaFire (ví dụ:{" "}
								<code className="text-[var(--brand-orange)]">
									https://mangafire.to/title/oj8n8-sheeply-horned-witch-romii
								</code>
								) để phân tích mục lục và chapter.
							</p>
							<div className="flex items-center space-x-2">
								<input
									type="url"
									value={sourceUrlInput}
									onChange={(e) => setSourceUrlInput(e.target.value)}
									placeholder="https://mangafire.to/title/..."
									className="flex-1 px-3 py-2 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
								/>
								<Button
									type="button"
									size="sm"
									disabled={resolvingWork || !sourceUrlInput.trim()}
									onClick={handleResolveUrl}
									className="bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs shrink-0"
								>
									{resolvingWork ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
									) : (
										<Check className="w-3.5 h-3.5 mr-1.5" />
									)}
									Nhận diện nguồn
								</Button>
							</div>
						</div>
					)}

					{/* Active Work Info Card */}
					{activeWork && (
						<div className="p-3.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]/30 flex items-center justify-between">
							<div className="flex items-center space-x-3 min-w-0">
								{activeWork.cover_url ? (
									<img
										src={activeWork.cover_url}
										alt={activeWork.title}
										className="w-10 h-14 object-cover rounded shadow-sm border border-[var(--border-primary)] shrink-0"
									/>
								) : (
									<div className="w-10 h-14 rounded bg-[var(--bg-secondary)] flex items-center justify-center shrink-0 border border-[var(--border-primary)]">
										<Layers className="w-4 h-4 text-[var(--text-secondary)]" />
									</div>
								)}
								<div className="min-w-0">
									<h4 className="text-xs font-bold truncate">
										{activeWork.title}
									</h4>
									<p className="text-[11px] text-[var(--text-secondary)] truncate">
										Nguồn:{" "}
										<span className="font-semibold capitalize text-[var(--brand-orange)]">
											{activeWork.source}
										</span>{" "}
										· ID: {activeWork.source_work_id}
									</p>
									<a
										href={activeWork.url}
										target="_blank"
										rel="noreferrer"
										className="text-[10px] text-blue-500 hover:underline flex items-center space-x-1 mt-0.5"
									>
										<span>Mở link gốc</span>
										<ExternalLink className="w-2.5 h-2.5" />
									</a>
								</div>
							</div>

							{/* Language Pills */}
							<div className="flex items-center space-x-1.5 shrink-0">
								<span className="text-[11px] text-[var(--text-secondary)] font-medium">
									Ngôn ngữ:
								</span>
								<div className="flex space-x-1">
									{availableLangs.map((lang) => (
										<button
											key={lang}
											type="button"
											onClick={() => setSelectedLang(lang)}
											className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
												selectedLang === lang
													? "bg-[var(--brand-orange)] text-white shadow-xs"
													: "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]/80"
											}`}
										>
											{lang.toUpperCase()}
										</button>
									))}
								</div>
							</div>
						</div>
					)}

					{/* Loading State */}
					{(resolvingWork || loadingReleases) && (
						<div className="py-12 flex flex-col items-center justify-center space-y-3">
							<Loader2 className="w-8 h-8 animate-spin text-[var(--brand-orange)]" />
							<p className="text-xs text-[var(--text-secondary)]">
								{resolvingWork
									? "Đang phân tích định danh và cấu trúc tác phẩm..."
									: "Đang tải mục lục và các bản phát hành..."}
							</p>
						</div>
					)}

					{/* Error State */}
					{releaseError && !resolvingWork && !loadingReleases && (
						<div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 text-xs flex items-start space-x-2.5">
							<AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
							<div className="flex-1">
								<p className="font-semibold">Lỗi tải dữ liệu</p>
								<p className="text-[11px] text-red-400 mt-0.5">
									{releaseError}
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => handleResolveUrl()}
								className="text-xs h-7 text-red-500 hover:bg-red-500/10"
							>
								<RefreshCw className="w-3 h-3 mr-1" /> Thử lại
							</Button>
						</div>
					)}

					{/* 3. Releases Table & Filters */}
					{activeWork && !loadingReleases && releases.length > 0 && (
						<div className="space-y-3">
							{/* Filter Toolbar */}
							<div className="flex flex-wrap items-center justify-between gap-2 text-xs">
								<div className="flex items-center space-x-2 flex-1 min-w-[200px]">
									<div className="relative flex-1">
										<Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
										<input
											type="text"
											value={searchQuery}
											onChange={(e) => setSearchQuery(e.target.value)}
											placeholder="Tìm số chương hoặc tiêu đề..."
											className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
										/>
									</div>
									<select
										value={releaseTypeFilter}
										onChange={(e) => setReleaseTypeFilter(e.target.value)}
										className="px-2.5 py-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] focus:outline-none"
									>
										<option value="all">Tất cả loại release</option>
										<option value="official">Chỉ Official</option>
										<option value="unofficial">Chỉ Unofficial</option>
									</select>
								</div>

								{/* Action Buttons */}
								<div className="flex items-center space-x-1.5 shrink-0">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleSelectMissing}
										className="text-[11px] h-7 border-[var(--border-primary)]"
									>
										Tải phần còn thiếu
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleSelectAll}
										className="text-[11px] h-7 border-[var(--border-primary)]"
									>
										Chọn tất cả
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={handleClearSelection}
										className="text-[11px] h-7 text-[var(--text-secondary)]"
									>
										Bỏ chọn
									</Button>
								</div>
							</div>

							{/* Selection Policy Switcher */}
							<div className="p-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)]/20 flex flex-wrap items-center justify-between gap-3 text-xs">
								<div className="flex items-center space-x-2">
									<ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
									<span className="text-[var(--text-secondary)]">
										Chính sách xử lý:
									</span>
									<select
										value={selectionPolicy}
										onChange={(e) =>
											setSelectionPolicy(
												e.target.value as DownloadSelectionPolicy,
											)
										}
										className="px-2 py-1 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] font-medium text-[var(--text-primary)]"
									>
										<option value="skip_existing_release">
											Bỏ qua nếu đã tải sẵn (Khuyến nghị)
										</option>
										<option value="replace_preferred_after_commit">
											Thay thế bản ưu tiên sau khi commit
										</option>
										<option value="keep_alternative">
											Lưu song song như bản phụ (Alternative)
										</option>
									</select>
								</div>

								<label className="flex items-center space-x-2 cursor-pointer select-none">
									<input
										type="checkbox"
										checked={onePerChapterMode}
										onChange={(e) => setOnePerChapterMode(e.target.checked)}
										className="rounded text-[var(--brand-orange)] focus:ring-0 w-3.5 h-3.5"
									/>
									<span className="text-[11px] text-[var(--text-secondary)]">
										Chỉ chọn 1 bản mỗi chương (Tránh trùng lặp)
									</span>
								</label>
							</div>

							{/* Releases Table */}
							<div className="border border-[var(--border-primary)] rounded-xl overflow-hidden">
								<div className="max-h-[320px] overflow-y-auto">
									<table className="w-full text-left text-xs">
										<thead className="bg-[var(--bg-secondary)] sticky top-0 border-b border-[var(--border-primary)] text-[var(--text-secondary)] uppercase text-[10px] tracking-wider z-10">
											<tr>
												<th className="p-2.5 w-10 text-center">
													<input
														type="checkbox"
														checked={
															filteredReleases.length > 0 &&
															filteredReleases.every((r) =>
																selectedReleaseIds.has(r.id),
															)
														}
														onChange={(e) => {
															if (e.target.checked) handleSelectAll();
															else handleClearSelection();
														}}
														className="rounded text-[var(--brand-orange)] focus:ring-0 w-3.5 h-3.5"
													/>
												</th>
												<th className="p-2.5 w-24">Chương</th>
												<th className="p-2.5">Tiêu đề / Bản phát hành</th>
												<th className="p-2.5 w-28">Loại</th>
												<th className="p-2.5 w-28">Trạng thái</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-[var(--border-primary)]">
											{filteredReleases.map((rel) => {
												const isSelected = selectedReleaseIds.has(rel.id);
												const isStored =
													existingChapterIds.has(rel.id) ||
													existingChapterIds.has(`num:${rel.chapter_number}`);

												return (
													<tr
														key={rel.id}
														onClick={() => toggleRelease(rel.id)}
														className={`cursor-pointer transition hover:bg-[var(--bg-secondary)]/50 ${
															isSelected ? "bg-[var(--brand-orange)]/5" : ""
														}`}
													>
														<td
															className="p-2.5 text-center"
															onClick={(e) => e.stopPropagation()}
														>
															<input
																type="checkbox"
																checked={isSelected}
																onChange={() => toggleRelease(rel.id)}
																className="rounded text-[var(--brand-orange)] focus:ring-0 w-3.5 h-3.5"
															/>
														</td>
														<td className="p-2.5 font-bold">
															Ch. {rel.chapter_number}
														</td>
														<td className="p-2.5">
															<div className="font-medium truncate max-w-[320px]">
																{rel.title || "(Không có tên)"}
															</div>
															<div className="text-[10px] text-[var(--text-secondary)]">
																ID: {rel.id}
															</div>
														</td>
														<td className="p-2.5">
															{rel.release_type === "official" ? (
																<Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px] px-1.5 py-0 font-medium">
																	Official
																</Badge>
															) : rel.release_type === "unofficial" ? (
																<Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] px-1.5 py-0 font-medium">
																	Unofficial
																</Badge>
															) : (
																<span className="text-[var(--text-secondary)] text-[10px]">
																	-
																</span>
															)}
														</td>
														<td className="p-2.5">
															{isStored ? (
																<Badge
																	variant="secondary"
																	className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] px-1.5 py-0 font-medium flex items-center space-x-1 w-fit"
																>
																	<CheckCircle2 className="w-2.5 h-2.5" />
																	<span>Đã có</span>
																</Badge>
															) : (
																<span className="text-[var(--text-secondary)] text-[11px]">
																	Chưa tải
																</span>
															)}
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							</div>
						</div>
					)}

					{/* 4. Local Disk Mirror Option */}
					<div className="p-3.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]/20 space-y-2 text-xs">
						<label className="flex items-center space-x-2 cursor-pointer select-none">
							<input
								type="checkbox"
								checked={saveToDisk}
								onChange={(e) => setSaveToDisk(e.target.checked)}
								className="rounded text-[var(--brand-orange)] focus:ring-0 w-3.5 h-3.5"
							/>
							<span className="font-semibold text-[var(--text-primary)]">
								Lưu thêm bản sao ảnh vào ổ đĩa máy tính (Mirror to Disk)
							</span>
						</label>
						{saveToDisk && (
							<div className="flex items-center space-x-2 pt-1">
								<Folder className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
								<input
									type="text"
									value={customPath}
									onChange={(e) => setCustomPath(e.target.value)}
									placeholder="D:\MangaStorage\..."
									className="flex-1 px-3 py-1.5 text-xs rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
								/>
							</div>
						)}
					</div>
				</div>

				{/* Footer */}
				<DialogFooter className="px-6 py-3 border-t border-[var(--border-primary)] shrink-0 bg-[var(--bg-secondary)]/40 flex items-center justify-between sm:justify-between">
					<div className="text-xs text-[var(--text-secondary)]">
						Đã chọn{" "}
						<span className="font-bold text-[var(--text-primary)]">
							{totalSelected}
						</span>{" "}
						bản phát hành
						{readyCount > 0 && (
							<span className="text-emerald-500 ml-1">
								({readyCount} đã có sẵn trong kho)
							</span>
						)}
					</div>
					<div className="flex items-center space-x-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onClose}
							className="text-xs border-[var(--border-primary)]"
						>
							Huỷ
						</Button>
						<Button
							type="button"
							size="sm"
							disabled={executing || totalSelected === 0}
							onClick={handleStartDownload}
							className="bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-semibold shadow-sm"
						>
							{executing ? (
								<Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
							) : (
								<Download className="w-3.5 h-3.5 mr-1.5" />
							)}
							Tạo Plan & Bắt đầu tải
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
