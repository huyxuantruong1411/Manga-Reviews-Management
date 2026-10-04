import {
	BarChart3,
	CheckCircle2,
	Compass,
	Layers,
	PieChart as PieIcon,
	Sparkles,
	TrendingUp,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface StatusDistributionItem {
	name: string;
	value: number;
	color: string;
	rawStatus?: string;
}

interface ReadStatusDistributionCardProps {
	data: StatusDistributionItem[];
	totalManga?: number;
	onSelectStatus?: (status: string) => void;
	className?: string;
}

type ViewMode = "donut" | "bars" | "funnel" | "strip";

const VIETNAMESE_LABELS: Record<string, string> = {
	Unread: "Chưa đọc",
	Reading: "Đang đọc",
	Completed: "Đã hoàn thành",
	Dropped: "Bỏ dở",
	"On Hold": "Tạm dừng",
	"Plan to Read": "Kế hoạch đọc",
	"Re-reading": "Đang đọc lại",
};

export const ReadStatusDistributionCard: React.FC<
	ReadStatusDistributionCardProps
> = ({ data, totalManga, onSelectStatus, className = "" }) => {
	const [viewMode, setViewMode] = useState<ViewMode>("donut");
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

	const totalVal = useMemo(() => {
		if (totalManga && totalManga > 0) return totalManga;
		return data.reduce((sum, item) => sum + item.value, 0);
	}, [data, totalManga]);

	// Sorted data for ranked bars
	const sortedData = useMemo(() => {
		return [...data].sort((a, b) => b.value - a.value);
	}, [data]);

	// Highlight stats for reading funnel
	const funnelStats = useMemo(() => {
		const getVal = (name: string) =>
			data.find((d) => d.name.toLowerCase() === name.toLowerCase())?.value || 0;

		const completed = getVal("Completed");
		const reading = getVal("Reading") + getVal("Re-reading");
		const onHold = getVal("On Hold");
		const dropped = getVal("Dropped");
		const unread = getVal("Unread");
		const planToRead = getVal("Plan to Read");

		const engaged = completed + reading + onHold + dropped;
		const backlog = unread + planToRead;

		const completionRate =
			totalVal > 0 ? ((completed / totalVal) * 100).toFixed(1) : "0.0";
		const engagementRate =
			totalVal > 0 ? ((engaged / totalVal) * 100).toFixed(1) : "0.0";
		const backlogRate =
			totalVal > 0 ? ((backlog / totalVal) * 100).toFixed(1) : "0.0";
		const retentionRate =
			engaged > 0 ? ((completed / engaged) * 100).toFixed(1) : "0.0";

		return {
			completed,
			reading,
			backlog,
			engaged,
			dropped,
			onHold,
			completionRate,
			engagementRate,
			backlogRate,
			retentionRate,
		};
	}, [data, totalVal]);

	// Active slice for center Donut HUD
	const activeItem = useMemo(() => {
		if (hoveredIndex !== null && data[hoveredIndex]) {
			const item = data[hoveredIndex];
			const pct =
				totalVal > 0 ? ((item.value / totalVal) * 100).toFixed(1) : "0.0";
			return {
				name: item.name,
				viName: VIETNAMESE_LABELS[item.name] || item.name,
				value: item.value,
				percentage: pct,
				color: item.color,
			};
		}
		return null;
	}, [hoveredIndex, data, totalVal]);

	return (
		<div
			className={`bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 sm:p-7 space-y-6 shadow-sm hover:shadow-md transition-all duration-200 outline-none focus:outline-none focus:ring-0 [&_*]:focus:outline-none [&_.recharts-wrapper]:focus:outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:focus:outline-none [&_.recharts-surface]:outline-none ${className}`}
		>
			{/* Top Header: Title & Visualization Mode Switcher */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-primary)] pb-4">
				<div>
					<div className="flex items-center space-x-2.5">
						<div className="p-2 rounded-xl bg-orange-500/10 text-[var(--brand-orange)] border border-orange-500/20">
							<Compass size={20} />
						</div>
						<div>
							<h3 className="text-lg font-bold text-[var(--text-primary)] font-spartan tracking-tight">
								Phân Bố Trạng Thái Đọc
							</h3>
							<p className="text-xs text-[var(--text-secondary)]">
								{totalVal.toLocaleString()} manga trong bộ sưu tập • Tỷ lệ hoàn
								thành {funnelStats.completionRate}%
							</p>
						</div>
					</div>
				</div>

				{/* Visual Mode Selector Tabs */}
				<div className="flex items-center p-1 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] self-start sm:self-auto shadow-inner text-xs font-medium">
					<button
						type="button"
						onClick={() => setViewMode("donut")}
						className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl transition cursor-pointer ${
							viewMode === "donut"
								? "bg-[var(--bg-card)] text-[var(--brand-orange)] font-bold shadow-sm border border-[var(--border-primary)]"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
						title="Biểu đồ vành khuyên (Donut Chart)"
					>
						<PieIcon size={14} />
						<span className="hidden md:inline">Vành khuyên</span>
					</button>

					<button
						type="button"
						onClick={() => setViewMode("bars")}
						className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl transition cursor-pointer ${
							viewMode === "bars"
								? "bg-[var(--bg-card)] text-[var(--brand-orange)] font-bold shadow-sm border border-[var(--border-primary)]"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
						title="Biểu đồ cột ngang xếp hạng (Ranked Bars)"
					>
						<BarChart3 size={14} />
						<span className="hidden md:inline">Xếp hạng</span>
					</button>

					<button
						type="button"
						onClick={() => setViewMode("funnel")}
						className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl transition cursor-pointer ${
							viewMode === "funnel"
								? "bg-[var(--bg-card)] text-[var(--brand-orange)] font-bold shadow-sm border border-[var(--border-primary)]"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
						title="Phễu hành trình đọc (Reading Funnel)"
					>
						<TrendingUp size={14} />
						<span className="hidden md:inline">Hành trình</span>
					</button>

					<button
						type="button"
						onClick={() => setViewMode("strip")}
						className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl transition cursor-pointer ${
							viewMode === "strip"
								? "bg-[var(--bg-card)] text-[var(--brand-orange)] font-bold shadow-sm border border-[var(--border-primary)]"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
						title="Dải tỷ trọng liên tục (Segmented Strip)"
					>
						<Layers size={14} />
						<span className="hidden md:inline">Tỷ trọng</span>
					</button>
				</div>
			</div>

			{/* Main 2-Column Body: Chart (Left ~62%) & Legend/Insights (Right ~38%) */}
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
				{/* LEFT: Chart Representation (7 columns on desktop) */}
				<div className="lg:col-span-7 xl:col-span-7 h-[340px] flex items-center justify-center relative overflow-hidden select-none outline-none focus:outline-none">
					{data.length === 0 ? (
						<div className="flex h-full items-center justify-center text-[var(--text-secondary)] text-sm">
							Chưa có dữ liệu trạng thái đọc.
						</div>
					) : viewMode === "donut" ? (
						/* VIEW 1: ENLARGED DONUT CHART WITH CENTRAL HUD METRIC */
						<div className="w-full h-full relative flex items-center justify-center outline-none">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie
										data={data}
										cx="50%"
										cy="50%"
										innerRadius={78}
										outerRadius={122}
										paddingAngle={3.5}
										dataKey="value"
										animationDuration={800}
										animationEasing="ease-out"
										stroke="var(--bg-card)"
										strokeWidth={3}
										onMouseEnter={(_, index) => setHoveredIndex(index)}
										onMouseLeave={() => setHoveredIndex(null)}
										onClick={(entry) => {
											if (onSelectStatus && entry?.name) {
												onSelectStatus(entry.name);
											}
										}}
									>
										{data.map((entry, index) => (
											<Cell
												key={`cell-donut-${entry.name}`}
												fill={entry.color}
												opacity={
													hoveredIndex === null || hoveredIndex === index
														? 1
														: 0.35
												}
												style={{
													transition: "opacity 0.25s ease, transform 0.2s ease",
													cursor: "pointer",
												}}
											/>
										))}
									</Pie>
									<Tooltip
										contentStyle={{
											backgroundColor: "var(--bg-card)",
											borderColor: "var(--border-primary)",
											color: "var(--text-primary)",
											borderRadius: "16px",
											fontSize: "12px",
											padding: "10px 14px",
											boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
										}}
										itemStyle={{ color: "var(--text-primary)" }}
										formatter={(val: any, name: any) => {
											const numericVal =
												typeof val === "number" ? val : Number(val) || 0;
											const pct =
												totalVal > 0
													? ((numericVal / totalVal) * 100).toFixed(1)
													: "0.0";
											const label = String(name || "");
											const vi = VIETNAMESE_LABELS[label] || label;
											return [
												`${numericVal.toLocaleString()} manga (${pct}%)`,
												vi,
											];
										}}
									/>
								</PieChart>
							</ResponsiveContainer>

							{/* Center HUD Info Card inside Donut Hole */}
							<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
								<div className="flex flex-col items-center justify-center text-center p-3 rounded-full w-36 h-36 bg-[var(--bg-card)]/80 backdrop-blur-sm border border-[var(--border-primary)] shadow-sm animate-in fade-in zoom-in-95 duration-200">
									{activeItem ? (
										<>
											<span
												className="w-2.5 h-2.5 rounded-full mb-1"
												style={{ backgroundColor: activeItem.color }}
											/>
											<span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[120px]">
												{activeItem.viName}
											</span>
											<span className="text-xl font-black font-spartan text-[var(--text-primary)]">
												{activeItem.value.toLocaleString()}
											</span>
											<span className="text-[11px] font-semibold text-[var(--brand-orange)]">
												{activeItem.percentage}%
											</span>
										</>
									) : (
										<>
											<span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--text-secondary)]">
												Tổng Manga
											</span>
											<span className="text-2xl font-black font-spartan text-[var(--text-primary)]">
												{totalVal.toLocaleString()}
											</span>
											<span className="px-2 py-0.5 mt-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-500 border border-green-500/20">
												{funnelStats.completionRate}% hoàn thành
											</span>
										</>
									)}
								</div>
							</div>
						</div>
					) : viewMode === "bars" ? (
						/* VIEW 2: RANKED HORIZONTAL BARS */
						<div className="w-full h-full flex flex-col justify-start py-1 space-y-2.5 px-2 overflow-y-auto">
							{sortedData.map((item, idx) => {
								const pct = totalVal > 0 ? (item.value / totalVal) * 100 : 0;
								const viName = VIETNAMESE_LABELS[item.name] || item.name;
								const isHovered = hoveredIndex === idx;

								return (
									<div
										key={item.name}
										onMouseEnter={() => setHoveredIndex(idx)}
										onMouseLeave={() => setHoveredIndex(null)}
										onClick={() => onSelectStatus?.(item.name)}
										className={`p-2.5 rounded-2xl transition cursor-pointer border ${
											isHovered
												? "bg-[var(--bg-primary)] border-[var(--brand-orange)] shadow-sm"
												: "border-transparent hover:border-[var(--border-primary)]"
										}`}
									>
										<div className="flex items-center justify-between text-xs mb-1.5">
											<div className="flex items-center space-x-2">
												<span className="w-5 text-[11px] font-mono font-bold text-[var(--text-secondary)]">
													#{idx + 1}
												</span>
												<span
													className="w-2.5 h-2.5 rounded-full shrink-0"
													style={{ backgroundColor: item.color }}
												/>
												<span className="font-bold text-[var(--text-primary)]">
													{viName}
												</span>
												<span className="text-[11px] text-[var(--text-secondary)] hidden sm:inline">
													({item.name})
												</span>
											</div>
											<div className="flex items-center space-x-2 font-mono">
												<span className="font-bold text-[var(--text-primary)]">
													{item.value.toLocaleString()}
												</span>
												<span className="text-xs text-[var(--text-secondary)] w-12 text-right">
													{pct.toFixed(1)}%
												</span>
											</div>
										</div>

										{/* Progress track */}
										<div className="h-2 w-full rounded-full bg-[var(--border-primary)] overflow-hidden">
											<div
												className="h-full rounded-full transition-all duration-500 ease-out"
												style={{
													width: `${pct}%`,
													backgroundColor: item.color,
												}}
											/>
										</div>
									</div>
								);
							})}
						</div>
					) : viewMode === "funnel" ? (
						/* VIEW 3: READING JOURNEY FUNNEL & CONVERSION PIPELINE */
						<div className="w-full h-full flex flex-col justify-center space-y-3 px-2 py-1">
							{/* Step 1: Total Catalog */}
							<div className="p-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] flex items-center justify-between">
								<div className="flex items-center space-x-3">
									<div className="w-8 h-8 rounded-xl bg-orange-500/10 text-[var(--brand-orange)] flex items-center justify-center font-bold text-xs">
										1
									</div>
									<div>
										<div className="text-xs font-bold text-[var(--text-primary)]">
											Tổng Bộ Sưu Tập (Total Catalog)
										</div>
										<div className="text-[11px] text-[var(--text-secondary)]">
											Toàn bộ tác phẩm đã nhập vào hệ thống
										</div>
									</div>
								</div>
								<div className="text-right font-mono">
									<div className="text-sm font-bold text-[var(--text-primary)]">
										{totalVal.toLocaleString()}
									</div>
									<div className="text-[10px] text-[var(--brand-orange)] font-bold">
										100%
									</div>
								</div>
							</div>

							{/* Step 2: Engaged */}
							<div className="p-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] flex items-center justify-between ml-3 sm:ml-5">
								<div className="flex items-center space-x-3">
									<div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-xs">
										2
									</div>
									<div>
										<div className="text-xs font-bold text-[var(--text-primary)]">
											Đã Khởi Động Đọc (Engaged)
										</div>
										<div className="text-[11px] text-[var(--text-secondary)]">
											Đang đọc + Hoàn thành + Tạm dừng + Bỏ dở
										</div>
									</div>
								</div>
								<div className="text-right font-mono">
									<div className="text-sm font-bold text-[var(--text-primary)]">
										{funnelStats.engaged.toLocaleString()}
									</div>
									<div className="text-[10px] text-blue-500 font-bold">
										{funnelStats.engagementRate}% thư viện
									</div>
								</div>
							</div>

							{/* Step 3: Finished */}
							<div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between ml-6 sm:ml-10">
								<div className="flex items-center space-x-3">
									<div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-xs">
										<CheckCircle2 size={16} />
									</div>
									<div>
										<div className="text-xs font-bold text-emerald-400">
											Đã Hoàn Thành (Finished Milestones)
										</div>
										<div className="text-[11px] text-emerald-500/80">
											Tỷ lệ giữ chân người đọc: {funnelStats.retentionRate}% đã
											bắt đầu là đọc xong
										</div>
									</div>
								</div>
								<div className="text-right font-mono">
									<div className="text-sm font-bold text-emerald-400">
										{funnelStats.completed.toLocaleString()}
									</div>
									<div className="text-[10px] text-emerald-400 font-bold">
										{funnelStats.completionRate}%
									</div>
								</div>
							</div>

							{/* Backlog Alert */}
							<div className="px-3 py-2 rounded-xl bg-purple-500/5 border border-purple-500/20 flex items-center justify-between text-xs">
								<span className="text-[var(--text-secondary)]">
									📦 Hàng đợi (Backlog chưa đọc + Plan):{" "}
									<strong className="text-purple-400 font-mono">
										{funnelStats.backlog.toLocaleString()} bộ
									</strong>
								</span>
								<span className="font-mono text-purple-400 font-bold">
									{funnelStats.backlogRate}%
								</span>
							</div>
						</div>
					) : (
						/* VIEW 4: SEGMENTED 100% STRIP */
						<div className="w-full h-full flex flex-col justify-center space-y-6 px-4">
							<div>
								<div className="flex justify-between items-center text-xs font-semibold text-[var(--text-secondary)] mb-2">
									<span>Thanh Phân Bổ Tỷ Trọng Liền Mạch (100%)</span>
									<span className="font-mono">
										{totalVal.toLocaleString()} manga
									</span>
								</div>

								{/* Segmented Ribbon */}
								<div className="h-8 w-full rounded-2xl overflow-hidden flex shadow-inner border border-[var(--border-primary)] p-0.5 bg-[var(--bg-primary)]">
									{data.map((item) => {
										const pct =
											totalVal > 0 ? (item.value / totalVal) * 100 : 0;
										if (pct <= 0) return null;
										return (
											<div
												key={item.name}
												style={{
													width: `${pct}%`,
													backgroundColor: item.color,
												}}
												title={`${VIETNAMESE_LABELS[item.name] || item.name}: ${item.value} (${pct.toFixed(1)}%)`}
												className="h-full first:rounded-l-xl last:rounded-r-xl transition-all duration-300 hover:brightness-125 cursor-pointer relative group"
											/>
										);
									})}
								</div>
							</div>

							{/* Metric Chips Matrix */}
							<div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
								{data.map((item) => {
									const pct =
										totalVal > 0
											? ((item.value / totalVal) * 100).toFixed(1)
											: "0.0";
									return (
										<div
											key={item.name}
											className="p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] flex items-center justify-between"
										>
											<div className="flex items-center space-x-1.5 min-w-0">
												<span
													className="w-2.5 h-2.5 rounded-full shrink-0"
													style={{ backgroundColor: item.color }}
												/>
												<span className="text-xs font-medium text-[var(--text-primary)] truncate">
													{VIETNAMESE_LABELS[item.name] || item.name}
												</span>
											</div>
											<span className="text-xs font-mono font-bold text-[var(--text-secondary)] shrink-0 ml-1">
												{pct}%
											</span>
										</div>
									);
								})}
							</div>
						</div>
					)}
				</div>

				{/* RIGHT: DEDICATED LEGEND & DETAILED BREAKDOWN (5 columns on desktop) */}
				<div className="lg:col-span-5 xl:col-span-5 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-[var(--border-primary)] pt-6 lg:pt-0 lg:pl-8 space-y-4">
					<div>
						<div className="flex items-center justify-between mb-3">
							<span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
								Chi Tiết Trạng Thái
							</span>
							<span className="text-xs text-[var(--text-secondary)] font-mono">
								Số lượng • Tỷ lệ
							</span>
						</div>

						{/* Legend List */}
						<div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
							{data.map((item, idx) => {
								const percentage =
									totalVal > 0
										? ((item.value / totalVal) * 100).toFixed(1)
										: "0.0";
								const viLabel = VIETNAMESE_LABELS[item.name] || item.name;
								const isSelected = hoveredIndex === idx;

								return (
									<div
										key={item.name}
										onMouseEnter={() => setHoveredIndex(idx)}
										onMouseLeave={() => setHoveredIndex(null)}
										onClick={() => onSelectStatus?.(item.name)}
										className={`p-2 rounded-xl transition cursor-pointer border ${
											isSelected
												? "bg-[var(--bg-primary)] border-[var(--brand-orange)] shadow-sm"
												: "border-transparent hover:bg-[var(--bg-primary)]/50"
										}`}
									>
										<div className="flex items-center justify-between text-xs mb-1">
											<div className="flex items-center space-x-2 min-w-0">
												<span
													className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
													style={{ backgroundColor: item.color }}
												/>
												<span className="font-semibold text-[var(--text-primary)] truncate">
													{viLabel}
												</span>
												<span className="text-[10px] text-[var(--text-secondary)] hidden sm:inline">
													({item.name})
												</span>
											</div>

											<div className="flex items-center space-x-2 font-mono shrink-0 ml-2">
												<span className="font-bold text-[var(--text-primary)]">
													{item.value.toLocaleString()}
												</span>
												<span className="text-[11px] text-[var(--text-secondary)] w-10 text-right">
													{percentage}%
												</span>
											</div>
										</div>

										{/* Micro progress bar */}
										<div className="h-1.5 w-full bg-[var(--border-primary)] rounded-full overflow-hidden">
											<div
												className="h-full rounded-full transition-all duration-300"
												style={{
													width: `${percentage}%`,
													backgroundColor: item.color,
												}}
											/>
										</div>
									</div>
								);
							})}
						</div>
					</div>

					{/* Story Callout Pill at Bottom of Legend */}
					<div className="p-3.5 rounded-2xl bg-orange-500/5 border border-orange-500/20 text-xs text-[var(--text-primary)] space-y-1">
						<div className="flex items-center space-x-1.5 text-[var(--brand-orange)] font-bold">
							<Sparkles size={14} />
							<span>Insight Hành Trình</span>
						</div>
						<p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
							Đã về đích{" "}
							<strong className="text-[var(--text-primary)] font-mono">
								{funnelStats.completed.toLocaleString()}
							</strong>{" "}
							bộ ({funnelStats.completionRate}%). Kho hàng đợi còn{" "}
							<strong className="text-[var(--text-primary)] font-mono">
								{funnelStats.backlog.toLocaleString()}
							</strong>{" "}
							bộ ({funnelStats.backlogRate}%).
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ReadStatusDistributionCard;
