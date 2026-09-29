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
  ChevronRight,
  Layers,
  Check,
  Loader2
} from "lucide-react";
import client from "../../api/client";
import type {
  Chapter,
  PageItem,
  DetectedChapter,
  FolderScanResponse,
  StorageDuplicateGroup
} from "../../types/chapter";

interface ChapterStorageManagerProps {
  mangaId: string;
  mangaTitle: string;
  onOpenReader: (chapterId: string, pageNumber?: number) => void;
  onRefreshChapters?: () => void;
}

export const ChapterStorageManager: React.FC<ChapterStorageManagerProps> = ({
  mangaId,
  mangaTitle,
  onOpenReader,
  onRefreshChapters
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

  // Fetch chapters
  const fetchChapters = async () => {
    setLoading(true);
    try {
      const res = await client.get(`/api/manga/${mangaId}/chapters`);
      setChapters(res.data.chapters || []);
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

  // Multi-selection for Chapters (Ctrl+Click, Shift+Click)
  const handleChapterSelect = (
    id: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();

    if (e.shiftKey && lastSelectedChapterId) {
      // Range selection
      const ids = filteredChapters.map((c) => c.id);
      const startIndex = ids.indexOf(lastSelectedChapterId);
      const endIndex = ids.indexOf(id);

      if (startIndex !== -1 && endIndex !== -1) {
        const [low, high] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
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

  const handleSelectAllChapters = () => {
    if (selectedChapterIds.length === filteredChapters.length) {
      setSelectedChapterIds([]);
    } else {
      setSelectedChapterIds(filteredChapters.map((c) => c.id));
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

  const handleExecuteImport = async () => {
    if (!scanResult || selectedImportFolders.length === 0) return;
    setImporting(true);
    setImportMessage(null);
    try {
      const res = await client.post(`/api/manga/${mangaId}/import-folder`, {
        folder_path: importFolderPath.trim(),
        conflict_strategy: conflictStrategy,
        default_language: importLang,
        selected_folders: selectedImportFolders
      });
      setImportMessage(
        `Thành công: Đã import ${res.data.imported_chapters} chapter (${res.data.total_pages_imported} trang)! Bỏ qua: ${res.data.skipped_chapters}.`
      );
      fetchChapters();
      setTimeout(() => {
        setIsImportModalOpen(false);
        setScanResult(null);
        setImportFolderPath("");
      }, 2500);
    } catch (err: any) {
      console.error("Error executing folder import:", err);
      alert(err.response?.data?.detail || "Lỗi khi import thư mục.");
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

              {availableLanguages.length > 1 && (
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-xs font-semibold text-[var(--text-secondary)] focus:outline-none focus:border-[var(--brand-orange)]"
                >
                  <option value="all">Tất cả ngôn ngữ</option>
                  {availableLanguages.map((l) => (
                    <option key={l} value={l}>
                      {l.toUpperCase()}
                    </option>
                  ))}
                </select>
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
            <div className="flex items-center space-x-2.5">
              <button
                onClick={handleSelectAllChapters}
                className="px-3 py-1.5 rounded-xl border border-[var(--border-primary)] hover:border-zinc-400 text-xs font-semibold text-[var(--text-secondary)] flex items-center space-x-1.5 transition"
              >
                {selectedChapterIds.length > 0 && selectedChapterIds.length === filteredChapters.length ? (
                  <CheckSquare size={14} className="text-[var(--brand-orange)]" />
                ) : (
                  <Square size={14} />
                )}
                <span>Chọn tất cả ({selectedChapterIds.length})</span>
              </button>

              {selectedChapterIds.length > 0 && (
                <button
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center space-x-1.5 transition shadow-sm animate-in fade-in"
                >
                  <Trash2 size={14} />
                  <span>Xóa đã chọn ({selectedChapterIds.length})</span>
                </button>
              )}

              <div className="flex items-center border border-[var(--border-primary)] rounded-xl overflow-hidden p-0.5 bg-[var(--bg-primary)]">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    viewMode === "grid"
                      ? "bg-[var(--brand-orange)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
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

          {/* Hint */}
          <div className="text-[11px] text-[var(--text-secondary)] italic flex items-center space-x-1.5">
            <span className="font-semibold text-zinc-400">Mẹo:</span>
            <span>Giữ phím <strong>Ctrl</strong> để click chọn nhiều, hoặc giữ <strong>Shift</strong> để quét chọn một khoảng chapters. Click đúp hoặc nhấn vào chapter để xem các trang ảnh bên trong.</span>
          </div>

          {/* Chapter Content */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <Loader2 size={32} className="animate-spin text-[var(--brand-orange)]" />
              <p className="text-xs text-[var(--text-secondary)]">Đang tải danh sách chương từ Storage...</p>
            </div>
          ) : filteredChapters.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-[var(--border-primary)] rounded-2xl space-y-3">
              <FolderOpen size={40} className="mx-auto text-zinc-400/60" />
              <div className="text-sm font-bold text-[var(--text-primary)]">Chưa có chapter nào trong Storage</div>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                Tải xuống các chương qua MangaDex API hoặc import trực tiếp từ thư mục trên máy tính của bạn để đọc và quản lý.
              </p>
            </div>
          ) : viewMode === "grid" ? (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {filteredChapters.map((chap) => {
                const isSelected = selectedChapterIds.includes(chap.id);
                return (
                  <div
                    key={chap.id}
                    onClick={(e) => handleChapterSelect(chap.id, e)}
                    onDoubleClick={() => handleOpenChapter(chap)}
                    className={`group relative p-4 rounded-2xl border transition duration-200 cursor-pointer select-none flex flex-col justify-between ${
                      isSelected
                        ? "bg-[var(--brand-orange)]/10 border-[var(--brand-orange)] ring-2 ring-[var(--brand-orange)]/30"
                        : "bg-[var(--bg-primary)] border-[var(--border-primary)] hover:border-zinc-400 dark:hover:border-zinc-700 shadow-sm hover:shadow"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className={`p-2.5 rounded-xl ${
                            isSelected ? "bg-[var(--brand-orange)] text-white" : "bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]"
                          }`}>
                            <Folder size={18} />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-[var(--text-primary)] group-hover:text-[var(--brand-orange)] transition">
                              Chapter {chap.chapter_number}
                            </h4>
                            {chap.title && (
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-1">
                                {chap.title}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Selection Checkbox */}
                        <div
                          onClick={(e) => handleChapterSelect(chap.id, e)}
                          className={`p-1 rounded-md transition ${
                            isSelected ? "text-[var(--brand-orange)]" : "text-zinc-300 dark:text-zinc-600 hover:text-zinc-500"
                          }`}
                        >
                          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5 mt-3 text-[10px] font-bold">
                        <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-[var(--text-secondary)]">
                          {chap.page_count} trang
                        </span>
                        {chap.language && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 uppercase">
                            {chap.language}
                          </span>
                        )}
                        {chap.scanlation_group && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 truncate max-w-[120px]">
                            {chap.scanlation_group}
                          </span>
                        )}
                        {chap.source === "local_import" && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            Imported
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--border-primary)]/50">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenChapter(chap);
                        }}
                        className="text-xs font-bold text-[var(--brand-orange)] hover:underline flex items-center space-x-1"
                      >
                        <span>Mở thư mục</span>
                        <ChevronRight size={13} />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenReader(chap.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold shadow-sm transition flex items-center space-x-1"
                      >
                        <Eye size={12} />
                        <span>Đọc ngay</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List / Table View */
            <div className="overflow-x-auto border border-[var(--border-primary)] rounded-2xl">
              <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                <thead className="bg-[var(--bg-primary)] uppercase text-[10px] tracking-wider border-b border-[var(--border-primary)] font-bold">
                  <tr>
                    <th className="p-3 w-10">
                      <button onClick={handleSelectAllChapters}>
                        {selectedChapterIds.length > 0 && selectedChapterIds.length === filteredChapters.length ? (
                          <CheckSquare size={16} className="text-[var(--brand-orange)]" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </th>
                    <th className="p-3">Chapter</th>
                    <th className="p-3">Title</th>
                    <th className="p-3">Language</th>
                    <th className="p-3">Scanlation Group</th>
                    <th className="p-3">Trang</th>
                    <th className="p-3 text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)]">
                  {filteredChapters.map((chap) => {
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
                              onOpenReader(chap.id);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold shadow-sm transition"
                          >
                            Đọc
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Inside Chapter: Pages Explorer */
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Sub Header for Chapter Pages */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-primary)] p-4 rounded-2xl border border-[var(--border-primary)]">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleBackToChapters}
                className="px-3 py-1.5 rounded-xl border border-[var(--border-primary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold text-[var(--text-secondary)] transition"
              >
                ← Quay lại danh sách chương
              </button>
              <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700" />
              <button
                onClick={handleSelectAllPages}
                className="text-xs font-semibold text-[var(--brand-orange)] hover:underline flex items-center space-x-1"
              >
                {selectedPageNumbers.length > 0 && selectedPageNumbers.length === activeChapterPages.length ? (
                  <CheckSquare size={14} />
                ) : (
                  <Square size={14} />
                )}
                <span>Chọn tất cả trang ({selectedPageNumbers.length}/{activeChapterPages.length})</span>
              </button>
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
              {activeChapterPages.map((page) => {
                const isSelected = selectedPageNumbers.includes(page.page_number);
                return (
                  <div
                    key={page.page_number}
                    onClick={(e) => handlePageSelect(page.page_number, e)}
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
                      <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-white text-[10px] font-black">
                        #{page.page_number}
                      </span>

                      {/* Selection checkbox */}
                      <div className="absolute top-2 right-2 p-1 rounded-md bg-black/60 backdrop-blur-sm">
                        {isSelected ? (
                          <CheckSquare size={16} className="text-[var(--brand-orange)]" />
                        ) : (
                          <Square size={16} className="text-white/70" />
                        )}
                      </div>

                      {/* Quick Read Button overlay */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenReader(activeChapter.id, page.page_number);
                        }}
                        title="Đọc từ trang này"
                        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                      >
                        <Eye size={22} className="drop-shadow" />
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
                <div className="py-20 flex flex-col items-center justify-center space-y-3">
                  <Loader2 size={32} className="animate-spin text-amber-500" />
                  <p className="text-xs text-[var(--text-secondary)]">Đang đối chiếu dữ liệu hash các trang ảnh...</p>
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-5 border-b border-[var(--border-primary)] flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Upload className="text-indigo-500" size={20} />
                <div>
                  <h3 className="text-base font-black text-[var(--text-primary)]">
                    Import Manga từ Thư mục máy tính
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Nhập dữ liệu các chapter đã tải về từ trước vào System Storage
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X size={18} />
              </button>
            </div>

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

            {scanResult && scanResult.detected_chapters.length > 0 && (
              <div className="p-4 border-t border-[var(--border-primary)] bg-[var(--bg-primary)] flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">
                  Đã chọn: <strong>{selectedImportFolders.length}</strong> chapter(s)
                </span>
                <div className="space-x-3">
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-[var(--border-primary)] text-xs font-bold text-[var(--text-secondary)]"
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
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChapterStorageManager;
