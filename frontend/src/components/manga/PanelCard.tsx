import React, { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Maximize2, BookOpen, Layers, ExternalLink, Sparkles } from "lucide-react";
import type { PanelResult } from "../../types/panel";

interface PanelCardProps {
  panel: PanelResult;
  searchQuery: string;
  onOpenFullPage: (panel: PanelResult) => void;
  onWordClick: (word: string, event: React.MouseEvent) => void;
}

export const PanelCard: React.FC<PanelCardProps> = ({
  panel,
  searchQuery,
  onOpenFullPage,
  onWordClick,
}) => {
  const navigate = useNavigate();
  const cropUrl = `/api/panels/${panel.panel_id}/crop`;

  // Tokenize text into words while keeping punctuation and whitespace
  const tokens = useMemo(() => {
    const text = panel.raw_text || panel.cleaned_text || "";
    if (!text) return [];

    const queryTokens = searchQuery
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-zA-Z0-9]/g, ""))
      .filter(Boolean);

    const parts = text.split(/(\s+)/);
    return parts.map((part) => {
      const isWord = /[a-zA-Z0-9\u00C0-\u024F\u1EA0-\u1EF9]+/.test(part);
      const cleanWord = part.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1EA0-\u1EF9]/g, "").toLowerCase();
      const isMatch =
        cleanWord.length > 0 &&
        queryTokens.some((q) => cleanWord.includes(q) || q.includes(cleanWord));

      return {
        raw: part,
        isWord,
        cleanWord,
        isMatch,
      };
    });
  }, [panel.raw_text, panel.cleaned_text, searchQuery]);

  const handleReadFromHere = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (panel.manga_id && panel.chapter_id) {
      navigate(`/manga/${panel.manga_id}/read/${panel.chapter_id}?page=${panel.page_number}`);
    }
  };

  return (
    <div className="group flex flex-col overflow-hidden text-left bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-amber-500/50 rounded-2xl shadow-xs hover:shadow-xl transition-all duration-300">
      {/* 1. Origin Header: Manga cover, title, volume, chapter, page */}
      <div className="p-3 bg-[var(--bg-primary)]/70 border-b border-[var(--border-primary)]/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Manga Cover Thumbnail */}
          <Link
            to={`/manga/${panel.manga_id}`}
            className="shrink-0 w-8 h-11 rounded-md overflow-hidden bg-zinc-800 border border-[var(--border-primary)] hover:opacity-85 transition"
            title={`Đi đến trang manga ${panel.manga_title}`}
          >
            {panel.manga_cover_url ? (
              <img
                src={panel.manga_cover_url}
                alt={panel.manga_title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 font-bold bg-zinc-800">
                M
              </div>
            )}
          </Link>

          {/* Manga Title & Chapter Origin Info */}
          <div className="min-w-0 flex-1">
            <Link
              to={`/manga/${panel.manga_id}`}
              className="text-xs font-bold text-[var(--text-primary)] hover:text-amber-500 transition truncate block tracking-tight"
              title={panel.manga_title}
            >
              {panel.manga_title}
            </Link>
            <div className="flex items-center flex-wrap gap-1.5 mt-0.5 text-[11px] text-[var(--text-secondary)]">
              {panel.volume && (
                <span className="font-semibold text-amber-500">
                  Vol. {panel.volume}
                </span>
              )}
              <span className="font-medium">
                Ch. {panel.chapter_number}
                {panel.chapter_title ? ` - ${panel.chapter_title}` : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Page & Panel Index Badges */}
        <div className="flex flex-col items-end shrink-0 gap-1">
          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 dark:text-amber-400 font-bold text-[10px] border border-amber-500/20">
            Trang {panel.page_number}
          </span>
          <span className="text-[10px] font-mono text-[var(--text-secondary)]">
            Panel #{panel.panel_index + 1}
          </span>
        </div>
      </div>

      {/* 2. Panel Image Container with Crop */}
      <div className="relative w-full aspect-[4/3] bg-zinc-950/80 overflow-hidden flex items-center justify-center border-b border-[var(--border-primary)]/60">
        <img
          src={cropUrl}
          alt={`Panel ${panel.panel_index + 1} page ${panel.page_number} of ${panel.manga_title}`}
          loading="lazy"
          className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
        />

        {/* Hover Quick Actions Overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2.5 backdrop-blur-[2px] p-3">
          <button
            type="button"
            onClick={() => onOpenFullPage(panel)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-amber-400 font-semibold text-xs border border-amber-500/30 shadow-lg transform -translate-y-1 group-hover:translate-y-0 transition cursor-pointer"
            title="Mở toàn trang với khung định vị vàng"
          >
            <Maximize2 size={13} />
            <span>Toàn trang</span>
          </button>

          <button
            type="button"
            onClick={handleReadFromHere}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-lg shadow-amber-500/30 transform -translate-y-1 group-hover:translate-y-0 transition cursor-pointer"
            title="Mở trình đọc MangaDex tại chính xác trang này"
          >
            <BookOpen size={13} />
            <span>Đọc từ trang này</span>
          </button>
        </div>
      </div>

      {/* 3. Dialogue Transcript Body */}
      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
            <BookOpen size={12} />
            <span>Lời thoại ngữ cảnh</span>
          </div>

          <div className="text-xs leading-relaxed text-[var(--text-primary)] break-words font-medium select-text min-h-[3rem]">
            {tokens.length > 0 ? (
              tokens.map((tok, idx) => (
                <React.Fragment key={idx}>
                  {tok.isWord ? (
                    <span
                      onClick={(e) => onWordClick(tok.cleanWord, e)}
                      className={`inline-block px-1 py-0.2 mx-0.5 rounded-md transition cursor-pointer hover:bg-amber-500/25 hover:text-amber-400 hover:underline ${
                        tok.isMatch
                          ? "bg-amber-500/30 text-amber-400 dark:text-amber-300 font-bold border-b-2 border-amber-500"
                          : "text-[var(--text-primary)]"
                      }`}
                      title={`Click để tra từ điển: "${tok.cleanWord}"`}
                    >
                      {tok.raw}
                    </span>
                  ) : (
                    <span>{tok.raw}</span>
                  )}
                </React.Fragment>
              ))
            ) : (
              <span className="text-[11px] italic text-[var(--text-secondary)]">
                [Khung tranh hành động / hiệu ứng âm thanh không chứa lời thoại]
              </span>
            )}
          </div>
        </div>

        {/* 4. Vocabulary Tokens Strip if extracted */}
        {panel.vocabulary && panel.vocabulary.length > 0 && (
          <div className="pt-2 border-t border-[var(--border-primary)]/50">
            <div className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Sparkles size={10} className="text-amber-500" />
              <span>Từ vựng trích xuất</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {panel.vocabulary.slice(0, 5).map((v, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => onWordClick(v.lemma || v.term, e)}
                  className="px-1.5 py-0.5 rounded bg-[var(--bg-primary)] hover:bg-amber-500/20 text-[10px] text-[var(--text-secondary)] hover:text-amber-400 border border-[var(--border-primary)] transition cursor-pointer font-mono flex items-center gap-1"
                  title={`Tra từ vựng: ${v.term} (${v.pos_tag})`}
                >
                  <span>{v.term}</span>
                  <span className="text-[8px] opacity-60 uppercase">{v.pos_tag}</span>
                </button>
              ))}
              {panel.vocabulary.length > 5 && (
                <span className="text-[9px] text-[var(--text-secondary)] self-center">
                  +{panel.vocabulary.length - 5}
                </span>
              )}
            </div>
          </div>
        )}

        {/* 5. Footer Quick Navigation Links */}
        <div className="pt-2 border-t border-[var(--border-primary)]/60 flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <button
            type="button"
            onClick={() => onOpenFullPage(panel)}
            className="flex items-center gap-1 hover:text-amber-500 transition cursor-pointer"
          >
            <Layers size={12} />
            <span>Xem trang gốc</span>
          </button>

          <button
            type="button"
            onClick={handleReadFromHere}
            className="flex items-center gap-1 font-semibold text-amber-500 hover:text-amber-400 transition cursor-pointer"
          >
            <span>Đọc từ đây</span>
            <ExternalLink size={11} />
          </button>
        </div>
      </div>
    </div>
  );
};
export default PanelCard;
