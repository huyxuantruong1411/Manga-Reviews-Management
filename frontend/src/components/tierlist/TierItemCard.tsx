import {
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	EyeOff,
	MoreVertical,
	SlidersHorizontal,
	Star,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { useMangaBlur } from "../../hooks/useMangaBlur";
import type {
	CardAspectRatio,
	CardSize,
	HydratedTierItem,
	TierColorKey,
} from "../../types/tierlist";
import { TIER_COLOR_THEMES } from "../../types/tierlist";
import { BlurredCover } from "../ui/BlurredCover";

interface TierItemCardProps {
	item: HydratedTierItem;
	aspectRatio?: CardAspectRatio;
	size?: CardSize;
	showTitle?: boolean;
	showRating?: boolean;
	showRoleBadge?: boolean;
	currentRowId?: string; // undefined if in pool
	availableRows: Array<{
		row_id: string;
		label: string;
		color_key: TierColorKey;
	}>;
	onQuickMove: (
		mangaId: string,
		targetRowId: string | "pool" | "exclude",
	) => void;
	onMoveWithinRow?: (mangaId: string, direction: "left" | "right") => void;
	onCustomize: (item: HydratedTierItem) => void;
	isDraggable?: boolean;
}

export const TierItemCard: React.FC<TierItemCardProps> = ({
	item,
	aspectRatio = "portrait",
	size = "normal",
	showTitle = true,
	showRating = true,
	showRoleBadge = false,
	currentRowId,
	availableRows,
	onQuickMove,
	onMoveWithinRow,
	onCustomize,
	isDraggable = true,
}) => {
	const { shouldBlur } = useMangaBlur();
	const [showMenu, setShowMenu] = useState(false);
	const [isDragging, setIsDragging] = useState(false);

	const isCoverBlurred = shouldBlur({
		content_rating: item.content_rating,
	});

	// Size classes
	const sizeClasses = {
		compact: "w-20 md:w-24 text-[10px]",
		normal: "w-24 md:w-28 text-xs",
		large: "w-28 md:w-36 text-sm",
	}[size];

	const aspectClass =
		aspectRatio === "square" ? "aspect-square" : "aspect-[2/3]";

	const handleDragStart = (e: React.DragEvent) => {
		setIsDragging(true);
		const payload = {
			mangaId: item.manga_id,
			fromRowId: currentRowId || "pool",
		};
		e.dataTransfer.setData("application/json", JSON.stringify(payload));
		e.dataTransfer.setData("text/plain", item.manga_id);
		e.dataTransfer.effectAllowed = "move";
	};

	const handleDragEnd = () => {
		setIsDragging(false);
	};

	const roleLabel =
		item.creator_role === "author"
			? "Tác giả"
			: item.creator_role === "artist"
				? "Họa sĩ"
				: "Cả hai";

	const hasCaption = showTitle || showRoleBadge;

	return (
		<div
			draggable={isDraggable}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			className={`group relative flex-shrink-0 flex flex-col rounded-xl bg-card border border-border shadow-xs select-none transition-all duration-150 ${
				showMenu ? "z-30" : "z-10"
			} ${sizeClasses} ${
				isDragging
					? "opacity-35 scale-95 ring-2 ring-primary"
					: "hover:shadow-md hover:border-primary/50"
			}`}
		>
			{/* Cover Media Container */}
			<div
				className={`relative w-full ${aspectClass} overflow-hidden ${
					hasCaption ? "rounded-t-xl" : "rounded-xl"
				} bg-muted`}
			>
				<BlurredCover
					src={item.cover_url || item.default_cover_url}
					alt={item.title}
					shouldBlur={isCoverBlurred}
					className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
				/>

				{/* Note Badge on top-left if present */}
				{item.note && (
					<div className="absolute top-1 left-1 max-w-[85%] z-10">
						<span
							title={item.note}
							className="inline-block truncate px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-white text-[9px] font-bold shadow-xs border border-white/20"
						>
							{item.note}
						</span>
					</div>
				)}

				{/* Newly discovered pill */}
				{item.is_newly_discovered && (
					<div className="absolute bottom-1 left-1 z-10">
						<span className="px-1 py-0.5 rounded-sm bg-emerald-500 text-white font-extrabold text-[8px] uppercase tracking-wider shadow-xs">
							Mới
						</span>
					</div>
				)}

				{/* Rating Badge on top-right */}
				{showRating &&
					item.personal_rating !== null &&
					item.personal_rating !== undefined && (
						<div className="absolute top-1 right-1 z-10">
							<span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-amber-400 font-bold text-[10px] shadow-xs border border-amber-400/30">
								<Star size={9} className="fill-amber-400" />
								<span>{item.personal_rating}</span>
							</span>
						</div>
					)}

				{/* Action Overlay Toolbar (Visible on hover / focus) */}
				<div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex flex-col justify-between p-1 z-20">
					{/* Top Actions: Customize & Link */}
					<div className="flex items-center justify-between">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onCustomize(item);
							}}
							title="Đổi bìa Volume / Ghi chú"
							className="p-1 rounded-md bg-white/20 hover:bg-white/40 text-white transition"
						>
							<SlidersHorizontal size={13} />
						</button>
						<a
							href={`/manga/${item.manga_id}`}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => e.stopPropagation()}
							title="Mở trang chi tiết"
							className="p-1 rounded-md bg-white/20 hover:bg-white/40 text-white transition"
						>
							<ExternalLink size={13} />
						</a>
					</div>

					{/* Middle Actions: Move left / right within row */}
					{currentRowId && onMoveWithinRow && (
						<div className="flex items-center justify-between px-1">
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onMoveWithinRow(item.manga_id, "left");
								}}
								title="Di chuyển sang trái"
								className="p-1 rounded-md bg-white/20 hover:bg-white/40 text-white transition"
							>
								<ChevronLeft size={14} />
							</button>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									onMoveWithinRow(item.manga_id, "right");
								}}
								title="Di chuyển sang phải"
								className="p-1 rounded-md bg-white/20 hover:bg-white/40 text-white transition"
							>
								<ChevronRight size={14} />
							</button>
						</div>
					)}

					{/* Bottom Action: Quick Move Menu Trigger */}
					<div className="relative">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setShowMenu((prev) => !prev);
							}}
							className="w-full py-1 rounded-md bg-primary text-primary-foreground font-semibold text-[10px] text-center flex items-center justify-center gap-1 shadow-xs"
						>
							<span>Gán hàng</span>
							<MoreVertical size={11} />
						</button>

						{/* Quick Move Dropdown */}
						{showMenu && (
							<>
								<button
									type="button"
									aria-label="Đóng menu"
									className="fixed inset-0 z-30 cursor-default bg-transparent border-0"
									onClick={(e) => {
										e.stopPropagation();
										setShowMenu(false);
									}}
								/>
								<div className="absolute bottom-full left-0 mb-1 w-36 max-h-52 overflow-y-auto rounded-xl bg-popover text-popover-foreground border border-border shadow-lg p-1 z-40 flex flex-col gap-0.5 text-xs animate-in fade-in-50 zoom-in-95">
									<div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase border-b border-border">
										Chuyển sang:
									</div>
									{availableRows.map((row) => {
										const theme = TIER_COLOR_THEMES[row.color_key];
										const isCurrent = currentRowId === row.row_id;
										return (
											<button
												key={row.row_id}
												type="button"
												disabled={isCurrent}
												onClick={(e) => {
													e.stopPropagation();
													onQuickMove(item.manga_id, row.row_id);
													setShowMenu(false);
												}}
												className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-left text-xs font-medium transition ${
													isCurrent
														? "opacity-40 cursor-not-allowed bg-muted"
														: "hover:bg-accent"
												}`}
											>
												<span
													className={`w-2.5 h-2.5 rounded-full ${theme.badgeCls}`}
												/>
												<span className="truncate">{row.label}</span>
											</button>
										);
									})}
									{currentRowId && (
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												onQuickMove(item.manga_id, "pool");
												setShowMenu(false);
											}}
											className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-left text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition border-t border-border mt-0.5"
										>
											<ChevronLeft size={12} />
											<span>Về Unranked</span>
										</button>
									)}
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											onQuickMove(item.manga_id, "exclude");
											setShowMenu(false);
										}}
										className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-left text-xs font-medium text-destructive hover:bg-destructive/10 transition"
									>
										<EyeOff size={12} />
										<span>Ẩn khỏi bảng</span>
									</button>
								</div>
							</>
						)}
					</div>
				</div>
			</div>

			{/* Optional Caption Section */}
			{(showTitle || showRoleBadge) && (
				<div className="p-1.5 flex flex-col gap-0.5 bg-card rounded-b-xl">
					{showTitle && (
						<p
							title={item.title}
							className="font-medium line-clamp-1 leading-tight text-foreground truncate"
						>
							{item.title}
						</p>
					)}
					{showRoleBadge && (
						<span className="text-[9px] text-muted-foreground truncate font-normal">
							{roleLabel} {item.year ? `· ${item.year}` : ""}
						</span>
					)}
				</div>
			)}
		</div>
	);
};
