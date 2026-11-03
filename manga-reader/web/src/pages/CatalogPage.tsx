import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal, ArrowUpDown, RefreshCw, ChevronLeft, ChevronRight, Sparkles, FilterX } from "lucide-react";
import { api, MangaItem, UserProfile } from "@/api/client";
import { MangaCard } from "@/components/MangaCard";

interface CatalogPageProps {
  currentUser: UserProfile | null;
}

export const CatalogPage: React.FC<CatalogPageProps> = ({ currentUser }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [mangas, setMangas] = useState<MangaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Recommendations
  const [userRecs, setUserRecs] = useState<MangaItem[]>([]);

  // Filter states
  const page = Number(searchParams.get("page") || 1);
  const sortBy = searchParams.get("sort_by") || "latest_update";
  const status = searchParams.get("status") || "";
  const demographic = searchParams.get("demographic") || "";
  const includeTags = searchParams.get("include_tags") || "";

  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const fetchCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMangas({
        page,
        sort_by: sortBy,
        status: status || undefined,
        demographic: demographic || undefined,
        include_tags: includeTags || undefined,
      });
      setMangas(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(err.message || "Lỗi khi tải danh sách manga.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, [page, sortBy, status, demographic, includeTags]);

  useEffect(() => {
    if (currentUser) {
      api.getUserRecommendations()
        .then((res) => setUserRecs(res.items.slice(0, 6) || []))
        .catch(() => setUserRecs([]));
    }
  }, [currentUser]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== "page") {
      next.set("page", "1");
    }
    setSearchParams(next);
  };

  const totalPages = Math.ceil(total / 24);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Personalized Recommendations banner if available */}
      {currentUser && userRecs.length > 0 && (
        <section className="p-4 rounded border border-emerald-500/20 bg-emerald-950/10 space-y-3">
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-semibold tracking-wider uppercase">
            <Sparkles className="w-4 h-4" />
            <span>Gợi Ý Dành Cho Bạn (Mô Hình Phối Hợp K-NN)</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {userRecs.map((m) => (
              <MangaCard key={m.pool_manga_id} manga={m} />
            ))}
          </div>
        </section>
      )}

      {/* Catalog Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-zinc-100 font-mono tracking-tight">DANH MỤC TRUYỆN</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
              {total} tác phẩm
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Phân trang cố định 24 truyện/trang &bull; Đồng bộ thời gian thực từ Manga Data Lake
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className={`px-3 py-1.5 rounded text-xs font-mono flex items-center gap-1.5 border transition-colors ${
              includeTags || status || demographic
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Bộ Lọc</span>
            {(includeTags || status || demographic) && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>

          {/* Sort Select */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs font-mono text-zinc-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={sortBy}
              onChange={(e) => updateParam("sort_by", e.target.value)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="latest_update" className="bg-zinc-900">Mới cập nhật</option>
              <option value="most_views" className="bg-zinc-900">Nhiều lượt xem nhất</option>
              <option value="highest_rating" className="bg-zinc-900">Điểm cao nhất</option>
              <option value="title_asc" className="bg-zinc-900">Tên A &rarr; Z</option>
            </select>
          </div>

          <button
            onClick={fetchCatalog}
            title="Tải lại"
            className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter Drawer / Panel */}
      {showFilterDrawer && (
        <div className="p-4 rounded bg-zinc-900/60 border border-zinc-800 space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Status */}
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">TÌNH TRẠNG</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "", label: "Tất cả" },
                  { id: "ongoing", label: "Đang tiến hành" },
                  { id: "completed", label: "Đã hoàn thành" },
                  { id: "hiatus", label: "Tạm ngưng" },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => updateParam("status", st.id)}
                    className={`px-2.5 py-1 rounded text-xs border font-mono transition-colors ${
                      status === st.id
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Demographic */}
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">ĐỐI TƯỢNG ĐỘC GIẢ</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "", label: "Tất cả" },
                  { id: "shounen", label: "Shounen" },
                  { id: "seinen", label: "Seinen" },
                  { id: "shoujo", label: "Shoujo" },
                  { id: "josei", label: "Josei" },
                ].map((dm) => (
                  <button
                    key={dm.id}
                    onClick={() => updateParam("demographic", dm.id)}
                    className={`px-2.5 py-1 rounded text-xs border font-mono transition-colors ${
                      demographic === dm.id
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {dm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Tag filter */}
            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">THỂ LOẠI (TAG)</label>
              <div className="flex flex-wrap gap-1.5">
                {["action", "comedy", "drama", "fantasy", "romance", "sci-fi", "slice-of-life"].map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      const current = includeTags ? includeTags.split(",") : [];
                      const next = current.includes(t) ? current.filter((x) => x !== t) : [...current, t];
                      updateParam("include_tags", next.join(","));
                    }}
                    className={`px-2.5 py-1 rounded text-xs border font-mono transition-colors ${
                      includeTags.split(",").includes(t)
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {(includeTags || status || demographic) && (
            <div className="pt-2 border-t border-zinc-800/60 flex justify-end">
              <button
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("include_tags");
                  next.delete("status");
                  next.delete("demographic");
                  next.set("page", "1");
                  setSearchParams(next);
                }}
                className="text-xs font-mono text-zinc-400 hover:text-rose-400 flex items-center gap-1 transition-colors"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>Xóa Bộ Lọc</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Grid: 4 states */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
              <div className="aspect-[3/4] bg-zinc-800/50" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-zinc-800 rounded w-3/4" />
                <div className="h-2 bg-zinc-800 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded bg-rose-500/10 border border-rose-500/20 text-center space-y-3">
          <p className="text-sm font-medium text-rose-300">{error}</p>
          <button
            onClick={fetchCatalog}
            className="px-4 py-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Thử Lại
          </button>
        </div>
      ) : mangas.length === 0 ? (
        <div className="p-12 rounded bg-zinc-900 border border-zinc-800 text-center space-y-3">
          <p className="text-sm font-medium text-zinc-300">Không tìm thấy truyện phù hợp.</p>
          <p className="text-xs text-zinc-500">
            Hãy thử nới lỏng các tiêu chí bộ lọc hoặc thử từ khóa tìm kiếm khác.
          </p>
          {(includeTags || status || demographic) && (
            <button
              onClick={() => {
                const next = new URLSearchParams();
                setSearchParams(next);
              }}
              className="px-3 py-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono"
            >
              Đặt Lại Bộ Lọc
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {mangas.map((manga) => (
            <MangaCard key={manga.pool_manga_id} manga={manga} />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pt-6 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-mono text-zinc-500">
            Trang {page} / {totalPages} ({total} kết quả)
          </span>

          <div className="flex items-center gap-1 font-mono text-xs">
            <button
              disabled={page <= 1}
              onClick={() => updateParam("page", String(page - 1))}
              className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 rounded bg-zinc-900 border border-zinc-800 text-emerald-400">
              {page}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => updateParam("page", String(page + 1))}
              className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

