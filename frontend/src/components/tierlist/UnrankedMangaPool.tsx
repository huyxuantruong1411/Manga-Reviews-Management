import { Pin, Search, Undo2 } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import type {
	CreatorRoleFilter,
	HydratedTierItem,
	TierBoardSettings,
	TierColorKey,
} from "../../types/tierlist";
import { TierItemCard } from "./TierItemCard";

interface UnrankedMangaPoolProps {
	unrankedPool: HydratedTierItem[];
	excludedPool: HydratedTierItem[];
	settings: TierBoardSettings;
	availableRows: Array<{
		row_id: string;
		label: string;
		color_key: TierColorKey;
	}>;
	isSplitLayout?: boolean;
	onQuickMove: (
		mangaId: string,
		targetRowId: string | "pool" | "exclude",
	) => void;
	onRestoreExcluded: (mangaId: string) => void;
	onCustomizeItem: (item: HydratedTierItem) => void;
	onDropMangaToPool: (mangaId: string, fromRowId?: string) => void;
}

export const UnrankedMangaPool: React.FC<UnrankedMangaPoolProps> = ({
	unrankedPool,
	excludedPool,
	settings,
	availableRows,
	isSplitLayout = false,
	onQuickMove,
	onRestoreExcluded,
	onCustomizeItem,
	onDropMangaToPool,
}) => {
	const [activeTab, setActiveTab] = useState<"unranked" | "excluded">(
		"unranked",
	);
	const [searchQuery, setSearchQuery] = useState("");
	const [roleFilter, setRoleFilter] = useState<CreatorRoleFilter>("all");
	const [readStatusFilter, setReadStatusFilter] = useState<string>("all");
	const [sortMode, setSortMode] = useState<"rating" | "year" | "title">(
		"rating",
	);
	const [isStickyDock, setIsStickyDock] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);

	// Filtering & Sorting
	const filteredItems = useMemo(() => {
		const source = activeTab === "unranked" ? unrankedPool : excludedPool;
		let list = [...source];

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase().trim();
			list = list.filter((item) => item.title.toLowerCase().includes(q));
		}

		if (roleFilter !== "all") {
			list = list.filter(
				(item) =>
					item.creator_role === roleFilter ||
					(item.creator_role === "both" &&
						(roleFilter === "author" || roleFilter === "artist")),
			);
		}

		if (readStatusFilter !== "all") {
			list = list.filter(
				(item) => item.read_status.toLowerCase() === readStatusFilter,
			);
		}

		list.sort((a, b) => {
			if (sortMode === "rating") {
				const rA = a.personal_rating ?? -1;
				const rB = b.personal_rating ?? -1;
				return rB - rA;
			}
			if (sortMode === "year") {
				const yA = Number.parseInt(String(a.year || 0), 10) || 0;
				const yB = Number.parseInt(String(b.year || 0), 10) || 0;
				return yB - yA;
			}
			return a.title.localeCompare(b.title);
		});

		return list;
	}, [
		activeTab,
		unrankedPool,
		excludedPool,
		searchQuery,
		roleFilter,
		readStatusFilter,
		sortMode,
	]);

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		if (!isDragOver) setIsDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		if (e.currentTarget.contains(e.relatedTarget as Node)) return;
		setIsDragOver(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
		try {
			const jsonStr = e.dataTransfer.getData("application/json");
			if (jsonStr) {
				const { mangaId, fromRowId } = JSON.parse(jsonStr);
				if (mangaId && fromRowId && fromRowId !== "pool") {
					onDropMangaToPool(mangaId, fromRowId);
				}
			}
		} catch {
			const mangaId = e.dataTransfer.getData("text/plain");
			if (mangaId) onDropMangaToPool(mangaId);
		}
	};

	return (
		<div
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			className={`rounded-2xl border bg-card transition-all duration-200 shadow-sm ${
				isStickyDock && !isSplitLayout
					? "fixed bottom-3 left-4 right-4 z-40 max-h-[45vh] overflow-y-auto shadow-2xl border-primary/40 backdrop-blur-md bg-card/95"
					: "relative"
			} ${isDragOver ? "ring-2 ring-amber-500/80 border-amber-500 bg-amber-500/5" : "border-border"}`}
		>
			{/* Top Header Bar & Search Controls */}
			<div className="p-3 md:p-4 border-b border-border flex flex-col gap-3">
				{/* Tab Selection & Dock toggle */}
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="inline-flex rounded-xl bg-muted p-1">
						<button
							type="button"
							onClick={() => setActiveTab("unranked")}
							className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
								activeTab === "unranked"
									? "bg-card text-foreground shadow-xs"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							Chưa xếp hạng ({unrankedPool.length})
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("excluded")}
							className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
								activeTab === "excluded"
									? "bg-card text-foreground shadow-xs"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							Đã ẩn ({excludedPool.length})
						</button>
					</div>

					<div className="flex items-center gap-2">
						{filteredItems.length !==
							(activeTab === "unranked"
								? unrankedPool.length
								: excludedPool.length) && (
							<span className="text-[11px] text-muted-foreground font-semibold">
								Lọc: {filteredItems.length} bộ
							</span>
						)}

						{/* Sticky Dock Toggle - only shown in stacked mode */}
						{!isSplitLayout && (
							<button
								type="button"
								onClick={() => setIsStickyDock((prev) => !prev)}
								title={
									isStickyDock
										? "Bỏ ghim đáy màn hình"
										: "Ghim cố định dưới đáy màn hình (tiện kéo thả)"
								}
								className={`p-1.5 px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${
									isStickyDock
										? "bg-primary text-primary-foreground border-primary"
										: "bg-background text-muted-foreground hover:text-foreground border-border"
								}`}
							>
								<Pin size={12} className={isStickyDock ? "rotate-45" : ""} />
								<span className="hidden sm:inline">
									{isStickyDock ? "Đã ghim đáy" : "Ghim đáy"}
								</span>
							</button>
						)}
					</div>
				</div>

				{/* Filter & Search Bar */}
				<div className="flex flex-wrap items-center gap-2">
					{/* Search by Title */}
					<div className="relative flex-1 min-w-[130px] sm:w-48">
						<Search
							size={13}
							className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
						/>
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Tìm manga..."
							className="w-full pl-8 pr-3 py-1 rounded-xl border border-border bg-background text-foreground text-xs outline-hidden focus:ring-1 focus:ring-primary"
						/>
					</div>

					{/* Role Filter */}
					<select
						value={roleFilter}
						onChange={(e) => setRoleFilter(e.target.value as CreatorRoleFilter)}
						className="px-2 py-1 rounded-xl border border-border bg-background text-foreground text-xs outline-hidden focus:ring-1 focus:ring-primary"
					>
						<option value="all">Vai trò: Tất cả</option>
						<option value="author">Chỉ Tác giả</option>
						<option value="artist">Chỉ Họa sĩ</option>
						<option value="both">Cả hai vai trò</option>
					</select>

					{/* Read Status Filter */}
					<select
						value={readStatusFilter}
						onChange={(e) => setReadStatusFilter(e.target.value)}
						className="px-2 py-1 rounded-xl border border-border bg-background text-foreground text-xs outline-hidden focus:ring-1 focus:ring-primary"
					>
						<option value="all">Trạng thái đọc: Tất cả</option>
						<option value="completed">Đã hoàn thành</option>
						<option value="reading">Đang đọc</option>
						<option value="plan_to_read">Dự định đọc</option>
						<option value="unread">Chưa đọc</option>
					</select>

					{/* Sort Selector */}
					<select
						value={sortMode}
						onChange={(e) =>
							setSortMode(e.target.value as "rating" | "year" | "title")
						}
						className="px-2 py-1 rounded-xl border border-border bg-background text-foreground text-xs outline-hidden focus:ring-1 focus:ring-primary"
					>
						<option value="rating">Điểm cá nhân cao</option>
						<option value="year">Năm xuất bản mới</option>
						<option value="title">Tên truyện A - Z</option>
					</select>
				</div>
			</div>

			{/* Cards Grid / Pool Area */}
			<div
				className={`p-3 md:p-4 min-h-[80px] flex flex-wrap items-start content-start gap-2.5 ${
					isSplitLayout ? "max-h-[calc(100vh-230px)] overflow-y-auto pr-1" : ""
				}`}
			>
				{filteredItems.length === 0 ? (
					<div className="w-full py-8 text-center text-xs text-muted-foreground select-none">
						{activeTab === "unranked"
							? unrankedPool.length === 0
								? "Tất cả manga đã được xếp vào bảng Tierlist!"
								: "Không tìm thấy manga phù hợp với bộ lọc."
							: "Không có manga nào bị ẩn khỏi bảng này."}
					</div>
				) : (
					filteredItems.map((item) => (
						<div key={item.manga_id} className="relative group/poolcard">
							<TierItemCard
								item={item}
								aspectRatio={settings.card_aspect}
								size={settings.card_size}
								showTitle={settings.show_title}
								showRating={settings.show_rating}
								showRoleBadge={settings.show_role_badge}
								availableRows={availableRows}
								onQuickMove={onQuickMove}
								onCustomize={onCustomizeItem}
							/>

							{/* If in Excluded tab, provide restore button */}
							{activeTab === "excluded" && (
								<div className="absolute inset-x-0 bottom-0 p-1 bg-black/80 flex items-center justify-center rounded-b-xl z-20">
									<button
										type="button"
										onClick={() => onRestoreExcluded(item.manga_id)}
										className="w-full py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center justify-center gap-1 transition"
									>
										<Undo2 size={11} />
										<span>Khôi phục</span>
									</button>
								</div>
							)}
						</div>
					))
				)}
			</div>
		</div>
	);
};
