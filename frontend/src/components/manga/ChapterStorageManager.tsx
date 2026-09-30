import React, { useState, useEffect, useMemo } from "react";
import {
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Trash2,
  Upload,
  Copy,
  Search,
  Eye,
  CheckSquare,
  Square,
  AlertTriangle,
  RefreshCw,
  X,
  Layers,
  Check,
  Loader2,
  Zap,
  Clock,
  Terminal,
  CheckCircle2,
  Activity,
  Sparkles,
  Globe,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
  Maximize2,
  Plus,
  Minus
} from "lucide-react";
import client from "../../api/client";
import type {
  Chapter,
  PageItem,
  DetectedChapter,
  FolderScanResponse,
  StorageDuplicateGroup
} from "../../types/chapter";

interface ImportLogItem {
  id: string;
  time: string;
  text: string;
  type: "info" | "success" | "warn" | "error";
}

interface ImportStreamProgress {
  status: "idle" | "running" | "completed" | "error";
  totalChapters: number;
  currentChapterNumber: string;
  currentChapterTitle: string;
  currentChapterIndex: number;
  remainingChapters: number;
  currentPageNumber: number;
  currentChapterPageCount: number;
  totalPagesDone: number;
  totalPagesOverall: number;
  remainingPages: number;
  currentFilename: string;
  currentFileSize: number;
  totalBytesUploaded: number;
  speedPagesPerSec: number;
  speedMbPerSec: number;
  elapsedSeconds: number;
  etaSeconds: number;
  overallPercent: number;
  previewBase64: string | null;
  logs: ImportLogItem[];
  summary?: {
    importedChapters: number;
    totalPagesImported: number;
    skippedChapters: number;
    totalBytesUploaded: number;
    elapsedSeconds: number;
    errors: Array<{ folder: string; error: string }>;
  };
}

const formatBytes = (bytes: number, decimals = 1) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

