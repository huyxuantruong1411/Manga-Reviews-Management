import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, UserCheck, BookOpen, AlertCircle } from "lucide-react";
import { api, MangaItem } from "@/api/client";
import { MangaCard } from "@/components/MangaCard";

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const type = (searchParams.get("type") || "title") as "title" | "creator";

  const [inputVal, setInputVal] = useState(query);
  const [results, setResults] = useState<MangaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const executeSearch = async (term: string, searchType: "title" | "creator") => {
    if (!term.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.searchMangas(term.trim(), searchType);
      setResults(data.items || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setInputVal(query);
    if (query) {
      executeSearch(query, type);
    }
  }, [query, type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      setSearchParams({ q: inputVal.trim(), type });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="max-w-2xl mx-auto text-center space-y-4">
        <h1 className="text-xl font-bold font-mono text-zinc-100 tracking-tight">TÌM KIẾM TRUYỆN TRANH</h1>
        <p className="text-xs text-zinc-400">
          Hỗ trợ tiếng Việt không dấu, đối sánh mờ pg_trgm chịu lỗi chính tả &bull; Tìm theo tiêu đề hoặc tác giả
        </p>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Nhập tên truyện hoặc tác giả (vd: vi du manga, oda, hanh trinh)..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-10 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/60 font-sans shadow-inner"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono font-semibold text-xs rounded transition-colors shadow"
          >
            TÌM
          </button>
        </form>

        {/* Search Mode Toggle */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setSearchParams({ q: query, type: "title" })}
            className={`px-3 py-1 rounded text-xs font-mono border transition-colors flex items-center gap-1.5 ${
              type === "title"
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Tiêu Đề & Alt Titles</span>
          </button>
          <button
            onClick={() => setSearchParams({ q: query, type: "creator" })}
            className={`px-3 py-1 rounded text-xs font-mono border transition-colors flex items-center gap-1.5 ${
              type === "creator"
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Tác Giả / Họa Sĩ</span>
          </button>
        </div>
      </div>

      {/* Results presentation */}
      <div className="pt-6">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-zinc-900 rounded border border-zinc-800 aspect-[3/4]" />
            ))}
          </div>
        ) : searched && results.length === 0 ? (
          <div className="p-12 text-center rounded bg-zinc-900 border border-zinc-800 max-w-md mx-auto space-y-2">
            <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-sm font-semibold text-zinc-300">Không tìm thấy kết quả nào</p>
            <p className="text-xs text-zinc-500">
              Không có manga nào khớp với từ khóa "{query}". Hãy kiểm tra lại chính tả hoặc thử tìm với tên tiếng Anh / tiếng Nhật.
            </p>
          </div>
        ) : (
          <div>
            {searched && (
              <p className="text-xs font-mono text-zinc-400 mb-4">
                Tìm thấy {results.length} tác phẩm khớp với từ khóa "{query}":
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {results.map((m) => (
                <MangaCard key={m.pool_manga_id} manga={m} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

