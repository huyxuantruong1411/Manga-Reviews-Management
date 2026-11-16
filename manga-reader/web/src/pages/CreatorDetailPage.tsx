import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookOpen, ExternalLink, RefreshCw, Sparkles, Tag as TagIcon, UserCheck } from "lucide-react";
import { api, pickLocalizedText, type CreatorDetail } from "../api/client";
import { MangaCard } from "../components/MangaCard";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "ongoing", label: "Đang tiến hành" },
  { value: "completed", label: "Đã hoàn thành" },
  { value: "hiatus", label: "Tạm ngưng" },
  { value: "cancelled", label: "Đã hủy" },
];

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "latest_update", label: "Mới cập nhật" },
  { value: "rating", label: "Điểm cao nhất" },
  { value: "views", label: "Lượt xem nhiều nhất" },
];

function extractLinks(links: CreatorDetail["links"]): Array<{ label: string; url: string }> {
  if (!links) return [];
  const entries: Array<{ label: string; url: string }> = [];
  if (Array.isArray(links)) {
    links.forEach((raw, idx) => {
      if (typeof raw === "string" && /^https?:\/\//i.test(raw)) {
        entries.push({ label: `Liên kết ${idx + 1}`, url: raw });
      }
    });
  } else if (typeof links === "object") {
    Object.entries(links).forEach(([k, v]) => {
      if (typeof v === "string" && /^https?:\/\//i.test(v)) {
        entries.push({ label: k, url: v });
      }
    });
  }
  return entries;
}

export const CreatorDetailPage: React.FC = () => {
  const { creatorId } = useParams<{ creatorId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const statusFilter = searchParams.get("status") || "";
  const tagFilter = searchParams.get("tag_slug") || "";
  const sortBy = searchParams.get("sort_by") || "latest_update";

  const [creator, setCreator] = useState<CreatorDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const fetchCreator = async () => {
    if (!creatorId) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.getCreatorDetail(creatorId, {
        status: statusFilter || undefined,
        tag_slug: tagFilter || undefined,
        sort_by: sortBy,
        page_size: 48,
      });
      setCreator(data);
    } catch (err: any) {
      setError(err.message || "Không thể tải thông tin tác giả / họa sĩ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreator();
  }, [creatorId, statusFilter, tagFilter, sortBy]);

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  if (loading && !creator) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <div className="h-32 rounded bg-zinc-900 border border-zinc-800 animate-shimmer motion-reduce:after:hidden" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="aspect-[3/4] rounded bg-zinc-900 border border-zinc-800 animate-shimmer motion-reduce:after:hidden"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error && !creator) {
    return (
      <div className="p-8 rounded bg-red-500/10 border border-red-500/30 text-center space-y-4">
        <p className="text-red-300 text-sm font-medium">{error}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={fetchCreator}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Thử lại
          </button>
          <Link
            to="/search?type=creator"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-200 text-xs transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Tìm tác giả khác
          </Link>
        </div>
      </div>
    );
  }

  if (!creator) return null;

  const safeLinks = extractLinks(creator.links);
  const availableTags = Array.from(
    new Map(
      creator.works
        .flatMap((w) => w.tags || [])
        .map((t) => (typeof t === "string" ? [t, { slug: t, name: t }] : [t.slug, t]))
    ).values()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 text-xs font-mono text-zinc-400">
        <Link to="/" className="inline-flex items-center gap-1.5 hover:text-zinc-200 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Catalog</span>
        </Link>
        <span className="truncate">/{creator.slug}</span>
      </div>

      {/* Creator Profile Card */}
      <section className="p-5 sm:p-6 rounded bg-zinc-900 border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <UserCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 truncate">{creator.name}</h1>
              <p className="text-xs font-mono text-zinc-400 mt-0.5 flex flex-wrap items-center gap-2">
                <span>{creator.total_works} tác phẩm công khai</span>
                {creator.mangadex_id && <span className="text-zinc-500">• ID: {creator.mangadex_id.slice(0, 8)}</span>}
              </p>
            </div>
          </div>

          {safeLinks.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {safeLinks.map((lnk) => (
                <a
                  key={lnk.url}
                  href={lnk.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 text-xs font-mono text-zinc-300 transition-colors"
                >
                  <span>{lnk.label}</span>
                  <ExternalLink className="w-3 h-3 text-emerald-400" />
                </a>
              ))}
            </div>
          )}
        </div>

        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
          {pickLocalizedText(creator.biography) || "Chưa có tiểu sử chi tiết cho tác giả / họa sĩ này."}
        </p>
      </section>

      {/* Filters Toolbar */}
      <section className="p-3 sm:p-4 rounded bg-zinc-900/70 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-zinc-400 flex items-center gap-1.5 mr-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tác phẩm:</span>
          </span>

          <select
            aria-label="Lọc trạng thái tác phẩm"
            value={statusFilter}
            onChange={(e) => updateFilter("status", e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Lọc thể loại"
            value={tagFilter}
            onChange={(e) => updateFilter("tag_slug", e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="">Tất cả thể loại</option>
            {tagFilter && !availableTags.some((t) => t.slug === tagFilter) && (
              <option value={tagFilter}>#{tagFilter}</option>
            )}
            {availableTags.map((t) => (
              <option key={t.slug} value={t.slug}>
                {pickLocalizedText(t.name, t.slug)}
              </option>
            ))}
          </select>

          {(statusFilter || tagFilter) && (
            <button
              type="button"
              onClick={() => setSearchParams(new URLSearchParams(sortBy !== "latest_update" ? { sort_by: sortBy } : {}))}
              className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono transition-colors"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <TagIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <select
            aria-label="Sắp xếp tác phẩm"
            value={sortBy}
            onChange={(e) => updateFilter("sort_by", e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && (
        <div className="p-3 rounded bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-3 text-xs text-red-300">
          <span>{error}</span>
          <button type="button" onClick={fetchCreator} className="underline font-semibold shrink-0">
            Thử lại
          </button>
        </div>
      )}

      {/* Works Grid / Empty State */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4" aria-busy="true">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="aspect-[3/4] rounded bg-zinc-900 border border-zinc-800 animate-shimmer motion-reduce:after:hidden"
            />
          ))}
        </div>
      ) : creator.works.length === 0 ? (
        <div className="py-14 px-4 rounded bg-zinc-900/50 border border-zinc-800 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-zinc-500 mx-auto" />
          <p className="text-sm font-medium text-zinc-200">
            Không có tác phẩm nào khớp với bộ lọc hiện tại.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {(statusFilter || tagFilter) && (
              <button
                type="button"
                onClick={() => setSearchParams(new URLSearchParams())}
                className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors"
              >
                Xem toàn bộ tác phẩm
              </button>
            )}
            <Link
              to="/"
              className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
            >
              Về Catalog
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {creator.works.map((work) => (
            <div key={work.pool_manga_id} className="space-y-1.5">
              <MangaCard manga={work} />
              {work.creator_roles && work.creator_roles.length > 0 && (
                <div className="flex flex-wrap gap-1 px-0.5">
                  {work.creator_roles.map((r) => (
                    <span
                      key={r}
                      className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 capitalize"
                    >
                      {r === "author" ? "Tác giả" : r === "artist" ? "Họa sĩ" : r}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
