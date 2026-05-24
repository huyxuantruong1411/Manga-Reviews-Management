import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Filter, RefreshCw, Star, X, Upload, SlidersHorizontal, ChevronDown, ChevronUp, Calendar, Grid, List as ListIcon, LayoutGrid } from "lucide-react";
import client from "../api/client";
import { useAlert } from "../hooks/useAlert";
import { CreatorMultiSelect } from "../components/ui/CreatorMultiSelect";

interface Tag {
  _id: string;
  name: { en: string; vi?: string | null };
  color?: string;
  source: string;
  group: string;
}

interface Manga {
  _id: string;
  mangadex_id: string | null;
  title: string;
  author: string;
  artist: string;
  cover_url: string | null;
  read_status: string;
  personal_rating: number | null;
  tag_ids: string[];
  year: string;
  content_rating?: string;
  publication_demographic?: string;
  status?: string;
  original_language?: string;
  description?: string;
}

export const MangaListPage: React.FC = () => {
  const navigate = useNavigate();
  const { showAlert, showToast } = useAlert();

  // Library State
  const [mangas, setMangas] = useState<Manga[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "card">(() => {
    return (localStorage.getItem("library_view_mode") as any) || "grid";
  });
  const [zoomedCoverUrl, setZoomedCoverUrl] = useState<string | null>(null);

  const [readStatus, setReadStatus] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<"all" | "any">("all");
  const [contentRatings, setContentRatings] = useState<string[]>([]);
  const [demographics, setDemographics] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [originalLanguages, setOriginalLanguages] = useState<string[]>([]);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [year, setYear] = useState("");
  const [ratingMin, setRatingMin] = useState<number | "">("");
  const [ratingMax, setRatingMax] = useState<number | "">("");
  const [sortBy, setSortBy] = useState("added_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
  const limit = 12;

  // Metadata/All Tags Options
  const [allTags, setAllTags] = useState<Tag[]>([]);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addTab, setAddTab] = useState<"dex" | "manual">("dex");

  // MangaDex Search
  const [dexQuery, setDexQuery] = useState("");
  const [dexResults, setDexResults] = useState<any[]>([]);
  const [dexSearching, setDexSearching] = useState(false);

  // Import / Create Setup
  const [importStatus, setImportStatus] = useState("unread");
  const [importRating, setImportRating] = useState<number | "">("");
  const [importTags, setImportTags] = useState<string[]>([]);
  const [importingManga, setImportingManga] = useState<string | null>(null);

  // Manual Form States
  const [manualTitle, setManualTitle] = useState("");
  const [manualAuthor, setManualAuthor] = useState("");
  const [manualArtist, setManualArtist] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualRating, setManualRating] = useState<number | "">("");
  const [manualStatus, setManualStatus] = useState("ongoing");
  const [manualReadStatus, setManualReadStatus] = useState("unread");
  const [manualYear, setManualYear] = useState("");
  const [manualLinks] = useState<{ title: string; url: string }[]>([
    { title: "Source", url: "" }
  ]);
  const [manualCover, setManualCover] = useState<File | null>(null);
  const [manualCoverPreview, setManualCoverPreview] = useState<string | null>(null);
  const [submittingManual, setSubmittingManual] = useState(false);

  // Search debouncing effect
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [search]);

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

  // Load Library & Tags
  const fetchLibrary = async () => {
    try {
      setLoading(true);
      const params: any = {
        skip: (page - 1) * limit,
        limit: limit,
        sort_by: sortBy,
        sort_order: sortOrder,
      };

      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (readStatus) params.read_status = readStatus;
      if (ratingMin !== "") params.rating_min = Number(ratingMin);
      if (ratingMax !== "") params.rating_max = Number(ratingMax);
      if (selectedAuthors.length > 0) params.authors = selectedAuthors;
      if (selectedArtists.length > 0) params.artists = selectedArtists;
      if (year.trim()) params.year = year.trim();
      if (tagMode) params.tag_mode = tagMode;

      if (selectedTags.length > 0) {
        params.tags = selectedTags;
      }
      if (excludeTags.length > 0) {
        params.exclude_tags = excludeTags;
      }
      if (contentRatings.length > 0) {
        params.content_ratings = contentRatings;
      }
      if (demographics.length > 0) {
        params.demographics = demographics;
      }
      if (statuses.length > 0) {
        params.statuses = statuses;
      }
      if (originalLanguages.length > 0) {
        params.original_languages = originalLanguages;
      }

      const res = await client.get("/api/manga/", { params });
      setMangas(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      console.error("Error loading library:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await client.get("/api/tags/");
      setAllTags(res.data);
    } catch (err) {
      console.error("Error loading tags:", err);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [
    page,
    debouncedSearch,
    readStatus,
    ratingMin,
    ratingMax,
    sortBy,
    sortOrder,
    selectedTags,
    excludeTags,
    tagMode,
    contentRatings,
    demographics,
    statuses,
    originalLanguages,
    selectedAuthors,
    selectedArtists,
    year
  ]);

  useEffect(() => {
    fetchTags();
  }, []);

  // Handle Enter on search
  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setPage(1);
      setDebouncedSearch(search);
    }
  };

  // Search MangaDex
  const handleDexSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dexQuery.trim()) return;
    try {
      setDexSearching(true);
      const res = await client.get("/api/mangadex/search", {
        params: { query: dexQuery.trim() }
      });
      setDexResults(res.data);
    } catch (err) {
      console.error("MangaDex search failed:", err);
      showAlert({
        title: "Search Failed",
        message: "Failed to search MangaDex. Try again.",
        type: "error"
      });
    } finally {
      setDexSearching(false);
    }
  };

  // Import MangaDex Manga
  const handleImportManga = async (dexId: string) => {
    try {
      setImportingManga(dexId);
      const payload: any = {
        mangadex_id: dexId,
        read_status: importStatus,
        tag_ids: importTags
      };
      if (importRating !== "") payload.personal_rating = Number(importRating);

      const res = await client.post("/api/manga/dex", payload);

      // Update List
      setMangas((prev) => [res.data, ...prev].slice(0, limit));
      setTotal((prev) => prev + 1);

      // Reset imports options
      setImportRating("");
      setImportTags([]);

      showAlert({
        title: "Import Success",
        message: `Imported "${res.data.title}" successfully!`,
        type: "success"
      });
      setIsAddModalOpen(false);
      setDexResults([]);
      setDexQuery("");
    } catch (err: any) {
      showAlert({
        title: "Import Failed",
        message: err.response?.data?.detail || "Failed to import manga",
        type: "error"
      });
    } finally {
      setImportingManga(null);
    }
  };

  // Handle Cover select preview
  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setManualCover(file);
      setManualCoverPreview(URL.createObjectURL(file));
    }
  };

  // Create Manual Manga
  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) {
      showAlert({
        title: "Required Field",
        message: "Title is required",
        type: "warning"
      });
      return;
    }

    try {
      setSubmittingManual(true);
      const payload: any = {
        title: manualTitle.trim(),
        author: manualAuthor.trim() || "Unknown",
        artist: manualArtist.trim() || "Unknown",
        description: manualDescription.trim(),
        read_status: manualReadStatus,
        status: manualStatus,
        tag_ids: importTags, // Uses the same modal tag selector state
        year: manualYear.trim() || "N/A",
        links: manualLinks.filter((l) => l.title && l.url)
      };
      if (manualRating !== "") payload.personal_rating = Number(manualRating);

      const formData = new FormData();
      formData.append("metadata", JSON.stringify(payload));
      if (manualCover) {
        formData.append("cover", manualCover);
      }

      const res = await client.post("/api/manga/manual", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setMangas((prev) => [res.data, ...prev].slice(0, limit));
      setTotal((prev) => prev + 1);

      showAlert({
        title: "Success",
        message: `Added "${res.data.title}" successfully!`,
        type: "success"
      });
      setIsAddModalOpen(false);

      // Reset manual fields
      setManualTitle("");
      setManualAuthor("");
      setManualArtist("");
      setManualDescription("");
      setManualRating("");
      setManualYear("");
      setManualCover(null);
      setManualCoverPreview(null);
      setImportTags([]);
    } catch (err: any) {
      showAlert({
        title: "Error",
        message: err.response?.data?.detail || "Failed to add manual manga",
        type: "error"
      });
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleTagClick = (tagId: string) => {
    const isIncluded = selectedTags.includes(tagId);
    const isExcluded = excludeTags.includes(tagId);

    if (!isIncluded && !isExcluded) {
      setSelectedTags((prev) => [...prev, tagId]);
    } else if (isIncluded) {
      setSelectedTags((prev) => prev.filter((id) => id !== tagId));
      setExcludeTags((prev) => [...prev, tagId]);
    } else {
      setExcludeTags((prev) => prev.filter((id) => id !== tagId));
    }
    setPage(1);
  };

  const toggleImportTag = (tagId: string) => {
    setImportTags((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleQuickUpdateStatus = async (mangaId: string, status: string) => {
    try {
      const payload = { read_status: status };
      const formData = new FormData();
      formData.append("metadata", JSON.stringify(payload));

      const res = await client.put(`/api/manga/${mangaId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setMangas((prev) => prev.map((m) => m._id === mangaId ? { ...m, read_status: res.data.read_status } : m));
      showToast("Updated read status successfully!", "success");
    } catch (err) {
      console.error("Failed to quick-update status:", err);
      showToast("Failed to update read status.", "error");
    }
  };

  const handleQuickUpdateRating = async (mangaId: string, rating: number | null) => {
    try {
      const payload = { personal_rating: rating };
      const formData = new FormData();
      formData.append("metadata", JSON.stringify(payload));

      const res = await client.put(`/api/manga/${mangaId}`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setMangas((prev) => prev.map((m) => m._id === mangaId ? { ...m, personal_rating: res.data.personal_rating } : m));
      showToast("Updated rating successfully!", "success");
    } catch (err) {
      console.error("Failed to quick-update rating:", err);
      showToast("Failed to update rating.", "error");
    }
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300";
      case "reading":
        return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
      case "dropped":
        return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
      case "on_hold":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300";
      case "plan_to_read":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300";
      case "re_reading":
        return "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300";
      default:
        return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300";
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-spartan font-extrabold tracking-tight">Manga Library</h1>
          <p className="text-sm text-[var(--text-secondary)]">Track reviews, read status, and manage physical & digital collections.</p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center justify-center space-x-2 px-5 py-3 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold rounded-xl shadow-lg transition duration-200"
        >
          <Plus size={18} />
          <span>Add Manga</span>
        </button>
      </div>

      {/* Filters bar */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 space-y-4 shadow-sm">
        {/* Main Search Row */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3.5 text-zinc-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyPress}
              placeholder="Search by title, author, artist, alt titles..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={readStatus}
              onChange={(e) => { setReadStatus(e.target.value); setPage(1); }}
              className="px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition cursor-pointer font-medium"
            >
              <option value="">All Read Statuses</option>
              <option value="unread">Unread</option>
              <option value="reading">Reading</option>
              <option value="completed">Completed</option>
              <option value="dropped">Dropped</option>
              <option value="on_hold">On Hold</option>
              <option value="plan_to_read">Plan to Read</option>
              <option value="re_reading">Re-Reading</option>
            </select>

            <button
              type="button"
              onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-[var(--border-primary)] transition font-semibold text-sm ${isAdvancedSearchOpen
                ? "bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-950/20 dark:border-orange-900/30 dark:text-orange-400"
                : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                }`}
            >
              <SlidersHorizontal size={16} />
              <span>Advanced Search</span>
              {isAdvancedSearchOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Collapsible Advanced Search Panel */}
        {isAdvancedSearchOpen && (
          <div className="pt-4 border-t border-[var(--border-primary)] space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Sorting & Basic Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition cursor-pointer font-medium"
                >
                  <option value="added_at">Date Added</option>
                  <option value="title">Title</option>
                  <option value="personal_rating">Personal Rating</option>
                  <option value="year">Release Year</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Sort Order</label>
                <select
                  value={sortOrder}
                  onChange={(e) => { setSortOrder(e.target.value); setPage(1); }}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition cursor-pointer font-medium"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>

              <div>
                <CreatorMultiSelect
                  label="Author"
                  role="author"
                  selected={selectedAuthors}
                  onChange={(selected) => {
                    setSelectedAuthors(selected);
                    setPage(1);
                  }}
                  placeholder="All Authors"
                />
              </div>

              <div>
                <CreatorMultiSelect
                  label="Artist"
                  role="artist"
                  selected={selectedArtists}
                  onChange={(selected) => {
                    setSelectedArtists(selected);
                    setPage(1);
                  }}
                  placeholder="All Artists"
                />
              </div>
            </div>

            {/* Demographics, Content Rating, Publication Status, Original Language Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Magazine Demographic */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Magazine Demographic</label>
                <div className="flex flex-wrap gap-1.5">
                  {["shounen", "shoujo", "seinen", "josei"].map((demo) => {
                    const isSel = demographics.includes(demo);
                    return (
                      <button
                        key={demo}
                        type="button"
                        onClick={() => {
                          setDemographics((prev) =>
                            prev.includes(demo) ? prev.filter((d) => d !== demo) : [...prev, demo]
                          );
                          setPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition ${isSel
                          ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
                          : "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                          }`}
                      >
                        {demo}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Content Rating */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Content Rating</label>
                <div className="flex flex-wrap gap-1.5">
                  {["safe", "suggestive", "erotica", "pornographic"].map((rating) => {
                    const isSel = contentRatings.includes(rating);
                    return (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => {
                          setContentRatings((prev) =>
                            prev.includes(rating) ? prev.filter((r) => r !== rating) : [...prev, rating]
                          );
                          setPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition ${isSel
                          ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
                          : "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                          }`}
                      >
                        {rating}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Publication Status */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Publication Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {["ongoing", "completed", "hiatus", "cancelled"].map((stat) => {
                    const isSel = statuses.includes(stat);
                    return (
                      <button
                        key={stat}
                        type="button"
                        onClick={() => {
                          setStatuses((prev) =>
                            prev.includes(stat) ? prev.filter((s) => s !== stat) : [...prev, stat]
                          );
                          setPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition ${isSel
                          ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
                          : "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                          }`}
                      >
                        {stat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Original Language */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Original Language</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { code: "ja", label: "Japanese (ja)" },
                    { code: "ko", label: "Korean (ko)" },
                    { code: "zh", label: "Chinese (zh)" },
                    { code: "en", label: "English (en)" }
                  ].map((lang) => {
                    const isSel = originalLanguages.includes(lang.code);
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                          setOriginalLanguages((prev) =>
                            prev.includes(lang.code) ? prev.filter((c) => c !== lang.code) : [...prev, lang.code]
                          );
                          setPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${isSel
                          ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
                          : "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                          }`}
                      >
                        {lang.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Rating Limits, Tag Mode, Year & Legend */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-[var(--border-primary)]">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Personal Rating</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={ratingMin}
                    onChange={(e) => { setRatingMin(e.target.value === "" ? "" : Number(e.target.value)); setPage(1); }}
                    placeholder="Min"
                    min="0"
                    max="10"
                    step="0.5"
                    className="w-full px-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm text-center focus:outline-none"
                  />
                  <span className="text-zinc-400">-</span>
                  <input
                    type="number"
                    value={ratingMax}
                    onChange={(e) => { setRatingMax(e.target.value === "" ? "" : Number(e.target.value)); setPage(1); }}
                    placeholder="Max"
                    min="0"
                    max="10"
                    step="0.5"
                    className="w-full px-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm text-center focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Publication Year</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 text-zinc-400" size={16} />
                  <input
                    type="text"
                    value={year}
                    onChange={(e) => { setYear(e.target.value); setPage(1); }}
                    placeholder="e.g. 2015"
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Tag Inclusion Mode</label>
                <div className="flex rounded-xl overflow-hidden border border-[var(--border-primary)] p-0.5 bg-[var(--bg-primary)]">
                  <button
                    type="button"
                    onClick={() => { setTagMode("all"); setPage(1); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${tagMode === "all"
                      ? "bg-[var(--brand-orange)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                  >
                    AND (All Selected)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTagMode("any"); setPage(1); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${tagMode === "any"
                      ? "bg-[var(--brand-orange)] text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                  >
                    OR (Any Selected)
                  </button>
                </div>
              </div>
            </div>

            {/* Tag Filter Matrix */}
            {allTags.length > 0 && (
              <div className="pt-4 border-t border-[var(--border-primary)] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center space-x-1">
                    <Filter size={14} />
                    <span>Filter by Genre/Tags (3-State Matrix):</span>
                  </span>

                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-neutral-100 dark:bg-neutral-850 border border-neutral-300 dark:border-neutral-700"></span>
                      <span className="text-[var(--text-secondary)]">Neutral (Ignore)</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-emerald-500/10 border border-emerald-500"></span>
                      <span className="text-emerald-600 dark:text-emerald-400">Green (Must Include)</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-rose-500/10 border border-rose-500"></span>
                      <span className="text-rose-600 dark:text-rose-400">Red (Must Exclude)</span>
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 max-h-[300px] overflow-y-auto pr-2">
                  {Array.from(new Set(allTags.map((t) => t.group || "other"))).sort().map((groupName) => {
                    const groupTags = allTags.filter((t) => (t.group || "other") === groupName);
                    if (groupTags.length === 0) return null;
                    return (
                      <div key={groupName} className="space-y-1.5">
                        <h4 className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border-primary)] pb-0.5 capitalize">
                          {groupName}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {groupTags.map((tag) => {
                            const isIncluded = selectedTags.includes(tag._id);
                            const isExcluded = excludeTags.includes(tag._id);

                            let btnClass = "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400";
                            let icon = null;

                            if (isIncluded) {
                              btnClass = "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold";
                              icon = <span className="mr-1 text-xs">✓</span>;
                            } else if (isExcluded) {
                              btnClass = "bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400 line-through font-bold";
                              icon = <span className="mr-1 text-xs">✗</span>;
                            }

                            return (
                              <button
                                key={tag._id}
                                type="button"
                                onClick={() => handleTagClick(tag._id)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center transition select-none ${btnClass}`}
                              >
                                {icon}
                                <span>{tag.name.en}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Selected Summary and Reset Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[var(--border-primary)]">
          <div className="flex items-center space-x-2 text-xs font-bold text-[var(--text-secondary)]">
            <span>Active filters:</span>
            {debouncedSearch && <span className="bg-orange-50 dark:bg-orange-950/20 text-[var(--brand-orange)] px-2 py-0.5 rounded-md">Search: "{debouncedSearch}"</span>}
            {readStatus && <span className="bg-orange-50 dark:bg-orange-950/20 text-[var(--brand-orange)] px-2 py-0.5 rounded-md">Status: {readStatus}</span>}
            {selectedTags.length > 0 && <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md">Include {selectedTags.length} tags</span>}
            {excludeTags.length > 0 && <span className="bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-md">Exclude {excludeTags.length} tags</span>}
            {(selectedAuthors.length > 0 || selectedArtists.length > 0 || year || contentRatings.length > 0 || demographics.length > 0 || statuses.length > 0 || originalLanguages.length > 0 || ratingMin || ratingMax) && (
              <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md">Advanced active</span>
            )}
            {!search && !readStatus && selectedTags.length === 0 && excludeTags.length === 0 && selectedAuthors.length === 0 && selectedArtists.length === 0 && !year && contentRatings.length === 0 && demographics.length === 0 && statuses.length === 0 && originalLanguages.length === 0 && !ratingMin && !ratingMax && (
              <span className="text-zinc-400 font-medium">None</span>
            )}
          </div>

          <button
            onClick={() => {
              setSearch("");
              setReadStatus("");
              setSelectedTags([]);
              setExcludeTags([]);
              setTagMode("all");
              setContentRatings([]);
              setDemographics([]);
              setStatuses([]);
              setOriginalLanguages([]);
              setSelectedAuthors([]);
              setSelectedArtists([]);
              setYear("");
              setRatingMin("");
              setRatingMax("");
              setSortBy("added_at");
              setSortOrder("desc");
              setPage(1);
            }}
            className="text-xs font-bold text-[var(--brand-orange)] hover:underline flex items-center space-x-1"
          >
            <RefreshCw size={12} />
            <span>Reset All Filters</span>
          </button>
        </div>
      </div>

      {/* View Switcher Toolbar */}
      {!loading && mangas.length > 0 && (
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-4">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">
            Showing <span className="text-[var(--text-primary)] font-bold">{mangas.length}</span> of <span className="text-[var(--text-primary)] font-bold">{total}</span> manga
          </span>
          <div className="flex items-center space-x-1 bg-[var(--bg-card)] border border-[var(--border-primary)] p-1 rounded-xl shadow-sm">
            <button
              onClick={() => {
                setViewMode("grid");
                localStorage.setItem("library_view_mode", "grid");
              }}
              className={`p-2 rounded-lg transition-colors duration-200 ${viewMode === "grid"
                ? "bg-[var(--brand-orange)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
                }`}
              title="Grid View"
            >
              <Grid size={18} />
            </button>
            <button
              onClick={() => {
                setViewMode("list");
                localStorage.setItem("library_view_mode", "list");
              }}
              className={`p-2 rounded-lg transition-colors duration-200 ${viewMode === "list"
                ? "bg-[var(--brand-orange)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
                }`}
              title="List View"
            >
              <ListIcon size={18} />
            </button>
            <button
              onClick={() => {
                setViewMode("card");
                localStorage.setItem("library_view_mode", "card");
              }}
              className={`p-2 rounded-lg transition-colors duration-200 ${viewMode === "card"
                ? "bg-[var(--brand-orange)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
                }`}
              title="Detailed Card View"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Manga Grid/List/Card List */}
      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-orange)]"></div>
        </div>
      ) : mangas.length > 0 ? (
        <div className="space-y-8">
          {viewMode === "grid" && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {mangas.map((manga) => (
                <div
                  key={manga._id}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("select") || target.closest("button") || target.closest("a") || target.closest(".prevent-nav")) {
                      return;
                    }
                    navigate(`/manga/${manga._id}`);
                  }}
                  className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer flex flex-col group"
                >
                  {/* Cover Frame */}
                  <div
                    className="aspect-[3/4] relative overflow-hidden bg-zinc-200 dark:bg-zinc-800 cursor-zoom-in"
                    onClick={(e) => {
                      if (manga.cover_url) {
                        e.stopPropagation();
                        setZoomedCoverUrl(manga.cover_url);
                      }
                    }}
                  >
                    {manga.cover_url ? (
                      <img
                        src={manga.cover_url}
                        alt={manga.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 text-xs">
                        <span>No Cover Image</span>
                      </div>
                    )}

                    {/* Status Badge (Select) */}
                    <select
                      value={manga.read_status}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseUp={(e) => e.stopPropagation()}
                      onChange={(e) => handleQuickUpdateStatus(manga._id, e.target.value)}
                      className={`absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border-none outline-none cursor-pointer shadow-sm transition hover:brightness-95 appearance-none ${getStatusColorClass(manga.read_status)}`}
                    >
                      <option value="unread" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Unread</option>
                      <option value="reading" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Reading</option>
                      <option value="completed" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Completed</option>
                      <option value="dropped" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Dropped</option>
                      <option value="on_hold" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">On Hold</option>
                      <option value="plan_to_read" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Plan to Read</option>
                      <option value="re_reading" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Re-Reading</option>
                    </select>

                    {/* Rating Badge (Select) */}
                    <div
                      className="absolute bottom-3 right-3"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseUp={(e) => e.stopPropagation()}
                    >
                      <div className="relative inline-flex items-center">
                        <Star size={10} className="absolute left-2 text-yellow-500 fill-yellow-500 pointer-events-none" />
                        <select
                          value={manga.personal_rating ?? ""}
                          onChange={(e) => {
                            const val = e.target.value === "" ? null : Number(e.target.value);
                            handleQuickUpdateRating(manga._id, val);
                          }}
                          className={`pl-5.5 pr-2 py-0.5 rounded text-[10px] font-bold border-none outline-none cursor-pointer appearance-none shadow-sm transition hover:brightness-110 ${manga.personal_rating !== null
                            ? "bg-zinc-900/95 text-white"
                            : "bg-zinc-950/60 text-zinc-400"
                            }`}
                        >
                          <option value="" className="text-zinc-850 bg-white dark:bg-zinc-900 dark:text-zinc-200">★ -</option>
                          {Array.from({ length: 21 }, (_, i) => {
                            const num = 10 - i * 0.5;
                            return (
                              <option key={num} value={num} className="text-zinc-850 bg-white dark:bg-zinc-900 dark:text-zinc-200">
                                {num.toFixed(1)}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                    <div className="space-y-1">
                      <h3 className="font-spartan font-bold text-sm leading-tight text-[var(--text-primary)] line-clamp-2" title={manga.title}>
                        {manga.title}
                      </h3>
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1">
                        By {renderCreatorLinks(manga.author)}
                      </p>
                    </div>

                    {/* Render 2 tags maximum */}
                    <div className="flex flex-wrap gap-1">
                      {manga.tag_ids.slice(0, 2).map((tid) => {
                        const tag = allTags.find((t) => t._id === tid);
                        if (!tag) return null;
                        return (
                          <span
                            key={tid}
                            onClick={(e) => e.stopPropagation()}
                            className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-white truncate max-w-[80px]"
                            style={{ backgroundColor: tag.color || "var(--text-secondary)" }}
                          >
                            {tag.name.en}
                          </span>
                        );
                      })}
                      {manga.tag_ids.length > 2 && (
                        <span className="text-[9px] text-[var(--text-secondary)] font-bold">
                          +{manga.tag_ids.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === "list" && (
            <div className="overflow-x-auto bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-primary)] bg-[var(--bg-primary)] text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    <th className="py-4 px-6 text-center w-20">Cover</th>
                    <th className="py-4 px-4">Title</th>
                    <th className="py-4 px-4">Author / Artist</th>
                    <th className="py-4 px-4">Year / Status</th>
                    <th className="py-4 px-4">Demographic</th>
                    <th className="py-4 px-4">Rating</th>
                    <th className="py-4 px-4">Read Status</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] text-sm">
                  {mangas.map((manga) => (
                    <tr
                      key={manga._id}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest("select") || target.closest("button") || target.closest("a") || target.closest(".prevent-nav")) {
                          return;
                        }
                        navigate(`/manga/${manga._id}`);
                      }}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 cursor-pointer transition duration-150"
                    >
                      <td className="py-3 px-6 text-center">
                        <div
                          className="w-12 h-16 rounded overflow-hidden bg-zinc-200 dark:bg-zinc-800 mx-auto flex-shrink-0 cursor-zoom-in border border-[var(--border-primary)] shadow-sm"
                          onClick={(e) => {
                            if (manga.cover_url) {
                              e.stopPropagation();
                              setZoomedCoverUrl(manga.cover_url);
                            }
                          }}
                        >
                          {manga.cover_url ? (
                            <img src={manga.cover_url} alt={manga.title} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[9px] text-zinc-400 flex items-center justify-center h-full">No Cover</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-bold text-[var(--text-primary)]">
                        <div className="line-clamp-2 max-w-xs md:max-w-sm" title={manga.title}>
                          {manga.title}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)] font-medium">
                        <div className="space-y-0.5">
                          <div className="line-clamp-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-450 mr-1">Auth:</span>
                            {renderCreatorLinks(manga.author)}
                          </div>
                          <div className="line-clamp-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-450 mr-1">Art:</span>
                            {renderCreatorLinks(manga.artist)}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)] font-semibold">
                        <div className="flex flex-col">
                          <span>{manga.year || "N/A"}</span>
                          {manga.status && (
                            <span className="text-xs font-bold capitalize text-[var(--text-secondary)] opacity-80">
                              {manga.status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {manga.publication_demographic ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-100/60 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 border border-orange-200/50 dark:border-orange-900/30">
                            {manga.publication_demographic}
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div
                          className="relative inline-flex items-center"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onMouseUp={(e) => e.stopPropagation()}
                        >
                          <Star size={12} className="absolute left-2 text-yellow-500 fill-yellow-500 pointer-events-none" />
                          <select
                            value={manga.personal_rating ?? ""}
                            onChange={(e) => {
                              const val = e.target.value === "" ? null : Number(e.target.value);
                              handleQuickUpdateRating(manga._id, val);
                            }}
                            className={`pl-6 pr-2 py-1 rounded-xl text-xs font-bold border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none cursor-pointer appearance-none shadow-sm transition hover:border-zinc-450 ${manga.personal_rating !== null ? "text-yellow-600 dark:text-yellow-455 font-extrabold" : "text-zinc-400"
                              }`}
                          >
                            <option value="" className="text-zinc-850 bg-white dark:bg-zinc-900 dark:text-zinc-200">-</option>
                            {Array.from({ length: 21 }, (_, i) => {
                              const num = 10 - i * 0.5;
                              return (
                                <option key={num} value={num} className="text-zinc-850 bg-white dark:bg-zinc-900 dark:text-zinc-200">
                                  {num.toFixed(1)}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={manga.read_status}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onMouseUp={(e) => e.stopPropagation()}
                          onChange={(e) => handleQuickUpdateStatus(manga._id, e.target.value)}
                          className={`px-2 py-1 rounded-xl text-xs font-bold border border-transparent cursor-pointer transition focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] ${getStatusColorClass(manga.read_status)}`}
                        >
                          <option value="unread" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Unread</option>
                          <option value="reading" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Reading</option>
                          <option value="completed" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Completed</option>
                          <option value="dropped" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Dropped</option>
                          <option value="on_hold" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">On Hold</option>
                          <option value="plan_to_read" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Plan to Read</option>
                          <option value="re_reading" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Re-Reading</option>
                        </select>
                      </td>
                      <td className="py-3 px-6 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/manga/${manga._id}`);
                          }}
                          className="px-3 py-1.5 bg-[var(--bg-primary)] hover:bg-[var(--border-primary)] border border-[var(--border-primary)] text-[var(--text-primary)] font-bold text-xs rounded-lg transition"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {viewMode === "card" && (
            <div className="space-y-4">
              {mangas.map((manga) => (
                <div
                  key={manga._id}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("select") || target.closest("button") || target.closest("a") || target.closest(".prevent-nav")) {
                      return;
                    }
                    navigate(`/manga/${manga._id}`);
                  }}
                  className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer flex flex-col md:flex-row group"
                >
                  {/* Cover Frame (larger) */}
                  <div
                    className="w-full md:w-48 aspect-[3/4] md:aspect-auto md:h-64 relative overflow-hidden bg-zinc-200 dark:bg-zinc-800 flex-shrink-0 cursor-zoom-in"
                    onClick={(e) => {
                      if (manga.cover_url) {
                        e.stopPropagation();
                        setZoomedCoverUrl(manga.cover_url);
                      }
                    }}
                  >
                    {manga.cover_url ? (
                      <img
                        src={manga.cover_url}
                        alt={manga.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 text-xs">
                        <span>No Cover Image</span>
                      </div>
                    )}
                    {/* Status Badge (Select) */}
                    <select
                      value={manga.read_status}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseUp={(e) => e.stopPropagation()}
                      onChange={(e) => handleQuickUpdateStatus(manga._id, e.target.value)}
                      className={`absolute top-3 left-3 px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wider border-none outline-none cursor-pointer shadow-sm transition hover:brightness-95 appearance-none ${getStatusColorClass(manga.read_status)}`}
                    >
                      <option value="unread" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Unread</option>
                      <option value="reading" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Reading</option>
                      <option value="completed" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Completed</option>
                      <option value="dropped" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Dropped</option>
                      <option value="on_hold" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">On Hold</option>
                      <option value="plan_to_read" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Plan to Read</option>
                      <option value="re_reading" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">Re-Reading</option>
                    </select>
                  </div>

                  {/* Details Section */}
                  <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {manga.publication_demographic && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-850 dark:bg-orange-950 dark:text-orange-300">
                            {manga.publication_demographic}
                          </span>
                        )}
                        {manga.status && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
                            {manga.status}
                          </span>
                        )}
                        <div
                          className="relative inline-flex items-center"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onMouseUp={(e) => e.stopPropagation()}
                        >
                          <Star size={12} className="absolute left-2 text-yellow-500 fill-yellow-500 pointer-events-none" />
                          <select
                            value={manga.personal_rating ?? ""}
                            onChange={(e) => {
                              const val = e.target.value === "" ? null : Number(e.target.value);
                              handleQuickUpdateRating(manga._id, val);
                            }}
                            className={`pl-6 pr-2 py-0.5 rounded text-[11px] font-bold border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-none cursor-pointer appearance-none shadow-sm transition hover:border-zinc-450 ${manga.personal_rating !== null ? "text-yellow-600 dark:text-yellow-400 font-extrabold" : "text-zinc-400"
                              }`}
                          >
                            <option value="" className="text-zinc-850 bg-white dark:bg-zinc-900 dark:text-zinc-200">★ -</option>
                            {Array.from({ length: 21 }, (_, i) => {
                              const num = 10 - i * 0.5;
                              return (
                                <option key={num} value={num} className="text-zinc-850 bg-white dark:bg-zinc-900 dark:text-zinc-200">
                                  {num.toFixed(1)} / 10
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        {manga.year && (
                          <span className="text-xs text-[var(--text-secondary)] font-semibold">
                            Released: {manga.year}
                          </span>
                        )}
                      </div>

                      <h3 className="font-spartan font-extrabold text-xl leading-tight text-[var(--text-primary)]">
                        {manga.title}
                      </h3>

                      <div className="text-xs text-[var(--text-secondary)] font-medium flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          <span className="font-bold text-[var(--text-primary)]">Author:</span> {renderCreatorLinks(manga.author)}
                        </span>
                        <span>
                          <span className="font-bold text-[var(--text-primary)]">Artist:</span> {renderCreatorLinks(manga.artist)}
                        </span>
                      </div>

                      {manga.description && (
                        <p className="text-sm text-[var(--text-secondary)] line-clamp-3 leading-relaxed pt-1">
                          {manga.description}
                        </p>
                      )}
                    </div>

                    {/* Tags & Action Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-[var(--border-primary)]">
                      <div className="flex flex-wrap gap-1.5">
                        {manga.tag_ids.map((tid) => {
                          const tag = allTags.find((t) => t._id === tid);
                          if (!tag) return null;
                          return (
                            <span
                              key={tid}
                              onClick={(e) => e.stopPropagation()}
                              className="px-2 py-0.5 rounded text-[10px] font-bold text-white transition hover:brightness-95"
                              style={{ backgroundColor: tag.color || "var(--text-secondary)" }}
                            >
                              {tag.name.en}
                            </span>
                          );
                        })}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/manga/${manga._id}`);
                        }}
                        className="flex-shrink-0 px-4 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold text-xs rounded-xl shadow transition duration-200"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div className="flex justify-center items-center space-x-4 pt-4">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-4 py-2 border border-[var(--border-primary)] rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-zinc-800 font-semibold"
              >
                Previous
              </button>
              <span className="text-sm font-semibold">
                Page {page} of {Math.ceil(total / limit)}
              </span>
              <button
                disabled={page * limit >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-2 border border-[var(--border-primary)] rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-zinc-800 font-semibold"
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-24 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl text-[var(--text-secondary)]">
          No manga match your filters or search. Add a manga to start!
        </div>
      )}

      {/* Add Manga Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-[var(--border-primary)] flex justify-between items-center">
              <div className="space-y-1">
                <h2 className="text-xl font-bold flex items-center space-x-2">
                  <Plus size={20} className="text-[var(--brand-orange)]" />
                  <span>Add New Manga</span>
                </h2>
                <div className="flex space-x-4 text-xs font-semibold">
                  <button
                    onClick={() => setAddTab("dex")}
                    className={`pb-1 border-b-2 transition ${addTab === "dex"
                      ? "border-[var(--brand-orange)] text-[var(--text-primary)]"
                      : "border-transparent text-[var(--text-secondary)]"
                      }`}
                  >
                    Search MangaDex
                  </button>
                  <button
                    onClick={() => setAddTab("manual")}
                    className={`pb-1 border-b-2 transition ${addTab === "manual"
                      ? "border-[var(--brand-orange)] text-[var(--text-primary)]"
                      : "border-transparent text-[var(--text-secondary)]"
                      }`}
                  >
                    Add Manually
                  </button>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-200 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {addTab === "dex" ? (
                /* MangaDex Tab */
                <div className="space-y-6">
                  <form onSubmit={handleDexSearch} className="flex gap-2">
                    <input
                      type="text"
                      value={dexQuery}
                      onChange={(e) => setDexQuery(e.target.value)}
                      placeholder="Enter manga title or MangaDex UUID..."
                      className="flex-1 px-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition"
                      required
                    />
                    <button
                      type="submit"
                      disabled={dexSearching}
                      className="px-6 py-2 bg-[var(--brand-orange)] text-white font-bold rounded-xl hover:bg-[var(--brand-coral)] transition disabled:opacity-50 flex items-center space-x-2"
                    >
                      {dexSearching ? "Searching..." : "Search"}
                    </button>
                  </form>

                  {/* Import Configuration Panel */}
                  <div className="p-4 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-xl space-y-4">
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      Import Configuration (Set values before clicking Import)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                          Read Status
                        </label>
                        <select
                          value={importStatus}
                          onChange={(e) => setImportStatus(e.target.value)}
                          className="w-full px-3 py-1.5 rounded border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none"
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
                        <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                          Personal Rating (0-10)
                        </label>
                        <input
                          type="number"
                          value={importRating}
                          onChange={(e) => setImportRating(e.target.value === "" ? "" : Number(e.target.value))}
                          placeholder="e.g. 8.5"
                          min="0"
                          max="10"
                          step="0.5"
                          className="w-full px-3 py-1.5 rounded border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Tag checklist */}
                    {allTags.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                          Assign Custom Tags on Import
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {allTags.map((tag) => {
                            const isSelected = importTags.includes(tag._id);
                            return (
                              <button
                                key={tag._id}
                                type="button"
                                onClick={() => toggleImportTag(tag._id)}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${isSelected
                                  ? "bg-zinc-700 dark:bg-zinc-200 border-zinc-700 dark:border-zinc-200 text-white dark:text-zinc-900"
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
                  </div>

                  {/* Search Results */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">Search Results</h3>
                    {dexResults.length > 0 ? (
                      <div className="divide-y divide-[var(--border-primary)] max-h-96 overflow-y-auto pr-2 space-y-3">
                        {dexResults.map((m) => (
                          <div key={m.id} className="pt-3 flex gap-4 items-start justify-between">
                            <div className="flex gap-4">
                              <div className="w-16 h-20 rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden flex-shrink-0">
                                {m.cover_url && (
                                  <img src={m.cover_url} alt={m.title} className="w-full h-full object-cover" />
                                )}
                              </div>
                              <div className="space-y-1">
                                <h4 className="text-sm font-bold text-[var(--text-primary)] line-clamp-1">{m.title}</h4>
                                <p className="text-xs text-[var(--text-secondary)]">By {m.author} • {m.year}</p>
                                <p className="text-xs text-[var(--text-secondary)] line-clamp-2 italic">{m.description}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleImportManga(m.id)}
                              disabled={importingManga === m.id}
                              className="px-4 py-1.5 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg text-xs font-bold transition disabled:opacity-50 flex-shrink-0"
                            >
                              {importingManga === m.id ? "Importing..." : "Import"}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-[var(--text-secondary)] text-sm">
                        No results found yet.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Manual Add Tab */
                <form onSubmit={handleCreateManual} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Manga Title *</label>
                      <input
                        type="text"
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                        placeholder="e.g. My Custom Manga"
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Author</label>
                      <input
                        type="text"
                        value={manualAuthor}
                        onChange={(e) => setManualAuthor(e.target.value)}
                        placeholder="e.g. Oda Eiichiro"
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Artist</label>
                      <input
                        type="text"
                        value={manualArtist}
                        onChange={(e) => setManualArtist(e.target.value)}
                        placeholder="e.g. Yusuke Murata"
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Release Year</label>
                      <input
                        type="text"
                        value={manualYear}
                        onChange={(e) => setManualYear(e.target.value)}
                        placeholder="e.g. 2021"
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Description</label>
                    <textarea
                      value={manualDescription}
                      onChange={(e) => setManualDescription(e.target.value)}
                      placeholder="Manga details, summary..."
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Publish Status</label>
                      <select
                        value={manualStatus}
                        onChange={(e) => setManualStatus(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none"
                      >
                        <option value="ongoing">Ongoing</option>
                        <option value="completed">Completed</option>
                        <option value="hiatus">Hiatus</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Read Status</label>
                      <select
                        value={manualReadStatus}
                        onChange={(e) => setManualReadStatus(e.target.value)}
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
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Rating (0-10)</label>
                      <input
                        type="number"
                        value={manualRating}
                        onChange={(e) => setManualRating(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="e.g. 9.5"
                        min="0"
                        max="10"
                        step="0.5"
                        className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Assign Tags (reuses checklist code) */}
                  {allTags.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase">Assign Custom Tags</label>
                      <div className="flex flex-wrap gap-2">
                        {allTags.map((tag) => {
                          const isSelected = importTags.includes(tag._id);
                          return (
                            <button
                              key={tag._id}
                              type="button"
                              onClick={() => toggleImportTag(tag._id)}
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition ${isSelected
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

                  {/* Cover image upload */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">Upload Cover Image</label>
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2 px-4 py-2 border border-[var(--border-primary)] rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 transition">
                        <Upload size={16} />
                        <span className="text-xs font-semibold">Choose File</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
                      </label>
                      {manualCoverPreview && (
                        <div className="w-12 h-16 rounded overflow-hidden bg-zinc-100 border border-[var(--border-primary)]">
                          <img src={manualCoverPreview} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Modal Footer Submit */}
                  <div className="pt-4 border-t border-[var(--border-primary)] flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="px-4 py-2 border border-[var(--border-primary)] rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-zinc-800 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingManual}
                      className="px-6 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold rounded-xl shadow-lg transition disabled:opacity-50"
                    >
                      {submittingManual ? "Adding..." : "Add Manga"}
                    </button>
                  </div>
                </form>
              )}
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

export default MangaListPage;
