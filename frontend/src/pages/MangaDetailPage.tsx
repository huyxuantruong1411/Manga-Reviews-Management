import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  User,
  Star,
  RefreshCw,
  Edit2,
  Trash2,
  Download,
  History,
  BookOpen,
  Plus,
  FileText,
  Upload,
  X,
  FolderPlus,
  Info,
  AlertTriangle,
} from "lucide-react";
import client from "../api/client";
import { useAlert } from "../hooks/useAlert";
import { ReviewEditor } from "../components/editor/ReviewEditor";

interface Tag {
  _id: string;
  name: { en: string; vi?: string | null };
  color?: string;
  source: string;
  group?: string;
  description?: { en: string; vi?: string | null } | null;
}

interface MangaLink {
  title: string;
  url: string;
}

interface Manga {
  _id: string;
  mangadex_id: string | null;
  title: string;
  alt_titles: string[];
  description: string;
  author: string;
  artist: string;
  year: string;
  status: string;
  read_status: string;
  personal_rating: number | null;
  tag_ids: string[];
  links: MangaLink[];
  added_at: string;
  updated_at: string;
  cover_url: string | null;
  content_rating?: string | null;
  publication_demographic?: string | null;
  original_language?: string | null;
}

const getReadStatusInfo = (status: string) => {
  const s = status ? status.toLowerCase() : "";
  switch (s) {
    case "unread":
      return {
        label: "Unread",
        badgeClass: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700",
        colorCode: "#71717a",
      };
    case "reading":
      return {
        label: "Reading",
        badgeClass: "bg-blue-100 dark:bg-blue-950/40 text-blue-500 border-blue-200 dark:border-blue-900/50",
        colorCode: "#3b82f6",
      };
    case "completed":
      return {
        label: "Completed",
        badgeClass: "bg-green-100 dark:bg-green-950/40 text-green-500 border-green-200 dark:border-green-900/50",
        colorCode: "#22c55e",
      };
    case "dropped":
      return {
        label: "Dropped",
        badgeClass: "bg-red-100 dark:bg-red-950/40 text-red-500 border-red-200 dark:border-red-900/50",
        colorCode: "#ef4444",
      };
    case "on_hold":
      return {
        label: "On Hold",
        badgeClass: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-600 dark:text-yellow-500 border-yellow-200 dark:border-yellow-900/50",
        colorCode: "#eab308",
      };
    case "plan_to_read":
      return {
        label: "Plan to Read",
        badgeClass: "bg-purple-100 dark:bg-purple-950/40 text-purple-500 border-purple-200 dark:border-purple-900/50",
        colorCode: "#a855f7",
      };
    case "re_reading":
      return {
        label: "Re-Reading",
        badgeClass: "bg-pink-100 dark:bg-pink-950/40 text-pink-500 border-pink-200 dark:border-pink-900/50",
        colorCode: "#ec4899",
      };
    default:
      return {
        label: status || "Unread",
        badgeClass: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700",
        colorCode: "#71717a",
      };
  }
};

const getFlagInfo = (langCode: string): { flagUrl: string; label: string; isRomanized: boolean } => {
  const code = langCode ? langCode.toLowerCase() : "";
  let countryCode = "us";
  let label = langCode ? langCode.toUpperCase() : "EN";
  let isRomanized = false;

  const mapping: { [key: string]: string } = {
    "en": "us",
    "ja": "jp",
    "vi": "vn",
    "ko": "kr",
    "zh": "cn",
    "zh-hk": "hk",
    "fr": "fr",
    "de": "de",
    "es": "es",
    "es-la": "mx",
    "pt-br": "br",
    "ru": "ru",
    "it": "it",
    "pl": "pl",
    "tr": "tr",
    "uk": "ua",
    "ar": "ae",
    "id": "id",
    "th": "th",
    "ms": "my",
    "tl": "ph",
  };

  let cleanCode = code;
  if (code.endsWith("-ro")) {
    cleanCode = code.substring(0, code.length - 3);
    isRomanized = true;
  }

  if (mapping[cleanCode]) {
    countryCode = mapping[cleanCode];
  } else {
    if (cleanCode.length === 2) {
      countryCode = cleanCode;
    }
  }

  return {
    flagUrl: `https://flagcdn.com/w20/${countryCode}.png`,
    label: label,
    isRomanized
  };
};

const getTrackerStyle = (title: string) => {
  switch (title.toLowerCase()) {
    case "myanimelist":
      return "bg-[#2e51a2]/10 hover:bg-[#2e51a2]/20 text-[#2e51a2] border-[#2e51a2]/20";
    case "anilist":
      return "bg-[#02a9ff]/10 hover:bg-[#02a9ff]/20 text-[#02a9ff] border-[#02a9ff]/20";
    case "anime-planet":
      return "bg-[#c51d25]/10 hover:bg-[#c51d25]/20 text-[#c51d25] border-[#c51d25]/20";
    case "kitsu":
      return "bg-[#f35f4c]/10 hover:bg-[#f35f4c]/20 text-[#f35f4c] border-[#f35f4c]/20";
    case "mangaupdates":
      return "bg-[#006097]/10 hover:bg-[#006097]/20 text-[#006097] border-[#006097]/20";
    default:
      return "bg-zinc-100 dark:bg-zinc-800 text-[var(--text-primary)] border-[var(--border-primary)]";
  }
};

const getTrackerIcon = (title: string) => {
  let color = "#71717a";
  switch (title.toLowerCase()) {
    case "myanimelist": color = "#2e51a2"; break;
    case "anilist": color = "#02a9ff"; break;
    case "anime-planet": color = "#c51d25"; break;
    case "kitsu": color = "#f35f4c"; break;
    case "mangaupdates": color = "#006097"; break;
  }
  return <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />;
};

