import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Settings2,
  Sliders,
  AlertCircle,
  X,
  Pin,
  PinOff,
  RotateCcw,
} from "lucide-react";
import { api, ChapterPagesData, UserProfile } from "@/api/client";
import { ModalMotion, MOTION_EASE } from "@/components/MotionPrimitives";
import { useToast } from "@/components/ToastProvider";

interface ReaderPageProps {
  currentUser: UserProfile | null;
}

type BackgroundTheme = "dark" | "black" | "light" | "sepia";

export const ReaderPage: React.FC<ReaderPageProps> = ({ currentUser }) => {
  const { chapterId } = useParams<{ chapterId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const requestedPageRef = useRef<number>(Math.max(1, Number(searchParams.get("page")) || 1));

  useEffect(() => {
    requestedPageRef.current = Math.max(1, Number(searchParams.get("page")) || 1);
  }, [chapterId, searchParams]);

  const [data, setData] = useState<ChapterPagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reader settings
  const [readingMode, setReadingMode] = useState<"vertical_scroll" | "single_page" | "double_page">(
    "vertical_scroll"
  );
  const [fitMode, setFitMode] = useState<"fit_width" | "fit_height" | "original">("fit_width");
  const [readingDirection, setReadingDirection] = useState<"ltr" | "rtl">("ltr");
  const [backgroundColor, setBackgroundColor] = useState<BackgroundTheme>("black");
  const [showSettings, setShowSettings] = useState(false);

  // HUD visibility + active page
  const [showHud, setShowHud] = useState(true);
  const [pinHud, setPinHud] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [scrollCurrentPage, setScrollCurrentPage] = useState(1);

  // Progress & Anti-F5 tracking
  const startTimeRef = useRef(Date.now());
  const maxPageTurnedRef = useRef(1);
  const lastSyncedPageRef = useRef(0);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const hideHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHudAutoHide = useCallback(() => {
    if (hideHudTimerRef.current) clearTimeout(hideHudTimerRef.current);
    if (pinHud || showSettings) return;
    hideHudTimerRef.current = setTimeout(() => {
      setShowHud(false);
    }, 3200);
  }, [pinHud, showSettings]);

  const revealHud = useCallback(() => {
    setShowHud(true);
    scheduleHudAutoHide();
  }, [scheduleHudAutoHide]);

  const fetchChapter = useCallback(async () => {
    if (!chapterId) return;
    setLoading(true);
    setError(null);
    startTimeRef.current = Date.now();
    maxPageTurnedRef.current = 1;
    lastSyncedPageRef.current = 0;
    pageRefs.current = [];
    try {
      const res = await api.getChapterPages(chapterId);
      setData(res);
      let resolvedMode: "vertical_scroll" | "single_page" | "double_page" = "vertical_scroll";
      if (res.reader_settings) {
        resolvedMode = res.reader_settings.reading_mode || "vertical_scroll";
        setReadingMode(resolvedMode);
        setFitMode(res.reader_settings.fit_mode || "fit_width");
        setReadingDirection(res.reader_settings.reading_direction || "ltr");
        setBackgroundColor(res.reader_settings.background_color || "black");
      }
      const clampedPage = Math.max(1, Math.min(res.page_count || 1, requestedPageRef.current || 1));
      setCurrentPageIndex(clampedPage - 1);
      setScrollCurrentPage(clampedPage);
      maxPageTurnedRef.current = clampedPage;
      if (clampedPage > 1 && resolvedMode === "vertical_scroll") {
        setTimeout(() => {
          pageRefs.current[clampedPage - 1]?.scrollIntoView({ behavior: "auto", block: "start" });
        }, 120);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tải trang truyện của chương này.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [chapterId]);

  useEffect(() => {
    fetchChapter();
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [fetchChapter]);

  // Auto-hide HUD on idle
  useEffect(() => {
    if (pinHud || showSettings) {
      if (hideHudTimerRef.current) clearTimeout(hideHudTimerRef.current);
      setShowHud(true);
      return;
    }
    scheduleHudAutoHide();
    return () => {
      if (hideHudTimerRef.current) clearTimeout(hideHudTimerRef.current);
    };
  }, [pinHud, showSettings, scheduleHudAutoHide]);

  // Track visible page in vertical_scroll mode using IntersectionObserver
  useEffect(() => {
    if (!data || readingMode !== "vertical_scroll") return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestPage = -1;
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= bestRatio) {
            const pAttr = Number((entry.target as HTMLElement).dataset.pageNumber);
            if (!Number.isNaN(pAttr)) {
              bestRatio = entry.intersectionRatio;
              bestPage = pAttr;
            }
          }
        }
        if (bestPage > 0) {
          setScrollCurrentPage(bestPage);
          if (bestPage > maxPageTurnedRef.current) {
            maxPageTurnedRef.current = bestPage;
          }
        }
      },
      { threshold: [0.25, 0.55, 0.8] }
    );

    pageRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [data, readingMode]);

  // Continuous progress sync + unmount flush
  useEffect(() => {
    if (!chapterId || !currentUser || !data) return;

    const flushProgress = (force = false) => {
      const dwellSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const maxPage = maxPageTurnedRef.current;
      if (!force && (dwellSeconds < 5 || maxPage <= lastSyncedPageRef.current)) return;
      if (force && maxPage <= lastSyncedPageRef.current && dwellSeconds < 3) return;

      lastSyncedPageRef.current = maxPage;
      api
        .recordProgress(chapterId, {
          page_number: maxPage,
          dwell_seconds: Math.max(1, dwellSeconds),
          pages_read_count: maxPage,
          is_completed: maxPage >= data.page_count,
        })
        .catch(() => {});
    };

    const interval = setInterval(() => flushProgress(false), 5000);
    return () => {
      clearInterval(interval);
      flushProgress(true);
    };
  }, [chapterId, currentUser, data]);

  const handlePageChange = useCallback(
    (newIndex: number) => {
      if (!data) return;
      const clamped = Math.max(0, Math.min(newIndex, data.pages.length - 1));
      setCurrentPageIndex(clamped);
      const pageNum = Math.min(
        data.pages.length,
        clamped + (readingMode === "double_page" ? 2 : 1)
      );
      if (pageNum > maxPageTurnedRef.current) {
        maxPageTurnedRef.current = pageNum;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [data, readingMode]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showSettings) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") {
        return;
      }

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setShowHud((prev) => !prev);
        return;
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setShowSettings((prev) => !prev);
        return;
      }

      if (!data || readingMode === "vertical_scroll") return;
      const step = readingMode === "double_page" ? 2 : 1;
      const goNext =
        readingDirection === "rtl"
          ? e.key === "ArrowLeft" || e.key === "a" || e.key === "A"
          : e.key === "ArrowRight" || e.key === "d" || e.key === "D";
      const goPrev =
        readingDirection === "rtl"
          ? e.key === "ArrowRight" || e.key === "d" || e.key === "D"
          : e.key === "ArrowLeft" || e.key === "a" || e.key === "A";

      if (goNext) {
        e.preventDefault();
        handlePageChange(currentPageIndex + step);
      } else if (goPrev) {
        e.preventDefault();
        handlePageChange(currentPageIndex - step);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showSettings, data, readingMode, readingDirection, currentPageIndex, handlePageChange]);

  const handleSaveSettings = async () => {
    if (currentUser) {
      try {
        await api.updateReaderSettings({
          reading_mode: readingMode,
          fit_mode: fitMode,
          reading_direction: readingDirection,
          background_color: backgroundColor,
        });
        showToast("Đã lưu cài đặt trình đọc.", "success");
      } catch {
        showToast("Đã áp dụng cài đặt cục bộ.", "info");
      }
    }
    setShowSettings(false);
  };

  if (loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        className="min-h-screen bg-black flex flex-col items-center justify-center text-zinc-400 font-mono text-xs space-y-3"
      >
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p>ĐANG TẢI TRANG MANGA TỪ STORAGE S3 POOL...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <p className="text-sm font-semibold text-zinc-200">{error || "Chương không khả dụng."}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchChapter}
            className="px-4 py-2 rounded bg-emerald-500 text-zinc-950 font-semibold text-xs font-mono inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Thử lại</span>
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-xs font-mono"
          >
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  const bgClasses: Record<BackgroundTheme, string> = {
    black: "bg-black text-zinc-200",
    dark: "bg-zinc-950 text-zinc-200",
    sepia: "bg-[#221d16] text-amber-100",
    light: "bg-zinc-100 text-zinc-900",
  };

  const fitClasses =
    fitMode === "fit_width"
      ? "w-full max-w-3xl h-auto"
      : fitMode === "fit_height"
        ? "max-h-screen w-auto"
        : "w-auto max-w-full";

  const activePage =
    readingMode === "vertical_scroll"
      ? scrollCurrentPage
      : Math.min(data.page_count, currentPageIndex + 1);
  const progressRatio = data.page_count > 0 ? Math.min(1, Math.max(0.02, activePage / data.page_count)) : 0;

  return (
    <div
      onMouseMove={(e) => {
        if (e.clientY < 72 || e.clientY > window.innerHeight - 72) {
          revealHud();
        }
      }}
      className={`min-h-screen overflow-x-hidden flex flex-col relative select-none transition-colors duration-200 ${bgClasses[backgroundColor]}`}
    >
      {/* Fixed Reading Progress Indicator Line */}
      <div className="fixed top-0 inset-x-0 h-0.5 bg-zinc-800/50 z-50 pointer-events-none">
        <motion.div
          className="h-full bg-emerald-400 origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: progressRatio }}
          transition={{ duration: 0.2, ease: MOTION_EASE }}
        />
      </div>

      {/* Auto-Hiding Top HUD */}
      <AnimatePresence>
        {showHud && (
          <motion.header
            initial={{ y: -56, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -56, opacity: 0 }}
            transition={{ duration: 0.18, ease: MOTION_EASE }}
            className="fixed top-0 inset-x-0 z-40 bg-zinc-950/92 border-b border-zinc-800/80 backdrop-blur-md px-3 sm:px-4 py-2 flex items-center justify-between text-xs text-zinc-200"
          >
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Link
                to={`/mangas/${data.pool_manga_id}`}
                className="flex items-center gap-1 text-zinc-300 hover:text-emerald-400 font-mono transition-colors shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Chi Tiết Truyện</span>
              </Link>
              <span className="text-zinc-600 font-mono">/</span>
              <span className="font-mono font-semibold text-emerald-400 shrink-0">
                Chương {data.chapter_number}
              </span>
              {data.title && (
                <span className="text-zinc-400 text-[11px] truncate max-w-[180px] hidden md:inline">
                  - {data.title}
                </span>
              )}
            </div>

            {/* Navigation & Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {data.prev_chapter_id && (
                <button
                  type="button"
                  onClick={() => navigate(`/read/${data.prev_chapter_id}`)}
                  className="px-2 sm:px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 text-xs font-mono flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Chương Trước</span>
                </button>
              )}

              {data.next_chapter_id && (
                <button
                  type="button"
                  onClick={() => navigate(`/read/${data.next_chapter_id}`)}
                  className="px-2 sm:px-2.5 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 text-xs font-mono flex items-center gap-1 font-semibold"
                >
                  <span className="hidden sm:inline">Chương Kế</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setPinHud((prev) => !prev)}
                title={pinHud ? "Tự ẩn thanh công cụ" : "Ghim thanh công cụ"}
                aria-label={pinHud ? "Tự ẩn thanh công cụ" : "Ghim thanh công cụ"}
                className={`p-1.5 rounded border transition-colors ${
                  pinHud
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {pinHud ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-emerald-400 transition-colors"
                title="Cài đặt trình đọc (Phím M)"
                aria-label="Cài đặt trình đọc"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Reader Settings Modal */}
      <ModalMotion
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        ariaLabel="Cài đặt trình đọc truyện"
        maxWidthClass="max-w-md"
      >
        <div className="bg-zinc-900 border border-zinc-800 rounded-md p-6 space-y-5 text-xs font-mono text-zinc-200 shadow-2xl relative">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>CÀI ĐẶT TRÌNH ĐỌC TRUYỆN</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              aria-label="Đóng cài đặt"
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <p className="text-zinc-400 mb-1.5 uppercase text-[10px]">CHẾ ĐỘ ĐỌC (READING MODE)</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "vertical_scroll", label: "Cuộn Dọc" },
                  { id: "single_page", label: "Trang Đơn" },
                  { id: "double_page", label: "Trang Đôi" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setReadingMode(m.id)}
                  className={`py-2 rounded border text-center transition-colors ${
                    readingMode === m.id
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-zinc-400 mb-1.5 uppercase text-[10px]">ĐỘ KHỚP KHUNG HÌNH (FIT MODE)</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: "fit_width", label: "Khớp Rộng" },
                  { id: "fit_height", label: "Khớp Cao" },
                  { id: "original", label: "Kích Cỡ Gốc" },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFitMode(f.id)}
                  className={`py-2 rounded border text-center transition-colors ${
                    fitMode === f.id
                      ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-zinc-400 mb-1.5 uppercase text-[10px]">HƯỚNG LẬT TRANG</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: "ltr", label: "Trái → Phải" },
                    { id: "rtl", label: "Phải → Trái" },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setReadingDirection(d.id)}
                    className={`py-2 rounded border text-center transition-colors ${
                      readingDirection === d.id
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-zinc-400 mb-1.5 uppercase text-[10px]">MÀU NỀN ĐỌC</p>
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    { id: "black", label: "Đen" },
                    { id: "dark", label: "Tối" },
                    { id: "sepia", label: "Ấm" },
                    { id: "light", label: "Sáng" },
                  ] as const
                ).map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setBackgroundColor(bg.id)}
                    className={`py-2 rounded border text-center transition-colors ${
                      backgroundColor === bg.id
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800/80 rounded p-2.5 space-y-1">
            <p className="text-zinc-300 font-semibold">Phím tắt nhanh:</p>
            <p>A/D hoặc ←/→: Chuyển trang &bull; F: Ẩn/hiện HUD &bull; M: Mở cài đặt</p>
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            className="w-full py-2.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs font-mono transition-colors"
          >
            ÁP DỤNG & LƯU CÀI ĐẶT
          </button>
        </div>
      </ModalMotion>

      {/* Reader Canvas Body */}
      <main
        onClick={() => {
          setShowHud((prev) => !prev);
        }}
        className="flex-1 flex flex-col items-center justify-center pt-14 pb-16 px-1 sm:px-4 cursor-pointer"
      >
        {readingMode === "vertical_scroll" ? (
          /* Webtoon Vertical Strip */
          <div className="w-full flex flex-col items-center space-y-1">
            {data.pages.map((p, idx) => (
              <div
                key={p.page_uid}
                ref={(el) => {
                  pageRefs.current[idx] = el;
                }}
                data-page-number={p.page_number}
                className="w-full flex justify-center"
              >
                <ReaderImage page={p} fitClasses={fitClasses} />
              </div>
            ))}
          </div>
        ) : (
          /* Paged Mode (Single / Double) */
          <div className="flex flex-col items-center justify-center space-y-4 w-full">
            <div
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const isRightHalf = e.clientX - rect.left > rect.width / 2;
                const step = readingMode === "double_page" ? 2 : 1;
                const forward = readingDirection === "rtl" ? !isRightHalf : isRightHalf;
                handlePageChange(currentPageIndex + (forward ? step : -step));
              }}
              className={`flex items-center justify-center gap-2 max-w-full ${
                readingDirection === "rtl" ? "flex-row-reverse" : ""
              }`}
            >
              {data.pages[currentPageIndex] && (
                <ReaderImage
                  key={data.pages[currentPageIndex].page_uid}
                  page={data.pages[currentPageIndex]}
                  fitClasses={fitClasses}
                />
              )}
              {readingMode === "double_page" && data.pages[currentPageIndex + 1] && (
                <ReaderImage
                  key={data.pages[currentPageIndex + 1].page_uid}
                  page={data.pages[currentPageIndex + 1]}
                  fitClasses={fitClasses}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating Bottom HUD */}
      <AnimatePresence>
        {showHud && (
          <motion.div
            initial={{ y: 56, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 56, opacity: 0 }}
            transition={{ duration: 0.18, ease: MOTION_EASE }}
            onClick={(e) => e.stopPropagation()}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 rounded-full bg-zinc-950/92 border border-zinc-800 shadow-2xl backdrop-blur-md text-xs font-mono text-zinc-200"
          >
            {readingMode !== "vertical_scroll" && (
              <button
                type="button"
                disabled={currentPageIndex <= 0}
                aria-label="Trang trước"
                onClick={() =>
                  handlePageChange(currentPageIndex - (readingMode === "double_page" ? 2 : 1))
                }
                className="p-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}

            <span className="whitespace-nowrap">
              Trang <strong className="text-emerald-400">{activePage}</strong> / {data.page_count}
            </span>

            {readingMode !== "vertical_scroll" && (
              <button
                type="button"
                disabled={currentPageIndex >= data.pages.length - 1}
                aria-label="Trang sau"
                onClick={() =>
                  handlePageChange(currentPageIndex + (readingMode === "double_page" ? 2 : 1))
                }
                className="p-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* End-of-Chapter Footer */}
      <footer className="bg-zinc-950 border-t border-zinc-800/80 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-zinc-300">
        <div className="text-zinc-400">
          Chương {data.chapter_number} ({data.page_count} trang) &bull; Zero-copy MinIO S3
        </div>

        <div className="flex items-center gap-3">
          {data.prev_chapter_id && (
            <button
              type="button"
              onClick={() => navigate(`/read/${data.prev_chapter_id}`)}
              className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
            >
              &larr; Chương Trước
            </button>
          )}
          {data.next_chapter_id && (
            <button
              type="button"
              onClick={() => navigate(`/read/${data.next_chapter_id}`)}
              className="px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold"
            >
              Đọc Chương Kế Tiếp &rarr;
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};

interface ReaderPageItem {
  page_uid: string;
  page_number: number;
  image_url: string;
}

const ReaderImage: React.FC<{ page: ReaderPageItem; fitClasses: string }> = ({
  page,
  fitClasses,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  return (
    <div
      className={`relative bg-zinc-950 flex items-center justify-center min-h-[260px] ${fitClasses}`}
    >
      {!loaded && !hasError && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-zinc-900 animate-shimmer motion-reduce:after:hidden rounded"
        />
      )}

      {hasError ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="p-8 text-center rounded border border-rose-500/20 bg-rose-500/10 space-y-2"
        >
          <p className="text-xs text-rose-300 font-mono">Lỗi tải hình ảnh trang {page.page_number}</p>
          <button
            type="button"
            onClick={() => {
              setHasError(false);
              setLoaded(false);
              setRetryKey((k) => k + 1);
            }}
            className="px-3 py-1.5 rounded bg-zinc-900 text-zinc-200 text-xs font-mono border border-zinc-700 hover:bg-zinc-800 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Tải lại ảnh</span>
          </button>
        </div>
      ) : (
        <img
          key={retryKey}
          src={page.image_url}
          alt={`Trang ${page.page_number}`}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setHasError(true)}
          className={`w-full h-auto object-contain select-none transition-opacity duration-200 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
};
