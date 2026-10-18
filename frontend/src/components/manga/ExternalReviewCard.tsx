import {
	AlertTriangle,
	Check,
	ChevronDown,
	ChevronUp,
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
	Heart,
	HelpCircle,
	Info,
	PenTool,
	Smile,
	Sparkles,
	Star,
	ThumbsUp,
	Trash2,
	User,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { ExternalReview } from "../../types/externalReview";

interface ExternalReviewCardProps {
	review: ExternalReview;
	onDelete?: (reviewId: string) => void;
	globalShowSpoilers?: boolean;
	className?: string;
}

export const ExternalReviewCard: React.FC<ExternalReviewCardProps> = ({
	review,
	onDelete,
	globalShowSpoilers = false,
	className = "",
}) => {
	const [expanded, setExpanded] = useState(false);
	const [copied, setCopied] = useState(false);
	const [revealedSpoiler, setRevealedSpoiler] = useState(false);

	const isSpoilerRevealed = globalShowSpoilers || revealedSpoiler;
	const isLongText = review.content_text.length > 550;

	const handleCopyQuote = async () => {
		try {
			await navigator.clipboard.writeText(
				`"${review.content_text}" — ${review.reviewer_name} (MyAnimeList)`,
			);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy quote:", err);
		}
	};

	// Recommendation status styling
	const getRecBadge = () => {
		switch (review.recommendation_status) {
			case "recommended":
				return (
					<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
						★ Recommended
					</span>
				);
			case "mixed_feelings":
				return (
					<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
						★ Mixed Feelings
					</span>
				);
			case "not_recommended":
				return (
					<span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
						★ Not Recommended
					</span>
				);
			default:
				return null;
		}
	};

	return (
		<div
			className={`bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-5 sm:p-6 shadow-sm hover:border-[var(--brand-orange)]/40 transition-all space-y-4 ${className}`}
		>
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[var(--border-primary)]/50 pb-4">
				<div className="flex items-start space-x-3">
					{/* Avatar */}
					<div className="w-10 h-10 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex items-center justify-center overflow-hidden shrink-0">
						{review.reviewer_avatar_url ? (
							<img
								src={review.reviewer_avatar_url}
								alt={review.reviewer_name}
								className="w-full h-full object-cover"
								loading="lazy"
								onError={(e) => {
									e.currentTarget.style.display = "none";
								}}
							/>
						) : (
							<User size={18} className="text-[var(--text-secondary)]" />
						)}
					</div>

					{/* Author info & tags */}
					<div>
						<div className="flex items-center flex-wrap gap-2">
							{review.reviewer_profile_url ? (
								<a
									href={review.reviewer_profile_url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm font-bold text-[var(--text-primary)] hover:text-[var(--brand-orange)] transition flex items-center gap-1"
								>
									<span>{review.reviewer_name}</span>
									<ExternalLink size={11} className="opacity-60" />
								</a>
							) : (
								<span className="text-sm font-bold text-[var(--text-primary)]">
									{review.reviewer_name}
								</span>
							)}

							<span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20">
								{review.source}
							</span>

							{getRecBadge()}

							{review.is_preliminary && (
								<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
									<span>Preliminary</span>
									{review.chapters_progress && (
										<span>({review.chapters_progress})</span>
									)}
								</span>
							)}

							{review.is_spoiler && (
								<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
									<AlertTriangle size={10} />
									<span>Spoiler</span>
								</span>
							)}
						</div>

						<p className="text-xs text-[var(--text-secondary)] mt-1">
							{review.posted_at_raw ||
								(review.posted_at
									? new Date(review.posted_at).toLocaleDateString()
									: "Không rõ ngày đăng")}{" "}
							• {review.word_count} từ
						</p>
					</div>
				</div>

				{/* Rating badge */}
				{review.overall_rating !== undefined &&
					review.overall_rating !== null && (
						<div className="flex items-center gap-1.5 px-3 py-1 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 self-start">
							<Star size={14} className="fill-amber-500" />
							<span className="text-sm font-black">
								{review.overall_rating}/10
							</span>
						</div>
					)}
			</div>

			{/* Review Text Body */}
			<div className="relative">
				{review.is_spoiler && !isSpoilerRevealed ? (
					<div className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-center space-y-3">
						<AlertTriangle size={24} className="mx-auto text-amber-500" />
						<p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
							Bài đánh giá này có chứa nội dung tiết lộ cốt truyện (Spoiler).
						</p>
						<button
							type="button"
							onClick={() => setRevealedSpoiler(true)}
							className="px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
						>
							<Eye size={13} />
							<span>Hiện nội dung Spoiler</span>
						</button>
					</div>
				) : (
					<div className="space-y-3">
						{review.is_spoiler && isSpoilerRevealed && !globalShowSpoilers && (
							<div className="flex justify-end">
								<button
									type="button"
									onClick={() => setRevealedSpoiler(false)}
									className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 hover:underline cursor-pointer"
								>
									<EyeOff size={11} />
									<span>Che lại Spoiler</span>
								</button>
							</div>
						)}

						<div
							className={`text-xs sm:text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-line font-normal break-words ${
								!expanded && isLongText ? "line-clamp-6" : ""
							}`}
						>
							{review.content_text}
						</div>

						{isLongText && (
							<button
								type="button"
								onClick={() => setExpanded(!expanded)}
								className="text-xs font-bold text-[var(--brand-orange)] hover:text-[var(--brand-coral)] transition flex items-center gap-1 cursor-pointer pt-1"
							>
								{expanded ? (
									<>
										<span>Thu gọn nội dung</span>
										<ChevronUp size={13} />
									</>
								) : (
									<>
										<span>Đọc tiếp toàn bộ ({review.word_count} từ)</span>
										<ChevronDown size={13} />
									</>
								)}
							</button>
						)}
					</div>
				)}
			</div>

			{/* Footer: Reactions & Actions */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[var(--border-primary)]/40 pt-3 text-xs">
				{/* Reaction pills */}
				<div className="flex flex-wrap items-center gap-1.5">
					{review.reactions.nice > 0 && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[11px] font-medium border border-[var(--border-primary)]">
							<ThumbsUp size={11} className="text-blue-500" />
							<span>{review.reactions.nice}</span>
						</span>
					)}
					{review.reactions.love_it > 0 && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[11px] font-medium border border-[var(--border-primary)]">
							<Heart size={11} className="text-rose-500 fill-rose-500" />
							<span>{review.reactions.love_it}</span>
						</span>
					)}
					{review.reactions.funny > 0 && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[11px] font-medium border border-[var(--border-primary)]">
							<Smile size={11} className="text-amber-500" />
							<span>{review.reactions.funny}</span>
						</span>
					)}
					{review.reactions.confusing > 0 && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[11px] font-medium border border-[var(--border-primary)]">
							<HelpCircle size={11} className="text-purple-500" />
							<span>{review.reactions.confusing}</span>
						</span>
					)}
					{review.reactions.informative > 0 && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[11px] font-medium border border-[var(--border-primary)]">
							<Info size={11} className="text-cyan-500" />
							<span>{review.reactions.informative}</span>
						</span>
					)}
					{review.reactions.well_written > 0 && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[11px] font-medium border border-[var(--border-primary)]">
							<PenTool size={11} className="text-emerald-500" />
							<span>{review.reactions.well_written}</span>
						</span>
					)}
					{review.reactions.creative > 0 && (
						<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-[11px] font-medium border border-[var(--border-primary)]">
							<Sparkles size={11} className="text-amber-400" />
							<span>{review.reactions.creative}</span>
						</span>
					)}

					{review.reactions.total > 0 && (
						<span className="text-[10px] text-[var(--text-secondary)] font-semibold ml-1">
							({review.reactions.total} tương tác)
						</span>
					)}
				</div>

				{/* Utility buttons */}
				<div className="flex items-center gap-2 self-end sm:self-auto">
					<button
						type="button"
						onClick={handleCopyQuote}
						className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition border border-[var(--border-primary)] cursor-pointer"
						title="Sao chép trích dẫn bài đánh giá"
					>
						{copied ? (
							<Check size={12} className="text-emerald-500" />
						) : (
							<Copy size={12} />
						)}
						<span>{copied ? "Đã chép" : "Trích dẫn"}</span>
					</button>

					<a
						href={review.source_url}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 transition border border-blue-500/20"
						title="Mở bài review gốc trên MyAnimeList"
					>
						<span>Xem trên MAL</span>
						<ExternalLink size={11} />
					</a>

					{onDelete && (
						<button
							type="button"
							onClick={() => onDelete(review._id)}
							className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer"
							title="Xóa bài đánh giá khỏi máy"
						>
							<Trash2 size={13} />
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

export default ExternalReviewCard;
