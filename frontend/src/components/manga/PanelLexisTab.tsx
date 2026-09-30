import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Sparkles,
  Layers,
  Loader2,
  X,
  Zap,
} from "lucide-react";
import client, { apiUrl } from "../../api/client";
import { useAlert } from "../../hooks/useAlert";
import type { PanelResult, PanelStats, PanelScanStatus } from "../../types/panel";
import type { Chapter } from "../../types/chapter";
import { PanelCard } from "./PanelCard";
import { WordPopover } from "./WordPopover";
import { FullPageModal } from "./FullPageModal";

interface PanelLexisTabProps {
  mangaId: string;
  mangaTitle?: string;
}

export const PanelLexisTab: React.FC<PanelLexisTabProps> = ({
  mangaId,
  mangaTitle,
}) => {
  const { showAlert } = useAlert();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState<string>("all");
  const [chapters, setChapters] = useState<Chapter[]>([]);

  // Results & Stats state
  const [results, setResults] = useState<PanelResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<PanelStats | null>(null);

  // Scan Modal & Progress state
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState<PanelScanStatus | null>(null);
  const [forceRescan, setForceRescan] = useState(false);
  const [scanChapterSelection, setScanChapterSelection] = useState<string>("all");
  const sseRef = useRef<EventSource | null>(null);

  // Popover & Modal state
  const [activePopover, setActivePopover] = useState<{
    word: string;
    position: { x: number; y: number };
  } | null>(null);
  const [fullPagePanel, setFullPagePanel] = useState<PanelResult | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch initial stats and stored chapters
  const fetchStats = async () => {
    try {
      const res = await client.get(`/api/manga/${mangaId}/panels/stats`);
      setStats(res.data);
      if (res.data.is_scanning) {
        startListeningProgress();
      }
    } catch (e) {
      console.error("Error fetching panel stats:", e);
    }
  };

  const fetchChapters = async () => {
    try {
      const res = await client.get(`/api/manga/${mangaId}/chapters`);
      setChapters(res.data.chapters || []);
    } catch (e) {
      console.error("Error fetching chapters:", e);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchChapters();
    // Default search for recent panels
    performSearch("", "all");

    // Keyboard shortcut '/' to focus search
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLElement && (e.target.closest("input, textarea, select") || e.target.isContentEditable))) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (sseRef.current) sseRef.current.close();
    };
  }, [mangaId]);

  // Search logic
  const performSearch = async (q: string, chapId: string) => {
    setLoading(true);
    setActivePopover(null);
    try {
      const queryParam = q.trim() || "";
      const res = await client.get(`/api/manga/${mangaId}/panels/search`, {
        params: {
          q: queryParam,
          chapter_id: chapId === "all" ? undefined : chapId,
          limit: 36,
          offset: 0,
        },
      });
      setResults(res.data.results || []);
      setTotalResults(res.data.total || 0);
      setActiveQuery(q);
    } catch (e: any) {
      console.error("Search error:", e);
      setResults([]);
      setTotalResults(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(searchQuery, selectedChapterId);
  };

  const handleChapterFilterChange = (chapId: string) => {
    setSelectedChapterId(chapId);
    performSearch(searchQuery, chapId);
  };

  // SSE Progress Streaming
  const startListeningProgress = () => {
    if (sseRef.current) sseRef.current.close();

    const url = apiUrl(`/api/manga/${mangaId}/scan-progress`);
    const es = new EventSource(url);
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: PanelScanStatus = json_parse_safe(event.data);
        if (data) {
          setScanStatus(data);
          if (["completed", "error", "cancelled"].includes(data.stage) && !data.is_scanning) {
            es.close();
            sseRef.current = null;
            fetchStats();
            performSearch(searchQuery, selectedChapterId);
            if (data.stage === "completed") {
              showAlert({
                title: "Hoàn tất trích xuất đặc trưng",
                message: data.message || "Đã phân đoạn panel và nhận diện text thành công!",
                type: "success",
              });
            }
          }
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    es.onerror = () => {
      es.close();
      sseRef.current = null;
    };
  };

  const json_parse_safe = (str: string) => {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };

  // Trigger scan
  const handleTriggerScan = async () => {
    try {
      const payload = {
        chapter_ids: scanChapterSelection === "all" ? undefined : [scanChapterSelection],
        force_rescan: forceRescan,
      };
      await client.post(`/api/manga/${mangaId}/scan-panels`, payload);
      setIsScanModalOpen(false);
      startListeningProgress();
      showAlert({
        title: "Bắt đầu trích xuất",
        message: "Hệ thống đang chạy ngầm phân tích hình ảnh và nhận diện văn bản.",
        type: "info",
      });
      fetchStats();
    } catch (e: any) {
      showAlert({
        title: "Lỗi khởi chạy",
        message: e.response?.data?.detail || "Không thể khởi chạy tác vụ quét.",
        type: "error",
      });
    }
  };

  const handleWordClick = (word: string, event: React.MouseEvent) => {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    setActivePopover({
      word,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.bottom + window.scrollY,
      },
    });
  };

  const quickKeywords = ["demon", "devil", "chainsaw", "power", "makima", "aki", "blood", "kill"];

  return (
    <div
      className="space-y-6"
      onClick={() => setActivePopover(null)}
    >
      {/* Top Hero & Feature Header */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-amber-500/10 via-zinc-900/40 to-transparent border border-amber-500/20 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 text-xs font-bold uppercase tracking-wider">
              <Sparkles size={13} />
              <span>AI Vision & Dialogue Context • {mangaTitle || "Manga"}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]">
              Nhận diện & Tra cứu Khung tranh
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              Trích xuất đặc trưng hình ảnh bằng thuật toán phân đoạn khung hình (OpenCV Contour Segmentation) và nhận diện lời thoại (RapidOCR ONNX + spaCy). Tìm kiếm mọi phân cảnh và click vào từng từ ngữ để tra cứu từ điển tức thì.
            </p>
          </div>

          {/* Action Button & Live Progress Badge */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsScanModalOpen(true)}
              disabled={stats?.is_scanning}
              className={`px-5 py-3 rounded-2xl font-black text-sm flex items-center justify-center space-x-2.5 transition shadow-md cursor-pointer ${
                stats?.is_scanning
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse"
                  : "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 shadow-amber-500/20"
              }`}
            >
              {stats?.is_scanning ? (
                <>
                  <Loader2 size={18} className="animate-spin text-amber-400" />
                  <span>Đang quét đặc trưng ({scanStatus?.percent || 0}%)</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Quét đặc trưng & OCR</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Real-time Scan Progress Bar (if active) */}
        {stats?.is_scanning && scanStatus && (
          <div className="mt-5 p-4 rounded-2xl bg-zinc-900/90 border border-amber-500/30 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-amber-400 flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" />
                {scanStatus.message}
              </span>
              <span className="text-white font-mono">{scanStatus.percent}%</span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300 rounded-full"
                style={{ width: `${scanStatus.percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
              <span>Tiến trình: {scanStatus.current} / {scanStatus.total} trang</span>
              <span>Giai đoạn: {scanStatus.stage}</span>
            </div>
          </div>
        )}

        {/* Feature Stats Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-[var(--border-primary)]/60">
          <div className="p-3.5 rounded-2xl bg-[var(--bg-primary)]/60 border border-[var(--border-primary)]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Khung tranh (Panels)
            </div>
            <div className="text-xl sm:text-2xl font-black text-[var(--text-primary)] mt-1">
              {stats?.total_panels?.toLocaleString() || 0}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--bg-primary)]/60 border border-[var(--border-primary)]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Trang đã phân tích
            </div>
            <div className="text-xl sm:text-2xl font-black text-[var(--text-primary)] mt-1">
              {stats?.total_pages_scanned?.toLocaleString() || 0}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--bg-primary)]/60 border border-[var(--border-primary)]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Chapter hoàn tất
            </div>
            <div className="text-xl sm:text-2xl font-black text-[var(--text-primary)] mt-1">
              {stats?.total_chapters_scanned || 0} / {chapters.length}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--bg-primary)]/60 border border-[var(--border-primary)]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Từ vựng trích xuất
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-500 mt-1">
              {stats?.total_unique_words?.toLocaleString() || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Central Search Bar & Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-5 shadow-xs space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
              <Search size={18} />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm phân cảnh, lời thoại hoặc từ khóa... (VD: chainsaw, devil, run, blood)"
              className="w-full pl-10 pr-20 py-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-sm font-medium text-[var(--text-primary)] placeholder-zinc-400 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  performSearch("", selectedChapterId);
                }}
                className="absolute inset-y-0 right-10 pr-2 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-semibold text-zinc-400 bg-zinc-200 dark:bg-zinc-800 rounded border border-zinc-300 dark:border-zinc-700">
                /
              </kbd>
            </div>
          </div>

          {/* Chapter Selector Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
            <select
              value={selectedChapterId}
              onChange={(e) => handleChapterFilterChange(e.target.value)}
              className="w-full md:w-48 px-3.5 py-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] text-xs font-bold text-[var(--text-primary)] focus:border-amber-500 transition cursor-pointer"
            >
              <option value="all">Tất cả Chapters</option>
              {chapters.map((chap) => (
                <option key={chap.id} value={chap.id}>
                  Ch. {chap.chapter_number} {chap.title ? `- ${chap.title}` : ""}
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={loading}
              className="px-5 py-3 rounded-2xl bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold transition shadow-xs flex items-center space-x-2 shrink-0 cursor-pointer disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              <span>Tìm kiếm</span>
            </button>
          </div>
        </form>

        {/* Quick Suggestion Chips */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-zinc-400 shrink-0">Gợi ý từ khóa:</span>
          {quickKeywords.map((kw) => (
            <button
              key={kw}
              type="button"
              onClick={() => {
                setSearchQuery(kw);
                performSearch(kw, selectedChapterId);
              }}
              className="px-2.5 py-1 rounded-xl bg-zinc-500/10 hover:bg-amber-500/20 text-[var(--text-primary)] hover:text-amber-500 border border-[var(--border-primary)] hover:border-amber-500/40 text-[11px] font-semibold transition cursor-pointer"
            >
              {kw}
            </button>
          ))}
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium px-1">
        <div>
          {loading ? (
            <span>Đang tra cứu khung tranh...</span>
          ) : (
            <span>
              Tìm thấy <strong className="text-[var(--text-primary)] font-bold">{totalResults}</strong> panels
              {activeQuery && (
                <>
                  {" "}cho từ khóa: <strong className="text-amber-500 font-bold">"{activeQuery}"</strong>
                </>
              )}
            </span>
          )}
        </div>
        {stats?.total_panels === 0 && (
          <span className="text-amber-500 font-semibold">
            Chưa có panel nào được trích xuất. Hãy bấm "Quét đặc trưng & OCR" để phân tích manga.
          </span>
        )}
      </div>

      {/* Panels Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 size={36} className="animate-spin text-amber-500" />
          <p className="text-xs text-[var(--text-secondary)] font-medium">
            Đang tìm kiếm phân cảnh và hội thoại...
          </p>
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {results.map((panel) => (
            <PanelCard
              key={panel.panel_id}
              panel={panel}
              searchQuery={activeQuery}
              onOpenFullPage={setFullPagePanel}
              onWordClick={handleWordClick}
            />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center border-2 border-dashed border-[var(--border-primary)] rounded-3xl space-y-3 bg-[var(--bg-primary)]/40">
          <Layers size={40} className="mx-auto text-zinc-400/60" />
          <div className="text-sm font-bold text-[var(--text-primary)]">
            {stats?.total_panels === 0
              ? "Chưa có dữ liệu đặc trưng hình ảnh"
              : "Không tìm thấy panel nào phù hợp"}
          </div>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            {stats?.total_panels === 0
              ? "Hãy bấm 'Quét đặc trưng & OCR' ở góc trên để hệ thống tự động bóc tách từng khung tranh và nhận diện lời thoại."
              : "Thử tìm kiếm với từ khóa khác, hoặc chọn 'Tất cả Chapters' để mở rộng phạm vi tìm kiếm."}
          </p>
          {stats?.total_panels === 0 && (
            <button
              type="button"
              onClick={() => setIsScanModalOpen(true)}
              className="mt-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            >
              <Sparkles size={14} />
              <span>Quét ngay bây giờ</span>
            </button>
          )}
        </div>
      )}

      {/* Scan Configuration Modal */}
      {isScanModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsScanModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-primary)]/60 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text-primary)]">
                    Quét đặc trưng & OCR
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Phân đoạn panel và nhận diện lời thoại
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsScanModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scope Selection */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-[var(--text-primary)] block">
                Phạm vi quét:
              </label>
              <select
                value={scanChapterSelection}
                onChange={(e) => setScanChapterSelection(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-primary)] text-xs font-bold text-[var(--text-primary)] focus:border-amber-500 transition cursor-pointer"
              >
                <option value="all">Toàn bộ {chapters.length} chapter đã tải</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    Ch. {c.chapter_number} ({c.page_count || c.pages?.length || 0} trang)
                  </option>
                ))}
              </select>

              {/* Force Rescan Checkbox */}
              <div className="pt-2">
                <label className="flex items-start space-x-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={forceRescan}
                    onChange={(e) => setForceRescan(e.target.checked)}
                    className="mt-0.5 rounded border-[var(--border-primary)] text-amber-500 focus:ring-amber-500/20"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-[var(--text-primary)] block">
                      Quét lại toàn bộ (Force Rescan)
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Bỏ qua cache và phân tích lại tất cả các trang, ghi đè các panel đã trích xuất trước đó.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Notice */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Zap size={13} />
                <span>Hiệu năng cao & Không block Server</span>
              </div>
              <p>
                Tác vụ sẽ chạy ngầm bằng ONNX Runtime và giải phóng event loop hoàn toàn. Bạn có thể tiếp tục sử dụng hệ thống bình thường trong khi quá trình đang diễn ra.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsScanModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[var(--border-primary)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleTriggerScan}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
              >
                <Sparkles size={14} />
                <span>Bắt đầu quét</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Word Popover */}
      {activePopover && (
        <WordPopover
          word={activePopover.word}
          position={activePopover.position}
          onClose={() => setActivePopover(null)}
        />
      )}

      {/* Full Page Modal with Golden Focus Frame */}
      {fullPagePanel && (
        <FullPageModal key={fullPagePanel?.panel_id}
          panel={fullPagePanel}
          onClose={() => setFullPagePanel(null)}
        />
      )}
    </div>
  );
};

export default PanelLexisTab;
