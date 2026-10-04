/**
 * ReviewsManagement — Centralized review exploration, quick preview,
 * filtering by rating/status, and management dashboard.
 */

import {
	BookOpen,
	Clock,
	Edit3,
	Eye,
	FileText,
	Loader2,
	RefreshCw,
	Search,
	Star,
	Trash2,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../../api/client";
import { useAlert } from "../../hooks/useAlert";

export interface ReviewManagementItem {
	id: string;
	manga_id: string;
	manga_title: string;
	manga_cover_url?: string | null;
	manga_rating?: number | null;
	manga_read_status?: string | null;
	review_title: string;
	word_count: number;
	character_count: number;
	snippet: string;
	created_at?: string | null;
	updated_at?: string | null;
	content_json?: any;
}

interface ReviewManagementResponse {
	reviews: ReviewManagementItem[];
	total: number;
}

const READ_STATUS_COLORS: Record<string, string> = {
	reading: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
	completed:
		"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
	dropped: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
	on_hold:
		"bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
	plan_to_read:
		"bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
	re_reading:
		"bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
	unread: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
};

const tiptapToPlainText = (node: any): string => {
	if (!node || typeof node !== "object") return "";
	if (node.type === "text" && node.text) return node.text;
	if (Array.isArray(node.content)) {
		return node.content.map(tiptapToPlainText).join(" ");
	}
	return "";
};

export const ReviewsManagement: React.FC = () => {
	const navigate = useNavigate();
	const { showToast } = useAlert();

	const [reviews, setReviews] = useState<ReviewManagementItem[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [searchQuery, setSearchQuery] = useState<string>("");
	const [selectedStatus, setSelectedStatus] = useState<string>("");
	const [minRating, setMinRating] = useState<string>("");
	const [sortBy, setSortBy] = useState<string>("created_at_desc");

	// Preview modal state
	const [previewReview, setPreviewReview] =
		useState<ReviewManagementItem | null>(null);
	const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

	const fetchReviews = useCallback(async () => {
		setIsLoading(true);
		try {
			const params: Record<string, any> = {
				sort_by: sortBy,
			};
			if (searchQuery.trim()) params.search = searchQuery.trim();
			if (selectedStatus) params.read_status = selectedStatus;
			if (minRating) params.rating_min = Number(minRating);

			const res = await client.get<ReviewManagementResponse>(
				"/api/analytics/reviews-management",
				{ params },
			);
			setReviews(res.data.reviews || []);
		} catch (err: any) {
			console.error("Failed to load reviews list", err);
			showToast("Không thể tải danh sách review.", "error");
		} finally {
			setIsLoading(false);
		}
	}, [searchQuery, selectedStatus, minRating, sortBy, showToast]);

	useEffect(() => {
		fetchReviews();
	}, [fetchReviews]);

	const handleDeleteReview = async (review: ReviewManagementItem) => {
		if (
			!window.confirm(
				`Bạn có chắc chắn muốn xóa bài review "${review.review_title}" của bộ "${review.manga_title}" không? Hành động này có thể khôi phục qua thùng rác.`,
			)
		) {
			return;
		}

		setIsDeletingId(review.id);
		try {
			await client.delete(`/api/manga/${review.manga_id}/reviews/${review.id}`);
			showToast("Đã xóa bài review thành công!", "success");
			if (previewReview?.id === review.id) {
				setPreviewReview(null);
			}
			fetchReviews();
		} catch (err: unknown) {
			console.error("Failed to delete review", err);
			showToast("Lỗi khi xóa bài review.", "error");
		} finally {
			setIsDeletingId(null);
		}
	};

	// Quick stats summary
	const stats = useMemo(() => {
		const total = reviews.length;
		const totalWords = reviews.reduce((sum, r) => sum + r.word_count, 0);
		const avgWords = total > 0 ? Math.round(totalWords / total) : 0;
		const rated = reviews.filter((r) => r.manga_rating !== null);
		const avgRating =
			rated.length > 0
				? (
						rated.reduce((sum, r) => sum + (r.manga_rating || 0), 0) /
						rated.length
					).toFixed(1)
				: null;
		return { total, totalWords, avgWords, avgRating };
	}, [reviews]);

	return (
		<div className="space-y-6">
			{/* Header & Controls Card */}
			<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-sm space-y-5">
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div>
						<h3 className="text-xl font-bold flex items-center space-x-2.5">
							<FileText className="text-[var(--brand-orange)]" size={22} />
							<span>Quản lý & Thư viện Reviews</span>
						</h3>
						<p className="text-xs text-[var(--text-secondary)] mt-1">
							Tra cứu, xem nhanh, lọc theo điểm số và quản lý toàn bộ các bài
							đánh giá đã viết trong hệ thống.
						</p>
					</div>

					<button
						type="button"
						onClick={fetchReviews}
						disabled={isLoading}
						className="px-4 py-2 bg-[var(--bg-primary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-[var(--border-primary)] rounded-xl font-bold text-xs flex items-center space-x-2 transition cursor-pointer self-start md:self-auto disabled:opacity-50"
					>
						<RefreshCw
							size={14}
							className={
								isLoading ? "animate-spin text-[var(--brand-orange)]" : ""
							}
						/>
						<span>Làm mới danh sách</span>
					</button>
				</div>

				{/* Quick Stats Bar */}
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[var(--border-primary)]">
					<div className="p-3 bg-[var(--bg-primary)]/70 rounded-2xl border border-[var(--border-primary)]/50">
						<span className="text-[11px] font-bold text-[var(--text-secondary)] block">
							Tổng bài review
						</span>
						<span className="text-xl font-extrabold text-[var(--text-primary)]">
							{stats.total.toLocaleString()}
						</span>
					</div>
					<div className="p-3 bg-[var(--bg-primary)]/70 rounded-2xl border border-[var(--border-primary)]/50">
						<span className="text-[11px] font-bold text-[var(--text-secondary)] block">
							Tổng số từ
						</span>
						<span className="text-xl font-extrabold text-[var(--brand-orange)]">
							{stats.totalWords.toLocaleString()}
						</span>
					</div>
					<div className="p-3 bg-[var(--bg-primary)]/70 rounded-2xl border border-[var(--border-primary)]/50">
						<span className="text-[11px] font-bold text-[var(--text-secondary)] block">
							Trung bình từ/bài
						</span>
						<span className="text-xl font-extrabold text-[var(--text-primary)]">
							{stats.avgWords.toLocaleString()}
						</span>
					</div>
					<div className="p-3 bg-[var(--bg-primary)]/70 rounded-2xl border border-[var(--border-primary)]/50">
						<span className="text-[11px] font-bold text-[var(--text-secondary)] block">
							Điểm trung bình
						</span>
						<span className="text-xl font-extrabold text-amber-500 flex items-center space-x-1">
							<span>{stats.avgRating || "N/A"}</span>
							{stats.avgRating && <Star size={16} className="fill-amber-400" />}
						</span>
					</div>
				</div>

				{/* Filter & Search Bar */}
				<div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
					{/* Search input */}
					<div className="relative md:col-span-5">
						<Search
							className="absolute left-3.5 top-3 text-[var(--text-secondary)]"
							size={16}
						/>
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Tìm theo tên truyện, tiêu đề review, trích dẫn..."
							className="w-full pl-10 pr-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]"
						/>
					</div>

					{/* Read status filter */}
					<div className="md:col-span-3">
						<select
							value={selectedStatus}
							onChange={(e) => setSelectedStatus(e.target.value)}
							className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] cursor-pointer"
						>
							<option value="">Tất cả trạng thái đọc</option>
							<option value="reading">Đang đọc (Reading)</option>
							<option value="completed">Đã hoàn thành (Completed)</option>
							<option value="dropped">Đã bỏ (Dropped)</option>
							<option value="on_hold">Tạm dừng (On Hold)</option>
							<option value="plan_to_read">Dự định đọc (Plan to Read)</option>
							<option value="re_reading">Đọc lại (Re-reading)</option>
						</select>
					</div>

					{/* Min rating filter */}
					<div className="md:col-span-2">
						<select
							value={minRating}
							onChange={(e) => setMinRating(e.target.value)}
							className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] cursor-pointer"
						>
							<option value="">Mọi mức điểm</option>
							<option value="9">★ 9.0 trở lên</option>
							<option value="8">★ 8.0 trở lên</option>
							<option value="7">★ 7.0 trở lên</option>
							<option value="6">★ 6.0 trở lên</option>
							<option value="5">★ 5.0 trở lên</option>
						</select>
					</div>

					{/* Sort select */}
					<div className="md:col-span-2">
						<select
							value={sortBy}
							onChange={(e) => setSortBy(e.target.value)}
							className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] cursor-pointer"
						>
							<option value="created_at_desc">Mới nhất trước</option>
							<option value="created_at_asc">Cũ nhất trước</option>
							<option value="rating_desc">Điểm cao nhất</option>
							<option value="rating_asc">Điểm thấp nhất</option>
							<option value="words_desc">Dài nhất (Số từ)</option>
							<option value="title_asc">Tên Manga A-Z</option>
						</select>
					</div>
				</div>
			</div>

			{/* Reviews List / Table */}
			{isLoading ? (
				<div className="flex flex-col items-center justify-center py-20 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl space-y-3">
					<Loader2
						className="animate-spin text-[var(--brand-orange)]"
						size={32}
					/>
					<span className="text-xs text-[var(--text-secondary)] font-medium">
						Đang tải danh sách bài review...
					</span>
				</div>
			) : reviews.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-20 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl text-center space-y-4 p-6">
					<div className="p-4 bg-[var(--bg-primary)] rounded-full text-[var(--text-secondary)]">
						<BookOpen size={36} />
					</div>
					<div>
						<h4 className="text-base font-bold text-[var(--text-primary)]">
							Không tìm thấy bài review nào phù hợp
						</h4>
						<p className="text-xs text-[var(--text-secondary)] mt-1 max-w-md">
							Hãy thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt các tiêu chí lọc
							điểm số / trạng thái.
						</p>
					</div>
					{(searchQuery || selectedStatus || minRating) && (
						<button
							type="button"
							onClick={() => {
								setSearchQuery("");
								setSelectedStatus("");
								setMinRating("");
							}}
							className="px-4 py-2 bg-[var(--brand-orange)] text-white text-xs font-bold rounded-xl shadow-sm hover:opacity-95 transition"
						>
							Đặt lại bộ lọc
						</button>
					)}
				</div>
			) : (
				<div className="grid grid-cols-1 gap-3.5">
					{reviews.map((rev) => {
						const statusColor =
							READ_STATUS_COLORS[rev.manga_read_status || "unread"] ||
							READ_STATUS_COLORS.unread;
						const createdDateStr = rev.created_at
							? new Date(rev.created_at).toLocaleDateString("vi-VN", {
									year: "numeric",
									month: "short",
									day: "numeric",
								})
							: "Không rõ";

						return (
							<div
								key={rev.id}
								className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
							>
								{/* Left: Cover & Info */}
								<div className="flex items-start space-x-4 flex-1 min-w-0">
									<div className="w-14 h-20 rounded-xl overflow-hidden shrink-0 border border-[var(--border-primary)] bg-[var(--bg-primary)] relative shadow-xs">
										{rev.manga_cover_url ? (
											<img
												src={rev.manga_cover_url}
												alt={rev.manga_title}
												className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
												loading="lazy"
											/>
										) : (
											<div className="w-full h-full flex items-center justify-center text-zinc-400">
												<BookOpen size={20} />
											</div>
										)}
									</div>

									<div className="space-y-1.5 flex-1 min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<Link
												to={`/manga/${rev.manga_id}`}
												className="text-xs font-extrabold text-[var(--text-primary)] hover:text-[var(--brand-orange)] transition truncate max-w-sm"
												title={rev.manga_title}
											>
												{rev.manga_title}
											</Link>

											{rev.manga_read_status && (
												<span
													className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${statusColor}`}
												>
													{rev.manga_read_status.replace("_", " ")}
												</span>
											)}

											{rev.manga_rating !== null &&
												rev.manga_rating !== undefined && (
													<span className="flex items-center space-x-1 text-[11px] font-extrabold bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/20">
														<span>{rev.manga_rating.toFixed(1)}</span>
														<Star
															size={11}
															className="fill-amber-400 text-amber-500"
														/>
													</span>
												)}
										</div>

										<h4 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--brand-orange)] transition">
											{rev.review_title}
										</h4>

										{rev.snippet && (
											<p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
												{rev.snippet}
											</p>
										)}

										<div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-secondary)] pt-1">
											<span className="flex items-center space-x-1 font-mono">
												<FileText
													size={12}
													className="text-[var(--brand-orange)]"
												/>
												<strong className="text-[var(--text-primary)]">
													{rev.word_count.toLocaleString()}
												</strong>{" "}
												từ ({rev.character_count.toLocaleString()} ký tự)
											</span>
											<span>•</span>
											<span className="flex items-center space-x-1 font-mono">
												<Clock size={12} />
												<span>{createdDateStr}</span>
											</span>
										</div>
									</div>
								</div>

								{/* Right: Actions */}
								<div className="flex items-center space-x-2 shrink-0 self-end sm:self-center pt-2 sm:pt-0">
									<button
										type="button"
										onClick={() => setPreviewReview(rev)}
										className="p-2 hover:bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
										title="Xem nhanh bài review"
									>
										<Eye size={16} />
									</button>

									<button
										type="button"
										onClick={() =>
											navigate(
												`/manga/${rev.manga_id}?tab=review&reviewId=${rev.id}`,
											)
										}
										className="px-3 py-2 bg-[var(--brand-orange)]/10 hover:bg-[var(--brand-orange)]/20 text-[var(--brand-orange)] border border-[var(--brand-orange)]/20 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition"
										title="Chuyển đến trình soạn thảo review"
									>
										<Edit3 size={14} />
										<span>Chỉnh sửa</span>
									</button>

									<button
										type="button"
										onClick={() => handleDeleteReview(rev)}
										disabled={isDeletingId === rev.id}
										className="p-2 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-transparent hover:border-rose-500/20 text-rose-500 rounded-xl transition disabled:opacity-50"
										title="Xóa bài review"
									>
										{isDeletingId === rev.id ? (
											<Loader2 size={16} className="animate-spin" />
										) : (
											<Trash2 size={16} />
										)}
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{/* Quick Preview Modal */}
			{previewReview && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
					<div className="bg-[var(--bg-card)] border border-[var(--border-primary)] w-full max-w-3xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
						{/* Modal Header */}
						<div className="flex items-center justify-between p-5 border-b border-[var(--border-primary)] bg-[var(--bg-primary)]/40">
							<div className="flex items-center space-x-3 min-w-0">
								<div className="w-10 h-14 rounded-lg overflow-hidden shrink-0 border border-[var(--border-primary)] bg-[var(--bg-card)]">
									{previewReview.manga_cover_url ? (
										<img
											src={previewReview.manga_cover_url}
											alt={previewReview.manga_title}
											className="w-full h-full object-cover"
										/>
									) : (
										<div className="w-full h-full flex items-center justify-center text-zinc-400">
											<BookOpen size={16} />
										</div>
									)}
								</div>
								<div className="min-w-0">
									<h4 className="text-base font-extrabold text-[var(--text-primary)] truncate">
										{previewReview.review_title}
									</h4>
									<div className="flex items-center space-x-2 text-xs text-[var(--text-secondary)] mt-0.5">
										<span className="font-bold text-[var(--brand-orange)]">
											{previewReview.manga_title}
										</span>
										<span>•</span>
										<span>{previewReview.word_count.toLocaleString()} từ</span>
										{previewReview.manga_rating !== null &&
											previewReview.manga_rating !== undefined && (
												<>
													<span>•</span>
													<span className="flex items-center text-amber-500 font-bold">
														★ {previewReview.manga_rating.toFixed(1)}
													</span>
												</>
											)}
									</div>
								</div>
							</div>

							<button
								type="button"
								onClick={() => setPreviewReview(null)}
								className="p-2 hover:bg-[var(--bg-primary)] rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
							>
								<X size={20} />
							</button>
						</div>

						{/* Modal Body */}
						<div className="flex-1 overflow-y-auto p-6 space-y-4">
							<div className="prose prose-sm dark:prose-invert max-w-none text-[var(--text-primary)] leading-relaxed space-y-3 font-poppins">
								{previewReview.content_json ? (
									<div className="whitespace-pre-wrap leading-relaxed text-sm">
										{tiptapToPlainText(previewReview.content_json)}
									</div>
								) : (
									<p className="italic text-zinc-400">
										Nội dung bài review trống.
									</p>
								)}
							</div>
						</div>

						{/* Modal Footer */}
						<div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-primary)]/40 flex items-center justify-between">
							<span className="text-[11px] text-[var(--text-secondary)] font-mono">
								ID: {previewReview.id}
							</span>

							<div className="flex items-center space-x-2">
								<button
									type="button"
									onClick={() => {
										const r = previewReview;
										setPreviewReview(null);
										handleDeleteReview(r);
									}}
									className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl text-xs font-bold transition flex items-center space-x-1"
								>
									<Trash2 size={14} />
									<span>Xóa</span>
								</button>

								<button
									type="button"
									onClick={() => {
										navigate(
											`/manga/${previewReview.manga_id}?tab=review&reviewId=${previewReview.id}`,
										);
									}}
									className="px-4 py-1.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl shadow-sm transition flex items-center space-x-1.5"
								>
									<Edit3 size={14} />
									<span>Mở trong Trình Soạn Thảo</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default ReviewsManagement;
