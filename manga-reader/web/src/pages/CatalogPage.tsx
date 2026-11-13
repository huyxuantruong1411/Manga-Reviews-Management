import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutGroup } from "motion/react";
import {
  SlidersHorizontal,
  ArrowUpDown,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FilterX,
  LayoutGrid,
  Grid3x3,
  List,
} from "lucide-react";
import { api, MangaItem, UserProfile } from "@/api/client";
import { MangaCard, type MangaViewVariant } from "@/components/MangaCard";
import {
  AnimatedTabPill,
  AnimatedViewSwitcher,
  CollapsiblePanel,
} from "@/components/MotionPrimitives";

interface CatalogPageProps {
  currentUser: UserProfile | null;
}

const VIEW_MODE_STORAGE_KEY = "manga-reader-catalog-view";

function getStoredViewMode(): MangaViewVariant {
  try {
    const val = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (val === "grid" || val === "compact" || val === "list") return val;
  } catch {
    // ignore storage errors
  }
  return "grid";
}

export const CatalogPage: React.FC<CatalogPageProps> = ({ currentUser }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [mangas, setMangas] = useState<MangaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<MangaViewVariant>(getStoredViewMode);

  // Recommendations
  const [userRecs, setUserRecs] = useState<MangaItem[]>([]);

  // Filter states
  const page = Number(searchParams.get("page") || 1);
  const sortBy = searchParams.get("sort_by") || "latest_update";
  const status = searchParams.get("status") || "";
  const demographic = searchParams.get("demographic") || "";
  const includeTags = searchParams.get("include_tags") || "";

  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const changeViewMode = (next: MangaViewVariant) => {
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi khi tải danh sách manga.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, [page, sortBy, status, demographic, includeTags]);

  useEffect(() => {
    if (currentUser) {
      api
        .getUserRecommendations()
        .then((res) => setUserRecs(res.items.slice(0, 6) || []))
        .catch(() => setUserRecs([]));
    } else {
      setUserRecs([]);
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
  const activeFiltersCount = [status, demographic, includeTags].filter(Boolean).length;

  const containerClass =
    viewMode === "list"
      ? "grid grid-cols-1 lg:grid-cols-2 gap-3"
      : viewMode === "compact"
        ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5"
        : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4";

  return (
    <div className="space-y-8">
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
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-zinc-100 font-mono tracking-tight">DANH MỤC TRUYỆN</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
              {total} tác phẩm
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Phân trang cố định 24 truyện/trang &bull; Đồng bộ thời gian thực từ Manga Data Lake
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Animated View Mode Switcher */}
          <LayoutGroup id="catalog-view-switcher">
            <div
              role="group"
              aria-label="Chế độ hiển thị danh mục"
              className="flex items-center p-0.5 rounded bg-zinc-900 border border-zinc-800"
            >
              {(
                [
                  { id: "grid" as const, icon: LayoutGrid, label: "Lưới" },
                  { id: "compact" as const, icon: Grid3x3, label: "Thu gọn" },
                  { id: "list" as const, icon: List, label: "Danh sách" },
                ] as const
              ).map((item) => {
                const active = viewMode === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => changeViewMode(item.id)}
                    aria-pressed={active}
                    title={`Hiển thị dạng ${item.label}`}
                    className={`relative px-2 py-1 rounded text-xs font-mono flex items-center gap-1 transition-colors ${
                      active ? "text-emerald-300" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {active && (
                      <AnimatedTabPill
                        layoutId="catalog-view-pill"
                        className="rounded bg-emerald-500/15 border border-emerald-500/40"
                      />
                    )}
                    <Icon className="w-3.5 h-3.5 relative z-10" />
                    <span className="hidden md:inline relative z-10">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>

          {/* Filter Toggle */}
          <button
            type="button"
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            aria-expanded={showFilterDrawer}
            className={`px-3 py-1.5 rounded text-xs font-mono flex items-center gap-1.5 border transition-colors ${
              activeFiltersCount > 0 || showFilterDrawer
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Bộ Lọc</span>
            {activeFiltersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Sort Select */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs font-mono text-zinc-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
            <select
              aria-label="Sắp xếp danh sách truyện"
              value={sortBy}
              onChange={(e) => updateParam("sort_by", e.target.value)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="latest_update" className="bg-zinc-900">
                Mới cập nhật
              </option>
              <option value="most_views" className="bg-zinc-900">
                Nhiều lượt xem nhất
              </option>
              <option value="highest_rating" className="bg-zinc-900">
                Điểm cao nhất
              </option>
              <option value="title_asc" className="bg-zinc-900">
                Tên A &rarr; Z
              </option>
            </select>
          </div>

          <button
            type="button"
            onClick={fetchCatalog}
            title="Tải lại"
            aria-label="Tải lại danh mục"
            className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Collapsible Animated Filter Drawer */}
      <CollapsiblePanel isOpen={showFilterDrawer}>
        <div className="p-4 rounded bg-zinc-900/70 border border-zinc-800 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Status */}
            <div>
              <p className="text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">TÌNH TRẠNG</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "", label: "Tất cả" },
                  { id: "ongoing", label: "Đang tiến hành" },
                  { id: "completed", label: "Đã hoàn thành" },
                  { id: "hiatus", label: "Tạm ngưng" },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
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
              <p className="text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">ĐỐI TƯỢNG ĐỘC GIẢ</p>
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
                    type="button"
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
              <p className="text-[11px] font-mono text-zinc-400 mb-1.5 uppercase">THỂ LOẠI (TAG)</p>
              <div className="flex flex-wrap gap-1.5">
                {["action", "comedy", "drama", "fantasy", "romance", "sci-fi", "slice-of-life"].map((t) => (
                  <button
                    key={t}
                    type="button"
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

          {activeFiltersCount > 0 && (
            <div className="pt-2 border-t border-zinc-800/60 flex justify-end">
              <button
                type="button"
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
      </CollapsiblePanel>

      {/* Main Catalog: 4 states with AnimatedViewSwitcher */}
      {loading ? (
        <div role="status" aria-busy="true" aria-label="Đang tải danh mục manga" className={containerClass}>
          {Array.from({ length: viewMode === "list" ? 8 : 12 }).map((_, i) =>
            viewMode === "list" ? (
              <div
                key={i}
                className="flex gap-3 p-3 rounded bg-zinc-900 border border-zinc-800 animate-shimmer motion-reduce:after:hidden"
              >
                <div className="w-16 sm:w-20 aspect-[3/4] rounded bg-zinc-800/60 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3.5 bg-zinc-800 rounded w-2/3" />
                  <div className="h-3 bg-zinc-800/70 rounded w-1/2" />
                  <div className="h-3 bg-zinc-800/60 rounded w-1/3 mt-4" />
                </div>
              </div>
            ) : (
              <div
                key={i}
                className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden animate-shimmer motion-reduce:after:hidden"
              >
                <div className="aspect-[3/4] bg-zinc-800/50" />
                {viewMode === "grid" && (
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-zinc-800 rounded w-3/4" />
                    <div className="h-2 bg-zinc-800 rounded w-1/2" />
                  </div>
                )}
              </div>
            )
          )}
        </div>
      ) : error ? (
        <div className="p-8 rounded bg-rose-500/10 border border-rose-500/20 text-center space-y-3">
          <p className="text-sm font-medium text-rose-300">{error}</p>
          <button
            type="button"
            onClick={fetchCatalog}
            className="px-4 py-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Thử Lại
          </button>
        </div>
      ) : mangas.length === 0 ? (
        <div className="p-12 rounded bg-zinc-900 border border-zinc-800 text-center space-y-3">
          <p className="text-sm font-medium text-zinc-300">Không tìm thấy truyện phù hợp.</p>
          <p className="text-xs text-zinc-400">
            Hãy thử nới lỏng các tiêu chí bộ lọc hoặc thử từ khóa tìm kiếm khác.
          </p>
          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearchParams(new URLSearchParams());
              }}
              className="px-3 py-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono hover:bg-emerald-500/20 transition-colors"
            >
              Đặt Lại Bộ Lọc
            </button>
          )}
        </div>
      ) : (
        <AnimatedViewSwitcher viewKey={`${viewMode}-${page}-${sortBy}-${status}-${demographic}`}>
          <div className={containerClass}>
            {mangas.map((manga) => (
              <MangaCard key={manga.pool_manga_id} manga={manga} variant={viewMode} />
            ))}
          </div>
        </AnimatedViewSwitcher>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pt-6 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-mono text-zinc-400">
            Trang {page} / {totalPages} ({total} kết quả)
          </span>

          <div className="flex items-center gap-1 font-mono text-xs">
            <button
              type="button"
              disabled={page <= 1}
              aria-label="Trang trước"
              onClick={() => updateParam("page", String(page - 1))}
              className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 rounded bg-zinc-900 border border-zinc-800 text-emerald-400">
              {page}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              aria-label="Trang sau"
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
