import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Trash2,
  BarChart2,
  Search,
  Filter,
  Star,
  BookOpen,
  PieChart,
  Layers,
} from "lucide-react";
import { api, ReadingListDetail, MangaItem } from "@/api/client";

export const ListDetailPage: React.FC = () => {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();

  const [list, setList] = useState<ReadingListDetail | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);

  const [tab, setTab] = useState<"items" | "analytics">("items");
  const [q, setQ] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchDetail = async () => {
    if (!listId) return;
    setLoading(true);
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
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [listId, selectedTag, selectedStatus]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDetail();
  };

  const handleRemoveItem = async (mangaId: string) => {
    if (!listId) return;
    try {
      await api.removeMangaFromList(listId, mangaId);
      fetchDetail();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-pulse space-y-4">
        <div className="h-24 bg-zinc-900 rounded border border-zinc-800" />
        <div className="h-64 bg-zinc-900 rounded border border-zinc-800" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center rounded bg-zinc-900 border border-zinc-800">
        <p className="text-sm font-mono text-zinc-300">Không tìm thấy danh sách hoặc bạn không có quyền truy cập.</p>
        <Link to="/lists" className="inline-block mt-4 text-xs font-mono text-emerald-400">
          &larr; Quay lại danh sách của tôi
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header Card */}
      <div className="p-6 rounded bg-zinc-900 border border-zinc-800 space-y-2 relative">
        <Link to="/lists" className="text-xs font-mono text-zinc-400 hover:text-zinc-200 flex items-center gap-1 mb-2">
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

        {/* Tab switch */}
        <div className="flex border-b border-zinc-800 pt-4 gap-4 text-xs font-mono">
          <button
            onClick={() => setTab("items")}
            className={`pb-2 border-b-2 font-semibold transition-colors flex items-center gap-1.5 ${
              tab === "items"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>DANH SÁCH TRUYỆN</span>
          </button>
          <button
            onClick={() => setTab("analytics")}
            className={`pb-2 border-b-2 font-semibold transition-colors flex items-center gap-1.5 ${
              tab === "analytics"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>THỐNG KÊ METADATA</span>
          </button>
        </div>
      </div>

      {tab === "items" ? (
        <div className="space-y-4">
          {/* In-list filter toolbar */}
          <div className="p-3 rounded bg-zinc-900 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-sm">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm trong danh sách này..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-zinc-200 placeholder-zinc-500"
              />
              <button type="submit" className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-200">
                Tìm
              </button>
            </form>

            <div className="flex items-center gap-2 flex-wrap">
              {availableTags.length > 0 && (
                <select
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
            <div className="p-8 text-center rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-500">
              Không có truyện nào trong danh sách khớp với bộ lọc.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((m) => (
                <div
                  key={m.pool_manga_id}
                  className="p-3 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 flex gap-3 relative group"
                >
                  <div className="w-16 shrink-0 aspect-[3/4] bg-zinc-950 rounded overflow-hidden">
                    {m.cover_url ? (
                      <img src={m.cover_url} alt={m.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-700 font-mono">
                        N/A
                      </div>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-between text-xs">
                    <div>
                      <Link
                        to={`/mangas/${m.slug || m.pool_manga_id}`}
                        className="font-bold text-zinc-100 hover:text-emerald-400 transition-colors line-clamp-1"
                      >
                        {m.title}
                      </Link>
                      <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 mt-0.5">
                        <span className="capitalize">{m.status}</span>
                        <span>•</span>
                        <span>{m.chapter_count} ch</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 font-mono text-[10px]">
                      <span className="text-amber-400">★ {Number(m.average_rating || 0).toFixed(1)}</span>
                      <button
                        onClick={() => handleRemoveItem(m.pool_manga_id)}
                        className="text-zinc-600 hover:text-rose-400 transition-colors"
                        title="Xóa khỏi list"
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
                <span className="text-xs text-zinc-500 block">TỔNG MANGA</span>
                <span className="text-2xl font-bold text-emerald-400 mt-1 block">{analytics.total_mangas}</span>
              </div>
              <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
                <span className="text-xs text-zinc-500 block">TỔNG CHƯƠNG</span>
                <span className="text-2xl font-bold text-sky-400 mt-1 block">{analytics.total_chapters}</span>
              </div>
              <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
                <span className="text-xs text-zinc-500 block">ĐIỂM TRUNG BÌNH</span>
                <span className="text-2xl font-bold text-amber-400 mt-1 block">
                  ★ {Number(analytics.average_rating || 0).toFixed(1)}
                </span>
              </div>
              <div className="p-4 rounded bg-zinc-900 border border-zinc-800 text-center font-mono">
                <span className="text-xs text-zinc-500 block">THỂ LOẠI KHÁC NHAU</span>
                <span className="text-2xl font-bold text-violet-400 mt-1 block">
                  {analytics.tag_distribution?.length || 0}
                </span>
              </div>
            </div>

            {/* Tag Distribution */}
            <div className="p-4 rounded bg-zinc-900 border border-zinc-800 space-y-3 font-mono text-xs">
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">PHÂN BỐ THỂ LOẠI (TAGS)</h3>
              <div className="space-y-2">
                {analytics.tag_distribution?.map((t: any) => (
                  <div key={t.slug} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-zinc-300">#{t.slug} ({t.name})</span>
                      <span className="text-emerald-400">{t.count} ({t.percentage}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded" style={{ width: `${t.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
};
