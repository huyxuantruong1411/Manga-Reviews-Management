import React, { useState, useEffect, useRef } from "react";
import { 
  Wrench, 
  Trash2, 
  Image as ImageIcon, 
  RefreshCw, 
  Check, 
  CheckSquare, 
  Square, 
  Folder, 
  AlertCircle, 
  Sparkles, 
  Layers, 
  ArrowRight, 
  ChevronDown, 
  ChevronRight,
  Info,
  CheckCircle,
  FileCheck,
  Search,
  ChevronUp
} from "lucide-react";
import client from "../api/client";
import { useAlert } from "../hooks/useAlert";

interface Manga {
  _id: string;
  title: string;
  download_path?: string | null;
  cover_url?: string | null;
}

interface DuplicateFile {
  path: string;
  relative: string;
  chapter: string;
  filename: string;
}

interface DuplicateGroup {
  hash: string;
  count: number;
  file_size: number;
  wasted_bytes: number;
  thumbnail: string | null;
  files: DuplicateFile[];
}

interface DuplicateStats {
  total_files: number;
  total_groups: number;
  total_wasted_bytes: number;
}

interface ConvertibleFile {
  path: string;
  filename: string;
  size: number;
  current_ext: string;
}

interface ConvertibleChapter {
  chapter: string;
  full_path: string;
  file_count: number;
  files: ConvertibleFile[];
}

interface ConversionStats {
  total_convertible: number;
  total_chapters: number;
  target_format: string;
}

