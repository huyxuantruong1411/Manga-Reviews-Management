import type React from "react";
import { Skeleton } from "../ui/skeleton";
import { LoadingRegion } from "./LoadingRegion";

/**
 * Standard page title and subtitle skeleton
 */
export const PageHeaderSkeleton: React.FC<{ hasAction?: boolean }> = ({
	hasAction = false,
}) => (
	<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
		<div className="space-y-2">
			<Skeleton className="h-8 sm:h-9 w-48 sm:w-72 rounded-xl" />
			<Skeleton className="h-4 w-64 sm:w-96 rounded-md" />
		</div>
		{hasAction && <Skeleton className="h-10 w-32 rounded-xl shrink-0" />}
	</div>
);

/**
 * Manga card skeleton for grid view (3/4 aspect ratio)
 */
export const MangaCardSkeleton: React.FC = () => (
	<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl overflow-hidden shadow-xs flex flex-col">
		<Skeleton className="aspect-[3/4] w-full rounded-none" />
		<div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
			<div className="space-y-2">
				<Skeleton className="h-4 w-4/5 rounded" />
				<Skeleton className="h-3 w-1/2 rounded" />
			</div>
			<div className="flex items-center justify-between pt-1">
				<Skeleton className="h-6 w-20 rounded-full" />
				<Skeleton className="h-5 w-12 rounded-md" />
			</div>
		</div>
	</div>
);

/**
 * Responsive grid of manga cards (default 8 slots)
 */
export const MangaGridSkeleton: React.FC<{
	count?: number;
	label?: string;
}> = ({ count = 8, label = "Đang tải danh sách manga..." }) => {
	const items = Array.from({ length: count }, (_, i) => `skel-manga-card-${i}`);
	return (
		<LoadingRegion label={label}>
			<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
				{items.map((key) => (
					<MangaCardSkeleton key={key} />
				))}
			</div>
		</LoadingRegion>
	);
};

/**
 * Row skeleton for list view mode
 */
export const MangaListRowsSkeleton: React.FC<{
	count?: number;
	label?: string;
}> = ({ count = 6, label = "Đang tải danh sách manga..." }) => {
	const items = Array.from({ length: count }, (_, i) => `skel-manga-row-${i}`);
	return (
		<LoadingRegion label={label}>
			<div className="space-y-3">
				{items.map((key) => (
					<div
						key={key}
						className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4 flex items-center justify-between gap-4"
					>
						<div className="flex items-center gap-4 min-w-0 flex-1">
							<Skeleton className="w-12 h-16 rounded-lg shrink-0" />
							<div className="space-y-2 min-w-0 flex-1">
								<Skeleton className="h-4 w-1/2 rounded" />
								<Skeleton className="h-3 w-1/3 rounded" />
							</div>
						</div>
						<div className="flex items-center gap-3 shrink-0">
							<Skeleton className="h-6 w-20 rounded-full" />
							<Skeleton className="h-5 w-10 rounded" />
						</div>
					</div>
				))}
			</div>
		</LoadingRegion>
	);
};

/**
 * Detailed card skeleton for detailed view mode
 */
export const MangaDetailedCardsSkeleton: React.FC<{
	count?: number;
	label?: string;
}> = ({ count = 4, label = "Đang tải danh sách manga..." }) => {
	const items = Array.from(
		{ length: count },
		(_, i) => `skel-manga-detailed-${i}`,
	);
	return (
		<LoadingRegion label={label}>
			<div className="space-y-4">
				{items.map((key) => (
					<div
						key={key}
						className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 flex flex-col sm:flex-row gap-5"
					>
						<Skeleton className="w-28 sm:w-36 aspect-[3/4] rounded-xl shrink-0 self-center sm:self-start" />
						<div className="flex-1 space-y-3 min-w-0">
							<div className="flex justify-between items-start gap-4">
								<div className="space-y-1.5 flex-1">
									<Skeleton className="h-5 w-2/3 rounded-lg" />
									<Skeleton className="h-3.5 w-1/3 rounded" />
								</div>
								<Skeleton className="h-6 w-16 rounded-full shrink-0" />
							</div>
							<div className="space-y-1.5 pt-2">
								<Skeleton className="h-3 w-full rounded" />
								<Skeleton className="h-3 w-5/6 rounded" />
								<Skeleton className="h-3 w-3/4 rounded" />
							</div>
							<div className="flex gap-2 pt-2">
								<Skeleton className="h-5 w-14 rounded-md" />
								<Skeleton className="h-5 w-16 rounded-md" />
								<Skeleton className="h-5 w-12 rounded-md" />
							</div>
						</div>
					</div>
				))}
			</div>
		</LoadingRegion>
	);
};

