import {
	AlertCircle,
	BookOpen,
	Bot,
	Check,
	Code2,
	Copy,
	Download,
	Eye,
	FileText,
	Layers,
	RefreshCw,
	SlidersHorizontal,
	Sparkles,
	Star,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import client, { apiErrorMessage } from "../../api/client";
import { useAlert } from "../../hooks/useAlert";

export interface TopGenreStat {
	name: string;
	count: number;
}

export interface ReviewCorpusSummary {
	total_reviews: number;
	total_words: number;
	total_characters: number;
	estimated_tokens: number;
	average_words_per_review: number;
	total_manga_reviewed: number;
	average_manga_rating: number | null;
	earliest_review_date: string | null;
	latest_review_date: string | null;
	read_status_distribution: Record<string, number>;
	top_genres: TopGenreStat[];
}

export interface ReviewCorpusExportResponse {
	content: string;
	format: string;
	total_reviews: number;
	total_words: number;
	estimated_tokens: number;
	filename: string;
}

type ExportFormat = "markdown" | "json" | "txt";

export const ReviewCorpusExport: React.FC = () => {
	const { showToast } = useAlert();

	// Summary State
	const [summary, setSummary] = useState<ReviewCorpusSummary | null>(null);
	const [summaryLoading, setSummaryLoading] = useState(true);
	const [summaryError, setSummaryError] = useState<string | null>(null);

	// Export Configuration State
	const [format, setFormat] = useState<ExportFormat>("markdown");
	const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
	const [ratingMin, setRatingMin] = useState<number | "">("");
	const [sortBy, setSortBy] = useState("created_at_desc");
	const [includeSystemPrompt, setIncludeSystemPrompt] = useState(true);
	const [includeSynopsis, setIncludeSynopsis] = useState(true);
	const [includeMangaMeta, setIncludeMangaMeta] = useState(true);
	const [includeAltTitles, setIncludeAltTitles] = useState(true);

	// Export Result State
	const [exportResult, setExportResult] =
		useState<ReviewCorpusExportResponse | null>(null);
	const [generating, setGenerating] = useState(false);
	const [exportError, setExportError] = useState<string | null>(null);

	// UI View Mode: 'formatted' | 'raw'
	const [viewMode, setViewMode] = useState<"formatted" | "raw">("formatted");
	const [copied, setCopied] = useState(false);

	// 1. Fetch Corpus Summary
	const fetchSummary = useCallback(async () => {
		try {
			setSummaryLoading(true);
			setSummaryError(null);
			const res = await client.get<ReviewCorpusSummary>(
				"/api/analytics/review-corpus/summary",
			);
			setSummary(res.data);
		} catch (err) {
			const msg = apiErrorMessage(err, "Không thể tải tổng quan review corpus");
			setSummaryError(msg);
		} finally {
			setSummaryLoading(false);
		}
	}, []);

	// 2. Fetch Export Document
	const generateCorpus = useCallback(async () => {
		try {
			setGenerating(true);
			setExportError(null);
			const payload: {
				format: ExportFormat;
				sort_by: string;
				include_system_prompt: boolean;
				include_synopsis: boolean;
				include_manga_meta: boolean;
				include_alt_titles: boolean;
				read_statuses?: string[];
				rating_min?: number;
			} = {
				format,
				sort_by: sortBy,
				include_system_prompt: includeSystemPrompt,
				include_synopsis: includeSynopsis,
				include_manga_meta: includeMangaMeta,
				include_alt_titles: includeAltTitles,
			};
			if (selectedStatuses.length > 0) {
				payload.read_statuses = selectedStatuses;
			}
			if (ratingMin !== "") {
				payload.rating_min = Number(ratingMin);
			}

			const res = await client.post<ReviewCorpusExportResponse>(
				"/api/analytics/review-corpus/export",
				payload,
			);
			setExportResult(res.data);
		} catch (err) {
			const msg = apiErrorMessage(err, "Không thể tạo tài liệu review corpus");
			setExportError(msg);
		} finally {
			setGenerating(false);
		}
	}, [
		format,
		sortBy,
		includeSystemPrompt,
		includeSynopsis,
		includeMangaMeta,
		includeAltTitles,
		selectedStatuses,
		ratingMin,
	]);

	useEffect(() => {
		fetchSummary();
	}, [fetchSummary]);

	useEffect(() => {
		if (summary && summary.total_reviews > 0) {
			generateCorpus();
		}
	}, [summary, generateCorpus]);

	// Handle Copy
	const handleCopy = async () => {
		if (!exportResult?.content) return;
		try {
			await navigator.clipboard.writeText(exportResult.content);
			setCopied(true);
			showToast("Đã sao chép toàn bộ review corpus vào clipboard!", "success");
			setTimeout(() => setCopied(false), 2500);
		} catch (_err) {
			showToast("Không thể sao chép vào clipboard", "error");
		}
	};

	// Handle Download
	const handleDownload = () => {
		if (!exportResult?.content) return;
		const mimeTypes: Record<ExportFormat, string> = {
			markdown: "text/markdown;charset=utf-8",
			json: "application/json;charset=utf-8",
			txt: "text/plain;charset=utf-8",
		};
		const blob = new Blob([exportResult.content], {
			type: mimeTypes[format] || "text/plain;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = exportResult.filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		showToast(`Đã tải về tập tin ${exportResult.filename}`, "success");
	};

	// Statuses List
	const availableStatuses = useMemo(
		() => [
			{ key: "completed", label: "Completed" },
			{ key: "reading", label: "Reading" },
			{ key: "on_hold", label: "On Hold" },
			{ key: "plan_to_read", label: "Plan to Read" },
			{ key: "dropped", label: "Dropped" },
			{ key: "re_reading", label: "Re-Reading" },
		],
		[],
	);

	// Context Window Recommendation
	const tokenFitBadge = useMemo(() => {
		if (!exportResult) return null;
		const tokens = exportResult.estimated_tokens;
		if (tokens < 30000) {
			return (
				<Badge
					variant="outline"
					className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
				>
					Tối ưu hoàn hảo cho Claude 3.5, GPT-4o & Gemini
				</Badge>
			);
		}
		if (tokens < 120000) {
			return (
				<Badge
					variant="outline"
					className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
				>
					Vừa vặn trong GPT-4o (128k) & Claude (200k)
				</Badge>
			);
		}
		return (
			<Badge
				variant="outline"
				className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
			>
				Phù hợp với Gemini 1.5 Pro (2M Tokens)
			</Badge>
		);
	}, [exportResult]);

	// Render Loading State
	if (summaryLoading) {
		return (
			<div className="space-y-6 animate-pulse">
				<div className="h-28 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 flex flex-col justify-between" />
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton
							key={`skeleton-metric-${i + 1}`}
							className="h-24 rounded-xl"
						/>
					))}
				</div>
				<Skeleton className="h-96 rounded-2xl" />
			</div>
		);
	}

	// Render Error State
	if (summaryError) {
		return (
			<Card className="border-red-500/30 bg-red-500/5">
				<CardContent className="p-8 text-center space-y-4">
					<AlertCircle size={40} className="text-red-500 mx-auto" />
					<div className="space-y-1">
						<h3 className="font-bold text-lg text-[var(--text-primary)]">
							Không thể nạp dữ liệu review
						</h3>
						<p className="text-sm text-[var(--text-secondary)]">
							{summaryError}
						</p>
					</div>
					<Button
						variant="outline"
						onClick={fetchSummary}
						className="inline-flex items-center gap-2"
					>
						<RefreshCw size={16} />
						<span>Thử lại</span>
					</Button>
				</CardContent>
			</Card>
		);
	}

	// Render Empty State (0 reviews)
	if (!summary || summary.total_reviews === 0) {
		return (
			<Card className="border border-[var(--border-primary)] bg-[var(--bg-card)]">
				<CardContent className="p-12 text-center space-y-5">
					<div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[var(--brand-orange)] to-[var(--brand-coral)] text-white flex items-center justify-center mx-auto shadow-lg">
						<BookOpen size={32} />
					</div>
					<div className="max-w-md mx-auto space-y-2">
						<h3 className="text-xl font-bold font-spartan text-[var(--text-primary)]">
							Chưa có bài review nào trong thư viện
						</h3>
						<p className="text-sm text-[var(--text-secondary)] leading-relaxed">
							Tính năng tổng hợp và xuất dữ liệu phục vụ AI yêu cầu ít nhất một
							bài review. Hãy mở bất kỳ bộ manga nào trong thư viện và viết
							review để bắt đầu tạo corpus văn phong cá nhân của bạn!
						</p>
					</div>
					<Link to="/">
						<Button className="bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-semibold">
							Khám phá Thư viện Manga
						</Button>
					</Link>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			{/* Banner Title & Purpose */}
			<div className="relative overflow-hidden rounded-2xl border border-[var(--border-primary)] bg-gradient-to-r from-[var(--bg-card)] via-[var(--bg-card)] to-[var(--brand-orange)]/10 p-6 md:p-8 shadow-sm">
				<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
					<div className="space-y-2 max-w-2xl">
						<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--brand-orange)]/15 text-[var(--brand-orange)] text-xs font-bold uppercase tracking-wider">
							<Bot size={14} />
							<span>AI Style Training & Corpus Synthesis</span>
						</div>
						<h2 className="text-2xl md:text-3xl font-spartan font-extrabold tracking-tight text-[var(--text-primary)]">
							Tổng Hợp Toàn Bộ Review Thành File Duy Nhất
						</h2>
						<p className="text-sm text-[var(--text-secondary)] leading-relaxed">
							Xuất toàn bộ bài viết nhận xét cùng siêu dữ liệu (metadata) của
							các bộ manga thành một tập tin chuẩn hóa. Cấu trúc được thiết kế
							tối ưu để các AI khác (Claude, ChatGPT, Gemini, Llama) nạp vào
							hiểu sâu sắc góc nhìn, tiêu chí đánh giá và bắt chước chính xác
							văn phong của bạn.
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-2.5 shrink-0">
						<Button
							variant="outline"
							onClick={fetchSummary}
							className="rounded-xl border-[var(--border-primary)] text-xs font-bold gap-2"
						>
							<RefreshCw size={14} />
							<span>Làm mới số liệu</span>
						</Button>
						<Button
							onClick={generateCorpus}
							disabled={generating}
							className="rounded-xl bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold gap-2 shadow-md transition disabled:opacity-50"
						>
							<Sparkles size={14} />
							<span>{generating ? "Đang xử lý..." : "Biên soạn lại"}</span>
						</Button>
					</div>
				</div>
			</div>

			{/* Top Metric Cards */}
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
				<Card className="border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-sm">
					<CardContent className="p-5 flex items-center justify-between">
						<div className="space-y-1">
							<span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
								Tổng số Review
							</span>
							<div className="text-2xl font-extrabold text-[var(--text-primary)]">
								{summary.total_reviews}
							</div>
							<span className="text-[11px] text-[var(--text-secondary)]">
								Trên {summary.total_manga_reviewed} bộ manga
							</span>
						</div>
						<div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
							<FileText size={22} />
						</div>
					</CardContent>
				</Card>

				<Card className="border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-sm">
					<CardContent className="p-5 flex items-center justify-between">
						<div className="space-y-1">
							<span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
								Dung lượng Từ
							</span>
							<div className="text-2xl font-extrabold text-[var(--text-primary)]">
								{summary.total_words.toLocaleString()}
							</div>
							<span className="text-[11px] text-[var(--text-secondary)]">
								~{summary.estimated_tokens.toLocaleString()} LLM tokens
							</span>
						</div>
						<div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
							<Code2 size={22} />
						</div>
					</CardContent>
				</Card>

				<Card className="border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-sm">
					<CardContent className="p-5 flex items-center justify-between">
						<div className="space-y-1">
							<span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
								Điểm TB Đã Chấm
							</span>
							<div className="text-2xl font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
								<span>
									{summary.average_manga_rating !== null
										? summary.average_manga_rating.toFixed(1)
										: "N/A"}
								</span>
								<Star size={18} className="text-yellow-500 fill-yellow-500" />
							</div>
							<span className="text-[11px] text-[var(--text-secondary)]">
								Thang điểm 10.0
							</span>
						</div>
						<div className="p-3 rounded-xl bg-yellow-500/10 text-yellow-500">
							<Star size={22} />
						</div>
					</CardContent>
				</Card>

				<Card className="border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-sm">
					<CardContent className="p-5 flex items-center justify-between">
						<div className="space-y-1">
							<span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
								Độ dài TB / Bài
							</span>
							<div className="text-2xl font-extrabold text-[var(--text-primary)]">
								{summary.average_words_per_review.toLocaleString()}
							</div>
							<span className="text-[11px] text-[var(--text-secondary)]">
								từ mỗi nhận xét
							</span>
						</div>
						<div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
							<BookOpen size={22} />
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Main Configuration & Filtering Card */}
			<Card className="border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-sm">
				<CardHeader className="border-b border-[var(--border-primary)] pb-4">
					<CardTitle className="text-base font-bold flex items-center justify-between">
						<span className="flex items-center gap-2">
							<SlidersHorizontal
								size={18}
								className="text-[var(--brand-orange)]"
							/>
							<span>Cấu hình & Tùy chọn Xuất dữ liệu</span>
						</span>
						<span className="text-xs font-normal text-[var(--text-secondary)]">
							Thay đổi tùy chọn để tùy biến nội dung tài liệu theo nhu cầu
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent className="p-6 space-y-6">
					{/* Row 1: Format Selector & Sort */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{/* Format Selection */}
						<div className="space-y-2">
							<label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
								Định dạng xuất file
							</label>
							<div className="grid grid-cols-3 gap-2">
								{[
									{ id: "markdown", label: "Markdown (.md)", icon: FileText },
									{ id: "json", label: "JSON (.json)", icon: Code2 },
									{ id: "txt", label: "Plain Text (.txt)", icon: Layers },
								].map((fmt) => {
									const isSelected = format === fmt.id;
									const Icon = fmt.icon;
									return (
										<button
											type="button"
											key={fmt.id}
											onClick={() => setFormat(fmt.id as ExportFormat)}
											className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition ${
												isSelected
													? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-md"
													: "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
											}`}
										>
											<Icon size={16} />
											<span>{fmt.label}</span>
										</button>
									);
								})}
							</div>
						</div>

						{/* Sort Order */}
						<div className="space-y-2">
							<label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
								Thứ tự sắp xếp bài viết
							</label>
							<select
								value={sortBy}
								onChange={(e) => setSortBy(e.target.value)}
								className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition"
							>
								<option value="created_at_desc">
									Mới viết gần đây nhất (Mặc định)
								</option>
								<option value="created_at_asc">Bài viết cũ nhất trước</option>
								<option value="rating_desc">
									Điểm manga cao nhất trước (10.0 → 0.0)
								</option>
								<option value="rating_asc">
									Điểm manga thấp nhất trước (0.0 → 10.0)
								</option>
								<option value="words_desc">
									Bài dài nhất trước (Word count)
								</option>
								<option value="title_asc">Theo tên Manga (A → Z)</option>
							</select>
						</div>

						{/* Minimum Rating Filter */}
						<div className="space-y-2">
							<label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
								Lọc theo điểm đánh giá tối thiểu
							</label>
							<select
								value={ratingMin}
								onChange={(e) =>
									setRatingMin(
										e.target.value === "" ? "" : Number(e.target.value),
									)
								}
								className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition"
							>
								<option value="">Tất cả (Không giới hạn điểm)</option>
								<option value="9">Chỉ các bài chấm từ 9.0 ★ trở lên</option>
								<option value="8">Chỉ các bài chấm từ 8.0 ★ trở lên</option>
								<option value="7">Chỉ các bài chấm từ 7.0 ★ trở lên</option>
								<option value="5">Chỉ các bài chấm từ 5.0 ★ trở lên</option>
							</select>
						</div>
					</div>

					{/* Row 2: Status Pills */}
					<div className="space-y-2">
						<label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
							Lọc theo trạng thái đọc (Mặc định bao gồm tất cả)
						</label>
						<div className="flex flex-wrap gap-2">
							{availableStatuses.map((st) => {
								const isSelected = selectedStatuses.includes(st.key);
								return (
									<button
										type="button"
										key={st.key}
										onClick={() => {
											setSelectedStatuses((prev) =>
												prev.includes(st.key)
													? prev.filter((k) => k !== st.key)
													: [...prev, st.key],
											);
										}}
										className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
											isSelected
												? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
												: "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
										}`}
									>
										{st.label}
									</button>
								);
							})}
							{selectedStatuses.length > 0 && (
								<button
									type="button"
									onClick={() => setSelectedStatuses([])}
									className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition underline cursor-pointer"
								>
									Xóa bộ lọc trạng thái
								</button>
							)}
						</div>
					</div>

					{/* Row 3: Detail Inclusions (Toggles) */}
					<div className="pt-2 border-t border-[var(--border-primary)] space-y-3">
						<span className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
							Chi tiết thành phần bổ trợ trong tài liệu
						</span>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
							<label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] cursor-pointer select-none hover:border-[var(--brand-orange)] transition">
								<input
									type="checkbox"
									checked={includeSystemPrompt}
									onChange={(e) => setIncludeSystemPrompt(e.target.checked)}
									className="mt-0.5 rounded border-[var(--border-primary)] text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] h-4 w-4"
								/>
								<div className="space-y-0.5">
									<span className="block text-xs font-bold text-[var(--text-primary)]">
										🤖 Hướng dẫn AI bắt chước
									</span>
									<span className="block text-[10px] text-[var(--text-secondary)] leading-normal">
										Preamble chỉ dẫn AI phân tích giọng văn, cấu trúc và góc
										nhìn.
									</span>
								</div>
							</label>

							<label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] cursor-pointer select-none hover:border-[var(--brand-orange)] transition">
								<input
									type="checkbox"
									checked={includeSynopsis}
									onChange={(e) => setIncludeSynopsis(e.target.checked)}
									className="mt-0.5 rounded border-[var(--border-primary)] text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] h-4 w-4"
								/>
								<div className="space-y-0.5">
									<span className="block text-xs font-bold text-[var(--text-primary)]">
										📖 Tóm tắt nội dung Manga
									</span>
									<span className="block text-[10px] text-[var(--text-secondary)] leading-normal">
										Giúp AI đối chiếu nội dung cốt truyện với cảm nhận của bạn.
									</span>
								</div>
							</label>

							<label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] cursor-pointer select-none hover:border-[var(--brand-orange)] transition">
								<input
									type="checkbox"
									checked={includeMangaMeta}
									onChange={(e) => setIncludeMangaMeta(e.target.checked)}
									className="mt-0.5 rounded border-[var(--border-primary)] text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] h-4 w-4"
								/>
								<div className="space-y-0.5">
									<span className="block text-xs font-bold text-[var(--text-primary)]">
										📋 Metadata chi tiết
									</span>
									<span className="block text-[10px] text-[var(--text-secondary)] leading-normal">
										Tác giả, họa sĩ, thể loại, độ tuổi, năm và số chương.
									</span>
								</div>
							</label>

							<label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] cursor-pointer select-none hover:border-[var(--brand-orange)] transition">
								<input
									type="checkbox"
									checked={includeAltTitles}
									onChange={(e) => setIncludeAltTitles(e.target.checked)}
									className="mt-0.5 rounded border-[var(--border-primary)] text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] h-4 w-4"
								/>
								<div className="space-y-0.5">
									<span className="block text-xs font-bold text-[var(--text-primary)]">
										🏷️ Tiêu đề phụ (Alt Titles)
									</span>
									<span className="block text-[10px] text-[var(--text-secondary)] leading-normal">
										Tên tiếng Anh, Romaji, tiếng Nhật để AI nhận diện chuẩn.
									</span>
								</div>
							</label>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Interactive Workspace & Action Bar */}
			<div className="space-y-4">
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-primary)] shadow-sm">
					{/* Status & Stats Pill */}
					<div className="flex flex-wrap items-center gap-3">
						{exportResult && (
							<div className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
								<span className="font-bold text-[var(--text-primary)]">
									Đã biên soạn:
								</span>
								<span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 font-mono font-bold text-[var(--brand-orange)]">
									{exportResult.total_reviews} bài review
								</span>
								<span>•</span>
								<span className="font-mono">
									{exportResult.total_words.toLocaleString()} từ
								</span>
								<span>•</span>
								<span className="font-mono">
									~{exportResult.estimated_tokens.toLocaleString()} tokens
								</span>
							</div>
						)}
						{tokenFitBadge}
					</div>

					{/* Action Buttons */}
					<div className="flex items-center gap-2.5 shrink-0">
						{/* View Mode Toggle */}
						<div className="p-1 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] flex items-center">
							<button
								type="button"
								onClick={() => setViewMode("formatted")}
								className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
									viewMode === "formatted"
										? "bg-[var(--bg-card)] text-[var(--brand-orange)] shadow-sm"
										: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
								}`}
							>
								<Eye size={14} />
								<span>Trình bày</span>
							</button>
							<button
								type="button"
								onClick={() => setViewMode("raw")}
								className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
									viewMode === "raw"
										? "bg-[var(--bg-card)] text-[var(--brand-orange)] shadow-sm"
										: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
								}`}
							>
								<Code2 size={14} />
								<span>Mã nguồn</span>
							</button>
						</div>

						{/* Copy Button */}
						<Button
							variant="outline"
							onClick={handleCopy}
							disabled={!exportResult || generating}
							className="rounded-xl border-[var(--border-primary)] text-xs font-bold gap-1.5 shadow-sm"
						>
							{copied ? (
								<Check size={14} className="text-emerald-500" />
							) : (
								<Copy size={14} />
							)}
							<span>{copied ? "Đã chép" : "Sao chép"}</span>
						</Button>

						{/* Download Button */}
						<Button
							onClick={handleDownload}
							disabled={!exportResult || generating}
							className="rounded-xl bg-gradient-to-tr from-[var(--brand-orange)] to-[var(--brand-coral)] text-white text-xs font-bold gap-1.5 shadow-md hover:brightness-110 transition"
						>
							<Download size={14} />
							<span>Tải file xuống</span>
						</Button>
					</div>
				</div>

				{/* Preview Area Container */}
				{generating ? (
					<Card className="border border-[var(--border-primary)] bg-[var(--bg-card)]">
						<CardContent className="p-16 text-center space-y-4">
							<div className="w-12 h-12 rounded-full border-4 border-[var(--brand-orange)]/20 border-t-[var(--brand-orange)] animate-spin mx-auto" />
							<div className="space-y-1">
								<h4 className="text-base font-bold text-[var(--text-primary)]">
									Đang trích xuất và định dạng review corpus...
								</h4>
								<p className="text-xs text-[var(--text-secondary)]">
									Đang ghép nối các khối ProseMirror JSON, tra cứu metadata và
									xây dựng hướng dẫn AI.
								</p>
							</div>
						</CardContent>
					</Card>
				) : exportError ? (
					<Card className="border-red-500/30 bg-red-500/5">
						<CardContent className="p-8 text-center space-y-3">
							<AlertCircle size={32} className="text-red-500 mx-auto" />
							<p className="text-sm font-semibold text-red-600 dark:text-red-400">
								{exportError}
							</p>
							<Button variant="outline" size="sm" onClick={generateCorpus}>
								Thử lại
							</Button>
						</CardContent>
					</Card>
				) : exportResult ? (
					<div className="relative rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-md overflow-hidden">
						{/* Document Header Bar */}
						<div className="px-6 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]/50 flex items-center justify-between text-xs text-[var(--text-secondary)]">
							<div className="flex items-center gap-2 font-mono font-medium">
								<FileText size={14} className="text-[var(--brand-orange)]" />
								<span>{exportResult.filename}</span>
							</div>
							<div className="flex items-center gap-4">
								<span>{exportResult.total_reviews} Mục bài viết</span>
								<span>
									{exportResult.content.split("\n").length.toLocaleString()}{" "}
									Dòng
								</span>
							</div>
						</div>

						{/* Document Body */}
						{viewMode === "raw" ? (
							<div className="p-6 max-h-[700px] overflow-y-auto font-mono text-xs leading-relaxed text-[var(--text-primary)] bg-[var(--bg-card)] whitespace-pre-wrap select-text">
								{exportResult.content}
							</div>
						) : (
							<div className="p-6 md:p-10 max-h-[700px] overflow-y-auto space-y-6 text-sm text-[var(--text-primary)] leading-relaxed select-text font-sans">
								{/* Render Formatted Markdown preview */}
								{exportResult.content.split("\n\n---\n\n").map((chunk, i) => {
									const isPreamble = i === 0 && includeSystemPrompt;
									return (
										<div
											key={`chunk-${i + 1}`}
											className={`p-6 rounded-2xl border ${
												isPreamble
													? "bg-gradient-to-b from-[var(--brand-orange)]/5 to-transparent border-[var(--brand-orange)]/30"
													: "bg-[var(--bg-primary)]/40 border-[var(--border-primary)]"
											} space-y-4`}
										>
											<div className="whitespace-pre-wrap font-sans text-xs md:text-sm leading-relaxed">
												{chunk}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				) : null}
			</div>
		</div>
	);
};

export default ReviewCorpusExport;
