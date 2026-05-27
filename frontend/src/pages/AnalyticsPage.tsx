import React, { useState, useEffect, useMemo } from "react";
import { 
  BarChart3, 
  TrendingUp, 
  Award, 
  Layers, 
  BookOpen, 
  Star, 
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Calendar,
  Search,
  Filter,
  User
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from "recharts";
import client from "../api/client";
import { CreatorMultiSelect } from "../components/ui/CreatorMultiSelect";

interface Tag {
  _id: string;
  name: { en: string; vi?: string | null };
  color?: string;
  source: string;
  group: string;
}

interface OverviewStats {
  total_manga: number;
  total_reviews: number;
  average_rating: number;
  status_distribution: {
    unread: number;
    reading: number;
    completed: number;
    dropped: number;
    on_hold: number;
    plan_to_read: number;
    re_reading: number;
  };
}

interface ScoreDist {
  score: number;
  count: number;
}

interface TopTag {
  tag_id: string;
  name: string;
  count: number;
  color?: string;
}

interface TimelineItem {
  period: string;
  count: number;
}

interface DistributionItem {
  name: string;
  value: number;
}

interface CreatorCountItem {
  name: string;
  count: number;
}

interface RatingInsightItem {
  name: string;
  avg_rating: number;
}

interface MetadataDistributions {
  demographic: DistributionItem[];
  publishing_status: DistributionItem[];
  original_language: DistributionItem[];
  content_rating?: DistributionItem[];
}

interface TopCreators {
  authors: CreatorCountItem[];
  artists: CreatorCountItem[];
}

interface RatingInsights {
  demographic_ratings: RatingInsightItem[];
  status_ratings: RatingInsightItem[];
}

interface YearDistItem {
  year: string;
  demographic: string;
  status: string;
  read_status: string;
  count: number;
}

interface YearDistribution {
  data: YearDistItem[];
  min_year: number | null;
  max_year: number | null;
}

export const AnalyticsPage: React.FC = () => {
  // Library All Tags
  const [allTags, setAllTags] = useState<Tag[]>([]);

  // Filter States
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
  const [ratingMin, setRatingMin] = useState<number | "">("");
  const [ratingMax, setRatingMax] = useState<number | "">("");
  const [yearStart, setYearStart] = useState("");
  const [yearEnd, setYearEnd] = useState("");

  // Timeline & Time-Unit states
  const [timelineGroupBy, setTimelineGroupBy] = useState<string>("month");
  const [addedStartDate, setAddedStartDate] = useState("");
  const [addedEndDate, setAddedEndDate] = useState("");
  const [reviewStartDate, setReviewStartDate] = useState("");
  const [reviewEndDate, setReviewEndDate] = useState("");

  // UI States
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);

  // Analytics API Data States
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [scoreDist, setScoreDist] = useState<ScoreDist[]>([]);
  const [topTags, setTopTags] = useState<TopTag[]>([]);
  const [mangaTimeline, setMangaTimeline] = useState<TimelineItem[]>([]);
  const [reviewTimeline, setReviewTimeline] = useState<TimelineItem[]>([]);
  const [metadataDists, setMetadataDists] = useState<MetadataDistributions | null>(null);
  const [topCreators, setTopCreators] = useState<TopCreators | null>(null);
  const [ratingInsights, setRatingInsights] = useState<RatingInsights | null>(null);

  // Year Distribution States
  const [yearDist, setYearDist] = useState<YearDistribution | null>(null);
  const [yearChartMode, setYearChartMode] = useState<"total" | "demographic" | "status" | "read_status">("total");
  const [activeDemoFilters, setActiveDemoFilters] = useState<Set<string>>(
    new Set(["Shounen", "Shoujo", "Seinen", "Josei", "Unknown"])
  );
  const [activeStatusFilters, setActiveStatusFilters] = useState<Set<string>>(
    new Set(["Ongoing", "Completed", "Hiatus", "Cancelled", "Unknown"])
  );
  const [activeReadStatusFilters, setActiveReadStatusFilters] = useState<Set<string>>(
    new Set(["unread", "reading", "completed", "dropped", "on_hold", "plan_to_read", "re_reading"])
  );
  const [useCustomRanges, setUseCustomRanges] = useState(false);
  const [customRangeInput, setCustomRangeInput] = useState("");

  const rangeValidation = useMemo(() => {
    if (!useCustomRanges || !customRangeInput.trim() || !yearDist) {
      return { ranges: [], error: "" };
    }
    
    const minYear = yearDist.min_year;
    const maxYear = yearDist.max_year;
    
    const ranges: { label: string; start: number; end: number }[] = [];
    const parts = customRangeInput.split(",");
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      
      const match = trimmed.match(/^(\d{4})-(\d{4})$/);
      if (!match) {
        return { ranges: [], error: `Invalid range format: "${trimmed}". Use YYYY-YYYY (e.g. 1990-1995).` };
      }
      
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      
      if (start > end) {
        return { ranges: [], error: `Start year cannot be greater than end year in "${trimmed}".` };
      }
      
      if (minYear !== null && start < minYear) {
        return { ranges: [], error: `Start year ${start} is below the minimum publication year (${minYear}).` };
      }
      
      if (maxYear !== null && end > maxYear) {
        return { ranges: [], error: `End year ${end} is above the maximum publication year (${maxYear}).` };
      }
      
      ranges.push({ label: trimmed, start, end });
    }
    
    // Check overlaps
    const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sortedRanges.length - 1; i++) {
      if (sortedRanges[i].end >= sortedRanges[i + 1].start) {
        return { ranges: [], error: `Ranges overlap: "${sortedRanges[i].label}" and "${sortedRanges[i + 1].label}".` };
      }
    }
    
    return { ranges: sortedRanges, error: "" };
  }, [useCustomRanges, customRangeInput, yearDist]);

  const yearChartData = useMemo(() => {
    if (!yearDist || !yearDist.data) return [];
    
    const rawData = yearDist.data;
    const { ranges, error } = rangeValidation;
    
    if (useCustomRanges && (error || ranges.length === 0)) {
      return [];
    }
    
    const grouped: Record<string, Record<string, number>> = {};
    
    const initGroup = (key: string) => {
      if (!grouped[key]) {
        grouped[key] = {
          count: 0,
          Shounen: 0,
          Shoujo: 0,
          Seinen: 0,
          Josei: 0,
          Ongoing: 0,
          Completed: 0,
          Hiatus: 0,
          Cancelled: 0,
          Unknown: 0,
          unread: 0,
          reading: 0,
          completed_rs: 0,
          dropped: 0,
          on_hold: 0,
          plan_to_read: 0,
          re_reading: 0
        };
      }
    };
    
    for (const item of rawData) {
      const yearVal = parseInt(item.year, 10);
      if (isNaN(yearVal)) continue;
      
      let bucketKey = "";
      if (useCustomRanges) {
        const matchedRange = ranges.find(r => yearVal >= r.start && yearVal <= r.end);
        if (!matchedRange) continue;
        bucketKey = matchedRange.label;
      } else {
        bucketKey = item.year;
      }
      
      initGroup(bucketKey);
      
      grouped[bucketKey].count += item.count;
      
      const demoKey = item.demographic;
      if (grouped[bucketKey][demoKey] !== undefined) {
        grouped[bucketKey][demoKey] += item.count;
      } else {
        grouped[bucketKey][demoKey] = (grouped[bucketKey][demoKey] || 0) + item.count;
      }
      
      const statusKey = item.status;
      if (grouped[bucketKey][statusKey] !== undefined) {
        grouped[bucketKey][statusKey] += item.count;
      } else {
        grouped[bucketKey][statusKey] = (grouped[bucketKey][statusKey] || 0) + item.count;
      }
      
      // Read status — use "completed_rs" key to avoid collision with publishing status "Completed"
      const rsKey = item.read_status === "completed" ? "completed_rs" : item.read_status;
      if (grouped[bucketKey][rsKey] !== undefined) {
        grouped[bucketKey][rsKey] += item.count;
      } else {
        grouped[bucketKey][rsKey] = (grouped[bucketKey][rsKey] || 0) + item.count;
      }
    }
    
    const resultList = Object.keys(grouped).map(key => ({
      name: key,
      ...grouped[key]
    }));
    
    if (useCustomRanges) {
      resultList.sort((a, b) => {
        const rangeA = ranges.find(r => r.label === a.name);
        const rangeB = ranges.find(r => r.label === b.name);
        return (rangeA?.start || 0) - (rangeB?.start || 0);
      });
    } else {
      resultList.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    return resultList;
  }, [yearDist, useCustomRanges, rangeValidation]);

  const templates = useMemo(() => {
    if (!yearDist || yearDist.min_year === null || yearDist.max_year === null) {
      return [];
    }
    const min = yearDist.min_year;
    const max = yearDist.max_year;
    
    const list: { name: string; value: string }[] = [];
    
    // Decade template
    const startDecade = Math.floor(min / 10) * 10;
    const endDecade = Math.ceil(max / 10) * 10;
    const decadeRanges: string[] = [];
    for (let y = startDecade; y < endDecade; y += 10) {
      if (y > max) continue;
      const endYear = Math.min(y + 9, max);
      if (y <= endYear) {
        decadeRanges.push(`${y}-${endYear}`);
      }
    }
    list.push({
      name: "Decades (10 Years)",
      value: decadeRanges.join(", ")
    });
    
    // 5-Year intervals template
    const start5 = Math.floor(min / 5) * 5;
    const end5 = Math.ceil(max / 5) * 5;
    const fiveYearRanges: string[] = [];
    for (let y = start5; y < end5; y += 5) {
      if (y > max) continue;
      const endYear = Math.min(y + 4, max);
      if (y <= endYear) {
        fiveYearRanges.push(`${y}-${endYear}`);
      }
    }
    list.push({
      name: "5-Year Blocks",
      value: fiveYearRanges.join(", ")
    });
    
    // Post-2000 focus
    if (max >= 2000) {
      const post2000Ranges: string[] = [];
      if (min < 2000) {
        post2000Ranges.push(`${min}-1999`);
      }
      post2000Ranges.push("2000-2009", "2010-2019", `2020-${max}`);
      list.push({
        name: "Classic vs Modern (2000 Split)",
        value: post2000Ranges.join(", ")
      });
    }

    // Simple 2-Half Split
    const midPoint = Math.floor((min + max) / 2);
    list.push({
      name: "Equal Split (2 Bins)",
      value: `${min}-${midPoint}, ${midPoint + 1}-${max}`
    });
    
    return list;
  }, [yearDist]);

  // Debounce search string
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Load Tags Matrix
  const fetchTags = async () => {
    try {
      const res = await client.get("/api/tags/");
      setAllTags(res.data);
    } catch (err) {
      console.error("Error loading tags:", err);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  // Fetch Unified Analytics Data
  const fetchAnalytics = async () => {
    try {
      const params: any = {
        timeline_group_by: timelineGroupBy
      };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (readStatus) params.read_status = readStatus;
      if (selectedTags.length > 0) params.tags = selectedTags;
      if (excludeTags.length > 0) params.exclude_tags = excludeTags;
      if (tagMode) params.tag_mode = tagMode;
      if (contentRatings.length > 0) params.content_ratings = contentRatings;
      if (demographics.length > 0) params.demographics = demographics;
      if (statuses.length > 0) params.statuses = statuses;
      if (originalLanguages.length > 0) params.original_languages = originalLanguages;
      if (selectedAuthors.length > 0) params.authors = selectedAuthors;
      if (selectedArtists.length > 0) params.artists = selectedArtists;
      if (ratingMin !== "") params.rating_min = Number(ratingMin);
      if (ratingMax !== "") params.rating_max = Number(ratingMax);
      if (yearStart.trim()) params.year_start = yearStart.trim();
      if (yearEnd.trim()) params.year_end = yearEnd.trim();
      
      if (addedStartDate) params.added_start_date = addedStartDate;
      if (addedEndDate) params.added_end_date = addedEndDate;
      if (reviewStartDate) params.review_start_date = reviewStartDate;
      if (reviewEndDate) params.review_end_date = reviewEndDate;

      const res = await client.get("/api/analytics", { params });

      setOverview(res.data.overview);
      setScoreDist(res.data.score_distribution);
      setTopTags(res.data.top_tags);
      setMangaTimeline(res.data.manga_timeline);
      setReviewTimeline(res.data.review_timeline);
      setMetadataDists(res.data.metadata_distributions);
      setTopCreators(res.data.top_creators);
      setRatingInsights(res.data.rating_insights);
      setYearDist(res.data.year_distribution);
    } catch (err) {
      console.error("Error loading library analytics:", err);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [
    debouncedSearch,
    readStatus,
    selectedTags,
    excludeTags,
    tagMode,
    contentRatings,
    demographics,
    statuses,
    originalLanguages,
    selectedAuthors,
    selectedArtists,
    ratingMin,
    ratingMax,
    yearStart,
    yearEnd,
    timelineGroupBy,
    addedStartDate,
    addedEndDate,
    reviewStartDate,
    reviewEndDate
  ]);

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
  };

  const handleGroupClick = (groupName: string) => {
    const groupTags = allTags.filter((t) => (t.group || "other") === groupName);
    if (groupTags.length === 0) return;

    const tagIds = groupTags.map((t) => t._id);
    const allIncluded = tagIds.every((id) => selectedTags.includes(id));
    const allExcluded = tagIds.every((id) => excludeTags.includes(id));

    if (!allIncluded && !allExcluded) {
      // Step 1: Must Include all tags in this group
      setSelectedTags((prev) => {
        const filtered = prev.filter((id) => !tagIds.includes(id));
        return [...filtered, ...tagIds];
      });
      setExcludeTags((prev) => prev.filter((id) => !tagIds.includes(id)));
    } else if (allIncluded) {
      // Step 2: Must Exclude all tags in this group
      setSelectedTags((prev) => prev.filter((id) => !tagIds.includes(id)));
      setExcludeTags((prev) => {
        const filtered = prev.filter((id) => !tagIds.includes(id));
        return [...filtered, ...tagIds];
      });
    } else {
      // Step 3: Ignore all tags in this group (Neutral)
      setSelectedTags((prev) => prev.filter((id) => !tagIds.includes(id)));
      setExcludeTags((prev) => prev.filter((id) => !tagIds.includes(id)));
    }
  };

  // Color constants for distributions
  const STATUS_COLORS = {
    unread: "#9CA3AF",
    reading: "#3B82F6",
    completed: "#10B981",
    dropped: "#EF4444",
    on_hold: "#F59E0B",
    plan_to_read: "#A855F7",
    re_reading: "#EC4899"
  };

  const DEMO_COLORS: Record<string, string> = {
    Shounen: "#3B82F6",
    Shoujo: "#EC4899",
    Seinen: "#8B5CF6",
    Josei: "#EF4444",
    Unknown: "#6B7280"
  };

  const PUB_STATUS_COLORS: Record<string, string> = {
    Ongoing: "#10B981",
    Completed: "#3B82F6",
    Hiatus: "#F59E0B",
    Cancelled: "#EF4444",
    Unknown: "#6B7280"
  };

  const CONTENT_RATING_COLORS: Record<string, string> = {
    Safe: "#10B981",
    Suggestive: "#F59E0B",
    Erotica: "#F97316",
    Pornographic: "#EF4444",
    Unknown: "#6B7280"
  };

  const READ_STATUS_COLORS: Record<string, string> = {
    unread: "#9CA3AF",
    reading: "#3B82F6",
    completed: "#10B981",
    dropped: "#EF4444",
    on_hold: "#F59E0B",
    plan_to_read: "#A855F7",
    re_reading: "#EC4899"
  };

  const READ_STATUS_LABELS: Record<string, string> = {
    unread: "Unread",
    reading: "Reading",
    completed: "Completed",
    dropped: "Dropped",
    on_hold: "On Hold",
    plan_to_read: "Plan to Read",
    re_reading: "Re-reading"
  };

  const pieData = overview
    ? [
        { name: "Unread", value: overview.status_distribution.unread, color: STATUS_COLORS.unread },
        { name: "Reading", value: overview.status_distribution.reading, color: STATUS_COLORS.reading },
        { name: "Completed", value: overview.status_distribution.completed, color: STATUS_COLORS.completed },
        { name: "Dropped", value: overview.status_distribution.dropped, color: STATUS_COLORS.dropped },
        { name: "On Hold", value: overview.status_distribution.on_hold, color: STATUS_COLORS.on_hold },
        { name: "Plan to Read", value: overview.status_distribution.plan_to_read, color: STATUS_COLORS.plan_to_read },
        { name: "Re-Reading", value: overview.status_distribution.re_reading, color: STATUS_COLORS.re_reading }
      ].filter(d => d.value > 0)
    : [];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-24">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-tr from-[var(--brand-orange)] to-[var(--brand-coral)] text-white rounded-2xl shadow-md">
            <BarChart3 size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-spartan font-extrabold tracking-tight">Library Analytics</h1>
            <p className="text-sm text-[var(--text-secondary)]">Insights and statistics about your manga collection and review progress.</p>
          </div>
        </div>

        <button
          onClick={fetchAnalytics}
          className="px-4 py-2 bg-[var(--bg-card)] hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-[var(--border-primary)] rounded-xl font-bold text-xs flex items-center space-x-2 transition shadow-sm"
        >
          <RefreshCw size={14} />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {/* Advanced Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 space-y-4 shadow-sm">
        {/* Main Search Row */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-zinc-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, author, artist..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition text-sm"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={readStatus}
              onChange={(e) => setReadStatus(e.target.value)}
              className="px-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition cursor-pointer font-medium text-sm"
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
              onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl border border-[var(--border-primary)] transition font-semibold text-sm ${
                isAdvancedFiltersOpen
                  ? "bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-950/20 dark:border-orange-900/30 dark:text-orange-400"
                  : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
              }`}
            >
              <SlidersHorizontal size={16} />
              <span>Filters Pool</span>
              {isAdvancedFiltersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Collapsible Advanced Filters Panel */}
        {isAdvancedFiltersOpen && (
          <div className="pt-4 border-t border-[var(--border-primary)] space-y-6 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Sorting & Basic Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Release Year From</label>
                <input
                  type="text"
                  value={yearStart}
                  onChange={(e) => setYearStart(e.target.value)}
                  placeholder="e.g. 2010"
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Release Year To</label>
                <input
                  type="text"
                  value={yearEnd}
                  onChange={(e) => setYearEnd(e.target.value)}
                  placeholder="e.g. 2025"
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition"
                />
              </div>

              <div>
                <CreatorMultiSelect
                  label="Author"
                  role="author"
                  selected={selectedAuthors}
                  onChange={(selected) => setSelectedAuthors(selected)}
                  placeholder="All Authors"
                />
              </div>

              <div>
                <CreatorMultiSelect
                  label="Artist"
                  role="artist"
                  selected={selectedArtists}
                  onChange={(selected) => setSelectedArtists(selected)}
                  placeholder="All Artists"
                />
              </div>
            </div>

            {/* Demographics, Content Rating, Publication Status, Original Language Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Magazine Demographic */}
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Demographic</label>
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
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition ${
                          isSel
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
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition ${
                          isSel
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
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition ${
                          isSel
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
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          isSel
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

            {/* Rating Limits & Tag Inclusion Mode */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-[var(--border-primary)]">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Personal Rating</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={ratingMin}
                    onChange={(e) => setRatingMin(e.target.value === "" ? "" : Number(e.target.value))}
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
                    onChange={(e) => setRatingMax(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="Max"
                    min="0"
                    max="10"
                    step="0.5"
                    className="w-full px-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm text-center focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Tag Inclusion Mode</label>
                <div className="flex rounded-xl overflow-hidden border border-[var(--border-primary)] p-0.5 bg-[var(--bg-primary)]">
                  <button
                    type="button"
                    onClick={() => setTagMode("all")}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                      tagMode === "all"
                        ? "bg-[var(--brand-orange)] text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    AND (All Selected)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTagMode("any")}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                      tagMode === "any"
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

                <div className="grid grid-cols-1 gap-4 max-h-[220px] overflow-y-auto pr-2">
                  {Array.from(new Set(allTags.map((t) => t.group || "other"))).sort().map((groupName) => {
                    const groupTags = allTags.filter((t) => (t.group || "other") === groupName);
                    if (groupTags.length === 0) return null;
                    return (
                      <div key={groupName} className="space-y-1.5">
                        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-0.5">
                          <button
                            type="button"
                            onClick={() => handleGroupClick(groupName)}
                            className="group text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--brand-orange)] uppercase tracking-wider cursor-pointer select-none transition flex items-center gap-1.5 capitalize focus:outline-none"
                          >
                            <span>{groupName}</span>
                            {(() => {
                              const tagIds = groupTags.map((t) => t._id);
                              const allIncluded = tagIds.every((id) => selectedTags.includes(id));
                              const allExcluded = tagIds.every((id) => excludeTags.includes(id));
                              if (allIncluded) {
                                return (
                                  <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-[8px] font-extrabold normal-case">
                                    all included
                                  </span>
                                );
                              } else if (allExcluded) {
                                return (
                                  <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded text-[8px] font-extrabold normal-case">
                                    all excluded
                                  </span>
                                );
                              }
                              return (
                                <span className="text-[8px] text-zinc-400 group-hover:text-[var(--brand-orange)]/80 font-medium normal-case transition">
                                  (toggle all)
                                </span>
                              );
                            })()}
                          </button>
                        </div>
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

        {/* Active Filters Summary & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[var(--border-primary)]">
          <div className="flex items-center space-x-2 text-xs font-bold text-[var(--text-secondary)]">
            <span>Active Pool filters:</span>
            {debouncedSearch && <span className="bg-orange-50 dark:bg-orange-950/20 text-[var(--brand-orange)] px-2 py-0.5 rounded-md">Search: "{debouncedSearch}"</span>}
            {readStatus && <span className="bg-orange-50 dark:bg-orange-950/20 text-[var(--brand-orange)] px-2 py-0.5 rounded-md">Status: {readStatus}</span>}
            {selectedTags.length > 0 && <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md">Include {selectedTags.length} tags</span>}
            {excludeTags.length > 0 && <span className="bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-md">Exclude {excludeTags.length} tags</span>}
            {(yearStart || yearEnd || selectedAuthors.length > 0 || selectedArtists.length > 0 || ratingMin || ratingMax || contentRatings.length > 0 || demographics.length > 0 || statuses.length > 0 || originalLanguages.length > 0) && (
              <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md">Advanced Active</span>
            )}
            {!search && !readStatus && selectedTags.length === 0 && excludeTags.length === 0 && !yearStart && !yearEnd && selectedAuthors.length === 0 && selectedArtists.length === 0 && !ratingMin && !ratingMax && contentRatings.length === 0 && demographics.length === 0 && statuses.length === 0 && originalLanguages.length === 0 && (
              <span className="text-zinc-400 font-medium">None (Analyzing entire library)</span>
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
              setRatingMin("");
              setRatingMax("");
              setYearStart("");
              setYearEnd("");
            }}
            className="text-xs font-bold text-[var(--brand-orange)] hover:underline flex items-center space-x-1"
          >
            <RefreshCw size={12} />
            <span>Reset Pool Filters</span>
          </button>
        </div>
      </div>

      {/* Overview Stats Cards */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 flex items-center space-x-4 shadow-sm hover:shadow-md transition">
            <div className="p-4 bg-orange-50 dark:bg-zinc-800 text-[var(--brand-orange)] rounded-xl">
              <BookOpen size={24} />
            </div>
            <div>
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">Filtered Manga</span>
              <span className="text-3xl font-bold">{overview.total_manga}</span>
            </div>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 flex items-center space-x-4 shadow-sm hover:shadow-md transition">
            <div className="p-4 bg-orange-50 dark:bg-zinc-800 text-[var(--brand-coral)] rounded-xl">
              <Layers size={24} />
            </div>
            <div>
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">Reviews Logged</span>
              <span className="text-3xl font-bold">{overview.total_reviews}</span>
            </div>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 flex items-center space-x-4 shadow-sm hover:shadow-md transition">
            <div className="p-4 bg-yellow-50 dark:bg-zinc-800 text-yellow-500 rounded-xl">
              <Star size={24} />
            </div>
            <div>
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">Avg Rating</span>
              <span className="text-3xl font-bold flex items-center">
                {overview.average_rating} <span className="text-xs text-yellow-500 ml-1">★</span>
              </span>
            </div>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 flex items-center space-x-4 shadow-sm hover:shadow-md transition">
            <div className="p-4 bg-green-50 dark:bg-zinc-800 text-green-500 rounded-xl">
              <Award size={24} />
            </div>
            <div>
              <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block font-poppins">Completed</span>
              <span className="text-3xl font-bold">
                {overview.status_distribution.completed}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Distributions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Score Distribution Chart */}
        <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4 shadow-sm">
          <h3 className="text-lg font-bold">Rating Distribution</h3>
          <div className="h-72">
            {scoreDist.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDist}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="score" />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-primary)",
                      color: "var(--text-primary)"
                    }}
                  />
                  <Bar dataKey="count" fill="var(--brand-orange)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-[var(--text-secondary)] text-sm">No ratings found in the selected pool.</div>
            )}
          </div>
        </div>

        {/* Read Status Distribution Pie */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4 shadow-sm">
          <h3 className="text-lg font-bold">Read Status Distribution</h3>
          <div className="h-72 relative flex flex-col justify-center">
            {pieData.length > 0 ? (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center flex-wrap gap-x-4 gap-y-2 text-xs font-semibold max-h-[80px] overflow-y-auto">
                  {pieData.map((item, idx) => (
                    <div key={idx} className="flex items-center space-x-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-[var(--text-secondary)]">{item.name} ({item.value})</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-[var(--text-secondary)] text-sm">No status data found.</div>
            )}
          </div>
        </div>
      </div>

      {/* Demographic, Publishing Status & Original Language Row */}
      {metadataDists && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Demographic Pie */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4 shadow-sm">
            <h3 className="text-lg font-bold">Demographic Distribution</h3>
            <div className="h-72 flex flex-col justify-center">
              {metadataDists.demographic.filter(d => d.value > 0).length > 0 ? (
                <>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={metadataDists.demographic.filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {metadataDists.demographic.filter(d => d.value > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={DEMO_COLORS[entry.name] || "#6B7280"} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center flex-wrap gap-x-4 gap-y-2 text-xs font-semibold max-h-[80px] overflow-y-auto">
                    {metadataDists.demographic.filter(d => d.value > 0).map((item, idx) => (
                      <div key={idx} className="flex items-center space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DEMO_COLORS[item.name] || "#6B7280" }} />
                        <span className="text-[var(--text-secondary)]">{item.name} ({item.value})</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center text-[var(--text-secondary)] text-sm my-auto">No demographic metadata.</div>
              )}
            </div>
          </div>

          {/* Publishing Status Pie */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4 shadow-sm">
            <h3 className="text-lg font-bold">Publishing Status</h3>
            <div className="h-72 flex flex-col justify-center">
              {metadataDists.publishing_status.filter(d => d.value > 0).length > 0 ? (
                <>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={metadataDists.publishing_status.filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {metadataDists.publishing_status.filter(d => d.value > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PUB_STATUS_COLORS[entry.name] || "#6B7280"} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center flex-wrap gap-x-4 gap-y-2 text-xs font-semibold max-h-[80px] overflow-y-auto">
                    {metadataDists.publishing_status.filter(d => d.value > 0).map((item, idx) => (
                      <div key={idx} className="flex items-center space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PUB_STATUS_COLORS[item.name] || "#6B7280" }} />
                        <span className="text-[var(--text-secondary)]">{item.name} ({item.value})</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center text-[var(--text-secondary)] text-sm my-auto">No status metadata.</div>
              )}
            </div>
          </div>

          {/* Content Rating Distribution Pie Chart */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4 shadow-sm">
            <h3 className="text-lg font-bold">Content Rating Distribution</h3>
            <div className="h-72 flex flex-col justify-center">
              {metadataDists.content_rating && metadataDists.content_rating.filter(d => d.value > 0).length > 0 ? (
                <>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={metadataDists.content_rating.filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {metadataDists.content_rating.filter(d => d.value > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CONTENT_RATING_COLORS[entry.name] || "#6B7280"} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center flex-wrap gap-x-4 gap-y-2 text-xs font-semibold max-h-[80px] overflow-y-auto">
                    {metadataDists.content_rating.filter(d => d.value > 0).map((item, idx) => (
                      <div key={idx} className="flex items-center space-x-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CONTENT_RATING_COLORS[item.name] || "#6B7280" }} />
                        <span className="text-[var(--text-secondary)]">{item.name} ({item.value})</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center text-[var(--text-secondary)] text-sm my-auto">No content rating metadata.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Publication Year Distribution Chart */}
      {yearDist && yearDist.data && yearDist.data.length > 0 && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-bold">Publication Year Distribution</h3>
              <p className="text-xs text-[var(--text-secondary)] font-medium">
                Japanese-language manga only. Matches the current library filters.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              {/* Mode Toggle */}
              <div className="flex rounded-xl overflow-hidden border border-[var(--border-primary)] p-0.5 bg-[var(--bg-primary)]">
                {(["total", "demographic", "status", "read_status"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setYearChartMode(mode)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition capitalize focus:outline-none cursor-pointer ${
                      yearChartMode === mode
                        ? "bg-[var(--brand-orange)] text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {mode === "total" ? "Total" : mode === "demographic" ? "Demographic" : mode === "status" ? "Pub. Status" : "Read Status"}
                  </button>
                ))}
              </div>

              {/* Custom Range Checkbox */}
              <label className="flex items-center space-x-2 cursor-pointer text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition select-none">
                <input
                  type="checkbox"
                  checked={useCustomRanges}
                  onChange={(e) => setUseCustomRanges(e.target.checked)}
                  className="rounded border-[var(--border-primary)] text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] h-4 w-4 bg-[var(--bg-primary)]"
                />
                <span>Custom Ranges</span>
              </label>
            </div>
          </div>

          {/* Custom Ranges Input and Helper Text */}
          {useCustomRanges && (
            <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-3 transition-all duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-[var(--text-primary)]">Configure Year Epochs</span>
                  {yearDist.min_year !== null && yearDist.max_year !== null && (
                    <p className="text-[10px] text-[var(--text-secondary)] font-medium">
                      Manga publication range in pool: <span className="font-bold text-[var(--brand-orange)]">{yearDist.min_year}</span> to <span className="font-bold text-[var(--brand-orange)]">{yearDist.max_year}</span>
                    </p>
                  )}
                </div>
                
                <input
                  type="text"
                  value={customRangeInput}
                  onChange={(e) => setCustomRangeInput(e.target.value)}
                  placeholder="e.g. 1990-1999, 2000-2009, 2010-2025"
                  className="flex-1 md:max-w-md px-3 py-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-primary)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition"
                />
              </div>

              {templates.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border-primary)]/40">
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Quick Fill:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {templates.map((tpl) => (
                      <button
                        key={tpl.name}
                        type="button"
                        onClick={() => setCustomRangeInput(tpl.value)}
                        className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--brand-orange)] hover:border-[var(--brand-orange)] transition focus:outline-none cursor-pointer"
                      >
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {rangeValidation.error ? (
                <div className="text-xs text-rose-500 font-semibold flex items-center gap-1.5">
                  <span>⚠</span>
                  <span>{rangeValidation.error}</span>
                </div>
              ) : (
                <div className="text-[10px] text-[var(--text-secondary)] font-medium">
                  Enter comma-separated ranges format: <code className="bg-[var(--bg-card)] px-1 py-0.5 rounded border border-[var(--border-primary)] text-xs">YYYY-YYYY</code>. Non-overlapping ranges between min/max years.
                </div>
              )}
            </div>
          )}

          {/* Legend chips for filtering in stacked mode */}
          {yearChartMode !== "total" && (
            <div className="flex flex-wrap items-center gap-2.5 pb-2 border-b border-[var(--border-primary)]">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Toggle Breakdown Elements:</span>
              
              {yearChartMode === "demographic" &&
                Object.keys(DEMO_COLORS).map((demo) => {
                  const isActive = activeDemoFilters.has(demo);
                  const color = DEMO_COLORS[demo];
                  return (
                    <button
                      key={demo}
                      type="button"
                      onClick={() => {
                        const newFilters = new Set(activeDemoFilters);
                        if (isActive) {
                          newFilters.delete(demo);
                        } else {
                          newFilters.add(demo);
                        }
                        setActiveDemoFilters(newFilters);
                      }}
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition select-none cursor-pointer ${
                        isActive
                          ? "bg-[var(--bg-primary)] text-[var(--text-primary)] animate-[pulse_2s_infinite]"
                          : "opacity-40 line-through text-[var(--text-secondary)]"
                      }`}
                      style={{ borderColor: isActive ? color : "var(--border-primary)" }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span>{demo}</span>
                    </button>
                  );
                })}

              {yearChartMode === "status" &&
                Object.keys(PUB_STATUS_COLORS).map((status) => {
                  const isActive = activeStatusFilters.has(status);
                  const color = PUB_STATUS_COLORS[status];
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        const newFilters = new Set(activeStatusFilters);
                        if (isActive) {
                          newFilters.delete(status);
                        } else {
                          newFilters.add(status);
                        }
                        setActiveStatusFilters(newFilters);
                      }}
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition select-none cursor-pointer ${
                        isActive
                          ? "bg-[var(--bg-primary)] text-[var(--text-primary)] animate-[pulse_2s_infinite]"
                          : "opacity-40 line-through text-[var(--text-secondary)]"
                      }`}
                      style={{ borderColor: isActive ? color : "var(--border-primary)" }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span>{status}</span>
                    </button>
                  );
                })}

              {yearChartMode === "read_status" &&
                Object.keys(READ_STATUS_COLORS).map((status) => {
                  const isActive = activeReadStatusFilters.has(status);
                  const color = READ_STATUS_COLORS[status];
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        const newFilters = new Set(activeReadStatusFilters);
                        if (isActive) {
                          newFilters.delete(status);
                        } else {
                          newFilters.add(status);
                        }
                        setActiveReadStatusFilters(newFilters);
                      }}
                      className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition select-none cursor-pointer ${
                        isActive
                          ? "bg-[var(--bg-primary)] text-[var(--text-primary)] animate-[pulse_2s_infinite]"
                          : "opacity-40 line-through text-[var(--text-secondary)]"
                      }`}
                      style={{ borderColor: isActive ? color : "var(--border-primary)" }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span>{READ_STATUS_LABELS[status] || status}</span>
                    </button>
                  );
                })}
            </div>
          )}

          {/* Chart display */}
          <div className="h-96 w-full flex items-center justify-center">
            {useCustomRanges && rangeValidation.error ? (
              <div className="text-center text-[var(--text-secondary)] text-sm">
                Please resolve the custom range error above to show the chart.
              </div>
            ) : useCustomRanges && !customRangeInput.trim() ? (
              <div className="text-center text-[var(--text-secondary)] text-sm">
                Enter some year ranges (e.g. <span className="font-semibold">2000-2010, 2011-2020</span>) to begin bucketing.
              </div>
            ) : yearChartData.length === 0 ? (
              <div className="text-center text-[var(--text-secondary)] text-sm">
                No publication year data fits the active filters and year ranges.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" opacity={0.3} vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="var(--text-secondary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border-primary)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke="var(--text-secondary)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: "var(--border-primary)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-primary)",
                      color: "var(--text-primary)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                    }}
                  />
                  
                  {yearChartMode === "total" && (
                    <Bar dataKey="count" name="Manga Count" fill="var(--brand-orange)" radius={[4, 4, 0, 0]} />
                  )}
                  
                  {yearChartMode === "demographic" &&
                    Object.keys(DEMO_COLORS).map((demo) => {
                      if (!activeDemoFilters.has(demo)) return null;
                      return (
                        <Bar
                          key={demo}
                          dataKey={demo}
                          name={demo}
                          stackId="year_stack"
                          fill={DEMO_COLORS[demo] || "#6B7280"}
                        />
                      );
                    })}

                  {yearChartMode === "status" &&
                    Object.keys(PUB_STATUS_COLORS).map((status) => {
                      if (!activeStatusFilters.has(status)) return null;
                      return (
                        <Bar
                          key={status}
                          dataKey={status}
                          name={status}
                          stackId="year_stack"
                          fill={PUB_STATUS_COLORS[status] || "#6B7280"}
                        />
                      );
                    })}

                  {yearChartMode === "read_status" &&
                    Object.keys(READ_STATUS_COLORS).map((status) => {
                      if (!activeReadStatusFilters.has(status)) return null;
                      const dataKey = status === "completed" ? "completed_rs" : status;
                      return (
                        <Bar
                          key={status}
                          dataKey={dataKey}
                          name={READ_STATUS_LABELS[status] || status}
                          stackId="year_stack"
                          fill={READ_STATUS_COLORS[status] || "#6B7280"}
                        />
                      );
                    })}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Timeline Controls & Charts */}
      <div className="space-y-6">
        {/* Timeline Filters Toolbelt */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center space-x-2">
            <Calendar size={18} className="text-[var(--brand-orange)]" />
            <h3 className="font-spartan font-bold text-sm">Timeline Configuration</h3>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Timeline Grouping Option */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Group Timeline by:</span>
              <div className="flex rounded-xl overflow-hidden border border-[var(--border-primary)] p-0.5 bg-[var(--bg-primary)]">
                {["hour", "day", "week", "month", "year"].map((unit) => (
                  <button
                    key={unit}
                    onClick={() => setTimelineGroupBy(unit)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition capitalize ${
                      timelineGroupBy === unit
                        ? "bg-[var(--brand-orange)] text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Timeline Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Library Growth Area Chart */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-lg font-bold">Library Growth (Manga Added)</h3>
              
              {/* Added date range */}
              <div className="flex items-center space-x-1.5 text-xs text-[var(--text-secondary)]">
                <input
                  type="date"
                  value={addedStartDate}
                  onChange={(e) => setAddedStartDate(e.target.value)}
                  className="px-2 py-0.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md focus:outline-none"
                />
                <span>-</span>
                <input
                  type="date"
                  value={addedEndDate}
                  onChange={(e) => setAddedEndDate(e.target.value)}
                  className="px-2 py-0.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md focus:outline-none"
                />
              </div>
            </div>

            <div className="h-72">
              {mangaTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mangaTimeline}>
                    <defs>
                      <linearGradient id="colorManga" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--brand-orange)" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="var(--brand-orange)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-primary)",
                        color: "var(--text-primary)"
                      }}
                    />
                    <Area type="monotone" dataKey="count" stroke="var(--brand-orange)" fillOpacity={1} fill="url(#colorManga)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--text-secondary)] text-sm">No additions found in selected dates.</div>
              )}
            </div>
          </div>

          {/* Review Activity Line Chart */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-lg font-bold">Review Activity (Reviews Created)</h3>
              
              {/* Review date range */}
              <div className="flex items-center space-x-1.5 text-xs text-[var(--text-secondary)]">
                <input
                  type="date"
                  value={reviewStartDate}
                  onChange={(e) => setReviewStartDate(e.target.value)}
                  className="px-2 py-0.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md focus:outline-none"
                />
                <span>-</span>
                <input
                  type="date"
                  value={reviewEndDate}
                  onChange={(e) => setReviewEndDate(e.target.value)}
                  className="px-2 py-0.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md focus:outline-none"
                />
              </div>
            </div>

            <div className="h-72">
              {reviewTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={reviewTimeline}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-primary)",
                        color: "var(--text-primary)"
                      }}
                    />
                    <Line type="monotone" dataKey="count" stroke="var(--brand-coral)" strokeWidth={2} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--text-secondary)] text-sm">No reviews found in selected dates.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Creators & Rating Insights Row */}
      {topCreators && ratingInsights && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Rating averages by demographics and statuses */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center space-x-2">
              <Award size={20} className="text-yellow-500" />
              <span>Score Averages Insights</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Demographic averages */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Avg Rating by Demographic</h4>
                {ratingInsights.demographic_ratings.length > 0 ? (
                  <div className="space-y-2">
                    {ratingInsights.demographic_ratings.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-lg">
                        <span className="text-xs font-semibold">{item.name}</span>
                        <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 flex items-center">
                          {item.avg_rating} <Star size={10} className="fill-yellow-500 text-yellow-500 ml-0.5" />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No ratings found.</p>
                )}
              </div>

              {/* Status averages */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Avg Rating by Pub Status</h4>
                {ratingInsights.status_ratings.length > 0 ? (
                  <div className="space-y-2">
                    {ratingInsights.status_ratings.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-lg">
                        <span className="text-xs font-semibold">{item.name}</span>
                        <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 flex items-center">
                          {item.avg_rating} <Star size={10} className="fill-yellow-500 text-yellow-500 ml-0.5" />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No ratings found.</p>
                )}
              </div>
            </div>
          </div>

          {/* Top Creators (Authors & Artists) lists */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center space-x-2">
              <User size={20} className="text-[var(--brand-orange)]" />
              <span>Library Creator Distributions</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Authors List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Top Authors</h4>
                {topCreators.authors.length > 0 ? (
                  <div className="space-y-2">
                    {topCreators.authors.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-lg">
                        <span className="text-xs font-semibold truncate max-w-[120px]" title={item.name}>{item.name}</span>
                        <span className="text-xs font-bold text-[var(--text-secondary)]">{item.count} {item.count === 1 ? "manga" : "mangas"}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No creator details.</p>
                )}
              </div>

              {/* Artists List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Top Artists</h4>
                {topCreators.artists.length > 0 ? (
                  <div className="space-y-2">
                    {topCreators.artists.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-lg">
                        <span className="text-xs font-semibold truncate max-w-[120px]" title={item.name}>{item.name}</span>
                        <span className="text-xs font-bold text-[var(--text-secondary)]">{item.count} {item.count === 1 ? "manga" : "mangas"}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No creator details.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Tags Count */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-6 shadow-sm">
        <h3 className="text-lg font-bold flex items-center space-x-2">
          <TrendingUp size={20} className="text-[var(--brand-orange)]" />
          <span>Top 10 Genres / Tags in Pool</span>
        </h3>
        
        {topTags.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topTags.map((tag, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-xl">
                <div className="flex items-center space-x-3">
                  <span className="w-6 h-6 flex items-center justify-center bg-orange-50 dark:bg-zinc-800 text-[var(--brand-orange)] rounded-lg text-xs font-bold font-mono">
                    {idx + 1}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-xs font-semibold text-white"
                    style={{ backgroundColor: tag.color || "var(--brand-orange)" }}
                  >
                    {tag.name}
                  </span>
                </div>
                <span className="text-sm font-semibold text-[var(--text-secondary)]">
                  {tag.count} {tag.count === 1 ? "manga" : "mangas"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-[var(--text-secondary)] text-sm">No tags aggregated in the selected pool.</div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsPage;
