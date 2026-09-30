import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  X,
  Settings,
  Loader2,
  BookOpen,
  Check,
} from "lucide-react";
import client from "../api/client";
import type { Chapter, PageItem } from "../types/chapter";

export const MangaReaderPage: React.FC = () => {
  const { id: mangaId, chapterId } = useParams<{ id: string; chapterId: string }>();
  const [searchParams] = useSearchParams();
  const initialPageParam = parseInt(searchParams.get("page") || "1", 10) || 1;
  const navigate = useNavigate();

  // Manga & Chapter states
  const [manga, setManga] = useState<any>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loadingChapter, setLoadingChapter] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(initialPageParam);

  // Reader Settings
  const [readingMode, setReadingMode] = useState<"long_strip" | "single" | "double_rtl" | "double_ltr">(
    () => (localStorage.getItem("manga_reading_mode") as any) || "long_strip"
  );
  const [fitMode, setFitMode] = useState<"width" | "height" | "original">(
    () => (localStorage.getItem("manga_fit_mode") as any) || "width"
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem("manga_reading_mode", readingMode);
  }, [readingMode]);

  useEffect(() => {
    localStorage.setItem("manga_fit_mode", fitMode);
  }, [fitMode]);

  // Load Manga Info
  useEffect(() => {
    if (!mangaId) return;
    client.get(`/api/manga/${mangaId}`)
      .then((res) => setManga(res.data))
      .catch((err) => console.error("Error fetching manga:", err));
  }, [mangaId]);

  // Load All Chapters of Manga
  useEffect(() => {
    if (!mangaId) return;
    client.get(`/api/manga/${mangaId}/chapters`)
      .then((res) => {
        const sorted = (res.data.chapters || []).sort((a: Chapter, b: Chapter) => a.chapter_numeric - b.chapter_numeric);
        setChapters(sorted);
      })
      .catch((err) => console.error("Error loading chapter list:", err));
  }, [mangaId]);

  // Load Chapter Pages
  const loadChapter = useCallback(async (targetChapterId: string, targetPage: number = 1) => {
    if (!targetChapterId) return;
    setLoadingChapter(true);
    try {
      const res = await client.get(`/api/chapters/${targetChapterId}`);
      setCurrentChapter(res.data);
      const chapterPages = res.data.pages || [];
      setPages(chapterPages);
      setCurrentPage(Math.min(Math.max(1, targetPage), chapterPages.length || 1));

      // Scroll top
      window.scrollTo({ top: 0, behavior: "instant" as any });

      // Sync progress to backend
      if (mangaId) {
        client.post(`/api/manga/${mangaId}/reading-progress`, {
          chapter_id: targetChapterId,
          chapter_number: res.data.chapter_number,
          page: targetPage,
          reading_mode: readingMode,
          fit_mode: fitMode
        }).catch(() => {});
      }
    } catch (err) {
      console.error("Error loading chapter:", err);
    } finally {
      setLoadingChapter(false);
    }
  }, [mangaId, readingMode, fitMode]);

  useEffect(() => {
    if (chapterId) {
      loadChapter(chapterId, initialPageParam);
    }
  }, [chapterId, initialPageParam, loadChapter]);

  // Exit back to Manga Detail Page at chapters tab
  const handleExit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    navigate(`/manga/${mangaId}?tab=chapters`);
  };

  // Chapter Navigation
  const currentChapterIndex = chapters.findIndex((c) => c.id === currentChapter?.id);
  const prevChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1 ? chapters[currentChapterIndex + 1] : null;

  const goToChapter = (targetChapId: string, pageNum: number = 1) => {
    navigate(`/manga/${mangaId}/read/${targetChapId}?page=${pageNum}`);
  };

  // Long Strip Scroll Observer
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

  // Turn page for Single & Double modes
  const handleTurnNext = useCallback(() => {
    if (readingMode === "single") {
      if (currentPage < pages.length) {
        setCurrentPage((prev) => prev + 1);
      } else if (nextChapter) {
        goToChapter(nextChapter.id, 1);
      }
    } else if (readingMode === "double_rtl" || readingMode === "double_ltr") {
      const step = currentPage === 1 ? 1 : 2;
      if (currentPage + step <= pages.length) {
        setCurrentPage((prev) => prev + step);
      } else if (nextChapter) {
        goToChapter(nextChapter.id, 1);
      }
    }
  }, [readingMode, currentPage, pages.length, nextChapter]);

  const handleTurnPrev = useCallback(() => {
    if (readingMode === "single") {
      if (currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      } else if (prevChapter) {
        goToChapter(prevChapter.id, 1);
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

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        if (readingMode === "double_rtl") {
          handleTurnPrev();
        } else {
          handleTurnNext();
        }
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        if (readingMode === "double_rtl") {
          handleTurnNext();
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
        } else if (showSidebar) {
          setShowSidebar(false);
        } else {
          handleExit();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readingMode, handleTurnNext, handleTurnPrev, showSidebar]);

  // Image Fit Class
  const getImageFitClass = () => {
    switch (fitMode) {
      case "width":
        return "w-full max-w-4xl h-auto mx-auto object-contain";
      case "height":
        return "h-[90vh] w-auto max-w-full mx-auto object-contain";
      case "original":
      default:
        return "max-w-none h-auto mx-auto";
    }
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-zinc-950 text-white select-none relative flex flex-col font-sans"
    >
      {/* Top Floating / Sticky Header Bar */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between gap-3 ${
          showControls ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        {/* Left: Back & Manga Title */}
        <div className="flex items-center space-x-3 min-w-0">
          <button
            onClick={handleExit}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-bold transition cursor-pointer shrink-0"
            title="Quay lại trang chi tiết manga (Esc)"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Quay lại Manga</span>
          </button>

          <div className="min-w-0">
            <h1
              onClick={handleExit}
              className="text-xs sm:text-sm font-bold text-zinc-200 hover:text-[var(--brand-orange)] truncate cursor-pointer transition"
              title={manga?.title || "Manga"}
            >
              {manga?.title || "Đang tải..."}
            </h1>
            {currentChapter && (
              <p className="text-[11px] text-[var(--brand-orange)] font-semibold truncate">
                Ch. {currentChapter.chapter_number} {currentChapter.title ? `- ${currentChapter.title}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* Center: Chapter & Page Selectors */}
        <div className="hidden md:flex items-center space-x-2">
          {/* Prev Chapter */}
          <button
            onClick={() => prevChapter && goToChapter(prevChapter.id, 1)}
            disabled={!prevChapter}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            title="Chương trước"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Chapter Selector Dropdown */}
          <select
            value={currentChapter?.id || ""}
            onChange={(e) => goToChapter(e.target.value, 1)}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-200 focus:outline-none focus:border-[var(--brand-orange)] cursor-pointer max-w-[200px] truncate"
          >
            {chapters.map((chap) => (
              <option key={chap.id} value={chap.id} className="bg-zinc-900 text-white">
                Ch. {chap.chapter_number} {chap.title ? `- ${chap.title}` : ""} ({chap.page_count} trang)
              </option>
            ))}
          </select>

          {/* Next Chapter */}
          <button
            onClick={() => nextChapter && goToChapter(nextChapter.id, 1)}
            disabled={!nextChapter}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            title="Chương tiếp theo"
          >
            <ChevronRight size={16} />
          </button>

          {/* Page Selector Dropdown */}
          {pages.length > 0 && (
            <select
              value={currentPage}
              onChange={(e) => jumpToPage(Number(e.target.value))}
              className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-[var(--brand-orange)] focus:outline-none focus:border-[var(--brand-orange)] cursor-pointer"
            >
              {pages.map((p) => (
                <option key={p.page_number} value={p.page_number} className="bg-zinc-900 text-white">
                  Trang {p.page_number} / {pages.length}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Right: Mode & Config Toggles */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Quick Reading Mode toggle */}
          <div className="hidden lg:flex items-center bg-zinc-900/90 border border-zinc-800 rounded-xl p-0.5 text-xs font-bold">
            <button
              onClick={() => setReadingMode("long_strip")}
              className={`px-2.5 py-1 rounded-lg transition ${
                readingMode === "long_strip"
                  ? "bg-[var(--brand-orange)] text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
              title="Cuộn dọc (Long Strip / Webtoon)"
            >
              Cuộn dọc
            </button>
            <button
              onClick={() => setReadingMode("single")}
              className={`px-2.5 py-1 rounded-lg transition ${
                readingMode === "single"
                  ? "bg-[var(--brand-orange)] text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
              title="1 Trang (Single Page)"
            >
              1 Trang
            </button>
            <button
              onClick={() => setReadingMode("double_rtl")}
              className={`px-2.5 py-1 rounded-lg transition ${
                readingMode === "double_rtl"
                  ? "bg-[var(--brand-orange)] text-white shadow"
                  : "text-zinc-400 hover:text-white"
              }`}
              title="2 Trang RTL (Manga Nhật)"
            >
              2 Trang
            </button>
          </div>

          {/* Quick Fit Mode Toggle */}
          <div className="hidden xl:flex items-center bg-zinc-900/90 border border-zinc-800 rounded-xl p-0.5 text-xs font-bold">
            <button
              onClick={() => setFitMode("width")}
              className={`px-2 py-1 rounded-lg transition ${
                fitMode === "width" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              }`}
              title="Vừa chiều ngang"
            >
              Vừa ngang
            </button>
            <button
              onClick={() => setFitMode("height")}
              className={`px-2 py-1 rounded-lg transition ${
                fitMode === "height" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              }`}
              title="Vừa chiều dọc"
            >
              Vừa dọc
            </button>
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer"
            title="Toàn màn hình (F)"
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>

          {/* Sidebar Settings Drawer Toggle (MangaDex style) */}
          <button
            onClick={() => setShowSidebar((prev) => !prev)}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              showSidebar
                ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white"
            }`}
            title="Cài đặt đọc truyện (MangaDex Reader Settings)"
          >
            <Settings size={16} />
          </button>

          {/* Exit / Close */}
          <button
            onClick={handleExit}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-rose-500/20 hover:text-rose-400 border border-zinc-800 text-zinc-400 transition cursor-pointer"
            title="Đóng trình đọc"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Main Canvas Area */}
      <main className="flex-1 flex flex-col justify-center items-center pt-14 pb-12 w-full">
        {loadingChapter ? (
          <div className="py-32 flex flex-col items-center justify-center space-y-3">
            <Loader2 size={36} className="animate-spin text-[var(--brand-orange)]" />
            <p className="text-xs text-zinc-400 font-semibold tracking-wide uppercase">Đang nạp các trang truyện...</p>
          </div>
        ) : pages.length === 0 ? (
          <div className="py-32 text-center space-y-3">
            <BookOpen size={48} className="mx-auto text-zinc-600" />
            <p className="text-sm font-bold text-zinc-300">Không tìm thấy trang truyện nào trong chapter này.</p>
            <button
              onClick={handleExit}
              className="px-4 py-2 bg-[var(--brand-orange)] text-white rounded-xl text-xs font-bold"
            >
              Quay lại danh sách chương
            </button>
          </div>
        ) : (
          <div className="w-full">
            {/* Mode 1: Long Strip (Vertical Webtoon Scroll) */}
            {readingMode === "long_strip" && (
              <div className="flex flex-col items-center space-y-2 py-4 w-full">
                {pages.map((page, idx) => (
                  <div
                    key={page.page_number}
                    ref={(el) => {
                      pageRefs.current[idx] = el;
                    }}
                    className="relative w-full flex justify-center"
                  >
                    <img
                      src={page.url || ""}
                      alt={`Page ${page.page_number}`}
                      loading={idx < 3 ? "eager" : "lazy"}
                      className={`${getImageFitClass()} shadow-2xl transition duration-200 select-none`}
                    />
                    <span className="absolute bottom-2 right-4 px-2 py-0.5 rounded-md bg-black/60 text-zinc-300 text-[10px] font-mono pointer-events-none">
                      {page.page_number}
                    </span>
                  </div>
                ))}

                {/* Chapter Complete Card in Long Strip */}
                <div className="py-12 text-center space-y-4 max-w-md mx-auto p-6 bg-zinc-900/60 border border-zinc-800 rounded-3xl mt-8">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                    <Check size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Đã đọc hết Chapter {currentChapter?.chapter_number}!</h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      {nextChapter ? `Chương tiếp theo: Ch. ${nextChapter.chapter_number}` : "Bạn đã đọc đến chương mới nhất."}
                    </p>
                  </div>
                  <div className="flex items-center justify-center space-x-3 pt-2">
                    <button
                      onClick={handleExit}
                      className="px-4 py-2 rounded-xl border border-zinc-700 hover:bg-zinc-800 text-xs font-bold text-zinc-300"
                    >
                      Danh sách chương
                    </button>
                    {nextChapter && (
                      <button
                        onClick={() => goToChapter(nextChapter.id, 1)}
                        className="px-5 py-2 rounded-xl bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold shadow-lg"
                      >
                        Đọc Ch. {nextChapter.chapter_number} →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Mode 2: Single Page */}
            {readingMode === "single" && (
              <div className="relative min-h-[85vh] flex items-center justify-center px-4 w-full">
                {/* Left Click Area */}
                <div
                  onClick={handleTurnPrev}
                  className="absolute left-0 inset-y-0 w-1/3 cursor-w-resize z-20 hover:bg-white/[0.02] transition"
                  title="Trang trước (← / A)"
                />

                {/* Right Click Area */}
                <div
                  onClick={handleTurnNext}
                  className="absolute right-0 inset-y-0 w-1/3 cursor-e-resize z-20 hover:bg-white/[0.02] transition"
                  title="Trang tiếp (→ / D)"
                />

                {/* Page View */}
                {pages[currentPage - 1] && (
                  <div className="relative z-10 flex flex-col items-center">
                    <img
                      src={pages[currentPage - 1]?.url || ""}
                      alt={`Page ${currentPage}`}
                      className={`${getImageFitClass()} shadow-2xl rounded-sm`}
                    />
                    <div className="mt-3 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400">
                      Trang {currentPage} / {pages.length}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mode 3: Double Page (RTL Manga or LTR) */}
            {(readingMode === "double_rtl" || readingMode === "double_ltr") && (
              <div className="relative min-h-[85vh] flex items-center justify-center px-4 w-full">
                {/* Left Click Area */}
                <div
                  onClick={readingMode === "double_rtl" ? handleTurnNext : handleTurnPrev}
                  className="absolute left-0 inset-y-0 w-1/3 cursor-pointer z-20 hover:bg-white/[0.02] transition"
                />

                {/* Right Click Area */}
                <div
                  onClick={readingMode === "double_rtl" ? handleTurnPrev : handleTurnNext}
                  className="absolute right-0 inset-y-0 w-1/3 cursor-pointer z-20 hover:bg-white/[0.02] transition"
                />

                {/* Double Pages View */}
                <div className="relative z-10 flex items-center justify-center gap-1 max-w-full">
                  {(() => {
                    if (currentPage === 1) {
                      // Cover is single page
                      return (
                        <div className="flex flex-col items-center">
                          <img
                            src={pages[0]?.url || ""}
                            alt="Cover"
                            className={`${getImageFitClass()} shadow-2xl`}
                          />
                          <div className="mt-3 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400">
                            Trang 1 (Bìa)
                          </div>
                        </div>
                      );
                    }

                    const pageAIndex = currentPage - 1;
                    const pageBIndex = currentPage;
                    const pageA = pages[pageAIndex];
                    const pageB = pages[pageBIndex];

                    const firstPage = readingMode === "double_rtl" ? pageB : pageA;
                    const secondPage = readingMode === "double_rtl" ? pageA : pageB;

                    return (
                      <div className="flex flex-col items-center">
                        <div className="flex items-center justify-center gap-1">
                          {firstPage && (
                            <img
                              src={firstPage.url || ""}
                              alt={`Page ${firstPage.page_number}`}
                              className="h-[85vh] w-auto max-w-[48vw] object-contain shadow-2xl"
                            />
                          )}
                          {secondPage && (
                            <img
                              src={secondPage.url || ""}
                              alt={`Page ${secondPage.page_number}`}
                              className="h-[85vh] w-auto max-w-[48vw] object-contain shadow-2xl"
                            />
                          )}
                        </div>
                        <div className="mt-3 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400">
                          Trang {currentPage} - {Math.min(currentPage + 1, pages.length)} / {pages.length}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MangaDex-style Floating Drawer / Sidebar */}
      {showSidebar && (
        <aside className="fixed top-0 right-0 bottom-0 z-50 w-80 bg-zinc-950/95 backdrop-blur-xl border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm font-bold text-white">
              <Settings size={16} className="text-[var(--brand-orange)]" />
              <span>Reader Settings</span>
            </div>
            <button
              onClick={() => setShowSidebar(false)}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <X size={18} />
            </button>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6 text-xs text-zinc-300">
            {/* Manga Info */}
            <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl space-y-1">
              <div className="text-[10px] uppercase font-bold text-zinc-500">Manga</div>
              <div className="font-bold text-white text-sm line-clamp-1">{manga?.title}</div>
              <div className="text-[11px] text-[var(--brand-orange)] font-semibold">
                Ch. {currentChapter?.chapter_number} {currentChapter?.title ? `- ${currentChapter.title}` : ""}
              </div>
            </div>

            {/* Reading Mode */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Chế độ hiển thị (Reading Mode)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setReadingMode("long_strip")}
                  className={`p-2.5 rounded-xl border font-bold text-left transition ${
                    readingMode === "long_strip"
                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  <div>Cuộn dọc</div>
                  <span className="text-[9px] font-normal opacity-80">Webtoon Strip</span>
                </button>
                <button
                  onClick={() => setReadingMode("single")}
                  className={`p-2.5 rounded-xl border font-bold text-left transition ${
                    readingMode === "single"
                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  <div>1 Trang</div>
                  <span className="text-[9px] font-normal opacity-80">Single Page</span>
                </button>
                <button
                  onClick={() => setReadingMode("double_rtl")}
                  className={`p-2.5 rounded-xl border font-bold text-left transition ${
                    readingMode === "double_rtl"
                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  <div>2 Trang RTL</div>
                  <span className="text-[9px] font-normal opacity-80">Manga Nhật Bản</span>
                </button>
                <button
                  onClick={() => setReadingMode("double_ltr")}
                  className={`p-2.5 rounded-xl border font-bold text-left transition ${
                    readingMode === "double_ltr"
                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  <div>2 Trang LTR</div>
                  <span className="text-[9px] font-normal opacity-80">Trái qua phải</span>
                </button>
              </div>
            </div>

            {/* Fit Mode */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Kích thước ảnh (Fit Mode)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setFitMode("width")}
                  className={`p-2 rounded-xl border font-bold text-center transition ${
                    fitMode === "width"
                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  Vừa ngang
                </button>
                <button
                  onClick={() => setFitMode("height")}
                  className={`p-2 rounded-xl border font-bold text-center transition ${
                    fitMode === "height"
                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  Vừa dọc
                </button>
                <button
                  onClick={() => setFitMode("original")}
                  className={`p-2 rounded-xl border font-bold text-center transition ${
                    fitMode === "original"
                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  Gốc 100%
                </button>
              </div>
            </div>

            {/* Chapter Jump List */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Danh sách chương ({chapters.length})
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1 bg-zinc-900/60 p-2 rounded-xl border border-zinc-800">
                {chapters.map((chap) => {
                  const isCurrent = chap.id === currentChapter?.id;
                  return (
                    <button
                      key={chap.id}
                      onClick={() => {
                        goToChapter(chap.id, 1);
                        setShowSidebar(false);
                      }}
                      className={`w-full p-2 rounded-lg text-left text-xs font-semibold flex items-center justify-between transition ${
                        isCurrent
                          ? "bg-[var(--brand-orange)] text-white"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      }`}
                    >
                      <span className="truncate">Ch. {chap.chapter_number} {chap.title ? `- ${chap.title}` : ""}</span>
                      <span className="text-[10px] opacity-70 shrink-0 ml-2">{chap.page_count}p</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Shortcuts Help */}
            <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">Phím tắt bàn phím</span>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] text-zinc-400">
                <div><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">←</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">A</kbd> Trang trước</div>
                <div><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">→</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">D</kbd> Trang sau</div>
                <div><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">F</kbd> Toàn màn hình</div>
                <div><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">M</kbd> Ẩn/Hiện thanh bar</div>
                <div><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">Esc</kbd> Quay lại</div>
              </div>
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-zinc-800">
            <button
              onClick={handleExit}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition"
            >
              <ArrowLeft size={14} />
              <span>Về trang Manga</span>
            </button>
          </div>
        </aside>
      )}

      {/* Floating Bottom Page Indicator in Single/Double mode */}
      {readingMode !== "long_strip" && pages.length > 0 && showControls && (
        <div className="fixed bottom-4 inset-x-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800/80 px-4 py-2 rounded-full shadow-2xl flex items-center space-x-4 pointer-events-auto">
            <button
              onClick={readingMode === "double_rtl" ? handleTurnNext : handleTurnPrev}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition"
              title="Trang trước"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs font-mono font-bold text-zinc-200">
              {currentPage} / {pages.length}
            </span>
            <button
              onClick={readingMode === "double_rtl" ? handleTurnPrev : handleTurnNext}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition"
              title="Trang sau"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MangaReaderPage;
