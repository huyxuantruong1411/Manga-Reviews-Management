import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import client from "../api/client";
import { useAlert } from "./useAlert";

export interface DownloadTask {
  _id: string;
  manga_id: string;
  manga_title: string;
  status: string;
  total_chapters: number;
  completed_chapters: number;
  progress: number;
  download_path?: string;
  error_message?: string;
  current_chapter_name?: string;
  current_page_number?: number;
  current_page_total?: number;
  current_page_preview?: string;
  created_at: string;
  updated_at: string;
}

interface DownloadContextType {
  tasks: DownloadTask[];
  activeTasksCount: number;
  cancelTask: (taskId: string) => Promise<boolean>;
  resumeTask: (taskId: string) => Promise<boolean>;
  refreshTasks: () => Promise<void>;
  registerNewTask: (taskId: string) => void;
  isWidgetOpen: boolean;
  setIsWidgetOpen: (open: boolean) => void;
}

const DownloadContext = createContext<DownloadContextType | undefined>(undefined);

export const DownloadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [isWidgetOpen, setIsWidgetOpen] = useState(false);
  const { showToast } = useAlert();
  
  const timeoutRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const tasksRef = useRef<DownloadTask[]>([]);
  const isWidgetOpenRef = useRef<boolean>(false);

  // Sync refs
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    isWidgetOpenRef.current = isWidgetOpen;
  }, [isWidgetOpen]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const fetchTasks = async (): Promise<DownloadTask[] | null> => {
    try {
      const res = await client.get("/api/downloads/tasks", { params: { limit: 20 } });
      if (isMountedRef.current) {
        setTasks(res.data);
      }
      return res.data;
    } catch (err) {
      console.error("Error fetching download tasks:", err);
      return null;
    }
  };

  const runPoll = async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!isMountedRef.current) return;

    const fetchedTasks = await fetchTasks();
    if (!isMountedRef.current) return;

    const currentTasks = fetchedTasks || tasksRef.current;
    const hasActive = currentTasks.some(
      (t) => t.status === "pending" || t.status === "downloading"
    );

    // Stop polling if the widget is closed AND there are no active tasks running
    if (!isWidgetOpenRef.current && !hasActive) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Fast poll when downloading, slow poll when idle (widget is open but idle)
    const nextInterval = hasActive ? 1500 : 8000;
    timeoutRef.current = setTimeout(runPoll, nextInterval);
  };

  // Start polling on mount if there are active tasks, otherwise remain idle
  useEffect(() => {
    const initCheck = async () => {
      const fetchedTasks = await fetchTasks();
      const hasActive = (fetchedTasks || []).some(
        (t) => t.status === "pending" || t.status === "downloading"
      );
      if (hasActive || isWidgetOpenRef.current) {
        runPoll();
      }
    };
    initCheck();
  }, []);

  // Restart polling whenever the widget is opened
  useEffect(() => {
    if (isWidgetOpen) {
      runPoll();
    }
  }, [isWidgetOpen]);

  const refreshTasks = async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const fetchedTasks = await fetchTasks();
    if (!isMountedRef.current) return;

    const currentTasks = fetchedTasks || tasksRef.current;
    const hasActive = currentTasks.some(
      (t) => t.status === "pending" || t.status === "downloading"
    );
    
    if (hasActive || isWidgetOpenRef.current) {
      const nextInterval = hasActive ? 1500 : 8000;
      timeoutRef.current = setTimeout(runPoll, nextInterval);
    }
  };

  const registerNewTask = (_taskId: string) => {
    // Open widget to show progress
    setIsWidgetOpen(true);
    // Trigger immediate refresh of tasks to pick up the new task quickly
    refreshTasks();
  };

  const cancelTask = async (taskId: string): Promise<boolean> => {
    try {
      await client.post(`/api/downloads/tasks/${taskId}/cancel`);
      showToast("Download cancellation requested", "info");
      
      // Update local state immediately for fast feedback
      setTasks((prev) =>
        prev.map((t) => (t._id === taskId ? { ...t, status: "cancelled" } : t))
      );
      
      // Trigger a refresh
      refreshTasks();
      return true;
    } catch (err) {
      console.error("Failed to cancel task:", err);
      showToast("Failed to cancel download task", "error");
      return false;
    }
  };

  const resumeTask = async (taskId: string): Promise<boolean> => {
    try {
      await client.post(`/api/downloads/tasks/${taskId}/resume`);
      showToast("Download resume requested", "success");
      
      // Update local state immediately for fast feedback
      setTasks((prev) =>
        prev.map((t) => (t._id === taskId ? { ...t, status: "pending" } : t))
      );
      
      // Trigger a refresh
      refreshTasks();
      return true;
    } catch (err) {
      console.error("Failed to resume task:", err);
      showToast("Failed to resume download task", "error");
      return false;
    }
  };

  const activeTasksCount = tasks.filter(
    (t) => t.status === "pending" || t.status === "downloading"
  ).length;

  return (
    <DownloadContext.Provider
      value={{
        tasks,
        activeTasksCount,
        cancelTask,
        resumeTask,
        refreshTasks,
        registerNewTask,
        isWidgetOpen,
        setIsWidgetOpen,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
};

export const useDownload = (): DownloadContextType => {
  const context = useContext(DownloadContext);
  if (context === undefined) {
    throw new Error("useDownload must be used within a DownloadProvider");
  }
  return context;
};
