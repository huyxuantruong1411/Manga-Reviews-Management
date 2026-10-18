import {
	AlertCircle,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Loader2,
	RotateCw,
	Square,
	Terminal,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ExternalReviewSyncProgress } from "../../types/externalReview";

interface ExternalReviewSyncTelemetryBannerProps {
	progress: ExternalReviewSyncProgress;
	onCancel?: () => void;
	onRetry?: () => void;
	onDismiss?: () => void;
	className?: string;
}

const STAGES = [
	{ id: "resolving_id", label: "Xác thực MAL ID" },
	{ id: "enriching_metadata", label: "Làm giàu Metadata" },
	{ id: "fetching_reviews", label: "Quét Reviews" },
	{ id: "completed", label: "Lưu & Hoàn tất" },
];

export const ExternalReviewSyncTelemetryBanner: React.FC<
	ExternalReviewSyncTelemetryBannerProps
> = ({ progress, onCancel, onRetry, onDismiss, className = "" }) => {
	const [expandedLogs, setExpandedLogs] = useState(false);

	if (progress.status === "idle") {
		return null;
	}

	const isRunning = progress.status === "running";
	const isCompleted = progress.status === "completed";
	const isFailed = progress.status === "failed";
	const isCancelled = progress.status === "cancelled";

	// Determine current active stage index (0-3)
	const getStageIndex = () => {
		if (isCompleted) return 4;
		if (progress.stage === "resolving_id") return 0;
		if (progress.stage === "enriching_metadata") return 1;
		if (progress.stage === "fetching_reviews") return 2;
		if (progress.stage === "saving_db") return 3;
		return 0;
	};

	const currentStageIdx = getStageIndex();

	return (
		<div
			className={`rounded-3xl border p-5 transition-all duration-300 shadow-sm ${
				isCompleted
					? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100"
					: isFailed
						? "bg-red-500/10 border-red-500/30 text-red-950 dark:text-red-100"
						: isCancelled
							? "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100"
							: "bg-[var(--bg-card)] border-[var(--brand-orange)]/40 text-[var(--text-primary)]"
			} ${className}`}
		>
			{/* Header Status & Actions */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-current/15 pb-4">
				<div className="flex items-center space-x-3">
					<div
						className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
							isRunning
								? "bg-[var(--brand-orange)]/15 text-[var(--brand-orange)]"
								: isCompleted
									? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
									: isFailed
										? "bg-red-500/20 text-red-600 dark:text-red-400"
										: "bg-amber-500/20 text-amber-600 dark:text-amber-400"
						}`}
					>
						{isRunning ? (
							<Loader2 size={18} className="animate-spin" />
						) : isCompleted ? (
							<CheckCircle2 size={18} />
						) : isFailed ? (
							<AlertCircle size={18} />
						) : (
							<Square size={16} />
						)}
					</div>
					<div>
						<h4 className="text-sm font-bold flex items-center gap-2">
							<span>Tiến trình thu thập đánh giá MyAnimeList</span>
							<span
								className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
									isRunning
										? "bg-[var(--brand-orange)]/20 text-[var(--brand-orange)]"
										: isCompleted
											? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
											: isFailed
												? "bg-red-500/20 text-red-600 dark:text-red-400"
												: "bg-amber-500/20 text-amber-600 dark:text-amber-400"
								}`}
							>
								{progress.status}
							</span>
						</h4>
						<p className="text-xs opacity-80 mt-0.5">{progress.stage_label}</p>
					</div>
				</div>

				<div className="flex items-center gap-2 self-end sm:self-auto">
					{isRunning && onCancel && (
						<button
							type="button"
							onClick={onCancel}
							className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 transition cursor-pointer flex items-center gap-1.5"
						>
							<Square size={12} className="fill-current" />
							<span>Dừng thu thập</span>
						</button>
					)}
					{isFailed && onRetry && (
						<button
							type="button"
							onClick={onRetry}
							className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[var(--brand-orange)] text-white hover:bg-[var(--brand-coral)] transition shadow-sm cursor-pointer flex items-center gap-1.5"
						>
							<RotateCw size={12} />
							<span>Thử lại</span>
						</button>
					)}
					{(isCompleted || isFailed || isCancelled) && onDismiss && (
						<button
							type="button"
							onClick={onDismiss}
							className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-current/10 hover:bg-current/15 transition cursor-pointer"
						>
							Đóng
						</button>
					)}
				</div>
			</div>

			{/* 4-Stage Stepper */}
			<div className="py-4">
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
					{STAGES.map((s, idx) => {
						const isPast = idx < currentStageIdx;
						const isCurrent = idx === currentStageIdx && isRunning;
						return (
							<div
								key={s.id}
								className={`px-3 py-2 rounded-xl text-xs flex items-center gap-2 transition-all border ${
									isPast
										? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold"
										: isCurrent
											? "bg-[var(--brand-orange)]/10 border-[var(--brand-orange)]/40 text-[var(--brand-orange)] font-bold animate-pulse"
											: "bg-current/5 border-current/10 opacity-50"
								}`}
							>
								<div
									className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
										isPast
											? "bg-emerald-500 text-white"
											: isCurrent
												? "bg-[var(--brand-orange)] text-white"
												: "bg-current/20 text-current"
									}`}
								>
									{isPast ? "✓" : idx + 1}
								</div>
								<span className="truncate">{s.label}</span>
							</div>
						);
					})}
				</div>
			</div>

			{/* Progress bar & Metrics */}
			<div className="space-y-2">
				<div className="flex items-center justify-between text-xs font-semibold">
					<span>Tiến độ tổng thể</span>
					<span>{Math.round(progress.progress_pct)}%</span>
				</div>
				<div className="w-full h-2 rounded-full bg-current/10 overflow-hidden">
					<div
						className={`h-full transition-all duration-300 rounded-full ${
							isCompleted
								? "bg-emerald-500"
								: isFailed
									? "bg-red-500"
									: "bg-[var(--brand-orange)]"
						}`}
						style={{
							width: `${Math.max(3, Math.min(100, progress.progress_pct))}%`,
						}}
					/>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-80 pt-1">
					<div className="flex items-center gap-3">
						{progress.current_page > 0 && (
							<span>
								Trang quét: <strong>{progress.current_page}</strong>
								{progress.total_estimated_pages > 0
									? ` / ${progress.total_estimated_pages}`
									: ""}
							</span>
						)}
						<span>
							Đã tìm thấy:{" "}
							<strong>
								{progress.fetched_reviews_count}
								{progress.total_expected_reviews > 0
									? ` / ${progress.total_expected_reviews}`
									: ""}{" "}
								bài
							</strong>
						</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-emerald-600 dark:text-emerald-400 font-semibold">
							+{progress.inserted_count} mới
						</span>
						<span>•</span>
						<span className="text-blue-500 font-semibold">
							↻ {progress.updated_count} cập nhật
						</span>
					</div>
				</div>
			</div>

			{/* Live Event Log Console */}
			{progress.logs && progress.logs.length > 0 && (
				<div className="mt-4 pt-3 border-t border-current/15">
					<div className="flex items-center justify-between mb-2">
						<button
							type="button"
							onClick={() => setExpandedLogs(!expandedLogs)}
							className="text-xs font-semibold flex items-center gap-1.5 opacity-80 hover:opacity-100 transition cursor-pointer"
						>
							<Terminal size={13} />
							<span>Nhật ký hoạt động ({progress.logs.length})</span>
							{expandedLogs ? (
								<ChevronUp size={13} />
							) : (
								<ChevronDown size={13} />
							)}
						</button>
					</div>

					<div className="bg-black/20 dark:bg-black/40 rounded-xl p-3 font-mono text-[11px] space-y-1 max-h-48 overflow-y-auto">
						{(expandedLogs ? progress.logs : progress.logs.slice(-3)).map(
							(log, index) => (
								<div
									key={index}
									className="opacity-90 leading-relaxed truncate"
									title={log}
								>
									<span className="opacity-40 mr-1.5">›</span>
									{log}
								</div>
							),
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default ExternalReviewSyncTelemetryBanner;
