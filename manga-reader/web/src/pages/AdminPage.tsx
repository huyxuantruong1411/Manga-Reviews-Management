import React, { useState, useEffect } from "react";
import { api, type ReportItem, type MangaItem } from "../api/client";

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"reports" | "mangas" | "users" | "datalake">("reports");
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Reports state
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportTargetType, setReportTargetType] = useState<string>("all");

  // Manga management state
  const [mangas, setMangas] = useState<MangaItem[]>([]);
  const [mangaActionReason, setMangaActionReason] = useState<string>("Content compliance verification");

  // User management state
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [userLockReason, setUserLockReason] = useState<string>("");

  // Data lake sync state
  const [etlSources, setEtlSources] = useState<any[]>([]);
  const [dataLakePath, setDataLakePath] = useState<string>("data/datalake_pool");
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    loadTabContent();
  }, [activeTab]);

  const loadTabContent = async () => {
    setLoading(true);
    setMessage(null);
    try {
      if (activeTab === "reports") {
        const res = await api.getReports({ page: 1, page_size: 50 });
        setReports(res.items);
      } else if (activeTab === "mangas") {
        const res = await api.getMangas({ page: 1, page_size: 50 });
        setMangas(res.items);
      } else if (activeTab === "datalake") {
        const res = await api.getEtlSources();
        setEtlSources(res.sources || []);
      }
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to load admin data", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleResolveReport = async (reportId: string, action: "resolved" | "dismissed") => {
    try {
      await api.resolveReport(reportId, { action, note: `Handled via Admin Console: ${action}` });
      setMessage({ text: `Report ${reportId} marked as ${action}`, type: "success" });
      loadTabContent();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to resolve report", type: "error" });
    }
  };

  const handleLockUser = async () => {
    if (!targetUserId.trim() || !userLockReason.trim()) {
      setMessage({ text: "User ID and reason are required (7-day rule audit)", type: "error" });
      return;
    }
    try {
      await api.lockUser(targetUserId, { reason: userLockReason, duration_days: 7 });
      setMessage({ text: `User ${targetUserId} locked successfully for 7 days`, type: "success" });
      setUserLockReason("");
      setTargetUserId("");
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to lock user", type: "error" });
    }
  };

  const handleUnlockUser = async () => {
    if (!targetUserId.trim()) {
      setMessage({ text: "User ID is required", type: "error" });
      return;
    }
    try {
      await api.unlockUser(targetUserId, { reason: "Admin unlocked via console", force_override: true });
      setMessage({ text: `User ${targetUserId} unlocked successfully`, type: "success" });
      setTargetUserId("");
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to unlock user", type: "error" });
    }
  };

  const handleToggleMangaVisibility = async (mangaId: string, currentHidden: boolean) => {
    try {
      if (currentHidden) {
        await api.showManga(mangaId, mangaActionReason);
        setMessage({ text: `Manga ${mangaId} status restored to PUBLIC`, type: "success" });
      } else {
        await api.hideManga(mangaId, mangaActionReason);
        setMessage({ text: `Manga ${mangaId} status updated to HIDDEN`, type: "success" });
      }
      loadTabContent();
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to toggle visibility", type: "error" });
    }
  };

  const handleTriggerETL = async () => {
    setLoading(true);
    setSyncStatus("Ingestion pipeline triggered... Reading parquet & comic artifacts from Manga Data Lake Pool.");
    try {
      const res = await api.ingestEtlPackage({
        source_type: "data_lake_pool",
        source_path: dataLakePath,
      });
      setSyncStatus(`ETL Completed: ${JSON.stringify(res)}`);
      setMessage({ text: "Data Lake Ingestion executed successfully", type: "success" });
    } catch (err: any) {
      setSyncStatus(`ETL Failed: ${err.message}`);
      setMessage({ text: err.message || "ETL Execution failed", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleRecomputeRecs = async () => {
    setLoading(true);
    try {
      await api.recomputeRecommendations();
      setMessage({ text: "Recommendation vectors recomputation queued for background worker", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message || "Failed to trigger recommendations engine", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = reportTargetType === "all" 
    ? reports 
    : reports.filter((r) => r.target_type === reportTargetType);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            <h1 className="text-xl font-bold font-mono tracking-tight text-zinc-100">ADMIN CONTROL CONSOLE</h1>
          </div>
          <p className="text-xs text-zinc-400 font-mono mt-1">
            System Operations, Content Moderation (UC-8.1..8.3) & Data Lake Ingestion (UC-8.4)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRecomputeRecs}
            disabled={loading}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-xs font-mono text-zinc-300 rounded transition disabled:opacity-50"
          >
            ⚡ Recompute Recsys
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 text-xs font-mono rounded border ${
            message.type === "success"
              ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
              : "bg-red-950/40 border-red-800/60 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 space-x-1 font-mono text-xs">
        <button
          onClick={() => setActiveTab("reports")}
          className={`px-4 py-2 border-b-2 font-medium transition ${
            activeTab === "reports"
              ? "border-amber-500 text-amber-400 bg-zinc-900/40"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          REPORTS MODERATION ({reports.filter((r) => r.status === "pending").length})
        </button>
        <button
          onClick={() => setActiveTab("mangas")}
          className={`px-4 py-2 border-b-2 font-medium transition ${
            activeTab === "mangas"
              ? "border-amber-500 text-amber-400 bg-zinc-900/40"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          MANGA CATALOG MANAGEMENT
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 border-b-2 font-medium transition ${
            activeTab === "users"
              ? "border-amber-500 text-amber-400 bg-zinc-900/40"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          USER GOVERNANCE
        </button>
        <button
          onClick={() => setActiveTab("datalake")}
          className={`px-4 py-2 border-b-2 font-medium transition ${
            activeTab === "datalake"
              ? "border-amber-500 text-amber-400 bg-zinc-900/40"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          DATA LAKE ETL INGESTION
        </button>
      </div>

      {/* TAB 1: REPORTS */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-mono">Filter by target:</span>
              {(["all", "manga", "comment", "user"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setReportTargetType(type)}
                  className={`px-2 py-0.5 text-xs font-mono rounded ${
                    reportTargetType === type
                      ? "bg-zinc-700 text-white"
                      : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={loadTabContent}
              className="text-xs font-mono text-zinc-400 hover:text-zinc-200"
            >
              ↻ Refresh
            </button>
          </div>

          <div className="border border-zinc-800 rounded bg-zinc-900/30 overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">TARGET</th>
                  <th className="p-3">REASON / DETAILS</th>
                  <th className="p-3">REPORTER</th>
                  <th className="p-3">STATUS</th>
                  <th className="p-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500">
                      No reports found.
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((report) => (
                    <tr key={report.report_id} className="hover:bg-zinc-900/40">
                      <td className="p-3 text-zinc-500 font-mono">{report.report_id.substring(0, 8)}</td>
                      <td className="p-3">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 mr-2 uppercase">
                          {report.target_type}
                        </span>
                        <span className="text-zinc-400 truncate max-w-xs inline-block align-bottom">
                          {report.target_id}
                        </span>
                      </td>
                      <td className="p-3 max-w-sm text-zinc-300">
                        <span className="font-semibold block text-zinc-200">{report.reason}</span>
                        {report.details && (
                          <span className="text-zinc-400 text-xs truncate block">{report.details}</span>
                        )}
                      </td>
                      <td className="p-3 text-zinc-400">{report.reporter_id?.substring(0, 8) || "Anon"}</td>
                      <td className="p-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            report.status === "pending"
                              ? "bg-amber-950/60 text-amber-400 border border-amber-800/60"
                              : report.status === "resolved"
                              ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {report.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        {report.status === "pending" && (
                          <>
                            <button
                              onClick={() => handleResolveReport(report.report_id, "resolved")}
                              className="px-2 py-1 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 rounded text-[11px]"
                            >
                              Resolve
                            </button>
                            <button
                              onClick={() => handleResolveReport(report.report_id, "dismissed")}
                              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px]"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: MANGA CATALOG MANAGEMENT */}
      {activeTab === "mangas" && (
        <div className="space-y-4">
          <div className="border border-zinc-800 rounded bg-zinc-900/30 overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">TITLE</th>
                  <th className="p-3">STATUS</th>
                  <th className="p-3">VISIBILITY</th>
                  <th className="p-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {mangas.map((manga) => (
                  <tr key={manga.pool_manga_id} className="hover:bg-zinc-900/40">
                    <td className="p-3 text-zinc-500">{manga.pool_manga_id.substring(0, 8)}</td>
                    <td className="p-3 font-semibold text-zinc-200">{manga.title}</td>
                    <td className="p-3 text-zinc-400 uppercase">{manga.status}</td>
                    <td className="p-3">
                      {manga.is_hidden ? (
                        <span className="px-1.5 py-0.5 bg-amber-950/60 border border-amber-800/60 text-amber-400 rounded text-[10px]">
                          HIDDEN
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 rounded text-[10px]">
                          PUBLIC
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleToggleMangaVisibility(manga.pool_manga_id, !!manga.is_hidden)}
                        className={`px-2 py-1 rounded text-[11px] border ${
                          manga.is_hidden
                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/60 hover:bg-emerald-900/80"
                            : "bg-amber-950/60 text-amber-300 border-amber-800/60 hover:bg-amber-900/80"
                        }`}
                      >
                        {manga.is_hidden ? "Publish" : "Hide Manga"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: USERS */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="border border-zinc-800 rounded bg-zinc-900/40 p-5 space-y-4 font-mono text-xs max-w-xl">
            <h3 className="text-sm font-bold text-zinc-200 uppercase">
              Account Lock & Unlock Operations (UC-1.2 & UC-1.3)
            </h3>
            <p className="text-zinc-400">
              Per specifications, locking an account revokes all active sessions immediately and enforces a 7-day restriction.
            </p>
            <div className="space-y-2">
              <label className="block text-zinc-400">Target User UUID</label>
              <input
                type="text"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-zinc-400">Lock Reason (Audit Trail)</label>
              <input
                type="text"
                value={userLockReason}
                onChange={(e) => setUserLockReason(e.target.value)}
                placeholder="Reason for suspension..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleLockUser}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded"
              >
                Lock Account (7 Days)
              </button>
              <button
                onClick={handleUnlockUser}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded"
              >
                Force Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DATA LAKE INGESTION */}
      {activeTab === "datalake" && (
        <div className="space-y-6">
          <div className="border border-zinc-800 bg-zinc-900/40 rounded p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold font-mono text-zinc-200 uppercase tracking-wide">
                Manga Data Lake & Storage Pool Ingestion (UC-8.4)
              </h2>
              <p className="text-xs text-zinc-400 font-mono mt-1">
                Ingest curated parquet metadata, manga assets, and chapter packages exported by the core review system into this standalone reader database.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="bg-zinc-950 p-4 border border-zinc-800 rounded font-mono text-xs space-y-2">
                <span className="text-zinc-500 uppercase block font-semibold">STORAGE POOL LOCATION</span>
                <input
                  type="text"
                  value={dataLakePath}
                  onChange={(e) => setDataLakePath(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
                />
                <span className="text-[11px] text-zinc-500 block">
                  Path relative to backend root or MinIO pool bucket: `data/datalake_pool`
                </span>
              </div>

              <div className="bg-zinc-950 p-4 border border-zinc-800 rounded font-mono text-xs flex flex-col justify-between">
                <div>
                  <span className="text-zinc-500 uppercase block font-semibold mb-1">EXECUTION MODE</span>
                  <p className="text-zinc-400 text-xs">
                    Uses atomic upsert on chapters & pages with sha256 checksum comparison to avoid redundant re-uploads.
                  </p>
                </div>
                <button
                  onClick={handleTriggerETL}
                  disabled={loading}
                  className="mt-3 w-full py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold font-mono text-xs rounded transition disabled:opacity-50"
                >
                  {loading ? "Ingesting Pipeline Running..." : "Execute Ingestion Pipeline"}
                </button>
              </div>
            </div>

            {syncStatus && (
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded font-mono text-xs text-zinc-300">
                <span className="text-zinc-500 block mb-1">PIPELINE EXECUTION LOGS:</span>
                <p className="font-mono text-zinc-200">{syncStatus}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
export default AdminPage;