const formatSeconds = (sec: number) => {
  if (!sec || isNaN(sec) || sec <= 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

interface ChapterStorageManagerProps {
  mangaId: string;
  mangaTitle: string;
  onOpenReader: (chapterId: string, pageNumber?: number) => void;
  onRefreshChapters?: () => void;
  onChaptersCountChange?: (count: number) => void;
}

export const ChapterStorageManager: React.FC<ChapterStorageManagerProps> = ({
  mangaId,
  mangaTitle,
  onOpenReader,
  onRefreshChapters,
  onChaptersCountChange
}) => {
  // State
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [activeChapterPages, setActiveChapterPages] = useState<PageItem[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);

  // View & Filter states
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");

  // Selection states (for Ctrl+click, Shift+click)
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [lastSelectedChapterId, setLastSelectedChapterId] = useState<string | null>(null);
  const [selectedPageNumbers, setSelectedPageNumbers] = useState<number[]>([]);
  const [lastSelectedPageNumber, setLastSelectedPageNumber] = useState<number | null>(null);

  // Lightbox Preview states (Issue 4)
  const [previewPageIndex, setPreviewPageIndex] = useState<number | null>(null);
  const [previewZoom, setPreviewZoom] = useState<number>(100);

  // Volume grouping (Issue 6)
  const [groupByVolume, setGroupByVolume] = useState<boolean>(true);
  const [collapsedVolumes, setCollapsedVolumes] = useState<Record<string, boolean>>({});

  const toggleVolumeCollapse = (volKey: string) => {
    setCollapsedVolumes((prev) => ({
      ...prev,
      [volKey]: !prev[volKey]
    }));
  };

  // Pagination states for Chapter Storage
  const [chapterPageSize, setChapterPageSize] = useState<number | "all">(() => {
    const saved = localStorage.getItem("chapter_storage_page_size");
    if (saved === "all") return "all";
    const num = Number(saved);
    return [12, 24, 48, 96, 120].includes(num) ? num : 24;
  });
  const [chapterCurrentPage, setChapterCurrentPage] = useState<number>(1);
  const [jumpPageInput, setJumpPageInput] = useState<string>("");
  const chapterListTopRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("chapter_storage_page_size", String(chapterPageSize));
  }, [chapterPageSize]);

  // Reset to page 1 on filter, search, or page size change
  useEffect(() => {
    setChapterCurrentPage(1);
  }, [searchQuery, selectedLanguage, selectedGroup, chapterPageSize]);

  // Keyboard navigation for Lightbox Preview
  useEffect(() => {
    if (previewPageIndex === null) return;
    const handleLightboxKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setPreviewPageIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
      } else if (e.key === "ArrowRight") {
        setPreviewPageIndex((prev) =>
          prev !== null && prev < activeChapterPages.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "Escape") {
        setPreviewPageIndex(null);
      } else if (e.key === "+" || e.key === "=") {
        setPreviewZoom((prev) => Math.min(300, prev + 15));
      } else if (e.key === "-" || e.key === "_") {
        setPreviewZoom((prev) => Math.max(30, prev - 15));
      } else if (e.key === "0") {
        setPreviewZoom(100);
      }
    };
    window.addEventListener("keydown", handleLightboxKey);
    return () => window.removeEventListener("keydown", handleLightboxKey);
  }, [previewPageIndex, activeChapterPages.length]);

  // Delete Confirm Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Duplicate Scanner Modal
  const [isDupModalOpen, setIsDupModalOpen] = useState(false);
  const [scanningDups, setScanningDups] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<StorageDuplicateGroup[]>([]);
  const [selectedDupKeys, setSelectedDupKeys] = useState<string[]>([]);
  const [cleaningDups, setCleaningDups] = useState(false);

  // Local Folder Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFolderPath, setImportFolderPath] = useState("");
  const [scanningFolder, setScanningFolder] = useState(false);
  const [scanResult, setScanResult] = useState<FolderScanResponse | null>(null);
  const [selectedImportFolders, setSelectedImportFolders] = useState<string[]>([]);
  const [conflictStrategy, setConflictStrategy] = useState<"skip" | "overwrite" | "keep_both">("skip");
  const [importLang, setImportLang] = useState("en");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportStreamProgress | null>(null);
  const logsEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (importProgress?.logs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [importProgress?.logs]);

  // Fetch chapters
  const fetchChapters = async () => {
    setLoading(true);
    try {
      const res = await client.get(`/api/manga/${mangaId}/chapters`);
      const chaps = res.data.chapters || [];
      setChapters(chaps);
      if (onChaptersCountChange) onChaptersCountChange(chaps.length);
      if (onRefreshChapters) onRefreshChapters();
    } catch (err) {
      console.error("Error fetching chapters:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChapters();
  }, [mangaId]);

  // Open Chapter to view pages
  const handleOpenChapter = async (chap: Chapter) => {
    setActiveChapter(chap);
    setSelectedPageNumbers([]);
    setLoadingPages(true);
    try {
      const res = await client.get(`/api/chapters/${chap.id}`);
      setActiveChapterPages(res.data.pages || []);
    } catch (err) {
      console.error("Error loading chapter pages:", err);
    } finally {
      setLoadingPages(false);
    }
  };

  // Back to Chapters overview
  const handleBackToChapters = () => {
    setActiveChapter(null);
    setActiveChapterPages([]);
    setSelectedPageNumbers([]);
  };

  // Unique languages & groups
  const availableLanguages = useMemo(() => {
    const set = new Set<string>();
    chapters.forEach((c) => {
      if (c.language) set.add(c.language.toLowerCase());
    });
    return Array.from(set);
  }, [chapters]);

  const availableGroups = useMemo(() => {
    const set = new Set<string>();
    chapters.forEach((c) => {
      if (c.scanlation_group) set.add(c.scanlation_group);
    });
    return Array.from(set);
  }, [chapters]);

  // Filtered chapters
  const filteredChapters = useMemo(() => {
    return chapters.filter((c) => {
      if (selectedLanguage !== "all" && c.language?.toLowerCase() !== selectedLanguage) {
        return false;
      }
      if (selectedGroup !== "all" && c.scanlation_group !== selectedGroup) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchNum = c.chapter_number.toLowerCase().includes(query);
        const matchTitle = (c.title || "").toLowerCase().includes(query);
        if (!matchNum && !matchTitle) return false;
      }
      return true;
    });
  }, [chapters, selectedLanguage, selectedGroup, searchQuery]);

  // Pagination metrics & slices
  const totalFilteredCount = filteredChapters.length;
  const effectivePageSize =
    chapterPageSize === "all" ? totalFilteredCount || 1 : Number(chapterPageSize);
  const totalPages =
    chapterPageSize === "all" ? 1 : Math.max(1, Math.ceil(totalFilteredCount / effectivePageSize));

  useEffect(() => {
    if (chapterCurrentPage > totalPages && totalPages > 0) {
      setChapterCurrentPage(totalPages);
    }
  }, [totalPages, chapterCurrentPage]);

  const startIndex =
    chapterPageSize === "all" ? 0 : (chapterCurrentPage - 1) * effectivePageSize;
  const endIndex =
    chapterPageSize === "all"
      ? totalFilteredCount
      : Math.min(totalFilteredCount, startIndex + effectivePageSize);

  const paginatedChapters = useMemo(() => {
    if (chapterPageSize === "all") return filteredChapters;
    return filteredChapters.slice(startIndex, endIndex);
  }, [filteredChapters, chapterPageSize, startIndex, endIndex]);

  const handlePageChange = (newPage: number) => {
    const clamped = Math.max(1, Math.min(newPage, totalPages));
    setChapterCurrentPage(clamped);
    chapterListTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpPageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      handlePageChange(pageNum);
      setJumpPageInput("");
    }
  };

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "ellipsis")[] = [];
    if (chapterCurrentPage <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push("ellipsis");
      pages.push(totalPages);
    } else if (chapterCurrentPage >= totalPages - 3) {
      pages.push(1);
      pages.push("ellipsis");
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push("ellipsis");
      pages.push(chapterCurrentPage - 1);
      pages.push(chapterCurrentPage);
      pages.push(chapterCurrentPage + 1);
      pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };

  // Group chapters by Volume for current view (Issue 6 - MangaDex style)
  interface VolumeGroup {
    volume: string | null;
    label: string;
    chapters: Chapter[];
    minChapter: string;
    maxChapter: string;
  }

  const paginatedVolumeGroups = useMemo<VolumeGroup[]>(() => {
    const map = new Map<string, Chapter[]>();
    const order: string[] = [];

    paginatedChapters.forEach((c) => {
      const volKey = c.volume ? `Volume ${c.volume}` : "Khác / Chưa phân Vol";
      if (!map.has(volKey)) {
        map.set(volKey, []);
        order.push(volKey);
      }
      map.get(volKey)!.push(c);
    });

    return order.map((volKey) => {
      const chaps = map.get(volKey)!;
      const minChap = chaps[0]?.chapter_number || "";
      const maxChap = chaps[chaps.length - 1]?.chapter_number || "";
      return {
        volume: volKey.startsWith("Volume ") ? volKey.replace("Volume ", "") : null,
        label: volKey,
        chapters: chaps,
        minChapter: minChap,
        maxChapter: maxChap
      };
    });
  }, [paginatedChapters]);

  const hasAnyVolume = useMemo(() => {
    return chapters.some((c) => c.volume !== null && c.volume !== undefined && c.volume !== "");
  }, [chapters]);

  // Multi-selection for Chapters (Ctrl+Click, Shift+Click)
  const handleChapterSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (e.shiftKey && lastSelectedChapterId) {
      // Range selection within current paginated chapters, or fallback to filtered
      const pageIds = paginatedChapters.map((c) => c.id);
      const isBothInPage =
        pageIds.includes(lastSelectedChapterId) && pageIds.includes(id);
      const ids = isBothInPage ? pageIds : filteredChapters.map((c) => c.id);
      const startIndex = ids.indexOf(lastSelectedChapterId);
      const endIndex = ids.indexOf(id);

      if (startIndex !== -1 && endIndex !== -1) {
        const [low, high] =
          startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const range = ids.slice(low, high + 1);
        const newSet = new Set(selectedChapterIds);
        range.forEach((r) => newSet.add(r));
        setSelectedChapterIds(Array.from(newSet));
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      // Toggle
      setSelectedChapterIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
      setLastSelectedChapterId(id);
      return;
    }

    // Single click select / toggle if clicked directly on checkbox
    setSelectedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    setLastSelectedChapterId(id);
  };

  const isCurrentPageAllSelected = useMemo(() => {
    if (paginatedChapters.length === 0) return false;
    return paginatedChapters.every((c) => selectedChapterIds.includes(c.id));
  }, [paginatedChapters, selectedChapterIds]);

  const isCurrentPageSomeSelected = useMemo(() => {
    return paginatedChapters.some((c) => selectedChapterIds.includes(c.id));
  }, [paginatedChapters, selectedChapterIds]);

  const handleToggleCurrentPageChapters = () => {
    const pageIds = paginatedChapters.map((c) => c.id);
    if (isCurrentPageAllSelected) {
      setSelectedChapterIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      const newSet = new Set([...selectedChapterIds, ...pageIds]);
      setSelectedChapterIds(Array.from(newSet));
    }
  };

  const handleSelectAllChapters = () => {
    if (selectedChapterIds.length === filteredChapters.length) {
      setSelectedChapterIds([]);
    } else {
      setSelectedChapterIds(filteredChapters.map((c) => c.id));
    }
  };

  const handleDeselectAllChapters = () => {
    setSelectedChapterIds([]);
    setLastSelectedChapterId(null);
  };

  const handleSelectVolume = (volChapters: Chapter[]) => {
    const volIds = volChapters.map((c) => c.id);
    const allSelected = volIds.every((id) => selectedChapterIds.includes(id));
    if (allSelected) {
      setSelectedChapterIds((prev) => prev.filter((id) => !volIds.includes(id)));
    } else {
      const newSet = new Set([...selectedChapterIds, ...volIds]);
      setSelectedChapterIds(Array.from(newSet));
    }
  };

  // Multi-selection for Pages (Ctrl+Click, Shift+Click)
  const handlePageSelect = (
    pageNum: number,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();

    if (e.shiftKey && lastSelectedPageNumber !== null) {
      const nums = activeChapterPages.map((p) => p.page_number);
      const startIndex = nums.indexOf(lastSelectedPageNumber);
      const endIndex = nums.indexOf(pageNum);

      if (startIndex !== -1 && endIndex !== -1) {
        const [low, high] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const range = nums.slice(low, high + 1);
        const newSet = new Set(selectedPageNumbers);
        range.forEach((r) => newSet.add(r));
        setSelectedPageNumbers(Array.from(newSet));
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      setSelectedPageNumbers((prev) =>
        prev.includes(pageNum) ? prev.filter((item) => item !== pageNum) : [...prev, pageNum]
      );
      setLastSelectedPageNumber(pageNum);
      return;
    }

    setSelectedPageNumbers((prev) =>
      prev.includes(pageNum) ? prev.filter((item) => item !== pageNum) : [...prev, pageNum]
    );
    setLastSelectedPageNumber(pageNum);
  };

  const handleSelectAllPages = () => {
    if (selectedPageNumbers.length === activeChapterPages.length) {
      setSelectedPageNumbers([]);
    } else {
      setSelectedPageNumbers(activeChapterPages.map((p) => p.page_number));
    }
  };

  const handleDeselectAllPages = () => {
    setSelectedPageNumbers([]);
    setLastSelectedPageNumber(null);
  };



  // Deletion execution
  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      if (activeChapter) {
        // Delete selected pages from active chapter
        if (selectedPageNumbers.length > 0) {
          await client.post(`/api/chapters/${activeChapter.id}/delete-pages`, {
            page_numbers: selectedPageNumbers
          });
          // Refresh active chapter
          const res = await client.get(`/api/chapters/${activeChapter.id}`);
          setActiveChapterPages(res.data.pages || []);
          setSelectedPageNumbers([]);
          fetchChapters();
        }
      } else {
        // Delete selected chapters
        for (const chapId of selectedChapterIds) {
          await client.delete(`/api/chapters/${chapId}`);
        }
        setSelectedChapterIds([]);
        fetchChapters();
      }
      setIsDeleteModalOpen(false);
    } catch (err) {
      console.error("Error during deletion:", err);
      alert("Error occurred while deleting items. Check server logs.");
    } finally {
      setDeleting(false);
    }
  };

  // Duplicate Scanner
  const handleOpenDuplicateScanner = async () => {
    setIsDupModalOpen(true);
    setScanningDups(true);
    try {
      const endpoint = activeChapter
        ? `/api/manga/${mangaId}/storage-duplicates?chapter_id=${activeChapter.id}`
        : `/api/manga/${mangaId}/storage-duplicates`;
      const res = await client.get(endpoint);
      setDuplicateGroups(res.data || []);

      // Auto-select duplicate copies (all except the first one in each group)
      const keysToSelect: string[] = [];
      (res.data || []).forEach((group: StorageDuplicateGroup) => {
        if (group.items.length > 1) {
          // Keep first, select others
          for (let i = 1; i < group.items.length; i++) {
            keysToSelect.push(group.items[i].object_key);
          }
        }
      });
      setSelectedDupKeys(keysToSelect);
    } catch (err) {
      console.error("Error scanning duplicates:", err);
    } finally {
      setScanningDups(false);
    }
  };

  const handleCleanupDuplicates = async () => {
    if (selectedDupKeys.length === 0) return;
    setCleaningDups(true);
    try {
      await client.post(`/api/manga/${mangaId}/storage-duplicates/cleanup`, {
        object_keys: selectedDupKeys
      });
      alert(`Đã dọn dẹp thành công ${selectedDupKeys.length} ảnh trùng lặp!`);
      setIsDupModalOpen(false);
      setSelectedDupKeys([]);
      fetchChapters();
      if (activeChapter) {
        handleOpenChapter(activeChapter);
      }
    } catch (err) {
      console.error("Error cleaning up duplicates:", err);
      alert("Lỗi khi xóa ảnh trùng lặp.");
    } finally {
      setCleaningDups(false);
    }
  };

  // Folder Import Scanner
  const handleScanFolder = async () => {
    if (!importFolderPath.trim()) return;
    setScanningFolder(true);
    setScanResult(null);
    setImportMessage(null);
    try {
      const res = await client.post(`/api/manga/${mangaId}/scan-folder`, {
        folder_path: importFolderPath.trim()
      });
      setScanResult(res.data);
      if (res.data.detected_chapters) {
        // By default select all non-duplicate or all chapters
        setSelectedImportFolders(res.data.detected_chapters.map((c: DetectedChapter) => c.folder_name));
      }
    } catch (err: any) {
      console.error("Error scanning local folder:", err);
      alert(err.response?.data?.detail || "Không thể quét thư mục này. Kiểm tra đường dẫn.");
    } finally {
      setScanningFolder(false);
    }
  };

  const handleResetImportModal = () => {
    setIsImportModalOpen(false);
    setScanResult(null);
    setImportFolderPath("");
    setImportProgress(null);
    setImportMessage(null);
  };

  const handleExecuteImport = async () => {
    if (!scanResult || selectedImportFolders.length === 0) return;
    setImporting(true);
    setImportMessage(null);

    const initialTotalPages = scanResult.detected_chapters
      .filter((c) => selectedImportFolders.includes(c.folder_name))
      .reduce((sum, c) => sum + c.page_count, 0);

    const initialProgress: ImportStreamProgress = {
      status: "running",
      totalChapters: selectedImportFolders.length,
      currentChapterNumber: "",
      currentChapterTitle: "",
      currentChapterIndex: 0,
      remainingChapters: selectedImportFolders.length,
      currentPageNumber: 0,
      currentChapterPageCount: 0,
      totalPagesDone: 0,
      totalPagesOverall: initialTotalPages,
      remainingPages: initialTotalPages,
      currentFilename: "",
      currentFileSize: 0,
      totalBytesUploaded: 0,
      speedPagesPerSec: 0,
      speedMbPerSec: 0,
      elapsedSeconds: 0,
      etaSeconds: 0,
      overallPercent: 0,
      previewBase64: null,
      logs: [
        {
          id: `init-${Date.now()}`,
          time: new Date().toLocaleTimeString(),
          text: `Khởi tạo tiến trình nhập ${selectedImportFolders.length} chapters (${initialTotalPages} trang) vào MinIO Storage...`,
          type: "info"
        }
      ]
    };
    setImportProgress(initialProgress);

    try {
      const response = await fetch(`/api/manga/${mangaId}/import-folder-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder_path: importFolderPath.trim(),
          conflict_strategy: conflictStrategy,
          default_language: importLang,
          selected_folders: selectedImportFolders
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const trimmed = block.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, "");
          try {
            const ev = JSON.parse(jsonStr);
            const nowTime = new Date().toLocaleTimeString();

            if (ev.type === "init") {
              setImportProgress((prev) =>
                prev
                  ? {
                      ...prev,
                      totalChapters: ev.total_chapters,
                      totalPagesOverall: ev.total_pages,
                      remainingPages: ev.total_pages
                    }
                  : null
              );
            } else if (ev.type === "chapter_start") {
              setImportProgress((prev) => {
                if (!prev) return null;
                const newLogs: ImportLogItem[] = [
                  ...prev.logs,
                  {
                    id: `chap-start-${ev.chapter_number}-${Date.now()}`,
                    time: nowTime,
                    text: `Bắt đầu Chapter ${ev.chapter_number}${ev.chapter_title ? ` - ${ev.chapter_title}` : ""} (${ev.chapter_page_count} trang)...`,
                    type: "info"
                  }
                ];
                return {
                  ...prev,
                  currentChapterNumber: ev.chapter_number,
                  currentChapterTitle: ev.chapter_title || "",
                  currentChapterIndex: ev.chapter_index,
                  currentChapterPageCount: ev.chapter_page_count,
                  remainingChapters: Math.max(0, ev.total_chapters - ev.chapter_index),
                  logs: newLogs.slice(-150)
                };
              });
            } else if (ev.type === "page_progress") {
              setImportProgress((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  currentChapterNumber: ev.chapter_number,
                  currentChapterTitle: ev.chapter_title || prev.currentChapterTitle,
                  currentChapterIndex: ev.chapter_index,
                  totalChapters: ev.total_chapters,
                  remainingChapters: ev.remaining_chapters ?? Math.max(0, ev.total_chapters - ev.chapter_index),
                  currentPageNumber: ev.page_number,
                  currentChapterPageCount: ev.chapter_page_count,
                  totalPagesDone: ev.total_pages_done,
                  totalPagesOverall: ev.total_pages_overall,
                  remainingPages: ev.remaining_pages ?? Math.max(0, ev.total_pages_overall - ev.total_pages_done),
                  currentFilename: ev.filename,
                  currentFileSize: ev.file_size,
                  totalBytesUploaded: ev.total_bytes_uploaded ?? prev.totalBytesUploaded,
                  speedPagesPerSec: ev.speed_pages_per_sec,
                  speedMbPerSec: ev.speed_mb_per_sec,
                  elapsedSeconds: ev.elapsed_seconds,
                  etaSeconds: ev.eta_seconds,
                  overallPercent: ev.percent,
                  previewBase64: ev.preview_base64 || prev.previewBase64
                };
              });
            } else if (ev.type === "chapter_done") {
              setImportProgress((prev) => {
                if (!prev) return null;
                const newLogs: ImportLogItem[] = [
                  ...prev.logs,
                  {
                    id: `chap-done-${ev.chapter_number}-${Date.now()}`,
                    time: nowTime,
                    text: `✓ Hoàn thành Chapter ${ev.chapter_number} (${ev.page_count} trang đã lưu vào MinIO)`,
                    type: "success"
                  }
                ];
                return {
                  ...prev,
                  logs: newLogs.slice(-150)
                };
              });
            } else if (ev.type === "chapter_skipped") {
              setImportProgress((prev) => {
                if (!prev) return null;
                const newLogs: ImportLogItem[] = [
                  ...prev.logs,
                  {
                    id: `chap-skip-${ev.chapter_number}-${Date.now()}`,
                    time: nowTime,
                    text: `⏭️ Bỏ qua Chapter ${ev.chapter_number} (${ev.reason})`,
                    type: "warn"
                  }
                ];
                return {
                  ...prev,
                  logs: newLogs.slice(-150)
                };
              });
            } else if (ev.type === "chapter_error") {
              setImportProgress((prev) => {
                if (!prev) return null;
                const newLogs: ImportLogItem[] = [
                  ...prev.logs,
                  {
                    id: `chap-err-${ev.chapter_number}-${Date.now()}`,
                    time: nowTime,
                    text: `❌ Lỗi Chapter ${ev.chapter_number}: ${ev.error}`,
                    type: "error"
                  }
                ];
                return {
                  ...prev,
                  logs: newLogs.slice(-150)
                };
              });
            } else if (ev.type === "complete") {
              setImportProgress((prev) => {
                if (!prev) return null;
                const newLogs: ImportLogItem[] = [
                  ...prev.logs,
                  {
                    id: `complete-${Date.now()}`,
                    time: nowTime,
                    text: `🎉 Tất cả đã hoàn tất! Đã nhập ${ev.imported_chapters} chapter (${ev.total_pages_imported} trang) trong ${ev.elapsed_seconds}s.`,
                    type: "success"
                  }
                ];
                return {
                  ...prev,
                  status: "completed",
                  overallPercent: 100,
                  summary: {
                    importedChapters: ev.imported_chapters,
                    totalPagesImported: ev.total_pages_imported,
                    skippedChapters: ev.skipped_chapters,
                    totalBytesUploaded: ev.total_bytes_uploaded,
                    elapsedSeconds: ev.elapsed_seconds,
                    errors: ev.errors || []
                  },
                  logs: newLogs.slice(-150)
                };
              });
              fetchChapters();
            } else if (ev.type === "error") {
              setImportProgress((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  status: "error",
                  logs: [
                    ...prev.logs,
                    {
                      id: `err-${Date.now()}`,
                      time: nowTime,
                      text: `Lỗi: ${ev.error}`,
                      type: "error"
                    }
                  ]
                };
              });
            }
          } catch (pe) {
            console.error("Error parsing SSE JSON event:", pe);
          }
        }
      }
    } catch (err: any) {
      console.error("Stream import failed:", err);
      setImportProgress((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              logs: [
                ...prev.logs,
                {
                  id: `fetch-err-${Date.now()}`,
                  time: new Date().toLocaleTimeString(),
                  text: `Lỗi kết nối stream: ${err.message}`,
                  type: "error"
                }
              ]
            }
          : null
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-sm space-y-6">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-primary)]">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-[var(--text-secondary)]">
            <button
              onClick={handleBackToChapters}
              className={`hover:text-[var(--brand-orange)] transition flex items-center space-x-1 ${
                !activeChapter ? "text-[var(--brand-orange)] font-bold" : ""
              }`}
            >
              <Folder size={14} className="shrink-0" />
              <span>Storage</span>
            </button>
            <span>/</span>
            <span className="truncate max-w-[200px]">{mangaTitle}</span>
            {activeChapter && (
              <>
                <span>/</span>
                <span className="text-[var(--brand-orange)] font-bold truncate max-w-[200px]">
                  Ch. {activeChapter.chapter_number} {activeChapter.title ? `- ${activeChapter.title}` : ""}
                </span>
              </>
            )}
          </div>
          <h3 className="text-xl font-black text-[var(--text-primary)] mt-1 flex items-center space-x-2.5">
            <Layers className="text-[var(--brand-orange)]" size={22} />
            <span>
              {activeChapter
                ? `Chapter ${activeChapter.chapter_number} Pages (${activeChapterPages.length})`
                : `Storage & Chapter Manager (${chapters.length})`}
            </span>
          </h3>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={fetchChapters}
            title="Refresh Storage"
            className="p-2.5 rounded-xl border border-[var(--border-primary)] hover:border-zinc-400 bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition shadow-sm"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>

          <button
            onClick={handleOpenDuplicateScanner}
            title="Scan for duplicate images in storage"
            className="px-3.5 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center space-x-2 transition shadow-sm"
          >
            <Copy size={15} />
            <span>Quét ảnh trùng (Duplicates)</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            title="Import chapters from a local folder on your PC"
            className="px-3.5 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center space-x-2 transition shadow-sm"
          >
            <Upload size={15} />
            <span>Import từ Folder</span>
          </button>
        </div>
      </div>

      {/* Chapter Overview View */}
      {!activeChapter ? (
        <div className="space-y-4">
          {/* Controls: Search, Filters, Selection status */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Tìm theo số chap, title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-orange)] transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Language Filter */}
              {availableLanguages.length > 0 && (
                <div className="flex items-center gap-1 p-1 bg-zinc-500/10 rounded-xl border border-[var(--border-primary)] shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedLanguage("all")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      selectedLanguage === "all"
                        ? "bg-[var(--brand-orange)] text-white shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <Globe size={12} />
                    <span>Tất cả</span>
                    <span className="text-[10px] opacity-80">({chapters.length})</span>
                  </button>
                  {availableLanguages.map((l) => {
                    const count = chapters.filter(c => (c.language || "en").toLowerCase() === l.toLowerCase()).length;
                    const isSelected = selectedLanguage === l.toLowerCase();
                    const label = l.toLowerCase() === "vi" ? "VI (Tiếng Việt)" : l.toLowerCase() === "en" ? "EN (English)" : l.toUpperCase();
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setSelectedLanguage(l.toLowerCase())}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? "bg-blue-600 text-white shadow-xs"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-zinc-500/10"
                        }`}
                      >
                        <span>{label}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? "bg-white/25 text-white" : "bg-zinc-500/20 text-zinc-400"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {availableGroups.length > 1 && (
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-xs font-semibold text-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-orange)]"
                >
                  <option value="all">Tất cả nhóm dịch</option>
                  {availableGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Selection actions & View Switcher */}
            <div className="flex items-center flex-wrap gap-2">
              {/* Select Current Page Chapters */}
              <button
                type="button"
                onClick={handleToggleCurrentPageChapters}
                className="px-3 py-1.5 rounded-xl border border-[var(--border-primary)] hover:border-zinc-400 text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1.5 transition cursor-pointer"
                title="Chọn / Bỏ chọn toàn bộ các chapter hiển thị trên trang này"
              >
                {isCurrentPageAllSelected ? (
                  <CheckSquare size={14} className="text-[var(--brand-orange)]" />
                ) : isCurrentPageSomeSelected ? (
                  <CheckSquare size={14} className="text-zinc-400" />
                ) : (
                  <Square size={14} />
                )}
                <span>
                  Chọn trang này ({paginatedChapters.filter((c) => selectedChapterIds.includes(c.id)).length}/
                  {paginatedChapters.length})
                </span>
              </button>

              {/* Select All Filtered Chapters across all pages */}
              {totalFilteredCount > paginatedChapters.length && (
                <button
                  type="button"
                  onClick={handleSelectAllChapters}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5 ${
                    selectedChapterIds.length === totalFilteredCount
                      ? "bg-[var(--brand-orange)] text-white border-[var(--brand-orange)]"
                      : "border-[var(--border-primary)] hover:border-zinc-400 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                  title="Chọn toàn bộ chapters trong danh sách đã lọc"
                >
                  <CheckSquare size={14} />
                  <span>
                    Chọn toàn bộ ({selectedChapterIds.length}/{totalFilteredCount})
                  </span>
                </button>
              )}

              {selectedChapterIds.length > 0 && (
                <>
                  <button
                    onClick={handleDeselectAllChapters}
                    className="px-3 py-1.5 rounded-xl border border-[var(--border-primary)] hover:border-zinc-400 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center space-x-1.5 transition cursor-pointer"
                    title="Bỏ chọn toàn bộ chapters đang chọn"
                  >
                    <X size={14} />
                    <span>Bỏ chọn ({selectedChapterIds.length})</span>
                  </button>

                  <button
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center space-x-1.5 transition shadow-sm animate-in fade-in cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Xóa đã chọn ({selectedChapterIds.length})</span>
                  </button>
                </>
              )}

              {hasAnyVolume && (
                <button
                  type="button"
                  onClick={() => setGroupByVolume(!groupByVolume)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    groupByVolume
                      ? "bg-[var(--brand-orange)]/15 border-[var(--brand-orange)] text-[var(--brand-orange)]"
                      : "border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                  title="Bật/Tắt phân nhóm theo Volume như MangaDex"
                >
                  <Layers size={14} />
                  <span>Nhóm Vol: {groupByVolume ? "BẬT" : "TẮT"}</span>
                </button>
              )}

              <div className="flex items-center border border-[var(--border-primary)] rounded-xl overflow-hidden p-0.5 bg-[var(--bg-primary)]">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    viewMode === "grid"
                      ? "bg-[var(--brand-orange)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    viewMode === "list"
                      ? "bg-[var(--brand-orange)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  List
                </button>
              </div>
            </div>
          </div>

          {/* Sub-bar: Status and Top Pagination Controls */}
          {totalFilteredCount > 0 && (
            <div
              ref={chapterListTopRef}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 pb-1 border-t border-[var(--border-primary)]/60 text-xs"
            >
              {/* Left: Summary Info */}
              <div className="flex items-center space-x-2 text-[var(--text-secondary)] font-medium flex-wrap">
                <span>
                  Hiển thị{" "}
                  <strong className="text-[var(--text-primary)] font-bold">
                    {totalFilteredCount === 0 ? 0 : `${startIndex + 1} - ${endIndex}`}
                  </strong>{" "}
                  /{" "}
                  <strong className="text-[var(--text-primary)] font-bold">
                    {totalFilteredCount}
                  </strong>{" "}
                  chapter
                </span>
                {filteredChapters.length !== chapters.length && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400">
                    (Lọc từ {chapters.length})
                  </span>
                )}
                {totalPages > 1 && (
                  <span className="text-[11px] text-[var(--brand-orange)] font-bold bg-[var(--brand-orange)]/10 px-2 py-0.5 rounded-full">
                    Trang {chapterCurrentPage} / {totalPages}
                  </span>
                )}
              </div>

              {/* Right: Page Size Selector & Mini Navigation */}
              <div className="flex items-center space-x-3 shrink-0 flex-wrap">
                {/* Page Size Selector Pills */}
                <div className="flex items-center space-x-1.5">
                  <SlidersHorizontal size={13} className="text-zinc-400 shrink-0" />
                  <span className="text-[11px] font-semibold text-zinc-400 hidden md:inline">
                    Mỗi trang:
                  </span>
                  <div className="flex items-center bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-0.5 font-bold">
                    {[12, 24, 48, 96, 120, "all"].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => {
                          setChapterPageSize(size as any);
                          setChapterCurrentPage(1);
                        }}
                        className={`px-2 py-0.5 rounded-lg transition cursor-pointer text-[11px] ${
                          chapterPageSize === size
                            ? "bg-[var(--brand-orange)] text-white shadow-xs"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                        title={
                          size === "all"
                            ? "Hiển thị toàn bộ"
                            : `Hiển thị ${size} chương mỗi trang`
                        }
                      >
                        {size === "all" ? "Tất cả" : size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mini Page Switcher */}
                {totalPages > 1 && (
                  <div className="flex items-center space-x-1 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-0.5 font-bold">
                    <button
                      type="button"
                      disabled={chapterCurrentPage <= 1}
                      onClick={() => handlePageChange(chapterCurrentPage - 1)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition"
                      title="Trang trước"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="px-2 font-mono text-[11px] text-[var(--text-primary)]">
                      {chapterCurrentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={chapterCurrentPage >= totalPages}
                      onClick={() => handlePageChange(chapterCurrentPage + 1)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition"
                      title="Trang tiếp"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hint */}
          <div className="text-[11px] text-[var(--text-secondary)] italic flex items-center space-x-1.5">
            <span className="font-semibold text-zinc-400">Mẹo:</span>
            <span>Giữ phím <strong>Ctrl</strong> để click chọn nhiều, hoặc giữ <strong>Shift</strong> để quét chọn một khoảng chapters. Click đúp hoặc nhấn vào chapter để xem các trang ảnh bên trong.</span>
          </div>

          {/* Chapter Content */}
          {(() => {
            const renderChapterGrid = (chapList: Chapter[]) => (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-4">
                {chapList.map((chap) => {
                  const isSelected = selectedChapterIds.includes(chap.id);
                  return (
                    <div
                      key={chap.id}
                      onClick={(e) => handleChapterSelect(chap.id, e)}
                      onDoubleClick={() => handleOpenChapter(chap)}
                      className={`group relative p-4 rounded-2xl border transition duration-200 cursor-pointer select-none flex flex-col justify-between ${
                        isSelected
                          ? "bg-[var(--brand-orange)]/10 border-[var(--brand-orange)] ring-2 ring-[var(--brand-orange)]/30"
                          : "bg-[var(--bg-primary)] border-[var(--border-primary)] hover:border-zinc-400 dark:hover:border-zinc-700 shadow-sm hover:shadow-md"
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                            <div className={`p-2.5 rounded-xl shrink-0 ${
                              isSelected ? "bg-[var(--brand-orange)] text-white" : "bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]"
                            }`}>
                              <Folder size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-black text-[var(--text-primary)] group-hover:text-[var(--brand-orange)] transition truncate">
                                Chapter {chap.chapter_number}
                              </h4>
                              {chap.title && (
                                <p className="text-xs text-[var(--text-secondary)] truncate" title={chap.title}>
                                  {chap.title}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Selection Checkbox */}
                          <div
                            onClick={(e) => handleChapterSelect(chap.id, e)}
                            className={`p-1 rounded-md transition shrink-0 ${
                              isSelected ? "text-[var(--brand-orange)]" : "text-zinc-300 dark:text-zinc-600 hover:text-zinc-500"
                            }`}
                          >
                            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-1.5 mt-3 text-[10px] font-bold">
                          <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-[var(--text-secondary)] whitespace-nowrap">
                            {chap.page_count} trang
                          </span>
                          {chap.volume && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 whitespace-nowrap">
                              Vol. {chap.volume}
                            </span>
                          )}
                          {chap.language && (
                            <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 uppercase whitespace-nowrap">
                              {chap.language}
                            </span>
                          )}
                          {chap.scanlation_group && (
                            <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 truncate max-w-[120px]" title={chap.scanlation_group}>
                              {chap.scanlation_group}
                            </span>
                          )}
                          {chap.source === "local_import" && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                              Imported
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Bottom Actions */}
                      <div className="grid grid-cols-2 gap-2 pt-3 mt-3 border-t border-[var(--border-primary)]/40">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenChapter(chap);
                          }}
                          className="py-1.5 px-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold transition flex items-center justify-center space-x-1.5 whitespace-nowrap overflow-hidden"
                          title="Xem và quản lý các trang ảnh bên trong chapter"
                        >
                          <FolderOpen size={13} className="shrink-0 text-zinc-400 group-hover:text-[var(--brand-orange)]" />
                          <span className="truncate">Xem ảnh</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenReader(chap.id, 1);
                          }}
                          className="py-1.5 px-2 rounded-xl bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold shadow-sm transition flex items-center justify-center space-x-1.5 whitespace-nowrap"
                          title="Đọc chapter này trong trình đọc toàn màn hình"
                        >
                          <Eye size={13} className="shrink-0" />
                          <span>Đọc ngay</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );

            const renderChapterTable = (chapList: Chapter[]) => (
              <div className="overflow-x-auto border border-[var(--border-primary)] rounded-2xl">
                <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                  <thead className="bg-[var(--bg-primary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)] font-bold">
                    <tr>
                      <th className="p-3 w-10">
                        <button onClick={() => handleSelectVolume(chapList)}>
                          {chapList.length > 0 && chapList.every((c) => selectedChapterIds.includes(c.id)) ? (
                            <CheckSquare size={16} className="text-[var(--brand-orange)]" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                      <th className="p-3">Chapter</th>
                      <th className="p-3">Title</th>
                      <th className="p-3">Volume</th>
                      <th className="p-3">Language</th>
                      <th className="p-3">Scanlation Group</th>
                      <th className="p-3">Trang</th>
                      <th className="p-3 text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-primary)]">
                    {chapList.map((chap) => {
                      const isSelected = selectedChapterIds.includes(chap.id);
                      return (
                        <tr
                          key={chap.id}
                          onClick={(e) => handleChapterSelect(chap.id, e)}
                          onDoubleClick={() => handleOpenChapter(chap)}
                          className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition select-none ${
                            isSelected ? "bg-[var(--brand-orange)]/10" : ""
                          }`}
                        >
                          <td className="p-3">
                            <div onClick={(e) => handleChapterSelect(chap.id, e)}>
                              {isSelected ? (
                                <CheckSquare size={16} className="text-[var(--brand-orange)]" />
                              ) : (
                                <Square size={16} />
                              )}
                            </div>
                          </td>
                          <td className="p-3 font-bold text-[var(--text-primary)]">
                            Ch. {chap.chapter_number}
                          </td>
                          <td className="p-3">{chap.title || "-"}</td>
                          <td className="p-3">
                            {chap.volume ? (
                              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                                Vol. {chap.volume}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold uppercase">
                              {chap.language}
                            </span>
                          </td>
                          <td className="p-3">{chap.scanlation_group || "No Group"}</td>
                          <td className="p-3 font-bold">{chap.page_count}</td>
                          <td className="p-3 text-right space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenChapter(chap);
                              }}
                              className="px-2.5 py-1 rounded-lg border border-[var(--border-primary)] hover:border-zinc-400 text-xs font-semibold text-[var(--text-primary)] transition"
                            >
                              Xem ảnh
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenReader(chap.id, 1);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold shadow-sm transition inline-flex items-center space-x-1"
                            >
                              <Eye size={12} />
                              <span>Đọc ngay</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );

            const renderChapters = (chapList: Chapter[]) =>
              viewMode === "grid" ? renderChapterGrid(chapList) : renderChapterTable(chapList);

            if (loading) {
              return (
                <div className="py-20 flex flex-col items-center justify-center space-y-3">
                  <Loader2 size={32} className="animate-spin text-[var(--brand-orange)]" />
                  <p className="text-xs text-[var(--text-secondary)]">Đang tải danh sách chương từ Storage...</p>
                </div>
              );
            }

            if (filteredChapters.length === 0) {
              return (
                <div className="py-16 text-center border-2 border-dashed border-[var(--border-primary)] rounded-2xl space-y-3">
                  <FolderOpen size={40} className="mx-auto text-zinc-400/60" />
                  <div className="text-sm font-bold text-[var(--text-primary)]">Chưa có chapter nào trong Storage</div>
                  <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                    Tải xuống các chương qua MangaDex API hoặc import trực tiếp từ thư mục trên máy tính của bạn để đọc và quản lý.
                  </p>
                </div>
              );
            }

            // MangaDex Volume Grouping view
            if (groupByVolume && hasAnyVolume && paginatedVolumeGroups.length > 1) {
              return (
                <div className="space-y-4">
                  {paginatedVolumeGroups.map((volGroup) => {
                    const isCollapsed = !!collapsedVolumes[volGroup.label];
                    const volIds = volGroup.chapters.map((c) => c.id);
                    const allVolSelected =
                      volIds.length > 0 && volIds.every((id) => selectedChapterIds.includes(id));
                    const someVolSelected = volIds.some((id) => selectedChapterIds.includes(id));

                    return (
                      <div
                        key={volGroup.label}
                        className="border border-[var(--border-primary)] rounded-2xl overflow-hidden bg-[var(--bg-primary)]/40 shadow-xs transition"
                      >
                        {/* Volume Accordion Header */}
                        <div
                          onClick={() => toggleVolumeCollapse(volGroup.label)}
                          className="flex items-center justify-between p-3.5 bg-[var(--bg-primary)] hover:bg-zinc-100 dark:hover:bg-zinc-800/60 border-b border-[var(--border-primary)] cursor-pointer select-none transition"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectVolume(volGroup.chapters);
                              }}
                              className="text-zinc-400 hover:text-[var(--brand-orange)] transition cursor-pointer"
                              title="Chọn / Bỏ chọn toàn bộ volume này"
                            >
                              {allVolSelected ? (
                                <CheckSquare size={16} className="text-[var(--brand-orange)]" />
                              ) : someVolSelected ? (
                                <CheckSquare size={16} className="text-zinc-400" />
                              ) : (
                                <Square size={16} />
                              )}
                            </button>
                            <div className="flex items-center space-x-2.5 flex-wrap">
                              <span className="font-black text-sm text-[var(--text-primary)]">
                                {volGroup.label}
                              </span>
                              <span className="text-xs text-[var(--text-secondary)] font-medium bg-zinc-500/10 px-2.5 py-0.5 rounded-full">
                                {volGroup.chapters.length} chương{" "}
                                {volGroup.minChapter
                                  ? `(Ch. ${volGroup.minChapter} - Ch. ${volGroup.maxChapter})`
                                  : ""}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 text-xs font-semibold text-[var(--text-secondary)]">
                            <span>{isCollapsed ? "Mở rộng" : "Thu gọn"}</span>
                            {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                          </div>
                        </div>

                        {/* Volume Chapters content */}
                        {!isCollapsed && (
                          <div className="p-4">
                            {renderChapters(volGroup.chapters)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }

            // Flat chapters
            return renderChapters(paginatedChapters);
          })()}

          {/* Professional Bottom Pagination Component */}
          {totalFilteredCount > 0 && (
            <div className="mt-6 p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-primary)] shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
              {/* Left: Detailed Info & Dropdown Page Size */}
              <div className="flex items-center space-x-3 text-xs text-[var(--text-secondary)] font-medium flex-wrap">
                <span>
                  Hiển thị{" "}
                  <strong className="text-[var(--text-primary)] font-bold">
                    {startIndex + 1} - {endIndex}
                  </strong>{" "}
                  trên{" "}
                  <strong className="text-[var(--text-primary)] font-bold">
                    {totalFilteredCount}
                  </strong>{" "}
                  chapter
                  {totalPages > 1 && ` (Trang ${chapterCurrentPage}/${totalPages})`}
                </span>
                <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 hidden sm:block" />
                <div className="flex items-center space-x-2">
                  <span className="text-zinc-400 text-xs">Cỡ trang:</span>
                  <select
                    value={chapterPageSize}
                    onChange={(e) => {
                      const val = e.target.value;
                      setChapterPageSize(val === "all" ? "all" : Number(val));
                      setChapterCurrentPage(1);
                    }}
                    className="px-2.5 py-1 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-orange)] cursor-pointer"
                  >
                    <option value={12}>12 mục / trang</option>
                    <option value={24}>24 mục / trang</option>
                    <option value={48}>48 mục / trang</option>
                    <option value={96}>96 mục / trang</option>
                    <option value={120}>120 mục / trang</option>
                    <option value="all">Tất cả ({totalFilteredCount})</option>
                  </select>
                </div>
              </div>

              {/* Center: Numeric Page Navigation with smart ellipsis */}
              {totalPages > 1 && (
                <div className="flex items-center space-x-1 flex-wrap justify-center">
                  {/* First Page button */}
                  <button
                    type="button"
                    disabled={chapterCurrentPage <= 1}
                    onClick={() => handlePageChange(1)}
                    className="p-2 rounded-xl border border-[var(--border-primary)] hover:border-zinc-400 disabled:opacity-20 disabled:cursor-not-allowed text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
                    title="Về trang đầu tiên (Trang 1)"
                  >
                    <ChevronsLeft size={15} />
                  </button>

                  {/* Prev Page button */}
                  <button
                    type="button"
                    disabled={chapterCurrentPage <= 1}
                    onClick={() => handlePageChange(chapterCurrentPage - 1)}
                    className="p-2 rounded-xl border border-[var(--border-primary)] hover:border-zinc-400 disabled:opacity-20 disabled:cursor-not-allowed text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
                    title="Trang trước"
                  >
                    <ChevronLeft size={15} />
                  </button>

                  {/* Page number buttons */}
                  <div className="flex items-center space-x-1">
                    {getPageNumbers().map((item, idx) => {
                      if (item === "ellipsis") {
                        return (
                          <span
                            key={`ellipsis-${idx}`}
                            className="px-2 py-1 text-xs text-zinc-400 select-none"
                          >
                            ...
                          </span>
                        );
                      }
                      const isCurrent = item === chapterCurrentPage;
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handlePageChange(item)}
                          className={`min-w-[34px] h-[34px] rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center ${
                            isCurrent
                              ? "bg-[var(--brand-orange)] text-white shadow-md font-black"
                              : "border border-[var(--border-primary)] hover:border-zinc-400 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          }`}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>

                  {/* Next Page button */}
                  <button
                    type="button"
                    disabled={chapterCurrentPage >= totalPages}
                    onClick={() => handlePageChange(chapterCurrentPage + 1)}
                    className="p-2 rounded-xl border border-[var(--border-primary)] hover:border-zinc-400 disabled:opacity-20 disabled:cursor-not-allowed text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
                    title="Trang tiếp"
                  >
                    <ChevronRight size={15} />
                  </button>

                  {/* Last Page button */}
                  <button
                    type="button"
                    disabled={chapterCurrentPage >= totalPages}
                    onClick={() => handlePageChange(totalPages)}
                    className="p-2 rounded-xl border border-[var(--border-primary)] hover:border-zinc-400 disabled:opacity-20 disabled:cursor-not-allowed text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
                    title={`Đến trang cuối (Trang ${totalPages})`}
                  >
                    <ChevronsRight size={15} />
                  </button>
                </div>
              )}

              {/* Right: Quick Jump Form */}
              {totalPages > 1 && (
                <form onSubmit={handleJumpSubmit} className="flex items-center space-x-1.5 text-xs">
                  <span className="text-zinc-400 font-medium">Nhảy tới:</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    placeholder={String(chapterCurrentPage)}
                    value={jumpPageInput}
                    onChange={(e) => setJumpPageInput(e.target.value)}
                    className="w-14 px-2 py-1.5 text-center rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] text-xs font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-orange)]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-[var(--brand-orange)] hover:text-white text-xs font-bold text-[var(--text-primary)] transition cursor-pointer shadow-xs"
                  >
                    Đi
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Inside Chapter: Pages Explorer */
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Sub Header for Chapter Pages */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-primary)] p-4 rounded-2xl border border-[var(--border-primary)]">
            <div className="flex items-center space-x-3 flex-wrap">
              <button
                onClick={handleBackToChapters}
                className="px-3 py-1.5 rounded-xl border border-[var(--border-primary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold text-[var(--text-secondary)] transition cursor-pointer"
              >
                ← Quay lại danh sách chương
              </button>
              <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 hidden sm:block" />
              <button
                onClick={handleSelectAllPages}
                className="text-xs font-semibold text-[var(--brand-orange)] hover:underline flex items-center space-x-1 cursor-pointer"
              >
                {selectedPageNumbers.length > 0 && selectedPageNumbers.length === activeChapterPages.length ? (
                  <CheckSquare size={14} />
                ) : (
                  <Square size={14} />
                )}
                <span>Chọn tất cả trang ({selectedPageNumbers.length}/{activeChapterPages.length})</span>
              </button>

              {selectedPageNumbers.length > 0 && (
                <button
                  onClick={handleDeselectAllPages}
                  className="px-2.5 py-1 rounded-lg border border-[var(--border-primary)] hover:border-zinc-400 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex items-center space-x-1 transition cursor-pointer"
                  title="Bỏ chọn toàn bộ trang đang chọn"
                >
                  <X size={12} />
                  <span>Bỏ chọn ({selectedPageNumbers.length})</span>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2.5">
              {selectedPageNumbers.length > 0 && (
                <button
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center space-x-1.5 transition"
                >
                  <Trash2 size={14} />
                  <span>Xóa {selectedPageNumbers.length} trang đã chọn</span>
                </button>
              )}

              <button
                onClick={() => onOpenReader(activeChapter.id, 1)}
                className="px-4 py-1.5 rounded-xl bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold flex items-center space-x-1.5 transition shadow"
              >
                <Eye size={14} />
                <span>Bắt đầu đọc Chapter</span>
              </button>
            </div>
          </div>

          {/* Pages Grid */}
          {loadingPages ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <Loader2 size={32} className="animate-spin text-[var(--brand-orange)]" />
              <p className="text-xs text-[var(--text-secondary)]">Đang tải các trang truyện...</p>
            </div>
          ) : activeChapterPages.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
              Chapter này hiện không có trang ảnh nào.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {activeChapterPages.map((page, idx) => {
                const isSelected = selectedPageNumbers.includes(page.page_number);
                return (
                  <div
                    key={page.page_number}
                    onClick={() => {
                      setPreviewPageIndex(idx);
                      setPreviewZoom(100);
                    }}
                    onDoubleClick={() => onOpenReader(activeChapter.id, page.page_number)}
                    className={`group relative rounded-xl border overflow-hidden cursor-pointer select-none transition ${
                      isSelected
                        ? "border-[var(--brand-orange)] ring-2 ring-[var(--brand-orange)]/30"
                        : "border-[var(--border-primary)] hover:border-zinc-400 dark:hover:border-zinc-600"
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-[3/4] bg-zinc-900 flex items-center justify-center relative overflow-hidden">
                      {page.url ? (
                        <img
                          src={page.url}
                          alt={`Page ${page.page_number}`}
                          loading="lazy"
                          className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <ImageIcon size={24} className="text-zinc-600" />
                      )}

                      {/* Page number badge */}
                      <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-white text-[10px] font-black z-20 pointer-events-none">
                        #{page.page_number}
                      </span>

                      {/* Selection checkbox - Unblocked and z-30 */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePageSelect(page.page_number, e);
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-md bg-black/70 backdrop-blur-sm z-30 hover:scale-110 transition cursor-pointer"
                        title="Chọn trang (Shift+Click để chọn nhiều trang)"
                      >
                        {isSelected ? (
                          <CheckSquare size={16} className="text-[var(--brand-orange)]" />
                        ) : (
                          <Square size={16} className="text-white/80 hover:text-white" />
                        )}
                      </div>

                      {/* Hover Hint: Preview */}
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none z-10">
                        <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-white text-[11px] font-semibold shadow">
                          <Maximize2 size={12} className="text-[var(--brand-orange)]" />
                          <span>Xem lớn</span>
                        </div>
                      </div>

                      {/* Dedicated Read Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenReader(activeChapter.id, page.page_number);
                        }}
                        title="Đọc từ trang này trong trình đọc"
                        className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black/80 hover:bg-[var(--brand-orange)] text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-all z-20 shadow cursor-pointer flex items-center space-x-1"
                      >
                        <Eye size={11} />
                        <span>Đọc</span>
                      </button>
                    </div>

                    {/* Metadata Footer */}
                    <div className="p-2 bg-[var(--bg-primary)] text-[10px] text-[var(--text-secondary)] flex justify-between items-center">
                      <span className="truncate max-w-[80px] font-mono">{page.filename}</span>
                      <span>{(page.file_size / 1024).toFixed(0)} KB</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center space-x-3 text-rose-500">
              <div className="p-2 rounded-2xl bg-rose-500/10">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-black text-[var(--text-primary)]">Xác nhận xóa dữ liệu Storage</h3>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {activeChapter ? (
                <>
                  Bạn có chắc chắn muốn xóa <strong>{selectedPageNumbers.length} trang</strong> khỏi Chapter {activeChapter.chapter_number}? Các trang còn lại sẽ được tự động đánh lại số thứ tự.
                </>
              ) : (
                <>
                  Bạn có chắc chắn muốn xóa <strong>{selectedChapterIds.length} chapter</strong> đã chọn? Toàn bộ các trang ảnh lưu trong MinIO của các chương này sẽ bị xóa vĩnh viễn.
                </>
              )}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[var(--border-primary)]">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[var(--border-primary)] text-xs font-bold text-[var(--text-secondary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                Hủy
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition shadow disabled:opacity-50 flex items-center space-x-1.5"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                <span>Xác nhận xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Scanner Drawer/Modal */}
      {isDupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-5 border-b border-[var(--border-primary)] flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Copy className="text-amber-500" size={20} />
                <div>
                  <h3 className="text-base font-black text-[var(--text-primary)]">
                    Quét & Xóa ảnh trùng lặp trong Storage
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Tìm kiếm các trang ảnh có nội dung bit trùng khớp (MD5 Hash)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDupModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {scanningDups ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-4 max-w-md mx-auto text-center">
                  <div className="relative">
                    <Loader2 size={36} className="animate-spin text-amber-500" />
                    <span className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-[var(--text-primary)]">Đang quét phân tích MD5 Hash toàn bộ Storage</h4>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Hệ thống đang truy xuất tất cả các trang ảnh, đối chiếu giá trị băm cryptographic MD5 và nhóm các ảnh có nội dung bit trùng lặp 100%...
                    </p>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden shadow-inner">
                    <div className="bg-gradient-to-r from-amber-500 to-orange-500 h-full w-2/3 animate-pulse rounded-full" />
                  </div>
                </div>
              ) : duplicateGroups.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <Check size={36} className="mx-auto text-emerald-500" />
                  <div className="text-sm font-bold text-[var(--text-primary)]">Không phát hiện ảnh trùng lặp</div>
                  <p className="text-xs text-[var(--text-secondary)]">Tất cả các trang truyện trong storage đều là duy nhất.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold flex items-center justify-between">
                    <span>Phát hiện {duplicateGroups.length} nhóm ảnh trùng lặp. Đã tự động chọn các bản sao dư thừa để dọn dẹp.</span>
                    <span className="font-bold font-mono">Đã chọn: {selectedDupKeys.length}</span>
                  </div>

                  {duplicateGroups.map((group, idx) => (
                    <div key={idx} className="p-4 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-[var(--text-secondary)]">
                        <span>Nhóm #{idx + 1} ({group.items.length} bản sao - {(group.file_size / 1024).toFixed(0)} KB mỗi ảnh)</span>
                        <span className="font-mono text-[10px] text-zinc-400">MD5: {group.md5_hash.slice(0, 10)}...</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {group.items.map((item, i) => {
                          const isSelected = selectedDupKeys.includes(item.object_key);
                          return (
                            <div
                              key={i}
                              onClick={() => {
                                setSelectedDupKeys((prev) =>
                                  prev.includes(item.object_key)
                                    ? prev.filter((k) => k !== item.object_key)
                                    : [...prev, item.object_key]
                                );
                              }}
                              className={`p-2 rounded-xl border cursor-pointer select-none transition ${
                                isSelected
                                  ? "border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/20"
                                  : "border-[var(--border-primary)] bg-[var(--bg-card)] hover:border-zinc-400"
                              }`}
                            >
                              <div className="aspect-[3/4] bg-zinc-900 rounded-lg overflow-hidden relative">
                                {item.url && (
                                  <img src={item.url} alt="Dup preview" className="w-full h-full object-cover" />
                                )}
                                <div className="absolute top-1 right-1">
                                  {isSelected ? (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[9px] font-bold">
                                      Xóa
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[9px] font-bold">
                                      Giữ
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="mt-2 text-[10px] text-[var(--text-secondary)]">
                                <div className="font-bold text-[var(--text-primary)]">Ch. {item.chapter_number} - Trang #{item.page_number}</div>
                                <div className="truncate text-zinc-400">{item.filename}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {duplicateGroups.length > 0 && (
              <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-primary)] flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">
                  Số ảnh sẽ được xóa: <strong>{selectedDupKeys.length}</strong>
                </span>
                <div className="space-x-3">
                  <button
                    onClick={() => setIsDupModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-[var(--border-primary)] text-xs font-bold text-[var(--text-secondary)]"
                  >
                    Đóng
                  </button>
                  <button
                    onClick={handleCleanupDuplicates}
                    disabled={cleaningDups || selectedDupKeys.length === 0}
                    className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow transition disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    {cleaningDups && <Loader2 size={14} className="animate-spin" />}
                    <span>Dọn dẹp ảnh trùng ({selectedDupKeys.length})</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Local Folder Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div
            className={`bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl w-full flex flex-col shadow-2xl overflow-hidden transition-all duration-300 ${
              importProgress ? "max-w-3xl max-h-[92vh]" : "max-w-2xl max-h-[85vh]"
            } animate-in zoom-in-95`}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--border-primary)] flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-2xl bg-indigo-500/10 text-indigo-500">
                  <Upload size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-[var(--text-primary)]">
                    {importProgress ? "Tiến Trình Import Manga (System Storage)" : "Import Manga từ Thư mục máy tính"}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {importProgress
                      ? `Đang lưu trữ dữ liệu vào MinIO System Storage cho "${mangaTitle}"`
                      : "Nhập dữ liệu các chapter đã tải về từ trước vào System Storage"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (importProgress && importProgress.status === "running") {
                    if (window.confirm("Tiến trình import đang chạy ngầm. Bạn có chắc muốn đóng cửa sổ này?")) {
                      handleResetImportModal();
                    }
                  } else {
                    handleResetImportModal();
                  }
                }}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                title="Đóng cửa sổ"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            {importProgress ? (
              /* LIVE STREAMING PROGRESS MISSION CONTROL */
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Header status bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20">
                  <div className="flex items-center space-x-3">
                    {importProgress.status === "running" && (
                      <div className="relative flex items-center justify-center shrink-0">
                        <span className="w-3.5 h-3.5 rounded-full bg-indigo-500 animate-ping opacity-75 absolute" />
                        <span className="w-3 h-3 rounded-full bg-indigo-500" />
                      </div>
                    )}
                    {importProgress.status === "completed" && (
                      <CheckCircle2 className="text-emerald-500 shrink-0" size={24} />
                    )}
                    {importProgress.status === "error" && (
                      <AlertTriangle className="text-rose-500 shrink-0" size={24} />
                    )}
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black uppercase tracking-wider text-[var(--text-primary)]">
                          {importProgress.status === "running" && "Đang Import Dữ Liệu vào System Storage"}
                          {importProgress.status === "completed" && "Hoàn Tất Quá Trình Import!"}
                          {importProgress.status === "error" && "Quá Trình Bị Gián Đoạn"}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono text-[10px] font-bold">
                          MinIO S3
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
                        {importProgress.status === "running" && (
                          <>
                            Đang xử lý Chapter <strong className="text-[var(--text-primary)]">{importProgress.currentChapterNumber || "..."}</strong>
                            {importProgress.currentChapterTitle ? ` (${importProgress.currentChapterTitle})` : ""}
                            {" • "}Đang tải trang {importProgress.currentPageNumber}/{importProgress.currentChapterPageCount}
                          </>
                        )}
                        {importProgress.status === "completed" && (
                          <>Đã lưu trữ an toàn toàn bộ các chapter và trang ảnh vào bộ nhớ hệ thống.</>
                        )}
                        {importProgress.status === "error" && (
                          <>Đã xảy ra lỗi trong khi truyền dữ liệu. Vui lòng xem log chi tiết bên dưới.</>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-baseline space-x-1.5 self-end sm:self-center shrink-0">
                    <span className="text-3xl font-spartan font-black text-indigo-500">
                      {importProgress.overallPercent.toFixed(1)}%
                    </span>
                    <span className="text-xs font-bold text-[var(--text-secondary)]">Tổng thể</span>
                  </div>
                </div>

                {/* Dual Progress Bars */}
                <div className="space-y-2">
                  {/* Master Bar */}
                  <div className="relative w-full h-3.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden shadow-inner border border-indigo-500/10">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300 rounded-full relative"
                      style={{ width: `${Math.min(100, Math.max(0, importProgress.overallPercent))}%` }}
                    >
                      {importProgress.status === "running" && (
                        <div className="absolute inset-0 bg-white/20 animate-pulse" />
                      )}
                    </div>
                  </div>

                  {/* Sub bar: Current chapter page progress */}
                  {importProgress.status === "running" && importProgress.currentChapterPageCount > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                        <span>Tiến độ Chapter hiện tại</span>
                        <span className="text-indigo-500 dark:text-indigo-400 font-bold">
                          Trang {importProgress.currentPageNumber} / {importProgress.currentChapterPageCount}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 transition-all duration-150 rounded-full"
                          style={{
                            width: `${(importProgress.currentPageNumber / Math.max(1, importProgress.currentChapterPageCount)) * 100}%`
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 4-Metric Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Card 1: Speed */}
                  <div className="p-3.5 rounded-2xl bg-zinc-100/70 dark:bg-zinc-850/60 border border-[var(--border-primary)] space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-[var(--text-secondary)]">
                      <span>Tốc độ xử lý</span>
                      <Zap size={14} className="text-amber-500" />
                    </div>
                    <div className="text-lg font-black text-[var(--text-primary)]">
                      {importProgress.speedPagesPerSec} <span className="text-xs font-semibold text-[var(--text-secondary)]">trang/s</span>
                    </div>
                    <div className="text-[10px] font-mono font-semibold text-zinc-400">
                      ~{importProgress.speedMbPerSec} MB/s
                    </div>
                  </div>

                  {/* Card 2: Chapters Progress */}
                  <div className="p-3.5 rounded-2xl bg-zinc-100/70 dark:bg-zinc-850/60 border border-[var(--border-primary)] space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-[var(--text-secondary)]">
                      <span>Chapters</span>
                      <Layers size={14} className="text-indigo-500" />
                    </div>
                    <div className="text-lg font-black text-[var(--text-primary)]">
                      {importProgress.currentChapterIndex} <span className="text-xs font-semibold text-[var(--text-secondary)]">/ {importProgress.totalChapters}</span>
                    </div>
                    <div className="text-[10px] font-semibold text-zinc-400">
                      Còn lại: {importProgress.remainingChapters} chapter
                    </div>
                  </div>

                  {/* Card 3: Pages Progress */}
                  <div className="p-3.5 rounded-2xl bg-zinc-100/70 dark:bg-zinc-850/60 border border-[var(--border-primary)] space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-[var(--text-secondary)]">
                      <span>Trang ảnh</span>
                      <ImageIcon size={14} className="text-purple-500" />
                    </div>
                    <div className="text-lg font-black text-[var(--text-primary)]">
                      {importProgress.totalPagesDone} <span className="text-xs font-semibold text-[var(--text-secondary)]">/ {importProgress.totalPagesOverall}</span>
                    </div>
                    <div className="text-[10px] font-semibold text-zinc-400">
                      Còn lại: {importProgress.remainingPages} trang
                    </div>
                  </div>

                  {/* Card 4: Time & ETA */}
                  <div className="p-3.5 rounded-2xl bg-zinc-100/70 dark:bg-zinc-850/60 border border-[var(--border-primary)] space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-[var(--text-secondary)]">
                      <span>Thời gian & ETA</span>
                      <Clock size={14} className="text-emerald-500" />
                    </div>
                    <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                      ~{formatSeconds(importProgress.etaSeconds)}
                    </div>
                    <div className="text-[10px] font-semibold text-zinc-400">
                      Đã chạy: {formatSeconds(importProgress.elapsedSeconds)}
                    </div>
                  </div>
                </div>

                {/* Active Item Inspector & Thumbnail Preview */}
                <div className="p-4 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] flex flex-col sm:flex-row gap-4 items-center">
                  {/* Thumbnail Box */}
                  <div className="relative w-24 h-32 rounded-xl overflow-hidden bg-zinc-900 border border-[var(--border-primary)] shadow-md flex-shrink-0 flex items-center justify-center group">
                    {importProgress.previewBase64 ? (
                      <>
                        <img
                          src={importProgress.previewBase64}
                          alt="Live page preview"
                          className="w-full h-full object-cover animate-in fade-in duration-200"
                        />
                        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm text-[9px] font-mono font-bold text-white px-1.5 py-0.5 rounded-full border border-white/10 whitespace-nowrap shadow">
                          P.{importProgress.currentPageNumber}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-1.5 text-zinc-500 p-2 text-center">
                        <Loader2 className="animate-spin text-indigo-400" size={20} />
                        <span className="text-[9px] font-bold uppercase tracking-wider">Preview</span>
                      </div>
                    )}
                  </div>

                  {/* Item Details */}
                  <div className="flex-1 min-w-0 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                        <Activity size={12} className="text-indigo-500" />
                        Đang ghi dữ liệu vào MinIO Storage
                      </span>
                      <span className="text-[10px] font-mono font-bold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                        {formatBytes(importProgress.totalBytesUploaded)} đã tải lên
                      </span>
                    </div>

                    <div className="font-spartan font-bold text-sm text-[var(--text-primary)] truncate">
                      {importProgress.currentChapterNumber
                        ? `Chapter ${importProgress.currentChapterNumber}${importProgress.currentChapterTitle ? ` - ${importProgress.currentChapterTitle}` : ""}`
                        : "Đang nạp chapter..."}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--text-secondary)]">
                      <div className="truncate">
                        <span className="text-zinc-400">Tệp: </span>
                        <span className="font-mono font-semibold text-[var(--text-primary)]">
                          {importProgress.currentFilename || "..."}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400">Kích thước: </span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {formatBytes(importProgress.currentFileSize)}
                        </span>
                      </div>
                    </div>

                    <div className="text-[10px] text-zinc-400 font-mono truncate">
                      Lưu trữ: manga-system/manga/{mangaId}/... (Hashing MD5 dedup)
                    </div>
                  </div>
                </div>

                {/* Event Log Console (Micro-Terminal) */}
                <div className="rounded-2xl border border-[var(--border-primary)] bg-zinc-950 text-zinc-200 overflow-hidden shadow-lg">
                  <div className="px-3 py-2 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-[11px]">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                      </div>
                      <span className="font-mono text-zinc-400 font-semibold flex items-center gap-1.5 ml-2">
                        <Terminal size={12} className="text-indigo-400" />
                        Nhật Ký Tiến Trình Thời Gian Thực ({importProgress.logs.length} sự kiện)
                      </span>
                    </div>
                    {importProgress.status === "running" && (
                      <span className="text-[10px] font-mono text-indigo-400 flex items-center gap-1 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                        Live Stream
                      </span>
                    )}
                  </div>

                  <div className="p-3 font-mono text-[11px] leading-relaxed max-h-36 overflow-y-auto space-y-1 select-text">
                    {importProgress.logs.map((log) => {
                      let colorClass = "text-zinc-300";
                      if (log.type === "success") colorClass = "text-emerald-400 font-semibold";
                      if (log.type === "warn") colorClass = "text-amber-400";
                      if (log.type === "error") colorClass = "text-rose-400 font-bold";
                      return (
                        <div key={log.id} className="flex items-start space-x-2">
                          <span className="text-zinc-500 text-[10px] shrink-0 font-normal">[{log.time}]</span>
                          <span className={colorClass}>{log.text}</span>
                        </div>
                      );
                    })}
                    <div ref={logsEndRef} />
                  </div>
                </div>

                {/* Completion Summary Card */}
                {importProgress.status === "completed" && importProgress.summary && (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 space-y-2 animate-in zoom-in-95">
                    <div className="flex items-center space-x-2 font-bold text-sm">
                      <Sparkles size={18} className="text-emerald-500" />
                      <span>Hoàn tất nhập dữ liệu thành công!</span>
                    </div>
                    <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
                      Đã lưu thành công <strong>{importProgress.summary.importedChapters} chapters</strong> (tổng cộng{" "}
                      <strong>{importProgress.summary.totalPagesImported} trang</strong>, dung lượng{" "}
                      <strong>{formatBytes(importProgress.summary.totalBytesUploaded)}</strong>) trong thời gian{" "}
                      <strong>{importProgress.summary.elapsedSeconds}s</strong>.
                      {importProgress.summary.skippedChapters > 0 && (
                        <span> Bỏ qua {importProgress.summary.skippedChapters} chapter đã có sẵn.</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* SCAN & SELECTION FORM */
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Folder Path Input */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    Đường dẫn thư mục chứa Manga / Chapters
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={importFolderPath}
                      onChange={(e) => setImportFolderPath(e.target.value)}
                      placeholder="e.g. D:\Manga\Chainsaw Man"
                      className="flex-1 px-3.5 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={handleScanFolder}
                      disabled={scanningFolder || !importFolderPath.trim()}
                      className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold shadow transition flex items-center space-x-1.5 disabled:opacity-50"
                    >
                      {scanningFolder ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      <span>Quét thư mục</span>
                    </button>
                  </div>
                </div>

                {/* Scan Results */}
                {scanResult && (
                  <div className="space-y-4 pt-2 border-t border-[var(--border-primary)]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                        <Check size={14} />
                        <span>{scanResult.message}</span>
                      </span>
                      <button
                        onClick={() => {
                          if (selectedImportFolders.length === scanResult.detected_chapters.length) {
                            setSelectedImportFolders([]);
                          } else {
                            setSelectedImportFolders(scanResult.detected_chapters.map((c) => c.folder_name));
                          }
                        }}
                        className="text-indigo-500 hover:underline font-semibold"
                      >
                        {selectedImportFolders.length === scanResult.detected_chapters.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                      </button>
                    </div>

                    {/* Detected Chapters Table */}
                    <div className="max-h-60 overflow-y-auto border border-[var(--border-primary)] rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[var(--bg-primary)] font-bold text-[10px] uppercase text-[var(--text-secondary)] border-b border-[var(--border-primary)]">
                          <tr>
                            <th className="p-2.5 w-8">#</th>
                            <th className="p-2.5">Folder</th>
                            <th className="p-2.5">Chap</th>
                            <th className="p-2.5">Title</th>
                            <th className="p-2.5">Trang</th>
                            <th className="p-2.5">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-primary)]">
                          {scanResult.detected_chapters.map((ch) => {
                            const isChecked = selectedImportFolders.includes(ch.folder_name);
                            return (
                              <tr
                                key={ch.folder_name}
                                onClick={() => {
                                  setSelectedImportFolders((prev) =>
                                    prev.includes(ch.folder_name)
                                      ? prev.filter((f) => f !== ch.folder_name)
                                      : [...prev, ch.folder_name]
                                  );
                                }}
                                className={`cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${
                                  isChecked ? "bg-indigo-500/10" : ""
                                }`}
                              >
                                <td className="p-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}}
                                    className="rounded text-indigo-500 focus:ring-0"
                                  />
                                </td>
                                <td className="p-2.5 font-mono text-[11px] truncate max-w-[140px]">
                                  {ch.folder_name}
                                </td>
                                <td className="p-2.5 font-bold text-[var(--text-primary)]">
                                  {ch.chapter_number}
                                </td>
                                <td className="p-2.5 truncate max-w-[120px] text-[var(--text-secondary)]">
                                  {ch.title || "-"}
                                </td>
                                <td className="p-2.5 font-bold">{ch.page_count}</td>
                                <td className="p-2.5">
                                  {ch.is_duplicate ? (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px]">
                                      Đã có sẵn
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                                      Mới
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Conflict handling options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="font-bold text-[var(--text-secondary)] block mb-1">
                          Xử lý khi trùng chapter
                        </label>
                        <select
                          value={conflictStrategy}
                          onChange={(e: any) => setConflictStrategy(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] font-semibold text-[var(--text-primary)]"
                        >
                          <option value="skip">Bỏ qua chapter đã có (Skip)</option>
                          <option value="overwrite">Ghi đè chapter cũ (Overwrite)</option>
                          <option value="keep_both">Lưu cả hai bản (Keep Both)</option>
                        </select>
                      </div>

                      <div>
                        <label className="font-bold text-[var(--text-secondary)] block mb-1">
                          Ngôn ngữ mặc định
                        </label>
                        <select
                          value={importLang}
                          onChange={(e) => setImportLang(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] font-semibold text-[var(--text-primary)] uppercase"
                        >
                          <option value="en">English (EN)</option>
                          <option value="vi">Tiếng Việt (VI)</option>
                          <option value="ja">Japanese (JA)</option>
                          <option value="ru">Russian (RU)</option>
                        </select>
                      </div>
                    </div>

                    {importMessage && (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold animate-in fade-in">
                        {importMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer */}
            {importProgress ? (
              <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-primary)] flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)] font-medium">
                  {importProgress.status === "running" && (
                    <span className="flex items-center gap-1.5 text-indigo-500">
                      <Loader2 size={13} className="animate-spin" />
                      Vui lòng giữ cửa sổ để duy trì kết nối truyền tải dữ liệu.
                    </span>
                  )}
                  {importProgress.status === "completed" && (
                    <span className="text-emerald-500 font-bold flex items-center gap-1">
                      <Check size={14} />
                      Dữ liệu đã sẵn sàng trong thư viện Manga
                    </span>
                  )}
                  {importProgress.status === "error" && (
                    <span className="text-rose-500 font-bold">
                      Đã dừng do phát sinh lỗi.
                    </span>
                  )}
                </span>
                <div className="space-x-3">
                  {importProgress.status === "running" ? (
                    <button
                      disabled
                      className="px-4 py-2 rounded-xl border border-[var(--border-primary)] text-xs font-bold text-zinc-400 cursor-not-allowed opacity-60"
                    >
                      Đang xử lý...
                    </button>
                  ) : (
                    <button
                      onClick={handleResetImportModal}
                      className="px-5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold shadow transition flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Check size={14} />
                      <span>{importProgress.status === "completed" ? "Mở danh sách Chapters" : "Đóng cửa sổ"}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              scanResult && scanResult.detected_chapters.length > 0 && (
                <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-primary)] flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">
                    Đã chọn: <strong>{selectedImportFolders.length}</strong> chapter(s)
                  </span>
                  <div className="space-x-3">
                    <button
                      onClick={() => setIsImportModalOpen(false)}
                      className="px-4 py-2 rounded-xl border border-[var(--border-primary)] text-xs font-bold text-[var(--text-secondary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleExecuteImport}
                      disabled={importing || selectedImportFolders.length === 0}
                      className="px-5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold shadow transition disabled:opacity-50 flex items-center space-x-1.5"
                    >
                      {importing && <Loader2 size={14} className="animate-spin" />}
                      <span>Bắt đầu Import</span>
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
      {/* Lightbox Preview Modal for Chapter Pages (Issue 4) */}
      {previewPageIndex !== null && activeChapterPages[previewPageIndex] && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col animate-in fade-in duration-150 select-none">
          {/* Top Bar */}
          <div className="px-4 py-3 bg-black/70 border-b border-zinc-800 flex items-center justify-between text-white shrink-0">
            <div className="flex items-center space-x-3 min-w-0">
              <span className="px-2.5 py-1 rounded-lg bg-[var(--brand-orange)] text-white text-xs font-bold shrink-0">
                Trang {activeChapterPages[previewPageIndex].page_number} / {activeChapterPages.length}
              </span>
              <span className="text-xs text-zinc-300 font-mono truncate max-w-xs sm:max-w-md">
                {activeChapterPages[previewPageIndex].filename}
              </span>
              <span className="text-[11px] text-zinc-500 hidden sm:inline shrink-0">
                ({(activeChapterPages[previewPageIndex].file_size / 1024).toFixed(0)} KB)
              </span>
            </div>

            {/* Controls: Zoom, Read from this page, Close */}
            <div className="flex items-center space-x-2">
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => Math.max(30, prev - 15))}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                  title="Thu nhỏ (-15%) (Phím -)"
                >
                  <Minus size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom(100)}
                  className="px-2 py-0.5 text-zinc-200 hover:text-[var(--brand-orange)] font-mono text-[11px] font-bold cursor-pointer"
                  title="Đặt lại 100% (Phím 0)"
                >
                  {previewZoom}%
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewZoom((prev) => Math.min(300, prev + 15))}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                  title="Phóng to (+15%) (Phím +)"
                >
                  <Plus size={13} />
                </button>
              </div>

              {activeChapter && (
                <button
                  type="button"
                  onClick={() => {
                    const pg = activeChapterPages[previewPageIndex].page_number;
                    setPreviewPageIndex(null);
                    onOpenReader(activeChapter.id, pg);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold flex items-center space-x-1.5 transition shadow cursor-pointer"
                  title="Mở chế độ đọc truyện toàn màn hình từ trang này"
                >
                  <Eye size={13} />
                  <span className="hidden sm:inline">Đọc từ trang này</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setPreviewPageIndex(null)}
                className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
                title="Đóng xem trước (Phím Esc)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Canvas with Navigation Buttons */}
          <div className="flex-1 relative flex items-center justify-center overflow-auto p-4">
            {/* Prev Page Button */}
            <button
              type="button"
              disabled={previewPageIndex <= 0}
              onClick={() => {
                setPreviewPageIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/90 border border-zinc-800 text-white transition z-20 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer shadow-lg"
              title="Trang trước (←)"
            >
              <ChevronLeft size={24} />
            </button>

            {/* Preview Image */}
            <div className="max-w-full max-h-full flex items-center justify-center transition-transform duration-150">
              <img
                src={activeChapterPages[previewPageIndex].url || ""}
                alt={`Trang ${activeChapterPages[previewPageIndex].page_number}`}
                className="max-h-[82vh] max-w-[85vw] object-contain shadow-2xl rounded-sm transition-transform duration-100"
                style={{
                  transform: previewZoom === 100 ? undefined : `scale(${previewZoom / 100})`,
                  transformOrigin: "center center"
                }}
              />
            </div>

            {/* Next Page Button */}
            <button
              type="button"
              disabled={previewPageIndex >= activeChapterPages.length - 1}
              onClick={() => {
                setPreviewPageIndex((prev) =>
                  prev !== null && prev < activeChapterPages.length - 1 ? prev + 1 : prev
                );
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/90 border border-zinc-800 text-white transition z-20 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer shadow-lg"
              title="Trang sau (→)"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          {/* Footer Shortcuts hint */}
          <div className="px-4 py-2 bg-black/70 border-t border-zinc-800 text-center text-[11px] text-zinc-400">
            Dùng phím mũi tên <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300">←</kbd> / <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300">→</kbd> để đổi trang, <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300">+</kbd>/<kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300">-</kbd> để phóng to/thu nhỏ, <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300">0</kbd> để đặt lại 100%, <kbd className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300">Esc</kbd> để đóng.
          </div>
        </div>
      )}
    </div>
  );
};

export default ChapterStorageManager;
