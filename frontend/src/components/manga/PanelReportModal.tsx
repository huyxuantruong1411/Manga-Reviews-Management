import {
	Download,
	ExternalLink,
	FileCode,
	FileSpreadsheet,
	FileText,
	Image as ImageIcon,
	Layers,
	Sparkles,
	X,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { apiUrl } from "../../api/client";
import type { Chapter } from "../../types/chapter";

interface PanelReportModalProps {
	mangaId: string;
	mangaTitle?: string;
	chapters: Chapter[];
	selectedChapterId: string;
	filterScanMode: string;
	isOpen: boolean;
	onClose: () => void;
}

export const PanelReportModal: React.FC<PanelReportModalProps> = ({
	mangaId,
	mangaTitle,
	chapters,
	selectedChapterId,
	filterScanMode,
	isOpen,
	onClose,
}) => {
	// Selected chapter scope: "selected" | "all"
	const [scope, setScope] = useState<"selected" | "all">(
		selectedChapterId !== "all" ? "selected" : "all",
	);
	const [activeChapterId, setActiveChapterId] = useState<string>(
		selectedChapterId !== "all" ? selectedChapterId : chapters[0]?.id || "all",
	);

	// Format selection: "html" | "json"
	const [format, setFormat] = useState<"html" | "json">("html");

	// Options
	const [includeImages, setIncludeImages] = useState(true);
	const [limit, setLimit] = useState(100);

	if (!isOpen) return null;

	const targetChapId = scope === "selected" ? activeChapterId : undefined;

	// Build export URLs
	const getExportUrl = (download = false) => {
		const params = new URLSearchParams();
		if (targetChapId && targetChapId !== "all") {
			params.set("chapter_id", targetChapId);
		}
		if (filterScanMode && filterScanMode !== "all") {
			params.set("scan_mode", filterScanMode);
		}
		params.set("format", format);
		params.set("include_images", includeImages ? "true" : "false");
		params.set("limit", limit.toString());
		if (download) {
			params.set("download", "true");
		}
		return apiUrl(`/api/manga/${mangaId}/panels/report?${params.toString()}`);
	};

	const handleOpenInNewTab = () => {
		const url = getExportUrl(false);
		window.open(url, "_blank");
	};

	const handleDownload = () => {
		const url = getExportUrl(true);
		const a = document.createElement("a");
		a.href = url;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
			<button
				type="button"
				aria-label="Đóng cửa sổ"
				className="fixed inset-0 bg-black/85 backdrop-blur-md cursor-default border-none"
				onClick={onClose}
			/>

			<div
				role="dialog"
				aria-modal="true"
				aria-label="Xuất báo cáo trích xuất khung tranh"
				className="relative z-10 w-full max-w-2xl bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left flex flex-col"
			>
				{/* Header */}
				<header className="px-6 py-4 border-b border-white/10 bg-zinc-900/90 flex items-center justify-between shrink-0">
					<div className="flex items-center gap-3">
						<div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
							<Sparkles size={20} />
						</div>
						<div>
							<h2 className="text-base sm:text-lg font-black text-white">
								Xuất Báo Cáo Trích Xuất &amp; AI Audit
							</h2>
							<p className="text-xs text-zinc-400 mt-0.5">
								Bộ truyện:{" "}
								<span className="text-amber-400 font-bold">
									{mangaTitle || "Manga"}
								</span>
							</p>
						</div>
					</div>

					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
					>
						<X size={18} />
					</button>
				</header>

				{/* Body Form */}
				<div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
					{/* 1. Scope Selection */}
					<div className="space-y-3">
						<div className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
							1. Phạm Vi Dữ Liệu Khung Tranh (Scope)
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<button
								type="button"
								onClick={() => setScope("all")}
								className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
									scope === "all"
										? "bg-amber-500/10 border-amber-500 text-white"
										: "bg-zinc-900/60 border-white/10 text-zinc-400 hover:text-zinc-200"
								}`}
							>
								<div
									className={`p-2 rounded-xl mt-0.5 ${
										scope === "all"
											? "bg-amber-500 text-zinc-950 font-bold"
											: "bg-zinc-800 text-zinc-400"
									}`}
								>
									<Layers size={16} />
								</div>
								<div>
									<div className="text-sm font-bold text-white">
										Tất cả các chương
									</div>
									<div className="text-xs text-zinc-400 mt-0.5">
										Toàn bộ khung tranh đã quét trong manga
									</div>
								</div>
							</button>

							<button
								type="button"
								onClick={() => setScope("selected")}
								className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
									scope === "selected"
										? "bg-amber-500/10 border-amber-500 text-white"
										: "bg-zinc-900/60 border-white/10 text-zinc-400 hover:text-zinc-200"
								}`}
							>
								<div
									className={`p-2 rounded-xl mt-0.5 ${
										scope === "selected"
											? "bg-amber-500 text-zinc-950 font-bold"
											: "bg-zinc-800 text-zinc-400"
									}`}
								>
									<FileText size={16} />
								</div>
								<div>
									<div className="text-sm font-bold text-white">
										Chương cụ thể
									</div>
									<div className="text-xs text-zinc-400 mt-0.5">
										Chỉ trích xuất các khung trong 1 chương
									</div>
								</div>
							</button>
						</div>

						{/* Chapter Dropdown if specific selected */}
						{scope === "selected" && (
							<div className="pt-2 animate-in fade-in duration-150">
								<select
									value={activeChapterId}
									onChange={(e) => setActiveChapterId(e.target.value)}
									className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-500"
								>
									{chapters.map((c) => (
										<option key={c.id} value={c.id}>
											Chương {c.chapter_number}
											{c.title ? ` - ${c.title}` : ""} (Trang{" "}
											{c.page_count ?? c.pages?.length ?? "?"})
										</option>
									))}
								</select>
							</div>
						)}
					</div>

					{/* 2. Format Selection */}
					<div className="space-y-3">
						<div className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
							2. Định Dạng Báo Cáo (Output Format)
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<button
								type="button"
								onClick={() => setFormat("html")}
								className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between gap-3 cursor-pointer ${
									format === "html"
										? "bg-emerald-500/10 border-emerald-500 text-white"
										: "bg-zinc-900/60 border-white/10 text-zinc-400 hover:text-zinc-200"
								}`}
							>
								<div className="flex items-center justify-between w-full">
									<div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
										<FileSpreadsheet size={18} />
									</div>
									{format === "html" && (
										<span className="px-2 py-0.5 rounded-full bg-emerald-500 text-zinc-950 font-black text-[10px]">
											Khuyên dùng
										</span>
									)}
								</div>

								<div>
									<div className="text-sm font-bold text-white">
										HTML Báo Cáo Độc Lập
									</div>
									<div className="text-xs text-zinc-400 mt-1 leading-relaxed">
										Kèm ảnh Base64, bảng biểu, in PDF trực tiếp &amp; nhúng mã
										JSON cho AI.
									</div>
								</div>
							</button>

							<button
								type="button"
								onClick={() => setFormat("json")}
								className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between gap-3 cursor-pointer ${
									format === "json"
										? "bg-amber-500/10 border-amber-500 text-white"
										: "bg-zinc-900/60 border-white/10 text-zinc-400 hover:text-zinc-200"
								}`}
							>
								<div className="flex items-center justify-between w-full">
									<div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
										<FileCode size={18} />
									</div>
									{format === "json" && (
										<span className="px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 font-black text-[10px]">
											AI Feed
										</span>
									)}
								</div>

								<div>
									<div className="text-sm font-bold text-white">
										JSON Dữ Liệu Cấu Trúc
									</div>
									<div className="text-xs text-zinc-400 mt-1 leading-relaxed">
										Dành cho máy học, phân tích tự động bằng API hoặc nạp Prompt
										LLM.
									</div>
								</div>
							</button>
						</div>
					</div>

					{/* 3. Advanced Configuration */}
					<div className="p-4 rounded-2xl bg-zinc-900/50 border border-white/10 space-y-4">
						<div className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
							3. Tùy Chọn Nâng Cao
						</div>

						<div className="flex items-center justify-between gap-4">
							<div className="flex items-center gap-2.5">
								<ImageIcon size={16} className="text-amber-400 shrink-0" />
								<div>
									<div className="text-xs font-bold text-white">
										Nhúng ảnh Base64 trực tiếp vào file
									</div>
									<div className="text-[11px] text-zinc-400">
										File độc lập, mở offline không cần kết nối mạng hoặc server
									</div>
								</div>
							</div>

							<label className="relative inline-flex items-center cursor-pointer">
								<input
									type="checkbox"
									checked={includeImages}
									onChange={(e) => setIncludeImages(e.target.checked)}
									className="sr-only peer"
								/>
								<div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500" />
							</label>
						</div>

						<div className="flex items-center justify-between gap-4 pt-3 border-t border-white/5">
							<div>
								<div className="text-xs font-bold text-white">
									Giới hạn số khung tranh tối đa
								</div>
								<div className="text-[11px] text-zinc-400">
									Tránh file quá nặng khi có hàng trăm khung tranh
								</div>
							</div>

							<select
								value={limit}
								onChange={(e) => setLimit(Number(e.target.value))}
								className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-white/10 text-xs text-white focus:outline-none font-mono"
							>
								<option value={30}>30 panels</option>
								<option value={60}>60 panels</option>
								<option value={100}>100 panels (Khuyên dùng)</option>
								<option value={200}>200 panels</option>
								<option value={500}>500 panels</option>
							</select>
						</div>
					</div>

					{/* Explanation Callout */}
					<div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 leading-relaxed flex items-start gap-2.5">
						<Sparkles size={16} className="shrink-0 mt-0.5 text-amber-400" />
						<div>
							<strong>Tối ưu hóa cho AI:</strong> Báo cáo sẽ chứa toàn bộ
							pipeline kỹ thuật (RapidOCR PP-OCRv4 + MangaOCRService), đối chiếu
							ảnh crop gốc và text trích xuất, kèm chỉ dẫn prompt để AI tự đánh
							giá và lập kế hoạch tối ưu.
						</div>
					</div>
				</div>

				{/* Footer Actions */}
				<footer className="px-6 py-4 border-t border-white/10 bg-zinc-900/90 flex items-center justify-between shrink-0 gap-3">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition cursor-pointer"
					>
						Hủy bỏ
					</button>

					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={handleOpenInNewTab}
							className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-bold text-xs border border-amber-500/30 transition cursor-pointer"
						>
							<ExternalLink size={13} />
							<span>Xem trong tab mới</span>
						</button>

						<button
							type="button"
							onClick={handleDownload}
							className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black text-xs shadow-lg shadow-amber-500/20 transition cursor-pointer"
						>
							<Download size={14} />
							<span>Tải Xuống Báo Cáo</span>
						</button>
					</div>
				</footer>
			</div>
		</div>
	);
};

export default PanelReportModal;
