import React, { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Settings2,
  Sliders,
  RotateCcw,
  MessageSquare,
  Home,
  Check,
  AlertCircle,
  Eye,
} from "lucide-react";
import { api, ChapterPagesData, UserProfile } from "@/api/client";

interface ReaderPageProps {
  currentUser: UserProfile | null;
}

export const ReaderPage: React.FC<ReaderPageProps> = ({ currentUser }) => {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<ChapterPagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Settings
  const [readingMode, setReadingMode] = useState<"vertical_scroll" | "single_page" | "double_page">("vertical_scroll");
  const [fitMode, setFitMode] = useState<"fit_width" | "fit_height" | "original">("fit_width");
  const [readingDirection, setReadingDirection] = useState<"ltr" | "rtl">("ltr");
  const [showSettings, setShowSettings] = useState(false);

  // Single / Double page navigation
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // Progress & Anti-F5 tracking
  const startTimeRef = useRef(Date.now());
  const maxPageTurnedRef = useRef(1);
  const progressReportedRef = useRef(false);

  const fetchChapter = async () => {
    if (!chapterId) return;
    setLoading(true);
    setError(null);
    startTimeRef.current = Date.now();
    maxPageTurnedRef.current = 1;
    progressReportedRef.current = false;
    try {
      const res = await api.getChapterPages(chapterId);
      setData(res);
      if (res.reader_settings) {
        setReadingMode(res.reader_settings.reading_mode || "vertical_scroll");
        setFitMode(res.reader_settings.fit_mode || "fit_width");
        setReadingDirection(res.reader_settings.reading_direction || "ltr");
      }
      setCurrentPageIndex(0);
    } catch (err: any) {
      setError(err.message || "Không thể tải trang truyện của chương này.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChapter();
  }, [chapterId]);

  // Periodic progress sync & view counter trigger
  useEffect(() => {
    if (!chapterId || !currentUser) return;

    const interval = setInterval(() => {
      const dwellSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (dwellSeconds >= 10 && !progressReportedRef.current) {
        progressReportedRef.current = true;
        api.recordProgress(chapterId, {
          page_number: maxPageTurnedRef.current,
          dwell_seconds: dwellSeconds,
          pages_read_count: maxPageTurnedRef.current,
          is_completed: data ? maxPageTurnedRef.current >= data.page_count : false,
        }).catch(() => {});
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [chapterId, currentUser, data]);

  const handlePageChange = (newIndex: number) => {
    if (!data) return;
    const clamped = Math.max(0, Math.min(newIndex, data.pages.length - 1));
    setCurrentPageIndex(clamped);
    if (clamped + 1 > maxPageTurnedRef.current) {
      maxPageTurnedRef.current = clamped + 1;
    }
  };

  const handleSaveSettings = async () => {
    if (currentUser) {
      api.updateReaderSettings({
        reading_mode: readingMode,
        fit_mode: fitMode,
        reading_direction: readingDirection,
      }).catch(() => {});
    }
    setShowSettings(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-zinc-500 font-mono text-xs space-y-3">
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
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded bg-zinc-800 text-zinc-200 text-xs font-mono"
        >
          Quay lại
        </button>
      </div>
    );
  }

  const fitClasses =
    fitMode === "fit_width"
      ? "w-full max-w-3xl h-auto"
      : fitMode === "fit_height"
      ? "max-h-screen w-auto"
      : "w-auto max-w-full";

  return (
    <div className="min-h-screen bg-black text-zinc-200 flex flex-col relative select-none">
      {/* Sticky Reader Bar */}
      <header className="sticky top-0 z-40 bg-zinc-950/90 border-b border-zinc-800/80 backdrop-blur px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <Link
            to={`/mangas/${data.pool_manga_id}`}
            className="flex items-center gap-1 text-zinc-400 hover:text-zinc-100 font-mono transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Trang Truyện</span>
          </Link>
          <span className="text-zinc-600 font-mono">/</span>
          <span className="font-mono font-semibold text-emerald-400">
            Chương {data.chapter_number}
          </span>
          {data.title && (
            <span className="text-zinc-500 text-[11px] truncate max-w-[200px] hidden md:inline">
              - {data.title}
            </span>
          )}
        </div>

        {/* Navigation & Controls */}
        <div className="flex items-center gap-2">
          {data.prev_chapter_id && (
            <button
              onClick={() => navigate(`/read/${data.prev_chapter_id}`)}
              className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 text-xs font-mono flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chương Trước</span>
            </button>
          )}

          {data.next_chapter_id && (
            <button
              onClick={() => navigate(`/read/${data.next_chapter_id}`)}
              className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 text-xs font-mono flex items-center gap-1 font-semibold"
            >
              <span className="hidden sm:inline">Chương Kế</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            title="Cài đặt hiển thị"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Reader Settings Modal / Sheet */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded p-6 space-y-4 text-xs font-mono">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>CÀI ĐẶT TRÌNH ĐỌC TRUYỆN</span>
            </h3>

            <div>
              <label className="block text-zinc-400 mb-1.5 uppercase text-[10px]">CHẾ ĐỘ ĐỌC (READING MODE)</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "vertical_scroll", label: "Cuộn Dọc" },
                  { id: "single_page", label: "Trang Đơn" },
                  { id: "double_page", label: "Trang Đôi" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setReadingMode(m.id as any)}
                    className={`py-1.5 rounded border text-center transition-colors ${
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
              <label className="block text-zinc-400 mb-1.5 uppercase text-[10px]">ĐỘ KHỚP KHUNG HÌNH (FIT MODE)</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "fit_width", label: "Khớp Chiều Rộng" },
                  { id: "fit_height", label: "Khớp Chiều Cao" },
                  { id: "original", label: "Kích Thước Gốc" },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFitMode(f.id as any)}
                    className={`py-1.5 rounded border text-center transition-colors ${
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

            <button
              onClick={handleSaveSettings}
              className="w-full py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs font-mono transition-colors mt-2"
            >
              ÁP DỤNG & LƯU CÀI ĐẶT
            </button>
          </div>
        </div>
      )}

      {/* Reader Body */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4">
        {readingMode === "vertical_scroll" ? (
          /* Webtoon Vertical Strip */
          <div className="w-full flex flex-col items-center space-y-1">
            {data.pages.map((p) => (
              <ReaderImage key={p.page_uid} page={p} fitClasses={fitClasses} />
            ))}
          </div>
        ) : (
          /* Paged Mode (Single / Double) */
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <ReaderImage page={data.pages[currentPageIndex]} fitClasses={fitClasses} />
              {readingMode === "double_page" && currentPageIndex + 1 < data.pages.length && (
                <ReaderImage page={data.pages[currentPageIndex + 1]} fitClasses={fitClasses} />
              )}
            </div>

            {/* Pager Bar */}
            <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded px-4 py-2 font-mono text-xs">
              <button
                disabled={currentPageIndex <= 0}
                onClick={() => handlePageChange(currentPageIndex - (readingMode === "double_page" ? 2 : 1))}
                className="p-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-zinc-300">
                Trang {currentPageIndex + 1} / {data.pages.length}
              </span>

              <button
                disabled={currentPageIndex >= data.pages.length - 1}
                onClick={() => handlePageChange(currentPageIndex + (readingMode === "double_page" ? 2 : 1))}
                className="p-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Reader Bottom Navigation Bar */}
      <footer className="bg-zinc-950 border-t border-zinc-800/80 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono">
        <div className="text-zinc-500">
          Chương {data.chapter_number} ({data.page_count} trang) &bull; Zero-copy MinIO S3
        </div>

        <div className="flex items-center gap-3">
          {data.prev_chapter_id && (
            <button
              onClick={() => navigate(`/read/${data.prev_chapter_id}`)}
              className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
            >
              &larr; Chương Trước
            </button>
          )}
          {data.next_chapter_id && (
            <button
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

const ReaderImage: React.FC<{ page: any; fitClasses: string }> = ({ page, fitClasses }) => {
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  return (
    <div className={`relative bg-zinc-950 flex items-center justify-center min-h-[300px] ${fitClasses}`}>
      {hasError ? (
        <div className="p-8 text-center rounded border border-rose-500/20 bg-rose-500/10 space-y-2">
          <p className="text-xs text-rose-300 font-mono">Lỗi tải hình ảnh trang {page.page_number}</p>
          <button
            onClick={() => {
              setHasError(false);
              setRetryKey((k) => k + 1);
            }}
            className="px-3 py-1 rounded bg-zinc-900 text-xs font-mono border border-zinc-700 hover:bg-zinc-800"
          >
            Tải lại ảnh
          </button>
        </div>
      ) : (
        <img
          key={retryKey}
          src={page.image_url}
          alt={`Trang ${page.page_number}`}
          loading="lazy"
          decoding="async"
          onError={() => setHasError(true)}
          className="w-full h-auto object-contain select-none"
        />
      )}
    </div>
  );
};

