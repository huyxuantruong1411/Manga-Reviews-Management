import React, { useState, useEffect } from "react";
import {
  api,
  type ReportItem,
  type MangaItem,
  type EtlPackageItem,
  type EtlSourcesResponse,
} from "../api/client";

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"reports" | "mangas" | "users" | "datalake">("datalake");
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

  // Data lake sync state (UC-2.3: Chọn source tải truyện)
  const [etlData, setEtlData] = useState<EtlSourcesResponse | null>(null);
  const [selectedPoolIds, setSelectedPoolIds] = useState<Set<string>>(new Set());
  const [batchCdcEnabled, setBatchCdcEnabled] = useState<boolean>(true);
  const [etlSearch, setEtlSearch] = useState<string>("");
  const [etlFilter, setEtlFilter] = useState<"all" | "pending" | "ingested" | "updates">("all");
  const [ingestingId, setIngestingId] = useState<string | null>(null);
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
        setEtlData(res);
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

  // --- UC-2.3: Chọn source tải truyện & ETL Handlers ---
  const handleToggleSelect = (poolId: string) => {
    setSelectedPoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(poolId)) next.delete(poolId);
      else next.add(poolId);
      return next;
    });
  };

  const handleSelectAll = (items: EtlPackageItem[]) => {
    setSelectedPoolIds(new Set(items.map((i) => i.pool_manga_id)));
  };

  const handleDeselectAll = () => {
    setSelectedPoolIds(new Set());
  };

  const handleIngestSingle = async (poolMangaId: string, cdcEnabled: boolean = true) => {
    setIngestingId(poolMangaId);
    setSyncStatus(`Đang nạp gói manga '${poolMangaId}' từ Data Lake Pool...`);
    try {
      const res = await api.ingestEtlPackage({
        pool_manga_id: poolMangaId,
        cdc_enabled: cdcEnabled,
      });
      setMessage({
        text: `Nạp thành công '${res.title}' (${res.chapter_count} chương, ${res.page_count} trang) vào hệ thống đọc truyện!`,
        type: "success",
      });
      setSyncStatus(`Hoàn tất nạp '${res.title}' (Revision: ${res.pool_revision}, CDC: ${res.cdc_enabled ? "BẬT" : "TẮT"})`);
      const fresh = await api.getEtlSources();
      setEtlData(fresh);
    } catch (err: any) {
      setMessage({ text: err.message || `Lỗi khi nạp gói ${poolMangaId}`, type: "error" });
      setSyncStatus(`Thất bại: ${err.message}`);
    } finally {
      setIngestingId(null);
    }
  };

  const handleIngestBatch = async () => {
    if (selectedPoolIds.size === 0) {
      setMessage({ text: "Vui lòng chọn ít nhất một bộ manga để nạp.", type: "error" });
      return;
    }
    setLoading(true);
    const count = selectedPoolIds.size;
    setSyncStatus(`Đang tiến hành đẩy hàng loạt ${count} gói manga vào hệ thống đọc (CDC: ${batchCdcEnabled ? "BẬT" : "TẮT"})...`);
    try {
      const res = await api.ingestEtlPackage({
        pool_manga_ids: Array.from(selectedPoolIds),
        cdc_enabled: batchCdcEnabled,
      });
      setMessage({
        text: `Đã nạp thành công ${res.succeeded_count} / ${res.total} bộ manga từ Data Lake vào hệ thống đọc!`,
        type: "success",
      });
      setSyncStatus(`Hoàn tất Batch ETL: ${res.succeeded_count} thành công, ${res.failed_count} lỗi.`);
      setSelectedPoolIds(new Set());
      const fresh = await api.getEtlSources();
      setEtlData(fresh);
    } catch (err: any) {
      setMessage({ text: err.message || "Lỗi tiến trình nạp hàng loạt", type: "error" });
      setSyncStatus(`Thất bại Batch ETL: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCdc = async (mangaId: string, currentCdc: boolean) => {
    try {
      const res = await api.toggleMangaCdc(mangaId, !currentCdc);
      setMessage({
        text: `Đã ${res.cdc_enabled ? "BẬT" : "TẮT"} tính năng CDC (tự động nhận chương mới) cho '${res.title}'.`,
        type: "success",
      });
      const fresh = await api.getEtlSources();
      setEtlData(fresh);
    } catch (err: any) {
      setMessage({ text: err.message || "Lỗi khi đổi trạng thái CDC", type: "error" });
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

  // Filtered packages
  const packages = etlData?.datalake_packages || [];
  const filteredPackages = packages.filter((pkg) => {
    const matchSearch =
      etlSearch.trim() === "" ||
      pkg.title.toLowerCase().includes(etlSearch.toLowerCase()) ||
      (pkg.author && pkg.author.toLowerCase().includes(etlSearch.toLowerCase())) ||
      pkg.pool_manga_id.toLowerCase().includes(etlSearch.toLowerCase());

    if (!matchSearch) return false;

    if (etlFilter === "pending") return !pkg.already_ingested;
    if (etlFilter === "ingested") return pkg.already_ingested;
    if (etlFilter === "updates") return pkg.has_upstream_update;
    return true;
  });

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
            System Operations, Content Moderation (UC-8.1..8.3) & Chọn Source Tải Truyện (UC-2.3)
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

      {/* Global Message Banner */}
      {message && (
        <div
          className={`p-3 rounded text-xs font-mono border ${
            message.type === "success"
              ? "bg-emerald-950/40 border-emerald-800 text-emerald-400"
              : "bg-red-950/40 border-red-800 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-800 text-xs font-mono overflow-x-auto">
        <button
          onClick={() => setActiveTab("datalake")}
          className={`px-4 py-2 border-b-2 font-medium transition flex items-center gap-2 ${
            activeTab === "datalake"
              ? "border-amber-500 text-amber-400 bg-zinc-900/40"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span>CHỌN SOURCE TẢI TRUYỆN (UC-2.3)</span>
          {etlData && (
            <span className="px-1.5 py-0.2 rounded-full bg-zinc-800 text-amber-300 text-[10px]">
              {etlData.datalake_packages.length}
            </span>
          )}
        </button>
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
      </div>

      {/* TAB 1: DATA LAKE ETL INGESTION (UC-2.3) */}
      {activeTab === "datalake" && (
        <div className="space-y-6">
          {/* Header & Connection Status */}
          <div className="border border-zinc-800 bg-zinc-900/40 rounded p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold font-mono text-zinc-100 uppercase tracking-wide flex items-center gap-2">
                  <span>CHỌN SOURCE TẢI TRUYỆN & DATA LAKE ETL (UC-2.3)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-normal">
                    Data Contract v2.0
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 font-mono mt-1">
                  Chọn các bộ manga đã đóng gói từ Service lưu trữ bên ngoài (Manga Data Lake & Storage Pool) để nạp vào hệ thống đọc truyện, cấu hình CDC để tự động nhận chương mới.
                </p>
              </div>

              {/* Status Pill & Refresh */}
              <div className="flex items-center gap-3">
                {etlData?.datalake_online ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 text-xs font-mono">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>ONLINE: Service Data Lake (:8000)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-red-950/60 border border-red-800/80 text-red-400 text-xs font-mono">
                    <span className="h-2 w-2 rounded-full bg-red-400"></span>
                    <span>OFFLINE: Không kết nối được Service (:8000)</span>
                  </div>
                )}
                <button
                  onClick={loadTabContent}
                  disabled={loading}
                  className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-xs font-mono text-zinc-300 rounded transition disabled:opacity-50"
                  title="Tải lại danh sách từ Data Lake"
                >
                  ↻ Refresh
                </button>
              </div>
            </div>

            {/* Offline Alert if Service Down */}
            {!etlData?.datalake_online && (
              <div className="p-3 bg-red-950/30 border border-red-800/60 rounded text-xs font-mono text-red-300 flex items-center justify-between">
                <div>
                  <span className="font-bold block">⚠️ Cảnh báo kết nối nguồn (Alternative Flow 2a):</span>
                  <span>
                    Không nhận được phản hồi từ Manga Data Lake Pool API tại{" "}
                    <code className="text-amber-400">{etlData?.datalake_pool_api || "http://localhost:8000/api/datalake-pool"}</code>.
                    Vui lòng khởi chạy Backend Manga Reviews (`uv run --project backend uvicorn backend.main:app --port 8000`).
                  </span>
                </div>
                <button
                  onClick={loadTabContent}
                  className="px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded text-xs whitespace-nowrap ml-4"
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* Stats Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div className="bg-zinc-950 p-3 border border-zinc-800 rounded font-mono">
                <span className="text-[11px] text-zinc-500 uppercase block">GÓI TRONG DATA LAKE</span>
                <span className="text-xl font-bold text-amber-400 mt-0.5 block">
                  {packages.length}
                </span>
                <span className="text-[10px] text-zinc-500">Đã đóng gói sẵn sàng</span>
              </div>
              <div className="bg-zinc-950 p-3 border border-zinc-800 rounded font-mono">
                <span className="text-[11px] text-zinc-500 uppercase block">ĐÃ NẠP VÀO HỆ THỐNG ĐỌC</span>
                <span className="text-xl font-bold text-emerald-400 mt-0.5 block">
                  {etlData?.ingested_count || 0}
                </span>
                <span className="text-[10px] text-zinc-500">Hiện diện trong PostgreSQL</span>
              </div>
              <div className="bg-zinc-950 p-3 border border-zinc-800 rounded font-mono">
                <span className="text-[11px] text-zinc-500 uppercase block">CÓ BẢN CẬP NHẬT MỚI</span>
                <span className="text-xl font-bold text-sky-400 mt-0.5 block">
                  {packages.filter((p) => p.has_upstream_update).length}
                </span>
                <span className="text-[10px] text-zinc-500">Revision mới trên nguồn</span>
              </div>
              <div className="bg-zinc-950 p-3 border border-zinc-800 rounded font-mono">
                <span className="text-[11px] text-zinc-500 uppercase block">ĐANG CHỌN ĐỂ NẠP</span>
                <span className="text-xl font-bold text-amber-300 mt-0.5 block">
                  {selectedPoolIds.size}
                </span>
                <span className="text-[10px] text-zinc-500">Sẵn sàng Batch Ingestion</span>
              </div>
            </div>

            {/* Batch Action & Configuration Bar */}
            <div className="bg-zinc-950 p-4 border border-zinc-800 rounded space-y-3 font-mono">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-200">
                    <input
                      type="checkbox"
                      checked={batchCdcEnabled}
                      onChange={(e) => setBatchCdcEnabled(e.target.checked)}
                      className="rounded border-zinc-700 text-amber-600 focus:ring-0"
                    />
                    <span className="font-semibold text-amber-400">
                      Bật CDC (Tự động cập nhật chương mới khi phát sinh - UC-2.3 BR2)
                    </span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSelectAll(filteredPackages)}
                    className="px-2.5 py-1 text-xs bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded"
                  >
                    Chọn tất cả ({filteredPackages.length})
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    disabled={selectedPoolIds.size === 0}
                    className="px-2.5 py-1 text-xs bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 rounded disabled:opacity-40"
                  >
                    Bỏ chọn
                  </button>
                  <button
                    onClick={handleIngestBatch}
                    disabled={loading || selectedPoolIds.size === 0}
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs rounded transition disabled:opacity-40 flex items-center gap-1.5 shadow"
                  >
                    <span>⚡ Xác Nhận Đẩy ({selectedPoolIds.size}) Gói Vào Hệ Thống Đọc</span>
                  </button>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <input
                    type="text"
                    value={etlSearch}
                    onChange={(e) => setEtlSearch(e.target.value)}
                    placeholder="Tìm theo tên truyện, tác giả hoặc pool_manga_id..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-amber-500"
                  />
                  {etlSearch && (
                    <button
                      onClick={() => setEtlSearch("")}
                      className="text-zinc-500 hover:text-zinc-300 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-zinc-500 mr-1">Lọc:</span>
                  {(
                    [
                      { id: "all", label: `Tất cả (${packages.length})` },
                      { id: "pending", label: `Chưa nạp (${packages.filter((p) => !p.already_ingested).length})` },
                      { id: "ingested", label: `Đã nạp (${packages.filter((p) => p.already_ingested).length})` },
                      { id: "updates", label: `Có update (${packages.filter((p) => p.has_upstream_update).length})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setEtlFilter(f.id)}
                      className={`px-2 py-1 rounded text-xs transition ${
                        etlFilter === f.id
                          ? "bg-zinc-700 text-amber-400 font-semibold"
                          : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Pipeline Execution Logs */}
            {syncStatus && (
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded font-mono text-xs text-zinc-300">
                <span className="text-zinc-500 block mb-1">TIẾN TRÌNH PIPELINE GẦN NHẤT:</span>
                <p className="font-mono text-zinc-200">{syncStatus}</p>
              </div>
            )}
          </div>

          {/* Manga Package Table (UC-2.3: Chọn manga đóng gói sẵn) */}
          <div className="border border-zinc-800 rounded bg-zinc-900/30 overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredPackages.length > 0 &&
                        filteredPackages.every((p) => selectedPoolIds.has(p.pool_manga_id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) handleSelectAll(filteredPackages);
                        else handleDeselectAll();
                      }}
                      className="rounded border-zinc-700 text-amber-600 focus:ring-0"
                    />
                  </th>
                  <th className="p-3">BỘ MANGA TRONG DATA LAKE</th>
                  <th className="p-3">POOL ID & REVISION</th>
                  <th className="p-3">QUY MÔ</th>
                  <th className="p-3">TRẠNG THÁI HỆ THỐNG ĐỌC</th>
                  <th className="p-3">CẤU HÌNH CDC</th>
                  <th className="p-3 text-right">THAO TÁC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredPackages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-zinc-500 font-mono">
                      {etlData?.datalake_online
                        ? "Không tìm thấy bộ manga nào phù hợp với bộ lọc."
                        : "Chưa kết nối được với Service Manga Data Lake Pool (:8000)."}
                    </td>
                  </tr>
                ) : (
                  filteredPackages.map((pkg) => {
                    const isSelected = selectedPoolIds.has(pkg.pool_manga_id);
                    const isIngesting = ingestingId === pkg.pool_manga_id;
                    const sizeMb = (pkg.total_size_bytes / (1024 * 1024)).toFixed(1);

                    return (
                      <tr
                        key={pkg.pool_manga_id}
                        className={`hover:bg-zinc-900/40 transition ${
                          isSelected ? "bg-amber-950/20" : ""
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(pkg.pool_manga_id)}
                            className="rounded border-zinc-700 text-amber-600 focus:ring-0"
                          />
                        </td>

                        {/* Manga Details & Cover */}
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            {pkg.cover_url ? (
                              <img
                                src={pkg.cover_url}
                                alt={pkg.title}
                                className="w-10 h-14 object-cover rounded bg-zinc-800 border border-zinc-700/60 shrink-0"
                                onError={(e) => {
                                  // Fallback placeholder if image broken
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="w-10 h-14 rounded bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-[10px] text-zinc-500 shrink-0">
                                NO IMG
                              </div>
                            )}
                            <div className="space-y-0.5">
                              <span className="font-bold text-zinc-100 block text-xs hover:text-amber-400">
                                {pkg.title}
                              </span>
                              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                                <span>Tác giả: {pkg.author || "N/A"}</span>
                                {pkg.year && <span>• Năm: {pkg.year}</span>}
                              </div>
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[10px] text-zinc-300 uppercase">
                                  {pkg.status || "Unknown"}
                                </span>
                                {pkg.publication_demographic && (
                                  <span className="px-1.5 py-0.2 rounded bg-zinc-800/80 text-[10px] text-zinc-400 uppercase">
                                    {pkg.publication_demographic}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Pool ID & Revision */}
                        <td className="p-3 text-zinc-400">
                          <span className="font-mono text-zinc-300 block">{pkg.pool_manga_id}</span>
                          <span className="text-[11px] text-zinc-500 block">
                            Pool Rev: <strong className="text-amber-400">v{pkg.pool_revision}</strong>
                          </span>
                        </td>

                        {/* Scale (Chapters, Pages, Size) */}
                        <td className="p-3 text-zinc-300">
                          <span className="font-semibold block">{pkg.chapter_count} Chương</span>
                          <span className="text-[11px] text-zinc-500 block">
                            {pkg.page_count} trang • {sizeMb} MB
                          </span>
                        </td>

                        {/* System Ingestion Status */}
                        <td className="p-3">
                          {pkg.already_ingested ? (
                            pkg.has_upstream_update ? (
                              <div className="space-y-0.5">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-400 border border-amber-800 animate-pulse inline-block">
                                  ⚡ CÓ BẢN MỚI (v{pkg.pool_revision} &gt; v{pkg.local_revision})
                                </span>
                                <span className="text-[10px] text-zinc-500 block">Đã nạp bản cũ</span>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800 inline-block">
                                  ✓ ĐÃ NẠP (v{pkg.local_revision})
                                </span>
                                <span className="text-[10px] text-zinc-500 block">Khớp sha256</span>
                              </div>
                            )
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 inline-block">
                              CHƯA NẠP
                            </span>
                          )}
                        </td>

                        {/* CDC Configuration */}
                        <td className="p-3">
                          {pkg.already_ingested ? (
                            <button
                              onClick={() => handleToggleCdc(pkg.pool_manga_id, pkg.cdc_enabled)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition border ${
                                pkg.cdc_enabled
                                  ? "bg-emerald-950/60 text-emerald-300 border-emerald-700 hover:bg-emerald-900"
                                  : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:bg-zinc-700"
                              }`}
                              title="Bấm để bật/tắt CDC cho bộ truyện này"
                            >
                              {pkg.cdc_enabled ? "● CDC ON" : "○ CDC OFF"}
                            </button>
                          ) : (
                            <span className="text-[10px] text-zinc-500 italic">
                              Sẽ bật khi nạp
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleIngestSingle(pkg.pool_manga_id, batchCdcEnabled)}
                            disabled={isIngesting || loading}
                            className={`px-3 py-1 rounded text-xs font-bold transition disabled:opacity-40 ${
                              pkg.already_ingested
                                ? pkg.has_upstream_update
                                  ? "bg-amber-600 hover:bg-amber-500 text-black"
                                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                                : "bg-emerald-600 hover:bg-emerald-500 text-white"
                            }`}
                          >
                            {isIngesting
                              ? "Đang nạp..."
                              : pkg.already_ingested
                              ? pkg.has_upstream_update
                                ? "Cập nhật v" + pkg.pool_revision
                                : "Đồng bộ lại"
                              : "+ Nạp Vào Hệ Thống"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: REPORTS */}
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
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px]"
                            >
                              Resolve
                            </button>
                            <button
                              onClick={() => handleResolveReport(report.report_id, "dismissed")}
                              className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded text-[11px]"
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

      {/* TAB 3: MANGA CATALOG */}
      {activeTab === "mangas" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-900/40 p-3 rounded border border-zinc-800">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-zinc-400">Action Reason (Audit Trail):</span>
              <input
                type="text"
                value={mangaActionReason}
                onChange={(e) => setMangaActionReason(e.target.value)}
                placeholder="Reason for hiding/showing..."
                className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs w-64"
              />
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
                  <th className="p-3">POOL ID / TITLE</th>
                  <th className="p-3">CHAPTERS</th>
                  <th className="p-3">RATINGS</th>
                  <th className="p-3">VISIBILITY</th>
                  <th className="p-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {mangas.map((m) => {
                  const isHidden = (m as any).visibility_status === "hidden";
                  return (
                    <tr key={m.pool_manga_id} className="hover:bg-zinc-900/40">
                      <td className="p-3">
                        <span className="font-semibold block text-zinc-100">{m.title}</span>
                        <span className="text-zinc-500 font-mono text-[11px]">{m.pool_manga_id}</span>
                      </td>
                      <td className="p-3 text-zinc-300">{m.chapter_count} Ch.</td>
                      <td className="p-3 text-zinc-300">★ {m.average_rating.toFixed(1)} ({m.rating_count})</td>
                      <td className="p-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            isHidden
                              ? "bg-red-950/60 text-red-400 border border-red-800/60"
                              : "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
                          }`}
                        >
                          {isHidden ? "HIDDEN" : "PUBLIC"}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleToggleMangaVisibility(m.pool_manga_id, isHidden)}
                          className={`px-3 py-1 rounded text-[11px] font-bold ${
                            isHidden
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                              : "bg-amber-600 hover:bg-amber-500 text-black"
                          }`}
                        >
                          {isHidden ? "Show Public" : "Hide Manga"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: USER GOVERNANCE */}
      {activeTab === "users" && (
        <div className="space-y-6">
          <div className="border border-zinc-800 bg-zinc-900/40 rounded p-5 space-y-4 font-mono text-xs max-w-xl">
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
    </div>
  );
};

export default AdminPage;
