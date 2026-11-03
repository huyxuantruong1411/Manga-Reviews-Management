import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Star, Play, CheckCircle2 } from "lucide-react";
import { api, UserProfile } from "@/api/client";

interface HistoryPageProps {
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ currentUser, onOpenAuth }) => {
  const [tab, setTab] = useState<"reading" | "ratings">("reading");
  const [readingItems, setReadingItems] = useState<any[]>([]);
  const [ratingItems, setRatingItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([
      api.getReadingHistory().catch(() => ({ items: [] })),
      api.getRatingHistory().catch(() => ({ items: [] })),
    ])
      .then(([rHist, rateHist]) => {
        setReadingItems(rHist.items || []);
        setRatingItems(rateHist.items || []);
      })
      .finally(() => setLoading(false));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center rounded bg-zinc-900 border border-zinc-800 space-y-4">
        <Clock className="w-10 h-10 text-emerald-400 mx-auto" />
        <h2 className="text-base font-bold font-mono text-zinc-100">LỊCH SỬ ĐỌC & ĐÁNH GIÁ</h2>
        <p className="text-xs text-zinc-400">Vui lòng đăng nhập để đồng bộ lịch sử đọc và điểm số của bạn.</p>
        <button
          onClick={onOpenAuth}
          className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-bold text-xs"
        >
          Đăng Nhập Ngay
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex border-b border-zinc-800 pb-2 gap-4 text-xs font-mono">
        <button
          onClick={() => setTab("reading")}
          className={`pb-2 border-b-2 font-bold transition-colors flex items-center gap-1.5 ${
            tab === "reading" ? "border-emerald-400 text-emerald-400" : "border-transparent text-zinc-400"
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>LỊCH SỬ ĐỌC TRUYỆN</span>
        </button>
        <button
          onClick={() => setTab("ratings")}
          className={`pb-2 border-b-2 font-bold transition-colors flex items-center gap-1.5 ${
            tab === "ratings" ? "border-emerald-400 text-emerald-400" : "border-transparent text-zinc-400"
          }`}
        >
          <Star className="w-4 h-4" />
          <span>LỊCH SỬ CHẤM ĐIỂM</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-zinc-900 rounded border border-zinc-800" />
          ))}
        </div>
      ) : tab === "reading" ? (
        readingItems.length === 0 ? (
          <div className="p-12 text-center rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
            Lịch sử đọc của bạn đang trống.
          </div>
        ) : (
          <div className="space-y-2">
            {readingItems.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs"
              >
                <div>
                  <Link
                    to={`/mangas/${item.pool_manga_id}`}
                    className="font-bold text-zinc-100 hover:text-emerald-400 font-mono"
                  >
                    {item.manga_title || item.pool_manga_id}
                  </Link>
                  <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                    Đọc đến chương: {item.last_read_chapter_number || "N/A"} &bull; Trang {item.last_read_page_number}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-zinc-500 hidden sm:inline">
                    {new Date(item.last_read_at).toLocaleDateString("vi-VN")}
                  </span>
                  {item.last_read_chapter_id && (
                    <Link
                      to={`/read/${item.last_read_chapter_id}`}
                      className="px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-bold text-xs flex items-center gap-1"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Đọc tiếp</span>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        ratingItems.length === 0 ? (
          <div className="p-12 text-center rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
            Bạn chưa chấm điểm cho bộ truyện nào.
          </div>
        ) : (
          <div className="space-y-2">
            {ratingItems.map((r, idx) => (
              <div
                key={idx}
                className="p-3 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <span className="font-bold text-zinc-100">{r.manga_title}</span>
                  <span className="text-[11px] text-zinc-500 block mt-0.5">Hành động: {r.action}</span>
                </div>
                <div className="text-right">
                  <span className="text-amber-400 font-bold text-sm">
                    ★ {r.new_score || 0}/10
                  </span>
                  <span className="text-[10px] text-zinc-500 block">
                    {new Date(r.changed_at).toLocaleString("vi-VN")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};
