import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutGroup } from "motion/react";
import { Search, UserCheck, BookOpen, AlertCircle, LayoutGrid, Grid3x3, List, X } from "lucide-react";
import { api, MangaItem } from "@/api/client";
import { MangaCard, type MangaViewVariant } from "@/components/MangaCard";
import { AnimatedTabPill, AnimatedViewSwitcher } from "@/components/MotionPrimitives";

const SEARCH_VIEW_STORAGE_KEY = "manga-reader-search-view";

function getStoredSearchView(): MangaViewVariant {
  try {
    const val = localStorage.getItem(SEARCH_VIEW_STORAGE_KEY);
    if (val === "grid" || val === "compact" || val === "list") return val;
  } catch {
    // ignore storage errors
  }
  return "grid";
}

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const type = (searchParams.get("type") || "title") as "title" | "creator";

  const [inputVal, setInputVal] = useState(query);
  const [results, setResults] = useState<MangaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [viewMode, setViewMode] = useState<MangaViewVariant>(getStoredSearchView);

  const changeViewMode = (next: MangaViewVariant) => {
    setViewMode(next);
    try {
      localStorage.setItem(SEARCH_VIEW_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  };

  const executeSearch = async (term: string, searchType: "title" | "creator") => {
    if (!term.trim()) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const data = await api.searchMangas(term.trim(), searchType);
      setResults(data.items || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tìm kiếm truyện lúc này.";
      setError(msg);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setInputVal(query);
    if (query) {
      executeSearch(query, type);
    } else {
      setResults([]);
      setSearched(false);
      setError(null);
    }
  }, [query, type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      setSearchParams({ q: inputVal.trim(), type });
    }
  };

  const containerClass =
    viewMode === "list"
      ? "grid grid-cols-1 lg:grid-cols-2 gap-3"
      : viewMode === "compact"
        ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5"
        : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4";

  return (
    <div className="space-y-6">
      <div className="max-w-2xl mx-auto text-center space-y-4">
        <h1 className="text-xl font-bold font-mono text-zinc-100 tracking-tight">TÌM KIẾM TRUYỆN TRANH</h1>
        <p className="text-xs text-zinc-400">
          Hỗ trợ tiếng Việt không dấu, đối sánh mờ pg_trgm chịu lỗi chính tả &bull; Tìm theo tiêu đề hoặc tác giả
        </p>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Nhập tên truyện hoặc tác giả (vd: one piece, oda)..."
              aria-label="Từ khóa tìm kiếm manga"
              className="w-full bg-zinc-900 border border-zinc-800 rounded pl-10 pr-8 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/60 font-sans shadow-inner"
            />
            {inputVal && (
              <button
                type="button"
                aria-label="Xóa từ khóa"
                onClick={() => {
                  setInputVal("");
                  setSearchParams(type === "title" ? {} : { type });
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-semibold text-xs rounded transition-colors shadow"
          >
            TÌM
          </button>
        </form>

        {/* Search Mode Toggle with animated pill */}
        <LayoutGroup id="search-mode-tabs">
          <div className="flex items-center justify-center gap-2 pt-1">
            {(
              [
                { id: "title" as const, icon: BookOpen, label: "Tiêu Đề & Alt Titles" },
                { id: "creator" as const, icon: UserCheck, label: "Tác Giả / Họa Sĩ" },
              ] as const
            ).map((mode) => {
              const active = type === mode.id;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setSearchParams(query ? { q: query, type: mode.id } : { type: mode.id })}
                  className={`relative px-3 py-1.5 rounded text-xs font-mono border transition-colors flex items-center gap-1.5 ${
                    active
                      ? "border-emerald-500/50 text-emerald-300"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {active && (
                    <AnimatedTabPill
                      layoutId="search-mode-pill"
                      className="rounded bg-emerald-500/15 border border-emerald-500/40"
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      {/* Results presentation */}
      <div className="pt-4">
        {loading ? (
          <div role="status" aria-busy="true" aria-label="Đang tìm kiếm" className={containerClass}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-zinc-900 rounded border border-zinc-800 aspect-[3/4] animate-shimmer motion-reduce:after:hidden"
              />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 rounded bg-rose-500/10 border border-rose-500/20 text-center max-w-md mx-auto space-y-3">
            <p className="text-sm font-medium text-rose-300">{error}</p>
            <button
              type="button"
              onClick={() => executeSearch(query, type)}
              className="px-4 py-2 rounded bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Thử Lại
            </button>
          </div>
        ) : searched && results.length === 0 ? (
          <div className="p-12 text-center rounded bg-zinc-900 border border-zinc-800 max-w-md mx-auto space-y-2">
            <AlertCircle className="w-8 h-8 text-zinc-400 mx-auto" />
            <p className="text-sm font-semibold text-zinc-200">Không tìm thấy kết quả nào</p>
            <p className="text-xs text-zinc-400">
              Không có manga nào khớp với từ khóa "{query}". Hãy kiểm tra lại chính tả hoặc thử tìm với tên
              khác.
            </p>
          </div>
        ) : (
          <div>
            {searched && (
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-800/70">
                <p className="text-xs font-mono text-zinc-400">
                  Tìm thấy <span className="text-emerald-400 font-semibold">{results.length}</span> tác phẩm
                  khớp với "{query}"
                </p>

                <LayoutGroup id="search-view-switcher">
                  <div
                    role="group"
                    aria-label="Chế độ hiển thị kết quả tìm kiếm"
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
                              layoutId="search-view-pill"
                              className="rounded bg-emerald-500/15 border border-emerald-500/40"
                            />
                          )}
                          <Icon className="w-3.5 h-3.5 relative z-10" />
                          <span className="hidden sm:inline relative z-10">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </LayoutGroup>
              </div>
            )}

            <AnimatedViewSwitcher viewKey={`${viewMode}-${query}-${type}`}>
              <div className={containerClass}>
                {results.map((m) => (
                  <MangaCard key={m.pool_manga_id} manga={m} variant={viewMode} />
                ))}
              </div>
            </AnimatedViewSwitcher>
          </div>
        )}
      </div>
    </div>
  );
};
