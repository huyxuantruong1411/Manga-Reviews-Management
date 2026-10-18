import { AlertCircle, Columns2, Loader2, Sparkles } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { PageBinding } from "../../api/translation";
import type { TranslationDisplayMode } from "../../hooks/useTranslation";
import type { PageItem } from "../../types/chapter";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

interface TranslatedPageImageProps {
	page: PageItem;
	binding?: PageBinding;
	displayMode: TranslationDisplayMode;
	compareSplit: number;
	zoomLevel: number;
	imageFitClass: string;
	priority?: boolean;
	onTranslateRequest?: (pageUid: string) => void;
}

export const TranslatedPageImage: React.FC<TranslatedPageImageProps> = (
	props,
) => (
	<PageImageState
		key={`${props.page.page_uid ?? props.page.page_number}:${props.page.url}:${props.binding?.url}:${props.displayMode}`}
		{...props}
	/>
);

const PageImageState: React.FC<TranslatedPageImageProps> = ({
	page,
	binding,
	displayMode,
	compareSplit,
	zoomLevel,
	imageFitClass,
	priority = false,
	onTranslateRequest,
}) => {
	const [imageLoaded, setImageLoaded] = useState(false);
	const [imageError, setImageError] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const [compareLoaded, setCompareLoaded] = useState(false);

	const originalUrl = page.url || "";
	const translatedUrl = binding?.url;
	const hasTranslation = Boolean(translatedUrl);

	// Determine active primary URL
	const activeUrl =
		displayMode === "translated" && hasTranslation
			? translatedUrl
			: originalUrl;

	const containerStyle = {
		width: `${(896 * zoomLevel) / 100}px`,
		maxWidth: zoomLevel <= 100 ? `${zoomLevel}%` : "none",
	};

	return (
		<div
			className="relative flex justify-center w-full min-w-0"
			style={containerStyle}
		>
			{/* Skeleton Shimmer Loading Placeholder */}
			{(!imageLoaded ||
				(displayMode === "compare" && hasTranslation && !compareLoaded)) &&
				!imageError && (
					<Skeleton
						className="w-full min-h-96 rounded-md flex items-center justify-center border border-border"
						style={{
							aspectRatio:
								page.width && page.height && page.height > 0
									? `${page.width} / ${page.height}`
									: "2 / 3",
						}}
					>
						<div className="flex flex-col items-center space-y-2 text-zinc-500">
							<Loader2
								size={24}
								className="animate-spin text-[var(--brand-orange)]"
							/>
							<span className="text-xs font-semibold">
								Đang tải trang {page.page_number}...
							</span>
						</div>
					</Skeleton>
				)}

			{/* Error Fallback */}
			{imageError && (
				<div
					role="alert"
					className="relative z-30 w-full min-h-96 aspect-[2/3] bg-card text-card-foreground border border-border rounded-md flex flex-col items-center justify-center p-6 text-center space-y-3"
				>
					<AlertCircle size={32} className="text-rose-400" />
					<p className="text-xs text-zinc-300 font-semibold">
						Không tải được ảnh trang {page.page_number}
					</p>
					<Button
						type="button"
						onClick={() => {
							setImageError(false);
							setImageLoaded(false);
							setCompareLoaded(false);
							setAttempt((value) => value + 1);
						}}
						variant="secondary"
					>
						Thử lại
					</Button>
				</div>
			)}

			{/* Mode: Standard (Original or Translated) */}
			{displayMode !== "compare" && !imageError && (
				<img
					key={attempt}
					src={activeUrl}
					alt={`Page ${page.page_number}`}
					width={page.width || undefined}
					height={page.height || undefined}
					loading={priority ? "eager" : "lazy"}
					fetchPriority={priority ? "high" : "low"}
					decoding="async"
					onLoad={() => setImageLoaded(true)}
					onError={() => setImageError(true)}
					className={`${imageFitClass} shadow-2xl transition-opacity duration-300 select-none ${
						imageLoaded
							? "opacity-100"
							: "opacity-0 absolute pointer-events-none"
					}`}
				/>
			)}

			{/* Mode: Compare Slider (Side-by-side split) */}
			{displayMode === "compare" && hasTranslation && !imageError && (
				<div
					key={attempt}
					className={`relative w-full overflow-hidden select-none ${!imageLoaded || !compareLoaded ? "absolute opacity-0 pointer-events-none" : ""}`}
				>
					{/* Bottom Layer: Original Image */}
					<img
						src={originalUrl}
						alt={`Page ${page.page_number} (Original)`}
						loading={priority ? "eager" : "lazy"}
						decoding="async"
						onLoad={() => setImageLoaded(true)}
						onError={() => setImageError(true)}
						className={`${imageFitClass} shadow-2xl w-full block select-none`}
					/>

					{/* Top Layer: Translated Image with clip-path */}
					<img
						src={translatedUrl}
						alt={`Page ${page.page_number} (Translated)`}
						onLoad={() => setCompareLoaded(true)}
						onError={() => setImageError(true)}
						loading={priority ? "eager" : "lazy"}
						decoding="async"
						className={`${imageFitClass} absolute inset-0 w-full h-full select-none pointer-events-none`}
						style={{
							clipPath: `inset(0 ${100 - compareSplit}% 0 0)`,
						}}
					/>

					{/* Split Divider Line */}
					<div
						className="absolute inset-y-0 w-0.5 bg-[var(--brand-orange)] shadow-[0_0_10px_rgba(249,115,22,0.8)] pointer-events-none"
						style={{ left: `${compareSplit}%` }}
					>
						<div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[var(--brand-orange)] text-white shadow-lg flex items-center justify-center">
							<Columns2 size={12} />
						</div>
					</div>

					{/* Compare Labels */}
					<div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm text-[10px] font-bold text-white uppercase tracking-wider pointer-events-none">
						Bản dịch
					</div>
					<div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm text-[10px] font-bold text-zinc-300 uppercase tracking-wider pointer-events-none">
						Bản gốc
					</div>
				</div>
			)}

			{/* Mode: Compare but translation not yet generated for this page */}
			{displayMode === "compare" && !hasTranslation && !imageError && (
				<div
					key={attempt}
					className="relative w-full flex flex-col items-center"
				>
					<img
						src={originalUrl}
						alt={`Page ${page.page_number}`}
						loading={priority ? "eager" : "lazy"}
						decoding="async"
						onLoad={() => setImageLoaded(true)}
						onError={() => setImageError(true)}
						className={`${imageFitClass} shadow-2xl transition duration-200 select-none`}
					/>
					<div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
						<div className="p-4 bg-zinc-950/90 border border-zinc-800 rounded-2xl shadow-2xl max-w-xs space-y-2">
							<Sparkles
								size={20}
								className="mx-auto text-[var(--brand-orange)]"
							/>
							<p className="text-xs font-bold text-white">
								Chưa có bản dịch cho trang này
							</p>
							<p className="text-[11px] text-zinc-400">
								Nhấn dịch để xem tính năng so sánh trực tiếp song song.
							</p>
							{onTranslateRequest && page.page_uid && (
								<button
									type="button"
									onClick={() => {
										if (page.page_uid) {
											onTranslateRequest(page.page_uid);
										}
									}}
									className="px-3 py-1.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl transition cursor-pointer"
								>
									Dịch ngay trang {page.page_number}
								</button>
							)}
						</div>
					</div>
				</div>
			)}

			{/* Badges and Page Number Indicator */}
			<div className="absolute bottom-2 right-4 flex items-center space-x-1.5 pointer-events-none">
				{hasTranslation && (
					<span className="px-1.5 py-0.5 rounded-md bg-emerald-500/80 text-white text-[9px] font-bold uppercase tracking-wider shadow">
						{displayMode === "translated" ? "Đã dịch" : "Có bản dịch"}
					</span>
				)}
				<span className="px-2 py-0.5 rounded-md bg-black/60 text-zinc-300 text-[10px] font-mono shadow">
					{page.page_number}
				</span>
			</div>
		</div>
	);
};
