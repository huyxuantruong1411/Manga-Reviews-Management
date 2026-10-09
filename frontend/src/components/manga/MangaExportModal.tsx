import {
	AlertTriangle,
	Archive,
	BookOpen,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Download,
	FileText,
	Folder,
	FolderOpen,
	HardDrive,
	Layers,
	Loader2,
	RefreshCw,
	SlidersHorizontal,
	Terminal,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiUrl, client } from "../../api/client";
import { useAlert } from "../../hooks/useAlert";
import type {
	Chapter,
	ChapterExportProgress,
	ExportDestination,
	ExportFormat,
	ExportGrouping,
	ExportLogItem,
	ImageOptimization,
} from "../../types/chapter";

interface MangaExportModalProps {
	isOpen: boolean;
	onClose: () => void;
	mangaId: string;
	mangaTitle: string;
	chapters: Chapter[];
	selectedChapterIds: string[];
	defaultLanguage?: string;
}

const formatBytes = (bytes: number, decimals = 1) => {
	if (!bytes || bytes === 0) return "0 B";
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};

const formatSeconds = (sec: number) => {
	if (!sec || Number.isNaN(sec) || sec <= 0) return "00:00";
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export const MangaExportModal: React.FC<MangaExportModalProps> = ({
	isOpen,
	onClose,
	mangaId,
	mangaTitle,
	chapters,
	selectedChapterIds,
	defaultLanguage,
}) => {
	const { showToast } = useAlert();

	// Export Configuration States
	const [format, setFormat] = useState<ExportFormat>("pdf");
	const [grouping, setGrouping] = useState<ExportGrouping>("single_file");
	const [destination, setDestination] = useState<ExportDestination>("browser");
	const [localPath, setLocalPath] = useState("");
	const [defaultBasePath, setDefaultBasePath] = useState("");
	const [autoOpenExplorer, setAutoOpenExplorer] = useState(true);
	const [imageOptimization, setImageOptimization] =
		useState<ImageOptimization>("original");
	const [includeMetadata, setIncludeMetadata] = useState(true);
	const [includeCover, setIncludeCover] = useState(true);

	// Scope filter: "all" | "selected" | "language"
	const [exportScope, setExportScope] = useState<
		"all" | "selected" | "language"
	>(selectedChapterIds.length > 0 ? "selected" : "all");
	const [selectedLanguage, setSelectedLanguage] = useState<string>(
		defaultLanguage || "all",
	);

	// UI accordion / advanced toggle
	const [showAdvanced, setShowAdvanced] = useState(false);

	// Progress Stream State
	const [progress, setProgress] = useState<ChapterExportProgress>({
		status: "idle",
		percent: 0,
		totalChapters: 0,
		currentChapterNumber: "",
		currentChapterTitle: "",
		currentChapterIndex: 0,
		currentPageNumber: 0,
		currentChapterPageCount: 0,
		totalPagesDone: 0,
		totalPagesOverall: 0,
		speedPagesPerSec: 0,
		elapsedSeconds: 0,
		etaSeconds: 0,
		previewBase64: null,
		phaseMessage: "",
		logs: [],
	});

	const abortControllerRef = useRef<AbortController | null>(null);
	const logsEndRef = useRef<HTMLDivElement | null>(null);

	// Fetch default download path once
	useEffect(() => {
		if (!isOpen) return;
		client
			.get("/api/downloads/base-path")
			.then((res) => {
				if (res.data?.base_path) {
					setDefaultBasePath(res.data.base_path);
					if (!localPath) {
						setLocalPath(`${res.data.base_path}\\Exports\\${mangaTitle}`);
					}
				}
			})
			.catch(() => {});
	}, [isOpen, mangaTitle, localPath]);

	// Synchronize export scope when modal opens or selectedChapterIds changes
	useEffect(() => {
		if (isOpen) {
			if (selectedChapterIds.length > 0) {
				setExportScope("selected");
			} else {
				setExportScope("all");
			}
		}
	}, [isOpen, selectedChapterIds]);

	// Auto-scroll logs
	useEffect(() => {
		if (progress.status === "running" && logsEndRef.current) {
			logsEndRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [progress.status]);

	// Filter chapters based on active scope
	const targetChapters = useMemo(() => {
		let list = chapters;
		if (exportScope === "selected" && selectedChapterIds.length > 0) {
			const set = new Set(selectedChapterIds);
			list = list.filter((c) => set.has(c.id));
		} else if (exportScope === "language" && selectedLanguage !== "all") {
			list = list.filter(
				(c) =>
					(c.language || "en").toLowerCase() === selectedLanguage.toLowerCase(),
			);
		}
		return list;
	}, [chapters, exportScope, selectedChapterIds, selectedLanguage]);

	const targetPagesCount = useMemo(() => {
		return targetChapters.reduce((sum, c) => sum + (c.pages?.length || 0), 0);
	}, [targetChapters]);

	const availableLanguages = useMemo(() => {
		const langs = new Set<string>();
		for (const c of chapters) {
			if (c.language) langs.add(c.language.toLowerCase());
		}
		return Array.from(langs);
	}, [chapters]);

	// Format cards definitions
	const formatOptions: Array<{
		id: ExportFormat;
		name: string;
		ext: string;
		icon: React.ReactNode;
		desc: string;
		badge?: string;
	}> = [
		{
			id: "pdf",
			name: "PDF Document",
			ext: ".pdf",
			icon: <FileText size={20} className="text-rose-500" />,
			desc: "Ghép thành tài liệu PDF hoàn chỉnh, dễ đọc trên mọi thiết bị và máy tính.",
			badge: "Phổ biến",
		},
		{
			id: "zip",
			name: "ZIP Archive",
			ext: ".zip",
			icon: <Archive size={20} className="text-amber-500" />,
			desc: "Gói nén tiêu chuẩn chứa các thư mục ảnh trang truyện theo thứ tự.",
		},
		{
			id: "cbz",
			name: "CBZ Comic Book",
			ext: ".cbz",
			icon: <BookOpen size={20} className="text-indigo-500" />,
			desc: "Chuẩn truyện tranh cho Mihon, Tachiyomi, CDisplayEx kèm ComicInfo.xml.",
			badge: "Manga Reader",
		},
		{
			id: "folder",
			name: "Thư mục ảnh (Raw)",
			ext: "Folder",
			icon: <Folder size={20} className="text-emerald-500" />,
			desc: "Lưu trực tiếp vào thư mục trên máy tính không cần đóng gói nén.",
		},
	];

	// Grouping cards definitions
	const groupingOptions: Array<{
		id: ExportGrouping;
		name: string;
		icon: React.ReactNode;
		desc: string;
	}> = [
		{
			id: "single_file",
			name: "1 Tệp duy nhất",
			icon: <Layers size={18} className="text-[var(--brand-orange)]" />,
			desc: "Gộp toàn bộ các chương đã chọn vào 1 file duy nhất.",
		},
		{
			id: "by_volume",
			name: "Tách theo Volume / Tập",
			icon: <BookOpen size={18} className="text-blue-500" />,
			desc: "Mỗi Volume tạo một file riêng (Vol 01, Vol 02...).",
		},
		{
			id: "by_chapter",
			name: "Tách theo từng Chapter",
			icon: <FileText size={18} className="text-purple-500" />,
			desc: "Mỗi chương tạo một file riêng biệt theo số thứ tự.",
		},
	];

	// Handle Start Export
	const handleStartExport = async () => {
		if (targetChapters.length === 0) {
			showToast("Vui lòng chọn ít nhất 1 chương để xuất dữ liệu", "warning");
			return;
		}

		if (format === "folder" && destination === "browser") {
			showToast(
				"Định dạng 'Thư mục ảnh (Raw)' chỉ khả dụng khi Lưu vào Thư mục trên PC",
				"warning",
			);
			return;
		}

		const controller = new AbortController();
		abortControllerRef.current = controller;

		setProgress({
			status: "running",
			percent: 1,
			totalChapters: targetChapters.length,
			currentChapterNumber: "",
			currentChapterTitle: "",
			currentChapterIndex: 0,
			currentPageNumber: 0,
			currentChapterPageCount: 0,
			totalPagesDone: 0,
			totalPagesOverall: targetPagesCount,
			speedPagesPerSec: 0,
			elapsedSeconds: 0,
			etaSeconds: 0,
			previewBase64: null,
			phaseMessage: "Đang khởi tạo gói xuất dữ liệu...",
			logs: [
				{
					id: `log-init-${Date.now()}`,
					time: new Date().toLocaleTimeString(),
					text: `Bắt đầu xuất dữ liệu ${targetChapters.length} chương (${targetPagesCount} trang) định dạng ${format.toUpperCase()}...`,
					type: "info",
				},
			],
		});

		try {
			const payload = {
				chapter_ids:
					exportScope === "all" ? undefined : targetChapters.map((c) => c.id),
				language:
					exportScope === "language" && selectedLanguage !== "all"
						? selectedLanguage
						: undefined,
				format,
				grouping,
				destination,
				local_path:
					destination === "local_folder" ? localPath.trim() : undefined,
				auto_open_explorer:
					destination === "local_folder" ? autoOpenExplorer : false,
				image_optimization: imageOptimization,
				include_metadata: includeMetadata,
				include_cover: includeCover,
			};

			const targetUrl = apiUrl(`/api/manga/${mangaId}/export/stream`);
			const response = await fetch(targetUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				signal: controller.signal,
			});

			if (!response.ok || !response.body) {
				throw new Error(
					`Máy chủ phản hồi mã lỗi HTTP ${response.status}: ${response.statusText}`,
				);
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder("utf-8");
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const chunks = buffer.split("\n\n");
				buffer = chunks.pop() || "";

				for (const chunk of chunks) {
					const trimmed = chunk.trim();
					if (!trimmed.startsWith("data:")) continue;
					const jsonStr = trimmed.replace(/^data:\s*/, "");
					try {
						const ev = JSON.parse(jsonStr);
						const nowTime = new Date().toLocaleTimeString();

						if (ev.type === "init") {
							setProgress((prev) => ({
								...prev,
								totalChapters: ev.total_chapters,
								totalPagesOverall: ev.total_pages,
								phaseMessage: `Đang chuẩn bị ${ev.total_chapters} chương (${ev.total_pages} trang)...`,
							}));
						} else if (ev.type === "chapter_start") {
							setProgress((prev) => {
								const newLog: ExportLogItem = {
									id: `chap-${ev.chapter_number}-${Date.now()}`,
									time: nowTime,
									text: `Xử lý Chapter ${ev.chapter_number}${ev.title ? ` - ${ev.title}` : ""} (${ev.page_count} trang)...`,
									type: "info",
								};
								return {
									...prev,
									currentChapterNumber: ev.chapter_number,
									currentChapterTitle: ev.title || "",
									currentChapterIndex: ev.chapter_index,
									currentChapterPageCount: ev.page_count,
									phaseMessage: `Đang tải Chapter ${ev.chapter_number} (${ev.chapter_index}/${ev.total_chapters})...`,
									logs: [...prev.logs, newLog].slice(-200),
								};
							});
						} else if (ev.type === "page_progress") {
							setProgress((prev) => ({
								...prev,
								currentPageNumber: ev.page_number,
								totalPagesDone: ev.total_pages_done,
								percent: ev.percent,
								speedPagesPerSec: ev.speed_pages_per_sec,
								elapsedSeconds: ev.elapsed_seconds,
								etaSeconds: ev.eta_seconds,
								previewBase64: ev.preview_base64 || prev.previewBase64,
								phaseMessage: `Đang xử lý trang ${ev.total_pages_done}/${ev.total_pages_overall}...`,
							}));
						} else if (ev.type === "packaging_start") {
							setProgress((prev) => {
								const newLog: ExportLogItem = {
									id: `pack-${Date.now()}`,
									time: nowTime,
									text: ev.message || "Đang đóng gói tệp tin...",
									type: "info",
								};
								return {
									...prev,
									percent: ev.percent || 90,
									phaseMessage: ev.message || "Đang hoàn tất đóng gói...",
									logs: [...prev.logs, newLog].slice(-200),
								};
							});
						} else if (ev.type === "completed") {
							const downloadUrl = ev.download_url
								? apiUrl(ev.download_url)
								: null;
							setProgress((prev) => {
								const newLog: ExportLogItem = {
									id: `done-${Date.now()}`,
									time: nowTime,
									text: `Hoàn tất xuất dữ liệu thành công! Dung lượng: ${formatBytes(ev.total_size_bytes)}`,
									type: "success",
								};
								return {
									...prev,
									status: "completed",
									percent: 100,
									downloadUrl,
									destinationPath: ev.destination_path,
									fileName: ev.file_name,
									totalSizeBytes: ev.total_size_bytes,
									isLocal: ev.is_local,
									phaseMessage: "Xuất dữ liệu thành công!",
									logs: [...prev.logs, newLog].slice(-200),
								};
							});

							// Trigger native browser download if browser destination
							if (downloadUrl) {
								const link = document.createElement("a");
								link.href = downloadUrl;
								link.download = ev.file_name || "Manga_Export";
								document.body.appendChild(link);
								link.click();
								document.body.removeChild(link);
							}
						} else if (ev.type === "error") {
							setProgress((prev) => ({
								...prev,
								status: "error",
								error: ev.error || "Có lỗi xảy ra khi xuất dữ liệu",
								phaseMessage: "Đã xảy ra lỗi khi xuất dữ liệu",
								logs: [
									...prev.logs,
									{
										id: `err-${Date.now()}`,
										time: nowTime,
										text: `LỖI: ${ev.error}`,
										type: "error",
									},
								],
							}));
						}
					} catch (parseErr) {
						console.error("Error parsing SSE event:", parseErr);
					}
				}
			}
		} catch (err: unknown) {
			if (err instanceof Error && err.name === "AbortError") {
				setProgress((prev) => ({
					...prev,
					status: "idle",
					phaseMessage: "Tiến trình đã bị hủy",
				}));
				return;
			}
			const message =
				err instanceof Error ? err.message : "Có lỗi không xác định xảy ra";
			setProgress((prev) => ({
				...prev,
				status: "error",
				error: message,
				phaseMessage: "Lỗi xuất dữ liệu",
				logs: [
					...prev.logs,
					{
						id: `err-${Date.now()}`,
						time: new Date().toLocaleTimeString(),
						text: `Lỗi: ${message}`,
						type: "error",
					},
				],
			}));
		} finally {
			abortControllerRef.current = null;
		}
	};

	// Handle Cancel
	const handleCancel = () => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
		setProgress((prev) => ({
			...prev,
			status: "idle",
			phaseMessage: "Đã hủy tiến trình",
		}));
	};

	// Handle Open in Windows Explorer
	const handleOpenExplorer = async (path?: string | null) => {
		const target = path || progress.destinationPath || localPath;
		if (!target) return;
		try {
			const res = await client.post(
				`/api/manga/${mangaId}/export/open-folder`,
				{ path: target },
			);
			if (res.data?.success) {
				showToast("Đã mở Windows Explorer", "info");
			}
		} catch (e: unknown) {
			const err = e as { response?: { data?: { detail?: string } } };
			showToast(
				err.response?.data?.detail || "Không thể mở Windows Explorer",
				"error",
			);
		}
	};

	// Reset state and close modal
	const handleClose = () => {
		if (progress.status === "running") {
			if (
				!confirm("Tiến trình đang chạy. Bạn có chắc chắn muốn hủy và đóng?")
			) {
				return;
			}
			handleCancel();
		}
		setProgress({
			status: "idle",
			percent: 0,
			totalChapters: 0,
			currentChapterNumber: "",
			currentChapterTitle: "",
			currentChapterIndex: 0,
			currentPageNumber: 0,
			currentChapterPageCount: 0,
			totalPagesDone: 0,
			totalPagesOverall: 0,
			speedPagesPerSec: 0,
			elapsedSeconds: 0,
			etaSeconds: 0,
			previewBase64: null,
			phaseMessage: "",
			logs: [],
		});
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
			<div className="relative w-full max-w-3xl bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-[var(--text-primary)]">
				{/* Top Header */}
				<div className="px-6 py-5 border-b border-[var(--border-primary)] flex items-center justify-between bg-zinc-500/5">
					<div className="flex items-center space-x-3">
						<div className="p-2.5 rounded-2xl bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] border border-[var(--brand-orange)]/20 shadow-xs">
							<Download size={22} />
						</div>
						<div>
							<h3 className="text-lg font-black tracking-tight text-[var(--text-primary)] flex items-center space-x-2">
								<span>Xuất dữ liệu Manga (Export)</span>
								<span className="text-xs px-2 py-0.5 rounded-full bg-[var(--brand-orange)]/15 text-[var(--brand-orange)] font-bold">
									PRO
								</span>
							</h3>
							<p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate max-w-md">
								Bộ truyện: <span className="font-bold">{mangaTitle}</span> •{" "}
								{targetChapters.length} chương ({targetPagesCount} trang)
							</p>
						</div>
					</div>

					<button
						type="button"
						onClick={handleClose}
						className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-500/10 transition cursor-pointer"
					>
						<X size={18} />
					</button>
				</div>

				{/* Modal Body */}
				<div className="p-6 overflow-y-auto space-y-6 flex-1">
					{/* ================= STATE 1: IDLE / CONFIGURATION ================= */}
					{progress.status === "idle" && (
						<div className="space-y-6">
							{/* Scope Selection */}
							<div className="space-y-2">
								<span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
									1. Phạm vi chương cần xuất
								</span>
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
									<button
										type="button"
										onClick={() => setExportScope("all")}
										className={`p-3 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
											exportScope === "all"
												? "border-[var(--brand-orange)] bg-[var(--brand-orange)]/10 text-[var(--text-primary)] font-bold shadow-xs"
												: "border-[var(--border-primary)] hover:border-zinc-400 text-[var(--text-secondary)]"
										}`}
									>
										<div>
											<p className="text-xs font-bold">Tất cả chương</p>
											<p className="text-[11px] opacity-75 mt-0.5">
												{chapters.length} chương có sẵn
											</p>
										</div>
										{exportScope === "all" && (
											<CheckCircle2
												size={16}
												className="text-[var(--brand-orange)] shrink-0"
											/>
										)}
									</button>

									<button
										type="button"
										onClick={() => setExportScope("selected")}
										disabled={selectedChapterIds.length === 0}
										className={`p-3 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
											selectedChapterIds.length === 0
												? "opacity-40 cursor-not-allowed border-[var(--border-primary)]"
												: exportScope === "selected"
													? "border-[var(--brand-orange)] bg-[var(--brand-orange)]/10 text-[var(--text-primary)] font-bold shadow-xs"
													: "border-[var(--border-primary)] hover:border-zinc-400 text-[var(--text-secondary)]"
										}`}
									>
										<div>
											<p className="text-xs font-bold">Chương đang chọn</p>
											<p className="text-[11px] opacity-75 mt-0.5">
												{selectedChapterIds.length} chương đã tích
											</p>
										</div>
										{exportScope === "selected" && (
											<CheckCircle2
												size={16}
												className="text-[var(--brand-orange)] shrink-0"
											/>
										)}
									</button>

									<button
										type="button"
										onClick={() => setExportScope("language")}
										className={`p-3 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
											exportScope === "language"
												? "border-[var(--brand-orange)] bg-[var(--brand-orange)]/10 text-[var(--text-primary)] font-bold shadow-xs"
												: "border-[var(--border-primary)] hover:border-zinc-400 text-[var(--text-secondary)]"
										}`}
									>
										<div>
											<p className="text-xs font-bold">Lọc theo ngôn ngữ</p>
											<p className="text-[11px] opacity-75 mt-0.5">
												{selectedLanguage === "all"
													? "Tất cả ngôn ngữ"
													: selectedLanguage.toUpperCase()}
											</p>
										</div>
										{exportScope === "language" && (
											<CheckCircle2
												size={16}
												className="text-[var(--brand-orange)] shrink-0"
											/>
										)}
									</button>
								</div>

								{exportScope === "language" &&
									availableLanguages.length > 0 && (
										<div className="flex items-center gap-2 pt-1.5 flex-wrap">
											<button
												type="button"
												onClick={() => setSelectedLanguage("all")}
												className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
													selectedLanguage === "all"
														? "bg-[var(--brand-orange)] text-white"
														: "bg-zinc-500/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
												}`}
											>
												Tất cả ({chapters.length})
											</button>
											{availableLanguages.map((lang) => {
												const count = chapters.filter(
													(c) => (c.language || "en").toLowerCase() === lang,
												).length;
												return (
													<button
														key={lang}
														type="button"
														onClick={() => setSelectedLanguage(lang)}
														className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
															selectedLanguage === lang
																? "bg-blue-600 text-white"
																: "bg-zinc-500/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
														}`}
													>
														{lang === "vi"
															? "Tiếng Việt"
															: lang === "en"
																? "English"
																: lang.toUpperCase()}{" "}
														({count})
													</button>
												);
											})}
										</div>
									)}
							</div>

							{/* Format Selection */}
							<div className="space-y-2">
								<span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
									2. Định dạng xuất (Format)
								</span>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									{formatOptions.map((opt) => {
										const isSelected = format === opt.id;
										return (
											<button
												key={opt.id}
												type="button"
												onClick={() => {
													setFormat(opt.id);
													if (opt.id === "folder") {
														setDestination("local_folder");
													}
												}}
												className={`p-3.5 rounded-2xl border text-left transition flex items-start space-x-3 cursor-pointer ${
													isSelected
														? "border-[var(--brand-orange)] bg-[var(--brand-orange)]/10 ring-1 ring-[var(--brand-orange)]/30"
														: "border-[var(--border-primary)] hover:border-zinc-400 bg-[var(--bg-primary)]"
												}`}
											>
												<div className="p-2 rounded-xl bg-zinc-500/10 shrink-0 mt-0.5">
													{opt.icon}
												</div>
												<div className="flex-1 min-w-0">
													<div className="flex items-center space-x-2">
														<span className="text-xs font-bold text-[var(--text-primary)]">
															{opt.name}
														</span>
														<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-500/20 text-[var(--text-secondary)] font-mono">
															{opt.ext}
														</span>
														{opt.badge && (
															<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold ml-auto">
																{opt.badge}
															</span>
														)}
													</div>
													<p className="text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">
														{opt.desc}
													</p>
												</div>
											</button>
										);
									})}
								</div>
							</div>

							{/* Grouping Selection (Disabled if raw folder) */}
							<div className="space-y-2">
								<span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
									3. Cấu trúc ghép nối & Phân nhóm (Grouping)
								</span>
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
									{groupingOptions.map((opt) => {
										const isSelected = grouping === opt.id;
										return (
											<button
												key={opt.id}
												type="button"
												onClick={() => setGrouping(opt.id)}
												className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${
													isSelected
														? "border-[var(--brand-orange)] bg-[var(--brand-orange)]/10 ring-1 ring-[var(--brand-orange)]/30"
														: "border-[var(--border-primary)] hover:border-zinc-400 bg-[var(--bg-primary)]"
												}`}
											>
												<div className="flex items-center space-x-2 mb-1.5">
													{opt.icon}
													<span className="text-xs font-bold text-[var(--text-primary)]">
														{opt.name}
													</span>
												</div>
												<p className="text-[11px] text-[var(--text-secondary)] leading-tight">
													{opt.desc}
												</p>
											</button>
										);
									})}
								</div>
							</div>

							{/* Destination Method */}
							<div className="space-y-2">
								<span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
									4. Phương thức nhận tệp (Destination)
								</span>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									<button
										type="button"
										onClick={() => {
											if (format !== "folder") {
												setDestination("browser");
											}
										}}
										disabled={format === "folder"}
										className={`p-3.5 rounded-2xl border text-left transition flex items-start space-x-3 cursor-pointer ${
											format === "folder"
												? "opacity-40 cursor-not-allowed border-[var(--border-primary)]"
												: destination === "browser"
													? "border-[var(--brand-orange)] bg-[var(--brand-orange)]/10 ring-1 ring-[var(--brand-orange)]/30"
													: "border-[var(--border-primary)] hover:border-zinc-400 bg-[var(--bg-primary)]"
										}`}
									>
										<div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 shrink-0">
											<Download size={20} />
										</div>
										<div>
											<p className="text-xs font-bold text-[var(--text-primary)]">
												Tải về qua Trình duyệt
											</p>
											<p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
												Tải trực tiếp qua hộp thoại download mặc định của trình
												duyệt.
											</p>
										</div>
									</button>

									<button
										type="button"
										onClick={() => setDestination("local_folder")}
										className={`p-3.5 rounded-2xl border text-left transition flex items-start space-x-3 cursor-pointer ${
											destination === "local_folder"
												? "border-[var(--brand-orange)] bg-[var(--brand-orange)]/10 ring-1 ring-[var(--brand-orange)]/30"
												: "border-[var(--border-primary)] hover:border-zinc-400 bg-[var(--bg-primary)]"
										}`}
									>
										<div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
											<HardDrive size={20} />
										</div>
										<div>
											<p className="text-xs font-bold text-[var(--text-primary)]">
												Lưu vào Thư mục trên PC
											</p>
											<p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
												Lưu thẳng vào ổ đĩa trên máy tính và mở trong Windows
												Explorer.
											</p>
										</div>
									</button>
								</div>

								{/* Local Path Configuration */}
								{destination === "local_folder" && (
									<div className="p-4 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] space-y-3 mt-2 animate-in fade-in">
										<div>
											<div className="text-xs font-bold text-[var(--text-primary)] flex items-center justify-between">
												<span>Đường dẫn thư mục lưu trên máy:</span>
												{defaultBasePath && (
													<button
														type="button"
														onClick={() =>
															setLocalPath(
																`${defaultBasePath}\\Exports\\${mangaTitle}`,
															)
														}
														className="text-[11px] text-[var(--brand-orange)] hover:underline cursor-pointer"
													>
														Dùng thư mục mặc định
													</button>
												)}
											</div>
											<div className="relative mt-1.5">
												<Folder
													size={15}
													className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
												/>
												<input
													type="text"
													value={localPath}
													onChange={(e) => setLocalPath(e.target.value)}
													placeholder="Ví dụ: D:\Manga\Exports\OnePiece"
													className="w-full pl-9 pr-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-orange)] transition"
												/>
											</div>
										</div>

										<label className="flex items-center space-x-2.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
											<input
												type="checkbox"
												checked={autoOpenExplorer}
												onChange={(e) => setAutoOpenExplorer(e.target.checked)}
												className="rounded text-[var(--brand-orange)] focus:ring-[var(--brand-orange)]"
											/>
											<span className="font-semibold text-[var(--text-primary)]">
												Tự động mở Windows Explorer khi hoàn tất
											</span>
										</label>
									</div>
								)}
							</div>

							{/* Advanced Options Accordion */}
							<div className="border-t border-[var(--border-primary)] pt-3">
								<button
									type="button"
									onClick={() => setShowAdvanced(!showAdvanced)}
									className="flex items-center justify-between w-full text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer py-1"
								>
									<span className="flex items-center space-x-1.5">
										<SlidersHorizontal size={14} />
										<span>Tùy chọn nâng cao & Tối ưu hóa</span>
									</span>
									{showAdvanced ? (
										<ChevronUp size={16} />
									) : (
										<ChevronDown size={16} />
									)}
								</button>

								{showAdvanced && (
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 animate-in fade-in">
										{/* Optimization */}
										<div className="p-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] space-y-1.5">
											<div className="text-xs font-bold text-[var(--text-primary)]">
												Chất lượng ảnh:
											</div>
											<div className="flex items-center gap-2">
												<button
													type="button"
													onClick={() => setImageOptimization("original")}
													className={`px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
														imageOptimization === "original"
															? "bg-[var(--brand-orange)] text-white font-bold"
															: "bg-zinc-500/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
													}`}
												>
													Gốc (100% Không nén)
												</button>
												<button
													type="button"
													onClick={() => setImageOptimization("compressed")}
													className={`px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
														imageOptimization === "compressed"
															? "bg-[var(--brand-orange)] text-white font-bold"
															: "bg-zinc-500/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
													}`}
												>
													Tối ưu nhẹ (JPEG 85%)
												</button>
											</div>
										</div>

										{/* Checkboxes */}
										<div className="p-3 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] space-y-2.5">
											<label className="flex items-center space-x-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
												<input
													type="checkbox"
													checked={includeMetadata}
													onChange={(e) => setIncludeMetadata(e.target.checked)}
													className="rounded text-[var(--brand-orange)] focus:ring-[var(--brand-orange)]"
												/>
												<span className="font-semibold text-[var(--text-primary)]">
													Đính kèm ComicInfo.xml metadata
												</span>
											</label>

											<label className="flex items-center space-x-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
												<input
													type="checkbox"
													checked={includeCover}
													onChange={(e) => setIncludeCover(e.target.checked)}
													className="rounded text-[var(--brand-orange)] focus:ring-[var(--brand-orange)]"
												/>
												<span className="font-semibold text-[var(--text-primary)]">
													Chèn ảnh bìa làm trang đầu tiên
												</span>
											</label>
										</div>
									</div>
								)}
							</div>
						</div>
					)}

					{/* ================= STATE 2: RUNNING PROGRESS ================= */}
					{progress.status === "running" && (
						<div className="space-y-6 animate-in fade-in">
							{/* Large Progress Indicator */}
							<div className="p-5 rounded-3xl bg-[var(--bg-primary)] border border-[var(--border-primary)] shadow-sm space-y-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center space-x-2.5">
										<Loader2
											size={20}
											className="animate-spin text-[var(--brand-orange)]"
										/>
										<span className="text-sm font-black text-[var(--text-primary)]">
											{progress.phaseMessage}
										</span>
									</div>
									<span className="text-xl font-black font-mono text-[var(--brand-orange)]">
										{Math.round(progress.percent)}%
									</span>
								</div>

								{/* Progress Track */}
								<div className="w-full h-3.5 bg-zinc-500/15 rounded-full overflow-hidden p-0.5 relative">
									<div
										className="h-full bg-gradient-to-r from-[var(--brand-orange)] to-rose-500 rounded-full transition-all duration-300 ease-out shadow-xs"
										style={{ width: `${Math.max(2, progress.percent)}%` }}
									/>
								</div>

								{/* Metrics Bar */}
								<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-center">
									<div className="p-2.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
										<p className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">
											Chương hiện tại
										</p>
										<p className="text-xs font-black text-[var(--text-primary)] mt-0.5 truncate">
											Ch. {progress.currentChapterNumber || "..."} (
											{progress.currentChapterIndex}/{progress.totalChapters})
										</p>
									</div>

									<div className="p-2.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
										<p className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">
											Trang đã xử lý
										</p>
										<p className="text-xs font-black text-[var(--text-primary)] mt-0.5">
											{progress.totalPagesDone} / {progress.totalPagesOverall}
										</p>
									</div>

									<div className="p-2.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
										<p className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">
											Tốc độ
										</p>
										<p className="text-xs font-black text-emerald-500 mt-0.5">
											{progress.speedPagesPerSec} trang/giây
										</p>
									</div>

									<div className="p-2.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)]">
										<p className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">
											Ước tính còn lại
										</p>
										<p className="text-xs font-black text-amber-500 mt-0.5">
											~{formatSeconds(progress.etaSeconds)}
										</p>
									</div>
								</div>
							</div>

							{/* Live Thumbnail Preview & Log Split */}
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
								{/* Thumbnail Box */}
								{progress.previewBase64 ? (
									<div className="p-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] flex flex-col items-center justify-center text-center">
										<p className="text-[10px] font-bold text-[var(--text-secondary)] mb-2 uppercase">
											Trang đang xử lý
										</p>
										<div className="relative rounded-xl overflow-hidden border border-zinc-500/20 shadow-md">
											<img
												src={progress.previewBase64}
												alt="Current page preview"
												className="w-24 h-32 object-cover"
											/>
										</div>
										<p className="text-[11px] font-semibold text-[var(--text-primary)] mt-2">
											Trang {progress.currentPageNumber} /{" "}
											{progress.currentChapterPageCount}
										</p>
									</div>
								) : (
									<div className="p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] flex flex-col items-center justify-center text-center text-zinc-400">
										<Loader2 size={24} className="animate-spin mb-2" />
										<p className="text-xs">Đang lấy dữ liệu ảnh...</p>
									</div>
								)}

								{/* Event Logs Console */}
								<div className="sm:col-span-2 rounded-2xl bg-zinc-950 p-3 border border-zinc-800 text-zinc-300 font-mono text-[11px] flex flex-col h-44 shadow-inner">
									<div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800 text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
										<span className="flex items-center space-x-1.5">
											<Terminal size={12} />
											<span>Nhật ký thời gian thực</span>
										</span>
										<span>{progress.logs.length} sự kiện</span>
									</div>
									<div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
										{progress.logs.map((log) => (
											<div
												key={log.id}
												className="flex items-start space-x-2 leading-relaxed"
											>
												<span className="text-zinc-500 shrink-0 select-none">
													[{log.time}]
												</span>
												<span
													className={
														log.type === "error"
															? "text-rose-400 font-bold"
															: log.type === "success"
																? "text-emerald-400 font-bold"
																: log.type === "warn"
																	? "text-amber-400"
																	: "text-zinc-300"
													}
												>
													{log.text}
												</span>
											</div>
										))}
										<div ref={logsEndRef} />
									</div>
								</div>
							</div>
						</div>
					)}

					{/* ================= STATE 3: COMPLETED ================= */}
					{progress.status === "completed" && (
						<div className="p-8 text-center space-y-6 animate-in zoom-in-95 duration-200">
							<div className="w-16 h-16 rounded-3xl bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
								<CheckCircle2 size={36} />
							</div>

							<div>
								<h4 className="text-xl font-black text-[var(--text-primary)]">
									Xuất dữ liệu thành công!
								</h4>
								<p className="text-xs text-[var(--text-secondary)] mt-1">
									Đã xử lý và đóng gói toàn bộ {progress.totalChapters} chương (
									{progress.totalPagesDone} trang).
								</p>
							</div>

							{/* Summary Card */}
							<div className="max-w-md mx-auto p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] text-left space-y-2 text-xs">
								<div className="flex justify-between py-1 border-b border-[var(--border-primary)]">
									<span className="text-[var(--text-secondary)]">
										Định dạng:
									</span>
									<span className="font-bold text-[var(--brand-orange)] uppercase">
										{format.toUpperCase()} ({grouping})
									</span>
								</div>
								<div className="flex justify-between py-1 border-b border-[var(--border-primary)]">
									<span className="text-[var(--text-secondary)]">
										Dung lượng tệp:
									</span>
									<span className="font-bold font-mono">
										{formatBytes(progress.totalSizeBytes || 0)}
									</span>
								</div>
								<div className="flex justify-between py-1 border-b border-[var(--border-primary)]">
									<span className="text-[var(--text-secondary)]">
										Tên tệp xuất:
									</span>
									<span className="font-bold font-mono truncate max-w-[240px]">
										{progress.fileName || mangaTitle}
									</span>
								</div>
								{progress.destinationPath && (
									<div className="pt-1">
										<span className="text-[var(--text-secondary)] block mb-1">
											Vị trí lưu trên máy:
										</span>
										<span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 break-all bg-zinc-500/10 p-2 rounded-xl block">
											{progress.destinationPath}
										</span>
									</div>
								)}
							</div>

							{/* Actions */}
							<div className="flex items-center justify-center flex-wrap gap-3 pt-2">
								{progress.downloadUrl && (
									<a
										href={progress.downloadUrl}
										download={progress.fileName || "Manga_Export"}
										className="px-5 py-2.5 rounded-xl bg-[var(--brand-orange)] hover:opacity-90 text-white text-xs font-bold flex items-center space-x-2 transition shadow-md shadow-[var(--brand-orange)]/20 cursor-pointer"
									>
										<Download size={16} />
										<span>Tải tệp xuống lại</span>
									</a>
								)}

								{(progress.destinationPath ||
									destination === "local_folder") && (
									<button
										type="button"
										onClick={() => handleOpenExplorer()}
										className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center space-x-2 transition shadow-md shadow-blue-500/20 cursor-pointer"
									>
										<FolderOpen size={16} />
										<span>Mở trong Windows Explorer</span>
									</button>
								)}

								<button
									type="button"
									onClick={handleClose}
									className="px-5 py-2.5 rounded-xl border border-[var(--border-primary)] hover:border-zinc-400 bg-[var(--bg-card)] text-xs font-bold transition cursor-pointer"
								>
									Đóng
								</button>
							</div>
						</div>
					)}

					{/* ================= STATE 4: ERROR ================= */}
					{progress.status === "error" && (
						<div className="p-8 text-center space-y-5 animate-in zoom-in-95 duration-200">
							<div className="w-16 h-16 rounded-3xl bg-rose-500/15 text-rose-500 border border-rose-500/30 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
								<AlertTriangle size={36} />
							</div>

							<div>
								<h4 className="text-xl font-black text-[var(--text-primary)]">
									Xuất dữ liệu thất bại
								</h4>
								<p className="text-xs text-rose-500 mt-1 max-w-md mx-auto">
									{progress.error ||
										"Có lỗi xảy ra trong quá trình xử lý tệp tin"}
								</p>
							</div>

							<div className="flex items-center justify-center gap-3 pt-3">
								<button
									type="button"
									onClick={() =>
										setProgress((prev) => ({ ...prev, status: "idle" }))
									}
									className="px-5 py-2.5 rounded-xl bg-[var(--brand-orange)] hover:opacity-90 text-white text-xs font-bold flex items-center space-x-2 transition cursor-pointer"
								>
									<RefreshCw size={15} />
									<span>Thử lại</span>
								</button>
								<button
									type="button"
									onClick={handleClose}
									className="px-5 py-2.5 rounded-xl border border-[var(--border-primary)] hover:border-zinc-400 bg-[var(--bg-card)] text-xs font-bold transition cursor-pointer"
								>
									Đóng
								</button>
							</div>
						</div>
					)}
				</div>

				{/* Modal Footer (Idle & Running) */}
				{progress.status === "idle" && (
					<div className="px-6 py-4 border-t border-[var(--border-primary)] bg-zinc-500/5 flex items-center justify-between">
						<div className="text-xs text-[var(--text-secondary)]">
							Đã chọn:{" "}
							<span className="font-bold text-[var(--brand-orange)]">
								{targetChapters.length} chương
							</span>{" "}
							({targetPagesCount} trang)
						</div>

						<div className="flex items-center space-x-2.5">
							<button
								type="button"
								onClick={handleClose}
								className="px-4 py-2 rounded-xl border border-[var(--border-primary)] hover:border-zinc-400 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
							>
								Hủy
							</button>

							<button
								type="button"
								onClick={handleStartExport}
								className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--brand-orange)] to-rose-500 hover:opacity-90 text-white text-xs font-black flex items-center space-x-2 shadow-md shadow-[var(--brand-orange)]/25 transition cursor-pointer"
							>
								<Download size={15} />
								<span>Bắt đầu xuất dữ liệu</span>
							</button>
						</div>
					</div>
				)}

				{progress.status === "running" && (
					<div className="px-6 py-4 border-t border-[var(--border-primary)] bg-zinc-500/5 flex items-center justify-between">
						<span className="text-xs text-[var(--text-secondary)] animate-pulse">
							Vui lòng không đóng trình duyệt khi tiến trình đang diễn ra...
						</span>

						<button
							type="button"
							onClick={handleCancel}
							className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition cursor-pointer"
						>
							Hủy tiến trình
						</button>
					</div>
				)}
			</div>
		</div>
	);
};
