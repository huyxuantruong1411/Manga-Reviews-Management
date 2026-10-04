import {
	Check,
	Columns2,
	Download,
	ExternalLink,
	Eye,
	Loader2,
	RotateCw,
	Sparkles,
} from "lucide-react";
import type React from "react";
import { Link } from "react-router-dom";
import type { TranslationDisplayMode } from "../../hooks/useTranslation";

interface ReaderTranslationPanelProps {
	mangaId?: string;
	chapterId?: string;
	currentPage: number;
	totalPages: number;
	currentPageUid?: string;
	targetLanguage: string;
	onTargetLanguageChange: (lang: string) => void;
	displayMode: TranslationDisplayMode;
	onDisplayModeChange: (mode: TranslationDisplayMode) => void;
	compareSplit: number;
	onCompareSplitChange: (val: number) => void;
	profiles: Array<{ profile_id: string; name: string }>;
	selectedProfileId: string;
	onProfileChange: (id: string) => void;
	hasCurrentPageTranslation: boolean;
	totalTranslatedPages: number;
	isTranslating: boolean;
	jobProgress: { completed: number; total: number };
	errorMessage?: string;
	onTranslateCurrentPage: () => void;
	onTranslateChapter: () => void;
}

export const ReaderTranslationPanel: React.FC<ReaderTranslationPanelProps> = ({
	mangaId,
	chapterId,
	currentPage,
	totalPages,
	targetLanguage,
	onTargetLanguageChange,
	displayMode,
	onDisplayModeChange,
	compareSplit,
	onCompareSplitChange,
	profiles,
	selectedProfileId,
	onProfileChange,
	hasCurrentPageTranslation,
	totalTranslatedPages,
	isTranslating,
	jobProgress,
	errorMessage,
	onTranslateCurrentPage,
	onTranslateChapter,
}) => {
	const progressPercent =
		jobProgress.total > 0
			? Math.round((jobProgress.completed / jobProgress.total) * 100)
			: 0;

	return (
		<div className="flex flex-col space-y-4 text-xs font-sans">
			{/* Header / Mode Indicator */}
			<div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
				<div className="flex items-center space-x-2 text-zinc-200">
					<Sparkles size={16} className="text-[var(--brand-orange)]" />
					<span className="font-bold text-sm tracking-wide">
						Manga AI Translation
					</span>
				</div>
				<span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
					{totalTranslatedPages}/{totalPages} trang đã dịch
				</span>
			</div>

			{/* Error Banner if any */}
			{errorMessage && (
				<div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] leading-tight">
					{errorMessage}
				</div>
			)}

			{/* Progress Indicator when Translating */}
			{isTranslating && (
				<div className="p-3 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-2">
					<div className="flex items-center justify-between text-[11px]">
						<div className="flex items-center space-x-1.5 text-[var(--brand-orange)] font-semibold">
							<Loader2 size={13} className="animate-spin" />
							<span>Đang dịch background...</span>
						</div>
						<span className="font-mono text-zinc-400">
							{jobProgress.completed} / {jobProgress.total} ({progressPercent}%)
						</span>
					</div>
					<div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
						<div
							className="bg-gradient-to-r from-[var(--brand-orange)] to-[var(--brand-coral)] h-full transition-all duration-300"
							style={{ width: `${progressPercent}%` }}
						/>
					</div>
				</div>
			)}

			{/* View Mode Switcher Pills */}
			<div className="space-y-1.5">
				<span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
					Chế độ hiển thị
				</span>
				<div className="grid grid-cols-3 gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
					<button
						type="button"
						onClick={() => onDisplayModeChange("original")}
						className={`py-1.5 rounded-lg flex items-center justify-center space-x-1 font-semibold transition ${
							displayMode === "original"
								? "bg-zinc-800 text-white shadow-sm"
								: "text-zinc-400 hover:text-zinc-200"
						}`}
						title="Xem ảnh gốc từ raw scan"
					>
						<Eye size={13} />
						<span>Gốc</span>
					</button>
					<button
						type="button"
						onClick={() => onDisplayModeChange("translated")}
						className={`py-1.5 rounded-lg flex items-center justify-center space-x-1 font-semibold transition ${
							displayMode === "translated"
								? "bg-[var(--brand-orange)] text-white shadow-sm"
								: "text-zinc-400 hover:text-zinc-200"
						}`}
						title="Xem trang đã dịch"
					>
						<Check size={13} />
						<span>Bản dịch</span>
					</button>
					<button
						type="button"
						onClick={() => onDisplayModeChange("compare")}
						className={`py-1.5 rounded-lg flex items-center justify-center space-x-1 font-semibold transition ${
							displayMode === "compare"
								? "bg-[var(--brand-orange)] text-white shadow-sm"
								: "text-zinc-400 hover:text-zinc-200"
						}`}
						title="So sánh song song Gốc vs Dịch"
					>
						<Columns2 size={13} />
						<span>So sánh</span>
					</button>
				</div>
			</div>

			{/* Compare Split Slider (only shown in compare mode) */}
			{displayMode === "compare" && (
				<div className="p-3 bg-zinc-900/80 border border-zinc-800/80 rounded-2xl space-y-2">
					<div className="flex items-center justify-between text-[11px] text-zinc-300">
						<span>Tỉ lệ so sánh (Gốc ↔ Dịch)</span>
						<span className="font-mono text-[var(--brand-orange)]">
							{compareSplit}%
						</span>
					</div>
					<input
						type="range"
						min="0"
						max="100"
						value={compareSplit}
						onChange={(e) => onCompareSplitChange(Number(e.target.value))}
						className="w-full accent-[var(--brand-orange)] cursor-pointer"
					/>
				</div>
			)}

			{/* Target Language & Profile Settings */}
			<div className="grid grid-cols-2 gap-2">
				<div>
					<span className="text-[11px] font-semibold text-zinc-400 mb-1 block">
						Ngôn ngữ dịch
					</span>
					<div className="flex items-center space-x-1">
						{["vi", "en"].map((lang) => (
							<button
								key={lang}
								type="button"
								onClick={() => onTargetLanguageChange(lang)}
								className={`flex-1 py-1.5 rounded-xl uppercase font-bold text-center border transition ${
									targetLanguage.toLowerCase() === lang.toLowerCase()
										? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
										: "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
								}`}
							>
								{lang}
							</button>
						))}
					</div>
				</div>

				<div>
					<label
						htmlFor="translation-profile-select"
						className="text-[11px] font-semibold text-zinc-400 mb-1 block"
					>
						Profile dịch
					</label>
					<select
						id="translation-profile-select"
						value={selectedProfileId}
						onChange={(e) => onProfileChange(e.target.value)}
						className="w-full py-1.5 px-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-200 focus:outline-none focus:border-[var(--brand-orange)] font-semibold truncate"
					>
						{profiles.map((p) => (
							<option key={p.profile_id} value={p.profile_id}>
								{p.name}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Action Buttons */}
			<div className="space-y-2 pt-1">
				<button
					type="button"
					onClick={onTranslateCurrentPage}
					disabled={isTranslating}
					className="w-full py-2.5 px-3 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] disabled:opacity-40 text-white rounded-xl font-bold flex items-center justify-center space-x-2 shadow-lg transition cursor-pointer"
				>
					{isTranslating ? (
						<Loader2 size={14} className="animate-spin" />
					) : (
						<Sparkles size={14} />
					)}
					<span>
						{hasCurrentPageTranslation ? "Dịch lại trang " : "Dịch trang "}
						{currentPage}
					</span>
				</button>

				<button
					type="button"
					onClick={onTranslateChapter}
					disabled={isTranslating}
					className="w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-200 border border-zinc-800 rounded-xl font-semibold flex items-center justify-center space-x-2 transition cursor-pointer"
				>
					<RotateCw size={13} className={isTranslating ? "animate-spin" : ""} />
				</button>

				{chapterId && (
					<a
						href={`/api/translation/export/${chapterId}?target_language=${targetLanguage}`}
						download
						className="w-full py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl font-semibold flex items-center justify-center space-x-2 transition cursor-pointer"
					>
						<Download size={13} className="text-emerald-400" />
						<span>Xuất bản Chapter (ZIP)</span>
					</a>
				)}
			</div>

			{/* Deep link to Studio */}
			<div className="pt-2 border-t border-zinc-800/80 text-center">
				<Link
					to={`/translation?mangaId=${mangaId || ""}&chapterId=${chapterId || ""}&page=${currentPage}`}
					className="inline-flex items-center space-x-1.5 text-zinc-400 hover:text-[var(--brand-orange)] text-[11px] font-semibold transition"
				>
					<span>Mở trong Translation Studio</span>
					<ExternalLink size={12} />
				</Link>
			</div>
		</div>
	);
};
