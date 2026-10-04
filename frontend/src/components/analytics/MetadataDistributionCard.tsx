import { BarChart3, PieChart as PieIcon } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface MetadataItem {
	name: string;
	value: number;
}

interface MetadataDistributionCardProps {
	title: string;
	subtitle?: string;
	data: MetadataItem[];
	colorMap?: Record<string, string>;
	defaultColor?: string;
	className?: string;
	onItemClick?: (name: string) => void;
}

export const MetadataDistributionCard: React.FC<
	MetadataDistributionCardProps
> = ({
	title,
	subtitle,
	data,
	colorMap = {},
	defaultColor = "#6B7280",
	className = "",
	onItemClick,
}) => {
	const [viewMode, setViewMode] = useState<"donut" | "bars">("donut");
	const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

	const activeItems = useMemo(() => data.filter((d) => d.value > 0), [data]);

	const totalVal = useMemo(
		() => activeItems.reduce((acc, d) => acc + d.value, 0),
		[activeItems],
	);

	const sortedItems = useMemo(
		() => [...activeItems].sort((a, b) => b.value - a.value),
		[activeItems],
	);

	const getColor = (name: string) => colorMap[name] || defaultColor;

	return (
		<div
			className={`bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 space-y-4 shadow-sm hover:shadow-md transition flex flex-col justify-between outline-none focus:outline-none focus:ring-0 [&_*]:focus:outline-none [&_.recharts-wrapper]:focus:outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:focus:outline-none [&_.recharts-surface]:outline-none ${className}`}
		>
			{/* Header with Title and Mode Switcher */}
			<div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
				<div>
					<h3 className="text-base font-bold text-[var(--text-primary)] font-spartan">
						{title}
					</h3>
					{subtitle && (
						<p className="text-[11px] text-[var(--text-secondary)]">
							{subtitle}
						</p>
					)}
				</div>

				<div className="flex items-center p-0.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] text-xs">
					<button
						type="button"
						onClick={() => setViewMode("donut")}
						className={`p-1.5 rounded-lg transition cursor-pointer ${
							viewMode === "donut"
								? "bg-[var(--bg-card)] text-[var(--brand-orange)] shadow-sm font-bold"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
						title="Biểu đồ tròn"
					>
						<PieIcon size={13} />
					</button>
					<button
						type="button"
						onClick={() => setViewMode("bars")}
						className={`p-1.5 rounded-lg transition cursor-pointer ${
							viewMode === "bars"
								? "bg-[var(--bg-card)] text-[var(--brand-orange)] shadow-sm font-bold"
								: "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						}`}
						title="Biểu đồ cột ngang"
					>
						<BarChart3 size={13} />
					</button>
				</div>
			</div>

			{/* Chart Area */}
			<div className="h-64 flex flex-col justify-center relative outline-none">
				{activeItems.length === 0 ? (
					<div className="flex h-full items-center justify-center text-[var(--text-secondary)] text-xs italic">
						Không có dữ liệu phù hợp.
					</div>
				) : viewMode === "donut" ? (
					<div className="h-44 w-full relative">
						<ResponsiveContainer width="100%" height="100%">
							<PieChart>
								<Pie
									data={activeItems}
									cx="50%"
									cy="50%"
									innerRadius={54}
									outerRadius={78}
									paddingAngle={3}
									dataKey="value"
									onMouseEnter={(_, idx) => setHoveredIdx(idx)}
									onMouseLeave={() => setHoveredIdx(null)}
									onClick={(entry) => entry?.name && onItemClick?.(entry.name)}
								>
									{activeItems.map((entry, idx) => (
										<Cell
											key={`meta-cell-${entry.name}`}
											fill={getColor(entry.name)}
											opacity={
												hoveredIdx === null || hoveredIdx === idx ? 1 : 0.35
											}
											style={{ cursor: "pointer", transition: "opacity 0.2s" }}
										/>
									))}
								</Pie>
								<Tooltip
									contentStyle={{
										backgroundColor: "var(--bg-card)",
										borderColor: "var(--border-primary)",
										color: "var(--text-primary)",
										borderRadius: "12px",
										fontSize: "12px",
										padding: "8px 12px",
									}}
									formatter={(val: any) => {
										const num =
											typeof val === "number" ? val : Number(val) || 0;
										const pct =
											totalVal > 0 ? ((num / totalVal) * 100).toFixed(1) : "0";
										return [`${num.toLocaleString()} (${pct}%)`, "Số lượng"];
									}}
								/>
							</PieChart>
						</ResponsiveContainer>

						{/* Center count in Donut */}
						<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
							<span className="text-xs font-bold text-[var(--text-primary)] font-mono">
								{hoveredIdx !== null && activeItems[hoveredIdx]
									? `${(
											(activeItems[hoveredIdx].value / totalVal) * 100
										).toFixed(0)}%`
									: `${totalVal}`}
							</span>
						</div>
					</div>
				) : (
					/* Bar view */
					<div className="h-48 w-full flex flex-col justify-center space-y-2 overflow-y-auto pr-1">
						{sortedItems.slice(0, 5).map((item) => {
							const pct = totalVal > 0 ? (item.value / totalVal) * 100 : 0;
							return (
								<div
									key={item.name}
									onClick={() => onItemClick?.(item.name)}
									className="p-1.5 rounded-lg hover:bg-[var(--bg-primary)] transition cursor-pointer text-xs space-y-1"
								>
									<div className="flex justify-between items-center text-[11px]">
										<span className="font-semibold text-[var(--text-primary)] truncate max-w-[130px]">
											{item.name}
										</span>
										<span className="font-mono text-[var(--text-secondary)]">
											{item.value.toLocaleString()} ({pct.toFixed(1)}%)
										</span>
									</div>
									<div className="h-1.5 w-full bg-[var(--border-primary)] rounded-full overflow-hidden">
										<div
											className="h-full rounded-full transition-all duration-300"
											style={{
												width: `${pct}%`,
												backgroundColor: getColor(item.name),
											}}
										/>
									</div>
								</div>
							);
						})}
					</div>
				)}

				{/* Legend at bottom with clean badges */}
				<div className="flex justify-center flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-semibold max-h-[70px] overflow-y-auto pt-2 border-t border-[var(--border-primary)]/40">
					{activeItems.map((item, idx) => {
						const percentage =
							totalVal > 0 ? ((item.value / totalVal) * 100).toFixed(1) : "0.0";
						const isHov = hoveredIdx === idx;
						return (
							<button
								key={item.name}
								type="button"
								onMouseEnter={() => setHoveredIdx(idx)}
								onMouseLeave={() => setHoveredIdx(null)}
								onClick={() => onItemClick?.(item.name)}
								className={`inline-flex items-center space-x-1.5 py-0.5 px-1.5 rounded-md transition cursor-pointer ${
									isHov
										? "bg-[var(--bg-primary)] ring-1 ring-[var(--brand-orange)]"
										: ""
								}`}
							>
								<span
									className="w-2 h-2 rounded-full shrink-0"
									style={{ backgroundColor: getColor(item.name) }}
								/>
								<span className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] truncate max-w-[110px]">
									{item.name} ({percentage}%)
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
};

export default MetadataDistributionCard;