const getProviderStyle = (title: string) => {
  switch (title.toLowerCase()) {
    case "mangadex":
      return "bg-[#ff6740]/10 hover:bg-[#ff6740]/20 text-[#ff6740] border-[#ff6740]/25";
    case "amazon":
      return "bg-[#ff9900]/10 hover:bg-[#ff9900]/20 text-[#ff9900] border-[#ff9900]/25";
    case "ebookjapan":
      return "bg-[#e60012]/10 hover:bg-[#e60012]/20 text-[#e60012] border-[#e60012]/25";
    case "cdjapan":
      return "bg-[#0099ff]/10 hover:bg-[#0099ff]/20 text-[#0099ff] border-[#0099ff]/25";
    case "bookwalker":
      return "bg-[#00a0e9]/10 hover:bg-[#00a0e9]/20 text-[#00a0e9] border-[#00a0e9]/25";
    case "novelupdates":
      return "bg-[#7b1fa2]/10 hover:bg-[#7b1fa2]/20 text-[#7b1fa2] border-[#7b1fa2]/25";
    case "official raw":
      return "bg-[#2e7d32]/10 hover:bg-[#2e7d32]/20 text-[#2e7d32] border-[#2e7d32]/25";
    case "official english":
      return "bg-[#3f51b5]/10 hover:bg-[#3f51b5]/20 text-[#3f51b5] border-[#3f51b5]/25";
    default:
      return "bg-zinc-100 dark:bg-zinc-800 text-[var(--text-primary)] border-[var(--border-primary)] hover:bg-zinc-200 dark:hover:bg-zinc-700";
  }
};

const getProviderIcon = (title: string) => {
  let color = "#71717a";
  switch (title.toLowerCase()) {
    case "mangadex": color = "#ff6740"; break;
    case "amazon": color = "#ff9900"; break;
    case "ebookjapan": color = "#e60012"; break;
    case "cdjapan": color = "#0099ff"; break;
    case "bookwalker": color = "#00a0e9"; break;
    case "novelupdates": color = "#7b1fa2"; break;
    case "official raw": color = "#2e7d32"; break;
    case "official english": color = "#3f51b5"; break;
  }
  return <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />;
};

const getDemographicBadge = (demographic: string | null | undefined) => {
  if (!demographic) return <span className="text-xs text-zinc-400 italic">None</span>;
  const demo = demographic.toLowerCase();
  let bg = "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700";
  if (demo === "shounen") {
    bg = "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50";
  } else if (demo === "shoujo") {
    bg = "bg-pink-100 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-900/50";
  } else if (demo === "seinen") {
    bg = "bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/50";
  } else if (demo === "josei") {
    bg = "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50";
  }
  return (
    <span className={`px-2.5 py-1 text-xs font-bold rounded-xl border capitalize ${bg}`}>
      {demo}
    </span>
  );
};

