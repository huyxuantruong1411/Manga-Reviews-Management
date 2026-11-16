import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Star,
  Play,
  RotateCw,
  BookmarkPlus,
  AlertTriangle,
  MessageSquare,
  Search,
  ArrowUpDown,
  CheckCircle2,
  Lock,
  ThumbsUp,
  ThumbsDown,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Flag,
  Reply,
  Calendar,
  Layers,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  X,
} from "lucide-react";
import { api, pickLocalizedText, MangaItem, ChapterItem, CommentItem, UserProfile } from "@/api/client";
import { CoverImage } from "@/components/CoverImage";
import { ModalMotion } from "@/components/MotionPrimitives";
import { useToast } from "@/components/ToastProvider";

interface MangaDetailPageProps {
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
}

export const MangaDetailPage: React.FC<MangaDetailPageProps> = ({ currentUser, onOpenAuth }) => {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [manga, setManga] = useState<MangaItem | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [recContent, setRecContent] = useState<MangaItem[]>([]);
  const [recItem, setRecItem] = useState<MangaItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chapter filter states
  const [chapterSearch, setChapterSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [readFilter, setReadFilter] = useState<string>("");

  // Reading status
  const [currentReadingStatus, setCurrentReadingStatus] = useState<string>("");

  // Rating state
  const [userScore, setUserScore] = useState<number | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  // Report manga modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("broken_images");
  const [reportDesc, setReportDesc] = useState("");
  const [reportSuccess, setReportSuccess] = useState(false);

  // Add to list modal
  const [showListModal, setShowListModal] = useState(false);
  const [userLists, setUserLists] = useState<any[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [newListName, setNewListName] = useState("");

  // Comment composer state
  const [commentContent, setCommentContent] = useState("");
  const [isCommentSpoiler, setIsCommentSpoiler] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentSort, setCommentSort] = useState("newest");

  // Edit history & comment report modals
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [reportCommentTargetId, setReportCommentTargetId] = useState<string | null>(null);
  const [commentReportReason, setCommentReportReason] = useState<
    "unmarked_spoiler" | "spam" | "harassment" | "hate_speech" | "other"
  >("unmarked_spoiler");
  const [commentReportDesc, setCommentReportDesc] = useState("");
  const [expandSynopsis, setExpandSynopsis] = useState(false);

  const fetchData = async () => {
    if (!idOrSlug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMangaDetail(idOrSlug);
      setManga(data);
      setCurrentReadingStatus(data.my_reading_status || data.user_reading_status || "");
      setUserScore(data.my_rating ?? data.user_rating ?? null);

      // Fetch chapters
      const chData = await api.getChapters(data.pool_manga_id, {
        sort_order: sortOrder,
        q_chapter_number: chapterSearch || undefined,
        read_status: readFilter || undefined,
      });
      setChapters(chData.items || []);

      // Fetch comments
      const cData = await api.getComments(data.pool_manga_id, { sort_by: commentSort });
      setComments(cData.items || []);

      // Fetch recommendations
      api.getContentRecommendations(data.pool_manga_id)
        .then((res) => setRecContent(res.items.slice(0, 6) || []))
        .catch(() => {});
      api.getItemRecommendations(data.pool_manga_id)
        .then((res) => setRecItem(res.items.slice(0, 6) || []))
        .catch(() => {});
    } catch (err: any) {
      setError(err.message || "Không thể tải chi tiết bộ truyện.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [idOrSlug]);

  useEffect(() => {
    if (manga) {
      api.getChapters(manga.pool_manga_id, {
        sort_order: sortOrder,
        q_chapter_number: chapterSearch || undefined,
        read_status: readFilter || undefined,
      }).then((res) => setChapters(res.items || []));
    }
  }, [sortOrder, chapterSearch, readFilter]);

  useEffect(() => {
    if (manga) {
      api
        .getComments(manga.pool_manga_id, { sort_by: commentSort })
        .then((res) => setComments(res.items || []))
        .catch(() => {});
    }
  }, [commentSort]);

  const handleReadFirst = async () => {
    if (!manga) return;
    try {
      const res = await api.getReadFirst(manga.pool_manga_id);
      navigate(`/read/${res.chapter_id}`);
    } catch (err: any) {
      showToast(err.message || "Không thể mở chương đầu tiên.", "error");
    }
  };

  const handleContinueReading = async () => {
    if (!manga) return;
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    try {
      const res = await api.getContinueReading(manga.pool_manga_id);
      const pageQuery = res.page_number && res.page_number > 1 ? `?page=${res.page_number}` : "";
      navigate(`/read/${res.chapter_id}${pageQuery}`);
    } catch (err: any) {
      showToast(err.message || "Không thể tiếp tục đọc.", "error");
    }
  };

  const handleUpdateReadingStatus = async (status: string) => {
    if (!manga) return;
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    try {
      if (status === "none") {
        await api.deleteReadingStatus(manga.pool_manga_id);
        setCurrentReadingStatus("");
        showToast("Đã xóa trạng thái đọc.", "info");
      } else {
        await api.setReadingStatus(manga.pool_manga_id, status);
        setCurrentReadingStatus(status);
        showToast("Đã cập nhật trạng thái đọc.", "success");
      }
    } catch (err: any) {
      showToast(err.message || "Không thể cập nhật trạng thái.", "error");
    }
  };

  const handleRateSubmit = async (score: number) => {
    if (!manga) return;
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    setRatingError(null);
    try {
      const res = await api.rateManga(manga.pool_manga_id, score);
      setUserScore(score);
      setManga({
        ...manga,
        average_rating: res.average_rating,
        rating_count: res.rating_count,
      });
      setShowRatingModal(false);
      showToast(`Đã chấm điểm ${score}/10 thành công.`, "success");
    } catch (err: any) {
      setRatingError(err.message || "Bạn cần đọc truyện trước khi chấm điểm.");
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manga) return;
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    try {
      await api.reportManga(manga.pool_manga_id, {
        reason_code: reportReason,
        description: reportDesc,
      });
      setReportSuccess(true);
      showToast("Đã gửi báo cáo thành công.", "success");
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccess(false);
        setReportDesc("");
      }, 1500);
    } catch (err: any) {
      showToast(err.message || "Không thể gửi báo cáo.", "error");
    }
  };

  const handleOpenListModal = async () => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    setShowListModal(true);
    try {
      const data = await api.getReadingLists();
      setUserLists(data.items || []);
    } catch {
      setUserLists([]);
    }
  };

  const handleAddToLists = async () => {
    if (!manga) return;
    try {
      await api.batchAddToLists({
        manga_id: manga.pool_manga_id,
        list_ids: selectedListIds,
        new_list_name: newListName.trim() || undefined,
      });
      setShowListModal(false);
      setSelectedListIds([]);
      setNewListName("");
      showToast("Đã thêm truyện vào danh sách thành công.", "success");
    } catch (err: any) {
      showToast(err.message || "Không thể lưu vào danh sách.", "error");
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manga) return;
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    setCommentError(null);
    try {
      const newC = await api.createComment(manga.pool_manga_id, {
        content: commentContent,
        is_spoiler: isCommentSpoiler,
      });
      setComments([newC, ...comments]);
      setCommentContent("");
      setIsCommentSpoiler(false);
      showToast("Đã đăng bình luận.", "success");
    } catch (err: any) {
      setCommentError(err.message);
    }
  };

  const handleReaction = async (commentId: string, reaction: "like" | "dislike") => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    try {
      const res = await api.reactComment(commentId, reaction);
      setComments(
        comments.map((c) =>
          c.comment_id === commentId
            ? { ...c, like_count: res.like_count, dislike_count: res.dislike_count, user_reaction: res.user_reaction }
            : c
        )
      );
    } catch (err: any) {
      showToast(err.message || "Không thể tương tác bình luận.", "error");
    }
  };

  const handleViewEditHistory = async (commentId: string) => {
    try {
      const res = await api.getCommentEditHistory(commentId);
      setHistoryItems(res.items || []);
      setShowHistoryModal(true);
    } catch (err: any) {
      showToast(err.message || "Không thể tải lịch sử chỉnh sửa.", "error");
    }
  };

  const handleReplyComment = async (parentCommentId: string, content: string, isSpoiler: boolean) => {
    if (!manga) return;
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    const created = await api.createComment(manga.pool_manga_id, {
      content,
      is_spoiler: isSpoiler,
      parent_comment_id: parentCommentId,
    });
    setComments((prev) => [...prev, created]);
    showToast("Đã gửi phản hồi.", "success");
  };

  const handleEditComment = async (commentId: string, content: string) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    const updated = await api.editComment(commentId, content);
    setComments((prev) => prev.map((c) => (c.comment_id === commentId ? updated : c)));
    showToast("Đã cập nhật bình luận.", "success");
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    try {
      await api.deleteComment(commentId);
      setComments((prev) =>
        prev.map((c) =>
          c.comment_id === commentId ? { ...c, is_deleted: true, content: "[Bình luận đã bị xóa]" } : c
        )
      );
      showToast("Đã xóa bình luận.", "info");
    } catch (err: any) {
      showToast(err.message || "Không thể xóa bình luận.", "error");
    }
  };

  const handleToggleSpoiler = async (commentId: string, nextSpoiler: boolean) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    try {
      const updated = await api.toggleCommentSpoiler(commentId, nextSpoiler);
      setComments((prev) => prev.map((c) => (c.comment_id === commentId ? updated : c)));
      showToast(
        nextSpoiler ? "Đã gắn nhãn Spoiler cho bình luận." : "Đã gỡ nhãn Spoiler.",
        "success"
      );
    } catch (err: any) {
      showToast(err.message || "Không thể thay đổi trạng thái Spoiler.", "error");
    }
  };

  const handleReportCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportCommentTargetId) return;
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    try {
      await api.reportComment(reportCommentTargetId, {
        reason_code: commentReportReason,
        description: commentReportDesc.trim() || undefined,
      });
      setReportCommentTargetId(null);
      setCommentReportDesc("");
      showToast("Đã gửi báo cáo bình luận tới Ban quản trị.", "success");
    } catch (err: any) {
      showToast(err.message || "Không thể báo cáo bình luận.", "error");
    }
  };

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="space-y-6">
        <div className="h-64 bg-zinc-900 rounded border border-zinc-800 animate-shimmer motion-reduce:after:hidden" />
        <div className="h-96 bg-zinc-900 rounded border border-zinc-800 animate-shimmer motion-reduce:after:hidden" />
      </div>
    );
  }

  if (error || !manga) {
    return (
      <div className="max-w-lg mx-auto my-16 p-8 rounded bg-zinc-900 border border-zinc-800 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-base font-bold text-zinc-100 font-mono">Truyện không tồn tại hoặc đã bị ẩn</h2>
        <p className="text-xs text-zinc-400">{error || "Bộ truyện hiện không khả dụng."}</p>
        <Link
          to="/"
          className="inline-block px-4 py-2 rounded bg-emerald-500 text-zinc-950 text-xs font-mono font-semibold"
        >
          Quay Lại Danh Mục
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Top Hero Card */}
      <div className="p-6 rounded bg-zinc-900/80 border border-zinc-800 flex flex-col md:flex-row gap-6 relative overflow-hidden">
        {/* Cover Preview */}
        <div className="w-full md:w-56 shrink-0 aspect-[3/4] bg-zinc-950 rounded border border-zinc-800 overflow-hidden shadow-2xl relative">
          <CoverImage
            src={manga.cover_url}
            alt={manga.title}
            priority
            containerClassName="w-full h-full"
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 backdrop-blur-sm border border-zinc-700 text-xs font-mono text-amber-300 flex items-center gap-1 pointer-events-none">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>{Number(manga.average_rating || 0).toFixed(1)}</span>
            <span className="text-[10px] text-zinc-300">({manga.rating_count})</span>
          </div>
        </div>

        {/* Info & Metadata */}
        <div className="flex-1 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-zinc-400 mb-1">
              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 uppercase">
                {manga.status}
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 uppercase">
                {manga.publication_demographic || "General"}
              </span>
              <span className="text-zinc-500">ID: {manga.pool_manga_id}</span>
            </div>

            <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">{manga.title}</h1>
            {manga.alt_titles && manga.alt_titles.length > 0 && (
              <p className="text-xs text-zinc-400 mt-1">{manga.alt_titles.join(" • ")}</p>
            )}

            {/* Creators */}
            {(() => {
              const creatorList =
                manga.creators && manga.creators.length > 0
                  ? manga.creators
                  : [
                      ...(manga.authors || []).map((a) => ({ ...a, role: "author" })),
                      ...(manga.artists || []).map((a) => ({ ...a, role: "artist" })),
                    ];
              if (creatorList.length === 0) return null;
              return (
                <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-zinc-400">
                  <span className="shrink-0">Tác giả / Họa sĩ:</span>
                  {creatorList.map((c) => (
                    <Link
                      key={`${c.creator_id}-${c.role || "creator"}`}
                      to={`/creators/${c.creator_id}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 font-medium transition-colors"
                    >
                      <span>{c.name}</span>
                      {c.role && (
                        <span className="text-[10px] font-mono text-zinc-400">
                          ({c.role === "author" ? "Tác giả" : c.role === "artist" ? "Họa sĩ" : c.role})
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              );
            })()}

            {/* Tags */}
            {manga.tags && manga.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {manga.tags.map((t) => {
                  const tagSlug = typeof t === "string" ? t : t.slug;
                  const tagName = typeof t === "string" ? t : pickLocalizedText(t.name, t.slug);
                  return (
                    <Link
                      key={tagSlug}
                      to={`/?include_tags=${encodeURIComponent(tagSlug)}`}
                      className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-emerald-300 border border-zinc-700 transition-colors"
                    >
                      #{tagName}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Synopsis with expand/collapse toggle */}
            <div className="mt-4 space-y-1.5">
              <p
                className={`text-xs text-zinc-300 leading-relaxed font-sans ${
                  expandSynopsis ? "" : "line-clamp-4"
                }`}
              >
                {pickLocalizedText(manga.description) || "Chưa có mô tả cho bộ truyện này."}
              </p>
              {pickLocalizedText(manga.description).length > 180 && (
                <button
                  type="button"
                  onClick={() => setExpandSynopsis((prev) => !prev)}
                  className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 transition-colors"
                >
                  {expandSynopsis ? (
                    <>
                      <span>Thu gọn mô tả</span>
                      <ChevronUp className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span>Xem thêm mô tả</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="pt-4 border-t border-zinc-800/80 flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleReadFirst}
              disabled={chapters.length === 0}
              className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-semibold text-xs flex items-center gap-1.5 transition-colors shadow disabled:opacity-40"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>ĐỌC TỪ ĐẦU</span>
            </button>

            <button
              onClick={handleContinueReading}
              disabled={chapters.length === 0}
              className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-mono text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>ĐỌC TIẾP TỤC</span>
            </button>

            {/* Reading Status Selector */}
            <select
              value={currentReadingStatus}
              onChange={(e) => handleUpdateReadingStatus(e.target.value)}
              className="px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="">Trạng thái đọc...</option>
              <option value="reading">Đang đọc</option>
              <option value="plan_to_read">Dự định đọc</option>
              <option value="completed">Đã hoàn thành</option>
              <option value="on_hold">Tạm ngưng</option>
              <option value="dropped">Ngừng đọc</option>
              {currentReadingStatus && <option value="none">Xóa trạng thái</option>}
            </select>

            {/* Rating Trigger */}
            <button
              onClick={() => setShowRatingModal(true)}
              className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-amber-300 border border-zinc-700 flex items-center gap-1.5 transition-colors"
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>{userScore ? `Điểm: ${userScore}/10` : "Chấm Điểm"}</span>
            </button>

            {/* Add to list trigger */}
            <button
              onClick={handleOpenListModal}
              className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 border border-zinc-700 flex items-center gap-1.5 transition-colors"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>Lưu Vào List</span>
            </button>

            {/* Report manga trigger */}
            <button
              onClick={() => setShowReportModal(true)}
              title="Báo lỗi truyện"
              className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 border border-zinc-700 transition-colors ml-auto"
            >
              <AlertTriangle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Chapters & Filter Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold font-mono text-zinc-100 tracking-tight">DANH SÁCH CHƯƠNG</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {chapters.length} chương
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick decimal chapter search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={chapterSearch}
                onChange={(e) => setChapterSearch(e.target.value)}
                placeholder="Tìm số chương (vd: 1, 10.5)..."
                className="bg-zinc-900 border border-zinc-800 rounded pl-8 pr-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Read / Unread filter */}
            <select
              value={readFilter}
              onChange={(e) => setReadFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs font-mono text-zinc-300 focus:outline-none"
            >
              <option value="">Tất cả</option>
              <option value="read">Đã đọc</option>
              <option value="unread">Chưa đọc</option>
            </select>

            {/* Sort toggle */}
            <button
              onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
              className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 flex items-center gap-1 hover:bg-zinc-800"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortOrder === "desc" ? "Mới nhất trước" : "Cũ nhất trước"}</span>
            </button>
          </div>
        </div>

        {chapters.length === 0 ? (
          <div className="p-8 rounded bg-zinc-900 border border-zinc-800 text-center text-xs text-zinc-500">
            Chưa có chương nào được phát hành hoặc không khớp với tiêu chí tìm kiếm.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {chapters.map((ch) => (
              <Link
                key={ch.pool_chapter_id}
                to={`/read/${ch.pool_chapter_id}`}
                className={`p-3 rounded border text-xs flex items-center justify-between transition-colors ${
                  ch.is_read
                    ? "bg-zinc-950/60 border-zinc-800/60 text-zinc-400 hover:border-zinc-700"
                    : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-emerald-500/50"
                }`}
              >
                <div>
                  <div className="font-mono font-semibold text-zinc-100 flex items-center gap-1.5">
                    <span>Chương {ch.chapter_number}</span>
                    {ch.is_completed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  {ch.title && <p className="text-[11px] text-zinc-500 truncate max-w-[180px]">{ch.title}</p>}
                </div>
                <div className="text-right font-mono text-[10px] text-zinc-500 shrink-0">
                  <p>{ch.page_count} trang</p>
                  <p>{ch.view_count || 0} views</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recommendations Carousel / Rows */}
      {(recContent.length > 0 || recItem.length > 0) && (
        <section className="space-y-4 pt-4 border-t border-zinc-800">
          <h2 className="text-base font-bold font-mono text-zinc-100 tracking-tight">TRUYỆN TƯƠNG TỰ BẠN CÓ THỂ THÍCH</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[...recContent, ...recItem]
              .filter((v, i, a) => a.findIndex((t) => t.pool_manga_id === v.pool_manga_id) === i)
              .slice(0, 6)
              .map((rec) => (
                <Link
                  key={rec.pool_manga_id}
                  to={`/mangas/${rec.slug || rec.pool_manga_id}`}
                  className="group p-2 rounded bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 transition-colors block"
                >
                  <CoverImage
                    src={rec.cover_url}
                    alt={rec.title}
                    containerClassName="aspect-[3/4] rounded mb-2"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-emerald-400 truncate">
                    {rec.title}
                  </h4>
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mt-1">
                    <span>★ {Number(rec.average_rating || 0).toFixed(1)}</span>
                    <span>{rec.chapter_count} ch</span>
                  </div>
                </Link>
              ))}
          </div>
        </section>
      )}

      {/* Comments Section */}
      <section className="space-y-4 pt-6 border-t border-zinc-800">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-bold font-mono text-zinc-100 tracking-tight">BÌNH LUẬN & THẢO LUẬN</h2>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {comments.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={commentSort}
              onChange={(e) => setCommentSort(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs font-mono text-zinc-300 focus:outline-none"
            >
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
              <option value="top_liked">Nổi bật nhất (Top Liked)</option>
            </select>
          </div>
        </div>

        {/* Comment Composer */}
        <form onSubmit={handlePostComment} className="p-4 rounded bg-zinc-900/60 border border-zinc-800 space-y-3">
          {commentError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded border border-rose-500/20">{commentError}</p>
          )}

          <textarea
            required
            maxLength={2000}
            rows={3}
            value={commentContent}
            onChange={(e) => setCommentContent(e.target.value)}
            placeholder={
              currentUser
                ? "Chia sẻ cảm nghĩ của bạn về bộ truyện (tối đa 2000 ký tự)..."
                : "Vui lòng đăng nhập để tham gia bình luận."
            }
            disabled={!currentUser}
            className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
          />

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={isCommentSpoiler}
                onChange={(e) => setIsCommentSpoiler(e.target.checked)}
                className="rounded border-zinc-700 text-emerald-500 focus:ring-0 bg-zinc-900"
              />
              <span>Chứa nội dung Spoiler</span>
            </label>

            <button
              type="submit"
              disabled={!currentUser || !commentContent.trim()}
              className="px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-semibold text-xs transition-colors disabled:opacity-40"
            >
              GỬI BÌNH LUẬN
            </button>
          </div>
        </form>

        {/* Comments List (Threaded by parent_comment_id) */}
        <div className="space-y-3">
          {(() => {
            if (comments.length === 0) {
              return (
                <div className="p-8 rounded bg-zinc-900/50 border border-zinc-800 text-center text-xs font-mono text-zinc-400">
                  Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nhận!
                </div>
              );
            }
            const idSet = new Set(comments.map((item) => item.comment_id));
            const repliesByParent = new Map<string, CommentItem[]>();
            const rootComments: CommentItem[] = [];
            comments.forEach((item) => {
              if (item.parent_comment_id && idSet.has(item.parent_comment_id)) {
                const list = repliesByParent.get(item.parent_comment_id) || [];
                list.push(item);
                repliesByParent.set(item.parent_comment_id, list);
              } else {
                rootComments.push(item);
              }
            });
            return rootComments.map((c) => (
              <CommentCard
                key={c.comment_id}
                comment={c}
                replies={repliesByParent.get(c.comment_id) || []}
                repliesByParent={repliesByParent}
                currentUser={currentUser}
                onOpenAuth={onOpenAuth}
                onReaction={handleReaction}
                onViewHistory={handleViewEditHistory}
                onReply={handleReplyComment}
                onEdit={handleEditComment}
                onDelete={handleDeleteComment}
                onToggleSpoiler={handleToggleSpoiler}
                onReport={(cid) => {
                  if (!currentUser) {
                    onOpenAuth();
                    return;
                  }
                  setReportCommentTargetId(cid);
                }}
              />
            ));
          })()}
        </div>
      </section>

      {/* Rating Prerequisite Modal (UC-4.7) */}
      <ModalMotion
        isOpen={showRatingModal}
        onClose={() => setShowRatingModal(false)}
        ariaLabel="Đánh giá điểm truyện"
        maxWidthClass="max-w-sm"
      >
        <div className="bg-zinc-900 border border-zinc-800 rounded-md p-6 space-y-4 shadow-2xl relative">
          <button
            type="button"
            onClick={() => setShowRatingModal(false)}
            aria-label="Đóng"
            className="absolute top-3.5 right-3.5 p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="text-center">
            <Star className="w-8 h-8 text-amber-400 fill-amber-400 mx-auto mb-2" />
            <h3 className="text-sm font-bold font-mono text-zinc-100">ĐÁNH GIÁ ĐIỂM TRUYỆN</h3>
            <p className="text-xs text-zinc-400 mt-1">
              Chấm điểm từ 1 đến 10 dựa trên trải nghiệm của bạn
            </p>
          </div>

          {ratingError && (
            <div
              role="alert"
              className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs"
            >
              {ratingError}
            </div>
          )}

          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleRateSubmit(num)}
                className={`py-2 rounded font-mono font-bold text-xs border transition-colors ${
                  userScore === num
                    ? "bg-amber-500 text-zinc-950 border-amber-400"
                    : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-amber-400/50"
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowRatingModal(false)}
            className="w-full py-2 rounded bg-zinc-800 text-zinc-300 hover:text-zinc-100 text-xs font-mono"
          >
            Đóng
          </button>
        </div>
      </ModalMotion>

      {/* Report Manga Modal (UC-4.9) */}
      <ModalMotion
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        ariaLabel="Báo cáo sự cố hoặc vi phạm"
        maxWidthClass="max-w-md"
      >
        <div className="bg-zinc-900 border border-zinc-800 rounded-md p-6 space-y-4 shadow-2xl relative">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold font-mono text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>BÁO CÁO SỰ CỐ / VI PHẠM</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowReportModal(false)}
              aria-label="Đóng"
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {reportSuccess ? (
            <div className="p-4 rounded bg-emerald-500/10 text-emerald-400 text-xs text-center font-mono">
              Đã ghi nhận báo cáo thành công. Cảm ơn đóng góp của bạn!
            </div>
          ) : (
            <form onSubmit={handleReportSubmit} className="space-y-3">
              <div>
                <label htmlFor="report-reason" className="block text-[11px] font-mono text-zinc-400 mb-1">
                  LÝ DO BÁO CÁO
                </label>
                <select
                  id="report-reason"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 font-sans"
                >
                  <option value="broken_images">Ảnh bị lỗi / không tải được</option>
                  <option value="wrong_chapter_order">Sai thứ tự chương / trang</option>
                  <option value="inappropriate_content">Nội dung vi phạm quy định</option>
                  <option value="copyright">Vi phạm bản quyền</option>
                  <option value="other">Lý do khác</option>
                </select>
              </div>

              <div>
                <label htmlFor="report-desc" className="block text-[11px] font-mono text-zinc-400 mb-1">
                  CHI TIẾT MÔ TẢ (TÙY CHỌN)
                </label>
                <textarea
                  id="report-desc"
                  rows={3}
                  maxLength={1000}
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  placeholder="Mô tả cụ thể trang hoặc lỗi phát sinh..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-xs text-zinc-200"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-zinc-100 text-xs font-mono"
                >
                  HỦY
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-rose-500 hover:bg-rose-400 text-zinc-950 font-mono font-semibold text-xs"
                >
                  GỬI BÁO CÁO
                </button>
              </div>
            </form>
          )}
        </div>
      </ModalMotion>

      {/* Add to List Modal (UC-8.3) */}
      <ModalMotion
        isOpen={showListModal}
        onClose={() => setShowListModal(false)}
        ariaLabel="Lưu vào danh sách đọc"
        maxWidthClass="max-w-sm"
      >
        <div className="bg-zinc-900 border border-zinc-800 rounded-md p-6 space-y-4 shadow-2xl relative">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold font-mono text-zinc-100 flex items-center gap-2">
              <BookmarkPlus className="w-4 h-4 text-emerald-400" />
              <span>LƯU VÀO DANH SÁCH ĐỌC</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowListModal(false)}
              aria-label="Đóng"
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {userLists.map((l) => (
              <label
                key={l.list_id}
                className="flex items-center gap-2 p-2 rounded bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 cursor-pointer hover:border-zinc-700"
              >
                <input
                  type="checkbox"
                  checked={selectedListIds.includes(l.list_id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedListIds([...selectedListIds, l.list_id]);
                    } else {
                      setSelectedListIds(selectedListIds.filter((id) => id !== l.list_id));
                    }
                  }}
                  className="rounded border-zinc-700 text-emerald-500"
                />
                <span className="font-medium truncate">{l.name}</span>
                <span className="text-[10px] font-mono text-zinc-400 ml-auto">
                  ({l.manga_count} truyện)
                </span>
              </label>
            ))}
          </div>

          <div className="pt-2 border-t border-zinc-800">
            <label htmlFor="detail-new-list" className="block text-[11px] font-mono text-zinc-400 mb-1">
              HOẶC TẠO LIST MỚI TẠI CHỖ
            </label>
            <input
              id="detail-new-list"
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Tên danh sách mới..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-200"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowListModal(false)}
              className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-zinc-100 text-xs font-mono"
            >
              HỦY
            </button>
            <button
              type="button"
              onClick={handleAddToLists}
              disabled={selectedListIds.length === 0 && !newListName.trim()}
              className="px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-semibold text-xs disabled:opacity-40"
            >
              LƯU LẠI
            </button>
          </div>
        </div>
      </ModalMotion>

      {/* Comment Edit History Modal (UC-5.4) */}
      <ModalMotion
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        ariaLabel="Lịch sử chỉnh sửa bình luận"
        maxWidthClass="max-w-md"
      >
        <div className="bg-zinc-900 border border-zinc-800 rounded-md p-6 space-y-4 shadow-2xl relative">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold font-mono text-zinc-100">LỊCH SỬ CHỈNH SỬA BÌNH LUẬN</h3>
            <button
              type="button"
              onClick={() => setShowHistoryModal(false)}
              aria-label="Đóng"
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {historyItems.map((h) => (
              <div
                key={h.edit_id}
                className="p-3 rounded bg-zinc-950 border border-zinc-800 text-xs space-y-1"
              >
                <p className="text-zinc-300 font-sans">{h.previous_content}</p>
                <p className="text-[10px] font-mono text-zinc-400">
                  Sửa đổi lúc: {new Date(h.edited_at).toLocaleString("vi-VN")}
                </p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowHistoryModal(false)}
            className="w-full py-1.5 rounded bg-zinc-800 text-zinc-300 hover:text-zinc-100 text-xs font-mono"
          >
            Đóng
          </button>
        </div>
      </ModalMotion>

      {/* Report Comment Modal */}
      <ModalMotion
        isOpen={Boolean(reportCommentTargetId)}
        onClose={() => setReportCommentTargetId(null)}
        ariaLabel="Báo cáo bình luận"
        maxWidthClass="max-w-md"
      >
        <form
          onSubmit={handleReportCommentSubmit}
          className="bg-zinc-900 border border-zinc-800 rounded-md p-6 space-y-4 shadow-2xl relative"
        >
          <button
            type="button"
            onClick={() => setReportCommentTargetId(null)}
            aria-label="Đóng"
            className="absolute top-3.5 right-3.5 p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="text-sm font-bold font-mono text-zinc-100 flex items-center gap-2">
            <Flag className="w-4 h-4 text-rose-400" />
            <span>BÁO CÁO BÌNH LUẬN</span>
          </h3>

          <div className="space-y-3 text-xs font-mono">
            <div>
              <label htmlFor="comment-report-reason" className="block text-zinc-400 mb-1">
                LÝ DO VI PHẠM
              </label>
              <select
                id="comment-report-reason"
                value={commentReportReason}
                onChange={(e) => setCommentReportReason(e.target.value as any)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="unmarked_spoiler">Tiết lộ nội dung (Spoiler) không che</option>
                <option value="spam">Spam / Quảng cáo rác</option>
                <option value="harassment">Quấy rối / Công kích cá nhân</option>
                <option value="hate_speech">Ngôn từ thù ghét</option>
                <option value="other">Lý do khác</option>
              </select>
            </div>

            <div>
              <label htmlFor="comment-report-desc" className="block text-zinc-400 mb-1">
                MÔ TẢ CHI TIẾT (TÙY CHỌN)
              </label>
              <textarea
                id="comment-report-desc"
                rows={3}
                maxLength={1000}
                value={commentReportDesc}
                onChange={(e) => setCommentReportDesc(e.target.value)}
                placeholder="Ghi chú thêm cho Kiểm duyệt viên..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 font-sans focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReportCommentTargetId(null)}
              className="px-4 py-2 rounded bg-zinc-800 text-zinc-300 text-xs font-mono hover:bg-zinc-700"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono"
            >
              Gửi Báo Cáo
            </button>
          </div>
        </form>
      </ModalMotion>
    </div>
  );
};

// Sub-component for rendering a single comment + nested replies
const CommentCard: React.FC<{
  comment: CommentItem;
  replies: CommentItem[];
  repliesByParent: Map<string, CommentItem[]>;
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
  onReaction: (commentId: string, r: "like" | "dislike") => void;
  onViewHistory: (commentId: string) => void;
  onReply: (parentCommentId: string, content: string, isSpoiler: boolean) => Promise<void>;
  onEdit: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => void;
  onToggleSpoiler: (commentId: string, isSpoiler: boolean) => void;
  onReport: (commentId: string) => void;
  depth?: number;
}> = ({
  comment,
  replies,
  repliesByParent,
  currentUser,
  onOpenAuth,
  onReaction,
  onViewHistory,
  onReply,
  onEdit,
  onDelete,
  onToggleSpoiler,
  onReport,
  depth = 0,
}) => {
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [replySpoiler, setReplySpoiler] = useState(false);
  const [replySubmitting, setReplySubmitting] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const isAuthor = currentUser?.user_id === comment.user_id;
  const isStaff = currentUser?.role === "admin" || currentUser?.role === "moderator";
  const canToggleSpoiler = isStaff || (isAuthor && !comment.spoiler_locked_by_admin);

  const submitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    setReplySubmitting(true);
    try {
      await onReply(comment.comment_id, replyContent.trim(), replySpoiler);
      setReplyContent("");
      setReplySpoiler(false);
      setShowReplyBox(false);
    } catch {
      // handled by parent toast/log if needed
    } finally {
      setReplySubmitting(false);
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContent.trim()) return;
    setEditSubmitting(true);
    try {
      await onEdit(comment.comment_id, editContent.trim());
      setIsEditing(false);
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="p-4 rounded bg-zinc-900 border border-zinc-800 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px] flex items-center justify-center overflow-hidden shrink-0">
              {comment.avatar_url && !avatarError ? (
                <img
                  src={comment.avatar_url}
                  alt={comment.display_name}
                  onError={() => setAvatarError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                comment.display_name.charAt(0).toUpperCase()
              )}
            </div>
            <span className="font-semibold text-zinc-200">{comment.display_name}</span>
            <span className="text-[10px] font-mono text-zinc-400">
              {new Date(comment.created_at).toLocaleDateString("vi-VN")}
            </span>
            {comment.is_edited && (
              <button
                type="button"
                onClick={() => onViewHistory(comment.comment_id)}
                className="text-[10px] font-mono text-zinc-400 hover:text-emerald-400 underline"
              >
                (Đã chỉnh sửa)
              </button>
            )}
          </div>

          {comment.is_spoiler && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              SPOILER {comment.spoiler_locked_by_admin ? "[ADMIN_LOCKED]" : ""}
            </span>
          )}
        </div>

        {/* Content with Spoiler Mask or Inline Edit */}
        {comment.is_deleted ? (
          <p className="text-xs text-zinc-400 italic">[Bình luận đã bị xóa]</p>
        ) : isEditing ? (
          <form onSubmit={submitEdit} className="space-y-2 pt-1">
            <textarea
              rows={2}
              maxLength={2000}
              required
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex justify-end gap-2 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(comment.content);
                }}
                className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={editSubmitting || !editContent.trim()}
                className="px-2.5 py-1 rounded bg-emerald-500 text-zinc-950 font-bold hover:bg-emerald-400 disabled:opacity-40"
              >
                {editSubmitting ? "Đang lưu..." : "Lưu Sửa"}
              </button>
            </div>
          </form>
        ) : comment.is_spoiler && !spoilerRevealed ? (
          <button
            type="button"
            onClick={() => setSpoilerRevealed(true)}
            className="w-full p-3 rounded bg-zinc-950 border border-zinc-800/80 text-center cursor-pointer hover:border-amber-500/40 transition-colors"
          >
            <span className="text-xs font-mono text-amber-400/90 font-medium">
              Spoiler - Nhấn để xem nội dung
            </span>
          </button>
        ) : (
          <p className="text-xs text-zinc-300 leading-relaxed font-sans whitespace-pre-line">
            {comment.content}
          </p>
        )}

        {/* Reaction and action footer */}
        {!comment.is_deleted && (
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-1 text-[11px] font-mono text-zinc-400">
            <button
              type="button"
              onClick={() => onReaction(comment.comment_id, "like")}
              className={`flex items-center gap-1 hover:text-emerald-400 transition-colors ${
                comment.user_reaction === "like" ? "text-emerald-400 font-bold" : ""
              }`}
            >
              <ThumbsUp className="w-3 h-3" />
              <span>{comment.like_count || 0}</span>
            </button>

            <button
              type="button"
              onClick={() => onReaction(comment.comment_id, "dislike")}
              className={`flex items-center gap-1 hover:text-rose-400 transition-colors ${
                comment.user_reaction === "dislike" ? "text-rose-400 font-bold" : ""
              }`}
            >
              <ThumbsDown className="w-3 h-3" />
              <span>{comment.dislike_count || 0}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!currentUser) {
                  onOpenAuth();
                  return;
                }
                setShowReplyBox((v) => !v);
              }}
              className="flex items-center gap-1 hover:text-zinc-200 transition-colors"
            >
              <Reply className="w-3 h-3" />
              <span>Trả lời</span>
            </button>

            {isAuthor && !isEditing && (
              <button
                type="button"
                onClick={() => {
                  setEditContent(comment.content);
                  setIsEditing(true);
                }}
                className="flex items-center gap-1 hover:text-zinc-200 transition-colors"
              >
                <Edit2 className="w-3 h-3" />
                <span>Sửa</span>
              </button>
            )}

            {canToggleSpoiler && (
              <button
                type="button"
                onClick={() => onToggleSpoiler(comment.comment_id, !comment.is_spoiler)}
                className="flex items-center gap-1 hover:text-amber-300 transition-colors"
              >
                {comment.is_spoiler ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <span>{comment.is_spoiler ? "Gỡ Spoiler" : "Gắn Spoiler"}</span>
              </button>
            )}

            {(isAuthor || isStaff) && (
              <button
                type="button"
                onClick={() => onDelete(comment.comment_id)}
                className="flex items-center gap-1 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Xóa</span>
              </button>
            )}

            {!isAuthor && (
              <button
                type="button"
                onClick={() => onReport(comment.comment_id)}
                className="flex items-center gap-1 hover:text-amber-400 transition-colors ml-auto"
              >
                <Flag className="w-3 h-3" />
                <span>Báo cáo</span>
              </button>
            )}
          </div>
        )}

        {/* Inline Reply Box */}
        {showReplyBox && (
          <form onSubmit={submitReply} className="pt-2 border-t border-zinc-800/80 space-y-2">
            <textarea
              rows={2}
              maxLength={2000}
              required
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder={`Phản hồi ${comment.display_name}...`}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
              <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replySpoiler}
                  onChange={(e) => setReplySpoiler(e.target.checked)}
                  className="rounded border-zinc-700 text-emerald-500 bg-zinc-900"
                />
                <span>Spoiler</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowReplyBox(false)}
                  className="px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={replySubmitting || !replyContent.trim()}
                  className="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold disabled:opacity-40"
                >
                  {replySubmitting ? "Đang gửi..." : "Gửi Phản Hồi"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Child Replies */}
      {replies.length > 0 && (
        <div className={`${depth < 3 ? "pl-3 sm:pl-5 border-l border-zinc-800" : ""} space-y-2`}>
          {replies.map((reply) => (
            <CommentCard
              key={reply.comment_id}
              comment={reply}
              replies={repliesByParent.get(reply.comment_id) || []}
              repliesByParent={repliesByParent}
              currentUser={currentUser}
              onOpenAuth={onOpenAuth}
              onReaction={onReaction}
              onViewHistory={onViewHistory}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleSpoiler={onToggleSpoiler}
              onReport={onReport}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

