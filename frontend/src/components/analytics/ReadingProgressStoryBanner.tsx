import {
	ArrowRight,
	ChevronLeft,
	ChevronRight,
	Compass,
	Layers,
	Lightbulb,
	Sparkles,
	Star,
	TrendingUp,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import type { OverviewStatsData } from "./StorytellingKPIDeck";

interface ReadingProgressStoryBannerProps {
	overview: OverviewStatsData;
	topTags?: Array<{ name: string; count: number }>;
	onFilterStatus?: (status: string) => void;
	className?: string;
}

interface StoryCard {
	id: string;
	title: string;
	tagline: string;
	badge: string;
	badgeColor: string;
	icon: React.ReactNode;
	content: string;
	highlight: string;
	suggestion?: string;
	actionLabel?: string;
	actionStatus?: string;
}

export const ReadingProgressStoryBanner: React.FC<
	ReadingProgressStoryBannerProps
> = ({ overview, topTags = [], onFilterStatus, className = "" }) => {
	const [activeStoryIndex, setActiveStoryIndex] = useState(0);
	const [isCollapsed, setIsCollapsed] = useState(false);

	const totalManga = overview.total_manga || 0;
	const totalReviews = overview.total_reviews || 0;
	const avgRating = overview.average_rating || 0;
	const completed = overview.status_distribution?.completed || 0;
	const backlog =
		(overview.status_distribution?.unread || 0) +
		(overview.status_distribution?.plan_to_read || 0);

	const vel = overview.velocity || {};
	const comp7d = vel.completed_last_7d ?? 0;
	const compPrev7d = vel.completed_prev_7d ?? 0;
	const added7d = vel.added_last_7d ?? 0;
	const added30d = vel.added_last_30d ?? 0;
	const completionRate =
		vel.completion_rate ??
		(totalManga > 0 ? Number(((completed / totalManga) * 100).toFixed(1)) : 0);
	const backlogRate =
		vel.backlog_rate ??
		(totalManga > 0 ? Number(((backlog / totalManga) * 100).toFixed(1)) : 0);
	const reviewCoverage =
		vel.review_coverage_rate ??
		(completed > 0 ? Number(((totalReviews / completed) * 100).toFixed(1)) : 0);

	const unreviewedCompleted = Math.max(0, completed - totalReviews);

	// Generate 4 Story Templates based on live data
	const stories: StoryCard[] = useMemo(() => {
		const list: StoryCard[] = [];

		// STORY 1: VELOCITY & MOMENTUM
		const compDiff = comp7d - compPrev7d;
		const compTrendText =
			compDiff > 0
				? `tăng trưởng +${compDiff} bộ so với tuần trước`
				: compDiff < 0
					? `chậm hơn ${Math.abs(compDiff)} bộ so với tuần trước`
					: "duy trì đều đặn như tuần trước";

		list.push({
			id: "velocity",
			title: "Nhịp Điệu Đọc Gần Đây",
			tagline: "Tiến độ hoàn thành 7 ngày qua",
			badge: comp7d > 0 ? `+${comp7d} Tuần Này` : "Đang Giữ Nhịp",
			badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
			icon: <TrendingUp className="text-emerald-400" size={18} />,
			highlight: `+${comp7d} manga đã hoàn thành trong 7 ngày qua (${compTrendText}).`,
			content: `Thư viện cá nhân của bạn hiện đã chinh phục được ${completed.toLocaleString()} tác phẩm, đạt tỷ lệ hoàn thành ${completionRate}% trên tổng số ${totalManga.toLocaleString()} bộ truyện.`,
			suggestion:
				comp7d > 0
					? "Bạn đang có đà đọc rất tốt. Hãy tiếp tục giữ thói quen đọc hằng ngày!"
					: "Tuần này bạn chưa đánh dấu hoàn thành bộ truyện nào. Hãy dành chút thời gian thư giãn với các chương tiếp theo!",
			actionLabel: "Xem danh sách đã hoàn thành",
			actionStatus: "completed",
		});

		// STORY 2: BACKLOG SPRINT
		list.push({
			id: "backlog",
			title: "Cân Bằng Hàng Đợi (Backlog)",
			tagline: "Chiến lược giải phóng kho truyện chờ",
			badge: `${backlogRate}% Backlog`,
			badgeColor: "bg-purple-500/10 text-purple-300 border-purple-500/30",
			icon: <Layers className="text-purple-400" size={18} />,
			highlight: `Kho hàng đợi đang có ${backlog.toLocaleString()} bộ truyện (${backlogRate}% tổng thư viện).`,
			content: `Trong 7 ngày qua, bạn nạp thêm +${added7d} truyện và trong 30 ngày qua là +${added30d} tác phẩm mới. Tốc độ nạp truyện mới đang ${added30d > comp7d * 4 ? "nhanh hơn" : "tương đương"} tốc độ đọc xong.`,
			suggestion:
				backlog > 100
					? "Gợi ý: Lọc các bộ manga ngắn tập (< 30 chương) hoặc oneshot đã phát hành xong để vừa giải tỏa backlog vừa gia tăng thành tích đọc!"
					: "Kho hàng đợi được duy trì ở mức rất lý tưởng, bạn đọc gần như theo kịp số lượng manga được lưu trữ.",
			actionLabel: "Mở danh sách Chưa đọc",
			actionStatus: "unread",
		});

		// STORY 3: CRITIQUE & REVIEW DEPTH
		list.push({
			id: "reviews",
			title: "Dấu Ấn Cảm Nhận & Đánh Giá",
			tagline: "Độ sâu phân tích và lưu giữ kỷ niệm",
			badge: `${reviewCoverage}% Có Review`,
			badgeColor: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
			icon: <Star className="text-yellow-400" size={18} />,
			highlight: `Điểm trung bình toàn thư viện là ${avgRating.toFixed(1)}★ với ${totalReviews} bài review được lưu trữ.`,
			content: `Bạn đã viết bài nhận xét cho ${reviewCoverage}% các bộ truyện đã hoàn thành. Hiện còn khoảng ${unreviewedCompleted.toLocaleString()} tác phẩm đã đọc xong nhưng chưa có bài viết cảm nhận chi tiết.`,
			suggestion:
				unreviewedCompleted > 0
					? "Gợi ý: Hãy ghi lại vài dòng cảm nghĩ cho những tác phẩm bạn chấm từ 8★ trở lên để dễ dàng tìm kiếm và ôn lại sau này."
					: "Tuyệt vời! Bạn chăm chỉ lưu lại góc nhìn đánh giá cho hầu hết các tác phẩm đã đọc.",
			actionLabel: "Khám phá tab Reviews",
		});

		// STORY 4: TASTE ANCHOR
		const topTagName = topTags[0]?.name || "Đa dạng";
		const topTagCount = topTags[0]?.count || 0;
		list.push({
			id: "taste",
			title: "Gu Thưởng Thức & Trọng Tâm",
			tagline: "Thể loại chiếm ưu thế trong sở thích của bạn",
			badge: `Top 1: ${topTagName}`,
			badgeColor: "bg-orange-500/10 text-orange-400 border-orange-500/30",
			icon: <Compass className="text-[var(--brand-orange)]" size={18} />,
			highlight: `Thể loại "${topTagName}" xuất hiện nhiều nhất với ${topTagCount.toLocaleString()} tác phẩm.`,
			content: `Sở thích đọc của bạn có định hình rõ nét xoay quanh các chủ đề ${topTags
				.slice(0, 3)
				.map((t) => `"${t.name}"`)
				.join(
					", ",
				)}. Các tác phẩm này có xu hướng giữ bạn lại lâu hơn trong quá trình theo dõi.`,
			suggestion:
				"Bạn có thể thử nghiệm một thể loại mới ít xuất hiện hơn trong thư viện để làm mới trải nghiệm đọc của mình!",
			actionLabel: "Xem thống kê Tags",
		});

		return list;
	}, [
		comp7d,
		compPrev7d,
		added7d,
		added30d,
		completed,
		completionRate,
		totalManga,
		backlog,
		backlogRate,
		totalReviews,
		reviewCoverage,
		avgRating,
		unreviewedCompleted,
		topTags,
	]);

	const currentStory = stories[activeStoryIndex] || stories[0];

	return (
		<div
			className={`rounded-3xl border border-orange-500/20 bg-gradient-to-r from-orange-500/5 via-amber-500/5 to-purple-500/5 p-5 sm:p-6 transition-all duration-300 shadow-sm ${className}`}
		>
			{/* Top Bar: Carousel Controls & Mode Selector */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-primary)] pb-3">
				<div className="flex items-center space-x-2">
					<div className="p-1.5 rounded-lg bg-[var(--brand-orange)]/15 text-[var(--brand-orange)]">
						<Sparkles size={16} />
					</div>
					<div>
						<span className="text-xs font-bold uppercase tracking-wider text-[var(--brand-orange)] font-poppins">
							Data Storytelling • Góc Nhìn Chuyên Sâu
						</span>
						<h4 className="text-sm font-bold text-[var(--text-primary)] font-spartan">
							{currentStory.title}
						</h4>
					</div>
				</div>

				{/* Carousel Tabs & Prev/Next */}
				<div className="flex items-center space-x-2 self-end sm:self-auto">
					{/* Story Pills */}
					<div className="hidden md:flex items-center space-x-1.5 p-1 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] text-xs">
						{stories.map((s, idx) => (
							<button
								key={s.id}
								type="button"
								onClick={() => setActiveStoryIndex(idx)}
								className={`px-2.5 py-1 rounded-lg transition font-medium cursor-pointer ${
									activeStoryIndex === idx
										? "bg-[var(--bg-card)] text-[var(--brand-orange)] font-bold shadow-sm"
										: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
								}`}
							>
								{s.title.split(" ")[0]}
							</button>
						))}
					</div>

					{/* Navigation Arrow Buttons */}
					<div className="flex items-center space-x-1">
						<button
							type="button"
							onClick={() =>
								setActiveStoryIndex(
									(prev) => (prev - 1 + stories.length) % stories.length,
								)
							}
							className="p-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
							title="Câu chuyện trước"
						>
							<ChevronLeft size={16} />
						</button>
						<span className="text-xs font-mono text-[var(--text-secondary)] px-1">
							{activeStoryIndex + 1}/{stories.length}
						</span>
						<button
							type="button"
							onClick={() =>
								setActiveStoryIndex((prev) => (prev + 1) % stories.length)
							}
							className="p-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
							title="Câu chuyện tiếp theo"
						>
							<ChevronRight size={16} />
						</button>
					</div>

					{/* Collapse / Expand Toggle */}
					<button
						type="button"
						onClick={() => setIsCollapsed(!isCollapsed)}
						className="px-2.5 py-1 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
					>
						{isCollapsed ? "Mở rộng" : "Thu gọn"}
					</button>
				</div>
			</div>

			{/* Story Content Body */}
			{!isCollapsed && (
				<div className="pt-4 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center animate-in fade-in duration-200">
					{/* Left / Main text narrative (8 cols) */}
					<div className="lg:col-span-8 space-y-2.5">
						<div className="flex items-center space-x-2">
							<span
								className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${currentStory.badgeColor}`}
							>
								{currentStory.badge}
							</span>
							<span className="text-xs text-[var(--text-secondary)] italic">
								{currentStory.tagline}
							</span>
						</div>

						<p className="text-sm font-semibold text-[var(--text-primary)] leading-relaxed">
							{currentStory.highlight}
						</p>

						<p className="text-xs text-[var(--text-secondary)] leading-relaxed">
							{currentStory.content}
						</p>

						{currentStory.suggestion && (
							<div className="p-3 rounded-2xl bg-[var(--bg-card)]/70 border border-[var(--border-primary)] flex items-start space-x-2.5 text-xs text-[var(--text-primary)] mt-3">
								<Lightbulb
									size={16}
									className="text-amber-400 shrink-0 mt-0.5"
								/>
								<span className="leading-relaxed">
									{currentStory.suggestion}
								</span>
							</div>
						)}
					</div>

					{/* Right Action & Quick Filter Prompt (4 cols) */}
					<div className="lg:col-span-4 flex flex-col justify-center items-start lg:items-end border-t lg:border-t-0 lg:border-l border-[var(--border-primary)] pt-4 lg:pt-0 lg:pl-6 space-y-3">
						<div className="text-xs text-[var(--text-secondary)]">
							Khám phá ngay bộ lọc tương ứng:
						</div>

						{currentStory.actionStatus && onFilterStatus && (
							<button
								type="button"
								onClick={() =>
									onFilterStatus(currentStory.actionStatus || "completed")
								}
								className="inline-flex items-center space-x-2 px-4 py-2 rounded-2xl bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white font-bold text-xs shadow-md transition cursor-pointer"
							>
								<span>{currentStory.actionLabel}</span>
								<ArrowRight size={14} />
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default ReadingProgressStoryBanner;
