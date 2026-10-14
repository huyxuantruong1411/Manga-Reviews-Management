import {
	Check,
	Columns2,
	Copy,
	Download,
	FileDown,
	FileText,
	GitCompare,
	ImageIcon,
	Layers,
	Plus,
	Redo2,
	RotateCw,
	Rows2,
	Save,
	Sparkles,
	Star,
	Trash2,
	Undo2,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	autoSeedTierlist,
	cloneTierlist,
	createCreatorTierlist,
	deleteTierlist,
	fetchCreatorTierlists,
	fetchTierlistDetail,
	updateTierlist,
} from "../../api/tierlists";
import type {
	CardSize,
	HydratedTierItem,
	HydratedTierRow,
	MangaCoverOption,
	PresetKind,
	TierColorKey,
	TierlistDetail,
	TierlistSummary,
} from "../../types/tierlist";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { TierItemCustomizeModal } from "./TierItemCustomizeModal";
import {
	exportTierlistToJson,
	exportTierlistToMarkdown,
	exportTierlistToPng,
	generateTierlistMarkdown,
} from "./TierlistExportService";
import { ConfirmModal, NoticeModal } from "./TierlistFeedbackModal";
import { TierlistVersionCompareModal } from "./TierlistVersionCompareModal";
import { TierRow } from "./TierRow";
import { UnrankedMangaPool } from "./UnrankedMangaPool";

interface CreatorTierlistWorkspaceProps {
	creatorName: string;
	activeTierlistId?: string | null;
	onSelectTierlistId?: (id: string) => void;
	onDirtyChange?: (isDirty: boolean) => void;
}

export const CreatorTierlistWorkspace: React.FC<
	CreatorTierlistWorkspaceProps
