import {
	Calendar,
	Globe,
	Image as ImageIcon,
	RefreshCw,
	X,
	ZoomIn,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import client from "../../api/client";
import { useAlert } from "../../hooks/useAlert";

interface CoverArt {
	_id: string;
	manga_id: string;
	mangadex_manga_id: string;
	mangadex_cover_id: string;
	volume: string | null;
	description: string | null;
	locale: string | null;
	file_name: string;
	minio_key: string;
	source_url: string;
	cover_url?: string;
	created_at: string;
}

interface CoverArtGalleryProps {
	mangaId: string;
	onCoversCountChange?: (count: number) => void;
}

export const CoverArtGallery: React.FC<CoverArtGalleryProps> = ({
	mangaId,
	onCoversCountChange,
}) => {
	const [covers, setCovers] = useState<CoverArt[]>([]);
	const [loading, setLoading] = useState(true);
	const [syncing, setSyncing] = useState(false);
	const [syncProgress, setSyncProgress] = useState(0);
	const [syncLogs, setSyncLogs] = useState<string[]>([]);
	const [selectedCover, setSelectedCover] = useState<CoverArt | null>(null);
	const { showAlert } = useAlert();

	const addLog = (msg: string) => {
		const timestamp = new Date().toLocaleTimeString();
		setSyncLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
	};

	const fetchCovers = async () => {
		try {
			setLoading(true);
			const res = await client.get(`/api/manga/${mangaId}/covers`);
			setCovers(res.data);
			if (onCoversCountChange) {
				onCoversCountChange(res.data.length);
			}
		} catch (err) {
			console.error("Failed to fetch cover arts:", err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (mangaId) {
			fetchCovers();
		}
	}, [mangaId]);

	const handleSyncCovers = async () => {
		let statusInterval: any = null;
		setSyncLogs([]);
		setSyncProgress(5);
		setSyncing(true);
		addLog("Initializing covers sync process...");

		let tick = 0;
		statusInterval = setInterval(() => {
			tick++;
			setSyncProgress((prev) => Math.min(prev + 8, 95));
			if (tick === 1) addLog("Connecting to MangaDex cover database...");
			if (tick === 2) addLog("Scanning volume list & language locales...");
			if (tick === 3) addLog("Downloading original cover art image bytes...");
			if (tick === 4) addLog("Uploading cover art assets to MinIO bucket...");
			if (tick === 5)
				addLog("Generating optimized preview thumbnails (256px/512px)...");
			if (tick === 6) addLog("Indexing new covers in MongoDB collections...");
		}, 1500);

		try {
			const res = await client.post(`/api/manga/${mangaId}/covers/sync`);
			if (statusInterval) clearInterval(statusInterval);
			setSyncProgress(100);
			addLog(
				`Covers sync complete! Successfully cached ${res.data.covers_synced} covers. (${res.data.covers_failed} failed)`,
			);

			showAlert({
				title: "Sync Completed",
				message: `Successfully synced ${res.data.covers_synced} covers. (${res.data.covers_failed} failed)`,
				type: res.data.covers_failed > 0 ? "warning" : "success",
			});
			fetchCovers();
		} catch (err: any) {
			if (statusInterval) clearInterval(statusInterval);
			setSyncProgress(100);
			addLog("Covers sync failed due to server or connection error.");
			console.error("Failed to sync covers:", err);
			showAlert({
				title: "Sync Failed",
				message:
					err.response?.data?.detail ||
					"An error occurred while syncing covers.",
				type: "error",
			});
		} finally {
			setSyncing(false);
		}
	};

	if (loading) {
		return (
			<div className="space-y-6">
				<div className="flex justify-between items-center">
					<div className="h-6 w-32 bg-[var(--border-primary)] rounded animate-pulse" />
					<div className="h-10 w-36 bg-[var(--border-primary)] rounded-lg animate-pulse" />
				</div>
				<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							key={i}
							className="aspect-[2/3] w-full bg-[var(--border-primary)] rounded-xl animate-pulse"
						/>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header Panel */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-primary)] pb-4">
				<div>
					<h3 className="text-lg font-bold text-[var(--text-primary)]">
						Cover Art Gallery
					</h3>
					<p className="text-sm text-[var(--text-secondary)]">
						Total of {covers.length} cover art{covers.length !== 1 ? "s" : ""}{" "}
						synced for this title.
					</p>
				</div>
				<button
					onClick={handleSyncCovers}
					disabled={syncing}
					className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-orange)] text-white hover:bg-[var(--brand-coral)] disabled:opacity-50 disabled:cursor-not-allowed font-medium rounded-xl transition-all cursor-pointer shadow-sm shadow-[var(--brand-orange)]/10"
				>
					<RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
					{syncing ? "Syncing..." : "Sync Cover Arts"}
				</button>
			</div>

			{/* Sync progress banner */}
			{(syncing || syncProgress > 0) && (
				<div className="p-5 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl space-y-4 animate-in fade-in duration-200">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<RefreshCw
								className={`text-[var(--brand-orange)] shrink-0 ${syncing ? "animate-spin" : ""}`}
								size={20}
							/>
							<div>
								<span className="font-bold text-sm text-[var(--text-primary)] block">
									Syncing Cover Arts
								</span>
								<span className="text-xs text-[var(--text-secondary)]">
									{syncing
										? "Synchronizing with MangaDex servers..."
										: "Sync finished."}
								</span>
							</div>
						</div>
						{syncProgress > 0 && (
							<span className="text-sm font-extrabold text-[var(--brand-orange)]">
								{syncProgress}%
							</span>
						)}
					</div>

					{/* Progress bar */}
					<div className="w-full bg-zinc-200 dark:bg-zinc-850 h-2 rounded-full overflow-hidden border border-zinc-200/20 dark:border-zinc-850">
						<div
							className="bg-gradient-to-r from-orange-500 to-amber-500 h-full transition-all duration-300 rounded-full"
							style={{ width: `${syncProgress}%` }}
						/>
					</div>

					{/* Console logs */}
					<div className="h-28 bg-zinc-950 text-green-400 font-mono text-[10px] p-3 rounded-xl overflow-y-auto border border-zinc-900 space-y-0.5 scrollbar-thin scrollbar-thumb-zinc-855">
						{syncLogs.map((log, idx) => (
							<div key={idx} className="leading-normal whitespace-pre-wrap">
								{log}
							</div>
						))}
					</div>

					{!syncing && (
						<div className="flex justify-end pt-1">
							<button
								onClick={() => {
									setSyncProgress(0);
									setSyncLogs([]);
								}}
								className="px-4 py-1.5 border border-[var(--border-primary)] hover:bg-gray-50 dark:hover:bg-zinc-850 text-[var(--text-primary)] text-xs font-bold rounded-lg transition cursor-pointer"
							>
								Close Progress Console
							</button>
						</div>
					)}
				</div>
			)}

			{/* Empty State */}
			{covers.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-16 px-4 bg-[var(--bg-card)] border border-dashed border-[var(--border-primary)] rounded-2xl text-center">
					<div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-zinc-850 flex items-center justify-center text-[var(--brand-orange)] mb-4">
						<ImageIcon size={32} />
					</div>
					<h4 className="text-lg font-bold text-[var(--text-primary)] mb-1">
						No Covers Synced
					</h4>
					<p className="text-sm text-[var(--text-secondary)] max-w-sm mb-6">
						We haven't synced all cover arts from MangaDex for this manga yet.
						Click below to download them all.
					</p>
					<button
						onClick={handleSyncCovers}
						disabled={syncing}
						className="flex items-center gap-2 px-5 py-2.5 bg-[var(--brand-orange)] text-white hover:bg-[var(--brand-coral)] font-medium rounded-xl transition-all cursor-pointer shadow-sm"
					>
						<RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
						{syncing ? "Syncing..." : "Sync Now"}
					</button>
				</div>
			) : (
				/* Grid Display */
				<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
					{covers.map((cover) => (
						<div
							key={cover._id}
							onClick={() => setSelectedCover(cover)}
							className="group relative flex flex-col bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--brand-orange)] rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl cursor-pointer hover:-translate-y-1"
						>
							{/* Cover Image */}
							<div className="relative aspect-[2/3] w-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
								{cover.cover_url ? (
									<img
										src={cover.cover_url}
										alt={cover.volume ? `Volume ${cover.volume}` : "Cover Art"}
										className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
										loading="lazy"
									/>
								) : (
									<div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
										<ImageIcon size={32} />
									</div>
								)}

								{/* Overlay with Zoom Icon */}
								<div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
									<div className="p-3 bg-white/20 backdrop-blur-md text-white rounded-full scale-75 group-hover:scale-100 transition-all duration-300">
										<ZoomIn size={20} />
									</div>
								</div>

								{/* Volume Badge */}
								<div className="absolute top-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-md text-white text-xs font-semibold rounded-full shadow-sm">
									{cover.volume ? `Vol. ${cover.volume}` : "Oneshot / Special"}
								</div>
							</div>

							{/* Cover Details */}
							<div className="p-3.5 flex-1 flex flex-col justify-between">
								<div className="space-y-1">
									<div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
										<Globe size={12} />
										<span className="uppercase">
											{cover.locale || "unknown"}
										</span>
									</div>
									{cover.description && (
										<p className="text-xs text-[var(--text-secondary)] line-clamp-2 italic">
											"{cover.description}"
										</p>
									)}
								</div>
								{cover.created_at && (
									<div className="mt-2.5 flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
										<Calendar size={10} />
										<span>
											{new Date(cover.created_at).toLocaleDateString(
												undefined,
												{
													year: "numeric",
													month: "short",
												},
											)}
										</span>
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			)}

			{/* Lightbox Modal */}
			{selectedCover && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/95 backdrop-blur-sm animate-fade-in">
					{/* Close Button */}
					<button
						onClick={() => setSelectedCover(null)}
						className="absolute top-4 right-4 sm:top-6 sm:right-6 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all cursor-pointer z-10"
					>
						<X size={24} />
					</button>

					{/* Image Container */}
					<div className="relative flex flex-col max-w-4xl w-full h-[90vh] sm:h-[85vh] justify-center items-center">
						<div className="relative flex-1 min-h-0 w-full flex items-center justify-center">
							<img
								src={selectedCover.cover_url}
								alt={
									selectedCover.volume
										? `Volume ${selectedCover.volume}`
										: "Cover Art Detail"
								}
								className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
							/>
						</div>

						{/* Info Panel at Bottom */}
						<div className="w-full text-center mt-4 text-white space-y-1">
							<h4 className="text-lg font-bold">
								{selectedCover.volume
									? `Volume ${selectedCover.volume}`
									: "Oneshot / Special Cover"}
							</h4>
							<div className="flex items-center justify-center gap-4 text-sm text-zinc-400">
								<span className="flex items-center gap-1">
									<Globe size={14} />
									Locale:{" "}
									<strong className="uppercase text-zinc-200">
										{selectedCover.locale || "N/A"}
									</strong>
								</span>
								<span>•</span>
								<span>
									Filename:{" "}
									<span className="font-mono text-xs text-zinc-300">
										{selectedCover.file_name}
									</span>
								</span>
							</div>
							{selectedCover.description && (
								<p className="text-sm italic text-zinc-300 max-w-xl mx-auto pt-2">
									"{selectedCover.description}"
								</p>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
