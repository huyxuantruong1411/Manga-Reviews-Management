import React, { useMemo } from "react";
import { Maximize2, BookOpen } from "lucide-react";
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

  return (
    <div className="group flex flex-col overflow-hidden text-left bg-[var(--bg-primary)]/80 hover:bg-[var(--bg-primary)] border border-[var(--border-primary)] hover:border-amber-500/50 rounded-2xl shadow-xs hover:shadow-lg transition-all duration-300">
      {/* Panel Image Container with Crop */}
      <div className="relative w-full aspect-[4/3] bg-black/60 overflow-hidden flex items-center justify-center border-b border-[var(--border-primary)]/60">
        <img
          src={cropUrl}
          alt={panel.manga_title}
          loading="lazy"
          className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
        />

        {/* Hover Overlay Action */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3 backdrop-blur-[2px]">
          <button
            type="button"
            onClick={() => onOpenFullPage(panel)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs shadow-lg shadow-amber-500/30 transform -translate-y-1 group-hover:translate-y-0 transition cursor-pointer"
          >
            <Maximize2 size={14} />
            <span>Xem toàn trang</span>
          </button>
        </div>

        {/* Chapter Badge Top Left */}
        <div className="absolute top-2 left-2 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 text-[11px] font-bold text-zinc-200 shadow-xs">
          Ch. {panel.chapter_number}
          {panel.volume && (
            <span className="ml-1 text-[10px] text-amber-400 font-semibold">
              (Vol. {panel.volume})
            </span>
          )}
        </div>

        {/* Panel Index Badge Top Right */}
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-amber-500/20 backdrop-blur-md border border-amber-500/40 text-[10px] font-black text-amber-400 shadow-xs">
          Panel {panel.panel_index + 1}
        </div>
      </div>

      {/* Dialogue Transcript Body */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
            <BookOpen size={12} />
            <span>Hội thoại ngữ cảnh</span>
          </div>

          <div className="text-xs leading-relaxed text-[var(--text-primary)] break-words font-medium select-text">
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
              <span className="text-[11px] italic text-zinc-400">
                [Khung tranh hành động / hiệu ứng âm thanh không có lời thoại]
              </span>
            )}
          </div>
        </div>

        {/* Metadata Footer Strip */}
        <div className="pt-2.5 border-t border-[var(--border-primary)]/60 flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <div className="truncate max-w-[70%] font-semibold" title={panel.manga_title}>
            {panel.manga_title}
          </div>
          <div className="font-mono text-[10px] text-zinc-400 shrink-0">
            Trang {panel.page_number}
          </div>
        </div>
      </div>
    </div>
  );
};
