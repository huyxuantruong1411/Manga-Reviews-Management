import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Globe,
  AlertTriangle,
  Download,
  Sparkles,
  Plus,
  Minus,
  RotateCcw
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
  // Zoom level percentage (30% to 300%, default 100%)
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    const saved = localStorage.getItem("manga_zoom_level");
    return saved ? Math.min(300, Math.max(30, Number(saved))) : 100;
  });
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

  useEffect(() => {
    localStorage.setItem("manga_zoom_level", String(zoomLevel));
  }, [zoomLevel]);

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
      if (res.data.language) {
        setActiveLanguage(res.data.language.toLowerCase());
      }
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
          fit_mode: fitMode,
          language: res.data.language
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

  // Active reading language
  const [activeLanguage, setActiveLanguage] = useState<string>("en");

  // Available unique languages in downloaded chapters
  const availableLanguages = useMemo(() => {
    const set = new Set<string>();
    chapters.forEach((c) => {
      if (c.language) set.add(c.language.toLowerCase());
    });
    return Array.from(set);
  }, [chapters]);

  // Chapters filtered to the active reading language, sorted by numeric chapter
  const activeLanguageChapters = useMemo(() => {
    if (!chapters.length) return [];
    const filtered = chapters.filter(
      (c) => (c.language || "en").toLowerCase() === activeLanguage.toLowerCase()
    );
    const list = filtered.length > 0 ? filtered : chapters;
    return [...list].sort((a, b) => a.chapter_numeric - b.chapter_numeric);
  }, [chapters, activeLanguage]);

  // Volume grouping for active language chapters
  const volumeGroupedChapters = useMemo(() => {
    const groups: { volume: string | null; label: string; chapters: Chapter[] }[] = [];
    const map = new Map<string, Chapter[]>();
    const order: string[] = [];

    activeLanguageChapters.forEach((chap) => {
      const volKey = chap.volume ? `Volume ${chap.volume}` : "Khác / Chưa phân Vol";
      if (!map.has(volKey)) {
        map.set(volKey, []);
        order.push(volKey);
      }
      map.get(volKey)!.push(chap);
    });

    order.forEach((volKey) => {
      const list = map.get(volKey)!;
      groups.push({
        volume: volKey.startsWith("Volume ") ? volKey.replace("Volume ", "") : null,
        label: volKey,
        chapters: list
      });
    });

    return groups;
  }, [activeLanguageChapters]);

  // Double page pairing helper: pairs (1,2), (3,4)..., or single page if 1-page chapter / odd end
  const getDoublePagePair = useCallback((currentPg: number, total: number) => {
    if (total <= 1) {
      return { firstPageNum: 1, secondPageNum: null };
    }
    const first = currentPg % 2 === 0 ? currentPg - 1 : currentPg;
    const second = first + 1 <= total ? first + 1 : null;
    return { firstPageNum: first, secondPageNum: second };
  }, []);

  // Current chapter index in the active language sequence
  const currentChapterIndex = activeLanguageChapters.findIndex((c) => c.id === currentChapter?.id);
  const prevChapter = currentChapterIndex > 0 ? activeLanguageChapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex >= 0 && currentChapterIndex < activeLanguageChapters.length - 1
    ? activeLanguageChapters[currentChapterIndex + 1]
    : null;

  // Chapters in other languages that continue after current chapter (MangaDex-style switch)
  const otherLanguageNextChapters = useMemo(() => {
    if (!currentChapter) return [];
    const currLang = (currentChapter.language || "en").toLowerCase();
    const currNum = currentChapter.chapter_numeric;
    return chapters
      .filter((c) => (c.language || "en").toLowerCase() !== currLang && c.chapter_numeric > currNum)
      .sort((a, b) => a.chapter_numeric - b.chapter_numeric);
  }, [chapters, currentChapter]);

  const nextAltLanguageChapter = otherLanguageNextChapters[0] || null;

  // Gap detection between chapters
  const detectGap = (currNum: number, nxtNum: number) => {
    if (nxtNum <= currNum) return { hasGap: false, count: 0, desc: "" };

    const startInt = Math.floor(currNum) + 1;
    const endInt = Math.floor(nxtNum) - 1;

    if (startInt <= endInt) {
      const missingList: number[] = [];
      for (let i = startInt; i <= endInt; i++) {
        missingList.push(i);
      }
      const count = missingList.length;
      const desc = count === 1
        ? `Chương ${missingList[0]}`
        : count === 2
        ? `Chương ${missingList[0]} và Chương ${missingList[1]}`
        : `Từ Chương ${missingList[0]} đến Chương ${missingList[missingList.length - 1]}`;
      return { hasGap: true, count, desc };
    }

    if (nxtNum - currNum > 1.05) {
      return {
        hasGap: true,
        count: Math.floor(nxtNum - currNum) - 1 || 1,
        desc: `các phân đoạn chap giữa ${currNum} và ${nxtNum}`,
      };
    }

    return { hasGap: false, count: 0, desc: "" };
  };

  // Gap warning modal state
  const [gapWarningModal, setGapWarningModal] = useState<{
    targetChapter: Chapter;
    missingCount: number;
    missingDesc: string;
  } | null>(null);

  // MangaDex-style Language switch modal state
  const [languageSwitchModal, setLanguageSwitchModal] = useState<{
    targetChapter: Chapter;
  } | null>(null);

  const goToChapter = (targetChapId: string, pageNum: number = 1) => {
    navigate(`/manga/${mangaId}/read/${targetChapId}?page=${pageNum}`);
  };

  const handleSafeGoToChapter = (targetChap: Chapter) => {
    if (!currentChapter) {
      goToChapter(targetChap.id, 1);
      return;
    }

    // Check if target chapter has a different language
    if ((targetChap.language || "en").toLowerCase() !== activeLanguage.toLowerCase()) {
      setActiveLanguage(targetChap.language || "en");
    }

    // Check forward chapter gap
    if (targetChap.chapter_numeric > currentChapter.chapter_numeric) {
      const gap = detectGap(currentChapter.chapter_numeric, targetChap.chapter_numeric);
      if (gap.hasGap) {
        setGapWarningModal({
          targetChapter: targetChap,
          missingCount: gap.count,
          missingDesc: gap.desc,
        });
        return;
      }
    }

    goToChapter(targetChap.id, 1);
  };

  const handleRequestNextChapter = () => {
    if (nextChapter) {
      handleSafeGoToChapter(nextChapter);
    } else if (nextAltLanguageChapter) {
      setLanguageSwitchModal({ targetChapter: nextAltLanguageChapter });
    }
  };

  const handleSwitchLanguage = (newLang: string) => {
    setActiveLanguage(newLang);
    const candidateChapters = chapters.filter(
      (c) => (c.language || "en").toLowerCase() === newLang.toLowerCase()
    );
    if (candidateChapters.length === 0) return;

    // Find the closest chapter to current chapter_numeric
    if (currentChapter) {
      const exactMatch = candidateChapters.find(
        (c) => c.chapter_number.trim().toLowerCase() === currentChapter.chapter_number.trim().toLowerCase()
      );
      if (exactMatch) {
        goToChapter(exactMatch.id, 1);
        return;
      }

      // Closest numeric
      const closest = [...candidateChapters].sort(
        (a, b) => Math.abs(a.chapter_numeric - currentChapter.chapter_numeric) - Math.abs(b.chapter_numeric - currentChapter.chapter_numeric)
      )[0];
      if (closest) {
        goToChapter(closest.id, 1);
        return;
      }
    }

    goToChapter(candidateChapters[0].id, 1);
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
      } else {
        handleRequestNextChapter();
      }
    } else if (readingMode === "double_rtl" || readingMode === "double_ltr") {
      const { firstPageNum } = getDoublePagePair(currentPage, pages.length);
      if (firstPageNum + 2 <= pages.length) {
        setCurrentPage(firstPageNum + 2);
      } else {
        handleRequestNextChapter();
      }
    }
  }, [readingMode, currentPage, pages.length, getDoublePagePair, nextChapter, nextAltLanguageChapter]);

  const handleTurnPrev = useCallback(() => {
    if (readingMode === "single") {
      if (currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      } else if (prevChapter) {
        handleSafeGoToChapter(prevChapter);
      }
    } else if (readingMode === "double_rtl" || readingMode === "double_ltr") {
      const { firstPageNum } = getDoublePagePair(currentPage, pages.length);
      if (firstPageNum - 2 >= 1) {
        setCurrentPage(firstPageNum - 2);
      } else if (prevChapter) {
        handleSafeGoToChapter(prevChapter);
      }
    }
  }, [readingMode, currentPage, pages.length, getDoublePagePair, prevChapter]);

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
      } else if (e.key === "+" || e.key === "=") {
        setZoomLevel((prev) => Math.min(300, prev + 10));
      } else if (e.key === "-" || e.key === "_") {
        setZoomLevel((prev) => Math.max(30, prev - 10));
      } else if (e.key === "0") {
        setZoomLevel(100);
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

          {/* Language Switcher Pills in Header (when multiple languages are available) */}
          {availableLanguages.length > 1 && (
            <div className="hidden sm:flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5 text-xs font-bold shrink-0">
              <Globe size={13} className="text-zinc-500 ml-1.5 mr-1" />
              {availableLanguages.map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleSwitchLanguage(lang)}
                  className={`px-2 py-0.5 rounded-lg uppercase transition cursor-pointer text-[11px] font-bold ${
                    activeLanguage.toLowerCase() === lang.toLowerCase()
                      ? "bg-[var(--brand-orange)] text-white shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                  title={`Đổi sang bản dịch [${lang.toUpperCase()}]`}
                >
                  {lang}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center: Chapter & Page Selectors */}
        <div className="hidden md:flex items-center space-x-2">
          {/* Prev Chapter */}
          <button
            onClick={() => prevChapter && handleSafeGoToChapter(prevChapter)}
            disabled={!prevChapter}
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
            title="Chương trước"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Chapter Selector Dropdown */}
          <select
            value={currentChapter?.id || ""}
            onChange={(e) => {
              const target = activeLanguageChapters.find((c) => c.id === e.target.value);
              if (target) handleSafeGoToChapter(target);
            }}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-200 focus:outline-none focus:border-[var(--brand-orange)] cursor-pointer max-w-[210px] truncate"
          >
            {volumeGroupedChapters.length > 1
              ? volumeGroupedChapters.map((grp) => (
                  <optgroup key={grp.label} label={grp.label} className="bg-zinc-900 text-zinc-400 font-bold">
                    {grp.chapters.map((chap) => (
                      <option key={chap.id} value={chap.id} className="bg-zinc-900 text-white font-normal">
                        Ch. {chap.chapter_number} {chap.title ? `- ${chap.title}` : ""} ({chap.page_count}p)
                      </option>
                    ))}
                  </optgroup>
                ))
              : activeLanguageChapters.map((chap) => (
                  <option key={chap.id} value={chap.id} className="bg-zinc-900 text-white">
                    Ch. {chap.chapter_number} {chap.title ? `- ${chap.title}` : ""} ({chap.page_count} trang)
                  </option>
                ))}
          </select>

          {/* Next Chapter */}
          <button
            onClick={handleRequestNextChapter}
            disabled={!nextChapter && !nextAltLanguageChapter}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              !nextChapter && nextAltLanguageChapter
                ? "bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30"
                : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
            }`}
            title={
              nextChapter
                ? `Chương tiếp theo (Ch. ${nextChapter.chapter_number})`
                : nextAltLanguageChapter
                ? `Đổi sang bản [${nextAltLanguageChapter.language?.toUpperCase()}] Ch. ${nextAltLanguageChapter.chapter_number}`
                : "Hết chương"
            }
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
          {/* Zoom Level Control in Header */}
          <div className="hidden md:flex items-center bg-zinc-900/90 border border-zinc-800 rounded-xl p-0.5 text-xs font-bold">
            <button
              onClick={() => setZoomLevel((prev) => Math.max(30, prev - 10))}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              title="Thu nhỏ (-10%) (Phím -)"
            >
              <Minus size={13} />
            </button>
            <button
              onClick={() => setZoomLevel(100)}
              className="px-2 py-0.5 text-zinc-200 hover:text-[var(--brand-orange)] font-mono text-[11px] font-bold cursor-pointer"
              title="Đặt lại 100% (Phím 0)"
            >
              {zoomLevel}%
            </button>
            <button
              onClick={() => setZoomLevel((prev) => Math.min(300, prev + 10))}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              title="Phóng to (+10%) (Phím +)"
            >
              <Plus size={13} />
            </button>
          </div>

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
                      style={{
                        width: `${(896 * zoomLevel) / 100}px`,
                        maxWidth: zoomLevel <= 100 ? `${zoomLevel}%` : "none"
                      }}
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
                      {nextChapter
                        ? `Chương tiếp theo: Ch. ${nextChapter.chapter_number} [${(nextChapter.language || activeLanguage).toUpperCase()}]`
                        : `Bạn đã đọc đến chương mới nhất của bản [${activeLanguage.toUpperCase()}].`}
                    </p>
                  </div>

                  {/* Missing gap warning banner if nextChapter has a gap */}
                  {(() => {
                    if (!nextChapter || !currentChapter) return null;
                    const gap = detectGap(currentChapter.chapter_numeric, nextChapter.chapter_numeric);
                    if (!gap.hasGap) return null;
                    return (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start space-x-2.5 text-left text-xs text-amber-300">
                        <AlertTriangle size={18} className="shrink-0 text-amber-400 mt-0.5" />
                        <div>
                          <span className="font-bold">Lưu ý thiếu chương:</span> Đang bị khuyết {gap.count} chương ({gap.desc}) trước khi tới Ch. {nextChapter.chapter_number}.
                        </div>
                      </div>
                    );
                  })()}

                  {/* MangaDex-style Language Switch Card if nextChapter is null but nextAltLanguageChapter exists */}
                  {!nextChapter && nextAltLanguageChapter && (
                    <div className="p-4 bg-amber-500/5 border border-amber-500/30 rounded-2xl space-y-2 text-left">
                      <div className="flex items-center space-x-1.5 text-amber-400 font-bold text-xs">
                        <Sparkles size={14} />
                        <span>Gợi ý chuyển ngôn ngữ (MangaDex style)</span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Bản dịch <span className="uppercase font-bold text-white">[{activeLanguage}]</span> đã hết ở chương này. Tuy nhiên có bản dịch tiếng <span className="uppercase font-bold text-[var(--brand-orange)]">[{nextAltLanguageChapter.language}]</span> tiếp nối từ <strong className="text-white">Chương {nextAltLanguageChapter.chapter_number}</strong>!
                      </p>
                      <button
                        onClick={() => handleSwitchLanguage(nextAltLanguageChapter.language || "vi")}
                        className="w-full mt-1 py-2.5 px-3 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white rounded-xl text-xs font-bold shadow flex items-center justify-center space-x-1.5 transition cursor-pointer"
                      >
                        <span>Chuyển sang [{nextAltLanguageChapter.language?.toUpperCase()}] Ch. {nextAltLanguageChapter.chapter_number}</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-center space-x-3 pt-2">
                    <button
                      onClick={handleExit}
                      className="px-4 py-2 rounded-xl border border-zinc-700 hover:bg-zinc-800 text-xs font-bold text-zinc-300 cursor-pointer"
                    >
                      Danh sách chương
                    </button>
                    {nextChapter && (
                      <button
                        onClick={() => handleSafeGoToChapter(nextChapter)}
                        className="px-5 py-2 rounded-xl bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold shadow-lg transition cursor-pointer"
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
              <div className="relative min-h-[85vh] flex items-center justify-center px-4 w-full pb-20">
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
                      className={`${getImageFitClass()} shadow-2xl rounded-sm select-none`}
                      style={{
                        maxHeight: `calc(88vh * ${zoomLevel / 100})`,
                        maxWidth: `calc(90vw * ${zoomLevel / 100})`
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Mode 3: Double Page (RTL Manga or LTR) */}
            {(readingMode === "double_rtl" || readingMode === "double_ltr") && (
              <div className="relative min-h-[85vh] flex items-center justify-center px-4 w-full pb-20">
                {/* Left Click Area */}
                <div
                  onClick={readingMode === "double_rtl" ? handleTurnNext : handleTurnPrev}
                  className="absolute left-0 inset-y-0 w-1/3 cursor-pointer z-20 hover:bg-white/[0.02] transition"
                  title={readingMode === "double_rtl" ? "Trang tiếp (← / A)" : "Trang trước (← / A)"}
                />

                {/* Right Click Area */}
                <div
                  onClick={readingMode === "double_rtl" ? handleTurnPrev : handleTurnNext}
                  className="absolute right-0 inset-y-0 w-1/3 cursor-pointer z-20 hover:bg-white/[0.02] transition"
                  title={readingMode === "double_rtl" ? "Trang trước (→ / D)" : "Trang tiếp (→ / D)"}
                />

                {/* Double Pages View */}
                <div className="relative z-10 flex items-center justify-center gap-1 max-w-full">
                  {(() => {
                    const { firstPageNum, secondPageNum } = getDoublePagePair(currentPage, pages.length);
                    const firstPage = pages[firstPageNum - 1];
                    const secondPage = secondPageNum ? pages[secondPageNum - 1] : null;

                    // In RTL (Manga), right slot is the earlier page (firstPage), left slot is the subsequent page (secondPage)
                    const leftPage = readingMode === "double_rtl" ? secondPage : firstPage;
                    const rightPage = readingMode === "double_rtl" ? firstPage : secondPage;

                    const renderPageSlot = (pageItem: PageItem | null) => {
                      if (!pageItem) {
                        return (
                          <div
                            className="h-[85vh] w-[42vw] max-w-[550px] rounded-sm border border-dashed border-zinc-800/80 bg-zinc-950/40 flex flex-col items-center justify-center p-6 text-center select-none shadow-inner"
                            style={{
                              maxHeight: `calc(85vh * ${zoomLevel / 100})`,
                              maxWidth: `calc(44vw * ${zoomLevel / 100})`
                            }}
                          >
                            <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 mb-2">
                              <BookOpen size={20} />
                            </div>
                            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Trang kết thúc</p>
                            <p className="text-[10px] text-zinc-500 mt-0.5">
                              Chap lẻ ({pages.length} trang). Lật tiếp để qua chap mới.
                            </p>
                          </div>
                        );
                      }

                      return (
                        <img
                          src={pageItem.url || ""}
                          alt={`Page ${pageItem.page_number}`}
                          className="h-[85vh] w-auto max-w-[45vw] object-contain shadow-2xl rounded-sm select-none"
                          style={{
                            maxHeight: `calc(85vh * ${zoomLevel / 100})`,
                            maxWidth: `calc(45vw * ${zoomLevel / 100})`
                          }}
                        />
                      );
                    };

                    if (pages.length <= 1) {
                      return (
                        <div className="flex flex-col items-center">
                          {firstPage && (
                            <img
                              src={firstPage.url || ""}
                              alt={`Page ${firstPage.page_number}`}
                              className={`${getImageFitClass()} shadow-2xl rounded-sm select-none`}
                              style={{
                                maxHeight: `calc(88vh * ${zoomLevel / 100})`,
                                maxWidth: `calc(90vw * ${zoomLevel / 100})`
                              }}
                            />
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="flex items-center justify-center gap-1 max-w-full">
                        {renderPageSlot(leftPage)}
                        {/* Book Spine / Center Crease */}
                        <div className="w-[1px] h-[80vh] bg-zinc-800/60 shadow-[0_0_12px_rgba(0,0,0,0.8)] shrink-0 hidden sm:block" />
                        {renderPageSlot(rightPage)}
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

            {/* Language Switcher in Sidebar */}
            {availableLanguages.length > 1 && (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block flex items-center space-x-1.5">
                  <Globe size={12} className="text-[var(--brand-orange)]" />
                  <span>Bản dịch ngôn ngữ</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableLanguages.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => handleSwitchLanguage(lang)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase transition cursor-pointer ${
                        activeLanguage.toLowerCase() === lang.toLowerCase()
                          ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
                          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {lang === "vi" ? "VI - Tiếng Việt" : lang === "en" ? "EN - English" : lang.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

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

            {/* Zoom Level Section in Sidebar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Phóng to / Thu nhỏ (Zoom {zoomLevel}%)
                </label>
                <button
                  onClick={() => setZoomLevel(100)}
                  className="text-[10px] text-zinc-400 hover:text-[var(--brand-orange)] flex items-center space-x-1 cursor-pointer"
                  title="Đặt lại 100%"
                >
                  <RotateCcw size={10} />
                  <span>100%</span>
                </button>
              </div>
              <input
                type="range"
                min={30}
                max={250}
                step={5}
                value={zoomLevel}
                onChange={(e) => setZoomLevel(Number(e.target.value))}
                className="w-full accent-[var(--brand-orange)] cursor-pointer"
              />
              <div className="grid grid-cols-5 gap-1 pt-1">
                {[50, 75, 100, 125, 150].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setZoomLevel(pct)}
                    className={`py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${
                      zoomLevel === pct
                        ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-xs"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Fit Mode */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Kích thước ảnh (Fit Mode)
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    setFitMode("width");
                    setZoomLevel(100);
                  }}
                  className={`p-2 rounded-xl border font-bold text-center transition cursor-pointer ${
                    fitMode === "width"
                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  Vừa ngang
                </button>
                <button
                  onClick={() => {
                    setFitMode("height");
                    setZoomLevel(100);
                  }}
                  className={`p-2 rounded-xl border font-bold text-center transition cursor-pointer ${
                    fitMode === "height"
                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  Vừa dọc
                </button>
                <button
                  onClick={() => {
                    setFitMode("original");
                    setZoomLevel(100);
                  }}
                  className={`p-2 rounded-xl border font-bold text-center transition cursor-pointer ${
                    fitMode === "original"
                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  Gốc 100%
                </button>
              </div>
            </div>

            {/* Chapter Jump List with Volume Grouping */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Danh sách chương [{activeLanguage.toUpperCase()}] ({activeLanguageChapters.length})
              </label>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 bg-zinc-900/60 p-2 rounded-xl border border-zinc-800">
                {volumeGroupedChapters.map((grp) => (
                  <div key={grp.label} className="space-y-1">
                    {volumeGroupedChapters.length > 1 && (
                      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-2 py-1 bg-zinc-800/60 rounded-lg flex items-center justify-between">
                        <span>{grp.label}</span>
                        <span className="text-[9px] text-zinc-500 font-normal">{grp.chapters.length} chap</span>
                      </div>
                    )}
                    {grp.chapters.map((chap) => {
                      const isCurrent = chap.id === currentChapter?.id;
                      return (
                        <button
                          key={chap.id}
                          onClick={() => {
                            handleSafeGoToChapter(chap);
                            setShowSidebar(false);
                          }}
                          className={`w-full p-2 rounded-lg text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                            isCurrent
                              ? "bg-[var(--brand-orange)] text-white shadow-sm"
                              : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                          }`}
                        >
                          <span className="truncate">Ch. {chap.chapter_number} {chap.title ? `- ${chap.title}` : ""}</span>
                          <span className="text-[10px] opacity-70 shrink-0 ml-2">{chap.page_count}p</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Shortcuts Help */}
            <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">Phím tắt bàn phím</span>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] text-zinc-400">
                <div><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">←</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">A</kbd> Trang trước</div>
                <div><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">→</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">D</kbd> Trang sau</div>
                <div><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">+</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">-</kbd> Phóng to / Thu nhỏ</div>
                <div><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">0</kbd> Đặt lại zoom 100%</div>
                <div><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">F</kbd> Toàn màn hình</div>
                <div><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200">M</kbd> Ẩn/Hiện thanh bar</div>
              </div>
            </div>
          </div>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-zinc-800">
            <button
              onClick={handleExit}
              className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center justify-center space-x-2 transition cursor-pointer"
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
              className="p-1 rounded-full text-zinc-400 hover:text-white transition cursor-pointer"
              title="Trang trước"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-xs font-mono font-bold text-zinc-200">
              {readingMode === "single"
                ? `${currentPage} / ${pages.length}`
                : (() => {
                    const { firstPageNum, secondPageNum } = getDoublePagePair(currentPage, pages.length);
                    return secondPageNum
                      ? `${firstPageNum} - ${secondPageNum} / ${pages.length}`
                      : `${firstPageNum} / ${pages.length}`;
                  })()
              }
            </span>
            <button
              onClick={readingMode === "double_rtl" ? handleTurnPrev : handleTurnNext}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition cursor-pointer"
              title="Trang sau"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
      {/* Gap Warning Modal */}
      {gapWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-amber-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>

            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Phát hiện thiếu chương</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-mono font-normal">
                  Khuyết {gapWarningModal.missingCount} chap
                </span>
              </h3>
              <p className="text-xs text-zinc-300 mt-2 leading-relaxed">
                Bạn đang chuẩn bị chuyển từ <strong className="text-white">Chương {currentChapter?.chapter_number}</strong> sang <strong className="text-[var(--brand-orange)]">Chương {gapWarningModal.targetChapter.chapter_number}</strong>.
              </p>
              <div className="mt-3 p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800 text-xs text-amber-200 space-y-1">
                <div className="font-semibold text-zinc-400">Các chương chưa được tải xuống:</div>
                <div className="font-bold text-amber-300">{gapWarningModal.missingDesc}</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                onClick={() => {
                  const target = gapWarningModal.targetChapter;
                  setGapWarningModal(null);
                  goToChapter(target.id, 1);
                }}
                className="w-full sm:flex-1 py-2.5 px-4 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl shadow transition cursor-pointer"
              >
                Bỏ qua & Đọc Ch. {gapWarningModal.targetChapter.chapter_number}
              </button>
              <button
                onClick={() => {
                  setGapWarningModal(null);
                  handleExit();
                }}
                className="w-full sm:w-auto py-2.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center space-x-1"
                title="Về tab Chapters để tải các chap còn thiếu"
              >
                <Download size={13} />
                <span>Tải bổ sung</span>
              </button>
              <button
                onClick={() => setGapWarningModal(null)}
                className="w-full sm:w-auto py-2.5 px-3 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MangaDex-style Language Switch Confirmation Modal */}
      {languageSwitchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-[var(--brand-orange)]/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] flex items-center justify-center">
              <Globe size={24} />
            </div>

            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Hết chương bản [{activeLanguage.toUpperCase()}]</span>
              </h3>
              <p className="text-xs text-zinc-300 mt-2 leading-relaxed">
                Bản dịch tiếng <strong className="text-white uppercase">[{activeLanguage}]</strong> đã kết thúc ở Chương {currentChapter?.chapter_number}.
              </p>
              <p className="text-xs text-zinc-300 mt-2 leading-relaxed">
                Hệ thống nhận thấy có bản dịch tiếng <strong className="text-[var(--brand-orange)] uppercase">[{languageSwitchModal.targetChapter.language}]</strong> tiếp nối từ <strong className="text-white">Chương {languageSwitchModal.targetChapter.chapter_number}</strong>. Bạn có muốn đổi ngôn ngữ để tiếp tục đọc không?
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                onClick={() => {
                  const target = languageSwitchModal.targetChapter;
                  setLanguageSwitchModal(null);
                  handleSafeGoToChapter(target);
                }}
                className="w-full sm:flex-1 py-2.5 px-4 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl shadow transition cursor-pointer"
              >
                Đổi sang [{languageSwitchModal.targetChapter.language?.toUpperCase()}] Ch. {languageSwitchModal.targetChapter.chapter_number}
              </button>
              <button
                onClick={() => {
                  setLanguageSwitchModal(null);
                  handleExit();
                }}
                className="w-full sm:w-auto py-2.5 px-3 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Về danh sách chap
              </button>
              <button
                onClick={() => setLanguageSwitchModal(null)}
                className="w-full sm:w-auto py-2.5 px-3 border border-transparent text-zinc-500 hover:text-zinc-300 text-xs font-semibold transition cursor-pointer"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MangaReaderPage;
