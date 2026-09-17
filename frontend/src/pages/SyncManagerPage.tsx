import React, { useState, useEffect, useRef } from "react";
import { 
  RefreshCw, Settings, Plus, Play, Eye, Edit2, Trash2, Search, 
  Loader2, Clock, CheckCircle2, XCircle, X, Pause, Terminal,
  ChevronDown, ChevronUp, Image as ImageIcon, Database, Layers, CheckSquare, Square
} from "lucide-react";
import axios from "axios";
import client from "../api/client";
import { useAlert } from "../hooks/useAlert";
import { GroupedTagSelector } from "../components/ui/GroupedTagSelector";

interface SyncPool {
  _id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  filters: {
    read_statuses: string[];
    exclude_read_statuses: string[];
    publish_statuses: string[];
    content_ratings: string[];
    demographics: string[];
    tags: string[];
    exclude_tags: string[];
    original_languages: string[];
  };
  sync_options: {
    sync_metadata: boolean;
    sync_covers: boolean;
    sync_recommendations: boolean;
    sync_trackers?: boolean;
  };
  schedule: {
    type: "manual" | "interval";
    interval_hours: number | null;
  };
  last_synced_at: string | null;
}

interface SyncLog {
  _id: string;
  sync_config_id: string | null;
  manga_id: string;
  mangadex_id: string;
  manga_title: string;
  operation: string;
  status: "pending" | "running" | "completed" | "failed";
  details: {
    covers_synced: number;
    covers_failed: number;
    recommendations_found: number;
    errors: string[];
  };
  started_at: string;
  completed_at: string | null;
}

interface SyncRun {
  _id: string;
  name: string;
  type: string;
  status: "running" | "completed" | "failed" | "cancelled";
  total_count: number;
  completed_count: number;
  failed_count: number;
  sync_options: {
    sync_metadata: boolean;
    sync_covers: boolean;
    sync_recommendations: boolean;
    sync_trackers?: boolean;
  };

  started_at: string;
  completed_at: string | null;
  logs: string[];
  items: {
    title: string;
    manga_id: string;
    status: "completed" | "failed";
    details: string;
  }[];
}

interface SyncStats {
  total_synced_mangas: number;
  total_covers: number;
  total_recommendations_cached: number;
  last_synced_at: string | null;
}

interface LocalManga {
  _id: string;
  title: string;
  mangadex_id: string | null;
  status?: string;
  read_status?: string;
  cover_url?: string | null;
}

interface Tag {
  _id: string;
  name: { en: string; vi?: string | null };
  group?: string;
}

