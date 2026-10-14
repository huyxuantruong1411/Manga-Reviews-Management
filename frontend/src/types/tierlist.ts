export type TierColorKey =
	| "crimson"
	| "amber"
	| "gold"
	| "lime"
	| "emerald"
	| "cyan"
	| "sky"
	| "violet"
	| "rose"
	| "slate";

export type CardAspectRatio = "portrait" | "square";
export type CardSize = "compact" | "normal" | "large";
export type CreatorRoleFilter = "all" | "author" | "artist" | "both";
export type PresetKind = "standard" | "critic" | "score_based" | "empty";

export interface TierItemEntry {
	manga_id: string;
	selected_cover_art_id?: string | null;
	selected_minio_key?: string | null;
	note?: string | null;
}

export interface HydratedTierItem extends TierItemEntry {
	title: string;
	cover_url?: string | null;
	default_cover_url?: string | null;
	personal_rating?: number | null;
	read_status: string;
	year?: string | null;
	status?: string | null;
	content_rating?: string | null;
	creator_role: "author" | "artist" | "both";
	is_newly_discovered: boolean;
}

export interface TierRowModel {
	row_id: string;
	label: string;
	color_key: TierColorKey;
	description?: string | null;
	items: TierItemEntry[];
}

export interface HydratedTierRow {
	row_id: string;
	label: string;
	color_key: TierColorKey;
	description?: string | null;
	items: HydratedTierItem[];
	item_count: number;
	average_rating?: number | null;
}

export interface TierBoardSettings {
	card_aspect: CardAspectRatio;
	card_size: CardSize;
	show_title: boolean;
	show_rating: boolean;
	show_role_badge: boolean;
	role_filter: CreatorRoleFilter;
	excluded_manga_ids: string[];
}

export interface TierlistAnalyticsSummary {
	total_creator_mangas: number;
	ranked_count: number;
	unranked_count: number;
	excluded_count: number;
	completion_pct: number;
	overall_ranked_avg_rating?: number | null;
}

export interface TierlistDetail {
	_id: string;
	creator_name: string;
	creator_name_normalized: string;
	title: string;
	description?: string | null;
	category_tag: string;
	is_default: boolean;
	revision: number;
	settings: TierBoardSettings;
	tiers: HydratedTierRow[];
	unranked_pool: HydratedTierItem[];
	excluded_pool: HydratedTierItem[];
	analytics: TierlistAnalyticsSummary;
	created_at: string;
	updated_at: string;
}

export interface TierlistSummary {
	_id: string;
	creator_name: string;
	title: string;
	description?: string | null;
	category_tag: string;
	is_default: boolean;
	revision: number;
	ranked_count: number;
	tier_count: number;
	created_at: string;
	updated_at: string;
}

export interface TierlistComparisonItemDiff {
	manga_id: string;
	title: string;
	cover_url?: string | null;
	from_tier_label?: string | null;
	to_tier_label?: string | null;
	from_tier_index?: number | null;
	to_tier_index?: number | null;
	movement: "promoted" | "demoted" | "unchanged" | "newly_ranked" | "unranked";
	tier_delta: number;
}

export interface TierlistComparisonResponse {
	base_tierlist_id: string;
	base_title: string;
	target_tierlist_id: string;
	target_title: string;
	summary: Record<string, number>;
	diffs: TierlistComparisonItemDiff[];
}

export interface MangaCoverOption {
	cover_art_id?: string | null;
	minio_key: string;
	cover_url: string;
	volume?: string | null;
	locale?: string | null;
	is_default: boolean;
}

export interface TierColorThemeDef {
	label: string;
	headerBg: string;
	borderAccent: string;
	badgeCls: string;
	canvasBg: string;
	canvasText: string;
}

export const TIER_COLOR_THEMES: Record<TierColorKey, TierColorThemeDef> = {
	crimson: {
		label: "Đỏ (S)",
		headerBg: "bg-rose-500/90 text-white dark:bg-rose-600/90",
		borderAccent: "border-rose-500/40",
		badgeCls:
			"bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
		canvasBg: "#f43f5e",
		canvasText: "#ffffff",
	},
	amber: {
		label: "Cam (A)",
		headerBg: "bg-orange-500/90 text-white dark:bg-orange-600/90",
		borderAccent: "border-orange-500/40",
		badgeCls:
			"bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
		canvasBg: "#f97316",
		canvasText: "#ffffff",
	},
	gold: {
		label: "Vàng (B)",
		headerBg:
			"bg-amber-400/95 text-zinc-950 dark:bg-amber-500/90 dark:text-zinc-950",
		borderAccent: "border-amber-500/40",
		badgeCls:
			"bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
		canvasBg: "#fbbf24",
		canvasText: "#09090b",
	},
	lime: {
		label: "Xanh vàng (C)",
		headerBg:
			"bg-lime-400/95 text-zinc-950 dark:bg-lime-500/90 dark:text-zinc-950",
		borderAccent: "border-lime-500/40",
		badgeCls:
			"bg-lime-500/15 text-lime-700 dark:text-lime-300 border-lime-500/30",
		canvasBg: "#a3e635",
		canvasText: "#09090b",
	},
	emerald: {
		label: "Xanh lá (D)",
		headerBg: "bg-emerald-500/90 text-white dark:bg-emerald-600/90",
		borderAccent: "border-emerald-500/40",
		badgeCls:
			"bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
		canvasBg: "#10b981",
		canvasText: "#ffffff",
	},
	cyan: {
		label: "Xanh ngọc",
		headerBg: "bg-cyan-500/90 text-white dark:bg-cyan-600/90",
		borderAccent: "border-cyan-500/40",
		badgeCls:
			"bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
		canvasBg: "#06b6d4",
		canvasText: "#ffffff",
	},
	sky: {
		label: "Xanh dương",
		headerBg: "bg-sky-500/90 text-white dark:bg-sky-600/90",
		borderAccent: "border-sky-500/40",
		badgeCls: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
		canvasBg: "#0ea5e9",
		canvasText: "#ffffff",
	},
	violet: {
		label: "Tím",
		headerBg: "bg-violet-500/90 text-white dark:bg-violet-600/90",
		borderAccent: "border-violet-500/40",
		badgeCls:
			"bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
		canvasBg: "#8b5cf6",
		canvasText: "#ffffff",
	},
	rose: {
		label: "Hồng",
		headerBg: "bg-pink-500/90 text-white dark:bg-pink-600/90",
		borderAccent: "border-pink-500/40",
		badgeCls:
			"bg-pink-500/15 text-pink-600 dark:text-pink-400 border-pink-500/30",
		canvasBg: "#ec4899",
		canvasText: "#ffffff",
	},
	slate: {
		label: "Xám (F)",
		headerBg: "bg-zinc-600 text-white dark:bg-zinc-700",
		borderAccent: "border-zinc-500/40",
		badgeCls:
			"bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/30",
		canvasBg: "#52525b",
		canvasText: "#ffffff",
	},
};