/**
 * Full page detail skeleton for /manga/:id
 */
export const MangaDetailSkeleton: React.FC<{ label?: string }> = ({
	label = "Đang tải thông tin chi tiết manga...",
}) => (
	<LoadingRegion label={label} className="w-full space-y-8 font-poppins">
		{/* Hero / Header Card */}
		<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row gap-8 shadow-sm">
			<Skeleton className="w-48 sm:w-64 aspect-[3/4] rounded-2xl mx-auto md:mx-0 shrink-0 shadow-md" />
			<div className="flex-1 space-y-4 min-w-0">
				<div className="space-y-2">
					<Skeleton className="h-8 sm:h-10 w-3/4 rounded-xl" />
					<Skeleton className="h-4 sm:h-5 w-1/3 rounded-md" />
				</div>
				<div className="flex flex-wrap gap-2 pt-1">
					<Skeleton className="h-6 w-20 rounded-full" />
					<Skeleton className="h-6 w-24 rounded-full" />
					<Skeleton className="h-6 w-16 rounded-full" />
				</div>
				<div className="space-y-2 pt-3 border-t border-[var(--border-primary)]">
					<Skeleton className="h-3.5 w-full rounded" />
					<Skeleton className="h-3.5 w-11/12 rounded" />
					<Skeleton className="h-3.5 w-4/5 rounded" />
				</div>
				<div className="flex gap-3 pt-4">
					<Skeleton className="h-10 w-32 rounded-xl" />
					<Skeleton className="h-10 w-28 rounded-xl" />
					<Skeleton className="h-10 w-28 rounded-xl" />
				</div>
			</div>
		</div>

		{/* Sections / Chapters placeholder */}
		<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 sm:p-8 space-y-4">
			<div className="flex justify-between items-center pb-4 border-b border-[var(--border-primary)]">
				<Skeleton className="h-6 w-40 rounded-lg" />
				<Skeleton className="h-8 w-24 rounded-xl" />
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
				{Array.from({ length: 6 }, (_, i) => `skel-chap-${i}`).map((k) => (
					<Skeleton key={k} className="h-14 rounded-2xl" />
				))}
			</div>
		</div>
	</LoadingRegion>
);

/**
 * Author profile skeleton for /author/:name
 */
export const AuthorDetailSkeleton: React.FC<{ label?: string }> = ({
	label = "Đang tải thông tin tác giả...",
}) => (
	<LoadingRegion label={label} className="w-full space-y-8 font-poppins">
		{/* Profile Header */}
		<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6 shadow-sm">
			<Skeleton className="w-24 h-24 rounded-full shrink-0" />
			<div className="flex-1 space-y-2 text-center md:text-left">
				<Skeleton className="h-8 w-56 rounded-xl mx-auto md:mx-0" />
				<Skeleton className="h-4 w-36 rounded-md mx-auto md:mx-0" />
				<div className="flex gap-2 justify-center md:justify-start pt-2">
					<Skeleton className="h-6 w-20 rounded-full" />
					<Skeleton className="h-6 w-24 rounded-full" />
				</div>
			</div>
		</div>

		{/* Manga Works Grid */}
		<div className="space-y-4">
			<Skeleton className="h-6 w-48 rounded-lg" />
			<MangaGridSkeleton count={4} />
		</div>
	</LoadingRegion>
);

/**
 * Stat Card skeleton for analytics / audit dashboards
 */
export const StatCardSkeleton: React.FC = () => (
	<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 space-y-3">
		<div className="flex items-center justify-between">
			<Skeleton className="h-4 w-28 rounded" />
			<Skeleton className="h-8 w-8 rounded-xl" />
		</div>
		<Skeleton className="h-7 w-20 rounded-lg" />
		<Skeleton className="h-3 w-32 rounded" />
	</div>
);

/**
 * Chart panel skeleton for dashboard visualization cards
 */
