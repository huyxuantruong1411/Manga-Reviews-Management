import { BookOpen, Star, User } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import client from "../../api/client";
import { useMangaBlur } from "../../hooks/useMangaBlur";
import { BlurredCover } from "../ui/BlurredCover";
import { Skeleton } from "../ui/skeleton";

interface MangaReferenceTooltipProps {
	mangaId: string;
	position: { top: number; left: number };
	onClose: () => void;
	onMouseEnter?: () => void;
}

interface MangaData {
	_id: string;
	title: string;
	cover_url: string | null;
	author?: string;
	status?: string;
	personal_rating?: number | null;
	content_rating?: string | null;
	tag_ids?: string[];
}

// Module-level cache to prevent duplicate fetches
const mangaCache: Record<string, MangaData> = {};

export const MangaReferenceTooltip: React.FC<MangaReferenceTooltipProps> = ({
	mangaId,
	position,
	onClose,
	onMouseEnter,
}) => {
	const [data, setData] = useState<MangaData | null>(
		mangaCache[mangaId] || null,
	);
	const [loading, setLoading] = useState(!data);
	const [error, setError] = useState<string | null>(null);
	const { settings, shouldBlur } = useMangaBlur();

	useEffect(() => {
		if (data) return;

		let isMounted = true;
		setLoading(true);
		setError(null);

		client
			.get(`/api/manga/resolve-reference/${mangaId}`)
			.then((res) => {
				if (isMounted) {
					mangaCache[mangaId] = res.data;
					setData(res.data);
				}
			})
			.catch((err) => {
				console.error("Failed to fetch manga ref info", err);
				if (isMounted) {
					setError("Không thể tải thông tin");
				}
			})
			.finally(() => {
				if (isMounted) {
					setLoading(false);
				}
			});

		return () => {
			isMounted = false;
		};
	}, [mangaId, data]);

	// Close tooltip when mouse leaves the tooltip area
	const handleMouseLeave = () => {
		onClose();
	};

	return (
		<div
			onMouseEnter={onMouseEnter}
			onMouseLeave={handleMouseLeave}
			className="fixed z-[100] bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl shadow-2xl p-4 flex space-x-4 max-w-sm animate-in fade-in zoom-in duration-200"
			style={{
				top: position.top,
				left: position.left,
				transform: "translate(-50%, -105%)", // Position above the link
			}}
		>
			{loading && (
				<div role="status" aria-busy="true" className="flex space-x-3 w-64">
					<span className="sr-only">Đang tải thông tin manga...</span>
					<Skeleton className="w-16 h-24 rounded-lg shrink-0" />
					<div className="space-y-2 flex-1 pt-1">
						<Skeleton className="h-4 w-full rounded" />
						<Skeleton className="h-3 w-3/4 rounded" />
						<Skeleton className="h-3 w-1/2 rounded" />
					</div>
				</div>
			)}

			{error && (
				<div className="text-xs text-red-500 font-semibold py-2">{error}</div>
			)}

			{data && !loading && !error && (
				<>
					{data.cover_url ? (
						<BlurredCover
							src={data.cover_url}
							alt={data.title}
							className="w-16 h-24 object-cover rounded-lg shadow-sm border border-[var(--border-primary)] shrink-0"
							shouldBlur={shouldBlur(data)}
						/>
					) : (
						<div className="w-16 h-24 bg-gray-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center border border-[var(--border-primary)] shrink-0">
							<BookOpen size={20} className="text-[var(--text-secondary)]" />
						</div>
					)}

					<div className="space-y-1.5 flex-1 min-w-0">
						<h4 className="text-xs font-bold text-[var(--text-primary)] line-clamp-2 leading-tight">
							{data.title}
						</h4>

						{data.author && (
							<div className="flex items-center space-x-1.5 text-[10px] text-[var(--text-secondary)] font-semibold">
								<User size={10} className="shrink-0" />
								<span className="truncate">{data.author}</span>
							</div>
						)}

						{data.status && (
							<div className="flex items-center space-x-1.5 text-[10px] text-[var(--text-secondary)] font-semibold">
								<BookOpen size={10} className="shrink-0" />
								<span>{data.status}</span>
							</div>
						)}

						{data.personal_rating !== undefined &&
							data.personal_rating !== null && (
								<div
									className={`flex items-center space-x-1 text-[10px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded w-max ${settings.enabled && settings.hideRating ? "blur-[4px] pointer-events-none select-none" : ""}`}
								>
									<Star size={10} fill="currentColor" />
									<span>{data.personal_rating} / 10</span>
								</div>
							)}
					</div>
				</>
			)}
		</div>
	);
};
