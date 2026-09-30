import { apiUrl } from "../../api/client";
import React, { useState, useEffect, useRef } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, BookOpen } from "lucide-react";
import type { PanelResult } from "../../types/panel";

interface FullPageModalProps {
  panel: PanelResult | null;
  onClose: () => void;
}

export const FullPageModal: React.FC<FullPageModalProps> = ({
  panel,
  onClose,
}) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageError, setImageError] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [panel]);

  const zoomIn = () => {
    if (zoomLevel < 2.5) setZoomLevel((prev) => Math.min(2.5, prev + 0.25));
  };

  const zoomOut = () => {
    if (zoomLevel > 0.6) setZoomLevel((prev) => Math.max(0.6, prev - 0.25));
  };

  const resetZoom = () => {
    setZoomLevel(1);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!panel) return null;

  const rawPageUrl = apiUrl(`/api/panels/${panel.panel_id}/page-image`);
  const [x1, y1, x2, y2] = panel.coords;

  const frameStyle: React.CSSProperties = {
    position: "absolute",
    left: `${x1 * 100}%`,
    top: `${y1 * 100}%`,
    width: `${(x2 - x1) * 100}%`,
    height: `${(y2 - y1) * 100}%`,
    pointerEvents: "none",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Modal Container */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Xem toàn trang truyện"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
          const visible = Array.from(buttons || []).filter(button => button.offsetParent !== null);
          const first = visible[0], last = visible[visible.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}
        className="relative w-full max-w-5xl h-[92vh] flex flex-col bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/10 bg-zinc-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                {panel.manga_title}
              </h2>
              <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono flex-wrap">
                <span>Ch. {panel.chapter_number}</span>
                <span>•</span>
                <span>Trang {panel.page_number}</span>
                <span>•</span>
                <span className="text-amber-400 font-bold">
                  Panel {panel.panel_index + 1} Highlighted
                </span>
              </div>
            </div>
          </div>

          {/* Zoom Controls & Close */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 mr-2">
              <button
                type="button"
                onClick={zoomOut}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Thu nhỏ"
              >
                <ZoomOut size={16} />
              </button>
              <span className="text-xs font-mono text-zinc-300 px-2 min-w-[40px] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={zoomIn}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Phóng to"
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                onClick={resetZoom}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Đặt lại zoom (100%)"
              >
                <RotateCcw size={14} />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Đóng (Esc)"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Viewport with Golden Focus Frame */}
        <div className="relative flex-1 overflow-auto bg-black/70 p-4">
          <div
            className="relative mx-auto"
            style={{
              width: `${zoomLevel * 100}%`,
            }}
          >
            {/* Full Manga Page */}
            <img
              src={rawPageUrl}
              alt={panel.manga_title}
              onError={() => setImageError(true)}
              className="w-full h-auto block rounded-lg shadow-2xl"
            />
            {imageError && <p role="alert" className="p-6 text-red-300">Không tải được ảnh gốc. Trang có thể đã bị xóa hoặc kho ảnh chưa kết nối.</p>}

            {/* Golden Focus Bounding Box around Panel */}
            {!imageError && <div
              style={frameStyle}
              className="border-3 border-amber-400 ring-4 ring-amber-400/40 shadow-[0_0_25px_rgba(251,191,36,0.7)] rounded animate-pulse"
            >
              {/* Badge on Top of Focus Frame */}
              <div className="absolute -top-7 left-0 px-2 py-0.5 rounded bg-amber-500 text-zinc-950 font-black text-[10px] uppercase tracking-wider shadow-md whitespace-nowrap">
                Panel {panel.panel_index + 1}
              </div>
            </div>}
          </div>
        </div>

        {/* Dialogue Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-zinc-900/90 flex items-center justify-between">
          <div className="text-xs text-zinc-300 truncate max-w-[85%] font-medium">
            <span className="text-amber-400 font-bold mr-2">Hội thoại Panel:</span>
            <span>"{panel.raw_text || panel.cleaned_text || "[Không có text hội thoại]"}"</span>
          </div>
          <div className="text-[11px] text-zinc-500 font-mono hidden sm:inline">
            Nhấn ESC để đóng
          </div>
        </div>
      </div>
    </div>
  );
};