export const ChartPanelSkeleton: React.FC<{
	height?: string;
	label?: string;
}> = ({
	height = "h-72",
	label = "Đang phân tích và dựng biểu đồ dữ liệu...",
}) => (
	<LoadingRegion label={label}>
		<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 space-y-4">
			<div className="flex justify-between items-center">
				<Skeleton className="h-5 w-44 rounded" />
				<Skeleton className="h-4 w-24 rounded" />
			</div>
			<div
				className={`w-full ${height} rounded-xl bg-muted/40 flex items-end p-4 gap-3`}
			>
				{Array.from({ length: 8 }, (_, i) => `skel-bar-${i}`).map((k, idx) => (
					<Skeleton
						key={k}
						className="flex-1 rounded-t-md"
						style={{ height: `${25 + ((idx * 17) % 65)}%` }}
					/>
				))}
			</div>
		</div>
	</LoadingRegion>
);

/**
 * Table rows skeleton for logs, candidates, task managers
 */
export const TableRowsSkeleton: React.FC<{
	rows?: number;
	cols?: number;
	label?: string;
}> = ({ rows = 5, cols = 5, label = "Đang tải danh sách dữ liệu bảng..." }) => {
	const rowKeys = Array.from({ length: rows }, (_, i) => `skel-row-${i}`);
	const colKeys = Array.from({ length: cols }, (_, i) => `skel-col-${i}`);
	return (
		<LoadingRegion label={label}>
			<div className="w-full space-y-2">
				{rowKeys.map((rKey) => (
					<div
						key={rKey}
						className="flex items-center gap-4 p-3 bg-[var(--bg-card)]/50 border border-[var(--border-primary)]/60 rounded-xl"
					>
						{colKeys.map((cKey, idx) => (
							<Skeleton
								key={cKey}
								className={`h-4 rounded ${
									idx === 0
										? "w-28 shrink-0"
										: idx === cols - 1
											? "w-16 ml-auto shrink-0"
											: "flex-1"
								}`}
							/>
						))}
					</div>
				))}
			</div>
		</LoadingRegion>
	);
};

/**
 * Fullscreen reader loading placeholder (route fallback & chapter transitions)
 */
export const ReaderPageSkeleton: React.FC<{ label?: string }> = ({
	label = "Đang khởi tạo trình đọc truyện...",
}) => (
	<LoadingRegion label={label}>
		<div className="fixed inset-0 z-50 bg-black flex flex-col select-none">
			{/* Top Reader Navbar */}
			<div className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 shrink-0">
				<div className="flex items-center gap-3">
					<Skeleton className="h-8 w-8 rounded-xl bg-zinc-800" />
					<div className="space-y-1">
						<Skeleton className="h-3.5 w-36 rounded bg-zinc-800" />
						<Skeleton className="h-2.5 w-24 rounded bg-zinc-800/60" />
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Skeleton className="h-8 w-20 rounded-xl bg-zinc-800" />
					<Skeleton className="h-8 w-8 rounded-xl bg-zinc-800" />
					<Skeleton className="h-8 w-8 rounded-xl bg-zinc-800" />
				</div>
			</div>

			{/* Main Reading Viewport with aspect ratio image placeholder */}
			<div className="flex-1 overflow-hidden flex items-center justify-center p-4">
				<div className="relative w-full max-w-2xl aspect-[2/3] max-h-[82vh] bg-zinc-900/60 rounded-xl border border-zinc-800/80 shadow-2xl flex flex-col items-center justify-center space-y-3">
					<Skeleton className="w-16 h-16 rounded-full bg-zinc-800" />
					<Skeleton className="h-4 w-44 rounded bg-zinc-800" />
					<Skeleton className="h-3 w-28 rounded bg-zinc-800/60" />
				</div>
			</div>
		</div>
	</LoadingRegion>
);

/**
 * Default nested route fallback for the Layout shell
 */
export const DefaultPageSkeleton: React.FC<{ label?: string }> = ({
	label = "Đang tải trang...",
}) => (
	<LoadingRegion label={label} className="w-full space-y-6">
		<PageHeaderSkeleton hasAction />
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
			{Array.from({ length: 4 }, (_, i) => `skel-stat-${i}`).map((k) => (
				<StatCardSkeleton key={k} />
			))}
		</div>
		<MangaGridSkeleton count={8} />
	</LoadingRegion>
);
