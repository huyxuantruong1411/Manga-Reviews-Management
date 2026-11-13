import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { LayoutGroup, motion } from "motion/react";
import { ChevronLeft, Trash2, BarChart2, BookOpen, RotateCcw } from "lucide-react";
import { api, ReadingListDetail } from "@/api/client";
import { CoverImage } from "@/components/CoverImage";
import { AnimatedTabPanel, AnimatedTabPill, MOTION_EASE } from "@/components/MotionPrimitives";
import { useConfirm, useToast } from "@/components/ToastProvider";

interface ListMangaItem {
  pool_manga_id: string;
  slug?: string;
  title: string;
  cover_url?: string | null;
  status: string;
  chapter_count: number;
  average_rating?: number;
}

interface ListAnalyticsResponse {
  total_mangas: number;
  total_chapters: number;
  average_rating: number;
  tag_distribution?: Array<{ slug: string; name: string; count: number; percentage: number }>;
}

export const ListDetailPage: React.FC = () => {
  const { listId } = useParams<{ listId: string }>();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [list, setList] = useState<ReadingListDetail | null>(null);
  const [items, setItems] = useState<ListMangaItem[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [analytics, setAnalytics] = useState<ListAnalyticsResponse | null>(null);

  const [tab, setTab] = useState<"items" | "analytics">("items");
  const [q, setQ] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!listId) return;
    setLoading(true);
    setError(null);
    try {
      const lData = await api.getReadingListDetail(listId);
      setList(lData);

      const itemsData = await api.getListItems(listId, {
        q: q || undefined,
        tag_slug: selectedTag || undefined,
        pub_status: selectedStatus || undefined,
      });
      setItems(itemsData.items || []);
      setAvailableTags(itemsData.available_tags_in_list || []);

      const anData = await api.getListAnalytics(listId);
      setAnalytics(anData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tải chi tiết danh sách.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [listId, q, selectedTag, selectedStatus]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDetail();
  };

  const handleRemoveItem = async (mangaId: string, title: string) => {
    if (!listId) return;
    const ok = await confirm({
      title: "Gỡ truyện khỏi danh sách?",
      message: `Xóa "${title}" khỏi danh sách đọc này?`,
      confirmLabel: "Xóa khỏi list",
      cancelLabel: "Hủy",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.removeMangaFromList(listId, mangaId);
      showToast(`Đã gỡ "${title}" khỏi danh sách.`, "success");
      fetchDetail();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể gỡ truyện khỏi danh sách.";
      showToast(msg, "error");
    }
  };

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <div className="h-28 bg-zinc-900 rounded border border-zinc-800 animate-shimmer motion-reduce:after:hidden" />
        <div className="h-64 bg-zinc-900 rounded border border-zinc-800 animate-shimmer motion-reduce:after:hidden" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center rounded bg-rose-500/10 border border-rose-500/20 space-y-3">
        <p className="text-sm font-mono text-rose-300">{error}</p>
        <button
          type="button"
          onClick={fetchDetail}
          className="px-4 py-2 rounded bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-200 hover:bg-zinc-800 inline-flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Thử Lại</span>
        </button>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center rounded bg-zinc-900 border border-zinc-800">
        <p className="text-sm font-mono text-zinc-300">
          Không tìm thấy danh sách hoặc bạn không có quyền truy cập.
        </p>
        <Link to="/lists" className="inline-block mt-4 text-xs font-mono text-emerald-400">
          &larr; Quay lại danh sách của tôi
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="p-6 rounded bg-zinc-900 border border-zinc-800 space-y-2">
        <Link
          to="/lists"
          className="text-xs font-mono text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1 mb-2"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Danh Sách Của Tôi</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold font-mono text-zinc-100">{list.name}</h1>
            {list.description && <p className="text-xs text-zinc-400 mt-1">{list.description}</p>}
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              {list.manga_count} bộ truyện
            </span>
          </div>
        </div>

        {/* Animated Tab switch */}
        <LayoutGroup id="list-detail-tabs">
          <div className="flex border-b border-zinc-800 pt-4 gap-2 text-xs font-mono">
            {(
              [
                { id: "items" as const, icon: BookOpen, label: "DANH SÁCH TRUYỆN" },
                { id: "analytics" as const, icon: BarChart2, label: "THỐNG KÊ METADATA" },
              ] as const
            ).map((t) => {
              const active = tab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`relative px-3 py-2 font-semibold transition-colors flex items-center gap-1.5 rounded-t ${
                    active ? "text-emerald-300" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {active && (
                    <AnimatedTabPill
                      layoutId="list-detail-tab-pill"
                      className="rounded-t bg-emerald-500/10 border-b-2 border-emerald-400"
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">{t.label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      <AnimatedTabPanel tabKey={tab}>
        {tab === "items" ? (
          <div className="space-y-4">
            {/* In-list filter toolbar */}
            <div className="p-3 rounded bg-zinc-900 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px] max-w-sm">
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tìm trong danh sách này..."
                  aria-label="Tìm truyện trong danh sách"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-zinc-200 placeholder-zinc-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                >
                  Tìm
                </button>
              </form>

              <div className="flex items-center gap-2 flex-wrap">
                {availableTags.length > 0 && (
                  <select
                    aria-label="Lọc theo thể loại"
                    value={selectedTag}
                    onChange={(e) => setSelectedTag(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-300"
                  >
                    <option value="">Tất cả thể loại</option>
                    {availableTags.map((t) => (
                      <option key={t} value={t}>
                        #{t}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  aria-label="Lọc theo tình trạng"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-300"
                >
                  <option value="">Tất cả tình trạng</option>
                  <option value="ongoing">Đang tiến hành</option>
                  <option value="completed">Đã hoàn thành</option>
                </select>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="p-8 text-center rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
                Không có truyện nào trong danh sách khớp với bộ lọc.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {items.map((m) => (
                  <div
                    key={m.pool_manga_id}
                    className="p-3 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 flex gap-3 relative group transition-colors"
                  >
                    <CoverImage
                      src={m.cover_url}
                      alt={m.title}
                      containerClassName="w-16 shrink-0 aspect-[3/4] rounded"
                      className="w-full h-full object-cover"
                    />

                    <div className="flex-1 min-w-0 flex flex-col justify-between text-xs">
                      <div>
                        <Link
                          to={`/mangas/${m.slug || m.pool_manga_id}`}
                          className="font-bold text-zinc-100 hover:text-emerald-400 transition-colors line-clamp-1"
                        >
                          {m.title}
                        </Link>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 mt-0.5">
                          <span className="capitalize">{m.status}</span>
                          <span>&bull;</span>
                          <span>{m.chapter_count} ch</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 font-mono text-[10px]">
                        <span className="text-amber-400">
                          ★ {Number(m.average_rating || 0).toFixed(1)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(m.pool_manga_id, m.title)}
                          className="text-zinc-400 hover:text-rose-400 transition-colors p-1"
                          title="Xóa khỏi list"
                          aria-label={`Xóa ${m.title} khỏi list`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Metadata Analytics Dashboard (UC-8.5) */
          analytics && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
                  <span className="text-xs text-zinc-400 block">TỔNG MANGA</span>
                  <span className="text-2xl font-bold text-emerald-400 mt-1 block">
                    {analytics.total_mangas}
                  </span>
                </div>
                <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
                  <span className="text-xs text-zinc-400 block">TỔNG CHƯƠNG</span>
                  <span className="text-2xl font-bold text-sky-400 mt-1 block">
                    {analytics.total_chapters}
                  </span>
                </div>
                <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
                  <span className="text-xs text-zinc-400 block">ĐIỂM TRUNG BÌNH</span>
                  <span className="text-2xl font-bold text-amber-400 mt-1 block">
                    ★ {Number(analytics.average_rating || 0).toFixed(1)}
                  </span>
                </div>
                <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
                  <span className="text-xs text-zinc-400 block">THỂ LOẠI KHÁC NHAU</span>
                  <span className="text-2xl font-bold text-violet-400 mt-1 block">
                    {analytics.tag_distribution?.length || 0}
                  </span>
                </div>
              </div>

              {/* Tag Distribution */}
              <div className="p-4 rounded bg-zinc-900 border border-zinc-800 space-y-3 font-mono text-xs">
                <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                  PHÂN BỐ THỂ LOẠI (TAGS)
                </h3>
                <div className="space-y-2">
                  {analytics.tag_distribution?.map((t) => {
                    const ratio = Math.min(1, Math.max(0, (t.percentage || 0) / 100));
                    return (
                      <div key={t.slug} className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-zinc-300">
                            #{t.slug} ({t.name})
                          </span>
                          <span className="text-emerald-400">
                            {t.count} ({t.percentage}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-800 rounded overflow-hidden">
                          <motion.div
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: ratio }}
                            transition={{ duration: 0.4, ease: MOTION_EASE }}
                            className="w-full h-full bg-emerald-500 rounded origin-left"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )
        )}
      </AnimatedTabPanel>
    </div>
  );
};
