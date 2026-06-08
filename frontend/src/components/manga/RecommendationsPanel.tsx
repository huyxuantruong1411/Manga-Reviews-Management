import React, { useState, useEffect } from "react";
import { Compass, BookOpen, AlertTriangle, Download, ExternalLink, RefreshCw } from "lucide-react";
import client from "../../api/client";
import { useAlert } from "../../hooks/useAlert";

interface RecommendedManga {
  mangadex_id: string;
  score: number;
  title: string;
  author: string;
  artist: string;
  cover_url: string | null;
  status: string | null;
  year: string | null;
  local_manga_id: string | null;
  local_read_status?: string | null;
}

interface RecommendationsPanelProps {
  mangaId: string;
  onRecommendationsCountChange?: (count: number) => void;
}

export const RecommendationsPanel: React.FC<RecommendationsPanelProps> = ({ mangaId, onRecommendationsCountChange }) => {
  const [recommendations, setRecommendations] = useState<RecommendedManga[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [showExternal, setShowExternal] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"match_desc" | "match_asc" | "year_desc" | "year_asc" | "status">("match_desc");
  const [showRelevance, setShowRelevance] = useState(false);
  const [selectedPublishStatuses, setSelectedPublishStatuses] = useState<string[]>([]);
  const [selectedReadStatuses, setSelectedReadStatuses] = useState<string[]>([]);
  const { showAlert } = useAlert();

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSyncLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
  };

  const fetchRecommendations = async (force: boolean = false) => {
    let statusInterval: any = null;
    try {
      if (force) {
        setRefreshing(true);
        setSyncLogs([]);
        setSyncProgress(5);
        addLog("Initializing recommendations sync...");
        
        let tick = 0;
        statusInterval = setInterval(() => {
          tick++;
          setSyncProgress(prev => Math.min(prev + 10, 95));
          if (tick === 1) addLog("Connecting to MangaDex recommendation API...");
          if (tick === 2) addLog("Deduplicating matched library titles...");
          if (tick === 3) addLog("Querying external covers and basic metadata...");
          if (tick === 4) addLog("Structuring cache records...");
          if (tick === 5) addLog("Saving cached recommendations to MongoDB...");
        }, 1500);
      } else {
        setLoading(true);
      }
      
      const endpoint = force 
        ? `/api/manga/${mangaId}/recommendations/sync` 
        : `/api/manga/${mangaId}/recommendations`;
        
      const res = await (force ? client.post(endpoint) : client.get(endpoint));
      if (statusInterval) clearInterval(statusInterval);
      
      if (force) {
        setSyncProgress(100);
        addLog("Recommendations sync complete!");
      }
      
      // Handle the different return format from force sync endpoint
      let data = [];
      if (force && res.data.status === "success") {
        const fetchRes = await client.get(`/api/manga/${mangaId}/recommendations`);
        data = fetchRes.data;
      } else {
        data = res.data;
      }
      
      setRecommendations(data);
      if (onRecommendationsCountChange) {
        onRecommendationsCountChange(data.length);
      }
    } catch (err) {
      if (statusInterval) clearInterval(statusInterval);
      if (force) {
        setSyncProgress(100);
        addLog("Failed to sync recommendations.");
      }
      console.error("Failed to fetch recommendations:", err);
      showAlert({
        title: "Error",
        message: "Failed to load recommendations.",
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (mangaId) {
      fetchRecommendations();
    }
  }, [mangaId]);

  const handleImport = async (mangadexId: string, title: string) => {
    try {
      setImportingId(mangadexId);
      showAlert({
        title: "Importing Manga",
        message: `Importing '${title}' from MangaDex to library...`,
        type: "info",
      });
      
      const res = await client.post("/api/manga/import-from-recommendation", {
        mangadex_id: mangadexId
      });
      
      const newLocalId = res.data._id || res.data.id;
      
      showAlert({
        title: "Import Successful",
        message: `'${title}' has been successfully added to your library.`,
        type: "success",
      });

      // Animate card migration from Section 2 to Section 1
      setRecommendations(prev =>
        prev.map(item =>
          item.mangadex_id === mangadexId
            ? { ...item, local_manga_id: newLocalId, local_read_status: "unread" }
            : item
        )
      );
    } catch (err: any) {
      console.error("Failed to import manga:", err);
      showAlert({
        title: "Import Failed",
        message: err.response?.data?.detail || "An error occurred while importing.",
        type: "error",
      });
    } finally {
      setImportingId(null);
    }
  };

  // Helper to format status strings (e.g. plan_to_read -> Plan to Read)
  const formatStatusString = (status: string | null | undefined): string => {
    if (!status) return "Unknown";
    const s = status.toLowerCase().replace(/_/g, " ").trim();
    return s
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Helper for reading status badge styling (Library status) - SOLID STYLE
  const getReadStatusBadgeClass = (status: string | null) => {
    const s = (status || "").toLowerCase();
    const base = "px-2.5 py-1 text-[11px] font-extrabold rounded-lg text-white shadow-md select-none ";
    switch (s) {
      case "completed":
        return base + "bg-green-600 dark:bg-green-700";
      case "reading":
        return base + "bg-blue-600 dark:bg-blue-700";
      case "dropped":
        return base + "bg-red-600 dark:bg-red-700";
      case "on_hold":
        return "px-2.5 py-1 text-[11px] font-extrabold rounded-lg bg-amber-500 text-black dark:bg-amber-600 dark:text-white shadow-md select-none";
      case "plan_to_read":
        return base + "bg-purple-650 dark:bg-purple-700";
      case "re_reading":
        return base + "bg-pink-600 dark:bg-pink-700";
      default:
        return base + "bg-zinc-600 dark:bg-zinc-700";
    }
  };

  // Helper for publication status badge styling - OUTLINE STYLE
  const getStatusBadgeClass = (status: string | null) => {
    const s = (status || "").toLowerCase();
    const base = "px-2.5 py-1 text-[11px] font-extrabold rounded-lg border shadow-sm select-none ";
    switch (s) {
      case "completed":
        return base + "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 dark:bg-emerald-500/10";
      case "ongoing":
        return base + "border-sky-500 text-sky-600 dark:text-sky-400 bg-sky-500/5 dark:bg-sky-500/10";
      case "hiatus":
        return base + "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/5 dark:bg-amber-500/10";
      case "cancelled":
        return base + "border-red-500 text-red-600 dark:text-red-400 bg-red-500/5 dark:bg-red-500/10";
      default:
        return base + "border-zinc-500 text-zinc-600 dark:text-zinc-400 bg-zinc-500/5 dark:bg-zinc-500/10";
    }
  };

  // Helper for recommendation strength color / label
  const getScoreInfo = (score: number) => {
    const normalized = score <= 1 ? score * 100 : score;
    const percentage = normalized % 1 === 0 ? normalized.toFixed(0) : parseFloat(normalized.toFixed(2)).toString();
    const label = `${percentage}%`;

    if (normalized >= 80) return { label, color: "bg-emerald-600 dark:bg-emerald-700 text-white" };
    if (normalized >= 50) return { label, color: "bg-teal-600 dark:bg-teal-700 text-white" };
    if (normalized >= 30) return { label, color: "bg-amber-500 dark:bg-amber-600 text-zinc-950 dark:text-black" };
    return { label, color: "bg-zinc-600 dark:bg-zinc-700 text-white" };
  };

  // Sort recommendations helper
  const sortRecs = (list: RecommendedManga[]) => {
    return [...list].sort((a, b) => {
      if (sortBy === "match_desc") return b.score - a.score;
      if (sortBy === "match_asc") return a.score - b.score;
      if (sortBy === "year_desc") {
        const yA = a.year && a.year !== "N/A" ? parseInt(a.year) : 0;
        const yB = b.year && b.year !== "N/A" ? parseInt(b.year) : 0;
        return yB - yA;
      }
      if (sortBy === "year_asc") {
        const yA = a.year && a.year !== "N/A" ? parseInt(a.year) : 9999;
        const yB = b.year && b.year !== "N/A" ? parseInt(b.year) : 9999;
        return yA - yB;
      }
      if (sortBy === "status") {
        const sA = (a.status || "").toLowerCase();
        const sB = (b.status || "").toLowerCase();
        return sA.localeCompare(sB);
      }
      return 0;
    });
  };

  // Get unique publication statuses from current recommendations list
  const uniquePublishStatuses = Array.from(
    new Set(recommendations.map(r => r.status || "Unknown"))
  ).filter(Boolean);

  // Get unique reading statuses from current recommendations list
  const uniqueReadStatuses = Array.from(
    new Set(recommendations.map(r => r.local_read_status || "Not in Library"))
  ).filter(Boolean);

  // Filter helper to support combination filtering
  const filterRecs = (list: RecommendedManga[]) => {
    return list.filter(r => {
      // Apply publishing status filter
      if (selectedPublishStatuses.length > 0) {
        const publishStatus = r.status || "Unknown";
        if (!selectedPublishStatuses.includes(publishStatus)) {
          return false;
        }
      }
      
      // Apply reading status filter
      if (selectedReadStatuses.length > 0) {
        const readStatus = r.local_read_status || "Not in Library";
        if (!selectedReadStatuses.includes(readStatus)) {
          return false;
        }
      }
      
      return true;
    });
  };

  // Group, filter and sort recommendations
  const filteredRecommendations = filterRecs(recommendations);
  const localRecs = sortRecs(filteredRecommendations.filter(r => r.local_manga_id !== null));
  const externalRecs = sortRecs(filteredRecommendations.filter(r => r.local_manga_id === null));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-6 w-40 bg-[var(--border-primary)] rounded animate-pulse" />
          <div className="h-10 w-24 bg-[var(--border-primary)] rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] w-full bg-[var(--border-primary)] rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-primary)] pb-4">
        <div>
          <h3 className="text-lg font-bold text-[var(--text-primary)]">Recommended Titles</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Suggested reading matching theme, style, and demographic from MangaDex users.
          </p>
        </div>
      </div>

      {/* Controls & Filters Panel */}
      <div className="p-4 bg-zinc-50 dark:bg-zinc-900/40 border border-[var(--border-primary)] rounded-2xl flex flex-col gap-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-wrap">
            {/* Sorting */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--text-secondary)]">Sort By:</span>
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] cursor-pointer"
              >
                <option value="match_desc">Match % (High to Low)</option>
                <option value="match_asc">Match % (Low to High)</option>
                <option value="year_desc">Release Year (Newest)</option>
                <option value="year_asc">Release Year (Oldest)</option>
                <option value="status">Publication Status</option>
              </select>
            </div>

            {/* Relevance Score Toggle */}
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showRelevance}
                onChange={(e) => setShowRelevance(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border-primary)] text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] cursor-pointer"
              />
              Show Relevance Score
            </label>
          </div>

          <button
            onClick={() => fetchRecommendations(true)}
            disabled={refreshing}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--brand-orange)] text-[var(--text-primary)] disabled:opacity-50 font-medium rounded-xl transition-all cursor-pointer shadow-sm text-xs"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Syncing..." : "Sync Recs"}
          </button>
        </div>

        {/* Dynamic Filters */}
        {(uniquePublishStatuses.length > 0 || uniqueReadStatuses.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[var(--border-primary)] pt-3">
            {/* Publishing Status Filters */}
            {uniquePublishStatuses.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-secondary)]">Publishing Status:</span>
                  {selectedPublishStatuses.length > 0 && (
                    <button 
                      onClick={() => setSelectedPublishStatuses([])}
                      className="text-[10px] text-[var(--brand-orange)] hover:underline font-bold"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {uniquePublishStatuses.map(status => {
                    const isActive = selectedPublishStatuses.includes(status);
                    return (
                      <button
                        key={status}
                        onClick={() => {
                          setSelectedPublishStatuses(prev =>
                            prev.includes(status)
                              ? prev.filter(s => s !== status)
                              : [...prev, status]
                          );
                        }}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                          isActive
                            ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm font-bold"
                            : "bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--brand-orange)]"
                        }`}
                      >
                        {formatStatusString(status)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reading Status Filters */}
            {uniqueReadStatuses.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-secondary)]">Reading Status:</span>
                  {selectedReadStatuses.length > 0 && (
                    <button 
                      onClick={() => setSelectedReadStatuses([])}
                      className="text-[10px] text-[var(--brand-orange)] hover:underline font-bold"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {uniqueReadStatuses.map(status => {
                    const isActive = selectedReadStatuses.includes(status);
                    return (
                      <button
                        key={status}
                        onClick={() => {
                          setSelectedReadStatuses(prev =>
                            prev.includes(status)
                              ? prev.filter(s => s !== status)
                              : [...prev, status]
                          );
                        }}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                          isActive
                            ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm font-bold"
                            : "bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--brand-orange)]"
                        }`}
                      >
                        {formatStatusString(status)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sync progress banner */}
      {(refreshing || syncProgress > 0) && (
        <div className="p-5 border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCw className={`text-[var(--brand-orange)] shrink-0 ${refreshing ? "animate-spin" : ""}`} size={20} />
              <div>
                <span className="font-bold text-sm text-[var(--text-primary)] block">Syncing Recommendations</span>
                <span className="text-xs text-[var(--text-secondary)]">{refreshing ? "Synchronizing with MangaDex servers..." : "Sync finished."}</span>
              </div>
            </div>
            {syncProgress > 0 && (
              <span className="text-sm font-extrabold text-[var(--brand-orange)]">{syncProgress}%</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-zinc-200 dark:bg-zinc-850 h-2 rounded-full overflow-hidden border border-zinc-200/20 dark:border-zinc-850">
            <div
              className="bg-gradient-to-r from-orange-500 to-amber-500 h-full transition-all duration-300 rounded-full"
              style={{ width: `${syncProgress}%` }}
            />
          </div>

          {/* Console logs */}
          <div className="h-28 bg-zinc-950 text-green-400 font-mono text-[10px] p-3 rounded-xl overflow-y-auto border border-zinc-900 space-y-0.5 scrollbar-thin scrollbar-thumb-zinc-855">
            {syncLogs.map((log, idx) => (
              <div key={idx} className="leading-normal whitespace-pre-wrap">{log}</div>
            ))}
          </div>

          {!refreshing && (
            <div className="flex justify-end pt-1">
              <button
                onClick={() => {
                  setSyncProgress(0);
                  setSyncLogs([]);
                }}
                className="px-4 py-1.5 border border-[var(--border-primary)] hover:bg-gray-50 dark:hover:bg-zinc-855 text-[var(--text-primary)] text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Close Progress Console
              </button>
            </div>
          )}
        </div>
      )}

      {/* SECTION 1: In Your Library */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="text-[var(--brand-orange)]" size={20} />
          <h4 className="text-base font-bold text-[var(--text-primary)]">
            In Your Library ({localRecs.length})
          </h4>
        </div>

        {localRecs.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] italic py-4">
            No recommended titles are currently in your library.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {localRecs.map((rec) => {
              const scoreInfo = getScoreInfo(rec.score);
              return (
                <div
                  key={rec.mangadex_id}
                  className="group relative flex flex-col bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--brand-orange)] rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                >
                  {/* Card Cover */}
                  <a
                    href={`/manga/${rec.local_manga_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-[2/3] w-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden block"
                  >
                    {rec.cover_url ? (
                      <img
                        src={rec.cover_url}
                        alt={rec.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                        <Compass size={36} />
                      </div>
                    )}
                    
                    {/* Score Badge */}
                    {showRelevance && (
                      <div className={`absolute top-3 right-3 px-3 py-1 rounded-lg text-xs font-extrabold border-2 border-zinc-950 shadow-lg select-none ${scoreInfo.color}`}>
                        {scoreInfo.label}
                      </div>
                    )}

                    {/* Quick Link Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-md text-white text-xs font-semibold rounded-full border border-white/20">
                        View Details <ExternalLink size={12} />
                      </span>
                    </div>
                  </a>

                  {/* Card Title & Creators */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h5 className="font-bold text-sm text-[var(--text-primary)] line-clamp-2 hover:text-[var(--brand-orange)]">
                        <a href={`/manga/${rec.local_manga_id}`} target="_blank" rel="noopener noreferrer">
                          {rec.title}
                        </a>
                      </h5>
                    </div>

                    <div className="mt-4 border-t border-[var(--border-primary)] pt-3 space-y-2.5">
                      <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                        <span>Year: <strong className="font-semibold text-[var(--text-primary)]">{rec.year || "N/A"}</strong></span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* Publishing Status */}
                        <span className={getStatusBadgeClass(rec.status)}>
                          Publish: {formatStatusString(rec.status)}
                        </span>
                        
                        {/* Reading Status */}
                        {rec.local_read_status && (
                          <span className={getReadStatusBadgeClass(rec.local_read_status)}>
                            Read: {formatStatusString(rec.local_read_status)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: Discover More (External) */}
      <div className="space-y-4 pt-4 border-t border-[var(--border-primary)]">
        {/* Warning & Toggle Bar - High Contrast Amber Theme */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-900/50 rounded-2xl shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" size={20} />
            <div>
              <h5 className="text-sm font-extrabold text-amber-900 dark:text-amber-200">Discover External Recommendations</h5>
              <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-1.5 leading-relaxed font-medium">
                These titles are not in your library. Expanding this will fetch their covers directly from MangaDex.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowExternal(!showExternal)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 border ${
              showExternal
                ? "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-primary)] hover:bg-[var(--border-primary)]"
                : "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white hover:bg-[var(--brand-coral)]"
            }`}
          >
            {showExternal ? "Hide External Titles" : "Show External Titles"}
          </button>
        </div>

        {showExternal && (
          <div className="space-y-6 animate-fade-in">
            {externalRecs.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] italic py-4">
                No external recommendations left to discover! All recommended titles are in your library.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {externalRecs.map((rec) => {
                  const scoreInfo = getScoreInfo(rec.score);
                  const isImporting = importingId === rec.mangadex_id;
                  
                  return (
                    <div
                      key={rec.mangadex_id}
                      className="group relative flex flex-col bg-[var(--bg-card)] border border-orange-200/50 dark:border-zinc-800 hover:border-[var(--brand-orange)] rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                    >
                      {/* Card Cover (Points to MangaDex website) */}
                      <a
                        href={`https://mangadex.org/title/${rec.mangadex_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative aspect-[2/3] w-full bg-zinc-100 dark:bg-zinc-900 overflow-hidden block"
                      >
                        {rec.cover_url ? (
                          <img
                            src={rec.cover_url}
                            alt={rec.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]">
                            <Compass size={36} />
                          </div>
                        )}
                        
                        {/* Score Badge */}
                        {showRelevance && (
                          <div className={`absolute top-3 right-3 px-3 py-1 rounded-lg text-xs font-extrabold border-2 border-zinc-950 shadow-lg select-none ${scoreInfo.color}`}>
                            {scoreInfo.label}
                          </div>
                        )}

                        {/* External Link Overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-md text-white text-xs font-semibold rounded-full border border-white/20">
                            Open MangaDex <ExternalLink size={12} />
                          </span>
                        </div>
                      </a>

                      {/* Card Title & Creators */}
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <h5 className="font-bold text-sm text-[var(--text-primary)] line-clamp-2 hover:text-[var(--brand-orange)]">
                            <a href={`https://mangadex.org/title/${rec.mangadex_id}`} target="_blank" rel="noopener noreferrer">
                              {rec.title}
                            </a>
                          </h5>
                        </div>

                        <div className="mt-4 space-y-3 border-t border-[var(--border-primary)] pt-3">
                          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                            <span>Year: <strong className="font-semibold text-[var(--text-primary)]">{rec.year || "N/A"}</strong></span>
                            <span className={getStatusBadgeClass(rec.status)}>
                              Publish: {formatStatusString(rec.status)}
                            </span>
                          </div>

                          <button
                            onClick={() => handleImport(rec.mangadex_id, rec.title)}
                            disabled={isImporting}
                            className="w-full py-2 bg-orange-50 dark:bg-zinc-850 hover:bg-[var(--brand-orange)] border border-orange-200 dark:border-zinc-800 hover:border-[var(--brand-orange)] text-[var(--brand-orange)] hover:text-white font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {isImporting ? (
                              <>
                                <RefreshCw size={14} className="animate-spin" />
                                Importing...
                              </>
                            ) : (
                              <>
                                <Download size={14} />
                                Import to Library
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
