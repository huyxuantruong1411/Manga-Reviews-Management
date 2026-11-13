import React, { useCallback, useEffect, useState } from "react";
import { BarChart2, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { api, UserProfile } from "@/api/client";
import { MOTION_EASE } from "@/components/MotionPrimitives";

interface StatsPageProps {
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
}

interface ReadingStatsResponse {
  total_mangas_read?: number;
  total_chapters_completed?: number;
  average_given_score?: number;
  top_genres?: Record<string, number>;
}

export const StatsPage: React.FC<StatsPageProps> = ({ currentUser, onOpenAuth }) => {
  const [stats, setStats] = useState<ReadingStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getReadingAnalytics(currentUser.user_id);
      setStats(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tải dữ liệu thống kê.";
      setError(msg);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadStats();
    }
  }, [currentUser, loadStats]);

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center rounded bg-zinc-900 border border-zinc-800 space-y-4">
        <BarChart2 className="w-10 h-10 text-emerald-400 mx-auto" />
        <h2 className="text-base font-bold font-mono text-zinc-100">THỐNG KÊ THÓI QUEN ĐỌC</h2>
        <p className="text-xs text-zinc-400">
          Đăng nhập để theo dõi dữ liệu thói quen và thể loại ưa thích của bạn.
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

  const genreEntries = stats?.top_genres ? Object.entries(stats.top_genres) : [];
  const maxGenreCount = Math.max(1, ...genreEntries.map(([, c]) => Number(c) || 0));

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-zinc-800">
        <h1 className="text-lg font-bold font-mono text-zinc-100 tracking-tight">
          THỐNG KÊ THÓI QUEN ĐỌC TRUYỆN
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Dữ liệu phân tích hành vi và thể loại manga được cache 15 phút
        </p>
      </div>

      {loading ? (
        <div role="status" aria-busy="true" className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-zinc-900 rounded border border-zinc-800 animate-shimmer motion-reduce:after:hidden"
            />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded bg-rose-500/10 border border-rose-500/20 text-center space-y-3">
          <p className="text-sm font-medium text-rose-300">{error}</p>
          <button
            type="button"
            onClick={loadStats}
            className="px-4 py-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Thử Lại</span>
          </button>
        </div>
      ) : stats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
              <span className="text-[11px] text-zinc-400 block uppercase">BỘ TRUYỆN ĐÃ ĐỌC</span>
              <span className="text-2xl font-bold text-emerald-400 mt-1 block">
                {stats.total_mangas_read || 0}
              </span>
            </div>
            <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
              <span className="text-[11px] text-zinc-400 block uppercase">CHƯƠNG ĐÃ HOÀN TẤT</span>
              <span className="text-2xl font-bold text-sky-400 mt-1 block">
                {stats.total_chapters_completed || 0}
              </span>
            </div>
            <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
              <span className="text-[11px] text-zinc-400 block uppercase">ĐIỂM TRUNG BÌNH ĐÃ CHẤM</span>
              <span className="text-2xl font-bold text-amber-400 mt-1 block">
                ★ {Number(stats.average_given_score || 0).toFixed(1)}
              </span>
            </div>
            <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
              <span className="text-[11px] text-zinc-400 block uppercase">THỂ LOẠI KHÁM PHÁ</span>
              <span className="text-2xl font-bold text-violet-400 mt-1 block">{genreEntries.length}</span>
            </div>
          </div>

          {/* Top Genres Breakdown */}
          {genreEntries.length > 0 && (
            <div className="p-6 rounded bg-zinc-900 border border-zinc-800 space-y-4">
              <h3 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider">
                TOP THỂ LOẠI ĐỌC NHIỀU NHẤT
              </h3>
              <div className="space-y-3">
                {genreEntries.map(([genre, rawCount]) => {
                  const count = Number(rawCount) || 0;
                  const ratio = Math.min(1, count / maxGenreCount);
                  return (
                    <div key={genre} className="space-y-1 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-zinc-300">#{genre}</span>
                        <span className="text-emerald-400 font-semibold">{count} chương</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-950 rounded overflow-hidden">
                        <motion.div
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: ratio }}
                          transition={{ duration: 0.45, ease: MOTION_EASE }}
                          className="w-full h-full bg-emerald-500 rounded origin-left"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-12 text-center rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
          Chưa có đủ dữ liệu đọc truyện để tạo thống kê. Hãy khám phá và đọc thêm vài chương manga!
        </div>
      )}
    </div>
  );
};
