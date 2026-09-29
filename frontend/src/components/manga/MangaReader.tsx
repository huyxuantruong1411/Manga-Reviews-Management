import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Maximize,
  Minimize,
  X,
  Layers,
  ArrowRight,
  AlignJustify,
  Columns,
  Square,
  HelpCircle,
  Loader2,
  CheckCircle2
} from "lucide-react";
import client from "../../api/client";
import type { Chapter, PageItem } from "../../types/chapter";

interface MangaReaderProps {
  mangaId: string;
  mangaTitle: string;
  initialChapterId: string;
  initialPageNumber?: number;
  onClose: () => void;
  onChapterChange?: (newChapterId: string) => void;
}

export const MangaReader: React.FC<MangaReaderProps> = ({
  mangaId,
  mangaTitle,
  initialChapterId,
  initialPageNumber = 1,
  onClose,
  onChapterChange
}) => {
  // Chapter & Pages state
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loadingPages, setLoadingPages] = useState(true);
  const [currentPage, setCurrentPage] = useState<number>(initialPageNumber);

  // Reader Settings
  const [readingMode, setReadingMode] = useState<"long_strip" | "single" | "double_rtl" | "double_ltr">(
    () => (localStorage.getItem("manga_reading_mode") as any) || "long_strip"
  );
  const [fitMode, setFitMode] = useState<"width" | "height" | "original">(
    () => (localStorage.getItem("manga_fit_mode") as any) || "width"
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Save settings
  useEffect(() => {
    localStorage.setItem("manga_reading_mode", readingMode);
  }, [readingMode]);

  useEffect(() => {
    localStorage.setItem("manga_fit_mode", fitMode);
  }, [fitMode]);

  // Load all chapters for switching
  useEffect(() => {
    const fetchChapters = async () => {
      try {
        const res = await client.get(`/api/manga/${mangaId}/chapters`);
        setChapters(res.data.chapters || []);
      } catch (err) {
        console.error("Error fetching chapters list:", err);
      }
    };
    fetchChapters();
  }, [mangaId]);

  // Load specific chapter details with presigned URLs
  const loadChapter = async (chapId: string, targetPage: number = 1) => {
    setLoadingPages(true);
    try {
      const res = await client.get(`/api/chapters/${chapId}`);
      setCurrentChapter(res.data);
      const chapterPages = res.data.pages || [];
      setPages(chapterPages);
      setCurrentPage(Math.min(Math.max(1, targetPage), chapterPages.length || 1));

      if (onChapterChange) {
        onChapterChange(chapId);
      }

      // Sync progress to backend
      client.post(`/api/manga/${mangaId}/reading-progress`, {
        chapter_id: chapId,
        chapter_number: res.data.chapter_number,
        page: targetPage,
        reading_mode: readingMode,
        fit_mode: fitMode
      }).catch(() => {});
    } catch (err) {
      console.error("Error loading chapter:", err);
    } finally {
      setLoadingPages(false);
    }
  };

  useEffect(() => {
    if (initialChapterId) {
      loadChapter(initialChapterId, initialPageNumber);
    }
  }, [initialChapterId]);

  // Navigation: Next / Prev Chapter
  const currentChapterIndex = chapters.findIndex((c) => c.id === currentChapter?.id);
  const prevChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1 ? chapters[currentChapterIndex + 1] : null;

  const handlePrevChapter = () => {
    if (prevChapter) {
      loadChapter(prevChapter.id, 1);
    }
  };

  const handleNextChapter = () => {
    if (nextChapter) {
      loadChapter(nextChapter.id, 1);
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error("Failed to enter fullscreen:", err);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch((err) => {
        console.error("Failed to exit fullscreen:", err);
      });
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Long Strip Scroll Observer: detect active page as user scrolls
  useEffect(() => {
    if (readingMode !== "long_strip" || pages.length === 0) return;

    const handleScroll = () => {
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i];
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= window.innerHeight * 0.4 && rect.bottom >= window.innerHeight * 0.1) {
            setCurrentPage(i + 1);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [readingMode, pages]);

  // Jump to specific page
  const jumpToPage = (pageNum: number) => {
    const validNum = Math.min(Math.max(1, pageNum), pages.length);
    setCurrentPage(validNum);

    if (readingMode === "long_strip") {
      const el = pageRefs.current[validNum - 1];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  // Page turns for Single & Double page modes
  const handleTurnNext = useCallback(() => {
    if (readingMode === "single") {
      if (currentPage < pages.length) {
        setCurrentPage((prev) => prev + 1);
      } else if (nextChapter) {
        handleNextChapter();
      }
    } else if (readingMode === "double_rtl" || readingMode === "double_ltr") {
      // Advance by 2
      const step = currentPage === 1 ? 1 : 2; // Keep cover single if page 1
      if (currentPage + step <= pages.length) {
        setCurrentPage((prev) => prev + step);
      } else if (nextChapter) {
        handleNextChapter();
      }
    }
  }, [readingMode, currentPage, pages.length, nextChapter]);

  const handleTurnPrev = useCallback(() => {
    if (readingMode === "single") {
      if (currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      } else if (prevChapter) {
        handlePrevChapter();
      }
    } else if (readingMode === "double_rtl" || readingMode === "double_ltr") {
      const step = 2;
      if (currentPage - step >= 1) {
        setCurrentPage((prev) => prev - step);
      } else {
        setCurrentPage(1);
      }
    }
  }, [readingMode, currentPage, prevChapter]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        if (readingMode === "double_rtl") {
          handleTurnPrev(); // In RTL, right is previous page
        } else {
          handleTurnNext();
        }
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        if (readingMode === "double_rtl") {
          handleTurnNext(); // In RTL, left is next page
        } else {
          handleTurnPrev();
        }
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      } else if (e.key === "m" || e.key === "M") {
        setShowControls((prev) => !prev);
      } else if (e.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readingMode, handleTurnNext, handleTurnPrev, onClose]);

  // Image Fit CSS helper
  const getImageFitClass = () => {
    switch (fitMode) {
      case "width":
        return "w-full h-auto object-contain max-w-4xl mx-auto";
      case "height":
        return "h-[85vh] w-auto max-w-full mx-auto object-contain";
      case "original":
      default:
        return "max-w-none h-auto mx-auto";
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative bg-zinc-950 text-white select-none transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-0 z-50 overflow-y-auto"
          : "rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden my-6"
      }`}
    >
      {/* Top Header / Control Bar */}
      <div
        className={`sticky top-0 z-40 transition-all duration-300 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
          showControls ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        {/* Left: Manga info & Chapter Switcher */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onClose}
            title="Đóng trình đọc"
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X size={18} />
          </button>

          <div>
            <div className="text-[11px] font-semibold text-zinc-400 truncate max-w-[200px] sm:max-w-xs">
              {mangaTitle}
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-black text-sm text-[var(--brand-orange)]">
                Ch. {currentChapter?.chapter_number}
              </span>
              {currentChapter?.title && (
                <span className="text-xs text-zinc-300 truncate max-w-[150px] sm:max-w-[220px]">
                  - {currentChapter.title}
                </span>
              )}
            </div>
          </div>

          {/* Quick Chapter Selector Dropdown */}
          <div className="relative">
            <select
              value={currentChapter?.id || ""}
              onChange={(e) => loadChapter(e.target.value, 1)}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-200 focus:outline-none focus:border-[var(--brand-orange)] cursor-pointer"
            >
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  Ch. {c.chapter_number} {c.title ? `- ${c.title}` : ""} ({c.page_count}p)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Center: Prev/Next Chapter Quick Switchers */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePrevChapter}
            disabled={!prevChapter}
            title={prevChapter ? `Ch. ${prevChapter.chapter_number}` : "Không có chương trước"}
            className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-bold disabled:opacity-40 hover:bg-zinc-800 hover:text-[var(--brand-orange)] transition flex items-center space-x-1"
          >
            <ChevronLeft size={14} />
            <span className="hidden sm:inline">Chương trước</span>
          </button>

          <button
            onClick={handleNextChapter}
            disabled={!nextChapter}
            title={nextChapter ? `Ch. ${nextChapter.chapter_number}` : "Không có chương sau"}
            className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-bold disabled:opacity-40 hover:bg-zinc-800 hover:text-[var(--brand-orange)] transition flex items-center space-x-1"
          >
            <span className="hidden sm:inline">Chương sau</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Right: Layout Modes, Fit, Fullscreen */}
        <div className="flex items-center space-x-2">
          {/* Reading Mode Switcher */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5">
            <button
              onClick={() => setReadingMode("long_strip")}
              title="Cuộn dọc vô tận (Long Strip / Webtoon)"
              className={`p-1.5 rounded-lg text-xs font-bold transition ${
                readingMode === "long_strip"
                  ? "bg-[var(--brand-orange)] text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <AlignJustify size={15} />
            </button>
            <button
              onClick={() => setReadingMode("single")}
              title="Trang đơn (Single Page)"
              className={`p-1.5 rounded-lg text-xs font-bold transition ${
                readingMode === "single"
                  ? "bg-[var(--brand-orange)] text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Square size={15} />
            </button>
            <button
              onClick={() => setReadingMode("double_rtl")}
              title="Trang đôi Manga (Phải sang trái - RTL)"
              className={`p-1.5 rounded-lg text-xs font-bold transition ${
                readingMode === "double_rtl"
                  ? "bg-[var(--brand-orange)] text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Columns size={15} />
            </button>
          </div>

          {/* Fit Mode Switcher */}
          <div className="hidden md:flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5 text-xs font-bold">
            <button
              onClick={() => setFitMode("width")}
              className={`px-2 py-1 rounded-lg transition ${
                fitMode === "width" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Vừa ngang
            </button>
            <button
              onClick={() => setFitMode("height")}
              className={`px-2 py-1 rounded-lg transition ${
                fitMode === "height" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Vừa dọc
            </button>
            <button
              onClick={() => setFitMode("original")}
              className={`px-2 py-1 rounded-lg transition ${
                fitMode === "original" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              100%
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Thoát toàn màn hình (F)" : "Toàn màn hình (F)"}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>

          {/* Shortcuts Help */}
          <button
            onClick={() => setShowShortcutsHelp((prev) => !prev)}
            title="Phím tắt điều hướng"
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <HelpCircle size={16} />
          </button>
        </div>
      </div>

      {/* Shortcuts Helper Modal */}
      {showShortcutsHelp && (
        <div className="absolute top-16 right-4 z-50 bg-zinc-900/95 border border-zinc-700/80 backdrop-blur-md rounded-2xl p-4 shadow-2xl text-xs space-y-2.5 max-w-xs animate-in zoom-in-95">
          <div className="flex items-center justify-between font-bold border-b border-zinc-800 pb-2">
            <span>Phím tắt đọc truyện</span>
            <button onClick={() => setShowShortcutsHelp(false)} className="text-zinc-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1.5 text-zinc-300">
            <div className="flex justify-between">
              <span className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">← / →</span>
              <span>Lật trang trước / sau</span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">F</span>
              <span>Bật / Tắt Toàn màn hình</span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">M</span>
              <span>Ẩn / Hiện thanh điều khiển</span>
            </div>
            <div className="flex justify-between">
              <span className="font-mono bg-zinc-800 px-1.5 py-0.5 rounded">Esc</span>
              <span>Thoát Fullscreen / Đóng reader</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Reading Viewport */}
      <div className="min-h-[600px] flex items-center justify-center p-4">
        {loadingPages ? (
          <div className="py-32 flex flex-col items-center justify-center space-y-3">
            <Loader2 size={36} className="animate-spin text-[var(--brand-orange)]" />
            <p className="text-xs text-zinc-400 font-semibold">Đang tải các trang truyện...</p>
          </div>
        ) : pages.length === 0 ? (
          <div className="py-24 text-center space-y-2">
            <BookOpen size={40} className="mx-auto text-zinc-600" />
            <div className="text-sm font-bold text-zinc-300">Không có trang ảnh nào trong Chapter này</div>
            <p className="text-xs text-zinc-500">Vui lòng chọn chapter khác hoặc kiểm tra lại storage.</p>
          </div>
        ) : readingMode === "long_strip" ? (
          /* LONG STRIP (Webtoon) Mode */
          <div className="w-full flex flex-col items-center space-y-2">
            {pages.map((page, idx) => (
              <div
                key={page.page_number}
                ref={(el) => {
                  pageRefs.current[idx] = el;
                }}
                className="relative w-full flex justify-center"
              >
                {page.url ? (
                  <img
                    src={page.url}
                    alt={`Page ${page.page_number}`}
                    loading="lazy"
                    className={`${getImageFitClass()} shadow-xl rounded-sm`}
                  />
                ) : (
                  <div className="w-96 h-[600px] bg-zinc-900 flex items-center justify-center text-xs text-zinc-600">
                    Trang #{page.page_number} không tải được
                  </div>
                )}
                {/* Subtle page indicator in corner */}
                <span className="absolute bottom-2 right-4 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] font-mono text-zinc-400">
                  {page.page_number} / {pages.length}
                </span>
              </div>
            ))}

            {/* End of Chapter Card */}
            <div className="my-12 p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 text-center max-w-md w-full space-y-4">
              <CheckCircle2 size={36} className="mx-auto text-[var(--brand-orange)]" />
              <div>
                <h4 className="text-base font-black">Bạn đã đọc hết Chapter {currentChapter?.chapter_number}!</h4>
                <p className="text-xs text-zinc-400 mt-1">Tổng số trang: {pages.length}</p>
              </div>

              {nextChapter ? (
                <button
                  onClick={handleNextChapter}
                  className="w-full py-3 rounded-2xl bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] font-bold text-sm text-white shadow-lg transition flex items-center justify-center space-x-2"
                >
                  <span>Đọc tiếp Chapter {nextChapter.chapter_number}</span>
                  <ArrowRight size={16} />
                </button>
              ) : (
                <div className="text-xs text-zinc-400 font-semibold p-3 rounded-xl bg-zinc-800/50">
                  Đây là chapter mới nhất hiện có trong hệ thống!
                </div>
              )}
            </div>
          </div>
        ) : readingMode === "single" ? (
          /* SINGLE PAGE Mode */
          <div className="relative w-full flex items-center justify-center">
            {/* Clickable Left Zone for Turning Page */}
            <div
              onClick={handleTurnPrev}
              title="Trang trước (←)"
              className="absolute left-0 top-0 bottom-0 w-1/4 cursor-w-resize z-20 hover:bg-white/[0.02] transition"
            />

            {/* Centered Image */}
            <div className="relative z-10">
              {pages[currentPage - 1]?.url ? (
                <img
                  src={pages[currentPage - 1].url!}
                  alt={`Page ${currentPage}`}
                  className={`${getImageFitClass()} shadow-2xl rounded-sm`}
                />
              ) : (
                <div className="w-96 h-[650px] bg-zinc-900 flex items-center justify-center text-zinc-500">
                  Trang #{currentPage}
                </div>
              )}
            </div>

            {/* Clickable Right Zone for Turning Page */}
            <div
              onClick={handleTurnNext}
              title="Trang sau (→)"
              className="absolute right-0 top-0 bottom-0 w-1/4 cursor-e-resize z-20 hover:bg-white/[0.02] transition"
            />
          </div>
        ) : (
          /* DOUBLE PAGE SPREAD Mode (RTL or LTR) */
          <div className="relative w-full flex items-center justify-center">
            {/* Clickable Zones */}
            <div
              onClick={readingMode === "double_rtl" ? handleTurnNext : handleTurnPrev}
              className="absolute left-0 top-0 bottom-0 w-1/4 cursor-pointer z-20 hover:bg-white/[0.02] transition"
            />
            <div
              onClick={readingMode === "double_rtl" ? handleTurnPrev : handleTurnNext}
              className="absolute right-0 top-0 bottom-0 w-1/4 cursor-pointer z-20 hover:bg-white/[0.02] transition"
            />

            {/* Two Pages side by side */}
            <div className="flex items-center justify-center max-w-full z-10 gap-1">
              {/* Cover page is rendered single if page 1 */}
              {currentPage === 1 ? (
                <div>
                  {pages[0]?.url && (
                    <img
                      src={pages[0].url}
                      alt="Cover"
                      className="h-[82vh] w-auto object-contain shadow-2xl rounded-sm"
                    />
                  )}
                </div>
              ) : (
                <>
                  {/* Left Page */}
                  {readingMode === "double_rtl" ? (
                    // In RTL: Left page is the higher page number (e.g. Page 3)
                    pages[currentPage] && (
                      <img
                        src={pages[currentPage].url || ""}
                        alt={`Page ${currentPage + 1}`}
                        className="h-[82vh] w-auto object-contain shadow-2xl rounded-l-sm"
                      />
                    )
                  ) : (
                    // In LTR: Left page is the current page (e.g. Page 2)
                    pages[currentPage - 1] && (
                      <img
                        src={pages[currentPage - 1].url || ""}
                        alt={`Page ${currentPage}`}
                        className="h-[82vh] w-auto object-contain shadow-2xl rounded-l-sm"
                      />
                    )
                  )}

                  {/* Right Page */}
                  {readingMode === "double_rtl" ? (
                    // In RTL: Right page is the current page (e.g. Page 2)
                    pages[currentPage - 1] && (
                      <img
                        src={pages[currentPage - 1].url || ""}
                        alt={`Page ${currentPage}`}
                        className="h-[82vh] w-auto object-contain shadow-2xl rounded-r-sm"
                      />
                    )
                  ) : (
                    // In LTR: Right page is the higher page number
                    pages[currentPage] && (
                      <img
                        src={pages[currentPage].url || ""}
                        alt={`Page ${currentPage + 1}`}
                        className="h-[82vh] w-auto object-contain shadow-2xl rounded-r-sm"
                      />
                    )
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Floating Navigation Bar */}
      <div
        className={`sticky bottom-0 z-40 transition-all duration-300 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 ${
          showControls ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        {/* Left: Previous page button */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleTurnPrev}
            disabled={currentPage <= 1 && !prevChapter}
            className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-bold disabled:opacity-40 hover:bg-zinc-800 transition flex items-center space-x-1"
          >
            <ChevronLeft size={15} />
            <span>Trang trước</span>
          </button>
        </div>

        {/* Center: Page Slider & Dropdown */}
        <div className="flex items-center space-x-3 flex-1 max-w-md mx-auto justify-center">
          <span className="text-xs font-mono font-bold text-zinc-300 whitespace-nowrap">
            {currentPage} / {pages.length}
          </span>

          <input
            type="range"
            min={1}
            max={pages.length || 1}
            value={currentPage}
            onChange={(e) => jumpToPage(Number(e.target.value))}
            className="w-full accent-[var(--brand-orange)] cursor-pointer"
          />

          <button
            onClick={() => setShowThumbnails((prev) => !prev)}
            title="Mở thanh xem trước trang (Thumbnail strip)"
            className={`p-1.5 rounded-xl border transition ${
              showThumbnails
                ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            <Layers size={15} />
          </button>
        </div>

        {/* Right: Next page button */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleTurnNext}
            disabled={currentPage >= pages.length && !nextChapter}
            className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-bold disabled:opacity-40 hover:bg-zinc-800 transition flex items-center space-x-1"
          >
            <span>Trang sau</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Bottom Thumbnail Strip Drawer */}
      {showThumbnails && pages.length > 0 && (
        <div className="sticky bottom-[53px] z-30 bg-zinc-900/95 border-t border-zinc-800 p-3 overflow-x-auto flex space-x-3 backdrop-blur-md animate-in slide-in-from-bottom-4">
          {pages.map((p) => {
            const isCurrent = p.page_number === currentPage;
            return (
              <div
                key={p.page_number}
                onClick={() => jumpToPage(p.page_number)}
                className={`flex-shrink-0 cursor-pointer rounded-lg overflow-hidden border transition ${
                  isCurrent
                    ? "border-[var(--brand-orange)] ring-2 ring-[var(--brand-orange)] scale-105"
                    : "border-zinc-800 opacity-60 hover:opacity-100"
                }`}
              >
                <div className="w-16 h-24 bg-zinc-950 relative">
                  {p.url && <img src={p.url} alt={`Thumb ${p.page_number}`} className="w-full h-full object-cover" />}
                  <span className="absolute bottom-1 right-1 px-1 rounded bg-black/80 text-[9px] font-mono font-bold text-white">
                    {p.page_number}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MangaReader;