const renderMarkdown = (text: string): React.ReactNode => {
  if (!text) return <span className="text-zinc-400 italic">No synopsis available.</span>;
  
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentList: string[] = [];
  
  const flushList = (key: string | number) => {
    if (currentList.length > 0) {
      blocks.push(
        <ul key={`list-${key}`} className="list-disc pl-5 my-2 space-y-1">
          {currentList.map((item, idx) => (
            <li key={idx} className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {parseInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const parseInlineMarkdown = (line: string): React.ReactNode[] => {
    const tokenRegex = /(\*\*.*?\*\*|\*.*?\*|\[.*?\]\(.*?\))/g;
    const parts = line.split(tokenRegex);
    let keyIdx = 0;

    return parts.map((part) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const content = part.slice(2, -2);
        return (
          <strong key={`bold-${keyIdx++}`} className="font-bold text-[var(--text-primary)]">
            {content}
          </strong>
        );
      } else if (part.startsWith("*") && part.endsWith("*")) {
        const content = part.slice(1, -1);
        return (
          <em key={`em-${keyIdx++}`} className="italic text-[var(--text-secondary)]">
            {content}
          </em>
        );
      } else if (part.startsWith("[") && part.endsWith(")") && part.includes("](")) {
        const closeBracketIndex = part.indexOf("](");
        const label = part.slice(1, closeBracketIndex);
        const url = part.slice(closeBracketIndex + 2, -1);
        return (
          <a
            key={`link-${keyIdx++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--brand-orange)] hover:text-[var(--brand-coral)] underline transition font-medium break-all"
          >
            {label}
          </a>
        );
      }
      return part;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === "---") {
      flushList(i);
      blocks.push(<hr key={`hr-${i}`} className="my-4 border-[var(--border-primary)]" />);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      currentList.push(line.substring(2));
    } else if (line === "") {
      flushList(i);
    } else {
      flushList(i);
      blocks.push(
        <p key={`p-${i}`} className="text-sm leading-relaxed text-[var(--text-secondary)] mb-3">
          {parseInlineMarkdown(lines[i])}
        </p>
      );
    }
  }
  flushList("end");
  
  return <div className="space-y-1">{blocks}</div>;
};

interface Review {
  _id: string;
  title: string;
  content_json: any;
  created_at: string;
  updated_at: string;
}

interface AuditLog {
  _id: string;
  action: string;
  field?: string;
  old_value?: string;
  new_value?: string;
  timestamp: string;
  note?: string;
}

interface DownloadTask {
  _id: string;
  status: string;
  total_chapters: number;
  completed_chapters: number;
  progress: number;
  error_message?: string;
}


export const MangaDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showAlert, showToast } = useAlert();

  // Core States
  const [manga, setManga] = useState<Manga | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomedCoverUrl, setZoomedCoverUrl] = useState<string | null>(null);

  // Creator links helper
  const renderCreatorLinks = (creatorString: string) => {
    if (!creatorString || creatorString === "Unknown" || creatorString === "N/A") {
      return <span>{creatorString || "Unknown"}</span>;
    }
    const creators = creatorString.split(/[,;]/).map(c => c.trim()).filter(Boolean);
    return (
      <>
        {creators.map((name, index) => (
          <React.Fragment key={name}>
            {index > 0 && <span className="text-[var(--text-secondary)]">, </span>}
            <span
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/author/${encodeURIComponent(name)}`);
              }}
              className="hover:text-[var(--brand-orange)] hover:underline cursor-pointer transition duration-150"
            >
              {name}
            </span>
          </React.Fragment>
        ))}
      </>
    );
  };

  // Edit Modal States
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editRating, setEditRating] = useState<number | "">("");
  const [editReadStatus, setEditReadStatus] = useState("unread");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Download Modal States
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [languages, setLanguages] = useState<string[]>([]);
  const [selectedLang, setSelectedLang] = useState("en");
  const [chapters, setChapters] = useState<any[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [customPath, setCustomPath] = useState("");
  const handlePathChange = (val: string) => {
    // Remove characters that are absolutely forbidden in paths: * ? " < > |
    let cleaned = val.replace(/[*?"<>|]/g, '');
    
    // For colon (:), only allow it as part of a Windows drive letter (e.g. C: at start)
    if (/^[A-Za-z]:/.test(cleaned)) {
      const drive = cleaned.slice(0, 2);
      const rest = cleaned.slice(2).replace(/:/g, '');
      cleaned = drive + rest;
    } else {
      cleaned = cleaned.replace(/:/g, '');
    }
    setCustomPath(cleaned);
  };

  const [showTitleDropdown, setShowTitleDropdown] = useState(false);

  const getTitleOptions = () => {
    if (!manga) return [];
    const options = [{ label: manga.title, value: manga.title }];
    if (manga.alt_titles && manga.alt_titles.length > 0) {
      manga.alt_titles.forEach((alt: string) => {
        const parts = alt.split("|");
        if (parts.length >= 2) {
          const lang = parts[0];
          const val = parts.slice(1).join("|");
          if (!options.some(opt => opt.value === val)) {
            options.push({ label: `${val} (${lang.toUpperCase()})`, value: val });
          }
        } else {
          if (!options.some(opt => opt.value === alt)) {
            options.push({ label: alt, value: alt });
          }
        }
      });
    }
    return options;
  };

  const appendCleanedTitle = (titleStr: string) => {
    const cleanedTitle = titleStr.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
    if (!cleanedTitle) return;
    
    let newPath = customPath.trim();
    if (newPath) {
      const separator = newPath.includes('\\') ? '\\' : '/';
      if (newPath.endsWith('/') || newPath.endsWith('\\')) {
        newPath = `${newPath}${cleanedTitle}`;
      } else {
        newPath = `${newPath}${separator}${cleanedTitle}`;
      }
    } else {
      newPath = cleanedTitle;
    }
    handlePathChange(newPath);
  };
  const [downloading, setDownloading] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [isOverwriteConfirmOpen, setIsOverwriteConfirmOpen] = useState(false);
  const [overwriteWarningMsg, setOverwriteWarningMsg] = useState("");

  // Active Download Tasks (poll status)
  const [activeTask, setActiveTask] = useState<DownloadTask | null>(null);
  const pollInterval = useRef<any>(null);

  // Review states
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");
  const [isCreatingReview, setIsCreatingReview] = useState(false);

  const fetchMangaDetails = async () => {
    try {
      setLoading(true);
      const [mangaRes, reviewsRes, historyRes, tagsRes] = await Promise.all([
        client.get(`/api/manga/${id}`),
        client.get(`/api/manga/${id}/reviews`),
        client.get(`/api/manga/${id}/history`),
        client.get("/api/tags/"),
      ]);

      setManga(mangaRes.data);
      setReviews(reviewsRes.data);
      setHistory(historyRes.data);
      setAllTags(tagsRes.data);

      // Prepopulate edit inputs
      setEditRating(mangaRes.data.personal_rating ?? "");
      setEditReadStatus(mangaRes.data.read_status);
      setEditTags(mangaRes.data.tag_ids);
    } catch (err) {
      console.error("Error loading details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMangaDetails();
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [id]);

  // Sync details from MangaDex
  const handleSyncMetadata = async () => {
    if (!manga?.mangadex_id) return;
    try {
      setLoading(true);
      const res = await client.post(`/api/manga/${manga._id}/sync`);
      setManga(res.data);
      // Reload history
      const historyRes = await client.get(`/api/manga/${id}/history`);
      setHistory(historyRes.data);
      showAlert({
        title: "Sync Success",
        message: "Metadata successfully synced from MangaDex!",
        type: "success",
      });
    } catch (err) {
      console.error("Sync failed:", err);
      showAlert({
        title: "Sync Failed",
        message: "Failed to sync metadata from MangaDex.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // Delete Manga
  const handleDeleteManga = async () => {
    if (!window.confirm("CRITICAL WARNING: This will permanently delete this manga, all its reviews, and cover assets. Continue?")) return;
    try {
      await client.delete(`/api/manga/${manga?._id}`);
      showAlert({
        title: "Deleted",
        message: "Manga deleted successfully.",
        type: "success",
      });
      navigate("/");
    } catch (err) {
      console.error("Delete failed:", err);
      showAlert({
        title: "Delete Failed",
        message: "Failed to delete manga.",
        type: "error",
      });
    }
  };

  // Save Edit Metadata
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUpdating(true);
      const payload: any = {
        read_status: editReadStatus,
        tag_ids: editTags,
      };
      payload.personal_rating = editRating !== "" ? Number(editRating) : null;

      const formData = new FormData();
      formData.append("metadata", JSON.stringify(payload));
      if (editCoverFile) {
        formData.append("cover", editCoverFile);
      }

      const res = await client.put(`/api/manga/${manga?._id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setManga(res.data);
      setIsEditOpen(false);
      setEditCoverFile(null);
      setEditCoverPreview(null);
      
      // Reload history
      const historyRes = await client.get(`/api/manga/${id}/history`);
      setHistory(historyRes.data);
    } catch (err) {
      console.error("Update failed:", err);
      showAlert({
        title: "Update Failed",
        message: "Failed to update metadata.",
        type: "error",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleEditCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setEditCoverFile(file);
      setEditCoverPreview(URL.createObjectURL(file));
    }
  };

  // Start Downloading
  const openDownloadModal = async () => {
    if (!manga?.mangadex_id) return;
    setIsDownloadOpen(true);
    setCustomPath("");
    try {
      setLoadingChapters(true);
      // Fetch default download path
      try {
        const pathRes = await client.get("/api/downloads/base-path");
        setCustomPath(pathRes.data.base_path || "");
      } catch (pathErr) {
        console.error("Failed to load default download path:", pathErr);
      }
      
      // Fetch available languages
      const langRes = await client.get(`/api/mangadex/manga/${manga.mangadex_id}/languages`);
      setLanguages(langRes.data);
      
      // Set English default if available
      const defaultLang = langRes.data.includes("en") ? "en" : langRes.data[0] || "en";
      setSelectedLang(defaultLang);
      await fetchChapters(defaultLang);
    } catch (err) {
      console.error("Failed to load languages:", err);
    } finally {
      setLoadingChapters(false);
    }
  };

  const fetchChapters = async (lang: string) => {
    if (!manga?.mangadex_id) return;
    try {
      setLoadingChapters(true);
      const res = await client.get(`/api/mangadex/manga/${manga.mangadex_id}/chapters`, {
        params: { lang },
      });
      setChapters(res.data);
      setSelectedChapters([]); // Reset selections
    } catch (err) {
      console.error("Failed to load chapters:", err);
    } finally {
      setLoadingChapters(false);
    }
  };

  const toggleChapterSelection = (chapId: string) => {
    setSelectedChapters((prev) =>
      prev.includes(chapId) ? prev.filter((id) => id !== chapId) : [...prev, chapId]
    );
  };

  const toggleAllChapters = () => {
    if (selectedChapters.length === chapters.length) {
      setSelectedChapters([]);
    } else {
      setSelectedChapters(chapters.map((c) => c.id));
    }
  };

  const triggerDownload = async (force: boolean = false) => {
    if (selectedChapters.length === 0) {
      showAlert({
        title: "No Chapters Selected",
        message: "Please select at least one chapter to download.",
        type: "warning",
      });
      return;
    }

    try {
      setDownloading(true);
      const payload: any = {
        chapters: chapters
          .filter((c) => selectedChapters.includes(c.id))
          .map((c) => ({
            id: c.id,
            chapter: c.chapter,
            title: c.title,
            volume: c.volume,
          })),
        lang: selectedLang,
        force,
      };
      if (customPath.trim()) payload.download_path = customPath.trim();

      const res = await client.post(`/api/manga/${manga?._id}/download`, payload);
      showAlert({
        title: "Download Queued",
        message: "Download task successfully queued in the background!",
        type: "success",
      });
      setIsDownloadOpen(false);

      // Start polling status
      startTaskPolling(res.data.task_id);
    } catch (err: any) {
      console.error("Download failed:", err);
      if (err.response?.status === 409) {
        setOverwriteWarningMsg(err.response.data.detail || "Thư mục đích không trống.");
        setIsOverwriteConfirmOpen(true);
      } else {
        const errMsg = err.response?.data?.detail || "Failed to queue download.";
        showAlert({
          title: "Download Failed",
          message: errMsg,
          type: "error",
        });
      }
    } finally {
      setDownloading(false);
    }
  };

  const startTaskPolling = (taskId: string) => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    
    pollInterval.current = setInterval(async () => {
      try {
        const res = await client.get(`/api/downloads/tasks/${taskId}`);
        setActiveTask(res.data);
        if (["completed", "failed", "cancelled"].includes(res.data.status)) {
          clearInterval(pollInterval.current);
        }
      } catch (err) {
        clearInterval(pollInterval.current);
      }
    }, 2000);
  };

  const cancelActiveTask = async () => {
    if (!activeTask) return;
    try {
      await client.post(`/api/downloads/tasks/${activeTask._id}/cancel`);
      setActiveTask((prev) => (prev ? { ...prev, status: "cancelled" } : null));
      if (pollInterval.current) clearInterval(pollInterval.current);
      showAlert({
        title: "Cancel Requested",
        message: "Cancellation request sent.",
        type: "info",
      });
    } catch (err) {
      showAlert({
        title: "Cancel Failed",
        message: "Could not cancel task.",
        type: "error",
      });
    }
  };

  // Review Actions
  const handleSelectReview = (review: Review) => {
    setSelectedReview(review);
    setReviewTitle(review.title);
    setIsCreatingReview(false);
  };

  const handleStartCreateReview = () => {
    setSelectedReview(null);
    setReviewTitle("New Review");
    setIsCreatingReview(true);
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!window.confirm("Are you sure you want to delete this review?")) return;
    try {
      await client.delete(`/api/manga/${manga?._id}/reviews/${reviewId}`);
      setReviews((prev) => prev.filter((r) => r._id !== reviewId));
      if (selectedReview?._id === reviewId) {
        setSelectedReview(null);
      }
      showAlert({
        title: "Review Deleted",
        message: "Review deleted successfully.",
        type: "success",
      });
    } catch (err) {
      showAlert({
        title: "Delete Failed",
        message: "Failed to delete review.",
        type: "error",
      });
    }
  };

  const handleCleanupTabs = async () => {
    if (!selectedReview) return;
    try {
      const res = await client.post(`/api/manga/${manga?._id}/reviews/${selectedReview._id}/cleanup`);
      setSelectedReview(res.data);
      showToast("Tab clean-up completed successfully!", "success");
    } catch (err) {
      showToast("Failed to clean up tabs.", "error");
    }
  };

  if (loading || !manga) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-orange)]"></div>
      </div>
    );
  }

  const isEditingReview = !!selectedReview || isCreatingReview;

  if (isEditingReview) {
    return (
      <ReviewEditor
        mangaId={id || ""}
        reviewId={selectedReview?._id}
        manga={manga}
        initialContent={selectedReview?.content_json || null}
        reviewTitle={reviewTitle}
        onTitleChange={setReviewTitle}
        onSave={async (contentJson) => {
          if (!reviewTitle.trim()) {
            showToast("Review title is required.", "warning");
            return;
          }
          try {
            if (selectedReview) {
              const res = await client.put(`/api/manga/${manga._id}/reviews/${selectedReview._id}`, {
                title: reviewTitle,
                content_json: contentJson,
              });
              setReviews((prev) => prev.map((r) => (r._id === selectedReview._id ? res.data : r)));
              setSelectedReview(res.data);
              showToast("Review updated successfully!", "success");
            } else {
              const res = await client.post(`/api/manga/${manga._id}/reviews`, {
                title: reviewTitle,
                content_json: contentJson,
              });
              setReviews((prev) => [res.data, ...prev]);
              setSelectedReview(res.data);
              setIsCreatingReview(false);
              showToast("Review saved successfully!", "success");
            }
          } catch (err) {
            showToast("Failed to save review.", "error");
          }
        }}
        onBack={() => {
          setSelectedReview(null);
          setIsCreatingReview(false);
        }}
        onCleanup={handleCleanupTabs}
        lastUpdated={selectedReview?.updated_at}
      />
    );
  }

  // Group the tags
  const genres = manga.tag_ids
    .map((tid) => allTags.find((t) => t._id === tid))
    .filter((t): t is Tag => !!t && t.group === "genre");

  const themes = manga.tag_ids
    .map((tid) => allTags.find((t) => t._id === tid))
    .filter((t): t is Tag => !!t && (t.group === "theme" || t.group === "content"));

  const formats = manga.tag_ids
    .map((tid) => allTags.find((t) => t._id === tid))
    .filter((t): t is Tag => !!t && t.group !== "genre" && t.group !== "theme" && t.group !== "content");

  // Trackers and providers
  const trackerTitles = ["myanimelist", "anilist", "anime-planet", "kitsu", "mangaupdates"];
  const trackers = manga.links.filter((link) =>
    trackerTitles.includes(link.title.toLowerCase())
  );
  const providers = manga.links.filter((link) =>
    !trackerTitles.includes(link.title.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-24">
      {/* Back Button */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center space-x-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
      >
        <ArrowLeft size={16} />
        <span>Back to Library</span>
      </button>

      {/* Hero Header Card */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-8 relative overflow-hidden">
        {/* Glow behind */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[var(--brand-orange)]/10 rounded-full blur-[80px] pointer-events-none" />

        {/* Cover */}
        <div 
          onClick={() => manga.cover_url && setZoomedCoverUrl(manga.cover_url)}
          className={`w-48 md:w-56 aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 shadow-lg flex-shrink-0 mx-auto md:mx-0 ${manga.cover_url ? "cursor-zoom-in" : ""}`}
        >
          {manga.cover_url ? (
            <img src={manga.cover_url} alt={manga.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 text-xs">
              <span>No Cover Image</span>
            </div>
          )}
        </div>

        {/* Metadata Details */}
        <div className="flex-1 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              {(() => {
                const statusInfo = getReadStatusInfo(manga.read_status);
                return (
                  <span className={`px-3 py-1 border rounded-full text-xs font-bold uppercase ${statusInfo.badgeClass}`}>
                    {statusInfo.label}
                  </span>
                );
              })()}
              {manga.personal_rating !== null && (
                <span className="px-3 py-1 bg-yellow-500/10 text-yellow-500 rounded-full text-xs font-bold flex items-center space-x-1">
                  <Star size={12} className="fill-yellow-500" />
                  <span>{manga.personal_rating} / 10</span>
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-spartan font-extrabold tracking-tight leading-tight text-[var(--text-primary)]">
              {manga.title}
            </h1>

            {/* Author details grid */}
            <div className="grid grid-cols-2 gap-4 pt-2 text-sm text-[var(--text-secondary)]">
              <div className="flex items-center space-x-2">
                <User size={16} className="text-[var(--brand-orange)]" />
                <span>
                  <strong>Author:</strong> {renderCreatorLinks(manga.author)}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <User size={16} className="text-[var(--brand-coral)]" />
                <span>
                  <strong>Artist:</strong> {renderCreatorLinks(manga.artist)}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar size={16} className="text-zinc-400" />
                <span>
                  <strong>Year:</strong> {manga.year}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <BookOpen size={16} className="text-zinc-400" />
                <span>
                  <strong>Publish Status:</strong> {manga.status}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons panel */}
          <div className="flex flex-wrap gap-3 pt-4 border-t border-[var(--border-primary)]">
            <button
              onClick={() => setIsEditOpen(true)}
              className="flex items-center space-x-2 px-4 py-2 border border-[var(--border-primary)] rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 font-bold text-xs transition"
            >
              <Edit2 size={14} />
              <span>Edit Review Metadata</span>
            </button>

            {manga.mangadex_id && (
              <>
                <button
                  onClick={handleSyncMetadata}
                  className="flex items-center space-x-2 px-4 py-2 border border-[var(--border-primary)] rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 font-bold text-xs transition text-blue-500"
                >
                  <RefreshCw size={14} />
                  <span>Sync MangaDex</span>
                </button>
                <button
                  onClick={openDownloadModal}
                  className="flex items-center space-x-2 px-4 py-2 bg-[var(--brand-orange)] text-white rounded-xl hover:bg-[var(--brand-coral)] font-bold text-xs transition shadow-sm"
                >
                  <Download size={14} />
                  <span>Download Chapters</span>
                </button>
              </>
            )}

            <button
              onClick={handleDeleteManga}
              className="flex items-center space-x-2 px-4 py-2 border border-red-500/20 text-red-500 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 font-bold text-xs transition ml-auto"
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grouped Metadata Grid */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {/* Genres */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider block">Genres</span>
            <div className="flex flex-wrap gap-1.5">
              {genres.length > 0 ? (
                genres.map((tag) => (
                  <span
                    key={tag._id}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                    style={{ backgroundColor: tag.color || "var(--text-secondary)" }}
                  >
                    {tag.name.en}
                  </span>
                ))
              ) : (
                <span className="text-xs text-zinc-400 italic">None</span>
              )}
            </div>
          </div>

          {/* Themes */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider block">Themes</span>
            <div className="flex flex-wrap gap-1.5">
              {themes.length > 0 ? (
                themes.map((tag) => (
                  <span
                    key={tag._id}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                    style={{ backgroundColor: tag.color || "var(--text-secondary)" }}
                  >
                    {tag.name.en}
                  </span>
                ))
              ) : (
                <span className="text-xs text-zinc-400 italic">None</span>
              )}
            </div>
          </div>

          {/* Demographic */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider block">Demographic</span>
            <div>
              {getDemographicBadge(manga.publication_demographic)}
            </div>
          </div>

          {/* Format */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider block">Format</span>
            <div className="flex flex-wrap gap-1.5">
              {formats.length > 0 ? (
                formats.map((tag) => (
                  <span
                    key={tag._id}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                    style={{ backgroundColor: tag.color || "var(--text-secondary)" }}
                  >
                    {tag.name.en}
                  </span>
                ))
              ) : (
                <span className="text-xs text-zinc-400 italic">None</span>
              )}
            </div>
          </div>

          {/* Track */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider block">Trackers</span>
            <div className="flex flex-wrap gap-1.5">
              {trackers.length > 0 ? (
                trackers.map((link) => (
                  <a
                    key={link.title}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center space-x-1 px-2.5 py-1 text-[10px] font-bold rounded-xl border transition ${getTrackerStyle(link.title)}`}
                  >
                    {getTrackerIcon(link.title)}
                    <span className="ml-1">{link.title}</span>
                  </a>
                ))
              ) : (
                <span className="text-xs text-zinc-400 italic">None</span>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Download Active Progress Tracker */}
      {activeTask && (
        <div className="p-5 bg-zinc-50 dark:bg-zinc-900 border border-[var(--border-primary)] rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-4 flex-1 pr-4">
            <div className="p-3 bg-orange-100 dark:bg-zinc-800 text-[var(--brand-orange)] rounded-lg">
              <Download className="animate-bounce" size={20} />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold">Downloading chapters: {activeTask.status}</span>
                <span className="font-semibold text-zinc-500">
                  {Math.round(activeTask.progress * 100)}% ({activeTask.completed_chapters}/{activeTask.total_chapters})
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[var(--brand-orange)] h-full transition-all duration-300"
                  style={{ width: `${activeTask.progress * 100}%` }}
                />
              </div>
              {activeTask.error_message && (
                <p className="text-xs text-red-500 font-semibold">{activeTask.error_message}</p>
              )}
            </div>
          </div>

          {!["completed", "failed", "cancelled"].includes(activeTask.status) && (
            <button
              onClick={cancelActiveTask}
              className="px-4 py-2 border border-red-500/20 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 font-bold text-xs rounded-xl transition"
            >
              Cancel Download
            </button>
          )}
        </div>
      )}

      {/* Details body columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Description & Audit Timeline */}
        <div className="lg:col-span-2 space-y-8">
          {/* Alternative Titles */}
          {manga.alt_titles && manga.alt_titles.length > 0 && (
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-bold">Alternative Titles</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <tbody>
                    {manga.alt_titles.map((alt, idx) => {
                      let lang = "en";
                      let title = alt;
                      if (alt.includes("|")) {
                        const parts = alt.split("|");
                        lang = parts[0];
                        title = parts.slice(1).join("|");
                      }
                      const flag = getFlagInfo(lang);
                      return (
                        <tr key={idx} className="border-b border-[var(--border-primary)]/40 last:border-0">
                          <td className="py-2.5 pr-4 flex items-center space-x-2 text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                            <img src={flag.flagUrl} alt={flag.label} className="w-5 h-3.5 object-cover rounded shadow-sm" onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://flagcdn.com/w20/us.png"; // Fallback
                            }} />
                            <span className="min-w-[20px]">{flag.label}</span>
                            {flag.isRomanized && (
                              <span className="px-1 py-0.5 text-[8px] bg-zinc-100 dark:bg-zinc-800 text-[var(--text-secondary)] border border-[var(--border-primary)] rounded font-mono font-bold uppercase scale-90">
                                RO
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-sm text-[var(--text-primary)] font-medium">
                            {title}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Synopsis */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold">Synopsis</h3>
            <div className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {renderMarkdown(manga.description)}
            </div>
            {providers.length > 0 && (
              <div className="pt-4 border-t border-[var(--border-primary)] space-y-2">
                <span className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wider block">
                  Official Links & Retailers
                </span>
                <div className="flex flex-wrap gap-2.5">
                  {providers.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition ${getProviderStyle(link.title)}`}
                    >
                      {getProviderIcon(link.title)}
                      <span>{link.title}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Audit History Timeline */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold flex items-center space-x-2">
              <History size={18} className="text-zinc-500" />
              <span>Review Activity History</span>
            </h3>

            {history.length > 0 ? (
              <div className="relative border-l border-zinc-200 dark:border-zinc-800 pl-4 space-y-6 ml-2">
                {history.map((log) => (
                  <div key={log._id} className="relative">
                    {/* Circle marker */}
                    <div className="absolute -left-[21px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[var(--bg-card)] bg-[var(--brand-orange)]" />
                    
                    <div className="space-y-1">
                      <span className="text-[10px] text-[var(--text-secondary)] font-semibold block">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                      <p className="text-xs text-[var(--text-primary)]">
                        <strong className="capitalize">{log.action.replace("_", " ")}</strong>
                        {log.field && (
                          <span>
                            {" "}
                            on <code className="px-1 py-0.5 bg-gray-100 dark:bg-zinc-800 rounded">{log.field}</code>
                          </span>
                        )}
                        {log.old_value !== undefined && log.new_value !== undefined && (
                          <span className="text-[var(--text-secondary)] block text-[11px] pt-0.5">
                            Changed from "{log.old_value}" to "{log.new_value}"
                          </span>
                        )}
                      </p>
                      {log.note && (
                        <p className="text-[11px] text-[var(--text-secondary)] italic">Note: {log.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-[var(--text-secondary)]">
                No activity history found.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Reviews */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 flex flex-col space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold flex items-center space-x-2">
              <FileText size={18} className="text-[var(--brand-orange)]" />
              <span>Personal Reviews ({reviews.length})</span>
            </h3>
            <button
              onClick={handleStartCreateReview}
              className="p-1.5 text-zinc-500 hover:text-[var(--brand-orange)] rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition"
              title="Add Review"
            >
              <Plus size={18} />
            </button>
          </div>

          {/* List reviews */}
          <div className="divide-y divide-[var(--border-primary)] max-h-[400px] overflow-y-auto pr-2 space-y-2">
            {reviews.map((r) => (
              <div
                key={r._id}
                onClick={() => handleSelectReview(r)}
                className={`pt-2 pb-2 px-3 rounded-xl cursor-pointer transition flex items-center justify-between group ${
                  (selectedReview as any)?._id === r._id
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "hover:bg-gray-50 dark:hover:bg-zinc-800/40"
                }`}
              >
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)] line-clamp-1">{r.title}</h4>
                  <span className="text-[9px] text-[var(--text-secondary)] block">
                    Updated {new Date(r.updated_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteReview(r._id);
                  }}
                  className="p-1 text-zinc-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition"
                  title="Delete Review"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}

            {reviews.length === 0 && !isCreatingReview && (
              <div className="text-center py-8 text-xs text-[var(--text-secondary)]">
                No reviews yet. Click the + icon to write one!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Metadata Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex justify-between items-center border-b border-[var(--border-primary)] pb-3">
              <h2 className="text-lg font-bold">Edit Review Metadata</h2>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="p-1 rounded text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">
                Read Status
              </label>
              <select
                value={editReadStatus}
                onChange={(e) => setEditReadStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none"
              >
                <option value="unread">Unread</option>
                <option value="reading">Reading</option>
                <option value="completed">Completed</option>
                <option value="dropped">Dropped</option>
                <option value="on_hold">On Hold</option>
                <option value="plan_to_read">Plan to Read</option>
                <option value="re_reading">Re-Reading</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1">
                Personal Rating (0-10)
              </label>
              <input
                type="number"
                value={editRating}
                onChange={(e) => setEditRating(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 9.5"
                min="0"
                max="10"
                step="0.5"
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none"
              />
            </div>

            {/* Custom Tag Assignment */}
            {allTags.length > 0 && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase">
                  Assign Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => {
                    const isSelected = editTags.includes(tag._id);
                    return (
                      <button
                        key={tag._id}
                        type="button"
                        onClick={() =>
                          setEditTags((prev) =>
                            prev.includes(tag._id)
                              ? prev.filter((id) => id !== tag._id)
                              : [...prev, tag._id]
                          )
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                          isSelected
                            ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                            : "bg-transparent border-[var(--border-primary)] text-[var(--text-secondary)]"
                        }`}
                      >
                        {tag.name.en}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Replace cover */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                Replace Cover Image
              </label>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 px-4 py-2 border border-[var(--border-primary)] rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 transition">
                  <Upload size={16} />
                  <span className="text-xs font-semibold">Choose Cover</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleEditCoverChange} />
                </label>
                {editCoverPreview && (
                  <div className="w-12 h-16 rounded overflow-hidden bg-zinc-100 border border-[var(--border-primary)]">
                    <img src={editCoverPreview} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--border-primary)] flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="px-4 py-2 border border-[var(--border-primary)] rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updating}
                className="px-6 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold rounded-xl transition"
              >
                {updating ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Download Chapters Modal */}
      {isDownloadOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-[var(--border-primary)] flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold flex items-center space-x-2">
                  <Download size={20} className="text-[var(--brand-orange)]" />
                  <span>Download Chapters: {manga.title}</span>
                </h2>
              </div>
              <button
                onClick={() => setIsDownloadOpen(false)}
                className="p-1 rounded text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Language Selector */}
              {languages.length > 0 && (
                <div className="flex items-center space-x-4">
                  <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Select Language:
                  </span>
                  <div className="flex gap-2">
                    {languages.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => {
                          setSelectedLang(lang);
                          fetchChapters(lang);
                        }}
                        className={`px-3 py-1 text-xs font-bold rounded-lg border transition ${
                          selectedLang === lang
                            ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                            : "bg-transparent border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                        }`}
                      >
                        {lang.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Download Path */}
              <div className="p-4 bg-[var(--brand-orange)]/5 border border-[var(--brand-orange)]/25 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider flex items-center space-x-1">
                    <FolderPlus size={14} />
                    <span>Download Destination Path</span>
                  </label>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] border border-[var(--brand-orange)]/15">
                    Editable Base Path
                  </span>
                </div>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={customPath}
                    onChange={(e) => handlePathChange(e.target.value)}
                    placeholder="e.g. C:\Downloads\Manga"
                    className="flex-1 px-3 py-2 rounded-xl border border-[var(--brand-orange)]/30 focus:border-[var(--brand-orange)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none transition shadow-sm font-mono text-xs"
                  />
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowTitleDropdown(!showTitleDropdown)}
                      title="Select and append manga title or alternative title as subfolder"
                      className="px-4 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] border border-[var(--brand-orange)] rounded-xl text-xs font-bold text-white shadow-md hover:shadow-lg transition flex items-center space-x-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Plus size={14} className="stroke-[3]" />
                      <span>Append Title</span>
                    </button>
                    {showTitleDropdown && (
                      <>
                        <div className="fixed inset-0 z-[115]" onClick={() => setShowTitleDropdown(false)} />
                        <div className="absolute right-0 mt-1 w-64 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] shadow-xl z-[120] max-h-60 overflow-y-auto py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                          <div className="px-3 py-1.5 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border-primary)] mb-1">
                            Chọn Title để thêm
                          </div>
                          {getTitleOptions().map((opt, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                appendCleanedTitle(opt.value);
                                setShowTitleDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--brand-orange)]/10 hover:text-[var(--brand-orange)] transition-colors line-clamp-2 cursor-pointer font-medium"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-start space-x-1.5 text-xs text-[var(--text-secondary)]">
                  <Info size={14} className="text-[var(--brand-orange)] shrink-0 mt-0.5" />
                  <span>
                    This path is initialized from the default base path configuration. You can edit/delete it directly. Click <strong>Append Title</strong> to create a dedicated subfolder using the manga name.
                  </span>
                </div>
              </div>

              {/* Chapters List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider pb-1">
                  <span>Available Chapters ({chapters.length})</span>
                  <button onClick={toggleAllChapters} className="text-[var(--brand-orange)] hover:underline">
                    {selectedChapters.length === chapters.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                {loadingChapters ? (
                  <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-orange)]"></div>
                  </div>
                ) : chapters.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto border border-[var(--border-primary)] p-3 bg-[var(--bg-primary)] rounded-xl">
                    {chapters.map((chap) => {
                      const isSelected = selectedChapters.includes(chap.id);
                      return (
                        <button
                          key={chap.id}
                          onClick={() => toggleChapterSelection(chap.id)}
                          className={`p-2 rounded-lg text-left text-xs font-semibold border transition line-clamp-1 ${
                            isSelected
                              ? "bg-[var(--brand-orange)]/10 border-[var(--brand-orange)] text-[var(--brand-orange)]"
                              : "bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                          }`}
                        >
                          Ch. {chap.chapter} {chap.title ? `- ${chap.title}` : ""}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-xs text-[var(--text-secondary)]">
                    No chapters available for this language.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-[var(--border-primary)] flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsDownloadOpen(false)}
                className="px-4 py-2 border border-[var(--border-primary)] rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => triggerDownload(false)}
                disabled={downloading || selectedChapters.length === 0}
                className="px-6 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold rounded-xl shadow-lg transition disabled:opacity-50"
              >
                {downloading ? "Starting..." : `Download Selected (${selectedChapters.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overwrite Confirmation Modal */}
      {isOverwriteConfirmOpen && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-[var(--border-primary)] flex justify-between items-center">
              <h2 className="text-lg font-bold flex items-center space-x-2 text-amber-500">
                <AlertTriangle size={20} />
                <span>Cảnh báo thư mục tải xuống</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsOverwriteConfirmOpen(false)}
                className="p-1 rounded text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
              {overwriteWarningMsg}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-[var(--border-primary)] flex justify-end space-x-3 bg-gray-50/50 dark:bg-zinc-900/30">
              <button
                type="button"
                onClick={() => setIsOverwriteConfirmOpen(false)}
                className="px-4 py-2 border border-[var(--border-primary)] rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-zinc-800 transition"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOverwriteConfirmOpen(false);
                  triggerDownload(true);
                }}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg transition"
              >
                Tiếp tục & Ghi đè
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Zoom Portal/Overlay */}
      {zoomedCoverUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
          onClick={() => setZoomedCoverUrl(null)}
        >
          <button
            onClick={() => setZoomedCoverUrl(null)}
            className="absolute top-6 right-6 p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 text-white transition"
          >
            <X size={24} />
          </button>
          <div 
            className="relative max-w-full max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={zoomedCoverUrl}
              alt="Zoomed cover"
              className="max-w-full max-h-[90vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default MangaDetailPage;
