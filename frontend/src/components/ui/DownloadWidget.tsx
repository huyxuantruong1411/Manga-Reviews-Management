import React from "react";
import { useNavigate } from "react-router-dom";
import { useDownload, DownloadTask } from "../../hooks/useDownload";
import { Download, X, AlertTriangle, CheckCircle, Trash2, Loader2, StopCircle, ChevronDown, ListChecks } from "lucide-react";

export const DownloadWidget: React.FC = () => {
  const navigate = useNavigate();
  const {
    tasks,
    activeTasksCount,
    cancelTask,
    refreshTasks,
    isWidgetOpen,
    setIsWidgetOpen,
  } = useDownload();

  const handleMangaClick = (mangaId: string) => {
    navigate(`/manga/${mangaId}`);
    setIsWidgetOpen(false);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "downloading":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "completed":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "failed":
        return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      case "cancelled":
      default:
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/25";
    }
  };

  const renderActivePreview = (task: DownloadTask) => {
    if (task.status !== "downloading") return null;

    return (
      <div className="flex gap-3 p-2 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-2xl border border-[var(--border-primary)]/50 mt-2 animate-in fade-in duration-200">
        <div className="relative w-10 h-14 rounded-lg overflow-hidden bg-zinc-150 dark:bg-zinc-800 border border-[var(--border-primary)] shadow-sm flex-shrink-0 flex items-center justify-center">
          {task.current_page_preview ? (
            <img
              src={task.current_page_preview}
              alt="Page preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <Loader2 className="animate-spin text-zinc-400 dark:text-zinc-500" size={16} />
          )}
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div className="text-[10px] font-bold text-[var(--text-secondary)] truncate">
            {task.current_chapter_name || "Starting..."}
          </div>
          {task.current_page_number && task.current_page_total ? (
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] font-extrabold text-[var(--brand-orange)] uppercase tracking-wider">
                <span>Page {task.current_page_number} / {task.current_page_total}</span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-850 h-1 rounded-full overflow-hidden shadow-inner">
                <div
                  className="bg-[var(--brand-orange)] h-full transition-all duration-200"
                  style={{ width: `${(task.current_page_number / task.current_page_total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="text-[10px] text-zinc-400 italic">Connecting to source...</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 font-poppins">
      {/* FLOATING TRIGGER BUTTON (When closed) */}
      {!isWidgetOpen && (
        <button
          onClick={() => setIsWidgetOpen(true)}
          className={`relative w-14 h-14 rounded-full text-white shadow-2xl flex items-center justify-center cursor-pointer transition duration-300 transform hover:scale-105 active:scale-95 bg-gradient-to-tr from-[var(--brand-orange)] to-[var(--brand-coral)] border border-orange-400/20 group`}
        >
          {/* Pulsing halo ring when download is active */}
          {activeTasksCount > 0 && (
            <span className="absolute inset-0 rounded-full bg-[var(--brand-orange)]/40 animate-ping opacity-75 pointer-events-none" />
          )}
          
          {activeTasksCount > 0 ? (
            <Loader2 className="animate-spin" size={24} />
          ) : (
            <Download size={24} className="group-hover:translate-y-0.5 transition-transform" />
          )}

          {/* Active tasks badge */}
          {activeTasksCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 bg-rose-500 border-2 border-white dark:border-zinc-900 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white shadow-md animate-pulse">
              {activeTasksCount}
            </span>
          )}
        </button>
      )}

      {/* EXPANDED PANEL CARD */}
      {isWidgetOpen && (
        <div className="w-96 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[500px] animate-in fade-in slide-in-from-bottom-6 duration-200">
          {/* Header */}
          <div className="p-4 border-b border-[var(--border-primary)] bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ListChecks className="text-[var(--brand-orange)]" size={18} />
              <span className="font-spartan font-bold text-sm text-[var(--text-primary)]">
                Downloads {activeTasksCount > 0 && `(${activeTasksCount} active)`}
              </span>
            </div>
            
            <div className="flex items-center space-x-1.5">
              <button
                onClick={refreshTasks}
                title="Refresh list"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
              >
                <Loader2 className="hover:animate-spin" size={14} />
              </button>
              <button
                onClick={() => setIsWidgetOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>

          {/* Tasks List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[380px]">
            {tasks.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="p-4 bg-zinc-100 dark:bg-zinc-850 rounded-full text-zinc-400">
                  <Download size={32} />
                </div>
                <div>
                  <h5 className="font-bold text-xs text-[var(--text-primary)]">No downloads yet</h5>
                  <p className="text-[10px] text-zinc-400 mt-1 max-w-[200px]">
                    Queue manga chapters from their detail pages to download locally.
                  </p>
                </div>
              </div>
            ) : (
              tasks.map((task) => {
                const isActive = ["pending", "downloading"].includes(task.status);
                return (
                  <div
                    key={task._id}
                    className="p-3.5 bg-zinc-50/50 dark:bg-zinc-900/10 border border-[var(--border-primary)] rounded-2xl space-y-2.5 transition duration-150 hover:border-zinc-300 dark:hover:border-zinc-800"
                  >
                    {/* Title & Status */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <span
                          onClick={() => handleMangaClick(task.manga_id)}
                          className="font-spartan font-bold text-xs text-[var(--text-primary)] hover:text-[var(--brand-orange)] hover:underline cursor-pointer block truncate"
                        >
                          {task.manga_title}
                        </span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`px-2 py-0.5 border rounded-full text-[9px] font-extrabold uppercase tracking-wide ${getStatusBadgeClass(task.status)}`}>
                            {task.status}
                          </span>
                          <span className="text-[9px] font-bold text-zinc-400">
                            {task.completed_chapters}/{task.total_chapters} chapters
                          </span>
                        </div>
                      </div>

                      {isActive && (
                        <button
                          onClick={() => cancelTask(task._id)}
                          title="Cancel Download"
                          className="p-1 rounded-lg border border-zinc-200 dark:border-zinc-850 hover:border-red-500/20 text-zinc-400 hover:text-red-500 hover:bg-red-500/5 transition cursor-pointer"
                        >
                          <StopCircle size={14} />
                        </button>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                        <span>Overall Progress</span>
                        <span className="font-extrabold text-[var(--brand-orange)]">
                          {Math.round(task.progress * 100)}%
                        </span>
                      </div>
                      <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden shadow-inner">
                        <div
                          className="bg-gradient-to-r from-orange-500 to-amber-500 h-full transition-all duration-300"
                          style={{ width: `${task.progress * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Active Live Preview */}
                    {renderActivePreview(task)}

                    {/* Error Box */}
                    {task.error_message && (
                      <div className="p-2 bg-rose-500/5 border border-rose-500/10 text-rose-500 rounded-xl text-[9px] font-semibold flex items-start gap-1.5">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{task.error_message}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DownloadWidget;