export const SyncManagerPage: React.FC = () => {
  const { showAlert } = useAlert();
  
  // Core States
  const [pools, setPools] = useState<SyncPool[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [resolution, setResolution] = useState("original");
  const [tags, setTags] = useState<Tag[]>([]);
  
  const [loadingPools, setLoadingPools] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [executingPoolId, setExecutingPoolId] = useState<string | null>(null);

  // Pool Selection Details
  const [selectedPool, setSelectedPool] = useState<SyncPool | null>(null);
  const [poolPreviewMangas, setPoolPreviewMangas] = useState<LocalManga[]>([]);
  const [loadingPoolPreview, setLoadingPoolPreview] = useState(false);

  // Load All System Manga state
  const [loadingAllLocal, setLoadingAllLocal] = useState(false);

  // Tab View for History Logs
  const [activeHistoryTab, setActiveHistoryTab] = useState<"items" | "runs">("items");
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Sequential Sync Runner States
  const [isRunnerOpen, setIsRunnerOpen] = useState(false);
  const [runnerTitle, setRunnerTitle] = useState("");
  const [runnerMangas, setRunnerMangas] = useState<LocalManga[]>([]);
  const [runnerIndex, setRunnerIndex] = useState(0);
  const [runnerStatus, setRunnerStatus] = useState<"idle" | "running" | "paused" | "completed" | "cancelled">("idle");
  const [runnerStats, setRunnerStats] = useState({
    completed: 0,
    failed: 0,
    coversSynced: 0,
    recsSynced: 0,
    apiRequests: 0
  });
  const [runnerLogs, setRunnerLogs] = useState<string[]>([]);
  const [runnerElapsed, setRunnerElapsed] = useState(0);

  // Concurrency & Workers Configuration
  const [concurrency, setConcurrency] = useState(5);
  const [activeWorkersCount, setActiveWorkersCount] = useState(0);
  const [selectedConcurrency, setSelectedConcurrency] = useState(5);

  // Runner Refs to control synchronous loop
  const runnerIsPausedRef = useRef(false);
  const runnerCancelledRef = useRef(false);
  const activeTimerRef = useRef<any>(null);
  const workerControllersRef = useRef<{ [workerId: number]: AbortController }>({});
  const queueRef = useRef<number[]>([]);
  const activeWorkersRef = useRef<number>(0);

  // Batch Sync States
  const [searchQuery, setSearchQuery] = useState("");
  const [localMangas, setLocalMangas] = useState<LocalManga[]>([]);
  const [selectedMangaIds, setSelectedMangaIds] = useState<string[]>([]);
  const [batchOptions, setBatchOptions] = useState({
    sync_metadata: true,
    sync_covers: false,
    sync_recommendations: false,
    sync_trackers: false
  });
  const [batchSyncing, setBatchSyncing] = useState(false);

  // Preview Modal
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewPoolName, setPreviewPoolName] = useState("");
  const [previewMangas, setPreviewMangas] = useState<LocalManga[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Pool Modal States
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [editingPool, setEditingPool] = useState<SyncPool | null>(null);
  const [poolName, setPoolName] = useState("");
  const [poolDesc, setPoolDesc] = useState("");
  const [poolEnabled, setPoolEnabled] = useState(true);
  
  // Pool Filters Form State
  const [poolReadStatuses, setPoolReadStatuses] = useState<string[]>([]);
  const [poolPublishStatuses, setPoolPublishStatuses] = useState<string[]>([]);
  const [poolContentRatings, setPoolContentRatings] = useState<string[]>([]);
  const [poolDemographics, setPoolDemographics] = useState<string[]>([]);
  const [poolTagsInclude, setPoolTagsInclude] = useState<string[]>([]);
  const [poolTagsExclude, setPoolTagsExclude] = useState<string[]>([]);
  const [poolLanguages, setPoolLanguages] = useState<string[]>([]);
  
  // Pool Sync Options Form State
  const [poolSyncOptions, setPoolSyncOptions] = useState({
    sync_metadata: true,
    sync_covers: false,
    sync_recommendations: false,
    sync_trackers: false
  });

  
  // Pool Schedule
  const [scheduleType, setScheduleType] = useState<"manual" | "interval">("manual");
  const [intervalHours, setIntervalHours] = useState<number | "">("");

  // UI Helpers
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Fetch functions
  const fetchStats = async () => {
    try {
      const res = await client.get("/api/sync/stats");
      setStats(res.data);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await client.get("/api/sync/settings");
      setResolution(res.data.cover_resolution || "original");
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const fetchPools = async () => {
    try {
      setLoadingPools(true);
      const res = await client.get("/api/sync/pools");
      setPools(res.data);
    } catch (err) {
      console.error("Failed to load pools:", err);
    } finally {
      setLoadingPools(false);
    }
  };

  const fetchLogs = async () => {
    try {
      setLoadingLogs(true);
      const res = await client.get("/api/sync/logs");
      setLogs(res.data);
    } catch (err) {
      console.error("Failed to load sync logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchSyncRuns = async () => {
    try {
      setLoadingRuns(true);
      const res = await client.get("/api/sync/runs");
      setSyncRuns(res.data);
    } catch (err) {
      console.error("Failed to load sync runs:", err);
    } finally {
      setLoadingRuns(false);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await client.get("/api/tags/");
      setTags(res.data);
    } catch (err) {
      console.error("Failed to fetch tags:", err);
    }
  };

  const fetchLocalMangas = async () => {
    try {
      const res = await client.get("/api/manga/", {
        params: { search: searchQuery, limit: 100 }
      });
      // Filter out mangas that do not have a mangadex_id (can't be synced)
      const synclable = res.data.items.filter((m: LocalManga) => m.mangadex_id !== null);
      setLocalMangas(synclable);
    } catch (err) {
      console.error("Failed to load local mangas:", err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchSettings();
    fetchPools();
    fetchLogs();
    fetchSyncRuns();
    fetchTags();
  }, []);

  // Load preview data when a pool is selected
  const handleSelectPool = async (pool: SyncPool) => {
    setSelectedPool(pool);
    try {
      setLoadingPoolPreview(true);
      const res = await client.post(`/api/sync/pools/${pool._id}/preview`);
      setPoolPreviewMangas(res.data);
    } catch (err) {
      console.error("Failed to load pool preview:", err);
      setPoolPreviewMangas([]);
    } finally {
      setLoadingPoolPreview(false);
    }
  };

  // Load and select all library manga (override the 100 pagination limit)
  const handleLoadAndSelectAll = async () => {
    try {
      setLoadingAllLocal(true);
      showAlert({
        title: "Loading Library Titles",
        message: "Fetching all synced titles from database...",
        type: "info"
      });
      const res = await client.get("/api/manga/", {
        params: { limit: 10000 }
      });
      const synclable = res.data.items.filter((m: LocalManga) => m.mangadex_id !== null);
      setLocalMangas(synclable);
      setSelectedMangaIds(synclable.map((m: LocalManga) => m._id));
      showAlert({
        title: "Select All Complete",
        message: `Successfully loaded and selected all ${synclable.length} syncable titles.`,
        type: "success"
      });
    } catch (err) {
      console.error("Failed to load all local mangas:", err);
      showAlert({
        title: "Error",
        message: "Failed to retrieve all titles from database.",
        type: "error"
      });
    } finally {
      setLoadingAllLocal(false);
    }
  };

  // Control commands for the sequential sync runner
  const pauseRunner = () => {
    runnerIsPausedRef.current = true;
    setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Sync paused by user. Aborting active requests...`]);
    // Abort all active workers
    Object.values(workerControllersRef.current).forEach(c => c.abort());
    setRunnerStatus("paused");
  };

  const resumeRunner = () => {
    runnerIsPausedRef.current = false;
    setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Sync resumed.`]);
    setRunnerStatus("running");
  };

  const cancelRunner = async () => {
    runnerCancelledRef.current = true;
    runnerIsPausedRef.current = false;
    if (activeTimerRef.current) {
      clearInterval(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Cancelling sync run. Aborting active requests...`]);
    // Abort all active workers
    Object.values(workerControllersRef.current).forEach(c => c.abort());
    setRunnerStatus("cancelled");
  };

  // Trigger Sequential Sync from either a Pool or Batch
  const triggerSequentialSync = async (mangasToSync: LocalManga[], options: any, name: string, type: "pool" | "batch") => {
    if (mangasToSync.length === 0) return;
    
    // Reset control refs
    runnerIsPausedRef.current = false;
    runnerCancelledRef.current = false;
    
    // Initialize queue and worker controllers
    queueRef.current = Array.from({ length: mangasToSync.length }, (_, idx) => idx);
    workerControllersRef.current = {};
    
    const workerCount = concurrency;
    setSelectedConcurrency(workerCount);
    activeWorkersRef.current = workerCount;
    setActiveWorkersCount(workerCount);
    
    setIsRunnerOpen(true);
    setRunnerTitle(name);
    setRunnerMangas(mangasToSync);
    setRunnerIndex(0);
    setRunnerStatus("running");
    setRunnerElapsed(0);
    setRunnerStats({
      completed: 0,
      failed: 0,
      coversSynced: 0,
      recsSynced: 0,
      apiRequests: 0
    });
    setRunnerLogs([`[${new Date().toLocaleTimeString()}] Starting sequential sync for '${name}' (${mangasToSync.length} titles) with ${workerCount} workers...`]);

    let runId = null;
    try {
      const runRes = await client.post("/api/sync/runs", {
        name,
        type,
        total_count: mangasToSync.length,
        sync_options: options
      });
      runId = runRes.data._id || runRes.data.id;
    } catch (err) {
      console.error("Failed to create sync run log:", err);
    }

    activeTimerRef.current = setInterval(() => {
      if (!runnerIsPausedRef.current) {
        setRunnerElapsed(prev => prev + 1);
      }
    }, 1000);

    // Run the loop in an async IIFE to not block UI rendering
    (async () => {
      let completedCount = 0;
      let failedCount = 0;
      let coversSyncedCount = 0;
      let recsSyncedCount = 0;
      let apiRequestsCount = 0;
      let logsAccumulator = [`Starting sequential sync for '${name}' (${mangasToSync.length} titles) with ${workerCount} workers...`];
      let itemsTracker: any[] = [];

      const updateDB = async (finalStatus: string, finalLogs: string[], finalItems: any[]) => {
        if (!runId) return;
        try {
          await client.put(`/api/sync/runs/${runId}`, {
            status: finalStatus,
            completed_count: completedCount,
            failed_count: failedCount,
            logs: finalLogs,
            items: finalItems
          });
        } catch (dbErr) {
          console.error("Failed to update sync run in DB:", dbErr);
        }
      };

      const runWorker = async (workerId: number) => {
        // Initial delay matches 1.5s divided by number of workers
        let localDelay = Math.max(300, 1500 / workerCount);
        
        while (true) {
          // Handle Pause State
          while (runnerIsPausedRef.current) {
            await new Promise(resolve => setTimeout(resolve, 500));
            if (runnerCancelledRef.current) break;
          }

          if (runnerCancelledRef.current) {
            break;
          }

          const mangaIndex = queueRef.current.shift();
          if (mangaIndex === undefined) {
            // No more items in queue
            break;
          }

          const currentManga = mangasToSync[mangaIndex];
          
          const startMsg = `[Worker ${workerId + 1}] Syncing '${currentManga.title}'...`;
          logsAccumulator.push(startMsg);
          setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${startMsg}`]);

          apiRequestsCount++;
          setRunnerStats(prev => ({ ...prev, apiRequests: apiRequestsCount }));

          let success = false;
          let itemDetails = "";
          let cov = 0;
          let rec = 0;

          try {
            const controller = new AbortController();
            workerControllersRef.current[workerId] = controller;

            // sleep/delay before making the call
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(resolve, localDelay);
              controller.signal.addEventListener("abort", () => {
                clearTimeout(timeout);
                reject(new DOMException("Aborted", "AbortError"));
              });
            });

            const res = await client.post("/api/sync/single", {
              manga_id: currentManga._id,
              options: options
            }, {
              signal: controller.signal
            });

            if (res.data.status === "completed") {
              success = true;
              completedCount++;
              cov = res.data.details?.covers_synced || 0;
              rec = res.data.details?.recommendations_found || 0;
              coversSyncedCount += cov;
              recsSyncedCount += rec;
              
              itemDetails = `Success (Covers: ${cov}, Recs: ${rec})`;
              
              const successMsg = `[Worker ${workerId + 1}] Successfully synced '${currentManga.title}'.`;
              logsAccumulator.push(successMsg);
              setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${successMsg}`]);
              
              // Dynamically decrease delay slightly on success
              localDelay = Math.max(300, localDelay * 0.9);
            } else {
              const errList = res.data.details?.errors || ["Sync failed"];
              const isSpecificMangaError = errList.some((err: string) => {
                const lower = err.toLowerCase();
                return lower.includes("404") || lower.includes("not found") || lower.includes("no manga found");
              });

              if (isSpecificMangaError) {
                failedCount++;
                itemDetails = `Failed: ${errList.join(", ")}`;
                
                const failMsg = `[Worker ${workerId + 1}] Failed to sync '${currentManga.title}': ${errList.join(", ")}`;
                logsAccumulator.push(failMsg);
                setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${failMsg}`]);
                
                localDelay = Math.max(300, localDelay * 0.9);
              } else {
                // Transient failure (not 404), retry indefinitely
                const retryMsg = `[Worker ${workerId + 1}] Transient error on '${currentManga.title}': ${errList.join(", ")}. Retrying...`;
                logsAccumulator.push(retryMsg);
                setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${retryMsg}`]);

                localDelay = Math.min(25000, localDelay * 2.5);

                queueRef.current.unshift(mangaIndex);
                delete workerControllersRef.current[workerId];
                continue;
              }
            }
          } catch (syncErr: any) {
            if (axios.isCancel(syncErr) || syncErr.name === "AbortError" || syncErr.name === "CanceledError" || syncErr.code === "ERR_CANCELED") {
              // Put item back to the front of queue
              queueRef.current.unshift(mangaIndex);
              delete workerControllersRef.current[workerId];
              
              if (runnerCancelledRef.current) break;
              continue;
            }
            
            const errMsg = syncErr.response?.data?.detail || syncErr.message || "Network error";
            const errMsgStr = Array.isArray(errMsg) ? errMsg.join(", ") : String(errMsg);
            const lowerError = errMsgStr.toLowerCase();
            const isSpecificMangaError = syncErr.response?.status === 404 || lowerError.includes("404") || lowerError.includes("not found") || lowerError.includes("no manga found");

            if (isSpecificMangaError) {
              failedCount++;
              itemDetails = `Error: ${errMsgStr}`;
              
              const errorMsg = `[Worker ${workerId + 1}] Error syncing '${currentManga.title}': ${errMsgStr}`;
              logsAccumulator.push(errorMsg);
              setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${errorMsg}`]);
              
              localDelay = Math.max(300, localDelay * 0.9);
            } else {
              // Transient network/connection error, retry indefinitely
              const errorMsg = `[Worker ${workerId + 1}] Transient error syncing '${currentManga.title}': ${errMsgStr}. Retrying...`;
              logsAccumulator.push(errorMsg);
              setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${errorMsg}`]);

              const isRateLimited = 
                syncErr.response?.status === 429 || 
                lowerError.includes("429") || 
                lowerError.includes("rate limit") || 
                lowerError.includes("too many requests");
              
              const isForbiddenOrBlock = 
                syncErr.response?.status === 403 || 
                lowerError.includes("403") || 
                lowerError.includes("forbidden") || 
                lowerError.includes("blocked") || 
                lowerError.includes("captcha") || 
                lowerError.includes("cloudflare");

              const isOverloaded =
                syncErr.response?.status === 503 ||
                syncErr.response?.status === 502 ||
                lowerError.includes("503") ||
                lowerError.includes("502") ||
                lowerError.includes("overload") ||
                lowerError.includes("service unavailable") ||
                lowerError.includes("timeout");

              if (isRateLimited || isForbiddenOrBlock || isOverloaded) {
                localDelay = Math.min(25000, localDelay * 2.5);
                
                if (activeWorkersRef.current > 1) {
                  activeWorkersRef.current--;
                  setActiveWorkersCount(activeWorkersRef.current);
                  
                  const retireMsg = `[Worker ${workerId + 1}] Encountered rate limit/block/overload. Retiring worker to reduce API load. Active workers remaining: ${activeWorkersRef.current}`;
                  logsAccumulator.push(retireMsg);
                  setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${retireMsg}`]);
                  
                  // Put item back
                  queueRef.current.unshift(mangaIndex);
                  delete workerControllersRef.current[workerId];
                  break; // exit worker loop
                }
              } else {
                localDelay = Math.min(20000, localDelay * 1.5);
              }

              // Put item back and retry
              queueRef.current.unshift(mangaIndex);
              delete workerControllersRef.current[workerId];
              continue;
            }
          }

          delete workerControllersRef.current[workerId];

          // Update shared stats
          setRunnerStats({
            completed: completedCount,
            failed: failedCount,
            coversSynced: coversSyncedCount,
            recsSynced: recsSyncedCount,
            apiRequests: apiRequestsCount
          });
          
          setRunnerIndex(completedCount + failedCount);

          itemsTracker.push({
            title: currentManga.title,
            manga_id: currentManga._id,
            status: success ? "completed" : "failed",
            details: itemDetails
          });

          // Update DB run state
          await updateDB("running", logsAccumulator, itemsTracker);
        }
      };

      // Spawn concurrent workers
      const workers = [];
      for (let w = 0; w < workerCount; w++) {
        workers.push(runWorker(w));
      }
      await Promise.all(workers);

      // Finish Timer
      if (activeTimerRef.current) clearInterval(activeTimerRef.current);

      if (runnerCancelledRef.current) {
        const cancelMsg = `Sync run cancelled by user.`;
        logsAccumulator.push(cancelMsg);
        setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${cancelMsg}`]);
        setRunnerStatus("cancelled");
        await updateDB("cancelled", logsAccumulator, itemsTracker);
      } else {
        const doneMsg = `Sync run completed. ${completedCount} succeeded, ${failedCount} failed.`;
        logsAccumulator.push(doneMsg);
        setRunnerLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${doneMsg}`]);
        setRunnerStatus("completed");
        await updateDB("completed", logsAccumulator, itemsTracker);
      }
      fetchStats();
      fetchLogs();
      fetchSyncRuns();
    })();
  };

  useEffect(() => {
    fetchLocalMangas();
  }, [searchQuery]);

  // Handle Settings Save
  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      await client.put("/api/sync/settings", { cover_resolution: resolution });
      showAlert({
        title: "Settings Saved",
        message: `Global sync resolution set to ${resolution === "original" ? "Original" : resolution + "px"}.`,
        type: "success"
      });
      fetchStats();
    } catch (err) {
      console.error("Failed to save settings:", err);
      showAlert({
        title: "Error",
        message: "Failed to update resolution settings.",
        type: "error"
      });
    } finally {
      setSavingSettings(false);
    }
  };

  // Trigger Pool Sync
  const handleExecutePool = async (poolId: string, name: string) => {
    try {
      setExecutingPoolId(poolId);
      showAlert({
        title: "Sync Process Started",
        message: `Sync pool '${name}' has been triggered in the background. Check History logs.`,
        type: "info"
      });
      await client.post(`/api/sync/pools/${poolId}/execute`);
      
      // Reload stats and logs after a small delay
      setTimeout(() => {
        fetchStats();
        fetchLogs();
      }, 1000);
    } catch (err) {
      console.error("Failed to execute pool:", err);
      showAlert({
        title: "Trigger Failed",
        message: "Failed to trigger sync pool execution.",
        type: "error"
      });
    } finally {
      setExecutingPoolId(null);
    }
  };

  // Preview Pool matching titles
  const handlePreviewPool = async (poolId: string, name: string) => {
    try {
      setLoadingPreview(true);
      setPreviewPoolName(name);
      setIsPreviewOpen(true);
      const res = await client.post(`/api/sync/pools/${poolId}/preview`);
      setPreviewMangas(res.data);
    } catch (err) {
      console.error("Failed to preview pool:", err);
      showAlert({
        title: "Preview Failed",
        message: "Failed to preview matching titles.",
        type: "error"
      });
      setIsPreviewOpen(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Toggle Pool enabled status
  const handleTogglePool = async (pool: SyncPool) => {
    try {
      const updatedConfig = {
        name: pool.name,
        description: pool.description,
        enabled: !pool.enabled,
        filters: pool.filters,
        sync_options: pool.sync_options,
        schedule: pool.schedule
      };
      await client.put(`/api/sync/pools/${pool._id}`, updatedConfig);
      setPools(prev => prev.map(p => p._id === pool._id ? { ...p, enabled: !pool.enabled } : p));
      showAlert({
        title: `Pool ${!pool.enabled ? "Enabled" : "Disabled"}`,
        message: `Sync pool '${pool.name}' status has been updated.`,
        type: "success"
      });
    } catch (err) {
      console.error("Failed to toggle pool:", err);
    }
  };

  // Delete Pool
  const handleDeletePool = async (poolId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete sync pool '${name}'?`)) return;
    try {
      await client.delete(`/api/sync/pools/${poolId}`);
      setPools(prev => prev.filter(p => p._id !== poolId));
      showAlert({
        title: "Pool Deleted",
        message: `'${name}' pool has been removed.`,
        type: "success"
      });
    } catch (err) {
      console.error("Failed to delete pool:", err);
    }
  };

  // Abort all backend background active tasks
  const handleAbortAllBackground = async () => {
    if (!window.confirm("Are you sure you want to immediately abort ALL background synchronization processes? This will stop any active server-side sync tasks.")) return;
    try {
      const res = await client.post("/api/sync/abort-active");
      showAlert({
        title: "Sync Aborted",
        message: res.data.message || "Successfully cancelled active background tasks.",
        type: "success"
      });
      fetchStats();
      fetchLogs();
      fetchSyncRuns();
    } catch (err: any) {
      console.error("Failed to abort background tasks:", err);
      showAlert({
        title: "Abort Failed",
        message: err.response?.data?.detail || "An error occurred while attempting to abort background tasks.",
        type: "error"
      });
    }
  };

  // Handle Edit/Create Modal Opening
  const handleOpenPoolModal = (pool: SyncPool | null = null) => {
    if (pool) {
      setEditingPool(pool);
      setPoolName(pool.name);
      setPoolDesc(pool.description || "");
      setPoolEnabled(pool.enabled);
      setPoolReadStatuses(pool.filters.read_statuses || []);
      setPoolPublishStatuses(pool.filters.publish_statuses || []);
      setPoolContentRatings(pool.filters.content_ratings || []);
      setPoolDemographics(pool.filters.demographics || []);
      setPoolTagsInclude(pool.filters.tags || []);
      setPoolTagsExclude(pool.filters.exclude_tags || []);
      setPoolLanguages(pool.filters.original_languages || []);
      setPoolSyncOptions({
        sync_metadata: pool.sync_options.sync_metadata,
        sync_covers: pool.sync_options.sync_covers,
        sync_recommendations: pool.sync_options.sync_recommendations,
        sync_trackers: !!pool.sync_options.sync_trackers
      });
      setScheduleType(pool.schedule.type);
      setIntervalHours(pool.schedule.interval_hours || "");
    } else {
      setEditingPool(null);
      setPoolName("");
      setPoolDesc("");
      setPoolEnabled(true);
      setPoolReadStatuses([]);
      setPoolPublishStatuses([]);
      setPoolContentRatings([]);
      setPoolDemographics([]);
      setPoolTagsInclude([]);
      setPoolTagsExclude([]);
      setPoolLanguages([]);
      setPoolSyncOptions({
        sync_metadata: true,
        sync_covers: false,
        sync_recommendations: false,
        sync_trackers: false
      });
      setScheduleType("manual");
      setIntervalHours("");
    }

    setIsPoolModalOpen(true);
  };

  // Save Pool Configuration
  const handleSavePool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poolName.trim()) return;

    const payload = {
      name: poolName.trim(),
      description: poolDesc.trim() || null,
      enabled: poolEnabled,
      filters: {
        read_statuses: poolReadStatuses,
        exclude_read_statuses: [],
        publish_statuses: poolPublishStatuses,
        content_ratings: poolContentRatings,
        demographics: poolDemographics,
        tags: poolTagsInclude,
        exclude_tags: poolTagsExclude,
        original_languages: poolLanguages
      },
      sync_options: poolSyncOptions,
      schedule: {
        type: scheduleType,
        interval_hours: scheduleType === "interval" && intervalHours !== "" ? Number(intervalHours) : null
      }
    };

    try {
      if (editingPool) {
        const res = await client.put(`/api/sync/pools/${editingPool._id}`, payload);
        setPools(prev => prev.map(p => p._id === editingPool._id ? res.data : p));
        showAlert({
          title: "Pool Updated",
          message: `Pool '${payload.name}' saved successfully.`,
          type: "success"
        });
      } else {
        const res = await client.post("/api/sync/pools", payload);
        setPools(prev => [...prev, res.data]);
        showAlert({
          title: "Pool Created",
          message: `Pool '${payload.name}' created successfully.`,
          type: "success"
        });
      }
      setIsPoolModalOpen(false);
    } catch (err) {
      console.error("Failed to save pool:", err);
      showAlert({
        title: "Save Failed",
        message: "An error occurred while saving the pool.",
        type: "error"
      });
    }
  };

  // Batch Sync execution
  const handleTriggerBatch = async () => {
    if (selectedMangaIds.length === 0) return;
    try {
      setBatchSyncing(true);
      showAlert({
        title: "Batch Sync Triggered",
        message: `Queued ${selectedMangaIds.length} titles for background synchronization.`,
        type: "info"
      });
      await client.post("/api/sync/batch", {
        manga_ids: selectedMangaIds,
        options: batchOptions
      });
      
      setSelectedMangaIds([]);
      
      setTimeout(() => {
        fetchStats();
        fetchLogs();
      }, 1000);
    } catch (err) {
      console.error("Failed to trigger batch sync:", err);
    } finally {
      setBatchSyncing(false);
    }
  };

  const toggleSelectManga = (id: string) => {
    setSelectedMangaIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllLocal = () => {
    if (selectedMangaIds.length === localMangas.length) {
      setSelectedMangaIds([]);
    } else {
      setSelectedMangaIds(localMangas.map(m => m._id));
    }
  };

  const getLogStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-blue-50 dark:bg-blue-950/30 text-blue-500 rounded-full border border-blue-100 dark:border-blue-900/40">
            <Loader2 size={12} className="animate-spin" />
            Running
          </span>
        );
      case "completed":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-100 dark:border-emerald-900/40">
            <CheckCircle2 size={12} />
            Completed
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-full border border-rose-100 dark:border-rose-900/40">
            <XCircle size={12} />
            Failed
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-zinc-50 dark:bg-zinc-800 text-zinc-500 rounded-full border border-zinc-100 dark:border-zinc-750">
            <Clock size={12} />
            Queued
          </span>
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Title Header */}
      <div className="flex items-center space-x-3">
        <div className="p-3 bg-gradient-to-tr from-[var(--brand-orange)] to-[var(--brand-coral)] text-white rounded-xl">
          <RefreshCw size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-spartan font-extrabold tracking-tight">Sync Manager</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Configure synchronizations, manage auto-update filters, and perform bulk updates from MangaDex.
          </p>
        </div>
      </div>

      {/* Stats and Resolution Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sync Stats Cards */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          {/* Card 1 */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-sm flex items-center space-x-4">
            <div className="p-3.5 bg-orange-50 dark:bg-zinc-850 text-[var(--brand-orange)] rounded-xl shrink-0">
              <Database size={24} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Synced Titles</span>
              <strong className="text-2xl text-[var(--text-primary)]">{stats?.total_synced_mangas ?? 0}</strong>
            </div>
          </div>
          {/* Card 2 */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-sm flex items-center space-x-4">
            <div className="p-3.5 bg-rose-50 dark:bg-zinc-850 text-rose-500 rounded-xl shrink-0">
              <ImageIcon size={24} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Covers Cached</span>
              <strong className="text-2xl text-[var(--text-primary)]">{stats?.total_covers ?? 0}</strong>
            </div>
          </div>
          {/* Card 3 */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-sm flex items-center space-x-4">
            <div className="p-3.5 bg-blue-50 dark:bg-zinc-850 text-blue-500 rounded-xl shrink-0">
              <Layers size={24} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Recommendations</span>
              <strong className="text-2xl text-[var(--text-primary)]">{stats?.total_recommendations_cached ?? 0}</strong>
            </div>
          </div>
          {/* Card 4 */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-sm flex items-center space-x-4">
            <div className="p-3.5 bg-zinc-50 dark:bg-zinc-850 text-zinc-500 rounded-xl shrink-0">
              <Clock size={24} />
            </div>
            <div>
              <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Last Synced</span>
              <span className="text-sm font-bold text-[var(--text-primary)] block truncate">
                {stats?.last_synced_at 
                  ? new Date(stats.last_synced_at).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                    })
                  : "Never"}
              </span>
            </div>
          </div>
        </div>

        {/* Global Cover Resolution Card */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Settings size={18} className="text-[var(--brand-orange)]" />
              <span>Cover Art Sync Resolution</span>
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              MangaDex hosts covers in multiple sizes. Choose high-res original covers or smaller alternatives to save disk space and loading times.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 bg-[var(--bg-primary)] p-1 rounded-xl border border-[var(--border-primary)]">
            {["original", "512", "256"].map((size) => (
              <button
                key={size}
                onClick={() => setResolution(size)}
                className={`py-2 px-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  resolution === size 
                    ? "bg-[var(--brand-orange)] text-white shadow" 
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {size === "original" ? "Original" : size + "px"}
              </button>
            ))}
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="w-full py-2.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            {savingSettings ? <Loader2 size={14} className="animate-spin" /> : null}
            Save Settings
          </button>
        </div>
      </div>

      {/* Sync Pools Card */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-primary)] pb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Sync Pools</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Groups of manga created from filter sets, configured to easily update catalog metadata.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAbortAllBackground}
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 font-bold text-xs rounded-xl shadow transition cursor-pointer"
            >
              <XCircle size={16} />
              Abort All Background Tasks
            </button>
            <button
              onClick={() => handleOpenPoolModal(null)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold text-xs rounded-xl shadow transition cursor-pointer"
            >
              <Plus size={16} />
              Create Pool
            </button>
          </div>
        </div>

        {loadingPools ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-[var(--brand-orange)]" size={32} />
          </div>
        ) : pools.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-secondary)] italic">
            No sync pools created yet. Click "Create Pool" to add one!
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left side: Pools Cards */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              {pools.map((pool) => {
                const isExecuting = executingPoolId === pool._id;
                const isSelected = selectedPool?._id === pool._id;
                
                // Count filter tags
                const filterCounts = [
                  pool.filters.read_statuses?.length ? `${pool.filters.read_statuses.length} Read` : null,
                  pool.filters.publish_statuses?.length ? `${pool.filters.publish_statuses.length} Status` : null,
                  pool.filters.tags?.length ? `${pool.filters.tags.length} Tags` : null,
                  pool.filters.original_languages?.length ? `${pool.filters.original_languages.length} Lang` : null
                ].filter(Boolean);

                return (
                  <div 
                    key={pool._id}
                    onClick={() => handleSelectPool(pool)}
                    className={`border rounded-2xl p-5 bg-[var(--bg-primary)] transition flex flex-col justify-between space-y-4 cursor-pointer ${
                      isSelected 
                        ? "border-[var(--brand-orange)] dark:ring-1 dark:ring-[var(--brand-orange)] shadow-md"
                        : pool.enabled ? "border-[var(--border-primary)] hover:border-[var(--brand-orange)]" : "border-[var(--border-primary)]/45 opacity-60"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-base text-[var(--text-primary)] line-clamp-1">{pool.name}</h4>
                          <span className="text-[10px] text-[var(--text-secondary)] font-semibold uppercase">
                            Type: {pool.schedule.type === "interval" ? `Every ${pool.schedule.interval_hours}h` : "Manual"}
                          </span>
                        </div>
                        
                        {/* Toggle Enable/Disable switch */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePool(pool);
                          }}
                          className={`w-10 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${
                            pool.enabled ? "bg-[var(--brand-orange)]" : "bg-zinc-300 dark:bg-zinc-800"
                          }`}
                        >
                          <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ${
                            pool.enabled ? "translate-x-4" : "translate-x-0"
                          }`} />
                        </button>
                      </div>

                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2 h-8">
                        {pool.description || "No description provided."}
                      </p>

                      {/* Filters tags summary */}
                      <div className="flex flex-wrap gap-1 pt-1 h-12 overflow-hidden">
                        {filterCounts.length > 0 ? (
                          filterCounts.map((f, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[9px] font-extrabold text-[var(--text-secondary)]">
                              {f}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">No filters (Matches all synced)</span>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[var(--border-primary)] flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handlePreviewPool(pool._id, pool.name)}
                          title="Preview Matching Titles"
                          className="p-2 border border-[var(--border-primary)] hover:border-[var(--brand-orange)] rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenPoolModal(pool)}
                          title="Edit Pool"
                          className="p-2 border border-[var(--border-primary)] hover:border-[var(--brand-orange)] rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeletePool(pool._id, pool.name)}
                          title="Delete Pool"
                          className="p-2 border border-red-200 hover:border-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <button
                        onClick={() => handleExecutePool(pool._id, pool.name)}
                        disabled={isExecuting || !pool.enabled}
                        className="px-3.5 py-1.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                      >
                        {isExecuting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                        Execute
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Right side: Selected Pool Details */}
            <div className="lg:col-span-1 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[380px] overflow-hidden">
              {selectedPool ? (
                <div className="flex flex-col h-full justify-between">
                  <div className="space-y-3 min-h-0 flex-1 flex flex-col">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-extrabold text-base text-[var(--text-primary)] line-clamp-1">{selectedPool.name}</h4>
                        <span className="text-[10px] text-[var(--text-secondary)] font-semibold uppercase">
                          {selectedPool.schedule.type === "interval" ? `Interval: ${selectedPool.schedule.interval_hours}h` : "Manual Run"}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                        selectedPool.enabled ? "bg-green-100 text-green-700 dark:bg-green-950/35 dark:text-green-400" : "bg-zinc-150 text-zinc-500"
                      }`}>
                        {selectedPool.enabled ? "Active" : "Disabled"}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                      {selectedPool.description || "No description provided."}
                    </p>

                    <div className="border-t border-[var(--border-primary)]/50 pt-2 flex-1 min-h-0 flex flex-col space-y-2">
                      <span className="text-xs font-bold text-[var(--text-secondary)] flex items-center justify-between">
                        <span>Matching Titles:</span>
                        <strong className="text-sm text-[var(--text-primary)] font-extrabold">
                          {loadingPoolPreview ? "..." : poolPreviewMangas.length}
                        </strong>
                      </span>

                      {/* Matching Titles Small Preview List */}
                      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[140px] scrollbar-thin">
                        {loadingPoolPreview ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="animate-spin text-[var(--brand-orange)]" size={18} />
                          </div>
                        ) : poolPreviewMangas.length === 0 ? (
                          <div className="text-center py-4 text-[10px] text-zinc-400 italic">
                            No matching library titles.
                          </div>
                        ) : (
                          poolPreviewMangas.map((manga) => (
                            <div key={manga._id} className="flex items-center space-x-2 p-1.5 border border-[var(--border-primary)]/30 bg-[var(--bg-card)] rounded-lg">
                              {manga.cover_url ? (
                                <img src={manga.cover_url} alt={manga.title} className="w-6 h-8 rounded object-cover shrink-0" />
                              ) : (
                                <div className="w-6 h-8 rounded bg-zinc-150 flex items-center justify-center shrink-0 text-zinc-400">
                                  <Layers size={12} />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <span className="text-[11px] font-bold text-[var(--text-primary)] block truncate">{manga.title}</span>
                                <span className="text-[9px] text-[var(--text-secondary)] capitalize block truncate">
                                  {manga.status || "Unknown"} • {manga.read_status || "Unread"}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Concurrency Speed Input */}
                  <div className="flex items-center justify-between py-2 border-t border-[var(--border-primary)]/50">
                    <span className="text-[11px] font-bold text-[var(--text-secondary)]">Sync Speed (Workers):</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={concurrency}
                        onChange={(e) => setConcurrency(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                        className="w-14 px-2 py-1 text-center font-bold text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
                      />
                      <span className="text-[10px] text-zinc-400 font-semibold">(x{concurrency})</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-primary)] flex items-center gap-2">
                    <button
                      onClick={() => handleExecutePool(selectedPool._id, selectedPool.name)}
                      disabled={executingPoolId === selectedPool._id || !selectedPool.enabled}
                      className="flex-1 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--brand-orange)] text-[var(--text-primary)] disabled:opacity-50 font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Layers size={12} />
                      Queue Backend
                    </button>
                    <button
                      onClick={() => triggerSequentialSync(poolPreviewMangas, selectedPool.sync_options, selectedPool.name, "pool")}
                      disabled={poolPreviewMangas.length === 0 || !selectedPool.enabled}
                      className="flex-1 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Play size={12} />
                      Sequential Sync
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                  <Terminal size={32} className="text-zinc-300 dark:text-zinc-700 mb-2" />
                  <h4 className="text-xs font-bold text-[var(--text-primary)]">No Pool Selected</h4>
                  <p className="text-[10px] text-[var(--text-secondary)] mt-1 max-w-[180px]">
                    Click any pool card to view matching titles, status parameters, and run sequential sync.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Batch Sync / Manual Select Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Selection / Search List */}
        <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-sm flex flex-col h-[540px]">
          <div className="space-y-4 mb-4">
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Manual Batch Selection</h3>
              <p className="text-xs text-[var(--text-secondary)]">Search and pick specific titles to execute updates.</p>
            </div>
            
            {/* Search Input */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search manga by title, author, artist..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-2xl p-4 divide-y divide-[var(--border-primary)]/40">
            {localMangas.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-xs italic">
                No matching titles found in local library.
              </div>
            ) : (
              localMangas.map((manga) => {
                const isSelected = selectedMangaIds.includes(manga._id);
                return (
                  <div 
                    key={manga._id}
                    onClick={() => toggleSelectManga(manga._id)}
                    className="py-3 flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-4">
                      <button className="text-[var(--brand-orange)] focus:outline-none">
                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} className="text-zinc-400" />}
                      </button>
                      <div className="min-w-0">
                        <span className="font-bold text-sm text-[var(--text-primary)] group-hover:text-[var(--brand-orange)] transition block truncate">
                          {manga.title}
                        </span>
                        <span className="text-[10px] text-[var(--text-secondary)] font-semibold capitalize">
                          Status: {manga.status || "unknown"} • {manga.read_status || "unread"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Selector Action bar */}
          <div className="mt-4 pt-3 border-t border-[var(--border-primary)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAllLocal}
                className="px-3.5 py-1.5 border border-[var(--border-primary)] hover:border-zinc-400 text-xs font-bold text-[var(--text-secondary)] rounded-xl transition cursor-pointer"
              >
                {selectedMangaIds.length === localMangas.length && localMangas.length > 0 ? "Deselect All" : "Select All"}
              </button>
              
              <button
                onClick={handleLoadAndSelectAll}
                disabled={loadingAllLocal}
                className="px-3.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:border-[var(--brand-orange)] disabled:opacity-50 text-xs font-bold text-[var(--text-primary)] rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                {loadingAllLocal ? <Loader2 size={12} className="animate-spin" /> : null}
                Load & Select All in System
              </button>
            </div>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              {selectedMangaIds.length} titles selected
            </span>
          </div>
        </div>

        {/* Options & Batch Trigger */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-sm flex flex-col justify-between h-[540px]">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Sync Options</h3>
              <p className="text-xs text-[var(--text-secondary)]">Configure what details to download for selected titles.</p>
            </div>

            <div className="space-y-4">
              {/* Option 1 */}
              <label className="flex items-start gap-3 p-3.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-orange-200/50 rounded-2xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={batchOptions.sync_metadata}
                  onChange={() => setBatchOptions(prev => ({ ...prev, sync_metadata: !prev.sync_metadata }))}
                  className="mt-1 accent-[var(--brand-orange)]"
                />
                <div>
                  <strong className="text-sm text-[var(--text-primary)] block">Sync Metadata</strong>
                  <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Update synopsis, tags, author, publication status, year, chapters/volumes count.
                  </span>
                </div>
              </label>

              {/* Option 2 */}
              <label className="flex items-start gap-3 p-3.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-orange-200/50 rounded-2xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={batchOptions.sync_covers}
                  onChange={() => setBatchOptions(prev => ({ ...prev, sync_covers: !prev.sync_covers }))}
                  className="mt-1 accent-[var(--brand-orange)]"
                />
                <div>
                  <strong className="text-sm text-[var(--text-primary)] block">Sync Cover Art Gallery</strong>
                  <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Fetch all cover arts, download and store them locally in MinIO.
                  </span>
                </div>
              </label>

              {/* Option 3 */}
              <label className="flex items-start gap-3 p-3.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-orange-200/50 rounded-2xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={batchOptions.sync_recommendations}
                  onChange={() => setBatchOptions(prev => ({ ...prev, sync_recommendations: !prev.sync_recommendations }))}
                  className="mt-1 accent-[var(--brand-orange)]"
                />
                <div>
                  <strong className="text-sm text-[var(--text-primary)] block">Sync Recommendations</strong>
                  <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Refresh and cache matching recommendations based on MangaDex users reading lists.
                  </span>
                </div>
              </label>

              {/* Option 4 */}
              <label className="flex items-start gap-3 p-3.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-purple-200/50 rounded-2xl cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={batchOptions.sync_trackers}
                  onChange={() => setBatchOptions(prev => ({ ...prev, sync_trackers: !prev.sync_trackers }))}
                  className="mt-1 accent-purple-500"
                />
                <div>
                  <strong className="text-sm text-[var(--text-primary)] block">Sync Tracker Metadata</strong>
                  <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Enrich metadata (dates, scores, status) from AniList & MyAnimeList.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Concurrency Speed Input */}
          <div className="flex items-center justify-between py-2 border-t border-[var(--border-primary)]/50 mb-2">
            <span className="text-[11px] font-bold text-[var(--text-secondary)]">Sync Speed (Workers):</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={50}
                value={concurrency}
                onChange={(e) => setConcurrency(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="w-14 px-2 py-1 text-center font-bold text-xs rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
              />
              <span className="text-[10px] text-zinc-400 font-semibold">(x{concurrency})</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleTriggerBatch}
              disabled={batchSyncing || selectedMangaIds.length === 0 || (!batchOptions.sync_metadata && !batchOptions.sync_covers && !batchOptions.sync_recommendations && !batchOptions.sync_trackers)}
              className="flex-1 py-3 bg-[var(--bg-primary)] border border-[var(--border-primary)] hover:border-zinc-400 disabled:opacity-50 text-[var(--text-primary)] font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              Queue Backend
            </button>
            <button
              onClick={() => {
                const selectedMangas = localMangas.filter(m => selectedMangaIds.includes(m._id));
                triggerSequentialSync(selectedMangas, batchOptions, `Batch of ${selectedMangaIds.length} titles`, "batch");
              }}
              disabled={selectedMangaIds.length === 0 || (!batchOptions.sync_metadata && !batchOptions.sync_covers && !batchOptions.sync_recommendations && !batchOptions.sync_trackers)}
              className="flex-1 py-3 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              Sequential Sync ({selectedMangaIds.length})
            </button>

          </div>
        </div>
      </div>

      {/* Sync History Logs & Runs History Tabs */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--border-primary)] pb-4 gap-4">
          <div className="flex items-center space-x-6">
            <button
              onClick={() => setActiveHistoryTab("items")}
              className={`pb-4 text-base font-bold transition-all relative cursor-pointer ${
                activeHistoryTab === "items"
                  ? "text-[var(--brand-orange)] border-b-2 border-[var(--brand-orange)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Item Sync Logs
            </button>
            <button
              onClick={() => {
                setActiveHistoryTab("runs");
                fetchSyncRuns();
              }}
              className={`pb-4 text-base font-bold transition-all relative cursor-pointer ${
                activeHistoryTab === "runs"
                  ? "text-[var(--brand-orange)] border-b-2 border-[var(--brand-orange)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Sync Runs History
            </button>
          </div>
          
          <button
            onClick={() => activeHistoryTab === "items" ? fetchLogs() : fetchSyncRuns()}
            className="p-2 border border-[var(--border-primary)] hover:border-[var(--brand-orange)] rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Tab 1: Detailed Item Logs */}
        {activeHistoryTab === "items" && (
          <>
            {loadingLogs ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-[var(--brand-orange)]" size={28} />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-secondary)] italic">
                No single item synchronization logs recorded yet.
              </div>
            ) : (
              <div className="border border-[var(--border-primary)] rounded-2xl overflow-hidden bg-[var(--bg-primary)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-zinc-100/50 dark:bg-zinc-800/20 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-[var(--border-primary)]">
                        <th className="p-4">Title</th>
                        <th className="p-4">Operation</th>
                        <th className="p-4">Started At</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-primary)]/40 font-medium text-[var(--text-primary)]">
                      {logs.map((log) => {
                        const isExpanded = expandedLogId === log._id;
                        const logDate = new Date(log.started_at).toLocaleString();
                        const hasDetails = log.details.covers_synced > 0 || log.details.covers_failed > 0 || log.details.recommendations_found > 0 || log.details.errors.length > 0;
                        
                        return (
                          <React.Fragment key={log._id}>
                            <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/10 transition">
                              <td className="p-4">
                                <span className="font-bold block truncate max-w-[220px]">
                                  {log.manga_title}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-400 block truncate">
                                  {log.mangadex_id}
                                </span>
                              </td>
                              <td className="p-4 capitalize text-xs text-[var(--text-secondary)]">
                                {log.operation}
                              </td>
                              <td className="p-4 text-xs text-[var(--text-secondary)]">
                                {logDate}
                              </td>
                              <td className="p-4">
                                {getLogStatusBadge(log.status)}
                              </td>
                              <td className="p-4 text-right">
                                {hasDetails && (
                                  <button
                                    onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition cursor-pointer"
                                  >
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </button>
                                )}
                              </td>
                            </tr>
                            {/* Expanded details panel */}
                            {isExpanded && (
                              <tr className="bg-zinc-50/20 dark:bg-zinc-900/10">
                                <td colSpan={5} className="p-4 border-t border-[var(--border-primary)]/30 animate-fade-in text-xs space-y-2">
                                  <div className="grid grid-cols-3 gap-4 pb-2 border-b border-[var(--border-primary)]/20">
                                    <div>
                                      <strong className="text-zinc-500 uppercase block tracking-wider">Covers Synced</strong>
                                      <span className="font-bold text-[var(--text-primary)]">{log.details.covers_synced}</span>
                                    </div>
                                    <div>
                                      <strong className="text-zinc-500 uppercase block tracking-wider">Covers Failed</strong>
                                      <span className={`font-bold ${log.details.covers_failed > 0 ? "text-red-500" : "text-[var(--text-primary)]"}`}>
                                        {log.details.covers_failed}
                                      </span>
                                    </div>
                                    <div>
                                      <strong className="text-zinc-500 uppercase block tracking-wider">Recommendations Found</strong>
                                      <span className="font-bold text-[var(--text-primary)]">{log.details.recommendations_found}</span>
                                    </div>
                                  </div>

                                  {log.details.errors && log.details.errors.length > 0 && (
                                    <div className="space-y-1">
                                      <strong className="text-red-500 block uppercase tracking-wider">Errors Recorded</strong>
                                      <ul className="list-disc pl-5 space-y-1 text-red-500 font-mono text-[10px]">
                                        {log.details.errors.map((err, index) => (
                                          <li key={index}>{err}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Tab 2: Sync Runs History */}
        {activeHistoryTab === "runs" && (
          <>
            {loadingRuns ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-[var(--brand-orange)]" size={28} />
              </div>
            ) : syncRuns.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-secondary)] italic">
                No pool or batch sync runs recorded yet.
              </div>
            ) : (
              <div className="border border-[var(--border-primary)] rounded-2xl overflow-hidden bg-[var(--bg-primary)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-zinc-100/50 dark:bg-zinc-800/20 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-[var(--border-primary)]">
                        <th className="p-4">Run Name & Type</th>
                        <th className="p-4">Sync Targets</th>
                        <th className="p-4">Manga Progress</th>
                        <th className="p-4">Started At</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-primary)]/40 font-medium text-[var(--text-primary)]">
                      {syncRuns.map((run) => {
                        const isExpanded = expandedRunId === run._id;
                        const runDate = new Date(run.started_at).toLocaleString();
                        const durationSec = run.completed_at 
                          ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                          : Math.round((Date.now() - new Date(run.started_at).getTime()) / 1000);
                        
                        const formatDuration = (sec: number) => {
                          const m = Math.floor(sec / 60);
                          const s = sec % 60;
                          return `${m}:${s < 10 ? "0" : ""}${s}`;
                        };

                        const activeOptions = [
                          run.sync_options.sync_metadata ? "Metadata" : null,
                          run.sync_options.sync_covers ? "Covers" : null,
                          run.sync_options.sync_recommendations ? "Recs" : null
                        ].filter(Boolean).join(", ");

                        return (
                          <React.Fragment key={run._id}>
                            <tr className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/10 transition">
                              <td className="p-4">
                                <span className="font-bold block truncate max-w-[200px]" title={run.name}>
                                  {run.name}
                                </span>
                                <span className="text-[10px] text-zinc-400 font-semibold uppercase block">
                                  {run.type === "pool" ? "Pool Run" : "Manual Batch"}
                                </span>
                              </td>
                              <td className="p-4 text-xs text-[var(--text-secondary)]">
                                {activeOptions || "None"}
                              </td>
                              <td className="p-4 text-xs text-[var(--text-secondary)]">
                                <span className="font-bold text-[var(--text-primary)]">
                                  {run.completed_count + run.failed_count}
                                </span> / {run.total_count} titles
                                <span className="text-[10px] text-zinc-400 block font-semibold">
                                  (Succeeded: {run.completed_count}, Failed: {run.failed_count})
                                </span>
                              </td>
                              <td className="p-4 text-xs text-[var(--text-secondary)]">
                                <div>{runDate}</div>
                                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">Duration: {formatDuration(durationSec)}</div>
                              </td>
                              <td className="p-4">
                                {getLogStatusBadge(run.status)}
                              </td>
                              <td className="p-4 text-right">
                                <button
                                  onClick={() => setExpandedRunId(isExpanded ? null : run._id)}
                                  className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition cursor-pointer"
                                >
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                              </td>
                            </tr>
                            {/* Expanded details panel */}
                            {isExpanded && (
                              <tr className="bg-zinc-50/20 dark:bg-zinc-900/10">
                                <td colSpan={6} className="p-5 border-t border-[var(--border-primary)]/30 animate-fade-in space-y-4">
                                  {/* Terminal Console Logs */}
                                  <div className="space-y-1.5">
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Terminal Outputs Log:</span>
                                    <div className="h-44 bg-zinc-950 text-green-400 font-mono text-[10px] p-4 rounded-xl overflow-y-auto border border-zinc-900 space-y-0.5 scrollbar-thin select-text">
                                      {run.logs && run.logs.length > 0 ? (
                                        run.logs.map((logLine, idx) => (
                                          <div key={idx} className="leading-normal whitespace-pre-wrap">{logLine}</div>
                                        ))
                                      ) : (
                                        <div className="text-zinc-500 italic">No terminal logs recorded for this sync.</div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Item status lists */}
                                  {run.items && run.items.length > 0 && (
                                    <div className="space-y-1.5">
                                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Titles Processed List:</span>
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[200px] overflow-y-auto pr-1">
                                        {run.items.map((item, idx) => (
                                          <div key={idx} className="p-2.5 border border-[var(--border-primary)]/35 bg-[var(--bg-card)] rounded-xl flex items-center justify-between gap-3 text-xs">
                                            <div className="min-w-0">
                                              <span className="font-bold text-[var(--text-primary)] block truncate" title={item.title}>
                                                {item.title}
                                              </span>
                                              <span className="text-[10px] text-[var(--text-secondary)] block truncate mt-0.5">
                                                {item.details}
                                              </span>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase shrink-0 ${
                                              item.status === "completed" 
                                                ? "bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400" 
                                                : "bg-red-50 text-red-500 dark:bg-red-950/20 dark:text-red-400"
                                            }`}>
                                              {item.status}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL 1: PREVIEW MATCHING TITLES */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl w-full max-w-lg max-h-[80vh] flex flex-col p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-[var(--border-primary)] pb-3">
              <div>
                <h3 className="text-lg font-bold">Preview: {previewPoolName}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Matching local titles in pool filters</p>
              </div>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 my-2">
              {loadingPreview ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin text-[var(--brand-orange)]" size={24} />
                </div>
              ) : previewMangas.length === 0 ? (
                <div className="text-center py-8 text-xs text-zinc-400 italic">
                  No local titles match this pool's filter parameters.
                </div>
              ) : (
                previewMangas.map((manga) => (
                  <div key={manga._id} className="p-3 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-xl">
                    <span className="font-bold text-sm text-[var(--text-primary)] block">{manga.title}</span>
                    <span className="text-[10px] text-[var(--text-secondary)] font-semibold capitalize">
                      {manga.status || "Unknown status"} • {manga.read_status || "Unread"}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[var(--border-primary)] flex justify-end">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="px-5 py-2 border border-[var(--border-primary)] rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE / EDIT SYNC POOL */}
      {isPoolModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePool}
            className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex justify-between items-center border-b border-[var(--border-primary)] pb-3">
              <div>
                <h3 className="text-lg font-bold">{editingPool ? "Edit Sync Pool" : "Create Sync Pool"}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Define target pool rules and schedules.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPoolModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Core Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Pool Name *</label>
                <input
                  type="text"
                  required
                  value={poolName}
                  onChange={(e) => setPoolName(e.target.value)}
                  placeholder="e.g. Completed Titles Sync"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Description</label>
                <textarea
                  value={poolDesc}
                  onChange={(e) => setPoolDesc(e.target.value)}
                  placeholder="Explain pool target rules..."
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition resize-none"
                />
              </div>

              {/* Filters Settings */}
              <div className="p-4 bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-primary)] space-y-4">
                <h4 className="text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider">Configure Filter Rules</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Read status filter checkboxes */}
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">Read Statuses</label>
                    <div className="flex flex-wrap gap-1.5">
                      {["unread", "reading", "completed", "dropped", "on_hold", "plan_to_read", "re_reading"].map((status) => {
                        const active = poolReadStatuses.includes(status);
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setPoolReadStatuses(prev => active ? prev.filter(s => s !== status) : [...prev, status])}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition duration-150 capitalize ${
                              active
                                ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                                : "bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                            }`}
                          >
                            {status.replace("_", " ")}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Publish status filter checkboxes */}
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">Publish Statuses</label>
                    <div className="flex flex-wrap gap-1.5">
                      {["ongoing", "completed", "hiatus", "cancelled"].map((status) => {
                        const active = poolPublishStatuses.includes(status);
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setPoolPublishStatuses(prev => active ? prev.filter(s => s !== status) : [...prev, status])}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition duration-150 capitalize ${
                              active
                                ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                                : "bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                            }`}
                          >
                            {status}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Original Language filters */}
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">Original Languages</label>
                    <div className="flex flex-wrap gap-1.5">
                      {["ja", "ko", "zh", "en", "vi"].map((lang) => {
                        const active = poolLanguages.includes(lang);
                        return (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => setPoolLanguages(prev => active ? prev.filter(l => l !== lang) : [...prev, lang])}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition duration-150 uppercase ${
                              active
                                ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                                : "bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                            }`}
                          >
                            {lang}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Content Ratings */}
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">Content Ratings</label>
                    <div className="flex flex-wrap gap-1.5">
                      {["safe", "suggestive", "erotica", "pornographic"].map((rating) => {
                        const active = poolContentRatings.includes(rating);
                        return (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => setPoolContentRatings(prev => active ? prev.filter(r => r !== rating) : [...prev, rating])}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition duration-150 capitalize ${
                              active
                                ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                                : "bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                            }`}
                          >
                            {rating}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Tag Selector Integration */}
                {tags.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <GroupedTagSelector
                      allTags={tags}
                      selectedTags={poolTagsInclude}
                      onChange={setPoolTagsInclude}
                      label="Include Tags"
                      placeholder="Search tags to include..."
                    />
                    <GroupedTagSelector
                      allTags={tags}
                      selectedTags={poolTagsExclude}
                      onChange={setPoolTagsExclude}
                      label="Exclude Tags"
                      placeholder="Search tags to exclude..."
                    />
                  </div>
                )}
              </div>

              {/* Sync Options & Schedule */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pool Sync Targets */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Sync Options</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={poolSyncOptions.sync_metadata}
                        onChange={() => setPoolSyncOptions(prev => ({ ...prev, sync_metadata: !prev.sync_metadata }))}
                        className="accent-[var(--brand-orange)]"
                      />
                      <span>Sync Metadata</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={poolSyncOptions.sync_covers}
                        onChange={() => setPoolSyncOptions(prev => ({ ...prev, sync_covers: !prev.sync_covers }))}
                        className="accent-[var(--brand-orange)]"
                      />
                      <span>Sync Cover Arts Gallery</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={poolSyncOptions.sync_recommendations}
                        onChange={() => setPoolSyncOptions(prev => ({ ...prev, sync_recommendations: !prev.sync_recommendations }))}
                        className="accent-[var(--brand-orange)]"
                      />
                      <span>Sync Recommendations</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={poolSyncOptions.sync_trackers}
                        onChange={() => setPoolSyncOptions(prev => ({ ...prev, sync_trackers: !prev.sync_trackers }))}
                        className="accent-purple-500"
                      />
                      <span>Sync Tracker Metadata (AniList & MAL)</span>
                    </label>
                  </div>
                </div>


                {/* Pool Scheduling */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Sync Schedule</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
                      <input
                        type="radio"
                        name="scheduleType"
                        checked={scheduleType === "manual"}
                        onChange={() => setScheduleType("manual")}
                        className="accent-[var(--brand-orange)]"
                      />
                      <span>Manual Trigger</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)] cursor-pointer">
                      <input
                        type="radio"
                        name="scheduleType"
                        checked={scheduleType === "interval"}
                        onChange={() => setScheduleType("interval")}
                        className="accent-[var(--brand-orange)]"
                      />
                      <span>Interval (hours)</span>
                    </label>
                  </div>

                  {scheduleType === "interval" && (
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 24"
                      value={intervalHours}
                      onChange={(e) => setIntervalHours(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-28 px-3 py-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] focus:outline-none"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--border-primary)] flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsPoolModalOpen(false)}
                className="px-5 py-2.5 border border-[var(--border-primary)] rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold text-xs rounded-xl shadow transition cursor-pointer"
              >
                {editingPool ? "Save Changes" : "Create Pool"}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* MODAL 3: SEQUENTIAL BATCH SYNC RUNNER (FULL SCREEN DETAIL PROGRESS) */}
      {isRunnerOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl w-full max-w-2xl flex flex-col p-6 space-y-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-[var(--border-primary)] pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="text-[var(--brand-orange)]" size={20} />
                <div>
                  <h3 className="text-lg font-extrabold text-[var(--text-primary)]">Sequential Sync Runner</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Running: {runnerTitle}</p>
                </div>
              </div>
              {runnerStatus !== "running" && runnerStatus !== "paused" && (
                <button
                  onClick={() => {
                    setIsRunnerOpen(false);
                    fetchStats();
                    fetchLogs();
                    fetchSyncRuns();
                  }}
                  className="p-1.5 rounded-lg text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Overall Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-bold text-[var(--text-primary)]">
                <span>Progress</span>
                <span>
                  {runnerIndex + (runnerStatus === "completed" || runnerStatus === "cancelled" ? 0 : 0)} / {runnerMangas.length} Titles (
                  {Math.round((runnerIndex / runnerMangas.length) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-zinc-200 dark:bg-zinc-850 h-2.5 rounded-full overflow-hidden border border-zinc-200/20 dark:border-zinc-850">
                <div
                  className="bg-gradient-to-r from-orange-500 to-amber-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${(runnerIndex / runnerMangas.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[var(--bg-primary)] p-4 rounded-2xl border border-[var(--border-primary)]">
              <div>
                <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase block">Elapsed Time</span>
                <strong className="text-sm text-[var(--text-primary)] font-extrabold font-mono">
                  {new Date(runnerElapsed * 1000).toISOString().substr(14, 5)}
                </strong>
              </div>
              <div>
                <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase block">Speed</span>
                <strong className="text-sm text-[var(--text-primary)] font-extrabold font-mono">
                  {runnerElapsed > 0 
                    ? ((runnerStats.completed + runnerStats.failed) / (runnerElapsed / 60)).toFixed(1) 
                    : "0.0"} / min
                </strong>
              </div>
              <div>
                <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase block">API Requests</span>
                <strong className="text-sm text-[var(--text-primary)] font-extrabold font-mono">{runnerStats.apiRequests}</strong>
              </div>
              <div>
                <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase block">Active Workers</span>
                <strong className="text-sm text-[var(--text-primary)] font-extrabold font-mono">
                  {runnerStatus === "running" || runnerStatus === "paused" ? `${activeWorkersCount} / ${selectedConcurrency}` : "0"}
                </strong>
              </div>
              <div>
                <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase block">Failed Items</span>
                <strong className={`text-sm font-extrabold font-mono ${runnerStats.failed > 0 ? "text-red-500" : "text-[var(--text-primary)]"}`}>
                  {runnerStats.failed}
                </strong>
              </div>
            </div>

            {/* Current Item Panel with image preview */}
            {runnerStatus === "running" || runnerStatus === "paused" ? (
              <div className="flex items-center gap-4 p-4 border border-[var(--border-primary)] bg-[var(--bg-card)] rounded-2xl">
                {runnerMangas[runnerIndex]?.cover_url ? (
                  <img
                    src={runnerMangas[runnerIndex].cover_url!}
                    alt="Current cover"
                    className="w-10 h-14 rounded object-cover shrink-0 border border-zinc-200 dark:border-zinc-800"
                  />
                ) : (
                  <div className="w-10 h-14 rounded bg-zinc-100 dark:bg-zinc-850 flex items-center justify-center shrink-0 text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                    <Layers size={16} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-extrabold text-[var(--brand-orange)] uppercase tracking-wider block">Currently Syncing</span>
                  <span className="text-sm font-bold text-[var(--text-primary)] block truncate">
                    {runnerMangas[runnerIndex]?.title || "Preparing..."}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] block truncate mt-0.5 animate-pulse">
                    Processing assets from MangaDex...
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 border border-[var(--border-primary)] bg-[var(--bg-card)] rounded-2xl text-center space-y-1">
                <CheckCircle2 className={`mx-auto ${runnerStatus === "completed" ? "text-green-500" : "text-zinc-400"}`} size={28} />
                <h4 className="text-sm font-bold text-[var(--text-primary)] capitalize">Sync Run {runnerStatus}</h4>
                <p className="text-xs text-[var(--text-secondary)]">
                  {runnerStats.completed} titles successfully synced. {runnerStats.failed} errors recorded.
                </p>
              </div>
            )}

            {/* Scrolling Logs Terminal */}
            <div className="space-y-1.5 flex-1 min-h-0 flex flex-col">
              <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Terminal Outputs Log:</span>
              <div className="h-44 bg-zinc-950 text-green-400 font-mono text-[10px] p-3 rounded-xl overflow-y-auto border border-zinc-900 space-y-0.5 scrollbar-thin select-text">
                {runnerLogs.map((logLine, idx) => (
                  <div key={idx} className="leading-normal whitespace-pre-wrap">{logLine}</div>
                ))}
              </div>
            </div>

            {/* Runner Control Actions */}
            <div className="pt-3 border-t border-[var(--border-primary)] flex justify-between items-center">
              <div className="flex gap-2">
                {runnerStatus === "running" && (
                  <button
                    onClick={pauseRunner}
                    className="px-4 py-2 border border-[var(--border-primary)] hover:border-zinc-400 text-xs font-bold text-[var(--text-primary)] rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Pause size={14} />
                    Pause
                  </button>
                )}
                {runnerStatus === "paused" && (
                  <button
                    onClick={resumeRunner}
                    className="px-4 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Play size={14} />
                    Resume
                  </button>
                )}
                {(runnerStatus === "running" || runnerStatus === "paused") && (
                  <button
                    onClick={cancelRunner}
                    className="px-4 py-2 bg-red-50 dark:bg-red-950/20 text-red-500 border border-red-200 dark:border-red-900/40 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <XCircle size={14} />
                    Cancel Sync
                  </button>
                )}
              </div>

              {(runnerStatus === "completed" || runnerStatus === "cancelled") && (
                <button
                  onClick={() => {
                    setIsRunnerOpen(false);
                    fetchStats();
                    fetchLogs();
                    fetchSyncRuns();
                  }}
                  className="px-6 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl shadow transition cursor-pointer"
                >
                  Close Runner
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SyncManagerPage;
