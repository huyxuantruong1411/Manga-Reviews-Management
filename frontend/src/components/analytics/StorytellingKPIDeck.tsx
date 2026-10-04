import {
	Award,
	BookOpen,
	FileText,
	Layers,
	Sparkles,
	Star,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import type React from "react";
import { useState } from "react";

export interface OverviewVelocity {
	completed_last_7d?: number;
	completed_prev_7d?: number;
	completed_last_30d?: number;
	completed_prev_30d?: number;
	added_last_7d?: number;
	added_prev_7d?: number;
	added_last_30d?: number;
	added_prev_30d?: number;
	completion_rate?: number;
	backlog_count?: number;
	backlog_rate?: number;
	in_progress_count?: number;
	review_coverage_rate?: number;
	rated_count?: number;
	unrated_count?: number;
}

export interface OverviewStatsData {
	total_manga: number;
	total_reviews: number;
	average_rating: number;
	status_distribution: {
		unread: number;
		reading: number;
		completed: number;
		dropped: number;
		on_hold: number;
		plan_to_read: number;
		re_reading: number;
	};
	velocity?: OverviewVelocity;
}

interface StorytellingKPIDeckProps {
	overview: OverviewStatsData;
	className?: string;
}

export const StorytellingKPIDeck: React.FC<StorytellingKPIDeckProps> = ({
	overview,
	className = "",
}) => {
	const [timeframe, setTimeframe] = useState<"7d" | "30d">("7d");

	const totalManga = overview.total_manga || 0;
	const totalReviews = overview.total_reviews || 0;
	const avgRating = overview.average_rating || 0;
	const completedCount = overview.status_distribution?.completed || 0;
	const inProgressCount =
		(overview.status_distribution?.reading || 0) +
		(overview.status_distribution?.re_reading || 0);
	const backlogCount =
		(overview.status_distribution?.unread || 0) +
		(overview.status_distribution?.plan_to_read || 0);

	const vel = overview.velocity || {};

	// Calculations for 7d vs 30d
	const completedRecent =
		timeframe === "7d"
			? (vel.completed_last_7d ?? 0)
			: (vel.completed_last_30d ?? 0);
	const completedPrev =
		timeframe === "7d"
			? (vel.completed_prev_7d ?? 0)
			: (vel.completed_prev_30d ?? 0);

	const addedRecent =
		timeframe === "7d" ? (vel.added_last_7d ?? 0) : (vel.added_last_30d ?? 0);
	const addedPrev =
		timeframe === "7d" ? (vel.added_prev_7d ?? 0) : (vel.added_prev_30d ?? 0);

	// Delta calculation
	const getDelta = (curr: number, prev: number) => {
		if (prev === 0) return curr > 0 ? 100 : 0;
		return Math.round(((curr - prev) / prev) * 100);
	};

	const completedDelta = getDelta(completedRecent, completedPrev);
	const addedDelta = getDelta(addedRecent, addedPrev);

	const completionRate =
		vel.completion_rate ??
		(totalManga > 0
			? Number(((completedCount / totalManga) * 100).toFixed(1))
			: 0);

	const backlogRate =
		vel.backlog_rate ??
		(totalManga > 0
			? Number(((backlogCount / totalManga) * 100).toFixed(1))
			: 0);

	const reviewCoverage =
		vel.review_coverage_rate ??
		(completedCount > 0
			? Number(((totalReviews / completedCount) * 100).toFixed(1))
			: 0);

	// Estimate weeks to clear 10% of backlog based on recent 7d velocity
	const recentWeeklyPace = vel.completed_last_7d || 1;
	const weeksToTenPercentBacklog = Math.max(
		1,
		Math.ceil((backlogCount * 0.1) / Math.max(recentWeeklyPace, 1)),
	);

	return (
		<div className={`space-y-4 ${className}`}>
			{/* Timeframe Switcher & Narrative Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
				<div className="flex items-center space-x-2 text-xs text-[var(--text-secondary)]">
					<Sparkles size={14} className="text-[var(--brand-orange)]" />
					<span className="font-semibold text-[var(--text-primary)]">
						Chỉ Số Tiến Độ &amp; Nhịp Điệu Đọc
					</span>
					<span className="hidden sm:inline">•</span>
					<span className="hidden sm:inline">
						So sánh tốc độ theo thời gian thực
					</span>
				</div>

				{/* Timeframe selector pill */}
				<div className="inline-flex items-center p-1 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] text-xs font-semibold self-start sm:self-auto">
					<button
						type="button"
						onClick={() => setTimeframe("7d")}
						className={`px-3 py-1 rounded-lg transition cursor-pointer ${
							timeframe === "7d"
								? "bg-[var(--bg-card)] text-[var(--brand-orange)] font-bold shadow-sm border border-[var(--border-primary)]"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
					>
						7 Ngày Qua
					</button>
					<button
						type="button"
						onClick={() => setTimeframe("30d")}
						className={`px-3 py-1 rounded-lg transition cursor-pointer ${
							timeframe === "30d"
								? "bg-[var(--bg-card)] text-[var(--brand-orange)] font-bold shadow-sm border border-[var(--border-primary)]"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
					>
						30 Ngày Qua
					</button>
				</div>
			</div>

			{/* 4 Storytelling KPI Cards */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
				{/* CARD 1: LIBRARY SCALE & INFLOW */}
				<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-5 space-y-3 shadow-sm hover:shadow-md transition">
					<div className="flex items-center justify-between">
						<div className="p-3 bg-orange-500/10 text-[var(--brand-orange)] rounded-2xl border border-orange-500/20">
							<BookOpen size={22} />
						</div>
						<div
							className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
								addedRecent > 0
									? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
									: "bg-zinc-500/10 text-zinc-400"
							}`}
							title={`${addedRecent} manga thêm mới (${timeframe === "7d" ? "7 ngày qua" : "30 ngày qua"})`}
						>
							{addedDelta >= 0 ? (
								<TrendingUp size={12} />
							) : (
								<TrendingDown size={12} />
							)}
							<span>
								{addedRecent > 0 ? `+${addedRecent}` : "0"}{" "}
								{timeframe === "7d" ? "/7 ngày" : "/30 ngày"}
							</span>
						</div>
					</div>

					<div>
						<span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block font-poppins">
							Quy Mô Thư Viện
						</span>
						<div className="text-3xl font-black font-spartan text-[var(--text-primary)] mt-0.5">
							{totalManga.toLocaleString()}
						</div>
					</div>

					{/* Micro Progress / Status Pill */}
					<div className="pt-2 border-t border-[var(--border-primary)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
						<span>
							Đang đọc:{" "}
							<strong className="text-[var(--text-primary)] font-mono">
								{inProgressCount}
							</strong>
						</span>
						<span className="text-emerald-500 font-bold">
							{addedDelta > 0
								? `▲ +${addedDelta}%`
								: addedDelta < 0
									? `▼ ${addedDelta}%`
									: "Ổn định"}
						</span>
					</div>
				</div>

				{/* CARD 2: READING VELOCITY & COMPLETIONS */}
				<div className="bg-[var(--bg-card)] border border-emerald-500/20 rounded-3xl p-5 space-y-3 shadow-sm hover:shadow-md transition relative overflow-hidden">
					<div className="flex items-center justify-between">
						<div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20">
							<Award size={22} />
						</div>

						<div
							className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
								completedRecent > 0
									? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
									: "bg-zinc-500/10 text-zinc-400"
							}`}
							title={`${completedRecent} manga hoàn thành trong ${timeframe === "7d" ? "7 ngày qua" : "30 ngày qua"}`}
						>
							<Sparkles size={12} />
							<span>
								{completedRecent > 0 ? `+${completedRecent}` : "0"} đã xong
							</span>
						</div>
					</div>

					<div>
						<span className="text-xs font-semibold text-emerald-500 uppercase tracking-wider block font-poppins">
							Đã Hoàn Thành
						</span>
						<div className="flex items-baseline space-x-2 mt-0.5">
							<span className="text-3xl font-black font-spartan text-[var(--text-primary)]">
								{completedCount.toLocaleString()}
							</span>
							<span className="text-xs font-bold text-emerald-400 font-mono">
								({completionRate}%)
							</span>
						</div>
					</div>

					{/* Progress track & velocity trend */}
					<div className="pt-2 border-t border-[var(--border-primary)] space-y-1.5">
						<div className="h-1.5 w-full bg-[var(--border-primary)] rounded-full overflow-hidden">
							<div
								className="h-full bg-emerald-500 rounded-full transition-all duration-500"
								style={{ width: `${Math.min(100, completionRate)}%` }}
							/>
						</div>
						<div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
							<span>
								Kỳ trước:{" "}
								<strong className="text-[var(--text-primary)] font-mono">
									{completedPrev}
								</strong>
							</span>
							<span
								className={
									completedDelta >= 0
										? "text-emerald-400 font-bold"
										: "text-amber-400 font-bold"
								}
							>
								{completedDelta >= 0
									? `▲ +${completedDelta}%`
									: `▼ ${completedDelta}%`}
							</span>
						</div>
					</div>
				</div>

				{/* CARD 3: BACKLOG PRESSURE & QUEUE HEALTH */}
				<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-5 space-y-3 shadow-sm hover:shadow-md transition">
					<div className="flex items-center justify-between">
						<div className="p-3 bg-purple-500/10 text-purple-400 rounded-2xl border border-purple-500/20">
							<Layers size={22} />
						</div>

						<span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
							{backlogRate}% Thư viện
						</span>
					</div>

					<div>
						<span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block font-poppins">
							Kho Hàng Đợi (Backlog)
						</span>
						<div className="text-3xl font-black font-spartan text-[var(--text-primary)] mt-0.5">
							{backlogCount.toLocaleString()}
						</div>
					</div>

					{/* Sprint estimate insight */}
					<div className="pt-2 border-t border-[var(--border-primary)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
						<span className="truncate pr-1">Ước tính 10% backlog:</span>
						<span className="font-semibold text-purple-300 shrink-0 font-mono">
							~{weeksToTenPercentBacklog} tuần
						</span>
					</div>
				</div>

				{/* CARD 4: CRITIQUE & REVIEW DEPTH */}
				<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-5 space-y-3 shadow-sm hover:shadow-md transition">
					<div className="flex items-center justify-between">
						<div className="p-3 bg-yellow-500/10 text-yellow-500 rounded-2xl border border-yellow-500/20">
							<Star size={22} />
						</div>

						<div className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
							<FileText size={12} />
							<span>{totalReviews} Reviews</span>
						</div>
					</div>

					<div>
						<span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block font-poppins">
							Điểm Đánh Giá &amp; Review
						</span>
						<div className="flex items-baseline space-x-2 mt-0.5">
							<span className="text-3xl font-black font-spartan text-[var(--text-primary)]">
								{avgRating.toFixed(1)}
							</span>
							<span className="text-xs text-yellow-500">★ Trung bình</span>
						</div>
					</div>

					{/* Review Coverage */}
					<div className="pt-2 border-t border-[var(--border-primary)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
						<span>Tỷ lệ có bài viết:</span>
						<span className="font-bold text-[var(--text-primary)] font-mono">
							{reviewCoverage}% truyện đã đọc
						</span>
					</div>
				</div>
			</div>
		</div>
	);
};

export default StorytellingKPIDeck;
