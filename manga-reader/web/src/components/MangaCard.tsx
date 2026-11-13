import React from "react";
import { Link } from "react-router-dom";
import { Star, Eye, BookOpen, ChevronRight } from "lucide-react";
import { MangaItem } from "@/api/client";
import { CoverImage } from "./CoverImage";

export type MangaViewVariant = "grid" | "compact" | "list";

interface MangaCardProps {
  manga: MangaItem;
  variant?: MangaViewVariant;
}

export const MangaCard: React.FC<MangaCardProps> = ({ manga, variant = "grid" }) => {
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

  const targetUrl = `/mangas/${manga.slug || manga.pool_manga_id}`;
  const formattedRating = Number(manga.average_rating || 0).toFixed(1);

  if (variant === "list") {
    return (
      <Link
        to={targetUrl}
        className="group flex items-stretch gap-3 sm:gap-4 p-3 rounded bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 transition-all duration-200 hover:bg-zinc-900/90 hover:shadow-lg hover:shadow-black/40"
      >
        <CoverImage
          src={manga.cover_url}
          alt={manga.title}
          containerClassName="w-16 sm:w-20 aspect-[3/4] rounded shrink-0 border border-zinc-800"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors line-clamp-1">
                {manga.title}
              </h3>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${statusColor}`}
              >
                {statusLabel}
              </span>
            </div>

            {manga.alt_titles && manga.alt_titles.length > 0 && (
              <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">{manga.alt_titles[0]}</p>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-zinc-800/60 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-zinc-400">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 text-amber-300">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>{formattedRating}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-zinc-400" />
                <span>{manga.chapter_count || 0} ch</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-zinc-400" />
                <span>{manga.view_count || 0}</span>
              </span>
            </div>

            <span className="text-[11px] text-emerald-400/90 group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-0.5">
              <span>Chi tiết</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link
        to={targetUrl}
        className="group relative aspect-[3/4] rounded bg-zinc-900 border border-zinc-800 hover:border-emerald-500/60 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/50"
      >
        <CoverImage
          src={manga.cover_url}
          alt={manga.title}
          containerClassName="w-full h-full"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm border border-zinc-700/60 text-[10px] font-mono text-amber-300">
          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
          <span>{formattedRating}</span>
        </div>

        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-mono text-zinc-300 border border-zinc-700/50">
          {manga.chapter_count || 0}c
        </div>

        <div className="absolute inset-x-0 bottom-0 p-2 pt-8 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
          <h3 className="text-[11px] font-semibold text-zinc-100 group-hover:text-emerald-300 transition-colors line-clamp-2 leading-tight">
            {manga.title}
          </h3>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={targetUrl}
      className="group flex flex-col bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 rounded overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/50"
    >
      {/* Cover Image */}
      <div className="relative aspect-[3/4] w-full bg-zinc-950 overflow-hidden">
        <CoverImage
          src={manga.cover_url}
          alt={manga.title}
          containerClassName="w-full h-full"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Rating overlay pill */}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm border border-zinc-700/60 text-[11px] font-mono text-amber-300 shadow pointer-events-none">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span>{formattedRating}</span>
        </div>

        {/* Status pill */}
        <div className="absolute bottom-2 left-2 pointer-events-none">
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusColor} backdrop-blur-md`}
          >
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
            <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">{manga.alt_titles[0]}</p>
          )}
        </div>

        <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[11px] font-mono text-zinc-400">
          <span className="text-zinc-300">{manga.chapter_count > 0 ? `${manga.chapter_count} ch` : "0 ch"}</span>

          <div className="flex items-center gap-1">
            <Eye className="w-3 h-3 text-zinc-400" />
            <span>{manga.view_count || 0}</span>
          </div>
        </div>
      </div>
    </Link>
  );
};
