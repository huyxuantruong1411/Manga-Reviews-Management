import { AreaChart as AreaIcon, BarChart3, Layers, Star } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

export interface ScoreDistItem {
	score: number;
	count: number;
}

interface RatingDistributionCardProps {
	data: ScoreDistItem[];
	averageRating?: number;
	totalManga?: number;
	className?: string;
	onSelectScore?: (score: number) => void;
}

type RatingViewMode = "histogram" | "cumulative" | "tiers";

export const RatingDistributionCard: React.FC<RatingDistributionCardProps> = ({
	data,
	averageRating = 0,
	totalManga = 0,
	className = "",
	onSelectScore,
}) => {
	const [viewMode, setViewMode] = useState<RatingViewMode>("histogram");
	const [hoveredScore, setHoveredScore] = useState<number | null>(null);

	const ratedCount = useMemo(
		() => data.reduce((sum, item) => sum + item.count, 0),
		[data],
	);

	const unratedCount = Math.max(0, totalManga - ratedCount);

	// Find mode score (score with highest count)
	const modeItem = useMemo(() => {
		if (data.length === 0) return null;
		return [...data].sort((a, b) => b.count - a.count)[0];
	}, [data]);

	// High rated count (score >= 8)
	const highRatedCount = useMemo(() => {
		return data
			.filter((d) => d.score >= 8)
			.reduce((sum, d) => sum + d.count, 0);
	}, [data]);

	const highRatedPercent =
		ratedCount > 0 ? ((highRatedCount / ratedCount) * 100).toFixed(1) : "0";

	// Cumulative distribution data
	const cumulativeData = useMemo(() => {
		let runningTotal = 0;
		const sorted = [...data].sort((a, b) => a.score - b.score);
		return sorted.map((item) => {
			runningTotal += item.count;
			const pct =
				ratedCount > 0
					? Number(((runningTotal / ratedCount) * 100).toFixed(1))
					: 0;
			return {
				score: item.score,
				count: item.count,
				cumulativeCount: runningTotal,
				cumulativePercent: pct,
			};
		});
	}, [data, ratedCount]);

	// Tiers breakdown
	const tiersData = useMemo(() => {
		const tiers = [
			{ name: "Kiệt Tác (9.0 - 10★)", range: [9, 10], color: "#10B981" },
			{ name: "Xuất Sắc (8.0 - 8.5★)", range: [8, 8.5], color: "#3B82F6" },
			{ name: "Khá Tốt (7.0 - 7.5★)", range: [7, 7.5], color: "#F59E0B" },
			{ name: "Trung Bình (5.0 - 6.5★)", range: [5, 6.5], color: "#EC4899" },
			{ name: "Dưới Kỳ Vọng (< 5.0★)", range: [0, 4.5], color: "#EF4444" },
		];

		return tiers.map((tier) => {
			const count = data
				.filter((d) => d.score >= tier.range[0] && d.score <= tier.range[1])
				.reduce((acc, d) => acc + d.count, 0);
			const pct =
				ratedCount > 0 ? Number(((count / ratedCount) * 100).toFixed(1)) : 0;
			return {
				...tier,
				count,
				pct,
			};
		});
	}, [data, ratedCount]);

	return (
		<div
			className={`bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 sm:p-7 space-y-5 shadow-sm hover:shadow-md transition outline-none focus:outline-none focus:ring-0 [&_*]:focus:outline-none [&_.recharts-wrapper]:focus:outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:focus:outline-none [&_.recharts-surface]:outline-none ${className}`}
		>
			{/* Header with Mode Switcher */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-primary)] pb-4">
				<div className="flex items-center space-x-2.5">
					<div className="p-2 rounded-xl bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
						<Star size={20} />
					</div>
					<div>
						<h3 className="text-lg font-bold text-[var(--text-primary)] font-spartan">
							Phân Bố Điểm Đánh Giá (Rating Distribution)
						</h3>
						<p className="text-xs text-[var(--text-secondary)]">
							{ratedCount.toLocaleString()} manga đã chấm điểm (
							{averageRating.toFixed(1)}★ trung bình)
							{unratedCount > 0 &&
								` • ${unratedCount.toLocaleString()} chưa đánh giá`}
						</p>
					</div>
				</div>

				{/* Mode Tabs */}
				<div className="flex items-center p-1 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] text-xs font-semibold self-start sm:self-auto">
					<button
						type="button"
						onClick={() => setViewMode("histogram")}
						className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl transition cursor-pointer ${
							viewMode === "histogram"
								? "bg-[var(--bg-card)] text-[var(--brand-orange)] font-bold shadow-sm border border-[var(--border-primary)]"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
						title="Biểu đồ cột từng mức điểm"
					>
						<BarChart3 size={14} />
						<span>Cột Phân Bố</span>
					</button>

					<button
						type="button"
						onClick={() => setViewMode("cumulative")}
						className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl transition cursor-pointer ${
							viewMode === "cumulative"
								? "bg-[var(--bg-card)] text-[var(--brand-orange)] font-bold shadow-sm border border-[var(--border-primary)]"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
						title="Đường tích lũy phần trăm"
					>
						<AreaIcon size={14} />
						<span>Tích Lũy</span>
					</button>

					<button
						type="button"
						onClick={() => setViewMode("tiers")}
						className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl transition cursor-pointer ${
							viewMode === "tiers"
								? "bg-[var(--bg-card)] text-[var(--brand-orange)] font-bold shadow-sm border border-[var(--border-primary)]"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
						title="Phân hạng theo phân khúc chất lượng"
					>
						<Layers size={14} />
						<span>Phân Hạng</span>
					</button>
				</div>
			</div>

			{/* Main Chart Area */}
			<div className="h-72 w-full outline-none">
				{data.length === 0 ? (
					<div className="flex h-full items-center justify-center text-[var(--text-secondary)] text-sm">
						Chưa có dữ liệu đánh giá điểm số nào.
					</div>
				) : viewMode === "histogram" ? (
					/* 1. Histogram */
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={data}>
							<CartesianGrid
								strokeDasharray="3 3"
								vertical={false}
								opacity={0.3}
							/>
							<XAxis
								dataKey="score"
								tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
								axisLine={{ stroke: "var(--border-primary)" }}
							/>
							<YAxis
								allowDecimals={false}
								tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
								axisLine={{ stroke: "var(--border-primary)" }}
							/>
							<Tooltip
								contentStyle={{
									backgroundColor: "var(--bg-card)",
									borderColor: "var(--border-primary)",
									color: "var(--text-primary)",
									borderRadius: "14px",
									fontSize: "12px",
									boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
								}}
								formatter={(val: any, _name: any, item: any) => {
									const num = typeof val === "number" ? val : Number(val) || 0;
									const pct =
										ratedCount > 0
											? ((num / ratedCount) * 100).toFixed(1)
											: "0";
									return [
										`${num.toLocaleString()} manga (${pct}%)`,
										`Điểm ${item?.payload?.score}★`,
									];
								}}
							/>
							<Bar
								dataKey="count"
								radius={[6, 6, 0, 0]}
								onMouseEnter={(item: any) =>
									setHoveredScore(item?.score ?? null)
								}
								onMouseLeave={() => setHoveredScore(null)}
								onClick={(entry: any) =>
									entry?.score !== undefined && onSelectScore?.(entry.score)
								}
							>
								{data.map((entry) => (
									<Cell
										key={`score-bar-${entry.score}`}
										fill={
											entry.score >= 8
												? "var(--brand-orange)"
												: entry.score >= 6
													? "#F59E0B"
													: "#9CA3AF"
										}
										opacity={
											hoveredScore === null || hoveredScore === entry.score
												? 1
												: 0.4
										}
										style={{ cursor: "pointer", transition: "opacity 0.2s" }}
									/>
								))}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				) : viewMode === "cumulative" ? (
					/* 2. Cumulative Area Chart */
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart data={cumulativeData}>
							<defs>
								<linearGradient id="colorCum" x1="0" y1="0" x2="0" y2="1">
									<stop
										offset="5%"
										stopColor="var(--brand-orange)"
										stopOpacity={0.4}
									/>
									<stop
										offset="95%"
										stopColor="var(--brand-orange)"
										stopOpacity={0.0}
									/>
								</linearGradient>
							</defs>
							<CartesianGrid
								strokeDasharray="3 3"
								vertical={false}
								opacity={0.3}
							/>
							<XAxis
								dataKey="score"
								tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
								axisLine={{ stroke: "var(--border-primary)" }}
							/>
							<YAxis
								domain={[0, 100]}
								unit="%"
								tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
								axisLine={{ stroke: "var(--border-primary)" }}
							/>
							<Tooltip
								contentStyle={{
									backgroundColor: "var(--bg-card)",
									borderColor: "var(--border-primary)",
									color: "var(--text-primary)",
									borderRadius: "14px",
									fontSize: "12px",
								}}
								formatter={(val: any, _name: any, item: any) => {
									const p = typeof val === "number" ? val : Number(val) || 0;
									return [
										`${p}% tổng số (${item?.payload?.cumulativeCount || 0} manga ≤ ${item?.payload?.score}★)`,
										"Tỷ lệ tích lũy",
									];
								}}
							/>
							<Area
								type="monotone"
								dataKey="cumulativePercent"
								stroke="var(--brand-orange)"
								strokeWidth={3}
								fillOpacity={1}
								fill="url(#colorCum)"
							/>
						</AreaChart>
					</ResponsiveContainer>
				) : (
					/* 3. Tiers View */
					<div className="h-full flex flex-col justify-center space-y-3 px-2 overflow-y-auto">
						{tiersData.map((tier) => (
							<div
								key={tier.name}
								className="p-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] space-y-1.5"
							>
								<div className="flex justify-between items-center text-xs">
									<div className="flex items-center space-x-2">
										<span
											className="w-2.5 h-2.5 rounded-full"
											style={{ backgroundColor: tier.color }}
										/>
										<span className="font-bold text-[var(--text-primary)]">
											{tier.name}
										</span>
									</div>
									<div className="flex items-center space-x-2 font-mono">
										<span className="font-bold text-[var(--text-primary)]">
											{tier.count.toLocaleString()} bộ
										</span>
										<span className="text-[var(--text-secondary)] font-semibold w-12 text-right">
											{tier.pct}%
										</span>
									</div>
								</div>

								<div className="h-2 w-full rounded-full bg-[var(--border-primary)] overflow-hidden">
									<div
										className="h-full rounded-full transition-all duration-500"
										style={{
											width: `${tier.pct}%`,
											backgroundColor: tier.color,
										}}
									/>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Bottom Statistical Highlights Pill */}
			<div className="pt-3 border-t border-[var(--border-primary)] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
				<div className="p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)]">
					<div className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">
						Điểm Trung Bình
					</div>
					<div className="text-base font-black text-[var(--text-primary)] font-mono">
						{averageRating.toFixed(2)}★
					</div>
				</div>

				<div className="p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)]">
					<div className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">
						Điểm Phổ Biến Nhất
					</div>
					<div className="text-base font-black text-[var(--brand-orange)] font-mono">
						{modeItem ? `${modeItem.score}★ (${modeItem.count})` : "N/A"}
					</div>
				</div>

				<div className="p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)]">
					<div className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">
						Tỷ Lệ Xuất Sắc (≥ 8★)
					</div>
					<div className="text-base font-black text-emerald-400 font-mono">
						{highRatedPercent}% ({highRatedCount})
					</div>
				</div>

				<div className="p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)]">
					<div className="text-[10px] uppercase font-bold text-[var(--text-secondary)]">
						Độ Phủ Chấm Điểm
					</div>
					<div className="text-base font-black text-purple-300 font-mono">
						{totalManga > 0
							? `${((ratedCount / totalManga) * 100).toFixed(0)}%`
							: "0%"}
					</div>
				</div>
			</div>
		</div>
	);
};

export default RatingDistributionCard;