export const ImageToolsPage: React.FC = () => {
  const { showAlert, showToast } = useAlert();
  
  // Navigation & Mode State
  const [activeTab, setActiveTab] = useState<"duplicates" | "converter">("duplicates");
  const [mangas, setMangas] = useState<Manga[]>([]);
  const [selectedMangaId, setSelectedMangaId] = useState<string>("");
  const [scanPath, setScanPath] = useState<string>("");
  const [isLoadingPath, setIsLoadingPath] = useState(false);
  const [isMangaLoading, setIsMangaLoading] = useState(true);

  // Select Manga Search and Dropdown State
  const [isMangaDropdownOpen, setIsMangaDropdownOpen] = useState(false);
  const [mangaSearchQuery, setMangaSearchQuery] = useState("");
  const mangaDropdownRef = useRef<HTMLDivElement>(null);

  // Duplicates Scanner State
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[]>([]);
  const [dupStats, setDupStats] = useState<DuplicateStats | null>(null);
  const [selectedDuplicatePaths, setSelectedDuplicatePaths] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Format Converter State
  const [isScanningConverter, setIsScanningConverter] = useState(false);
  const [targetFormat, setTargetFormat] = useState<string>(".png");
  const [convertibleChapters, setConvertibleChapters] = useState<ConvertibleChapter[]>([]);
  const [conversionStats, setConversionStats] = useState<ConversionStats | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [selectedConvertiblePaths, setSelectedConvertiblePaths] = useState<Set<string>>(new Set());
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState<any | null>(null);

  // Load list of mangas on mount
  useEffect(() => {
    const fetchMangas = async () => {
      try {
        setIsMangaLoading(true);
        const res = await client.get("/api/manga/", { params: { limit: 10000 } });
        setMangas(res.data.items || []);
      } catch (err: any) {
        console.error("Error loading mangas:", err);
        showToast("Failed to load manga list", "error");
      } finally {
        setIsMangaLoading(false);
      }
    };
    fetchMangas();
  }, []);

  // Update path when selected manga changes
  useEffect(() => {
    const resolvePath = async () => {
      if (!selectedMangaId) {
        // Fetch default base path
        try {
          setIsLoadingPath(true);
          const res = await client.get("/api/downloads/base-path");
          setScanPath(res.data.base_path || "");
        } catch (err) {
          console.error("Error loading base path:", err);
        } finally {
          setIsLoadingPath(false);
        }
        return;
      }

      try {
        setIsLoadingPath(true);
        const res = await client.get(`/api/image-tools/manga/${selectedMangaId}/download-path`);
        // If a stored path exists, use it. Otherwise, use global base_path
        if (res.data.download_path) {
          setScanPath(res.data.download_path);
        } else {
          setScanPath(res.data.base_path || "");
          showToast(`This manga has no custom download path. Using base download path.`, "info");
        }
      } catch (err: any) {
        console.error("Error resolving download path:", err);
        showToast("Failed to resolve manga download path", "error");
      } finally {
        setIsLoadingPath(false);
      }
    };

    resolvePath();
  }, [selectedMangaId]);

  // Handle outside click to close manga dropdown select
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (mangaDropdownRef.current && !mangaDropdownRef.current.contains(event.target as Node)) {
        setIsMangaDropdownOpen(false);
      }
    };
    if (isMangaDropdownOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isMangaDropdownOpen]);

  // Utility to format file sizes
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // ─── Duplicate Image Scanner Logic ───────────────────────────────────

  const handleScanDuplicates = async () => {
    if (!scanPath.trim()) {
      showToast("Please provide a valid folder path to scan", "warning");
      return;
    }
    
    try {
      setIsScanningDuplicates(true);
      setDupGroups([]);
      setDupStats(null);
      setSelectedDuplicatePaths(new Set());

      const res = await client.post("/api/image-tools/scan-duplicates", {
        path: scanPath.trim(),
        manga_id: selectedMangaId || undefined
      });

      if (res.data.error) {
        showAlert({
          title: "Scan Failed",
          message: res.data.error,
          type: "error"
        });
      } else {
        setDupGroups(res.data.groups || []);
        setDupStats(res.data.stats || null);
        showToast(`Scan complete. Found ${res.data.groups?.length || 0} duplicate groups.`, "success");
      }
    } catch (err: any) {
      console.error("Error scanning duplicates:", err);
      showAlert({
        title: "Error Scanning",
        message: err.response?.data?.detail || "An error occurred during duplicate image scanning.",
        type: "error"
      });
    } finally {
      setIsScanningDuplicates(false);
    }
  };

  const handleToggleDupFile = (path: string) => {
    const updated = new Set(selectedDuplicatePaths);
    if (updated.has(path)) {
      updated.delete(path);
    } else {
      updated.add(path);
    }
    setSelectedDuplicatePaths(updated);
  };

  // Select all duplicate files except the first one in each group
  const handleSelectAllDuplicatesExceptFirst = () => {
    const updated = new Set<string>();
    dupGroups.forEach((group) => {
      // Keep files[0] unchecked (to preserve it) and check everything else
      for (let i = 1; i < group.files.length; i++) {
        updated.add(group.files[i].path);
      }
    });
    setSelectedDuplicatePaths(updated);
    showToast("Clean Mode: Selected all redundant copies, preserving original files.", "info");
  };

  const allDupPaths = dupGroups.flatMap((group) => group.files.map((file) => file.path));
  const isAllDupsSelected = allDupPaths.length > 0 && allDupPaths.every((path) => selectedDuplicatePaths.has(path));

  const handleToggleAllDups = () => {
    if (isAllDupsSelected) {
      setSelectedDuplicatePaths(new Set());
    } else {
      setSelectedDuplicatePaths(new Set(allDupPaths));
    }
  };

  const handleDeleteSelectedDuplicates = async () => {
    if (selectedDuplicatePaths.size === 0) {
      showToast("No files selected for deletion", "warning");
      return;
    }

    // Check if any group is completely selected for deletion
    let willDeleteAllInAnyGroup = false;
    for (const group of dupGroups) {
      const allGroupSelected = group.files.every((f) => selectedDuplicatePaths.has(f.path));
      if (allGroupSelected && group.files.length > 0) {
        willDeleteAllInAnyGroup = true;
        break;
      }
    }

    if (willDeleteAllInAnyGroup) {
      const warningMessage = `CAUTION: In one or more duplicate groups, you have selected ALL copies for deletion. This means the image will be COMPLETELY deleted, leaving you with NO copies of that page. Do you still want to delete all copies?`;
      if (!window.confirm(warningMessage)) return;
    } else {
      const confirmMessage = `Are you sure you want to permanently delete these ${selectedDuplicatePaths.size} duplicate image files? This action cannot be undone!`;
      if (!window.confirm(confirmMessage)) return;
    }

    try {
      setIsDeleting(true);
      const filePathsArray = Array.from(selectedDuplicatePaths);
      const res = await client.post("/api/image-tools/delete-duplicates", {
        file_paths: filePathsArray
      });

      const { deleted_count, freed_bytes, errors } = res.data;

      // Filter local state to remove deleted files
      const updatedGroups = dupGroups.map((group) => {
        const remainingFiles = group.files.filter((f) => !selectedDuplicatePaths.has(f.path));
        const fileCountChange = group.files.length - remainingFiles.length;
        const newWasted = remainingFiles.length > 1 ? group.file_size * (remainingFiles.length - 1) : 0;
        
        return {
          ...group,
          files: remainingFiles,
          count: remainingFiles.length,
          wasted_bytes: newWasted
        };
      }).filter((group) => group.count > 1); // Keep groups that still have duplicates (if any)

      setDupGroups(updatedGroups);

      // Recalculate stats
      const newTotalWasted = updatedGroups.reduce((acc, g) => acc + g.wasted_bytes, 0);
      if (dupStats) {
        setDupStats({
          ...dupStats,
          total_groups: updatedGroups.length,
          total_wasted_bytes: newTotalWasted
        });
      }

      setSelectedDuplicatePaths(new Set());
      
      let message = `Successfully deleted ${deleted_count} files. Freed ${formatBytes(freed_bytes)}.`;
      if (errors && errors.length > 0) {
        message += ` Encounted ${errors.length} errors during deletion.`;
      }
      
      showAlert({
        title: "Deletes Completed",
        message: message,
        type: errors && errors.length > 0 ? "warning" : "success"
      });

    } catch (err: any) {
      console.error("Error deleting duplicates:", err);
      showToast("Failed to delete duplicates", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Image Format Converter Logic ───────────────────────────────────

  const handleScanConverter = async () => {
    if (!scanPath.trim()) {
      showToast("Please provide a valid folder path to scan", "warning");
      return;
    }

    try {
      setIsScanningConverter(true);
      setConvertibleChapters([]);
      setConversionStats(null);
      setSelectedConvertiblePaths(new Set());
      setConversionResult(null);

      const res = await client.post("/api/image-tools/scan-format", {
        path: scanPath.trim(),
        manga_id: selectedMangaId || undefined,
        target_format: targetFormat
      });

      if (res.data.error) {
        showAlert({
          title: "Scan Failed",
          message: res.data.error,
          type: "error"
        });
      } else {
        setConvertibleChapters(res.data.chapters || []);
        setConversionStats(res.data.stats || null);
        
        // Auto-select all found files by default for convenient conversion
        const allPaths = new Set<string>();
        res.data.chapters.forEach((ch: ConvertibleChapter) => {
          ch.files.forEach((f) => allPaths.add(f.path));
        });
        setSelectedConvertiblePaths(allPaths);

        showToast(`Scan complete. Found ${res.data.stats?.total_convertible || 0} convertible files.`, "success");
      }
    } catch (err: any) {
      console.error("Error scanning for format conversion:", err);
      showAlert({
        title: "Error Scanning",
        message: err.response?.data?.detail || "An error occurred during format scanning.",
        type: "error"
      });
    } finally {
      setIsScanningConverter(false);
    }
  };

  const handleToggleConvertChapter = (chapter: ConvertibleChapter) => {
    const updated = new Set(selectedConvertiblePaths);
    const chapterPaths = chapter.files.map((f) => f.path);
    const allSelected = chapterPaths.every((path) => updated.has(path));

    if (allSelected) {
      // Deselect all in this chapter
      chapterPaths.forEach((path) => updated.delete(path));
    } else {
      // Select all in this chapter
      chapterPaths.forEach((path) => updated.add(path));
    }
    setSelectedConvertiblePaths(updated);
  };

  const handleToggleConvertFile = (path: string) => {
    const updated = new Set(selectedConvertiblePaths);
    if (updated.has(path)) {
      updated.delete(path);
    } else {
      updated.add(path);
    }
    setSelectedConvertiblePaths(updated);
  };

  const handleToggleExpandChapter = (chapName: string) => {
    const updated = new Set(expandedChapters);
    if (updated.has(chapName)) {
      updated.delete(chapName);
    } else {
      updated.add(chapName);
    }
    setExpandedChapters(updated);
  };

  const handleConvertImages = async () => {
    if (selectedConvertiblePaths.size === 0) {
      showToast("No files selected for conversion", "warning");
      return;
    }

    try {
      setIsConverting(true);
      setConversionResult(null);

      const res = await client.post("/api/image-tools/convert-format", {
        file_paths: Array.from(selectedConvertiblePaths),
        target_format: targetFormat
      });

      if (res.data.error) {
        showAlert({
          title: "Conversion Failed",
          message: res.data.error,
          type: "error"
        });
      } else {
        setConversionResult(res.data);
        
        // Remove successfully converted files from the local list
        const convertedCount = res.data.converted || 0;
        
        // Simple re-scan to clean list or filter out successfully converted
        // Let's perform a re-scan automatically to show the updated status
        showToast(`Successfully converted ${convertedCount} images to ${targetFormat.toUpperCase()}`, "success");
        handleScanConverter();
      }
    } catch (err: any) {
      console.error("Error converting images:", err);
      showAlert({
        title: "Conversion Error",
        message: err.response?.data?.detail || "An error occurred during image conversion.",
        type: "error"
      });
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-tr from-[var(--brand-orange)] to-[var(--brand-coral)] text-white rounded-xl shadow-md">
            <Wrench size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-spartan font-extrabold tracking-tight">Image Tools</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Scan duplicate credits/pages and convert image formats to optimize manga storage.
            </p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-[var(--bg-primary)] p-1 rounded-xl border border-[var(--border-primary)] self-start md:self-auto shadow-sm">
          <button
            onClick={() => setActiveTab("duplicates")}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === "duplicates"
                ? "bg-[var(--bg-card)] text-[var(--brand-orange)] border border-[var(--border-primary)] shadow-sm font-bold"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Layers size={16} />
            <span>Duplicate Scanner</span>
          </button>
          <button
            onClick={() => setActiveTab("converter")}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === "converter"
                ? "bg-[var(--bg-card)] text-[var(--brand-orange)] border border-[var(--border-primary)] shadow-sm font-bold"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <ImageIcon size={16} />
            <span>Format Converter</span>
          </button>
        </div>
      </div>

      {/* Shared Configuration Panel */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold flex items-center space-x-2">
          <Folder size={18} className="text-[var(--brand-orange)]" />
          <span>Folder Selection & Directory Source</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Select Manga */}
          <div className="md:col-span-1 relative" ref={mangaDropdownRef}>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Select Target Manga
            </label>
            
            {/* Custom Dropdown Trigger */}
            <div
              onClick={() => !isMangaLoading && setIsMangaDropdownOpen(!isMangaDropdownOpen)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-zinc-400 dark:hover:border-zinc-600 transition cursor-pointer select-none text-sm text-[var(--text-primary)] ${
                isMangaLoading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <span className="truncate">
                {mangas.find(m => m._id === selectedMangaId)?.title || "-- Custom Path / All Directories --"}
              </span>
              <span className="text-[var(--text-secondary)] flex-shrink-0 ml-2">
                {isMangaDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </span>
            </div>

            {/* Dropdown Panel */}
            {isMangaDropdownOpen && (
              <div className="absolute z-50 left-0 right-0 mt-2 p-3 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl shadow-xl space-y-3 flex flex-col max-h-80">
                {/* Search Box */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-zinc-400" size={14} />
                  <input
                    type="text"
                    value={mangaSearchQuery}
                    onChange={(e) => setMangaSearchQuery(e.target.value)}
                    placeholder="Search manga..."
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition"
                    autoFocus
                  />
                </div>

                {/* Option list */}
                <div className="overflow-y-auto flex-1 max-h-48 space-y-0.5 pr-1">
                  {/* Default Custom Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMangaId("");
                      setIsMangaDropdownOpen(false);
                      setMangaSearchQuery("");
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-[var(--bg-primary)] transition ${
                      selectedMangaId === "" ? "text-[var(--brand-orange)] bg-[var(--brand-orange)]/5 font-bold" : "text-[var(--text-primary)]"
                    }`}
                  >
                    -- Custom Path / All Directories --
                  </button>

                  {/* Filtered list */}
                  {(() => {
                    const filtered = mangas.filter(m => 
                      m.title.toLowerCase().includes(mangaSearchQuery.toLowerCase())
                    );
                    if (filtered.length === 0) {
                      return <div className="text-zinc-500 text-xs py-2 text-center">No match found</div>;
                    }
                    return filtered.map((manga) => {
                      const isSelected = selectedMangaId === manga._id;
                      return (
                        <button
                          key={manga._id}
                          type="button"
                          onClick={() => {
                            setSelectedMangaId(manga._id);
                            setIsMangaDropdownOpen(false);
                            setMangaSearchQuery("");
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-[var(--bg-primary)] transition ${
                            isSelected ? "text-[var(--brand-orange)] bg-[var(--brand-orange)]/5 font-bold" : "text-[var(--text-primary)]"
                          }`}
                        >
                          {manga.title}
                        </button>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Directory Path Input */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
              Folder Path to Scan
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={scanPath}
                onChange={(e) => setScanPath(e.target.value)}
                placeholder="e.g. D:/Manga/output/Solo Leveling"
                className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] font-mono text-sm transition"
              />
              
              {/* Scan Trigger Button */}
              <button
                onClick={activeTab === "duplicates" ? handleScanDuplicates : handleScanConverter}
                disabled={isScanningDuplicates || isScanningConverter || isLoadingPath}
                className="px-6 py-2.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {(isScanningDuplicates || isScanningConverter) ? (
                  <RefreshCw size={18} className="animate-spin" />
                ) : (
                  <Sparkles size={18} />
                )}
                <span>Scan Path</span>
              </button>
            </div>
            
            {isLoadingPath && (
              <p className="text-xs text-[var(--text-secondary)] mt-1 animate-pulse">
                Resolving stored download path...
              </p>
            )}
          </div>
        </div>

        {/* Small Notice */}
        <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl flex items-start space-x-2.5">
          <Info size={16} className="text-[var(--brand-orange)] mt-0.5 flex-shrink-0" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            The scanner runs efficiently using CPU multi-threading. If you choose a specific manga, its registered path will be fetched from database records automatically. Any modifications to this path can also be typed manually in the input above.
          </p>
        </div>
      </div>

      {/* ─── TAB 1: DUPLICATE IMAGE SCANNER CONTENT ─────────────────────────── */}
      {activeTab === "duplicates" && (
        <div className="space-y-6">
          {/* Scanning Overlay / Loader */}
          {isScanningDuplicates && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-12 text-center shadow-sm space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-[var(--border-primary)]"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-[var(--brand-orange)] animate-spin"></div>
              </div>
              <div>
                <h3 className="text-lg font-bold">Scanning for Duplicate Images</h3>
                <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mt-1">
                  Computing MD5 hashes in parallel across image folders. This processes hundreds of files in seconds...
                </p>
              </div>
            </div>
          )}

          {/* Stats & Actions Bar when duplicates found */}
          {dupStats && dupGroups.length > 0 && !isScanningDuplicates && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4 md:p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Scan Results: {dupStats.total_files} Total Files Scanned
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center space-x-1.5 bg-rose-50 dark:bg-rose-950/20 px-3 py-1 rounded-lg border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-sm font-bold">
                    <span>{dupStats.total_groups} Duplicate Groups</span>
                  </div>
                  <div className="flex items-center space-x-1.5 bg-orange-50 dark:bg-orange-950/20 px-3 py-1 rounded-lg border border-orange-100 dark:border-orange-900/30 text-[var(--brand-orange)] text-sm font-bold">
                    <span>{formatBytes(dupStats.total_wasted_bytes)} Waste Space</span>
                  </div>
                </div>
              </div>

              {/* Bulk operations */}
              <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto">
                <button
                  onClick={handleToggleAllDups}
                  className="flex-1 md:flex-initial px-4 py-2 border border-[var(--border-primary)] hover:border-[var(--brand-orange)] bg-[var(--bg-primary)] hover:bg-[var(--bg-card)] rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
                  title={isAllDupsSelected ? "Deselect All" : "Select All"}
                >
                  {isAllDupsSelected ? <Square size={14} /> : <CheckSquare size={14} />}
                  <span>{isAllDupsSelected ? "Deselect All" : "Select All"}</span>
                </button>
                <button
                  onClick={handleSelectAllDuplicatesExceptFirst}
                  className="flex-1 md:flex-initial px-4 py-2 border border-[var(--border-primary)] hover:border-[var(--brand-orange)] bg-[var(--bg-primary)] hover:bg-[var(--bg-card)] rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
                  title="Select all redundant pages, keeping only the first original of each group"
                >
                  <Layers size={14} />
                  <span>Clean Mode (Keep 1st)</span>
                </button>
                <button
                  onClick={handleDeleteSelectedDuplicates}
                  disabled={selectedDuplicatePaths.size === 0 || isDeleting}
                  className="flex-1 md:flex-initial px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-zinc-400 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  <span>Delete Selected ({selectedDuplicatePaths.size})</span>
                </button>
              </div>
            </div>
          )}

          {/* Duplicates Groups List */}
          {dupGroups.length > 0 && !isScanningDuplicates && (
            <div className="space-y-4">
              {dupGroups.map((group, groupIndex) => (
                <div 
                  key={group.hash}
                  className="bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-zinc-300 dark:hover:border-zinc-700 rounded-2xl p-4 md:p-6 transition shadow-sm flex flex-col md:flex-row gap-5"
                >
                  {/* Image Preview Thumbnail */}
                  <div className="relative w-24 h-36 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center group/thumb self-center md:self-start shadow-inner">
                    {group.thumbnail ? (
                      <img 
                        src={`data:image/jpeg;base64,${group.thumbnail}`}
                        alt="Duplicate preview"
                        className="w-full h-full object-cover transform group-hover/thumb:scale-110 transition duration-300"
                      />
                    ) : (
                      <ImageIcon size={32} className="text-[var(--text-secondary)] opacity-45" />
                    )}
                    <div className="absolute bottom-1 right-1 bg-black/65 backdrop-blur-sm text-[10px] text-white px-1.5 py-0.5 rounded font-mono">
                      {formatBytes(group.file_size, 0)}
                    </div>
                  </div>

                  {/* Duplicate Group Files & Actions */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="space-y-2">
                      {(() => {
                        const isGroupAllSelected = group.files.every((f) => selectedDuplicatePaths.has(f.path));
                        const handleToggleGroupAll = () => {
                          const updated = new Set(selectedDuplicatePaths);
                          const groupPaths = group.files.map((f) => f.path);
                          if (isGroupAllSelected) {
                            groupPaths.forEach((path) => updated.delete(path));
                          } else {
                            groupPaths.forEach((path) => updated.add(path));
                          }
                          setSelectedDuplicatePaths(updated);
                        };

                        return (
                          <div className="flex items-center justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-bold flex items-center space-x-2">
                                <span className="text-[var(--text-secondary)] font-spartan">Group #{groupIndex + 1}</span>
                                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                                <span className="text-rose-500 font-semibold">{group.count} copies</span>
                              </h4>
                              
                              <button
                                type="button"
                                onClick={handleToggleGroupAll}
                                className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold border transition duration-155 select-none ${
                                  isGroupAllSelected
                                    ? "bg-[var(--brand-orange)]/10 border-[var(--brand-orange)]/30 text-[var(--brand-orange)]"
                                    : "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-zinc-500"
                                }`}
                              >
                                {isGroupAllSelected ? <CheckSquare size={11} /> : <Square size={11} />}
                                <span>{isGroupAllSelected ? "Group Deselect All" : "Group Select All"}</span>
                              </button>
                            </div>
                            
                            <span className="text-xs text-[var(--text-secondary)] font-mono font-semibold bg-[var(--bg-primary)] px-2.5 py-1 border border-[var(--border-primary)] rounded-lg">
                              Wasted: {formatBytes(group.wasted_bytes)}
                            </span>
                          </div>
                        );
                      })()}
                      
                      <div className="border border-[var(--border-primary)] rounded-xl overflow-hidden divide-y divide-[var(--border-primary)] bg-[var(--bg-primary)]">
                        {group.files.map((file, fileIdx) => {
                          const isSelected = selectedDuplicatePaths.has(file.path);
                          return (
                            <div 
                              key={file.path} 
                              className={`flex items-center justify-between p-3 gap-3 transition-colors ${
                                isSelected 
                                  ? "bg-rose-500/5 dark:bg-rose-500/10" 
                                  : "hover:bg-[var(--bg-card)]"
                              }`}
                            >
                              <div className="flex items-center space-x-3 min-w-0">
                                {/* Custom Checkbox */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleDupFile(file.path)}
                                  className={`p-1.5 rounded transition ${
                                    isSelected 
                                      ? "text-rose-500" 
                                      : "text-[var(--text-secondary)] hover:text-zinc-500"
                                  }`}
                                  title={isSelected ? "Deselect from deletion list" : "Select for deletion"}
                                >
                                  {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                                </button>
                                
                                <div className="text-xs min-w-0 leading-relaxed">
                                  <div className="font-bold flex items-center space-x-2">
                                    <span className="text-[var(--brand-orange)] font-semibold truncate">
                                      {file.chapter}
                                    </span>
                                    <span className="text-zinc-300 dark:text-zinc-700">/</span>
                                    <span className="text-[var(--text-primary)] truncate font-semibold">
                                      {file.filename}
                                    </span>
                                    {fileIdx === 0 && (
                                      <span className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-[9px] px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/30 uppercase font-bold tracking-wider">
                                        Original
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-[var(--text-secondary)] font-mono truncate max-w-xl md:max-w-2xl mt-0.5" title={file.path}>
                                    {file.path}
                                  </p>
                                </div>
                              </div>

                              {/* Individual deletion button (only if not original or if confirmed) */}
                              <button
                                onClick={async () => {
                                  if (fileIdx === 0) {
                                    const confirm = window.confirm("This is flagged as the 'Original' copy in this duplicate group. Deleting it might leave you without this page. Are you sure?");
                                    if (!confirm) return;
                                  } else {
                                    if (!window.confirm("Permanently delete this file?")) return;
                                  }
                                  try {
                                    const res = await client.post("/api/image-tools/delete-duplicates", {
                                      file_paths: [file.path]
                                    });
                                    if (res.data.deleted_count > 0) {
                                      showToast("Deleted duplicate successfully", "success");
                                      // Remove just this file locally
                                      const updatedFiles = group.files.filter((f) => f.path !== file.path);
                                      const newWasted = updatedFiles.length > 1 ? group.file_size * (updatedFiles.length - 1) : 0;
                                      
                                      const updatedGroups = dupGroups.map((g) => {
                                        if (g.hash === group.hash) {
                                          return {
                                            ...g,
                                            files: updatedFiles,
                                            count: updatedFiles.length,
                                            wasted_bytes: newWasted
                                          };
                                        }
                                        return g;
                                      }).filter((g) => g.count > 1);

                                      setDupGroups(updatedGroups);
                                      
                                      // Recalculate stats
                                      const newTotalWasted = updatedGroups.reduce((acc, g) => acc + g.wasted_bytes, 0);
                                      if (dupStats) {
                                        setDupStats({
                                          ...dupStats,
                                          total_groups: updatedGroups.length,
                                          total_wasted_bytes: newTotalWasted
                                        });
                                      }
                                    }
                                  } catch (err) {
                                    showToast("Failed to delete file", "error");
                                  }
                                }}
                                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition"
                                title="Delete Single File"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty States */}
          {dupStats && dupGroups.length === 0 && !isScanningDuplicates && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-12 text-center shadow-sm space-y-4">
              <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">No Duplicates Found</h3>
                <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
                  Awesome! All image files inside the directory are unique. Storage is fully optimized.
                </p>
              </div>
            </div>
          )}

          {/* Initial State */}
          {!dupStats && !isScanningDuplicates && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-12 text-center shadow-sm space-y-4">
              <div className="w-16 h-16 bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded-full flex items-center justify-center mx-auto border border-[var(--border-primary)]">
                <Layers size={28} className="opacity-70" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">Duplicate credits/pages scanner</h3>
                <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
                  Select a manga above or type a custom directory path and click "Scan Path" to locate exact duplicate images across chapters (e.g. credits pages, repeating translation ads).
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: IMAGE FORMAT CONVERTER CONTENT ──────────────────────────── */}
      {activeTab === "converter" && (
        <div className="space-y-6">
          {/* Format Settings Bar */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Conversion Configuration
            </h3>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center space-x-3 bg-[var(--bg-primary)] border border-[var(--border-primary)] px-4 py-2 rounded-xl">
                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase">Target Format</span>
                <select
                  value={targetFormat}
                  onChange={(e) => setTargetFormat(e.target.value)}
                  className="bg-transparent text-sm font-bold text-[var(--brand-orange)] focus:outline-none cursor-pointer"
                >
                  <option value=".png">PNG (.png)</option>
                  <option value=".jpg">JPEG (.jpg)</option>
                </select>
              </div>

              <p className="text-xs text-[var(--text-secondary)] max-w-lg leading-normal">
                This utility scans for any images that do <strong>not</strong> match your chosen target format. Converting non-matching formats keeps your manga library pages uniform and helps save disk space (especially when converting to optimized JPEGs).
              </p>
            </div>
          </div>

          {/* Scanning Loader */}
          {isScanningConverter && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-12 text-center shadow-sm space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-[var(--border-primary)]"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-[var(--brand-orange)] animate-spin"></div>
              </div>
              <div>
                <h3 className="text-lg font-bold">Scanning for Non-Target Formats</h3>
                <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mt-1">
                  Walking through subfolders to find images matching formats other than {targetFormat.toUpperCase()}...
                </p>
              </div>
            </div>
          )}

          {/* Stats Bar */}
          {conversionStats && convertibleChapters.length > 0 && !isScanningConverter && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Conversion Status
                </span>
                <h4 className="text-lg font-bold flex items-center space-x-2 mt-0.5">
                  <span className="text-[var(--brand-orange)]">{conversionStats.total_convertible} convertible images</span>
                  <span className="text-zinc-300 dark:text-zinc-700">•</span>
                  <span>{conversionStats.total_chapters} chapters affected</span>
                </h4>
              </div>

              <button
                onClick={handleConvertImages}
                disabled={selectedConvertiblePaths.size === 0 || isConverting}
                className="w-full md:w-auto px-6 py-3 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] disabled:bg-zinc-400 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isConverting ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <FileCheck size={16} />
                )}
                <span>Convert Selected ({selectedConvertiblePaths.size}) to {targetFormat.toUpperCase()}</span>
              </button>
            </div>
          )}

          {/* Conversion results report card */}
          {conversionResult && !isScanningConverter && (
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center space-x-1.5">
                <CheckCircle size={16} />
                <span>Conversion Report Summary</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div className="bg-[var(--bg-card)] p-3 border border-[var(--border-primary)] rounded-xl space-y-0.5">
                  <span className="text-[var(--text-secondary)] uppercase">Successfully Converted</span>
                  <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">{conversionResult.converted}</p>
                </div>
                <div className="bg-[var(--bg-card)] p-3 border border-[var(--border-primary)] rounded-xl space-y-0.5">
                  <span className="text-[var(--text-secondary)] uppercase">Failed / Skipped</span>
                  <p className="text-lg font-extrabold text-rose-500">{conversionResult.failed}</p>
                </div>
                <div className="bg-[var(--bg-card)] p-3 border border-[var(--border-primary)] rounded-xl space-y-0.5">
                  <span className="text-[var(--text-secondary)] uppercase">Previous Size</span>
                  <p className="text-lg font-extrabold text-[var(--text-primary)]">{formatBytes(conversionResult.total_old_size)}</p>
                </div>
                <div className="bg-[var(--bg-card)] p-3 border border-[var(--border-primary)] rounded-xl space-y-0.5">
                  <span className="text-[var(--text-secondary)] uppercase">Converted Size</span>
                  <p className="text-lg font-extrabold text-[var(--brand-orange)]">
                    {formatBytes(conversionResult.total_new_size)}
                    {conversionResult.total_old_size > conversionResult.total_new_size && (
                      <span className="text-[10px] text-emerald-500 ml-1.5 font-semibold">
                        (-{Math.round(((conversionResult.total_old_size - conversionResult.total_new_size) / conversionResult.total_old_size) * 100)}%)
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {conversionResult.errors && conversionResult.errors.length > 0 && (
                <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Errors Encountered:</span>
                  <ul className="list-disc pl-4 text-[10px] text-rose-700 dark:text-rose-300 space-y-0.5">
                    {conversionResult.errors.map((errStr: string, idx: number) => (
                      <li key={idx} className="truncate">{errStr}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Chapters/Folders Accordion */}
          {convertibleChapters.length > 0 && !isScanningConverter && (
            <div className="space-y-3">
              {convertibleChapters.map((ch) => {
                const isExpanded = expandedChapters.has(ch.chapter);
                const filePaths = ch.files.map((f) => f.path);
                const selectedCount = filePaths.filter((path) => selectedConvertiblePaths.has(path)).length;
                const isAllSelected = selectedCount === ch.files.length;
                const isSomeSelected = selectedCount > 0 && selectedCount < ch.files.length;

                return (
                  <div 
                    key={ch.chapter}
                    className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl overflow-hidden shadow-sm"
                  >
                    {/* Chapter Accordion Header */}
                    <div 
                      onClick={() => handleToggleExpandChapter(ch.chapter)}
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-primary)] transition select-none gap-4"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        {/* Checkbox for Chapter Selection */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleConvertChapter(ch);
                          }}
                          className={`p-1.5 rounded transition ${
                            isAllSelected 
                              ? "text-[var(--brand-orange)]" 
                              : isSomeSelected 
                                ? "text-orange-400" 
                                : "text-[var(--text-secondary)] hover:text-zinc-500"
                          }`}
                        >
                          {isAllSelected ? (
                            <CheckSquare size={18} />
                          ) : isSomeSelected ? (
                            <span className="w-[18px] h-[18px] border-2 border-orange-400 rounded flex items-center justify-center font-bold text-xs">-</span>
                          ) : (
                            <Square size={18} />
                          )}
                        </button>

                        <div className="min-w-0">
                          <h4 className="text-sm font-bold flex items-center space-x-2">
                            <span className="text-[var(--brand-orange)]">{ch.chapter}</span>
                            <span className="text-zinc-300 dark:text-zinc-700">•</span>
                            <span className="text-xs text-[var(--text-secondary)] font-normal">
                              {ch.file_count} images to convert ({selectedCount} selected)
                            </span>
                          </h4>
                          <p className="text-[10px] text-[var(--text-secondary)] truncate font-mono mt-0.5" title={ch.full_path}>
                            {ch.full_path}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 flex-shrink-0">
                        <span className="text-xs text-[var(--text-secondary)] font-semibold bg-[var(--bg-primary)] border border-[var(--border-primary)] px-2.5 py-1 rounded-lg">
                          Size: {formatBytes(ch.files.reduce((acc, f) => acc + f.size, 0))}
                        </span>
                        <ChevronDown 
                          size={18} 
                          className={`text-[var(--text-secondary)] transform transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`} 
                        />
                      </div>
                    </div>

                    {/* Chapter Files List (Expanded content) */}
                    {isExpanded && (
                      <div className="border-t border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 divide-y divide-[var(--border-primary)]/50">
                        {ch.files.map((file) => {
                          const isFileSelected = selectedConvertiblePaths.has(file.path);
                          return (
                            <div 
                              key={file.path}
                              className="py-2.5 flex items-center justify-between gap-4 text-xs"
                            >
                              <div className="flex items-center space-x-3 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleConvertFile(file.path)}
                                  className={`p-1.5 rounded transition ${
                                    isFileSelected 
                                      ? "text-[var(--brand-orange)]" 
                                      : "text-[var(--text-secondary)] hover:text-zinc-500"
                                  }`}
                                >
                                  {isFileSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                </button>
                                <span className="font-semibold text-[var(--text-primary)] truncate">
                                  {file.filename}
                                </span>
                                <span className="bg-red-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase font-bold">
                                  {file.current_ext.substring(1)}
                                </span>
                              </div>

                              <div className="flex items-center space-x-3 text-[var(--text-secondary)] font-semibold flex-shrink-0">
                                <span>{formatBytes(file.size)}</span>
                                <ArrowRight size={12} />
                                <span className="text-[var(--brand-orange)] uppercase">{targetFormat.substring(1)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty States */}
          {conversionStats && convertibleChapters.length === 0 && !isScanningConverter && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-12 text-center shadow-sm space-y-4">
              <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle size={32} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">All Files Match Target Format</h3>
                <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
                  Awesome! All image files inside the directory are already in {targetFormat.toUpperCase()} format. No conversions needed.
                </p>
              </div>
            </div>
          )}

          {/* Initial State */}
          {!conversionStats && !isScanningConverter && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-12 text-center shadow-sm space-y-4">
              <div className="w-16 h-16 bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded-full flex items-center justify-center mx-auto border border-[var(--border-primary)]">
                <ImageIcon size={28} className="opacity-70" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">Image format uniform converter</h3>
                <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
                  Select a manga or type a directory path, choose a target format (PNG or JPEG), and click "Scan Path" to scan for images of different formats to convert.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageToolsPage;
