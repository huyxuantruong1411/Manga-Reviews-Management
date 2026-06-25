import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDownload } from "../hooks/useDownload";
import {
  Download,
  Folder,
  Copy,
  Check,
  AlertTriangle,
  StopCircle,
  Clock,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Trash2,
  RotateCcw
} from "lucide-react";

export const DownloadsPage: React.FC = () => {
  const navigate = useNavigate();
  const { tasks, cancelTask, resumeTask, deleteTask, refreshTasks, activeTasksCount } = useDownload();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshTasks();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleCopyPath = (path: string | undefined, taskId: string) => {
    if (!path) return;
    navigator.clipboard.writeText(path);
    setCopiedId(taskId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
            <Clock size={12} className="animate-pulse" />
            <span>Pending</span>
          </span>
        );
      case "downloading":
        return (
          <span className="px-3 py-1 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-full text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping mr-1" />
            <span>Downloading</span>
          </span>
        );
      case "completed":
        return (
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
            <CheckCircle2 size={12} />
            <span>Completed</span>
          </span>
        );
      case "failed":
        return (
          <span className="px-3 py-1 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-full text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
            <XCircle size={12} />
            <span>Failed</span>
          </span>
        );
      case "cancelled":
      default:
        return (
          <span className="px-3 py-1 bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 rounded-full text-xs font-bold uppercase tracking-wider flex items-center space-x-1">
            <StopCircle size={12} />
            <span>Cancelled</span>
          </span>
        );
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleString("vi-VN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (e) {
      return dateString;
    }
  };

  // Filter tasks based on search term and status filter
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.manga_title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24 font-poppins">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-spartan font-extrabold tracking-tight text-[var(--text-primary)]">
            Download Manager
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage active tasks and browse completed download folders path.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center space-x-2 px-4 py-2.5 bg-[var(--bg-card)] hover:bg-zinc-50 dark:hover:bg-zinc-800/80 border border-[var(--border-primary)] rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Toolbar / Search & Filter */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center">
        {/* Search */}
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
          <input
            type="text"
            placeholder="Search manga downloads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-orange)] transition"
          />
        </div>

        {/* Filter and stats */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center space-x-2">
            <Filter size={16} className="text-zinc-400 dark:text-zinc-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-orange)] transition cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="downloading">Downloading</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {activeTasksCount > 0 && (
            <div className="px-3.5 py-2 bg-orange-500/10 text-[var(--brand-orange)] rounded-xl text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 animate-pulse-subtle">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-orange)] mr-0.5" />
              <span>{activeTasksCount} Active</span>
            </div>
          )}
        </div>
      </div>

      {/* Main List */}
      <div className="space-y-4">
        {filteredTasks.length === 0 ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl py-16 flex flex-col items-center justify-center text-center space-y-3">
            <div className="p-4 bg-zinc-100 dark:bg-zinc-850 rounded-full text-zinc-400">
              <Download size={36} />
            </div>
            <div>
              <h3 className="font-bold text-base text-[var(--text-primary)]">No downloads found</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
                {searchTerm || statusFilter !== "all"
                  ? "Try resetting your search query or status filter."
                  : "Start downloading chapters from the manga list to see them here."}
              </p>
            </div>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isActive = ["pending", "downloading"].includes(task.status);
            return (
              <div
                key={task._id}
                className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 flex flex-col lg:flex-row gap-6 justify-between transition hover:shadow-md"
              >
                {/* Left Side: Basic Info & Path */}
                <div className="flex-1 space-y-3 min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3
                      onClick={() => navigate(`/manga/${task.manga_id}`)}
                      className="font-spartan font-bold text-lg text-[var(--text-primary)] hover:text-[var(--brand-orange)] cursor-pointer transition truncate flex items-center gap-1.5"
                    >
                      <span>{task.manga_title}</span>
                      <ExternalLink size={14} className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition inline" />
                    </h3>
                    
                    {getStatusBadge(task.status)}
                  </div>

                  {/* Metadata and progress summary */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--text-secondary)] font-medium">
                    <span className="flex items-center gap-1">
                      <Clock size={14} />
                      <span>{formatDate(task.created_at)}</span>
                    </span>
                    <span>•</span>
                    <span>Chapters: <strong className="text-[var(--text-primary)]">{task.completed_chapters} / {task.total_chapters}</strong> completed</span>
                    {task.current_chapter_name && isActive && (
                      <>
                        <span>•</span>
                        <span className="text-[var(--brand-orange)] font-bold animate-pulse-subtle">
                          Downloading: {task.current_chapter_name}
                          {task.current_page_number && task.current_page_total && ` (Page ${task.current_page_number}/${task.current_page_total})`}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Folder path (Monospace display & clipboard copy) */}
                  {task.download_path ? (
                    <div className="flex items-center gap-2 max-w-full">
                      <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-[var(--border-primary)] rounded-xl text-xs font-mono text-[var(--text-secondary)] overflow-x-auto select-all scrollbar-none shrink-0 md:shrink flex-1 max-w-2xl">
                        <Folder size={14} className="text-zinc-400 dark:text-zinc-650 shrink-0" />
                        <span className="truncate whitespace-nowrap">{task.download_path}</span>
                      </div>
                      <button
                        onClick={() => handleCopyPath(task.download_path, task._id)}
                        title="Copy folder path"
                        className="p-2 border border-[var(--border-primary)] hover:border-[var(--brand-orange)] rounded-xl text-zinc-400 hover:text-[var(--brand-orange)] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition flex items-center justify-center cursor-pointer shadow-sm shrink-0"
                      >
                        {copiedId === task._id ? (
                          <Check size={14} className="text-emerald-500" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  ) : (
                    isActive && (
                      <span className="text-xs text-zinc-400 italic">Target folder path is resolving...</span>
                    )
                  )}

                  {/* Error Box */}
                  {task.error_message && (
                    <div className="p-3 bg-rose-500/5 border border-rose-500/10 text-rose-500 rounded-xl text-xs font-semibold flex items-start gap-2 max-w-2xl">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{task.error_message}</span>
                    </div>
                  )}
                </div>

                {/* Right Side: Progress Bar & Action */}
                <div className="w-full lg:w-72 flex flex-col justify-between shrink-0 gap-4">
                  {/* Progress values */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-extrabold text-zinc-400 uppercase tracking-wider">
                      <span>Task Progress</span>
                      <span className="font-extrabold text-[var(--brand-orange)]">
                        {Math.round(task.progress * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden shadow-inner border border-zinc-300/10">
                      <div
                        className="bg-gradient-to-r from-orange-500 to-amber-500 h-full transition-all duration-300 rounded-full"
                        style={{ width: `${task.progress * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 w-full">
                    {isActive ? (
                      <button
                        onClick={() => cancelTask(task._id)}
                        className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 hover:border-rose-500/30 text-rose-500 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer"
                      >
                        <StopCircle size={14} />
                        <span>Cancel Task</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => resumeTask(task._id)}
                          className="flex-1 py-2 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 hover:border-emerald-500/30 text-emerald-500 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer"
                        >
                          <RotateCcw size={14} />
                          <span>Retry / Resume</span>
                        </button>
                        <button
                          onClick={() => deleteTask(task._id)}
                          className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 hover:border-rose-500/30 text-rose-500 font-bold text-xs rounded-xl transition flex items-center justify-center shadow-sm cursor-pointer"
                          title="Delete Task"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DownloadsPage;
