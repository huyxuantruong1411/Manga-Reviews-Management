import React, { useEffect, useState } from "react";
import { BarChart2, BookOpen, Layers, Award } from "lucide-react";
import { api, UserProfile } from "@/api/client";

interface StatsPageProps {
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
}

export const StatsPage: React.FC<StatsPageProps> = ({ currentUser, onOpenAuth }) => {
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    api.getReadingAnalytics(currentUser.user_id)
      .then((data) => setStats(data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center rounded bg-zinc-900 border border-zinc-800 space-y-4">
        <BarChart2 className="w-10 h-10 text-emerald-400 mx-auto" />
        <h2 className="text-base font-bold font-mono text-zinc-100">THỐNG KÊ THÓI QUEN ĐỌC</h2>
        <p className="text-xs text-zinc-400">Đăng nhập để theo dõi dữ liệu thói quen và thể loại ưa thích của bạn.</p>
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
      <div className="pb-4 border-b border-zinc-800">
        <h1 className="text-lg font-bold font-mono text-zinc-100 tracking-tight">THỐNG KÊ THÓI QUEN ĐỌC TRUYỆN</h1>
        <p className="text-xs text-zinc-400 mt-0.5">Dữ liệu phân tích hành vi và thể loại manga được cache 15 phút</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-zinc-900 rounded border border-zinc-800" />
          ))}
        </div>
      ) : stats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
              <span className="text-[11px] text-zinc-500 block uppercase">BỘ TRUYỆN ĐÃ ĐỌC</span>
              <span className="text-2xl font-bold text-emerald-400 mt-1 block">{stats.total_mangas_read || 0}</span>
            </div>
            <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
              <span className="text-[11px] text-zinc-500 block uppercase">CHƯƠNG ĐÃ HOÀN TẤT</span>
              <span className="text-2xl font-bold text-sky-400 mt-1 block">{stats.total_chapters_completed || 0}</span>
            </div>
            <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
              <span className="text-[11px] text-zinc-500 block uppercase">ĐIỂM TRUNG BÌNH ĐÃ CHẤM</span>
              <span className="text-2xl font-bold text-amber-400 mt-1 block">
                ★ {Number(stats.average_given_score || 0).toFixed(1)}
              </span>
            </div>
            <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
              <span className="text-[11px] text-zinc-500 block uppercase">THỂ LOẠI KHÁM PHÁ</span>
              <span className="text-2xl font-bold text-violet-400 mt-1 block">
                {stats.top_genres ? Object.keys(stats.top_genres).length : 0}
              </span>
            </div>
          </div>

          {/* Top Genres Breakdown */}
          {stats.top_genres && Object.keys(stats.top_genres).length > 0 && (
            <div className="p-6 rounded bg-zinc-900 border border-zinc-800 space-y-4">
              <h3 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider">
                TOP THỂ LOẠI ĐỌC NHIỀU NHẤT
              </h3>
              <div className="space-y-3">
                {Object.entries(stats.top_genres).map(([genre, count]: any) => (
                  <div key={genre} className="space-y-1 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-300">#{genre}</span>
                      <span className="text-emerald-400 font-semibold">{count} chương</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-950 rounded overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded"
                        style={{ width: `${Math.min(100, count * 10)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-12 text-center rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
          Chưa có đủ dữ liệu đọc truyện để tạo thống kê. Hãy khám phá và đọc thêm vài chương manga!
        </div>
      )}
    </div>
  );
};

