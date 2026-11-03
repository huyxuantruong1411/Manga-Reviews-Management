import React from "react";
import { Link } from "react-router-dom";
import { Star, Eye, BookOpen } from "lucide-react";
import { MangaItem } from "@/api/client";

interface MangaCardProps {
  manga: MangaItem;
}

export const MangaCard: React.FC<MangaCardProps> = ({ manga }) => {
  const statusColor =
    manga.status === "ongoing"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : manga.status === "completed"
      ? "text-sky-400 bg-sky-500/10 border-sky-500/20"
      : "text-zinc-400 bg-zinc-800 border-zinc-700";

  const statusLabel =
    manga.status === "ongoing"
      ? "Đang tiến hành"
      : manga.status === "completed"
      ? "Đã hoàn thành"
      : manga.status === "hiatus"
      ? "Tạm ngưng"
      : manga.status;

  return (
    <Link
      to={`/mangas/${manga.slug || manga.pool_manga_id}`}
      className="group flex flex-col bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 rounded overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/50"
    >
      {/* Cover Image */}
      <div className="relative aspect-[3/4] w-full bg-zinc-950 overflow-hidden">
        {manga.cover_url ? (
          <img
            src={manga.cover_url}
            alt={manga.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 p-4 text-center">
            <BookOpen className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-[10px] font-mono">NO_COVER</span>
          </div>
        )}

        {/* Rating overlay pill */}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm border border-zinc-700/60 text-[11px] font-mono text-amber-300 shadow">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span>{Number(manga.average_rating || 0).toFixed(1)}</span>
        </div>

        {/* Status pill */}
        <div className="absolute bottom-2 left-2">
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusColor} backdrop-blur-md`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Info panel */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors line-clamp-2 leading-snug">
            {manga.title}
          </h3>

          {manga.alt_titles && manga.alt_titles.length > 0 && (
            <p className="text-[10px] text-zinc-500 line-clamp-1 mt-0.5">
              {manga.alt_titles[0]}
            </p>
          )}
        </div>

        <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <span className="text-zinc-400">
            {manga.chapter_count > 0 ? `${manga.chapter_count} ch` : "0 ch"}
          </span>

          <div className="flex items-center gap-1">
            <Eye className="w-3 h-3 text-zinc-600" />
            <span>{manga.view_count || 0}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};
