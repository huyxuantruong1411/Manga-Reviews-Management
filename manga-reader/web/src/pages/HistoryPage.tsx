import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGroup } from "motion/react";
import { Clock, Star, Play, RotateCcw } from "lucide-react";
import { api, UserProfile } from "@/api/client";
import { CoverImage } from "@/components/CoverImage";
import { AnimatedTabPanel, AnimatedTabPill } from "@/components/MotionPrimitives";

interface HistoryPageProps {
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
}

interface ReadingHistoryItem {
  manga_id: string;
  slug?: string;
  title: string;
  cover_url?: string | null;
  is_hidden?: boolean;
  last_read_chapter_id?: string | null;
  last_read_chapter_number?: string | number | null;
  last_read_page_number?: number;
  is_chapter_completed?: boolean;
  last_read_at: string;
  read_chapter_ids?: string[];
}

interface RatingHistoryItem {
  pool_manga_id?: string;
  manga_title: string;
  action: string;
  new_score?: number;
  changed_at: string;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ currentUser, onOpenAuth }) => {
  const [tab, setTab] = useState<"reading" | "ratings">("reading");
  const [readingItems, setReadingItems] = useState<ReadingHistoryItem[]>([]);
  const [ratingItems, setRatingItems] = useState<RatingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const [rHist, rateHist] = await Promise.all([
        api.getReadingHistory(),
        api.getRatingHistory(),
      ]);
      setReadingItems(rHist.items || []);
      setRatingItems(rateHist.items || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tải lịch sử.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadHistory();
    }
  }, [currentUser, loadHistory]);

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center rounded bg-zinc-900 border border-zinc-800 space-y-4">
        <Clock className="w-10 h-10 text-emerald-400 mx-auto" />
        <h2 className="text-base font-bold font-mono text-zinc-100">LỊCH SỬ ĐỌC & ĐÁNH GIÁ</h2>
        <p className="text-xs text-zinc-400">
          Vui lòng đăng nhập để đồng bộ lịch sử đọc và điểm số của bạn.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-bold text-xs"
        >
          Đăng Nhập Ngay
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LayoutGroup id="history-tabs">
        <div className="flex border-b border-zinc-800 gap-2 text-xs font-mono">
          {(
            [
              { id: "reading" as const, icon: Clock, label: "LỊCH SỬ ĐỌC TRUYỆN" },
              { id: "ratings" as const, icon: Star, label: "LỊCH SỬ CHẤM ĐIỂM" },
            ] as const
          ).map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative px-3 py-2.5 font-bold transition-colors flex items-center gap-1.5 rounded-t ${
                  active ? "text-emerald-300" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {active && (
                  <AnimatedTabPill
                    layoutId="history-tab-pill"
                    className="rounded-t bg-emerald-500/10 border-b-2 border-emerald-400"
                  />
                )}
                <Icon className="w-4 h-4 relative z-10" />
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      {loading ? (
        <div role="status" aria-busy="true" className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-zinc-900 rounded border border-zinc-800 animate-shimmer motion-reduce:after:hidden"
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded bg-rose-500/10 border border-rose-500/20 text-center space-y-3">
          <p className="text-sm font-medium text-rose-300">{error}</p>
          <button
            type="button"
            onClick={loadHistory}
            className="px-4 py-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Thử Lại</span>
          </button>
        </div>
      ) : (
        <AnimatedTabPanel tabKey={tab}>
          {tab === "reading" ? (
            readingItems.length === 0 ? (
              <div className="p-12 text-center rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
                Lịch sử đọc của bạn đang trống.
              </div>
            ) : (
              <div className="space-y-2">
                {readingItems.map((item, idx) => {
                  const mangaHref = `/mangas/${item.slug || item.manga_id}`;
                  const resumePage = item.last_read_page_number && item.last_read_page_number > 1 ? `?page=${item.last_read_page_number}` : "";
                  return (
                    <div
                      key={`${item.manga_id}-${idx}`}
                      className="p-3 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Link to={mangaHref} className="shrink-0">
                          <CoverImage
                            src={item.cover_url}
                            alt={item.title}
                            containerClassName="w-11 aspect-[3/4] rounded border border-zinc-800"
                            className="w-full h-full object-cover"
                          />
                        </Link>
                        <div className="min-w-0">
                          <Link
                            to={mangaHref}
                            className="font-bold text-zinc-100 hover:text-emerald-400 font-mono block truncate"
                          >
                            {item.title}
                          </Link>
                          <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                            Đọc đến chương: {item.last_read_chapter_number || "N/A"} &bull; Trang{" "}
                            {item.last_read_page_number || 1}
                            {item.read_chapter_ids && item.read_chapter_ids.length > 0 && (
                              <span className="text-zinc-500"> &bull; Đã đọc {item.read_chapter_ids.length} chương</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] font-mono text-zinc-400 hidden sm:inline">
                          {new Date(item.last_read_at).toLocaleDateString("vi-VN")}
                        </span>
                        {item.last_read_chapter_id && (
                          <Link
                            to={`/read/${item.last_read_chapter_id}${resumePage}`}
                            className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-bold text-xs flex items-center gap-1 transition-colors"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Đọc tiếp</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : ratingItems.length === 0 ? (
            <div className="p-12 text-center rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
              Bạn chưa chấm điểm cho bộ truyện nào.
            </div>
          ) : (
            <div className="space-y-2">
              {ratingItems.map((r, idx) => (
                <div
                  key={`${r.manga_title}-${idx}`}
                  className="p-3 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3 text-xs font-mono"
                >
                  <div>
                    <span className="font-bold text-zinc-100">{r.manga_title}</span>
                    <span className="text-[11px] text-zinc-400 block mt-0.5">
                      Hành động: {r.action}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-amber-400 font-bold text-sm">
                      ★ {r.new_score || 0}/10
                    </span>
                    <span className="text-[10px] text-zinc-400 block">
                      {new Date(r.changed_at).toLocaleString("vi-VN")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AnimatedTabPanel>
      )}
    </div>
  );
};
