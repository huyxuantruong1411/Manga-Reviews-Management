import {
	AlertCircle,
	BookOpen,
	Check,
	Copy,
	Eye,
	Layers,
	RotateCcw,
	Search,
	Sparkles,
	Volume2,
	Wand2,
	X,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import client, { apiErrorMessage, apiUrl } from "../../api/client";
import type { PanelResult } from "../../types/panel";

interface PanelDetailModalProps {
	panel: PanelResult | null;
	onClose: () => void;
	onOpenFullPage: (panel: PanelResult) => void;
	onWordClick: (word: string, event: React.MouseEvent) => void;
}

type InspectorTab = "dialogue" | "vocabulary" | "ai_vision" | "pipeline";

const getNarrationString = (n: PanelResult["narration"]): string | null => {
	if (!n) return null;
	if (typeof n === "string") return n;
	if (typeof n === "object") {
		const rec = n as Record<string, unknown>;
		if (typeof rec.text === "string") return rec.text;
		if (typeof rec.narrative === "string") return rec.narrative;
		if (typeof rec.description === "string") return rec.description;
	}
	return null;
};

export const PanelDetailModal: React.FC<PanelDetailModalProps> = ({
	panel,
	onClose,
	onOpenFullPage,
	onWordClick,
}) => {
	const navigate = useNavigate();
	const dialogRef = useRef<HTMLDivElement>(null);

	// Zoom and Pan state for the panel image
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const dragStartRef = useRef({ x: 0, y: 0 });

	// Active tab inside the inspector
	const [activeTab, setActiveTab] = useState<InspectorTab>("dialogue");

	// Extra details fetched from API
	const [panelDetail, setPanelDetail] = useState<PanelResult | null>(panel);

	// Moondream AI Narrator state
	const [narrationMode, setNarrationMode] = useState<
		"scene" | "layout" | "dialogue"
	>("scene");
	const [isNarrating, setIsNarrating] = useState(false);
	const [narrationText, setNarrationText] = useState<string | null>(null);
	const [narrationError, setNarrationError] = useState<string | null>(null);

	// Copy feedback
	const [copied, setCopied] = useState(false);

	// Vocabulary search inside panel
	const [vocabFilter, setVocabFilter] = useState("");

	// Lock body scroll and set focus
	useEffect(() => {
		if (!panel) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		dialogRef.current?.focus();
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, [panel]);

	// Fetch fresh panel details from backend
	useEffect(() => {
		if (!panel?.panel_id) return;
		setPanelDetail(panel);
		setZoom(1);
		setPan({ x: 0, y: 0 });
		setNarrationText(getNarrationString(panel.narration));
		setNarrationError(null);

		let isCancelled = false;
		client
			.get<PanelResult>(`/api/panels/${panel.panel_id}`)
			.then((res) => {
				if (!isCancelled && res.data) {
					setPanelDetail((prev) => ({ ...(prev || panel), ...res.data }));
					if (res.data.narration) {
						setNarrationText(getNarrationString(res.data.narration));
					}
				}
			})
			.catch(() => {
				// Ignore, we already have initial panel data
			});

		return () => {
			isCancelled = true;
		};
	}, [panel]);

	// Keyboard shortcut for Escape
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	// Zoom Controls
	const handleZoomIn = () => setZoom((z) => Math.min(3.5, z + 0.25));
	const handleZoomOut = () =>
		setZoom((z) => {
			const next = Math.max(0.75, z - 0.25);
			if (next <= 1) setPan({ x: 0, y: 0 });
			return next;
		});
	const handleResetZoom = () => {
		setZoom(1);
		setPan({ x: 0, y: 0 });
	};

	// Mouse Pan Handlers
	const handleMouseDown = (e: React.MouseEvent) => {
		if (zoom <= 1) return;
		setIsDragging(true);
		dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
	};

	const handleMouseMove = (e: React.MouseEvent) => {
		if (!isDragging || zoom <= 1) return;
		setPan({
			x: e.clientX - dragStartRef.current.x,
			y: e.clientY - dragStartRef.current.y,
		});
	};

	const handleMouseUp = () => setIsDragging(false);

	// Wheel Zoom Handler
	const handleWheel = (e: React.WheelEvent) => {
		e.preventDefault();
		if (e.deltaY < 0) {
			setZoom((z) => Math.min(3.5, z + 0.15));
		} else {
			setZoom((z) => {
				const next = Math.max(0.75, z - 0.15);
				if (next <= 1) setPan({ x: 0, y: 0 });
				return next;
			});
		}
	};

	const currentPanel = panelDetail || panel;

	// Copy Cleaned Text
	const handleCopyText = () => {
		const text = currentPanel?.cleaned_text || currentPanel?.raw_text || "";
		if (!text) return;
		navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	// Run AI Narrator (Moondream2)
	const handleRunNarrator = async () => {
		if (!currentPanel?.panel_id) return;
		setIsNarrating(true);
		setNarrationError(null);
		try {
			const res = await client.post<{
				narrative?: string;
				text?: string;
				description?: string;
			}>(`/api/panels/${currentPanel.panel_id}/narrate`, {
				mode: narrationMode,
			});
			const desc =
				res.data?.narrative || res.data?.text || res.data?.description || "";
			setNarrationText(desc);
		} catch (err) {
			setNarrationError(
				apiErrorMessage(err, "Không thể phân tích ngữ cảnh ảnh panel."),
			);
		} finally {
			setIsNarrating(false);
		}
	};

	// Tokenize cleaned text for interactive click-to-lookup
	const textTokens = useMemo(() => {
		const raw = currentPanel?.cleaned_text || currentPanel?.raw_text || "";
		return raw.split(/(\s+)/).map((part, index) => {
			const isWord = /[a-zA-Z0-9\u00C0-\u024F\u1EA0-\u1EF9]+/.test(part);
			const clean = part
				.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1EA0-\u1EF9]/g, "")
				.toLowerCase();
			return {
				id: `token-${index}-${clean || "space"}`,
				part,
				isWord,
				clean,
			};
		});
	}, [currentPanel?.cleaned_text, currentPanel?.raw_text]);

	if (!panel || !currentPanel) return null;

	const cropUrl = apiUrl(`/api/panels/${currentPanel.panel_id}/crop`);
	const [x1, y1, x2, y2] = currentPanel.coords || [0, 0, 1, 1];

	// Filter vocabulary
	const vocabularyList = (currentPanel.vocabulary || []).filter((v) => {
		if (!vocabFilter) return true;
		const q = vocabFilter.toLowerCase();
		return (
			v.term.toLowerCase().includes(q) ||
			v.lemma.toLowerCase().includes(q) ||
			v.pos_tag.toLowerCase().includes(q)
		);
	});

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
			<button
				type="button"
				aria-label="Đóng cửa sổ"
				className="fixed inset-0 bg-black/85 backdrop-blur-md cursor-default border-none"
				onClick={onClose}
			/>

			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label="Chi tiết trích xuất khung tranh"
				tabIndex={-1}
				className="relative z-10 w-full max-w-6xl h-[92vh] flex flex-col bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-left"
			>
				{/* 1. Modal Top Bar */}
				<header className="px-5 py-3.5 flex items-center justify-between border-b border-white/10 bg-zinc-900/90 shrink-0 gap-3 flex-wrap">
					<div className="flex items-center gap-3 min-w-0">
						<div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
							<Eye size={20} />
						</div>

						<div className="min-w-0">
							<div className="flex items-center gap-2 flex-wrap">
								<h2 className="text-base sm:text-lg font-black text-white truncate">
									{currentPanel.manga_title}
								</h2>
								<span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 font-bold text-xs border border-amber-500/30">
									Panel #{currentPanel.panel_index + 1}
								</span>
								<span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-semibold text-xs border border-emerald-500/30">
									Trang {currentPanel.page_number}
								</span>
								{currentPanel.volume && (
									<span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 font-medium text-xs border border-purple-500/30">
										Vol. {currentPanel.volume}
									</span>
								)}
								<span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-400 font-medium text-xs border border-sky-500/30">
									Ch. {currentPanel.chapter_number}
								</span>
							</div>
						</div>
					</div>

					{/* Header Actions */}
					<div className="flex items-center gap-2 shrink-0">
						<button
							type="button"
							onClick={() => onOpenFullPage(currentPanel)}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-medium text-xs border border-amber-500/30 transition cursor-pointer"
							title="Mở toàn bộ trang truyện với khung định vị vàng"
						>
							<Layers size={14} />
							<span className="hidden sm:inline">Xem trang gốc</span>
						</button>

						<button
							type="button"
							onClick={() => {
								if (currentPanel.manga_id && currentPanel.chapter_id) {
									navigate(
										`/manga/${currentPanel.manga_id}/read/${currentPanel.chapter_id}?page=${currentPanel.page_number}`,
									);
								}
							}}
							className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-md transition cursor-pointer"
							title="Đọc từ vị trí này trên trình đọc truyện"
						>
							<BookOpen size={14} />
							<span className="hidden sm:inline">Đọc tại đây</span>
						</button>

						<button
							type="button"
							onClick={onClose}
							className="p-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
							title="Đóng cửa sổ (Esc)"
						>
							<X size={18} />
						</button>
					</div>
				</header>

				{/* 2. Main Two-Column Body */}
				<div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden bg-[#090d16]">
					{/* Left Column: Interactive Zoom & Pan Panel Viewer (5 cols) */}
					<div className="lg:col-span-6 xl:col-span-5 flex flex-col border-b lg:border-b-0 lg:border-r border-white/10 bg-zinc-950/80 relative overflow-hidden">
						{/* Zoom Controls Overlay Bar */}
						<div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 p-1.5 rounded-2xl bg-zinc-900/90 border border-white/10 backdrop-blur-md shadow-xl">
							<button
								type="button"
								onClick={handleZoomIn}
								className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition"
								title="Phóng to (+)"
							>
								<ZoomIn size={15} />
							</button>
							<button
								type="button"
								onClick={handleZoomOut}
								className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition"
								title="Thu nhỏ (-)"
							>
								<ZoomOut size={15} />
							</button>
							<button
								type="button"
								onClick={handleResetZoom}
								className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition"
								title="Đặt lại zoom (100%)"
							>
								<RotateCcw size={15} />
							</button>
							<span className="px-2 text-[11px] font-mono text-amber-400 font-bold select-none">
								{Math.round(zoom * 100)}%
							</span>
						</div>

						{/* Pan Viewport */}
						<section
							aria-label="Khung tranh phóng to"
							className={`flex-1 relative overflow-hidden flex items-center justify-center p-4 select-none ${
								zoom > 1
									? isDragging
										? "cursor-grabbing"
										: "cursor-grab"
									: "cursor-default"
							}`}
							onMouseDown={handleMouseDown}
							onMouseMove={handleMouseMove}
							onMouseUp={handleMouseUp}
							onMouseLeave={handleMouseUp}
							onWheel={handleWheel}
						>
							<img
								src={cropUrl}
								alt={`Panel crop ${currentPanel.panel_index + 1}`}
								draggable={false}
								style={{
									transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
									transition: isDragging ? "none" : "transform 0.15s ease-out",
								}}
								className="max-w-full max-h-full object-contain rounded-lg shadow-2xl select-none"
							/>
						</section>

						{/* Bottom Bounding Box & Dimension Badges */}
						<div className="p-3 bg-zinc-900/90 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400 flex-wrap gap-2">
							<div className="flex items-center gap-2 font-mono">
								<span className="text-zinc-500">Tọa độ chuẩn hóa:</span>
								<span className="text-amber-400">
									[{x1.toFixed(3)}, {y1.toFixed(3)}, {x2.toFixed(3)},{" "}
									{y2.toFixed(3)}]
								</span>
							</div>

							<div className="flex items-center gap-2">
								{currentPanel.width && currentPanel.height ? (
									<span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300 font-mono">
										{currentPanel.width} × {currentPanel.height} px
									</span>
								) : null}
								<span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-semibold border border-amber-500/20 uppercase">
									{currentPanel.scan_mode || "panel"}
								</span>
							</div>
						</div>
					</div>

					{/* Right Column: Structured Extraction Inspector (7 cols) */}
					<div className="lg:col-span-6 xl:col-span-7 flex flex-col min-h-0 bg-[#0d1322]">
						{/* Tab Bar */}
						<div className="px-4 pt-3 border-b border-white/10 bg-zinc-900/60 flex items-center gap-1 overflow-x-auto shrink-0">
							<button
								type="button"
								onClick={() => setActiveTab("dialogue")}
								className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 ${
									activeTab === "dialogue"
										? "bg-[#0d1322] text-amber-400 border-amber-500"
										: "text-zinc-400 hover:text-zinc-200 border-transparent"
								}`}
							>
								<BookOpen size={14} />
								<span>Lời thoại &amp; OCR</span>
							</button>

							<button
								type="button"
								onClick={() => setActiveTab("vocabulary")}
								className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 ${
									activeTab === "vocabulary"
										? "bg-[#0d1322] text-amber-400 border-amber-500"
										: "text-zinc-400 hover:text-zinc-200 border-transparent"
								}`}
							>
								<Sparkles size={14} />
								<span>Từ vựng ({currentPanel.vocabulary?.length || 0})</span>
							</button>

							<button
								type="button"
								onClick={() => setActiveTab("ai_vision")}
								className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 ${
									activeTab === "ai_vision"
										? "bg-[#0d1322] text-amber-400 border-amber-500"
										: "text-zinc-400 hover:text-zinc-200 border-transparent"
								}`}
							>
								<Wand2 size={14} />
								<span>Ngữ cảnh AI</span>
							</button>

							<button
								type="button"
								onClick={() => setActiveTab("pipeline")}
								className={`px-3.5 py-2 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 ${
									activeTab === "pipeline"
										? "bg-[#0d1322] text-amber-400 border-amber-500"
										: "text-zinc-400 hover:text-zinc-200 border-transparent"
								}`}
							>
								<Layers size={14} />
								<span>Pipeline Kỹ thuật</span>
							</button>
						</div>

						{/* Tab Content Panes */}
						<div className="flex-1 p-5 overflow-y-auto space-y-5">
							{/* TAB 1: DIALOGUE & OCR TEXT */}
							{activeTab === "dialogue" && (
								<div className="space-y-5 animate-in fade-in duration-150">
									{/* Cleaned text card */}
									<div className="p-4 rounded-2xl bg-zinc-900/80 border border-emerald-500/30 shadow-lg">
										<div className="flex items-center justify-between mb-2">
											<div className="flex items-center gap-2">
												<span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
												<span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
													Văn bản đã làm sạch (MangaOCRService)
												</span>
											</div>

											<button
												type="button"
												onClick={handleCopyText}
												className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition cursor-pointer"
											>
												{copied ? (
													<>
														<Check size={12} className="text-emerald-400" />
														<span className="text-emerald-400">
															Đã sao chép
														</span>
													</>
												) : (
													<>
														<Copy size={12} />
														<span>Sao chép</span>
													</>
												)}
											</button>
										</div>

										<div className="text-sm sm:text-base leading-relaxed text-zinc-100 font-medium select-text break-words pt-1">
											{textTokens.length > 0 &&
											textTokens.some((t) => t.part.trim()) ? (
												textTokens.map((token) => {
													return token.isWord ? (
														<button
															key={token.id}
															type="button"
															onClick={(e) => onWordClick(token.clean, e)}
															className="inline-block px-1 py-0.5 rounded hover:bg-amber-500/30 hover:text-amber-300 transition cursor-pointer hover:underline text-left"
															title={`Tra từ điển: "${token.clean}"`}
														>
															{token.part}
														</button>
													) : (
														<span key={token.id}>{token.part}</span>
													);
												})
											) : (
												<span className="text-zinc-500 italic">
													[Khung tranh cảnh vật hoặc không chứa lời thoại]
												</span>
											)}
										</div>

										<div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-400">
											<span>
												💡 Nhấp vào bất kỳ từ nào để tra từ điển &amp; phát âm
											</span>
											<span className="font-mono">
												{
													(currentPanel.cleaned_text || currentPanel.raw_text)
														.split(/\s+/)
														.filter(Boolean).length
												}{" "}
												từ
											</span>
										</div>
									</div>

									{/* Raw OCR output card */}
									<div className="p-4 rounded-2xl bg-zinc-900/50 border border-white/10">
										<div className="flex items-center justify-between mb-2">
											<span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
												Kết quả OCR Thô (RapidOCR PP-OCRv4)
											</span>
											<span className="text-[10px] font-mono text-zinc-500">
												Chưa qua hậu xử lý
											</span>
										</div>

										<pre className="text-xs font-mono text-zinc-300 bg-black/40 p-3 rounded-xl border border-white/5 whitespace-pre-wrap break-words leading-relaxed select-text">
											{currentPanel.raw_text || (
												<span className="text-zinc-500 italic">
													[No raw text detections]
												</span>
											)}
										</pre>
									</div>
								</div>
							)}

							{/* TAB 2: VOCABULARY & LINGUISTIC TOKENS */}
							{activeTab === "vocabulary" && (
								<div className="space-y-4 animate-in fade-in duration-150">
									{/* Search bar inside vocabulary */}
									<div className="relative">
										<Search
											size={14}
											className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
										/>
										<input
											type="text"
											value={vocabFilter}
											onChange={(e) => setVocabFilter(e.target.value)}
											placeholder="Lọc từ vựng, lemma hoặc loại từ (NOUN, VERB...)..."
											className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900/80 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/60"
										/>
									</div>

									{vocabularyList.length > 0 ? (
										<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
											{vocabularyList.map((v) => (
												<div
													key={`${v.term}-${v.pos_tag}-${v.lemma}`}
													className="p-3 rounded-xl bg-zinc-900/70 border border-white/10 hover:border-amber-500/40 transition flex items-center justify-between gap-3 group"
												>
													<div className="min-w-0">
														<div className="flex items-center gap-2">
															<span className="text-sm font-bold text-white group-hover:text-amber-400 transition truncate">
																{v.term}
															</span>
															<span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase">
																{v.pos_tag}
															</span>
														</div>
														<div className="text-[11px] text-zinc-400 mt-0.5 font-mono">
															root:{" "}
															<span className="text-zinc-200">
																{v.lemma || v.term}
															</span>
														</div>
													</div>

													<div className="flex items-center gap-2 shrink-0">
														<span
															className="text-[10px] text-zinc-500 font-mono"
															title="Tần suất xuất hiện trong khung"
														>
															x{v.frequency}
														</span>
														<button
															type="button"
															onClick={(e) => onWordClick(v.lemma || v.term, e)}
															className="p-1.5 rounded-lg bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 text-zinc-300 transition cursor-pointer"
															title={`Tra từ điển: ${v.term}`}
														>
															<Volume2 size={13} />
														</button>
													</div>
												</div>
											))}
										</div>
									) : (
										<div className="p-8 text-center text-zinc-500 text-xs italic bg-zinc-900/30 rounded-2xl border border-white/5">
											{vocabFilter
												? "Không tìm thấy từ vựng khớp với bộ lọc."
												: "Chưa có từ vựng nào được trích xuất từ khung tranh này."}
										</div>
									)}
								</div>
							)}

							{/* TAB 3: AI VISION NARRATOR */}
							{activeTab === "ai_vision" && (
								<div className="space-y-4 animate-in fade-in duration-150">
									<div className="p-4 rounded-2xl bg-zinc-900/70 border border-amber-500/20">
										<div className="flex items-center justify-between mb-3 flex-wrap gap-2">
											<div className="flex items-center gap-2">
												<Wand2 size={16} className="text-amber-400" />
												<span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
													Phân Tích Ngữ Cảnh Thị Giác (Moondream2)
												</span>
											</div>

											{/* Mode selector */}
											<div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-950 border border-white/10 text-[11px]">
												{(["scene", "layout", "dialogue"] as const).map((m) => (
													<button
														key={m}
														type="button"
														onClick={() => setNarrationMode(m)}
														className={`px-2.5 py-1 rounded-lg capitalize transition ${
															narrationMode === m
																? "bg-amber-500 text-zinc-950 font-bold"
																: "text-zinc-400 hover:text-white"
														}`}
													>
														{m === "scene"
															? "Bối cảnh & Nhân vật"
															: m === "layout"
																? "Bố cục tranh"
																: "Hội thoại"}
													</button>
												))}
											</div>
										</div>

										<p className="text-xs text-zinc-400 mb-4 leading-relaxed">
											Sử dụng Vision-Language Model nhỏ gọn để mô tả chi tiết
											hành động nhân vật, cảm xúc, góc quay và khung cảnh xuất
											hiện trong ảnh panel này.
										</p>

										<button
											type="button"
											onClick={handleRunNarrator}
											disabled={isNarrating}
											className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-xs shadow-lg transition disabled:opacity-50 cursor-pointer"
										>
											{isNarrating ? (
												<>
													<span className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
													<span>Đang phân tích hình ảnh...</span>
												</>
											) : (
												<>
													<Sparkles size={14} />
													<span>Phân Tích Ngữ Cảnh AI</span>
												</>
											)}
										</button>
									</div>

									{/* Narration result display */}
									{narrationText ? (
										<div className="p-4 rounded-2xl bg-zinc-900/90 border border-emerald-500/30 space-y-2">
											<div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
												<Check size={14} />
												<span>Mô Tả Trích Xuất Được</span>
											</div>
											<div className="text-xs sm:text-sm text-zinc-200 leading-relaxed break-words">
												{narrationText}
											</div>
										</div>
									) : null}

									{narrationError && (
										<div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
											<AlertCircle size={15} className="shrink-0" />
											<span>{narrationError}</span>
										</div>
									)}
								</div>
							)}

							{/* TAB 4: TECHNICAL PIPELINE TRACE */}
							{activeTab === "pipeline" && (
								<div className="space-y-4 animate-in fade-in duration-150">
									{/* Metadata Table */}
									<div className="p-4 rounded-2xl bg-zinc-900/70 border border-white/10 space-y-3">
										<div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
											Định Danh &amp; Lưu Trữ Khung Tranh
										</div>

										<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
											<div>
												<span className="text-zinc-500">Panel ID:</span>
												<div className="font-mono text-zinc-200 truncate select-all">
													{currentPanel.panel_id}
												</div>
											</div>
											<div>
												<span className="text-zinc-500">Manga ID:</span>
												<div className="font-mono text-zinc-200 truncate select-all">
													{currentPanel.manga_id}
												</div>
											</div>
											<div>
												<span className="text-zinc-500">Chapter ID:</span>
												<div className="font-mono text-zinc-200 truncate select-all">
													{currentPanel.chapter_id}
												</div>
											</div>
											<div>
												<span className="text-zinc-500">MinIO S3 Key:</span>
												<div className="font-mono text-zinc-200 truncate select-all">
													{currentPanel.page_number
														? `Page ${currentPanel.page_number}`
														: "N/A"}
												</div>
											</div>
										</div>
									</div>

									{/* Pipeline Execution Flow */}
									<div className="p-4 rounded-2xl bg-zinc-900/70 border border-white/10 space-y-3">
										<div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
											Quy Trình Xử Lý Đã Áp Dụng (Pipeline Trace)
										</div>

										<div className="space-y-2.5 text-xs">
											<div className="flex items-start gap-2.5 p-2 rounded-lg bg-zinc-950/60 border border-white/5">
												<span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold font-mono text-[10px]">
													1
												</span>
												<div>
													<div className="font-bold text-zinc-200">
														Morphological Panel Segmentation
													</div>
													<div className="text-[11px] text-zinc-400">
														Gaussian Adaptive Threshold &amp; Contour Filtering
														IoU &gt; 0.85
													</div>
												</div>
											</div>

											<div className="flex items-start gap-2.5 p-2 rounded-lg bg-zinc-950/60 border border-white/5">
												<span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 font-bold font-mono text-[10px]">
													2
												</span>
												<div>
													<div className="font-bold text-zinc-200">
														RapidOCR PP-OCRv4 Engine
													</div>
													<div className="text-[11px] text-zinc-400">
														ONNX Runtime DBNet Detection + CRNN Text Recognition
													</div>
												</div>
											</div>

											<div className="flex items-start gap-2.5 p-2 rounded-lg bg-zinc-950/60 border border-white/5">
												<span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold font-mono text-[10px]">
													3
												</span>
												<div>
													<div className="font-bold text-zinc-200">
														MangaOCRService Post-Processing
													</div>
													<div className="text-[11px] text-zinc-400">
														Comic glyph fix, De-hyphenation (COUNSEL-\nOR),
														Wordninja stuck words (GOTALK)
													</div>
												</div>
											</div>

											<div className="flex items-start gap-2.5 p-2 rounded-lg bg-zinc-950/60 border border-white/5">
												<span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold font-mono text-[10px]">
													4
												</span>
												<div>
													<div className="font-bold text-zinc-200">
														spaCy Linguistic Analysis
													</div>
													<div className="text-[11px] text-zinc-400">
														Lemmatization, POS Tagging (en_core_web_sm),
														stopword filtering
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>
							)}
						</div>

						{/* Footer Actions */}
						<div className="p-4 border-t border-white/10 bg-zinc-900/90 flex items-center justify-between shrink-0">
							<span className="text-[11px] text-zinc-500">
								Nhấn{" "}
								<kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">Esc</kbd> để
								đóng cửa sổ
							</span>

							<button
								type="button"
								onClick={onClose}
								className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs transition cursor-pointer"
							>
								Đóng
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default PanelDetailModal;
