import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  History,
  Search,
  Filter,
  RefreshCw,
  Download,
  ExternalLink,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  FileText,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Activity,
  Layers,
  Sparkles,
  User,
  Cpu,
  Bot,
  Info,
  Calendar,
  Eye,
  SlidersHorizontal,
} from "lucide-react";
import client from "../api/client";
import { useAlert } from "../hooks/useAlert";

interface AuditLogItem {
  _id: string;
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_title?: string | null;
  actor: string;
  field?: string | null;
  old_value?: any;
  new_value?: any;
  note?: string | null;
  details?: Record<string, any>;
}

interface AuditStats {
  total_logs: number;
  manga_logs: number;
  review_logs: number;
  system_logs: number;
  last_24h_count: number;
  action_counts: Record<string, number>;
}

export const AuditLogsPage: React.FC = () => {
  const { showAlert } = useAlert();

  // Data states
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  // Pagination states
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedEntityType, setSelectedEntityType] = useState<string>("all");
  const [selectedAction, setSelectedAction] = useState<string>("all");
  const [selectedActor, setSelectedActor] = useState<string>("all");

  // Inspection Drawer
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch Available Actions & Stats
  const fetchMetadata = useCallback(async () => {
    try {
      setStatsLoading(true);
      const [actionsRes, statsRes] = await Promise.all([
        client.get("/api/audit-logs/actions"),
        client.get("/api/audit-logs/stats"),
      ]);
      setAvailableActions(actionsRes.data?.actions || []);
      setStats(statsRes.data);
    } catch (err) {
      console.error("Failed to load audit metadata:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // Fetch Audit Logs
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = {
        skip: (page - 1) * pageSize,
        limit: pageSize,
      };

      if (debouncedSearch) {
        params.search = debouncedSearch;
      }
      if (selectedEntityType !== "all") {
        params.entity_type = selectedEntityType;
      }
      if (selectedAction !== "all") {
        params.action = selectedAction;
      }
      if (selectedActor !== "all") {
        params.actor = selectedActor;
      }

      const res = await client.get("/api/audit-logs", { params });
      setLogs(res.data?.items || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
      showAlert({
        title: "Error Loading Logs",
        message: "Could not retrieve audit history from server.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, selectedEntityType, selectedAction, selectedActor, showAlert]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Helpers
  const formatTimestamp = (ts: string) => {
    if (!ts) return "";
    let dateStr = ts;
    if (!dateStr.endsWith("Z") && !dateStr.includes("+") && !dateStr.includes("-", 10)) {
      dateStr += "Z";
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? ts
      : d.toLocaleString(undefined, {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });
  };

  const getRelativeTime = (ts: string) => {
    if (!ts) return "";
    let dateStr = ts;
    if (!dateStr.endsWith("Z") && !dateStr.includes("+") && !dateStr.includes("-", 10)) {
      dateStr += "Z";
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  };

  const formatFieldValue = (field: string | null | undefined, val: any): string => {
    if (val === null || val === undefined) return "";
    const strVal = typeof val === "string" ? val : JSON.stringify(val);
    if (!strVal || strVal === '""' || strVal === "null" || strVal === "[]" || strVal === "{}") {
      return "(empty)";
    }

    if (field === "alt_titles") {
      try {
        const cleaned = strVal.replace(/'/g, '"');
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item: string) => {
              if (typeof item === "string" && item.includes("|")) {
                const [lang, ...rest] = item.split("|");
                return `[${lang.toUpperCase()}] ${rest.join("|")}`;
              }
              return item;
            })
            .join(", ");
        }
      } catch {
        const items = strVal.match(/'([^']+)'/g);
        if (items) {
          return items
            .map((s) => s.replace(/'/g, ""))
            .map((item) => {
              if (item.includes("|")) {
                const [lang, ...rest] = item.split("|");
                return `[${lang.toUpperCase()}] ${rest.join("|")}`;
              }
              return item;
            })
            .join(", ");
        }
      }
    }

    if (field === "read_status") {
      return strVal.replace(/_/g, " ").toUpperCase();
    }

    if (field === "personal_rating") {
      return strVal ? `${strVal} / 10 ★` : "None";
    }

    return strVal;
  };

  const getActionBadge = (action: string) => {
    const norm = (action || "").toLowerCase();
    if (norm.includes("create") && norm.includes("review")) {
      return {
        label: "Review Added",
        bg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        dot: "bg-emerald-500",
      };
    }
    if (norm.includes("update") && norm.includes("review")) {
      return {
        label: "Review Updated",
        bg: "bg-blue-500/10 text-blue-500 border-blue-500/20",
        dot: "bg-blue-500",
      };
    }
    if (norm.includes("delete") && norm.includes("review")) {
      return {
        label: "Review Deleted",
        bg: "bg-rose-500/10 text-rose-500 border-rose-500/20",
        dot: "bg-rose-500",
      };
    }
    if (norm === "create") {
      return {
        label: "Manga Created",
        bg: "bg-green-500/10 text-green-500 border-green-500/20",
        dot: "bg-green-500",
      };
    }
    if (norm === "delete_manga") {
      return {
        label: "Manga Deleted",
        bg: "bg-red-500/10 text-red-500 border-red-500/20",
        dot: "bg-red-500",
      };
    }
    if (norm.includes("status")) {
      return {
        label: "Status Changed",
        bg: "bg-purple-500/10 text-purple-500 border-purple-500/20",
        dot: "bg-purple-500",
      };
    }
    if (norm.includes("rating")) {
      return {
        label: "Rating Changed",
        bg: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        dot: "bg-amber-500",
      };
    }
    if (norm.includes("metadata")) {
      return {
        label: "Metadata Updated",
        bg: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
        dot: "bg-cyan-500",
      };
    }
    if (norm.includes("download")) {
      return {
        label: "Download Completed",
        bg: "bg-teal-500/10 text-teal-500 border-teal-500/20",
        dot: "bg-teal-500",
      };
    }
    return {
      label: action.replace(/_/g, " "),
      bg: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
      dot: "bg-zinc-400",
    };
  };

  const getActorBadge = (actor: string) => {
    const norm = (actor || "").toLowerCase();
    if (norm.includes("agent") || norm.includes("ai")) {
      return {
        label: "AI Agent",
        icon: <Bot size={13} className="text-violet-400" />,
        bg: "bg-violet-500/10 text-violet-400 border-violet-500/20",
      };
    }
    if (norm === "system") {
      return {
        label: "System",
        icon: <Cpu size={13} className="text-sky-400" />,
        bg: "bg-sky-500/10 text-sky-400 border-sky-500/20",
      };
    }
    return {
      label: "User",
      icon: <User size={13} className="text-emerald-400" />,
      bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    };
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleCopyJson = () => {
    if (!selectedLog) return;
    navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1800);
  };

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `audit-logs-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedEntityType("all");
    setSelectedAction("all");
    setSelectedActor("all");
    setPage(1);
  };

  const hasActiveFilters =
    searchTerm !== "" || selectedEntityType !== "all" || selectedAction !== "all" || selectedActor !== "all";

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-24">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--bg-card)] border border-[var(--border-primary)] p-6 rounded-3xl shadow-sm relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[var(--brand-orange)]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1.5 z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]">
              <History size={26} />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="text-2xl font-bold font-spartan tracking-tight text-[var(--text-primary)]">
                  Audit Logs & System History
                </h1>
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Live Audit Stream</span>
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Comprehensive, lightweight audit trail tracking manga lifecycle, reviews, ratings, and automation tasks.
              </p>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center space-x-2.5 z-10 shrink-0">
          <button
            onClick={() => {
              fetchLogs();
              fetchMetadata();
            }}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-zinc-800 text-[var(--text-primary)] hover:bg-gray-200 dark:hover:bg-zinc-700 transition cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportJson}
            disabled={logs.length === 0}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--brand-orange)] text-white hover:opacity-90 transition shadow-sm cursor-pointer disabled:opacity-50"
            title="Export filtered logs as JSON"
          >
            <Download size={14} />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Logs */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-2 relative overflow-hidden group hover:border-[var(--brand-orange)]/40 transition">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Total Recorded Events</span>
            <div className="p-2 rounded-xl bg-orange-500/10 text-[var(--brand-orange)]">
              <Layers size={16} />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-spartan text-[var(--text-primary)]">
              {statsLoading ? "..." : (stats?.total_logs ?? total).toLocaleString()}
            </span>
            <span className="text-[11px] text-[var(--text-secondary)]">audit records</span>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] flex items-center space-x-1">
            <span className="text-emerald-500 font-semibold">Active indexing</span>
            <span>across all collections</span>
          </div>
        </div>

        {/* Manga Operations */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-2 relative overflow-hidden group hover:border-blue-500/40 transition">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Manga Operations</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <BookOpen size={16} />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-spartan text-[var(--text-primary)]">
              {statsLoading ? "..." : (stats?.manga_logs ?? 0).toLocaleString()}
            </span>
            <span className="text-[11px] text-[var(--text-secondary)]">actions</span>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] truncate">
            Creates, statuses, ratings, alt-titles
          </div>
        </div>

        {/* Review Activities */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-2 relative overflow-hidden group hover:border-emerald-500/40 transition">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">Review Activities</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <FileText size={16} />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-spartan text-[var(--text-primary)]">
              {statsLoading ? "..." : (stats?.review_logs ?? 0).toLocaleString()}
            </span>
            <span className="text-[11px] text-[var(--text-secondary)]">entries</span>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] truncate">
            Review creation, edits, deletions
          </div>
        </div>

        {/* 24h Activity Volume */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-2 relative overflow-hidden group hover:border-purple-500/40 transition">
          <div className="flex items-center justify-between text-[var(--text-secondary)]">
            <span className="text-xs font-medium">24h System Activity</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
              <Activity size={16} />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-spartan text-[var(--text-primary)]">
              {statsLoading ? "..." : (stats?.last_24h_count ?? 0).toLocaleString()}
            </span>
            <span className="text-[11px] text-purple-400 font-medium">recent actions</span>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] truncate">
            Past 24 hours rolling count
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              placeholder="Search by title, note, field, action or entity ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl text-xs bg-[var(--bg-primary)] border border-[var(--border-primary)] focus:outline-none focus:border-[var(--brand-orange)] transition text-[var(--text-primary)]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Entity Type Filter */}
          <div className="flex items-center space-x-2 w-full md:w-auto shrink-0">
            <select
              value={selectedEntityType}
              onChange={(e) => {
                setSelectedEntityType(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl text-xs bg-[var(--bg-primary)] border border-[var(--border-primary)] focus:outline-none focus:border-[var(--brand-orange)] text-[var(--text-primary)] cursor-pointer"
            >
              <option value="all">All Entity Types</option>
              <option value="manga">Manga Only</option>
              <option value="review">Review Only</option>
              <option value="download">Downloads</option>
              <option value="system">System / Background</option>
            </select>

            {/* Action Filter */}
            <select
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl text-xs bg-[var(--bg-primary)] border border-[var(--border-primary)] focus:outline-none focus:border-[var(--brand-orange)] text-[var(--text-primary)] cursor-pointer max-w-[180px]"
            >
              <option value="all">All Actions</option>
              {availableActions.map((act) => (
                <option key={act} value={act}>
                  {act.replace(/_/g, " ")}
                </option>
              ))}
            </select>

            {/* Actor Filter */}
            <select
              value={selectedActor}
              onChange={(e) => {
                setSelectedActor(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl text-xs bg-[var(--bg-primary)] border border-[var(--border-primary)] focus:outline-none focus:border-[var(--brand-orange)] text-[var(--text-primary)] cursor-pointer"
            >
              <option value="all">All Actors</option>
              <option value="user">User</option>
              <option value="system">System</option>
              <option value="ai_agent">AI Agent</option>
            </select>

            {/* Reset Filters */}
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 transition cursor-pointer shrink-0"
                title="Reset all filters"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 pt-1 flex-wrap text-[11px] text-[var(--text-secondary)]">
            <span>Filtered by:</span>
            {searchTerm && (
              <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-[var(--text-primary)]">
                keyword: "{searchTerm}"
              </span>
            )}
            {selectedEntityType !== "all" && (
              <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-[var(--text-primary)]">
                entity: {selectedEntityType}
              </span>
            )}
            {selectedAction !== "all" && (
              <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-[var(--text-primary)]">
                action: {selectedAction}
              </span>
            )}
            {selectedActor !== "all" && (
              <span className="px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-[var(--text-primary)]">
                actor: {selectedActor}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Audit Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/70 dark:bg-zinc-800/40 text-[var(--text-secondary)] uppercase font-semibold text-[10px] tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="py-3.5 px-4 w-[190px]">Timestamp</th>
                <th className="py-3.5 px-4 w-[110px]">Actor</th>
                <th className="py-3.5 px-4 w-[160px]">Action</th>
                <th className="py-3.5 px-4 w-[260px]">Entity Target</th>
                <th className="py-3.5 px-4">Changes & Description</th>
                <th className="py-3.5 px-4 text-right w-[90px]">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-zinc-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RefreshCw size={24} className="animate-spin text-[var(--brand-orange)]" />
                      <span className="text-xs">Loading audit stream...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-zinc-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <History size={32} className="opacity-40" />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">No audit logs found</span>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Try relaxing your search terms or filters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const badge = getActionBadge(log.action);
                  const actorBadge = getActorBadge(log.actor);
                  const formattedOld = formatFieldValue(log.field, log.old_value);
                  const formattedNew = formatFieldValue(log.field, log.new_value);
                  const hasDiff =
                    (log.old_value !== null && log.old_value !== undefined && log.old_value !== "") ||
                    (log.new_value !== null && log.new_value !== undefined && log.new_value !== "");
                  const isDiffMeaningful = hasDiff && formattedOld !== formattedNew;

                  const mangaId =
                    log.entity_type === "manga"
                      ? log.entity_id
                      : log.details?.manga_id || (log.entity_type === "review" ? log.details?.manga_id : null);

                  return (
                    <tr
                      key={log._id}
                      className="hover:bg-gray-50/50 dark:hover:bg-zinc-800/30 transition group"
                    >
                      {/* Timestamp */}
                      <td className="py-3 px-4 align-top">
                        <div className="space-y-0.5">
                          <span className="font-medium text-[var(--text-primary)] block">
                            {formatTimestamp(log.timestamp)}
                          </span>
                          <span className="text-[10px] text-zinc-400 block font-mono">
                            {getRelativeTime(log.timestamp)}
                          </span>
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="py-3 px-4 align-top">
                        <span
                          className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${actorBadge.bg}`}
                        >
                          {actorBadge.icon}
                          <span>{actorBadge.label}</span>
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 align-top">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${badge.bg}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            <span>{badge.label}</span>
                          </span>
                          {log.field && (
                            <div className="text-[10px] text-zinc-400 font-mono">
                              field: <span className="text-[var(--text-primary)]">{log.field}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Entity Target */}
                      <td className="py-3 px-4 align-top">
                        <div className="space-y-1 max-w-[250px]">
                          <div className="flex items-center space-x-1.5">
                            <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-mono bg-zinc-200/60 dark:bg-zinc-800 text-zinc-400">
                              {log.entity_type}
                            </span>
                            {mangaId ? (
                              <Link
                                to={`/manga/${mangaId}`}
                                className="font-semibold text-[var(--text-primary)] hover:text-[var(--brand-orange)] transition truncate flex items-center space-x-1"
                                title={log.entity_title || log.entity_id}
                              >
                                <span className="truncate">{log.entity_title || "View Manga"}</span>
                                <ExternalLink size={11} className="shrink-0 opacity-60" />
                              </Link>
                            ) : (
                              <span className="font-semibold text-[var(--text-primary)] truncate" title={log.entity_title || log.entity_id}>
                                {log.entity_title || log.entity_id}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-1 text-[10px] text-zinc-400 font-mono">
                            <span>ID: {log.entity_id.slice(-8)}</span>
                            <button
                              onClick={() => handleCopyText(log.entity_id, log._id)}
                              className="text-zinc-400 hover:text-[var(--text-primary)] transition"
                              title="Copy ID"
                            >
                              {copiedId === log._id ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Changes & Note */}
                      <td className="py-3 px-4 align-top space-y-1.5">
                        {isDiffMeaningful && (
                          <div className="p-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[11px] font-mono flex items-center gap-1.5 flex-wrap">
                            <span className="text-rose-400 line-through max-w-[200px] truncate" title={formattedOld}>
                              {formattedOld || "(empty)"}
                            </span>
                            <ArrowRight size={11} className="text-zinc-400 shrink-0" />
                            <span className="text-emerald-400 font-semibold max-w-[240px] truncate" title={formattedNew}>
                              {formattedNew || "(empty)"}
                            </span>
                          </div>
                        )}

                        {log.note && (
                          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                            {log.note}
                          </p>
                        )}
                      </td>

                      {/* Inspect Action */}
                      <td className="py-3 px-4 align-top text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-zinc-200 dark:hover:bg-zinc-700 transition flex items-center space-x-1 ml-auto cursor-pointer"
                          title="Inspect full audit record"
                        >
                          <Eye size={12} />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        <div className="p-4 border-t border-[var(--border-primary)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center space-x-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[var(--text-primary)] focus:outline-none"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              Showing {total === 0 ? 0 : (page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total.toLocaleString()} records
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-[var(--border-primary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="First Page"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-[var(--border-primary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 font-semibold text-[var(--text-primary)]">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-[var(--border-primary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="Next Page"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-[var(--border-primary)] hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="Last Page"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Audit Detail Inspector Drawer/Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    Audit Record Inspector
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                    ID: {selectedLog._id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 text-zinc-400 hover:text-[var(--text-primary)] rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-[var(--border-primary)]">
                <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Action</span>
                <span className="font-semibold text-[var(--text-primary)] capitalize">
                  {selectedLog.action.replace(/_/g, " ")}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-[var(--border-primary)]">
                <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Actor</span>
                <span className="font-semibold text-[var(--text-primary)] capitalize">
                  {selectedLog.actor}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-[var(--border-primary)]">
                <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Timestamp (Local)</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {formatTimestamp(selectedLog.timestamp)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-[var(--border-primary)]">
                <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Timestamp (UTC ISO)</span>
                <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                  {selectedLog.timestamp}
                </span>
              </div>

              <div className="col-span-2 p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-[var(--border-primary)]">
                <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Target Entity</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-semibold text-[var(--text-primary)]">
                    {selectedLog.entity_title || selectedLog.entity_id}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 text-zinc-400">
                    Type: {selectedLog.entity_type}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400 font-mono mt-1">
                  Entity ID: {selectedLog.entity_id}
                </div>
              </div>

              {selectedLog.note && (
                <div className="col-span-2 p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-[var(--border-primary)]">
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Note / Description</span>
                  <p className="mt-1 text-[var(--text-primary)] leading-relaxed">{selectedLog.note}</p>
                </div>
              )}
            </div>

            {/* Raw JSON Payload */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">Raw JSON (For AI / Diagnostics)</span>
                <button
                  onClick={handleCopyJson}
                  className="flex items-center space-x-1 text-[11px] text-[var(--brand-orange)] hover:underline cursor-pointer"
                >
                  {copiedJson ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedJson ? "Copied JSON" : "Copy Payload"}</span>
                </button>
              </div>
              <pre className="p-3.5 rounded-xl bg-zinc-900 text-zinc-200 text-[11px] font-mono max-h-52 overflow-y-auto border border-zinc-800">
                {JSON.stringify(selectedLog, null, 2)}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-zinc-800 text-[var(--text-primary)] hover:bg-gray-200 dark:hover:bg-zinc-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogsPage;