> = ({ creatorName, activeTierlistId, onSelectTierlistId, onDirtyChange }) => {
	// Main states
	const [summaries, setSummaries] = useState<TierlistSummary[]>([]);
	const [activeTierlist, setActiveTierlist] = useState<TierlistDetail | null>(
		null,
	);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isDirty, setIsDirty] = useState(false);

	// In-session Undo / Redo history
	const [history, setHistory] = useState<TierlistDetail[]>([]);
	const [historyIndex, setHistoryIndex] = useState(-1);

	// Modals
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [newTitle, setNewTitle] = useState("");
	const [newCategory, setNewCategory] = useState("Tổng hợp");
	const [newPreset, setNewPreset] = useState<PresetKind>("standard");
	const [newAutoSeed, setNewAutoSeed] = useState(false);

	const [showCloneModal, setShowCloneModal] = useState(false);
	const [cloneTitle, setCloneTitle] = useState("");
	const [cloneAsDefault, setCloneAsDefault] = useState(false);

	const [showCompareModal, setShowCompareModal] = useState(false);

	const [customizingItem, setCustomizingItem] =
		useState<HydratedTierItem | null>(null);

	const [showExportMenu, setShowExportMenu] = useState(false);
	const [exportingPng, setExportingPng] = useState(false);
	const [copiedMarkdown, setCopiedMarkdown] = useState(false);

	// Feedback Dialogs (professional replacements for window.confirm & alert)
	const [confirmModal, setConfirmModal] = useState<{
		isOpen: boolean;
		title: string;
		description: React.ReactNode;
		confirmText?: string;
		cancelText?: string;
		variant?: "destructive" | "warning" | "primary" | "info";
		iconType?: "trash" | "warning" | "sparkles" | "info";
		onConfirm: () => void | Promise<void>;
	}>({
		isOpen: false,
		title: "",
		description: "",
		onConfirm: () => {},
	});

	const [noticeModal, setNoticeModal] = useState<{
		isOpen: boolean;
		title: string;
		description: React.ReactNode;
		type?: "error" | "warning" | "info" | "success";
		actionText?: string;
	}>({
		isOpen: false,
		title: "",
		description: "",
		type: "info",
	});

	// Layout mode & resizable split pane
	const [layoutMode, setLayoutMode] = useState<"stacked" | "split">(() => {
		return (
			(localStorage.getItem("creator_tierlist_layout_mode") as
				| "stacked"
				| "split") || "split"
		);
	});
	const [splitRatio, setSplitRatio] = useState<number>(() => {
		const saved = localStorage.getItem("creator_tierlist_split_ratio");
		return saved ? Math.min(Math.max(Number(saved), 25), 75) : 58;
	});
	const [isResizing, setIsResizing] = useState(false);
	const [isLargeScreen, setIsLargeScreen] = useState<boolean>(() => {
		return typeof window !== "undefined" ? window.innerWidth >= 1024 : true;
	});
	const splitContainerRef = useRef<HTMLDivElement>(null);

	const handleMouseDownResize = (e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizing(true);
	};

	useEffect(() => {
		const handleResize = () => {
			setIsLargeScreen(window.innerWidth >= 1024);
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	useEffect(() => {
		if (!isResizing) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!splitContainerRef.current) return;
			const rect = splitContainerRef.current.getBoundingClientRect();
			const offsetX = e.clientX - rect.left;
			const newRatio = (offsetX / rect.width) * 100;
			const clamped = Math.min(Math.max(newRatio, 25), 75);
			setSplitRatio(clamped);
		};

		const handleMouseUp = () => {
			setIsResizing(false);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, [isResizing]);

	useEffect(() => {
		localStorage.setItem("creator_tierlist_layout_mode", layoutMode);
	}, [layoutMode]);

	useEffect(() => {
		localStorage.setItem("creator_tierlist_split_ratio", splitRatio.toString());
	}, [splitRatio]);

	// Sync isDirty upstream
	const markDirty = (dirty: boolean) => {
		setIsDirty(dirty);
		if (onDirtyChange) onDirtyChange(dirty);
	};

	// -------------------------------------------------------------------------
	// Data Fetching
	// -------------------------------------------------------------------------

	const loadSummariesAndDetail = useCallback(
		async (targetId?: string | null) => {
			if (!creatorName) return;
			try {
				setLoading(true);
				setError(null);

				const list = await fetchCreatorTierlists(creatorName);
				setSummaries(list);

				if (list.length === 0) {
					setActiveTierlist(null);
					setLoading(false);
					return;
				}

				// Determine which ID to load
				let idToLoad = targetId || activeTierlistId;
				if (!idToLoad || !list.some((s) => s._id === idToLoad)) {
					// Default version or first
					const def = list.find((s) => s.is_default) || list[0];
					idToLoad = def._id;
				}

				if (onSelectTierlistId && idToLoad !== activeTierlistId) {
					onSelectTierlistId(idToLoad);
				}

				const detail = await fetchTierlistDetail(idToLoad);
				setActiveTierlist(detail);
				setHistory([detail]);
				setHistoryIndex(0);
				markDirty(false);
			} catch (err: any) {
				console.error("Failed to load tierlists for creator", err);
				setError(
					err.response?.data?.detail ||
						"Không thể tải danh sách bảng xếp hạng của tác giả.",
				);
			} finally {
				setLoading(false);
			}
		},
		[creatorName, activeTierlistId, onSelectTierlistId],
	);

	useEffect(() => {
		loadSummariesAndDetail();
	}, [creatorName]);

	// When user clicks a different version from switcher
	const handleSelectVersion = (tierlistId: string) => {
		if (tierlistId === activeTierlist?._id) return;
		if (isDirty) {
			setConfirmModal({
				isOpen: true,
				title: "Chuyển phiên bản xếp hạng?",
				description:
					"Bạn có thay đổi chưa lưu trên bảng xếp hạng này. Chuyển phiên bản sẽ làm mất các thay đổi chưa lưu. Bạn có muốn tiếp tục?",
				confirmText: "Chuyển phiên bản",
				cancelText: "Ở lại lưu",
				variant: "warning",
				iconType: "warning",
				onConfirm: () => {
					setConfirmModal((prev) => ({ ...prev, isOpen: false }));
					switchVersion(tierlistId);
				},
			});
			return;
		}
		switchVersion(tierlistId);
	};

	const switchVersion = async (tierlistId: string) => {
		if (onSelectTierlistId) onSelectTierlistId(tierlistId);
		try {
			setLoading(true);
			const detail = await fetchTierlistDetail(tierlistId);
			setActiveTierlist(detail);
			setHistory([detail]);
			setHistoryIndex(0);
			markDirty(false);
		} catch (err: any) {
			console.error("Failed to fetch tierlist detail", err);
			setNoticeModal({
				isOpen: true,
				title: "Lỗi chuyển phiên bản",
				description:
					err.message || "Không thể tải chi tiết phiên bản bảng xếp hạng.",
				type: "error",
			});
		} finally {
			setLoading(false);
		}
	};

	// -------------------------------------------------------------------------
	// History / Undo / Redo
	// -------------------------------------------------------------------------

	const pushHistory = (newDetail: TierlistDetail) => {
		const newHistory = history.slice(0, historyIndex + 1);
		newHistory.push(newDetail);
		setHistory(newHistory);
		setHistoryIndex(newHistory.length - 1);
		setActiveTierlist(newDetail);
		markDirty(true);
	};

	const handleUndo = () => {
		if (historyIndex > 0) {
			const nextIdx = historyIndex - 1;
			setHistoryIndex(nextIdx);
			setActiveTierlist(history[nextIdx]);
			markDirty(true);
		}
	};

	const handleRedo = () => {
		if (historyIndex < history.length - 1) {
			const nextIdx = historyIndex + 1;
			setHistoryIndex(nextIdx);
			setActiveTierlist(history[nextIdx]);
			markDirty(true);
		}
	};

	// -------------------------------------------------------------------------
	// Board Mutations
	// -------------------------------------------------------------------------

	const handleDropManga = (
		mangaId: string,
		targetRowId: string,
		_fromRowId?: string,
	) => {
		if (!activeTierlist) return;

		// 1. Locate the item
		let foundItem: HydratedTierItem | null = null;

		// Check unranked pool
		const unrankedIdx = activeTierlist.unranked_pool.findIndex(
			(i) => i.manga_id === mangaId,
		);
		if (unrankedIdx !== -1) {
			foundItem = activeTierlist.unranked_pool[unrankedIdx];
		} else {
			// Check tiers
			for (const r of activeTierlist.tiers) {
				const idx = r.items.findIndex((i) => i.manga_id === mangaId);
				if (idx !== -1) {
					foundItem = r.items[idx];
					break;
				}
			}
		}

		if (!foundItem) return;

		// 2. Remove from all tiers and unranked pool
		const updatedTiers = activeTierlist.tiers.map((row) => ({
			...row,
			items: row.items.filter((i) => i.manga_id !== mangaId),
			item_count: row.items.filter((i) => i.manga_id !== mangaId).length,
		}));

		const updatedUnranked = activeTierlist.unranked_pool.filter(
			(i) => i.manga_id !== mangaId,
		);

		// 3. Append to target row
		const targetRow = updatedTiers.find((r) => r.row_id === targetRowId);
		if (targetRow) {
			targetRow.items.push(foundItem);
			targetRow.item_count = targetRow.items.length;
		}

		// Recalculate average rating for target row
		if (targetRow) {
			const scores = targetRow.items
				.map((i) => i.personal_rating)
				.filter((s): s is number => s !== null && s !== undefined);
			targetRow.average_rating =
				scores.length > 0
					? Math.round(
							(scores.reduce((a, b) => a + b, 0) / scores.length) * 100,
						) / 100
					: null;
		}

		const totalRanked = updatedTiers.reduce(
			(acc, r) => acc + r.items.length,
			0,
		);
		const totalManga = activeTierlist.analytics.total_creator_mangas;

		const nextState: TierlistDetail = {
			...activeTierlist,
			tiers: updatedTiers,
			unranked_pool: updatedUnranked,
			analytics: {
				...activeTierlist.analytics,
				ranked_count: totalRanked,
				unranked_count: updatedUnranked.length,
				completion_pct:
					totalManga > 0
						? Math.round((totalRanked / totalManga) * 1000) / 10
						: 0,
			},
		};

		pushHistory(nextState);
	};

	const handleDropMangaToPool = (mangaId: string, _fromRowId?: string) => {
		if (!activeTierlist) return;

		let foundItem: HydratedTierItem | null = null;
		for (const r of activeTierlist.tiers) {
			const idx = r.items.findIndex((i) => i.manga_id === mangaId);
			if (idx !== -1) {
				foundItem = r.items[idx];
				break;
			}
		}

		if (!foundItem) return;

		// Remove from tiers and add back to pool
		const updatedTiers = activeTierlist.tiers.map((row) => ({
			...row,
			items: row.items.filter((i) => i.manga_id !== mangaId),
			item_count: row.items.filter((i) => i.manga_id !== mangaId).length,
		}));

		const updatedUnranked = [...activeTierlist.unranked_pool, foundItem];
		const totalRanked = updatedTiers.reduce(
			(acc, r) => acc + r.items.length,
			0,
		);
		const totalManga = activeTierlist.analytics.total_creator_mangas;

		const nextState: TierlistDetail = {
			...activeTierlist,
			tiers: updatedTiers,
			unranked_pool: updatedUnranked,
			analytics: {
				...activeTierlist.analytics,
				ranked_count: totalRanked,
				unranked_count: updatedUnranked.length,
				completion_pct:
					totalManga > 0
						? Math.round((totalRanked / totalManga) * 1000) / 10
						: 0,
			},
		};

		pushHistory(nextState);
	};

	const handleQuickMove = (
		mangaId: string,
		targetRowId: string | "pool" | "exclude",
	) => {
		if (!activeTierlist) return;

		if (targetRowId === "pool") {
			handleDropMangaToPool(mangaId);
		} else if (targetRowId === "exclude") {
			// Hide from board: put into excluded_pool and update settings.excluded_manga_ids
			let foundItem: HydratedTierItem | null = null;

			// Remove from tiers or unranked
			const updatedTiers = activeTierlist.tiers.map((row) => ({
				...row,
				items: row.items.filter((i) => {
					if (i.manga_id === mangaId) {
						foundItem = i;
						return false;
					}
					return true;
				}),
			}));

			let updatedUnranked = activeTierlist.unranked_pool;
			if (!foundItem) {
				const uIdx = activeTierlist.unranked_pool.findIndex(
					(i) => i.manga_id === mangaId,
				);
				if (uIdx !== -1) {
					foundItem = activeTierlist.unranked_pool[uIdx];
					updatedUnranked = activeTierlist.unranked_pool.filter(
						(i) => i.manga_id !== mangaId,
					);
				}
			}

			if (!foundItem) return;

			const nextExcludedIds = Array.from(
				new Set([...activeTierlist.settings.excluded_manga_ids, mangaId]),
			);
			const updatedExcludedPool = [...activeTierlist.excluded_pool, foundItem];

			const nextState: TierlistDetail = {
				...activeTierlist,
				settings: {
					...activeTierlist.settings,
					excluded_manga_ids: nextExcludedIds,
				},
				tiers: updatedTiers,
				unranked_pool: updatedUnranked,
				excluded_pool: updatedExcludedPool,
				analytics: {
					...activeTierlist.analytics,
					excluded_count: updatedExcludedPool.length,
					unranked_count: updatedUnranked.length,
				},
			};

			pushHistory(nextState);
		} else {
			handleDropManga(mangaId, targetRowId);
		}
	};

	const handleRestoreExcluded = (mangaId: string) => {
		if (!activeTierlist) return;

		const target = activeTierlist.excluded_pool.find(
			(i) => i.manga_id === mangaId,
		);
		if (!target) return;

		const updatedExcludedPool = activeTierlist.excluded_pool.filter(
			(i) => i.manga_id !== mangaId,
		);
		const updatedExcludedIds =
			activeTierlist.settings.excluded_manga_ids.filter((id) => id !== mangaId);
		const updatedUnranked = [...activeTierlist.unranked_pool, target];

		const nextState: TierlistDetail = {
			...activeTierlist,
			settings: {
				...activeTierlist.settings,
				excluded_manga_ids: updatedExcludedIds,
			},
			excluded_pool: updatedExcludedPool,
			unranked_pool: updatedUnranked,
			analytics: {
				...activeTierlist.analytics,
				excluded_count: updatedExcludedPool.length,
				unranked_count: updatedUnranked.length,
			},
		};

		pushHistory(nextState);
	};

	const handleMoveWithinRow = (
		mangaId: string,
		direction: "left" | "right",
	) => {
		if (!activeTierlist) return;

		const updatedTiers = activeTierlist.tiers.map((row) => {
			const idx = row.items.findIndex((i) => i.manga_id === mangaId);
			if (idx === -1) return row;

			const newItems = [...row.items];
			if (direction === "left" && idx > 0) {
				const temp = newItems[idx - 1];
				newItems[idx - 1] = newItems[idx];
				newItems[idx] = temp;
			} else if (direction === "right" && idx < newItems.length - 1) {
				const temp = newItems[idx + 1];
				newItems[idx + 1] = newItems[idx];
				newItems[idx] = temp;
			}
			return { ...row, items: newItems };
		});

		pushHistory({ ...activeTierlist, tiers: updatedTiers });
	};

	const handleApplyCustomization = (
		mangaId: string,
		coverOption: MangaCoverOption | null,
		note: string,
	) => {
		if (!activeTierlist) return;

		const applyToItem = (item: HydratedTierItem) => {
			if (item.manga_id !== mangaId) return item;
			return {
				...item,
				note: note || null,
				selected_minio_key: coverOption ? coverOption.minio_key : null,
				selected_cover_art_id: coverOption ? coverOption.cover_art_id : null,
				cover_url: coverOption ? coverOption.cover_url : item.default_cover_url,
			};
		};

		const updatedTiers = activeTierlist.tiers.map((row) => ({
			...row,
			items: row.items.map(applyToItem),
		}));

		const updatedUnranked = activeTierlist.unranked_pool.map(applyToItem);

		pushHistory({
			...activeTierlist,
			tiers: updatedTiers,
			unranked_pool: updatedUnranked,
		});
	};

	// -------------------------------------------------------------------------
	// Row Structure Operations (Label, Color, Insert, Delete, Move, Clear)
	// -------------------------------------------------------------------------

	const handleUpdateRowLabel = (rowId: string, newLabel: string) => {
		if (!activeTierlist) return;
		const updated = activeTierlist.tiers.map((r) =>
			r.row_id === rowId ? { ...r, label: newLabel } : r,
		);
		pushHistory({ ...activeTierlist, tiers: updated });
	};

	const handleUpdateRowColor = (rowId: string, newColor: TierColorKey) => {
		if (!activeTierlist) return;
		const updated = activeTierlist.tiers.map((r) =>
			r.row_id === rowId ? { ...r, color_key: newColor } : r,
		);
		pushHistory({ ...activeTierlist, tiers: updated });
	};

	const handleUpdateRowDescription = (
		rowId: string,
		newDescription: string,
	) => {
		if (!activeTierlist) return;
		const updated = activeTierlist.tiers.map((r) =>
			r.row_id === rowId ? { ...r, description: newDescription } : r,
		);
		pushHistory({ ...activeTierlist, tiers: updated });
	};

	const handleMoveRow = (rowId: string, direction: "up" | "down") => {
		if (!activeTierlist) return;
		const idx = activeTierlist.tiers.findIndex((r) => r.row_id === rowId);
		if (idx === -1) return;

		const targetIdx = direction === "up" ? idx - 1 : idx + 1;
		if (targetIdx < 0 || targetIdx >= activeTierlist.tiers.length) return;

		const nextTiers = [...activeTierlist.tiers];
		const temp = nextTiers[targetIdx];
		nextTiers[targetIdx] = nextTiers[idx];
		nextTiers[idx] = temp;

		pushHistory({ ...activeTierlist, tiers: nextTiers });
	};

	const handleInsertRow = (
		targetRowId: string,
		position: "above" | "below",
	) => {
		if (!activeTierlist) return;
		const idx = activeTierlist.tiers.findIndex((r) => r.row_id === targetRowId);
		if (idx === -1) return;

		const insertIdx = position === "above" ? idx : idx + 1;
		const newRow: HydratedTierRow = {
			row_id: `row-${Date.now()}`,
			label: "MỚI",
			color_key: "cyan",
			description: null,
			items: [],
			item_count: 0,
			average_rating: null,
		};

		const nextTiers = [...activeTierlist.tiers];
		nextTiers.splice(insertIdx, 0, newRow);
		pushHistory({ ...activeTierlist, tiers: nextTiers });
	};

	const handleClearRow = (rowId: string) => {
		if (!activeTierlist) return;
		const targetRow = activeTierlist.tiers.find((r) => r.row_id === rowId);
		if (!targetRow || targetRow.items.length === 0) return;

		const returnedItems = targetRow.items;
		const updatedTiers = activeTierlist.tiers.map((r) =>
			r.row_id === rowId
				? { ...r, items: [], item_count: 0, average_rating: null }
				: r,
		);
		const updatedUnranked = [...activeTierlist.unranked_pool, ...returnedItems];

		const totalRanked = updatedTiers.reduce(
			(acc, r) => acc + r.items.length,
			0,
		);
		const totalManga = activeTierlist.analytics.total_creator_mangas;

		const nextState: TierlistDetail = {
			...activeTierlist,
			tiers: updatedTiers,
			unranked_pool: updatedUnranked,
			analytics: {
				...activeTierlist.analytics,
				ranked_count: totalRanked,
				unranked_count: updatedUnranked.length,
				completion_pct:
					totalManga > 0
						? Math.round((totalRanked / totalManga) * 1000) / 10
						: 0,
			},
		};

		pushHistory(nextState);
	};

	const handleDeleteRow = (rowId: string) => {
		if (!activeTierlist) return;
		if (activeTierlist.tiers.length <= 1) {
			setNoticeModal({
				isOpen: true,
				title: "Không thể xóa hàng",
				description:
					"Bảng xếp hạng cần duy trì tối thiểu 1 hàng để xếp các tác phẩm.",
				type: "warning",
			});
			return;
		}

		const targetRow = activeTierlist.tiers.find((r) => r.row_id === rowId);
		const returnedItems = targetRow?.items || [];

		const updatedTiers = activeTierlist.tiers.filter((r) => r.row_id !== rowId);
		const updatedUnranked = [...activeTierlist.unranked_pool, ...returnedItems];

		const totalRanked = updatedTiers.reduce(
			(acc, r) => acc + r.items.length,
			0,
		);
		const totalManga = activeTierlist.analytics.total_creator_mangas;

		const nextState: TierlistDetail = {
			...activeTierlist,
			tiers: updatedTiers,
			unranked_pool: updatedUnranked,
			analytics: {
				...activeTierlist.analytics,
				ranked_count: totalRanked,
				unranked_count: updatedUnranked.length,
				completion_pct:
					totalManga > 0
						? Math.round((totalRanked / totalManga) * 1000) / 10
						: 0,
			},
		};

		pushHistory(nextState);
	};

	// -------------------------------------------------------------------------
	// Save, Auto-Seed, Delete & Clone Operations
	// -------------------------------------------------------------------------

	const handleSave = async () => {
		if (!activeTierlist) return;
		try {
			setSaving(true);
			const payload = {
				title: activeTierlist.title,
				description: activeTierlist.description,
				category_tag: activeTierlist.category_tag,
				settings: activeTierlist.settings,
				tiers: activeTierlist.tiers.map((r) => ({
					row_id: r.row_id,
					label: r.label,
					color_key: r.color_key,
					description: r.description,
					items: r.items.map((i) => ({
						manga_id: i.manga_id,
						selected_cover_art_id: i.selected_cover_art_id,
						selected_minio_key: i.selected_minio_key,
						note: i.note,
					})),
				})),
				expected_revision: activeTierlist.revision,
			};

			const saved = await updateTierlist(activeTierlist._id, payload);
			setActiveTierlist(saved);
			setHistory([saved]);
			setHistoryIndex(0);
			markDirty(false);

			// Refresh summaries in background
			fetchCreatorTierlists(creatorName)
				.then(setSummaries)
				.catch(console.error);
		} catch (err: any) {
			if (err.response?.status === 409) {
				setNoticeModal({
					isOpen: true,
					title: "Xung đột phiên bản (409)",
					description:
						"Bảng xếp hạng này đã được cập nhật từ một phiên khác. Vui lòng tải lại trang để nhận dữ liệu mới nhất.",
					type: "warning",
				});
			} else {
				setNoticeModal({
					isOpen: true,
					title: "Lỗi lưu bảng xếp hạng",
					description:
						err.response?.data?.detail ||
						err.message ||
						"Không thể lưu các thay đổi lên máy chủ lúc này.",
					type: "error",
				});
			}
		} finally {
			setSaving(false);
		}
	};

	const handleAutoSeed = () => {
		if (!activeTierlist) return;
		setConfirmModal({
			isOpen: true,
			title: "Tự động phân bổ theo điểm số?",
			description:
				"Thao tác này sẽ tự động phân loại các manga có điểm cá nhân vào các hàng S, A, B, C, D dựa trên điểm đánh giá của bạn. Vị trí hiện tại trên bảng sẽ được cập nhật lại.",
			confirmText: "Xác nhận phân bổ",
			cancelText: "Hủy bỏ",
			variant: "primary",
			iconType: "sparkles",
			onConfirm: async () => {
				setConfirmModal((prev) => ({ ...prev, isOpen: false }));
				try {
					setLoading(true);
					const seeded = await autoSeedTierlist(activeTierlist._id);
					setActiveTierlist(seeded);
					setHistory([seeded]);
					setHistoryIndex(0);
					markDirty(false);
					setNoticeModal({
						isOpen: true,
						title: "Đã phân bổ thành công",
						description:
							"Toàn bộ tác phẩm có điểm số đã được tự động xếp vào các hàng tương ứng!",
						type: "success",
					});
				} catch (err: any) {
					setNoticeModal({
						isOpen: true,
						title: "Lỗi xếp hạng tự động",
						description:
							err.message || "Không thể tự động xếp hạng theo điểm lúc này.",
						type: "error",
					});
				} finally {
					setLoading(false);
				}
			},
		});
	};

	const handleCreateNew = async () => {
		if (!newTitle.trim()) return;
		try {
			setLoading(true);
			setShowCreateModal(false);

			const created = await createCreatorTierlist(creatorName, {
				title: newTitle.trim(),
				category_tag: newCategory.trim() || "Tổng hợp",
				preset: newPreset,
				auto_seed_by_rating: newAutoSeed,
			});

			setNewTitle("");
			await loadSummariesAndDetail(created._id);
		} catch (err: any) {
			setNoticeModal({
				isOpen: true,
				title: "Lỗi tạo bảng mới",
				description: err.message || "Không thể tạo bảng xếp hạng mới lúc này.",
				type: "error",
			});
		} finally {
			setLoading(false);
		}
	};

	const handleClone = async () => {
		if (!activeTierlist || !cloneTitle.trim()) return;
		try {
			setLoading(true);
			setShowCloneModal(false);

			const cloned = await cloneTierlist(
				activeTierlist._id,
				cloneTitle.trim(),
				cloneAsDefault,
			);

			setCloneTitle("");
			await loadSummariesAndDetail(cloned._id);
		} catch (err: any) {
			setNoticeModal({
				isOpen: true,
				title: "Lỗi nhân bản",
				description: err.message || "Không thể nhân bản bảng xếp hạng này.",
				type: "error",
			});
		} finally {
			setLoading(false);
		}
	};

	const handleDelete = () => {
		if (!activeTierlist) return;
		setConfirmModal({
			isOpen: true,
			title: `Xóa phiên bản "${activeTierlist.title}"?`,
			description: `Bạn có chắc chắn muốn xóa phiên bản bảng xếp hạng "${activeTierlist.title}"? Hành động này sẽ xóa vĩnh viễn phiên bản này và không thể hoàn tác.`,
			confirmText: "Xác nhận xóa",
			cancelText: "Hủy bỏ",
			variant: "destructive",
			iconType: "trash",
			onConfirm: async () => {
				setConfirmModal((prev) => ({ ...prev, isOpen: false }));
				try {
					setLoading(true);
					await deleteTierlist(activeTierlist._id);
					await loadSummariesAndDetail();
					setNoticeModal({
						isOpen: true,
						title: "Đã xóa thành công",
						description: `Phiên bản "${activeTierlist.title}" đã được xóa.`,
						type: "success",
					});
				} catch (err: any) {
					setNoticeModal({
						isOpen: true,
						title: "Lỗi xóa bảng",
						description: err.message || "Không thể xóa bảng xếp hạng này.",
						type: "error",
					});
				} finally {
					setLoading(false);
				}
			},
		});
	};

	const handleExportPng = async () => {
		if (!activeTierlist) return;
		try {
			setExportingPng(true);
			await exportTierlistToPng(activeTierlist);
		} catch (err: any) {
			console.error("Export PNG failed", err);
			setNoticeModal({
				isOpen: true,
				title: "Lỗi xuất ảnh PNG",
				description:
					err.message || "Không thể kết xuất ảnh bảng xếp hạng lúc này.",
				type: "error",
			});
		} finally {
			setExportingPng(false);
			setShowExportMenu(false);
		}
	};

	const handleCopyMarkdown = async () => {
		if (!activeTierlist) return;
		const md = generateTierlistMarkdown(activeTierlist);
		await navigator.clipboard.writeText(md);
		setCopiedMarkdown(true);
		setTimeout(() => setCopiedMarkdown(false), 2000);
	};

	// -------------------------------------------------------------------------
	// Render Views: Loading, Error, Empty, Normal
	// -------------------------------------------------------------------------

	if (loading) {
		return (
			<div className="py-24 flex flex-col items-center justify-center space-y-4">
				<div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
				<span className="text-xs text-muted-foreground font-medium">
					Đang nạp bảng xếp hạng và thư viện bìa...
				</span>
			</div>
		);
	}

	if (error && !activeTierlist) {
		return (
			<div className="max-w-md mx-auto py-16 text-center space-y-4">
				<div className="p-4 rounded-2xl bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20">
					{error}
				</div>
				<Button
					type="button"
					variant="outline"
					onClick={() => loadSummariesAndDetail()}
				>
					<RotateCw size={14} className="mr-2" />
					Thử lại
				</Button>
			</div>
		);
	}

	// Empty State: Author has 0 tierlists created
	if (!activeTierlist) {
		return (
			<div className="py-16 px-4 max-w-xl mx-auto text-center space-y-6 bg-card border border-border rounded-3xl p-8 shadow-sm">
				<div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
					<Layers size={32} />
				</div>

				<div className="space-y-2">
					<h3 className="text-2xl font-spartan font-extrabold text-foreground">
						Chưa có Bảng xếp hạng nào
					</h3>
					<p className="text-sm text-muted-foreground">
						Hãy tạo bảng xếp hạng đầu tiên cho tác giả{" "}
						<strong className="text-foreground">{creatorName}</strong> để sắp
						xếp và so sánh các tác phẩm theo tiêu chuẩn TierMaker chuyên nghiệp.
					</p>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
					<button
						type="button"
						onClick={async () => {
							try {
								setLoading(true);
								const created = await createCreatorTierlist(creatorName, {
									title: "Bảng xếp hạng tổng hợp",
									preset: "standard",
								});
								await loadSummariesAndDetail(created._id);
							} catch (e: any) {
								setNoticeModal({
									isOpen: true,
									title: "Lỗi khởi tạo mẫu",
									description:
										e.message || "Không thể tạo bảng xếp hạng mẫu lúc này.",
									type: "error",
								});
							} finally {
								setLoading(false);
							}
						}}
						className="p-4 rounded-2xl border border-border bg-background hover:border-primary hover:bg-primary/5 text-left transition space-y-1.5 shadow-xs"
					>
						<span className="font-bold text-xs text-foreground block">
							Chuẩn S - D
						</span>
						<p className="text-[11px] text-muted-foreground leading-snug">
							5 hàng S, A, B, C, D tiêu chuẩn quốc tế.
						</p>
					</button>

					<button
						type="button"
						onClick={async () => {
							try {
								setLoading(true);
								const created = await createCreatorTierlist(creatorName, {
									title: "Xếp theo điểm cá nhân",
									preset: "standard",
									auto_seed_by_rating: true,
								});
								await loadSummariesAndDetail(created._id);
							} catch (e: any) {
								setNoticeModal({
									isOpen: true,
									title: "Lỗi khởi tạo mẫu",
									description:
										e.message || "Không thể tạo bảng xếp hạng mẫu lúc này.",
									type: "error",
								});
							} finally {
								setLoading(false);
							}
						}}
						className="p-4 rounded-2xl border border-primary/40 bg-primary/10 hover:bg-primary/15 text-left transition space-y-1.5 shadow-xs"
					>
						<span className="font-bold text-xs text-primary flex items-center gap-1">
							<Sparkles size={13} />
							Tự xếp theo điểm
						</span>
						<p className="text-[11px] text-muted-foreground leading-snug">
							Tự động phân bổ vào S/A/B/C/D dựa trên điểm cá nhân.
						</p>
					</button>

					<button
						type="button"
						onClick={async () => {
							try {
								setLoading(true);
								const created = await createCreatorTierlist(creatorName, {
									title: "Góc nhìn phê bình",
									preset: "critic",
								});
								await loadSummariesAndDetail(created._id);
							} catch (e: any) {
								setNoticeModal({
									isOpen: true,
									title: "Lỗi khởi tạo mẫu",
									description:
										e.message || "Không thể tạo bảng xếp hạng mẫu lúc này.",
									type: "error",
								});
							} finally {
								setLoading(false);
							}
						}}
						className="p-4 rounded-2xl border border-border bg-background hover:border-primary hover:bg-primary/5 text-left transition space-y-1.5 shadow-xs"
					>
						<span className="font-bold text-xs text-foreground block">
							Tiêu chí Phê bình
						</span>
						<p className="text-[11px] text-muted-foreground leading-snug">
							Tuyệt tác, Xuất sắc, Đáng đọc, Gây thất vọng.
						</p>
					</button>
				</div>

				{/* Notice Modal in empty state */}
				<NoticeModal
					isOpen={noticeModal.isOpen}
					onClose={() => setNoticeModal((prev) => ({ ...prev, isOpen: false }))}
					title={noticeModal.title}
					description={noticeModal.description}
					type={noticeModal.type}
					actionText={noticeModal.actionText}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Top Management Bar */}
			<div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 rounded-2xl bg-card border border-border shadow-xs">
				{/* Version Switcher */}
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
						Phiên bản ({summaries.length}):
					</span>
					<div className="flex flex-wrap items-center gap-1.5">
						{summaries.map((s) => {
							const isActive = s._id === activeTierlist._id;
							return (
								<button
									key={s._id}
									type="button"
									onClick={() => handleSelectVersion(s._id)}
									className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
										isActive
											? "bg-primary text-primary-foreground shadow-xs"
											: "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
									}`}
								>
									{s.is_default && <Star size={11} className="fill-current" />}
									<span className="truncate max-w-[140px] sm:max-w-[200px]">
										{s.title}
									</span>
									<span className="opacity-75 text-[10px]">
										(v{s.revision})
									</span>
								</button>
							);
						})}
					</div>

					{isDirty && (
						<span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-[10px] border border-amber-500/30 animate-pulse">
							Chưa lưu
						</span>
					)}
				</div>

				{/* Version Action Buttons */}
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setShowCreateModal(true)}
					>
						<Plus size={14} className="mr-1.5" />
						Tạo mới
					</Button>

					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => {
							setCloneTitle(`${activeTierlist.title} (Bản sao)`);
							setShowCloneModal(true);
						}}
					>
						<Copy size={14} className="mr-1.5" />
						Nhân bản
					</Button>

					{summaries.length > 1 && (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setShowCompareModal(true)}
						>
							<GitCompare size={14} className="mr-1.5" />
							So sánh
						</Button>
					)}

					<Button
						type="button"
						size="sm"
						variant="outline"
						className="text-destructive hover:bg-destructive/10"
						onClick={handleDelete}
					>
						<Trash2 size={14} className="mr-1.5" />
						Xóa
					</Button>
				</div>
			</div>

			{/* Board Toolbar */}
			<div className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-4">
				<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
					{/* Editable Title & Metadata */}
					<div className="space-y-1 w-full md:max-w-md">
						<input
							type="text"
							value={activeTierlist.title}
							onChange={(e) =>
								pushHistory({ ...activeTierlist, title: e.target.value })
							}
							className="text-xl md:text-2xl font-spartan font-extrabold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary outline-hidden w-full transition"
						/>
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<span>Phân loại:</span>
							<input
								type="text"
								value={activeTierlist.category_tag}
								onChange={(e) =>
									pushHistory({
										...activeTierlist,
										category_tag: e.target.value,
									})
								}
								className="px-2 py-0.5 rounded-md bg-muted text-foreground text-xs font-semibold outline-hidden focus:ring-1 focus:ring-primary w-28"
							/>
							<span>· Tiến độ: {activeTierlist.analytics.completion_pct}%</span>
						</div>
					</div>

					{/* Action Buttons: Undo/Redo, Auto-Seed, Export, Save */}
					<div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
						{/* Undo / Redo */}
						<div className="inline-flex rounded-xl border border-border bg-background p-0.5">
							<button
								type="button"
								disabled={historyIndex <= 0}
								onClick={handleUndo}
								title="Hoàn tác (Undo)"
								className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition"
							>
								<Undo2 size={15} />
							</button>
							<button
								type="button"
								disabled={historyIndex >= history.length - 1}
								onClick={handleRedo}
								title="Làm lại (Redo)"
								className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition"
							>
								<Redo2 size={15} />
							</button>
						</div>

						{/* Auto-Seed */}
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={handleAutoSeed}
							title="Tự động phân loại vào các hàng dựa trên điểm cá nhân"
						>
							<Sparkles size={14} className="mr-1.5 text-primary" />
							Xếp theo điểm
						</Button>

						{/* Export Menu */}
						<div className="relative">
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => setShowExportMenu((prev) => !prev)}
							>
								<Download size={14} className="mr-1.5" />
								Xuất bảng
							</Button>

							{showExportMenu && (
								<>
									<button
										type="button"
										aria-label="Đóng menu xuất"
										className="fixed inset-0 z-40 cursor-default bg-transparent border-0"
										onClick={() => setShowExportMenu(false)}
									/>
									<div className="absolute right-0 top-full mt-1 w-52 rounded-2xl bg-popover text-popover-foreground border border-border shadow-xl p-1.5 z-50 flex flex-col gap-1 text-xs animate-in fade-in-50 zoom-in-95">
										<button
											type="button"
											disabled={exportingPng}
											onClick={handleExportPng}
											className="flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-accent transition font-medium"
										>
											<ImageIcon size={14} className="text-primary" />
											<span>
												{exportingPng
													? "Đang dựng ảnh..."
													: "Xuất ảnh PNG sắc nét"}
											</span>
										</button>
										<button
											type="button"
											onClick={handleCopyMarkdown}
											className="flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-accent transition font-medium"
										>
											{copiedMarkdown ? (
												<Check size={14} className="text-emerald-500" />
											) : (
												<Copy size={14} className="text-muted-foreground" />
											)}
											<span>
												{copiedMarkdown
													? "Đã sao chép Markdown!"
													: "Sao chép Markdown"}
											</span>
										</button>
										<button
											type="button"
											onClick={() => {
												exportTierlistToMarkdown(activeTierlist);
												setShowExportMenu(false);
											}}
											className="flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-accent transition font-medium"
										>
											<FileText size={14} className="text-muted-foreground" />
											<span>Tải file Markdown (.md)</span>
										</button>
										<button
											type="button"
											onClick={() => {
												exportTierlistToJson(activeTierlist);
												setShowExportMenu(false);
											}}
											className="flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-accent transition font-medium"
										>
											<FileDown size={14} className="text-muted-foreground" />
											<span>Tải file JSON (.json)</span>
										</button>
									</div>
								</>
							)}
						</div>

						{/* Save Button */}
						<Button
							type="button"
							size="sm"
							disabled={saving || !isDirty}
							onClick={handleSave}
							className="font-bold"
						>
							<Save size={14} className="mr-1.5" />
							{saving ? "Đang lưu..." : "Lưu thay đổi"}
						</Button>
					</div>
				</div>

				{/* Display Settings Toggles */}
				<div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
					<div className="flex flex-wrap items-center gap-3">
						{/* Aspect Ratio */}
						<div className="flex items-center gap-1.5">
							<span className="text-muted-foreground font-semibold">
								Tỷ lệ thẻ:
							</span>
							<button
								type="button"
								onClick={() =>
									pushHistory({
										...activeTierlist,
										settings: {
											...activeTierlist.settings,
											card_aspect: "portrait",
										},
									})
								}
								className={`px-2 py-1 rounded-md text-[11px] font-bold transition ${
									activeTierlist.settings.card_aspect === "portrait"
										? "bg-primary/10 text-primary border border-primary/30"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								Dọc 2:3
							</button>
							<button
								type="button"
								onClick={() =>
									pushHistory({
										...activeTierlist,
										settings: {
											...activeTierlist.settings,
											card_aspect: "square",
										},
									})
								}
								className={`px-2 py-1 rounded-md text-[11px] font-bold transition ${
									activeTierlist.settings.card_aspect === "square"
										? "bg-primary/10 text-primary border border-primary/30"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								Vuông 1:1
							</button>
						</div>

						{/* Card Size */}
						<div className="flex items-center gap-1.5">
							<span className="text-muted-foreground font-semibold">
								Cỡ thẻ:
							</span>
							{(["compact", "normal", "large"] as CardSize[]).map((sz) => (
								<button
									key={sz}
									type="button"
									onClick={() =>
										pushHistory({
											...activeTierlist,
											settings: {
												...activeTierlist.settings,
												card_size: sz,
											},
										})
									}
									className={`px-2 py-1 rounded-md text-[11px] capitalize font-bold transition ${
										activeTierlist.settings.card_size === sz
											? "bg-primary/10 text-primary border border-primary/30"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									{sz}
								</button>
							))}
						</div>
					</div>

					{/* Layout Mode & Toggles */}
					<div className="flex flex-wrap items-center gap-4">
						{/* Layout Mode Switcher */}
						<div className="flex items-center gap-1.5">
							<span className="text-muted-foreground font-semibold">
								Bố cục:
							</span>
							<button
								type="button"
								onClick={() => setLayoutMode("split")}
								className={`px-2 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
									layoutMode === "split"
										? "bg-primary/10 text-primary border border-primary/30"
										: "text-muted-foreground hover:text-foreground"
								}`}
								title="Hiển thị 2 cột song song (Tierlist bên trái, Kho thẻ bên phải)"
							>
								<Columns2 size={13} />
								<span className="hidden sm:inline">2 Cột song song</span>
							</button>
							<button
								type="button"
								onClick={() => setLayoutMode("stacked")}
								className={`px-2 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1 ${
									layoutMode === "stacked"
										? "bg-primary/10 text-primary border border-primary/30"
										: "text-muted-foreground hover:text-foreground"
								}`}
								title="Xếp chồng dọc (Tierlist ở trên, Kho thẻ ở dưới)"
							>
								<Rows2 size={13} />
								<span className="hidden sm:inline">Xếp chồng dọc</span>
							</button>
							{layoutMode === "split" && (
								<div className="hidden lg:flex items-center gap-1 pl-1.5 border-l border-border text-[10px] text-muted-foreground">
									<span>Tỷ lệ:</span>
									<button
										type="button"
										onClick={() => setSplitRatio(50)}
										className={`px-1.5 py-0.5 rounded transition ${
											splitRatio === 50
												? "font-bold text-primary bg-primary/10"
												: "hover:text-foreground"
										}`}
									>
										50:50
									</button>
									<button
										type="button"
										onClick={() => setSplitRatio(58)}
										className={`px-1.5 py-0.5 rounded transition ${
											splitRatio === 58
												? "font-bold text-primary bg-primary/10"
												: "hover:text-foreground"
										}`}
									>
										60:40
									</button>
									<button
										type="button"
										onClick={() => setSplitRatio(70)}
										className={`px-1.5 py-0.5 rounded transition ${
											splitRatio === 70
												? "font-bold text-primary bg-primary/10"
												: "hover:text-foreground"
										}`}
									>
										70:30
									</button>
								</div>
							)}
						</div>

						{/* Toggles: Title & Rating */}
						<div className="flex items-center gap-4 border-l border-border pl-3">
							<label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
								<input
									type="checkbox"
									checked={activeTierlist.settings.show_title}
									onChange={(e) =>
										pushHistory({
											...activeTierlist,
											settings: {
												...activeTierlist.settings,
												show_title: e.target.checked,
											},
										})
									}
									className="rounded text-primary focus:ring-primary"
								/>
								<span>Hiện tên truyện</span>
							</label>

							<label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
								<input
									type="checkbox"
									checked={activeTierlist.settings.show_rating}
									onChange={(e) =>
										pushHistory({
											...activeTierlist,
											settings: {
												...activeTierlist.settings,
												show_rating: e.target.checked,
											},
										})
									}
									className="rounded text-primary focus:ring-primary"
								/>
								<span>Hiện điểm số</span>
							</label>
						</div>
					</div>
				</div>
			</div>

			{/* Board & Pool Workspace Area */}
			{layoutMode === "split" ? (
				<div
					ref={splitContainerRef}
					className="flex flex-col lg:flex-row items-stretch lg:items-start relative gap-4 lg:gap-0"
				>
					{/* Left Column: Tier Rows */}
					<div
						className="w-full lg:flex-shrink-0 space-y-3"
						style={{
							width: isLargeScreen ? `calc(${splitRatio}% - 10px)` : "100%",
						}}
					>
						{activeTierlist.tiers.map((row, idx) => (
							<TierRow
								key={row.row_id}
								row={row}
								rowIndex={idx}
								totalRows={activeTierlist.tiers.length}
								allRows={activeTierlist.tiers}
								settings={activeTierlist.settings}
								onDropManga={handleDropManga}
								onQuickMove={handleQuickMove}
								onMoveWithinRow={handleMoveWithinRow}
								onCustomizeItem={(item) => setCustomizingItem(item)}
								onUpdateRowLabel={handleUpdateRowLabel}
								onUpdateRowColor={handleUpdateRowColor}
								onUpdateRowDescription={handleUpdateRowDescription}
								onMoveRow={handleMoveRow}
								onInsertRow={handleInsertRow}
								onClearRow={handleClearRow}
								onDeleteRow={handleDeleteRow}
							/>
						))}
					</div>

					{/* Resizable Divider Handle (Desktop only) */}
					<div
						onMouseDown={handleMouseDownResize}
						className={`hidden lg:flex flex-col items-center justify-center w-5 -mx-0.5 z-20 cursor-col-resize select-none group relative transition-colors self-stretch min-h-[400px] ${
							isResizing ? "bg-primary/20" : "hover:bg-primary/10"
						}`}
						title="Kéo sang trái/phải để điều chỉnh độ rộng 2 cột (Nhấp đúp để đặt lại 60:40)"
						onDoubleClick={() => setSplitRatio(58)}
					>
						<div
							className={`w-1.5 h-28 rounded-full transition-colors ${
								isResizing
									? "bg-primary ring-2 ring-primary/30"
									: "bg-border group-hover:bg-primary/80"
							}`}
						/>
						<div
							className={`absolute top-4 px-2 py-0.5 rounded-md bg-popover text-popover-foreground text-[10px] font-bold border border-border shadow-md whitespace-nowrap pointer-events-none transition-opacity ${
								isResizing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
							}`}
						>
							{Math.round(splitRatio)}% : {Math.round(100 - splitRatio)}%
						</div>
					</div>

					{/* Right Column: Unranked Manga Pool */}
					<div
						className="w-full lg:flex-shrink-0 lg:sticky lg:top-4"
						style={{
							width: isLargeScreen
								? `calc(${100 - splitRatio}% - 10px)`
								: "100%",
						}}
					>
						<UnrankedMangaPool
							unrankedPool={activeTierlist.unranked_pool}
							excludedPool={activeTierlist.excluded_pool}
							settings={activeTierlist.settings}
							isSplitLayout={true}
							availableRows={activeTierlist.tiers.map((r) => ({
								row_id: r.row_id,
								label: r.label,
								color_key: r.color_key,
							}))}
							onQuickMove={handleQuickMove}
							onRestoreExcluded={handleRestoreExcluded}
							onCustomizeItem={(item) => setCustomizingItem(item)}
							onDropMangaToPool={handleDropMangaToPool}
						/>
					</div>
				</div>
			) : (
				/* Stacked Mode: Tierlist on top, Unranked Pool below */
				<div className="space-y-6">
					<div className="space-y-3">
						{activeTierlist.tiers.map((row, idx) => (
							<TierRow
								key={row.row_id}
								row={row}
								rowIndex={idx}
								totalRows={activeTierlist.tiers.length}
								allRows={activeTierlist.tiers}
								settings={activeTierlist.settings}
								onDropManga={handleDropManga}
								onQuickMove={handleQuickMove}
								onMoveWithinRow={handleMoveWithinRow}
								onCustomizeItem={(item) => setCustomizingItem(item)}
								onUpdateRowLabel={handleUpdateRowLabel}
								onUpdateRowColor={handleUpdateRowColor}
								onUpdateRowDescription={handleUpdateRowDescription}
								onMoveRow={handleMoveRow}
								onInsertRow={handleInsertRow}
								onClearRow={handleClearRow}
								onDeleteRow={handleDeleteRow}
							/>
						))}
					</div>

					<UnrankedMangaPool
						unrankedPool={activeTierlist.unranked_pool}
						excludedPool={activeTierlist.excluded_pool}
						settings={activeTierlist.settings}
						isSplitLayout={false}
						availableRows={activeTierlist.tiers.map((r) => ({
							row_id: r.row_id,
							label: r.label,
							color_key: r.color_key,
						}))}
						onQuickMove={handleQuickMove}
						onRestoreExcluded={handleRestoreExcluded}
						onCustomizeItem={(item) => setCustomizingItem(item)}
						onDropMangaToPool={handleDropMangaToPool}
					/>
				</div>
			)}

			{/* Modal: Customize Item (Volume Cover / Note) */}
			<TierItemCustomizeModal
				item={customizingItem}
				isOpen={Boolean(customizingItem)}
				onClose={() => setCustomizingItem(null)}
				onApply={handleApplyCustomization}
			/>

			{/* Modal: Create New Version */}
			<Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
				<DialogContent className="max-w-md p-6">
					<DialogHeader>
						<DialogTitle className="font-spartan font-bold text-lg">
							Tạo bảng xếp hạng mới
						</DialogTitle>
						<DialogDescription>
							Khởi tạo bảng xếp hạng mới cho tác giả {creatorName}.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-2">
						<div className="space-y-1.5">
							<label
								htmlFor="new-tierlist-title"
								className="text-xs font-bold text-foreground block"
							>
								Tiêu đề bảng:
							</label>
							<input
								id="new-tierlist-title"
								type="text"
								value={newTitle}
								onChange={(e) => setNewTitle(e.target.value)}
								placeholder="Ví dụ: Bảng xếp hạng 2026, Oneshot hay nhất..."
								className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs outline-hidden focus:ring-1 focus:ring-primary"
							/>
						</div>

						<div className="space-y-1.5">
							<label
								htmlFor="new-tierlist-category"
								className="text-xs font-bold text-foreground block"
							>
								Phân loại / Thẻ danh mục:
							</label>
							<input
								id="new-tierlist-category"
								type="text"
								value={newCategory}
								onChange={(e) => setNewCategory(e.target.value)}
								className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs outline-hidden focus:ring-1 focus:ring-primary"
							/>
						</div>

						<div className="space-y-1.5">
							<label
								htmlFor="new-tierlist-preset"
								className="text-xs font-bold text-foreground block"
							>
								Mẫu hàng có sẵn (Preset):
							</label>
							<select
								id="new-tierlist-preset"
								value={newPreset}
								onChange={(e) => setNewPreset(e.target.value as PresetKind)}
								className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs outline-hidden focus:ring-1 focus:ring-primary"
							>
								<option value="standard">Chuẩn S, A, B, C, D</option>
								<option value="critic">
									Góc nhìn phê bình (Tuyệt tác, Xuất sắc...)
								</option>
								<option value="score_based">
									Theo thang điểm (9-10, 8-8.5...)
								</option>
								<option value="empty">Trống (1 hàng S mặc định)</option>
							</select>
						</div>

						<label className="flex items-center gap-2 cursor-pointer text-xs pt-1">
							<input
								type="checkbox"
								checked={newAutoSeed}
								onChange={(e) => setNewAutoSeed(e.target.checked)}
								className="rounded text-primary focus:ring-primary"
							/>
							<span>Tự động xếp hạng ban đầu theo điểm cá nhân</span>
						</label>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setShowCreateModal(false)}
						>
							Hủy bỏ
						</Button>
						<Button
							type="button"
							disabled={!newTitle.trim()}
							onClick={handleCreateNew}
						>
							Tạo bảng
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Modal: Clone Version */}
			<Dialog open={showCloneModal} onOpenChange={setShowCloneModal}>
				<DialogContent className="max-w-md p-6">
					<DialogHeader>
						<DialogTitle className="font-spartan font-bold text-lg">
							Nhân bản Bảng xếp hạng
						</DialogTitle>
						<DialogDescription>
							Tạo một bản sao độc lập từ bảng hiện tại để thử nghiệm cấu hình
							mới.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-2">
						<div className="space-y-1.5">
							<label
								htmlFor="clone-tierlist-title"
								className="text-xs font-bold text-foreground block"
							>
								Tiêu đề bản sao mới:
							</label>
							<input
								id="clone-tierlist-title"
								type="text"
								value={cloneTitle}
								onChange={(e) => setCloneTitle(e.target.value)}
								className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs outline-hidden focus:ring-1 focus:ring-primary"
							/>
						</div>

						<label className="flex items-center gap-2 cursor-pointer text-xs">
							<input
								type="checkbox"
								checked={cloneAsDefault}
								onChange={(e) => setCloneAsDefault(e.target.checked)}
								className="rounded text-primary focus:ring-primary"
							/>
							<span>Đặt bản sao này làm mặc định cho tác giả</span>
						</label>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setShowCloneModal(false)}
						>
							Hủy bỏ
						</Button>
						<Button
							type="button"
							disabled={!cloneTitle.trim()}
							onClick={handleClone}
						>
							Nhân bản ngay
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Modal: Compare Versions */}
			<TierlistVersionCompareModal
				creatorName={creatorName}
				availableVersions={summaries}
				currentTierlistId={activeTierlist._id}
				isOpen={showCompareModal}
				onClose={() => setShowCompareModal(false)}
			/>

			{/* Shared Confirm Modal */}
			<ConfirmModal
				isOpen={confirmModal.isOpen}
				onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
				onConfirm={confirmModal.onConfirm}
				title={confirmModal.title}
				description={confirmModal.description}
				confirmText={confirmModal.confirmText}
				cancelText={confirmModal.cancelText}
				variant={confirmModal.variant}
				iconType={confirmModal.iconType}
			/>

			{/* Shared Notice Modal */}
			<NoticeModal
				isOpen={noticeModal.isOpen}
				onClose={() => setNoticeModal((prev) => ({ ...prev, isOpen: false }))}
				title={noticeModal.title}
				description={noticeModal.description}
				type={noticeModal.type}
				actionText={noticeModal.actionText}
			/>
		</div>
	);
};
