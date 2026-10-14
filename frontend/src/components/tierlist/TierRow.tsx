import {
	ArrowDown,
	ArrowUp,
	Eraser,
	Plus,
	Settings2,
	Star,
	Trash2,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import type {
	HydratedTierItem,
	HydratedTierRow,
	TierBoardSettings,
	TierColorKey,
} from "../../types/tierlist";
import { TIER_COLOR_THEMES } from "../../types/tierlist";
import { TierItemCard } from "./TierItemCard";

interface TierRowProps {
	row: HydratedTierRow;
	rowIndex: number;
	totalRows: number;
	allRows: HydratedTierRow[];
	settings: TierBoardSettings;
	onDropManga: (
		mangaId: string,
		targetRowId: string,
		fromRowId?: string,
	) => void;
	onQuickMove: (
		mangaId: string,
		targetRowId: string | "pool" | "exclude",
	) => void;
	onMoveWithinRow: (mangaId: string, direction: "left" | "right") => void;
	onCustomizeItem: (item: HydratedTierItem) => void;
	onUpdateRowLabel: (rowId: string, newLabel: string) => void;
	onUpdateRowColor: (rowId: string, newColor: TierColorKey) => void;
	onUpdateRowDescription: (rowId: string, newDescription: string) => void;
	onMoveRow: (rowId: string, direction: "up" | "down") => void;
	onInsertRow: (targetRowId: string, position: "above" | "below") => void;
	onClearRow: (rowId: string) => void;
	onDeleteRow: (rowId: string) => void;
}

export const TierRow: React.FC<TierRowProps> = ({
	row,
	rowIndex,
	totalRows,
	allRows,
	settings,
	onDropManga,
	onQuickMove,
	onMoveWithinRow,
	onCustomizeItem,
	onUpdateRowLabel,
	onUpdateRowColor,
	onUpdateRowDescription,
	onMoveRow,
	onInsertRow,
	onClearRow,
	onDeleteRow,
}) => {
	const [isDragOver, setIsDragOver] = useState(false);
	const [isEditingLabel, setIsEditingLabel] = useState(false);
	const [tempLabel, setTempLabel] = useState(row.label);
	const [showSettings, setShowSettings] = useState(false);
	const [descInput, setDescInput] = useState(row.description || "");

	const theme = TIER_COLOR_THEMES[row.color_key] || TIER_COLOR_THEMES.crimson;

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		if (!isDragOver) setIsDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		// Only deactivate if leaving row container
		if (e.currentTarget.contains(e.relatedTarget as Node)) return;
		setIsDragOver(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);

		let mangaId = "";
		let fromRowId: string | undefined;

		try {
			const jsonStr = e.dataTransfer.getData("application/json");
			if (jsonStr) {
				const parsed = JSON.parse(jsonStr);
				mangaId = parsed.mangaId;
				fromRowId = parsed.fromRowId;
			}
		} catch {
			// Fallback to text
			mangaId = e.dataTransfer.getData("text/plain");
		}

		if (mangaId) {
			onDropManga(mangaId, row.row_id, fromRowId);
		}
	};

	const handleSaveLabel = () => {
		const trimmed = tempLabel.trim();
		if (trimmed && trimmed !== row.label) {
			onUpdateRowLabel(row.row_id, trimmed);
		} else {
			setTempLabel(row.label);
		}
		setIsEditingLabel(false);
	};

	const availableMoveTargets = allRows.map((r) => ({
		row_id: r.row_id,
		label: r.label,
		color_key: r.color_key,
	}));

	return (
		<div
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			className={`group relative flex flex-col md:flex-row items-stretch rounded-2xl border transition-all duration-200 bg-card shadow-xs ${
				showSettings ? "z-30" : "z-10"
			} ${
				isDragOver
					? "ring-2 ring-primary/80 border-primary bg-primary/5"
					: `${theme.borderAccent} hover:border-primary/40`
			}`}
		>
			{/* Left Column: Tier Label & Header */}
			<div
				className={`w-full md:w-32 lg:w-36 flex-shrink-0 flex md:flex-col items-center justify-between md:justify-center p-3 gap-1 ${theme.headerBg} select-none transition-colors rounded-t-2xl md:rounded-tr-none md:rounded-l-2xl`}
			>
				{isEditingLabel ? (
					<input
						type="text"
						value={tempLabel}
						onChange={(e) => setTempLabel(e.target.value)}
						onBlur={handleSaveLabel}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSaveLabel();
							if (e.key === "Escape") {
								setTempLabel(row.label);
								setIsEditingLabel(false);
							}
						}}
						autoFocus
						maxLength={30}
						className="w-full text-center font-extrabold text-sm md:text-base px-1.5 py-0.5 rounded-md bg-black/30 text-white outline-hidden ring-1 ring-white/50"
					/>
				) : (
					<button
						type="button"
						onClick={() => setIsEditingLabel(true)}
						title="Nhấn để đổi tên hàng"
						className="group/btn flex items-center justify-center gap-1 font-spartan font-black text-lg md:text-xl tracking-tight text-center cursor-pointer hover:opacity-85 transition truncate max-w-full"
					>
						<span>{row.label}</span>
					</button>
				)}

				{/* Row Metadata (Count & Average rating) */}
				<div className="flex md:flex-col items-center gap-1.5 md:gap-0.5 text-[11px] opacity-90 font-medium">
					<span>{row.item_count} bộ</span>
					{row.average_rating !== null && row.average_rating !== undefined && (
						<span className="flex items-center gap-0.5 font-bold">
							<Star size={10} className="fill-current" />
							<span>{row.average_rating}</span>
						</span>
					)}
				</div>
			</div>

			{/* Center Column: Drop Zone & Manga Cards */}
			<div className="flex-1 min-h-[110px] md:min-h-[140px] p-2.5 md:p-3 flex flex-wrap items-start content-start gap-2.5 overflow-x-auto">
				{row.items.length === 0 ? (
					<div className="w-full h-full min-h-[90px] flex flex-col items-center justify-center p-4 border border-dashed border-border rounded-xl text-center text-xs text-muted-foreground select-none">
						<span>
							Kéo thả bìa manga vào hàng này hoặc chọn từ menu gán nhanh
						</span>
					</div>
				) : (
					row.items.map((item) => (
						<TierItemCard
							key={item.manga_id}
							item={item}
							aspectRatio={settings.card_aspect}
							size={settings.card_size}
							showTitle={settings.show_title}
							showRating={settings.show_rating}
							showRoleBadge={settings.show_role_badge}
							currentRowId={row.row_id}
							availableRows={availableMoveTargets}
							onQuickMove={onQuickMove}
							onMoveWithinRow={onMoveWithinRow}
							onCustomize={onCustomizeItem}
						/>
					))
				)}
			</div>

			{/* Right Column: Row Action Controls */}
			<div className="w-full md:w-12 flex-shrink-0 flex md:flex-col items-center justify-end md:justify-center p-1.5 gap-1 border-t md:border-t-0 md:border-l border-border bg-muted/30 rounded-b-2xl md:rounded-bl-none md:rounded-r-2xl">
				{/* Settings Popover Trigger */}
				<div className="relative">
					<button
						type="button"
						onClick={() => setShowSettings((prev) => !prev)}
						title="Cài đặt hàng (Màu sắc, Tiêu chí)"
						className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition"
					>
						<Settings2 size={15} />
					</button>

					{/* Row Settings Modal / Flyout */}
					{showSettings && (
						<>
							<button
								type="button"
								aria-label="Đóng cài đặt"
								className="fixed inset-0 z-40 cursor-default bg-transparent border-0"
								onClick={() => setShowSettings(false)}
							/>
							<div className="absolute right-0 md:right-full top-full md:top-0 mt-1 md:mt-0 md:mr-2 w-72 max-w-[calc(100vw-32px)] rounded-2xl bg-popover text-popover-foreground border border-border shadow-2xl p-3.5 z-50 flex flex-col gap-3 text-xs animate-in fade-in-50 zoom-in-95">
								<div className="flex items-center justify-between border-b border-border pb-1.5">
									<span className="font-bold text-xs">
										Cài đặt hàng: {row.label}
									</span>
									<button
										type="button"
										onClick={() => setShowSettings(false)}
										aria-label="Đóng bảng cài đặt"
										className="text-muted-foreground hover:text-foreground font-bold p-1 rounded-md hover:bg-muted transition"
									>
										✕
									</button>
								</div>

								{/* Color Palette Picker */}
								<div>
									<span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1.5">
										Chọn màu nhận diện:
									</span>
									<div className="grid grid-cols-5 gap-1.5">
										{(Object.keys(TIER_COLOR_THEMES) as TierColorKey[]).map(
											(colorKey) => {
												const cTheme = TIER_COLOR_THEMES[colorKey];
												const isSelected = row.color_key === colorKey;
												return (
													<button
														key={colorKey}
														type="button"
														title={cTheme.label}
														onClick={() =>
															onUpdateRowColor(row.row_id, colorKey)
														}
														className={`h-6 rounded-md ${cTheme.badgeCls} flex items-center justify-center transition ${
															isSelected
																? "ring-2 ring-primary ring-offset-1 font-bold"
																: "hover:scale-105"
														}`}
													>
														<span className="text-[9px] font-bold">
															{colorKey.slice(0, 2).toUpperCase()}
														</span>
													</button>
												);
											},
										)}
									</div>
								</div>

								{/* Row Description / Rating Criteria */}
								<div>
									<span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
										Mô tả tiêu chí hàng:
									</span>
									<textarea
										value={descInput}
										onChange={(e) => setDescInput(e.target.value)}
										onBlur={() => onUpdateRowDescription(row.row_id, descInput)}
										rows={2}
										maxLength={250}
										placeholder="Ví dụ: Cực phẩm bắt buộc đọc..."
										className="w-full px-2 py-1 rounded-lg border border-border bg-background text-foreground text-xs outline-hidden focus:ring-1 focus:ring-primary"
									/>
								</div>

								{/* Insert Row Actions */}
								<div className="flex flex-col gap-1 pt-1 border-t border-border">
									<button
										type="button"
										onClick={() => {
											onInsertRow(row.row_id, "above");
											setShowSettings(false);
										}}
										className="flex items-center gap-1.5 px-2 py-1 rounded-md text-left hover:bg-accent text-foreground transition"
									>
										<Plus size={12} />
										<span>Chèn hàng mới lên trên</span>
									</button>
									<button
										type="button"
										onClick={() => {
											onInsertRow(row.row_id, "below");
											setShowSettings(false);
										}}
										className="flex items-center gap-1.5 px-2 py-1 rounded-md text-left hover:bg-accent text-foreground transition"
									>
										<Plus size={12} />
										<span>Chèn hàng mới xuống dưới</span>
									</button>
								</div>
							</div>
						</>
					)}
				</div>

				{/* Move Row Up / Down */}
				<button
					type="button"
					disabled={rowIndex === 0}
					onClick={() => onMoveRow(row.row_id, "up")}
					title="Di chuyển hàng lên trên"
					className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition"
				>
					<ArrowUp size={15} />
				</button>
				<button
					type="button"
					disabled={rowIndex === totalRows - 1}
					onClick={() => onMoveRow(row.row_id, "down")}
					title="Di chuyển hàng xuống dưới"
					className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition"
				>
					<ArrowDown size={15} />
				</button>

				{/* Clear Row (Return items to pool) */}
				<button
					type="button"
					disabled={row.items.length === 0}
					onClick={() => onClearRow(row.row_id)}
					title="Làm trống hàng (Đưa toàn bộ về Unranked)"
					className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
				>
					<Eraser size={15} />
				</button>

				{/* Delete Row */}
				<button
					type="button"
					disabled={totalRows <= 1}
					onClick={() => onDeleteRow(row.row_id)}
					title="Xóa hàng này"
					className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
				>
					<Trash2 size={15} />
				</button>
			</div>
		</div>
	);
};
