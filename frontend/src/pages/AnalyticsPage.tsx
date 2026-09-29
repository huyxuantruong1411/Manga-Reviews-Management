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

interface TimelineDateRange {
  earliest_added_at: string | null;
  latest_added_at: string | null;
  earliest_review: string | null;
  latest_review: string | null;
  earliest_completed: string | null;
  latest_completed: string | null;
}

const RADIAN = Math.PI / 180;

const renderCustomPieLabel = ({
  cx,
  cy,
  midAngle,
  outerRadius,
  percent
}: any) => {
  const pct = typeof percent === "number" ? percent : 0;
  if (pct < 0.015) return null;

  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + outerRadius * cos;
  const sy = cy + outerRadius * sin;
  const mx = cx + (outerRadius + 8) * cos;
  const my = cy + (outerRadius + 8) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 12;
  const ey = my;
  const textAnchor = cos >= 0 ? "start" : "end";

  return (
    <g className="pie-percent-label">
      {/* Connector line */}
      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
        stroke="var(--text-secondary)"
        strokeWidth={1}
        fill="none"
        opacity={0.5}
      />
      {/* Dot at start of line */}
      <circle cx={sx} cy={sy} r={2} fill="var(--text-secondary)" opacity={0.5} />
      {/* Percentage text */}
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 4}
        y={ey}
        dy={4}
        textAnchor={textAnchor}
        fill="var(--text-primary)"
        className="text-[10px] font-bold"
      >
        {`${(pct * 100).toFixed(1)}%`}
      </text>
    </g>
  );
};

const getReadStatusColor = (name: string): string => {
  const map: Record<string, string> = {
    unread: "#9CA3AF",
    reading: "#3B82F6",
    completed: "#10B981",
    dropped: "#EF4444",
    on_hold: "#F59E0B",
    plan_to_read: "#A855F7",
    re_reading: "#EC4899"
  };
  const key = name.toLowerCase().replace(/ /g, "_").replace(/-/g, "_");
  return map[key] || "#9CA3AF";
};

interface DeferredChartsWrapperProps {
  children: React.ReactNode;
  delay?: number;
}

const DeferredChartsWrapper: React.FC<DeferredChartsWrapperProps> = ({ children, delay = 300 }) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!isReady) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3 w-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-orange)]"></div>
        <span className="text-xs text-[var(--text-secondary)] font-medium animate-pulse">
          Analyzing distributions and rendering visualizations...
        </span>
      </div>
    );
  }

  return <>{children}</>;
};

export const AnalyticsPage: React.FC = () => {
  // Library All Tags
  const [allTags, setAllTags] = useState<Tag[]>([]);

  // Filter States
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedReadStatuses, setSelectedReadStatuses] = useState<string[]>([]);
  const [excludeReadStatuses, setExcludeReadStatuses] = useState<string[]>([]);
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
  const [completedStartDate, setCompletedStartDate] = useState("");
  const [completedEndDate, setCompletedEndDate] = useState("");

  // Timeline Range Control states
  const [timelineLookback, setTimelineLookback] = useState<number | "all">(30);
  const [timelineGroupSize, setTimelineGroupSize] = useState<number>(1);
  const [showAllTimelineData, setShowAllTimelineData] = useState(false);
  const [timelineDateRange, setTimelineDateRange] = useState<TimelineDateRange | null>(null);

  // UI States
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);

  // Tag Detailed Analytics state
  const [showAllTagDetails, setShowAllTagDetails] = useState(false);
  const [tagDetails, setTagDetails] = useState<any[]>([]);
  const [tagDetailsLoading, setTagDetailsLoading] = useState(false);
  const [tagDetailsSearch, setTagDetailsSearch] = useState("");
  const [expandedTagId, setExpandedTagId] = useState<string | null>(null);

  // Creator Detailed Analytics state
  const [showAllCreators, setShowAllCreators] = useState(false);
  const [creatorsDetails, setCreatorsDetails] = useState<{ authors: any[]; artists: any[] }>({ authors: [], artists: [] });
  const [creatorsDetailsLoading, setCreatorsDetailsLoading] = useState(false);
  const [creatorTab, setCreatorTab] = useState<"authors" | "artists">("authors");
  const [creatorSearch, setCreatorSearch] = useState("");
  const [expandedCreatorId, setExpandedCreatorId] = useState<string | null>(null);


  // Analytics API Data States
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [scoreDist, setScoreDist] = useState<ScoreDist[]>([]);
  const [topTags, setTopTags] = useState<TopTag[]>([]);
  const [mangaTimeline, setMangaTimeline] = useState<TimelineItem[]>([]);
  const [reviewTimeline, setReviewTimeline] = useState<TimelineItem[]>([]);
  const [completedTimeline, setCompletedTimeline] = useState<TimelineItem[]>([]);
  const [metadataDists, setMetadataDists] = useState<MetadataDistributions | null>(null);
  const [topCreators, setTopCreators] = useState<TopCreators | null>(null);
  const [ratingInsights, setRatingInsights] = useState<RatingInsights | null>(null);

  // Today's date string for date picker max
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

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
  const [showPercentages, setShowPercentages] = useState(true);
  const [useCustomRanges, setUseCustomRanges] = useState(false);
  const [customRangeInput, setCustomRangeInput] = useState("");
  const [zoomStartYear, setZoomStartYear] = useState<number | "">("");
  const [zoomEndYear, setZoomEndYear] = useState<number | "">("");

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
    
    let rawData = yearDist.data;
    if (zoomStartYear !== "") {
      rawData = rawData.filter(item => {
        const y = parseInt(item.year, 10);
        return isNaN(y) || y >= zoomStartYear;
      });
    }
    if (zoomEndYear !== "") {
      rawData = rawData.filter(item => {
        const y = parseInt(item.year, 10);
        return isNaN(y) || y <= zoomEndYear;
      });
    }
    
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
  }, [yearDist, useCustomRanges, rangeValidation, zoomStartYear, zoomEndYear]);

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
      const clampedStart = Math.max(y, min);
      const endYear = Math.min(y + 9, max);
      if (clampedStart <= endYear) {
        decadeRanges.push(`${clampedStart}-${endYear}`);
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
      const clampedStart = Math.max(y, min);
      const endYear = Math.min(y + 4, max);
      if (clampedStart <= endYear) {
        fiveYearRanges.push(`${clampedStart}-${endYear}`);
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
      const clamp2000 = Math.max(2000, min);
      if (clamp2000 <= 2009 && max >= clamp2000) post2000Ranges.push(`${clamp2000}-${Math.min(2009, max)}`);
      if (min <= 2010 && max >= 2010) post2000Ranges.push(`${Math.max(2010, min)}-${Math.min(2019, max)}`);
      if (max >= 2020) post2000Ranges.push(`${Math.max(2020, min)}-${max}`);
      if (post2000Ranges.length > 0) {
        list.push({
          name: "Classic vs Modern (2000 Split)",
          value: post2000Ranges.join(", ")
        });
      }
    }

    // Simple 2-Half Split
    const midPoint = Math.floor((min + max) / 2);
    list.push({
      name: "Equal Split (2 Bins)",
      value: `${min}-${midPoint}, ${midPoint + 1}-${max}`
    });
    
    return list;
  }, [yearDist]);

  // ── Timeline range helpers ──

  /** Compute max available units from earliest date to now */
  const computeMaxUnits = (earliest: string | null, unit: string): number => {
    if (!earliest) return 0;
    const now = new Date();
    const start = new Date(earliest);
    const diffMs = now.getTime() - start.getTime();
    if (diffMs <= 0) return 0;
    switch (unit) {
      case "hour":   return Math.floor(diffMs / (1000 * 60 * 60));
      case "day":    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
      case "week":   return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
      case "month": {
        const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
        return Math.max(0, months);
      }
      case "year": {
        return Math.max(0, now.getFullYear() - start.getFullYear());
      }
      default: return 0;
    }
  };

  /** Get the overall earliest date across all 3 chart types */
  const overallEarliest = useMemo(() => {
    if (!timelineDateRange) return null;
    const dates = [
      timelineDateRange.earliest_added_at,
      timelineDateRange.earliest_review,
      timelineDateRange.earliest_completed
    ].filter(Boolean) as string[];
    if (dates.length === 0) return null;
    return dates.sort()[0]; // ISO string sort = chronological
  }, [timelineDateRange]);

  /** Max available lookback in current time unit */
  const maxLookbackUnits = useMemo(() => {
    return computeMaxUnits(overallEarliest, timelineGroupBy);
  }, [overallEarliest, timelineGroupBy]);

  /** Auto-validated lookback presets for current time unit */
  const lookbackPresets = useMemo(() => {
    const presetMap: Record<string, number[]> = {
      hour:  [6, 12, 24, 36, 48, 72],
      day:   [7, 14, 30, 60, 90],
      week:  [4, 8, 12, 24, 52],
      month: [3, 6, 12, 24, 36],
      year:  [1, 2, 3, 5, 10]
    };
    const candidates = presetMap[timelineGroupBy] || [];
    return candidates.filter(n => n <= maxLookbackUnits);
  }, [timelineGroupBy, maxLookbackUnits]);

  /** Auto-set smart default when groupBy or data changes */
  useEffect(() => {
    if (maxLookbackUnits <= 30) {
      setShowAllTimelineData(true);
      setTimelineLookback("all");
    } else {
      setShowAllTimelineData(false);
      setTimelineLookback(30);
    }
    setTimelineGroupSize(1);
  }, [timelineGroupBy, maxLookbackUnits]);

  /** Compute cutoff period string for filtering timeline data */
  const getCutoffPeriod = (lookback: number, unit: string): string => {
    const now = new Date();
    switch (unit) {
      case "hour": {
        const d = new Date(now.getTime() - lookback * 60 * 60 * 1000);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:00`;
      }
      case "day": {
        const d = new Date(now.getTime() - lookback * 24 * 60 * 60 * 1000);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      }
      case "week": {
        // ISO week format: subtract weeks from now, return YYYY-Www
        const d = new Date(now.getTime() - lookback * 7 * 24 * 60 * 60 * 1000);
        // Compute ISO week number
        const jan4 = new Date(d.getFullYear(), 0, 4);
        const dayOfYear = Math.round((d.getTime() - jan4.getTime()) / (24 * 60 * 60 * 1000)) + jan4.getDay();
        const weekNum = Math.ceil(dayOfYear / 7);
        return `${d.getFullYear()}-W${String(Math.max(1, weekNum)).padStart(2, "0")}`;
      }
      case "month": {
        const d = new Date(now.getFullYear(), now.getMonth() - lookback, 1);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      }
      case "year": {
        return `${now.getFullYear() - lookback}`;
      }
      default: return "";
    }
  };

  /** Slice timeline data by lookback window */
  const sliceTimeline = (data: TimelineItem[], lookback: number | "all", unit: string): TimelineItem[] => {
    if (lookback === "all" || !data.length) return data;
    const cutoff = getCutoffPeriod(lookback, unit);
    return data.filter(item => item.period >= cutoff);
  };

  /** Group/bucket consecutive timeline items */
  const groupTimeline = (data: TimelineItem[], groupSize: number): TimelineItem[] => {
    if (groupSize <= 1 || !data.length) return data;
    const result: TimelineItem[] = [];
    for (let i = 0; i < data.length; i += groupSize) {
      const chunk = data.slice(i, i + groupSize);
      const totalCount = chunk.reduce((sum, item) => sum + item.count, 0);
      const label = chunk.length === 1
        ? chunk[0].period
        : `${chunk[0].period} — ${chunk[chunk.length - 1].period}`;
      result.push({ period: label, count: totalCount });
    }
    return result;
  };

  /** Effective lookback value */
  const effectiveLookback = showAllTimelineData ? "all" : timelineLookback;

  /** Processed timeline data for each chart */
  const processedMangaTimeline = useMemo(
    () => groupTimeline(sliceTimeline(mangaTimeline, effectiveLookback, timelineGroupBy), timelineGroupSize),
    [mangaTimeline, effectiveLookback, timelineGroupBy, timelineGroupSize]
  );
  const processedReviewTimeline = useMemo(
    () => groupTimeline(sliceTimeline(reviewTimeline, effectiveLookback, timelineGroupBy), timelineGroupSize),
    [reviewTimeline, effectiveLookback, timelineGroupBy, timelineGroupSize]
  );
  const processedCompletedTimeline = useMemo(
    () => groupTimeline(sliceTimeline(completedTimeline, effectiveLookback, timelineGroupBy), timelineGroupSize),
    [completedTimeline, effectiveLookback, timelineGroupBy, timelineGroupSize]
  );

  /** Date picker min values per chart */
  const datePickerMins = useMemo(() => {
    if (!timelineDateRange) return { added: "", review: "", completed: "" };
    const toDateStr = (iso: string | null) => iso ? iso.split("T")[0] : "";
    return {
      added: toDateStr(timelineDateRange.earliest_added_at),
      review: toDateStr(timelineDateRange.earliest_review),
      completed: toDateStr(timelineDateRange.earliest_completed)
    };
  }, [timelineDateRange]);

  /** Lookback validation */
  const lookbackValidation = useMemo(() => {
    if (showAllTimelineData || timelineLookback === "all") return { valid: true, error: "" };
    if (typeof timelineLookback === "number") {
      if (timelineLookback <= 0) return { valid: false, error: "Lookback must be at least 1." };
      if (timelineLookback > maxLookbackUnits && maxLookbackUnits > 0) {
        return { valid: false, error: `Max available: ${maxLookbackUnits} ${timelineGroupBy}(s).` };
      }
    }
    return { valid: true, error: "" };
  }, [showAllTimelineData, timelineLookback, maxLookbackUnits, timelineGroupBy]);

  /** Group size validation */
  const groupSizeValidation = useMemo(() => {
    if (timelineGroupSize <= 0) return { valid: false, error: "Group size must be at least 1." };
    const effectiveCount = effectiveLookback === "all" ? maxLookbackUnits : (typeof effectiveLookback === "number" ? effectiveLookback : 0);
    if (effectiveCount > 0 && timelineGroupSize > effectiveCount) {
      return { valid: false, error: `Group size cannot exceed lookback (${effectiveCount}).` };
    }
    return { valid: true, error: "" };
  }, [timelineGroupSize, effectiveLookback, maxLookbackUnits]);

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
      if (selectedReadStatuses.length > 0) params.read_statuses = selectedReadStatuses;
      if (excludeReadStatuses.length > 0) params.exclude_read_statuses = excludeReadStatuses;
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
      if (completedStartDate) params.completed_start_date = completedStartDate;
      if (completedEndDate) params.completed_end_date = completedEndDate;

      const res = await client.get("/api/analytics", { params });

      setOverview(res.data.overview);
      setScoreDist(res.data.score_distribution);
      setTopTags(res.data.top_tags);
      setMangaTimeline(res.data.manga_timeline);
      setReviewTimeline(res.data.review_timeline);
      setCompletedTimeline(res.data.completed_timeline || []);
      setMetadataDists(res.data.metadata_distributions);
      setTopCreators(res.data.top_creators);
      setRatingInsights(res.data.rating_insights);
      setYearDist(res.data.year_distribution);
      setTimelineDateRange(res.data.timeline_date_range || null);
    } catch (err) {
      console.error("Error loading library analytics:", err);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [
    debouncedSearch,
    selectedReadStatuses,
    excludeReadStatuses,
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
    reviewEndDate,
    completedStartDate,
    completedEndDate
  ]);

  // Fetch detailed tag analytics
  const fetchTagDetails = async () => {
    try {
      setTagDetailsLoading(true);
      const params: any = {};
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (selectedReadStatuses.length > 0) params.read_statuses = selectedReadStatuses;
      if (excludeReadStatuses.length > 0) params.exclude_read_statuses = excludeReadStatuses;
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

      const res = await client.get("/api/analytics/tags-details", { params });
      setTagDetails(res.data);
    } catch (err) {
      console.error("Error loading tag details:", err);
    } finally {
      setTagDetailsLoading(false);
    }
  };

  // Fetch detailed creator analytics
  const fetchCreatorDetails = async () => {
    try {
      setCreatorsDetailsLoading(true);
      const params: any = {};
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (selectedReadStatuses.length > 0) params.read_statuses = selectedReadStatuses;
      if (excludeReadStatuses.length > 0) params.exclude_read_statuses = excludeReadStatuses;
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

      const res = await client.get("/api/analytics/creators-details", { params });
      setCreatorsDetails(res.data);
    } catch (err) {
      console.error("Error loading creator details:", err);
    } finally {
      setCreatorsDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (showAllTagDetails) {
      fetchTagDetails();
    }
  }, [
    showAllTagDetails,
    debouncedSearch,
    selectedReadStatuses,
    excludeReadStatuses,
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
    yearEnd
  ]);

  useEffect(() => {
    if (showAllCreators) {
      fetchCreatorDetails();
    }
  }, [
    showAllCreators,
    debouncedSearch,
    selectedReadStatuses,
    excludeReadStatuses,
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
    yearEnd
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
    <div className={`max-w-6xl mx-auto space-y-8 pb-24 ${showPercentages ? "" : "hide-pie-labels"}`}>
      <style>{`
        .pie-percent-label {
          transition: opacity 0.15s ease-in-out, transform 0.15s ease-in-out;
          opacity: 1;
          pointer-events: auto;
        }
        .hide-pie-labels .pie-percent-label {
          opacity: 0;
          pointer-events: none;
        }
      `}</style>
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

        <div className="flex items-center gap-3">
          <label className="flex items-center space-x-2 cursor-pointer bg-[var(--bg-card)] px-4 py-2 border border-[var(--border-primary)] rounded-xl font-bold text-xs shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition select-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={showPercentages}
              onChange={(e) => setShowPercentages(e.target.checked)}
              className="rounded border-[var(--border-primary)] text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] h-4 w-4 bg-[var(--bg-primary)]"
            />
            <span>Show Pie Percentages</span>
          </label>

          <button
            onClick={fetchAnalytics}
            className="px-4 py-2 bg-[var(--bg-card)] hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-[var(--border-primary)] rounded-xl font-bold text-xs flex items-center space-x-2 transition shadow-sm"
          >
            <RefreshCw size={14} />
            <span>Refresh Analytics</span>
          </button>
        </div>
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
            <button
              type="button"
              onClick={() => {
                setIsAdvancedFiltersOpen(true);
              }}
              className="px-4 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] font-semibold hover:border-zinc-400 transition text-sm"
            >
              Statuses: {selectedReadStatuses.length > 0 || excludeReadStatuses.length > 0
                ? `${selectedReadStatuses.length} incl / ${excludeReadStatuses.length} excl`
                : "All"}
            </button>

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
                    { code: "en", label: "English (en)" },
                    { code: "vi", label: "Vietnamese (vi)" },
                    { code: "ru", label: "Russian (ru)" }
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

            {/* Read Status Filter Matrix */}
            <div className="pt-4 border-t border-[var(--border-primary)] space-y-3">
              <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center space-x-1">
                <Filter size={14} />
                <span>Filter by Read Status (3-State Matrix):</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "unread", label: "Unread" },
                  { value: "reading", label: "Reading" },
                  { value: "completed", label: "Completed" },
                  { value: "dropped", label: "Dropped" },
                  { value: "on_hold", label: "On Hold" },
                  { value: "plan_to_read", label: "Plan to Read" },
                  { value: "re_reading", label: "Re-Reading" }
                ].map((status) => {
                  const isIncluded = selectedReadStatuses.includes(status.value);
                  const isExcluded = excludeReadStatuses.includes(status.value);

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
                      key={status.value}
                      type="button"
                      onClick={() => {
                        const isInc = selectedReadStatuses.includes(status.value);
                        const isExc = excludeReadStatuses.includes(status.value);

                        if (!isInc && !isExc) {
                          setSelectedReadStatuses((prev) => [...prev, status.value]);
                        } else if (isInc) {
                          setSelectedReadStatuses((prev) => prev.filter((s) => s !== status.value));
                          setExcludeReadStatuses((prev) => [...prev, status.value]);
                        } else {
                          setExcludeReadStatuses((prev) => prev.filter((s) => s !== status.value));
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center transition select-none ${btnClass}`}
                    >
                      {icon}
                      <span>{status.label}</span>
                    </button>
                  );
                })}
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
            {selectedReadStatuses.map(status => (
              <span key={status} className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md">Status: {status}</span>
            ))}
            {excludeReadStatuses.map(status => (
              <span key={status} className="bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-md line-through">Exclude: {status}</span>
            ))}
            {selectedTags.length > 0 && <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md">Include {selectedTags.length} tags</span>}
            {excludeTags.length > 0 && <span className="bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-md">Exclude {excludeTags.length} tags</span>}
            {(yearStart || yearEnd || selectedAuthors.length > 0 || selectedArtists.length > 0 || ratingMin || ratingMax || contentRatings.length > 0 || demographics.length > 0 || statuses.length > 0 || originalLanguages.length > 0) && (
              <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md">Advanced Active</span>
            )}
            {!search && selectedReadStatuses.length === 0 && excludeReadStatuses.length === 0 && selectedTags.length === 0 && excludeTags.length === 0 && !yearStart && !yearEnd && selectedAuthors.length === 0 && selectedArtists.length === 0 && !ratingMin && !ratingMax && contentRatings.length === 0 && demographics.length === 0 && statuses.length === 0 && originalLanguages.length === 0 && (
              <span className="text-zinc-400 font-medium">None (Analyzing entire library)</span>
            )}
          </div>

          <button
            onClick={() => {
              setSearch("");
              setSelectedReadStatuses([]);
              setExcludeReadStatuses([]);
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
                      color: "var(--text-primary)",
                      borderRadius: "12px",
                      fontSize: "12px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                    }}
                    itemStyle={{ color: "var(--text-primary)" }}
                    labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
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
                        innerRadius={52}
                        outerRadius={72}
                        paddingAngle={5}
                        dataKey="value"
                        label={renderCustomPieLabel}
                        labelLine={false}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-primary)",
                          color: "var(--text-primary)",
                          borderRadius: "12px",
                          fontSize: "12px"
                        }}
                        itemStyle={{ color: "var(--text-primary)" }}
                        labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center flex-wrap gap-x-4 gap-y-2 text-xs font-semibold max-h-[80px] overflow-y-auto">
                  {(() => {
                    const totalVal = pieData.reduce((sum, item) => sum + item.value, 0);
                    return pieData.map((item, idx) => {
                      const percentage = totalVal > 0 ? ((item.value / totalVal) * 100).toFixed(1) : "0.0";
                      return (
                        <div key={idx} className="flex items-center space-x-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-[var(--text-secondary)]">{item.name} ({item.value} - {percentage}%)</span>
                        </div>
                      );
                    });
                  })()}
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
                          innerRadius={52}
                          outerRadius={72}
                          paddingAngle={5}
                          dataKey="value"
                          label={renderCustomPieLabel}
                          labelLine={false}
                        >
                          {metadataDists.demographic.filter(d => d.value > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={DEMO_COLORS[entry.name] || "#6B7280"} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-primary)",
                            color: "var(--text-primary)",
                            borderRadius: "12px",
                            fontSize: "12px"
                          }}
                          itemStyle={{ color: "var(--text-primary)" }}
                          labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center flex-wrap gap-x-4 gap-y-2 text-xs font-semibold max-h-[80px] overflow-y-auto">
                    {(() => {
                      const activeDemos = metadataDists.demographic.filter(d => d.value > 0);
                      const totalVal = activeDemos.reduce((sum, item) => sum + item.value, 0);
                      return activeDemos.map((item, idx) => {
                        const percentage = totalVal > 0 ? ((item.value / totalVal) * 100).toFixed(1) : "0.0";
                        return (
                          <div key={idx} className="flex items-center space-x-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DEMO_COLORS[item.name] || "#6B7280" }} />
                            <span className="text-[var(--text-secondary)]">{item.name} ({item.value} - {percentage}%)</span>
                          </div>
                        );
                      });
                    })()}
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
                          innerRadius={52}
                          outerRadius={72}
                          paddingAngle={5}
                          dataKey="value"
                          label={renderCustomPieLabel}
                          labelLine={false}
                        >
                          {metadataDists.publishing_status.filter(d => d.value > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PUB_STATUS_COLORS[entry.name] || "#6B7280"} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-primary)",
                            color: "var(--text-primary)",
                            borderRadius: "12px",
                            fontSize: "12px"
                          }}
                          itemStyle={{ color: "var(--text-primary)" }}
                          labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center flex-wrap gap-x-4 gap-y-2 text-xs font-semibold max-h-[80px] overflow-y-auto">
                    {(() => {
                      const activePubs = metadataDists.publishing_status.filter(d => d.value > 0);
                      const totalVal = activePubs.reduce((sum, item) => sum + item.value, 0);
                      return activePubs.map((item, idx) => {
                        const percentage = totalVal > 0 ? ((item.value / totalVal) * 100).toFixed(1) : "0.0";
                        return (
                          <div key={idx} className="flex items-center space-x-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PUB_STATUS_COLORS[item.name] || "#6B7280" }} />
                            <span className="text-[var(--text-secondary)]">{item.name} ({item.value} - {percentage}%)</span>
                          </div>
                        );
                      });
                    })()}
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
                          innerRadius={52}
                          outerRadius={72}
                          paddingAngle={5}
                          dataKey="value"
                          label={renderCustomPieLabel}
                          labelLine={false}
                        >
                          {metadataDists.content_rating.filter(d => d.value > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CONTENT_RATING_COLORS[entry.name] || "#6B7280"} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--bg-card)",
                            borderColor: "var(--border-primary)",
                            color: "var(--text-primary)",
                            borderRadius: "12px",
                            fontSize: "12px"
                          }}
                          itemStyle={{ color: "var(--text-primary)" }}
                          labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center flex-wrap gap-x-4 gap-y-2 text-xs font-semibold max-h-[80px] overflow-y-auto">
                    {(() => {
                      const activeRatings = metadataDists.content_rating.filter(d => d.value > 0);
                      const totalVal = activeRatings.reduce((sum, item) => sum + item.value, 0);
                      return activeRatings.map((item, idx) => {
                        const percentage = totalVal > 0 ? ((item.value / totalVal) * 100).toFixed(1) : "0.0";
                        return (
                          <div key={idx} className="flex items-center space-x-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CONTENT_RATING_COLORS[item.name] || "#6B7280" }} />
                            <span className="text-[var(--text-secondary)]">{item.name} ({item.value} - {percentage}%)</span>
                          </div>
                        );
                      });
                    })()}
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

          {/* Zoom controls to narrow down the publication year range */}
          <div className="flex flex-wrap items-center gap-4 bg-[var(--bg-primary)]/50 border border-[var(--border-primary)] rounded-xl p-3 text-xs">
            <span className="font-extrabold uppercase tracking-wider text-[var(--text-secondary)] text-[10px]">
              Zoom Timeline:
            </span>
            
            {(() => {
              const min = yearDist.min_year ?? 1970;
              const max = yearDist.max_year ?? new Date().getFullYear();
              const years = [];
              for (let y = min; y <= max; y++) {
                years.push(y);
              }
              return (
                <>
                  <div className="flex items-center space-x-2">
                    <span className="text-[var(--text-secondary)] font-bold">Start:</span>
                    <select
                      value={zoomStartYear}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : "";
                        setZoomStartYear(val);
                      }}
                      className="px-2 py-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-primary)] text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] cursor-pointer"
                    >
                      <option value="">Min ({min})</option>
                      {years.map((y) => (
                        <option key={y} value={y} disabled={zoomEndYear !== "" && y > zoomEndYear}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[var(--text-secondary)] font-bold">End:</span>
                    <select
                      value={zoomEndYear}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value, 10) : "";
                        setZoomEndYear(val);
                      }}
                      className="px-2 py-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-primary)] text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] cursor-pointer"
                    >
                      <option value="">Max ({max})</option>
                      {years.map((y) => (
                        <option key={y} value={y} disabled={zoomStartYear !== "" && y < zoomStartYear}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              );
            })()}

            {(zoomStartYear !== "" || zoomEndYear !== "") && (
              <button
                type="button"
                onClick={() => {
                  setZoomStartYear("");
                  setZoomEndYear("");
                }}
                className="px-3 py-1 bg-[var(--bg-card)] hover:bg-[var(--bg-primary)] border border-[var(--border-primary)] hover:border-[var(--brand-orange)] text-[var(--brand-orange)] text-xs font-bold rounded-lg transition duration-200 cursor-pointer"
              >
                Reset Zoom
              </button>
            )}
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
                    itemStyle={{ color: "var(--text-primary)" }}
                    labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
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
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-5 space-y-4 shadow-sm">
          {/* Header Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Calendar size={18} className="text-[var(--brand-orange)]" />
              <h3 className="font-spartan font-bold text-sm">Timeline Configuration</h3>
              {maxLookbackUnits > 0 && (
                <span className="text-[10px] font-medium text-[var(--text-secondary)] bg-[var(--bg-primary)] px-2 py-0.5 rounded-md border border-[var(--border-primary)]">
                  Data spans ~{maxLookbackUnits} {timelineGroupBy}{maxLookbackUnits !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Timeline Grouping Option */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">Group by:</span>
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

              {/* Show All Checkbox */}
              <label className="flex items-center space-x-2 cursor-pointer text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition select-none">
                <input
                  type="checkbox"
                  checked={showAllTimelineData}
                  onChange={(e) => {
                    setShowAllTimelineData(e.target.checked);
                    if (e.target.checked) {
                      setTimelineLookback("all");
                    } else {
                      setTimelineLookback(Math.min(30, maxLookbackUnits || 30));
                    }
                  }}
                  className="rounded border-[var(--border-primary)] text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] h-4 w-4 bg-[var(--bg-primary)]"
                />
                <span>Show All Data</span>
              </label>
            </div>
          </div>

          {/* Range Controls Row — only when NOT showing all */}
          {!showAllTimelineData && (
            <div className="bg-[var(--bg-primary)]/50 border border-[var(--border-primary)] rounded-xl p-3 space-y-3">
              {/* Quick Lookback Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                  Quick Lookback:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {lookbackPresets.map((n) => {
                    const unitLabel = timelineGroupBy === "hour" ? "h" : timelineGroupBy === "day" ? "d" : timelineGroupBy === "week" ? "w" : timelineGroupBy === "month" ? "m" : "y";
                    const isActive = timelineLookback === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setTimelineLookback(n)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                          isActive
                            ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-sm"
                            : "bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--brand-orange)] hover:border-[var(--brand-orange)]"
                        }`}
                      >
                        {n}{unitLabel}
                      </button>
                    );
                  })}
                  {lookbackPresets.length === 0 && (
                    <span className="text-[10px] text-zinc-400 font-medium italic">Not enough data for presets</span>
                  )}
                </div>
              </div>

              {/* Custom Lookback & Group Size */}
              <div className="flex flex-wrap items-end gap-4">
                {/* Custom Lookback Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                    Show last
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      min={1}
                      max={maxLookbackUnits || undefined}
                      value={typeof timelineLookback === "number" ? timelineLookback : ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? 1 : parseInt(e.target.value, 10);
                        if (!isNaN(val)) setTimelineLookback(val);
                      }}
                      className="w-20 px-2 py-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-primary)] text-xs font-semibold text-center focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
                    />
                    <span className="text-xs font-bold text-[var(--text-secondary)] capitalize">{timelineGroupBy}(s)</span>
                  </div>
                  {!lookbackValidation.valid && (
                    <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1">
                      ⚠ {lookbackValidation.error}
                    </span>
                  )}
                </div>

                {/* Group Size Input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                    Group every
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      min={1}
                      max={typeof effectiveLookback === "number" ? effectiveLookback : maxLookbackUnits || undefined}
                      value={timelineGroupSize}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) setTimelineGroupSize(Math.max(1, val));
                      }}
                      className="w-20 px-2 py-1 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] text-[var(--text-primary)] text-xs font-semibold text-center focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
                    />
                    <span className="text-xs font-bold text-[var(--text-secondary)] capitalize">{timelineGroupBy}(s)</span>
                  </div>
                  {!groupSizeValidation.valid && (
                    <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1">
                      ⚠ {groupSizeValidation.error}
                    </span>
                  )}
                </div>

                {/* Quick Group Size presets */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                    Quick Group
                  </label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 6].filter(g => {
                      const eff = typeof effectiveLookback === "number" ? effectiveLookback : maxLookbackUnits;
                      return g <= eff;
                    }).map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setTimelineGroupSize(g)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                          timelineGroupSize === g
                            ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                            : "bg-[var(--bg-card)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--brand-orange)]"
                        }`}
                      >
                        {g === 1 ? "×1" : `×${g}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Timeline Charts Grid */}
        <div className="grid grid-cols-1 gap-8">
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
                  min={datePickerMins.added}
                  max={addedEndDate || todayStr}
                  className="px-2 py-0.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md focus:outline-none"
                />
                <span>-</span>
                <input
                  type="date"
                  value={addedEndDate}
                  onChange={(e) => setAddedEndDate(e.target.value)}
                  min={addedStartDate || datePickerMins.added}
                  max={todayStr}
                  className="px-2 py-0.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md focus:outline-none"
                />
              </div>
            </div>

            <div className="h-72">
              {processedMangaTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={processedMangaTimeline}>
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
                        color: "var(--text-primary)",
                        borderRadius: "12px",
                        fontSize: "12px",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                      }}
                      itemStyle={{ color: "var(--text-primary)" }}
                      labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                    />
                    <Area type="monotone" dataKey="count" stroke="var(--brand-orange)" fillOpacity={1} fill="url(#colorManga)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--text-secondary)] text-sm">No additions found in selected dates.</div>
              )}
            </div>
          </div>

          {/* Reading Progress (Completed Manga) Area Chart */}
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-lg font-bold">Reading Progress (Completed Manga)</h3>
              
              {/* Completed date range */}
              <div className="flex items-center space-x-1.5 text-xs text-[var(--text-secondary)]">
                <input
                  type="date"
                  value={completedStartDate}
                  onChange={(e) => setCompletedStartDate(e.target.value)}
                  min={datePickerMins.completed}
                  max={completedEndDate || todayStr}
                  className="px-2 py-0.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md focus:outline-none"
                />
                <span>-</span>
                <input
                  type="date"
                  value={completedEndDate}
                  onChange={(e) => setCompletedEndDate(e.target.value)}
                  min={completedStartDate || datePickerMins.completed}
                  max={todayStr}
                  className="px-2 py-0.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md focus:outline-none"
                />
              </div>
            </div>

            <div className="h-72">
              {processedCompletedTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={processedCompletedTimeline}>
                    <defs>
                      <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-primary)",
                        color: "var(--text-primary)",
                        borderRadius: "12px",
                        fontSize: "12px",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                      }}
                      itemStyle={{ color: "var(--text-primary)" }}
                      labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#10B981" fillOpacity={1} fill="url(#colorCompleted)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-[var(--text-secondary)] text-sm">No completions found in selected dates.</div>
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
                  min={datePickerMins.review}
                  max={reviewEndDate || todayStr}
                  className="px-2 py-0.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md focus:outline-none"
                />
                <span>-</span>
                <input
                  type="date"
                  value={reviewEndDate}
                  onChange={(e) => setReviewEndDate(e.target.value)}
                  min={reviewStartDate || datePickerMins.review}
                  max={todayStr}
                  className="px-2 py-0.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-md focus:outline-none"
                />
              </div>
            </div>

            <div className="h-72">
              {processedReviewTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={processedReviewTimeline}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="period" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-primary)",
                        color: "var(--text-primary)",
                        borderRadius: "12px",
                        fontSize: "12px",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                      }}
                      itemStyle={{ color: "var(--text-primary)" }}
                      labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
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

      {/* Rating averages by demographics and statuses */}
      {ratingInsights && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-6 shadow-sm">
          <h3 className="text-lg font-bold flex items-center space-x-2">
            <Award size={20} className="text-yellow-500" />
            <span>Score Averages Insights</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Demographic averages */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Avg Rating by Demographic</h4>
              {ratingInsights.demographic_ratings.length > 0 ? (
                <div className="space-y-2">
                  {ratingInsights.demographic_ratings.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-lg space-x-3">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-yellow-50 dark:bg-yellow-950/20 text-yellow-600 dark:text-yellow-400 rounded text-[10px] font-bold font-mono">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold truncate">{item.name}</span>
                      </div>
                      <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 flex items-center shrink-0">
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
                    <div key={idx} className="flex justify-between items-center p-2 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-lg space-x-3">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-yellow-50 dark:bg-yellow-950/20 text-yellow-600 dark:text-yellow-400 rounded text-[10px] font-bold font-mono">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold truncate">{item.name}</span>
                      </div>
                      <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 flex items-center shrink-0">
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
      )}

      {/* Library Creator Distributions Section */}
      {topCreators && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="text-lg font-bold flex items-center space-x-2">
              <User size={20} className="text-[var(--brand-orange)]" />
              <span>{showAllCreators ? "Library Creator Distributions Dashboard" : "Library Creator Distributions"}</span>
            </h3>

            <div className="flex flex-wrap items-center gap-4">
              {/* Show all creators toggle */}
              <button
                onClick={() => setShowAllCreators(!showAllCreators)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition duration-200 ${
                  showAllCreators
                    ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-md shadow-orange-500/20"
                    : "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {showAllCreators ? "Show Top 5 Summary" : "Show All & Analyze Distributions"}
              </button>

              {/* Search filter for creators */}
              {showAllCreators && (
                <div className="relative w-full md:w-56">
                  <Search size={14} className="absolute left-3 top-2.5 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search creators..."
                    value={creatorSearch}
                    onChange={(e) => setCreatorSearch(e.target.value)}
                    className="w-full pl-8 pr-4 py-1.5 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition"
                  />
                </div>
              )}
            </div>
          </div>

          {!showAllCreators ? (
            /* Standard top 5 summary columns side-by-side */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Authors List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Top Authors</h4>
                {topCreators.authors.length > 0 ? (
                  <div className="space-y-2">
                    {(() => {
                      const poolTotal = overview?.total_manga || 0;
                      return topCreators.authors.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-lg space-x-3">
                          <div className="flex items-center space-x-2 min-w-0">
                            <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-orange-50 dark:bg-zinc-800 text-[var(--brand-orange)] rounded text-[10px] font-bold font-mono">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-semibold truncate" title={item.name}>{item.name}</span>
                          </div>
                          <span className="text-[10px] font-bold text-[var(--text-secondary)] shrink-0">
                            {item.count} {item.count === 1 ? "title" : "titles"}
                            {poolTotal > 0 && ` (${((item.count / poolTotal) * 100).toFixed(1)}%)`}
                          </span>
                        </div>
                      ));
                    })()}
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
                    {(() => {
                      const poolTotal = overview?.total_manga || 0;
                      return topCreators.artists.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-lg space-x-3">
                          <div className="flex items-center space-x-2 min-w-0">
                            <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-orange-50 dark:bg-zinc-800 text-[var(--brand-orange)] rounded text-[10px] font-bold font-mono">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-semibold truncate" title={item.name}>{item.name}</span>
                          </div>
                          <span className="text-[10px] font-bold text-[var(--text-secondary)] shrink-0">
                            {item.count} {item.count === 1 ? "title" : "titles"}
                            {poolTotal > 0 && ` (${((item.count / poolTotal) * 100).toFixed(1)}%)`}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No creator details.</p>
                )}
              </div>
            </div>
          ) : (
            /* Show All & Analyze Distributions layout */
            creatorsDetailsLoading ? (
              <div className="flex justify-center items-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-orange)]"></div>
              </div>
            ) : (
              (() => {
                const list = creatorTab === "authors" ? creatorsDetails.authors : creatorsDetails.artists;
                const filtered = list.filter(c => c.name.toLowerCase().includes(creatorSearch.toLowerCase()));

                return (
                  <div className="space-y-4">
                    {/* Tab selection */}
                    <div className="flex space-x-2 p-1 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl w-fit">
                      <button
                        onClick={() => {
                          setCreatorTab("authors");
                          setExpandedCreatorId(null);
                        }}
                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${
                          creatorTab === "authors"
                            ? "bg-[var(--brand-orange)] text-white shadow-sm"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Authors
                      </button>
                      <button
                        onClick={() => {
                          setCreatorTab("artists");
                          setExpandedCreatorId(null);
                        }}
                        className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${
                          creatorTab === "artists"
                            ? "bg-[var(--brand-orange)] text-white shadow-sm"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        Artists
                      </button>
                    </div>

                    {filtered.length === 0 ? (
                      <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                        {list.length === 0 ? "No creators found in this pool." : "No creators match your search query."}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {filtered.map((creator) => {
                          const isExpanded = expandedCreatorId === creator.name;
                          const globalRank = list.findIndex(c => c.name === creator.name) + 1;
                          const poolTotal = overview?.total_manga || 0;

                          // Compute role labels based on roles array
                          const roleLabels = creator.roles
                            .filter((r: any) => r.value > 0)
                            .map((r: any) => `${r.name}: ${r.value}`)
                            .join(" • ");

                          return (
                            <div
                              key={creator.name}
                              className={`border rounded-2xl bg-[var(--bg-primary)] overflow-hidden transition-all duration-300 ${
                                isExpanded
                                  ? "border-[var(--brand-orange)] shadow-md shadow-orange-500/5"
                                  : "border-[var(--border-primary)] hover:border-zinc-400"
                              }`}
                            >
                              {/* Accordion header */}
                              <div
                                onClick={() => setExpandedCreatorId(isExpanded ? null : creator.name)}
                                className="flex items-center justify-between p-4 cursor-pointer select-none"
                              >
                                <div className="flex items-center space-x-3 min-w-0">
                                  <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center bg-orange-50 dark:bg-zinc-800 text-[var(--brand-orange)] rounded text-[10px] font-bold font-mono">
                                    {globalRank}
                                  </span>
                                  <span className="text-xs font-semibold truncate text-[var(--text-primary)]" title={creator.name}>
                                    {creator.name}
                                  </span>
                                  <span className="text-[10px] text-[var(--text-secondary)] font-bold shrink-0">
                                    ({creator.count} {creator.count === 1 ? "title" : "titles"})
                                    {poolTotal > 0 && ` (${((creator.count / poolTotal) * 100).toFixed(1)}%)`}
                                  </span>
                                  {roleLabels && (
                                    <span className="hidden md:inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--bg-card)] border border-[var(--border-primary)] text-[var(--text-secondary)]">
                                      {roleLabels}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center space-x-2 text-[var(--text-secondary)]">
                                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline-block">
                                    {isExpanded ? "Collapse Analysis" : "Deep Analyze"}
                                  </span>
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>
                              </div>

                              {/* Expanded panel */}
                              {isExpanded && (
                                <div className="p-6 bg-[var(--bg-card)] border-t border-[var(--border-primary)] space-y-6 animate-in fade-in slide-in-from-top-2 duration-350">
                                  <DeferredChartsWrapper>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Demographics Breakdown */}
                                    <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2">
                                      <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Demographics</span>
                                      <div className="h-44">
                                        {creator.demographics && creator.demographics.length > 0 ? (
                                          <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={creator.demographics} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                                              <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} />
                                              <XAxis type="number" allowDecimals={false} />
                                              <YAxis
                                                dataKey="name"
                                                type="category"
                                                width={120}
                                                style={{ fontSize: '10px', fontWeight: 'bold' }}
                                                tickFormatter={(name) => {
                                                  const entry = creator.demographics.find((d: any) => d.name === name);
                                                  const total = creator.demographics.reduce((sum: number, d: any) => sum + d.value, 0);
                                                  return entry && total > 0 ? `${name} (${Math.round((entry.value / total) * 100)}%)` : name;
                                                }}
                                              />
                                              <Tooltip
                                                contentStyle={{
                                                  backgroundColor: "var(--bg-card)",
                                                  borderColor: "var(--border-primary)",
                                                  color: "var(--text-primary)",
                                                  borderRadius: "12px",
                                                  fontSize: "12px"
                                                }}
                                                itemStyle={{ color: "var(--text-primary)" }}
                                                labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                                              />
                                              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                                {creator.demographics.map((entry: any, idx: number) => (
                                                  <Cell key={`cell-${idx}`} fill={DEMO_COLORS[entry.name] || "#3B82F6"} />
                                                ))}
                                              </Bar>
                                            </BarChart>
                                          </ResponsiveContainer>
                                        ) : (
                                          <div className="flex h-full items-center justify-center text-xs text-zinc-400 italic">No demographic data.</div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Content Ratings Breakdown */}
                                    <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2">
                                      <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Content Ratings</span>
                                      <div className="h-44">
                                        {creator.content_ratings && creator.content_ratings.length > 0 ? (
                                          <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={creator.content_ratings} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                                              <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} />
                                              <XAxis type="number" allowDecimals={false} />
                                              <YAxis
                                                dataKey="name"
                                                type="category"
                                                width={120}
                                                style={{ fontSize: '10px', fontWeight: 'bold' }}
                                                tickFormatter={(name) => {
                                                  const entry = creator.content_ratings.find((c: any) => c.name === name);
                                                  const total = creator.content_ratings.reduce((sum: number, c: any) => sum + c.value, 0);
                                                  return entry && total > 0 ? `${name} (${Math.round((entry.value / total) * 100)}%)` : name;
                                                }}
                                              />
                                              <Tooltip
                                                contentStyle={{
                                                  backgroundColor: "var(--bg-card)",
                                                  borderColor: "var(--border-primary)",
                                                  color: "var(--text-primary)",
                                                  borderRadius: "12px",
                                                  fontSize: "12px"
                                                }}
                                                itemStyle={{ color: "var(--text-primary)" }}
                                                labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                                              />
                                              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                                {creator.content_ratings.map((entry: any, idx: number) => (
                                                  <Cell key={`cell-${idx}`} fill={CONTENT_RATING_COLORS[entry.name] || "#10B981"} />
                                                ))}
                                              </Bar>
                                            </BarChart>
                                          </ResponsiveContainer>
                                        ) : (
                                          <div className="flex h-full items-center justify-center text-xs text-zinc-400 italic">No content rating data.</div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Read Status Breakdown */}
                                    <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2">
                                      <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Read Statuses</span>
                                      <div className="h-44">
                                        {creator.read_statuses && creator.read_statuses.length > 0 ? (
                                          <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={creator.read_statuses} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                                              <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} />
                                              <XAxis type="number" allowDecimals={false} />
                                              <YAxis
                                                dataKey="name"
                                                type="category"
                                                width={120}
                                                style={{ fontSize: '10px', fontWeight: 'bold' }}
                                                tickFormatter={(name) => {
                                                  const entry = creator.read_statuses.find((r: any) => r.name === name);
                                                  const total = creator.read_statuses.reduce((sum: number, r: any) => sum + r.value, 0);
                                                  return entry && total > 0 ? `${name} (${Math.round((entry.value / total) * 100)}%)` : name;
                                                }}
                                              />
                                              <Tooltip
                                                contentStyle={{
                                                  backgroundColor: "var(--bg-card)",
                                                  borderColor: "var(--border-primary)",
                                                  color: "var(--text-primary)",
                                                  borderRadius: "12px",
                                                  fontSize: "12px"
                                                }}
                                                itemStyle={{ color: "var(--text-primary)" }}
                                                labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                                              />
                                              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                                {creator.read_statuses.map((entry: any, idx: number) => (
                                                  <Cell key={`cell-${idx}`} fill={getReadStatusColor(entry.name)} />
                                                ))}
                                              </Bar>
                                            </BarChart>
                                          </ResponsiveContainer>
                                        ) : (
                                          <div className="flex h-full items-center justify-center text-xs text-zinc-400 italic">No read status data.</div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Top Genres / Tags Breakdown */}
                                    <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2">
                                      <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Top Genres / Tags</span>
                                      <div className="h-44">
                                        {creator.tags && creator.tags.length > 0 ? (
                                          <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={creator.tags} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                                              <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} />
                                              <XAxis type="number" allowDecimals={false} />
                                              <YAxis
                                                dataKey="name"
                                                type="category"
                                                width={130}
                                                style={{ fontSize: '10px', fontWeight: 'bold' }}
                                                tickFormatter={(name) => {
                                                  const entry = creator.tags.find((t: any) => t.name === name);
                                                  return entry && creator.count > 0 ? `${name} (${Math.round((entry.count / creator.count) * 100)}%)` : name;
                                                }}
                                              />
                                              <Tooltip
                                                contentStyle={{
                                                  backgroundColor: "var(--bg-card)",
                                                  borderColor: "var(--border-primary)",
                                                  color: "var(--text-primary)",
                                                  borderRadius: "12px",
                                                  fontSize: "12px"
                                                }}
                                                itemStyle={{ color: "var(--text-primary)" }}
                                                labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                                              />
                                              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                                {creator.tags.map((entry: any, idx: number) => (
                                                  <Cell key={`cell-${idx}`} fill={entry.color || "var(--brand-orange)"} />
                                                ))}
                                              </Bar>
                                            </BarChart>
                                          </ResponsiveContainer>
                                        ) : (
                                          <div className="flex h-full items-center justify-center text-xs text-zinc-400 italic">No tag data.</div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Personal Score Distribution (Full Width) */}
                                    <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2 md:col-span-2">
                                      <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Personal Scores (Completed)</span>
                                      <div className="h-44">
                                        {creator.ratings && creator.ratings.length > 0 ? (
                                          <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={creator.ratings} margin={{ left: 5, right: 5, top: 10, bottom: 5 }}>
                                              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                              <XAxis dataKey="score" style={{ fontSize: '10px', fontWeight: 'bold' }} />
                                              <YAxis allowDecimals={false} />
                                              <Tooltip
                                                contentStyle={{
                                                  backgroundColor: "var(--bg-card)",
                                                  borderColor: "var(--border-primary)",
                                                  color: "var(--text-primary)",
                                                  borderRadius: "12px",
                                                  fontSize: "12px"
                                                }}
                                                itemStyle={{ color: "var(--text-primary)" }}
                                                labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                                              />
                                              <Bar dataKey="count" fill="var(--brand-orange)" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                          </ResponsiveContainer>
                                        ) : (
                                          <div className="flex h-full items-center justify-center text-xs text-zinc-400 italic">No ratings on completed mangas.</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  </DeferredChartsWrapper>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()
            )
          )}
        </div>
      )}

      {/* Genres / Tags in Pool Section */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="text-lg font-bold flex items-center space-x-2">
            <TrendingUp size={20} className="text-[var(--brand-orange)]" />
            <span>{showAllTagDetails ? "Genres / Tags Analysis Dashboard" : "Top 10 Genres / Tags in Pool"}</span>
          </h3>

          <div className="flex flex-wrap items-center gap-4">
            {/* Show all tag details toggle */}
            <button
              onClick={() => setShowAllTagDetails(!showAllTagDetails)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition duration-200 ${
                showAllTagDetails
                  ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white shadow-md shadow-orange-500/20"
                  : "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {showAllTagDetails ? "Show Top 10 Summary" : "Show All & Analyze Distributions"}
            </button>

            {/* Search filter for all tags (only shown when showAllTagDetails is true) */}
            {showAllTagDetails && (
              <div className="relative w-full md:w-56">
                <Search size={14} className="absolute left-3 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search tags..."
                  value={tagDetailsSearch}
                  onChange={(e) => setTagDetailsSearch(e.target.value)}
                  className="w-full pl-8 pr-4 py-1.5 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition"
                />
              </div>
            )}
          </div>
        </div>

        {!showAllTagDetails ? (
          /* Render simple list of Top 10 tags */
          topTags.length > 0 ? (
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
          )
        ) : (
          /* Render detailed interactive tag dashboard */
          tagDetailsLoading ? (
            <div className="flex justify-center items-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-orange)]"></div>
            </div>
          ) : (
            (() => {
              const filteredTagDetails = tagDetails.filter(t =>
                t.name.toLowerCase().includes(tagDetailsSearch.toLowerCase())
              );
              
              if (filteredTagDetails.length === 0) {
                return (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    {tagDetails.length === 0 ? "No tags found in this pool." : "No tags match your search query."}
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {filteredTagDetails.map((tag) => {
                    const isExpanded = expandedTagId === tag.tag_id;
                    const tagGlobalRank = tagDetails.findIndex(t => t.tag_id === tag.tag_id) + 1;
                    return (
                      <div
                        key={tag.tag_id}
                        className={`border rounded-2xl bg-[var(--bg-primary)] overflow-hidden transition-all duration-300 ${
                          isExpanded 
                            ? "border-[var(--brand-orange)] shadow-md shadow-orange-500/5" 
                            : "border-[var(--border-primary)] hover:border-zinc-400"
                        }`}
                      >
                        {/* Tag Header Accordion Trigger */}
                        <div
                          onClick={() => setExpandedTagId(isExpanded ? null : tag.tag_id)}
                          className="flex items-center justify-between p-4 cursor-pointer select-none"
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <span className="w-6 h-6 flex-shrink-0 flex items-center justify-center bg-orange-50 dark:bg-zinc-800 text-[var(--brand-orange)] rounded-lg text-xs font-bold font-mono">
                              {tagGlobalRank}
                            </span>
                            <span
                              className="px-3 py-1 rounded-lg text-xs font-bold text-white shadow-sm"
                              style={{ backgroundColor: tag.color || "var(--brand-orange)" }}
                            >
                              {tag.name}
                            </span>
                            <span className="text-xs text-[var(--text-secondary)] font-semibold">
                              ({tag.count} {tag.count === 1 ? "title" : "titles"})
                            </span>
                          </div>
                          
                          <div className="flex items-center space-x-2 text-[var(--text-secondary)]">
                            <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline-block">
                              {isExpanded ? "Collapse Analysis" : "Deep Analyze"}
                            </span>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>

                        {/* Tag Distributions Panel */}
                        {isExpanded && (
                          <div className="p-6 bg-[var(--bg-card)] border-t border-[var(--border-primary)] space-y-6 animate-in fade-in slide-in-from-top-2 duration-350">
                            <DeferredChartsWrapper>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Demographic Chart */}
                              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2">
                                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Demographics</span>
                                <div className="h-44">
                                  {tag.demographics && tag.demographics.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={tag.demographics} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} />
                                        <XAxis type="number" allowDecimals={false} />
                                        <YAxis
                                          dataKey="name"
                                          type="category"
                                          width={120}
                                          style={{ fontSize: '10px', fontWeight: 'bold' }}
                                          tickFormatter={(name) => {
                                            const entry = tag.demographics.find((d: any) => d.name === name);
                                            const total = tag.demographics.reduce((sum: number, d: any) => sum + d.value, 0);
                                            return entry && total > 0 ? `${name} (${Math.round((entry.value / total) * 100)}%)` : name;
                                          }}
                                        />
                                        <Tooltip
                                          contentStyle={{
                                            backgroundColor: "var(--bg-card)",
                                            borderColor: "var(--border-primary)",
                                            color: "var(--text-primary)",
                                            borderRadius: "12px",
                                            fontSize: "12px"
                                          }}
                                          itemStyle={{ color: "var(--text-primary)" }}
                                          labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                                        />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                          {tag.demographics.map((entry: any, index: number) => {
                                            const demoColors: Record<string, string> = {
                                              Shounen: "#3B82F6",
                                              Seinen: "#8B5CF6",
                                              Shoujo: "#EC4899",
                                              Josei: "#F43F5E",
                                              Unknown: "#9CA3AF"
                                            };
                                            return <Cell key={`cell-${index}`} fill={demoColors[entry.name] || "#3B82F6"} />;
                                          })}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-xs text-zinc-400 italic">No demographic data.</div>
                                  )}
                                </div>
                              </div>

                              {/* Content Rating Chart */}
                              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2">
                                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Content Ratings</span>
                                <div className="h-44">
                                  {tag.content_ratings && tag.content_ratings.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={tag.content_ratings} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} />
                                        <XAxis type="number" allowDecimals={false} />
                                        <YAxis
                                          dataKey="name"
                                          type="category"
                                          width={120}
                                          style={{ fontSize: '10px', fontWeight: 'bold' }}
                                          tickFormatter={(name) => {
                                            const entry = tag.content_ratings.find((c: any) => c.name === name);
                                            const total = tag.content_ratings.reduce((sum: number, c: any) => sum + c.value, 0);
                                            return entry && total > 0 ? `${name} (${Math.round((entry.value / total) * 100)}%)` : name;
                                          }}
                                        />
                                        <Tooltip
                                          contentStyle={{
                                            backgroundColor: "var(--bg-card)",
                                            borderColor: "var(--border-primary)",
                                            color: "var(--text-primary)",
                                            borderRadius: "12px",
                                            fontSize: "12px"
                                          }}
                                          itemStyle={{ color: "var(--text-primary)" }}
                                          labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                                        />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                          {tag.content_ratings.map((entry: any, index: number) => {
                                            const ratingColors: Record<string, string> = {
                                              Safe: "#10B981",
                                              Suggestive: "#F59E0B",
                                              Erotica: "#D946EF",
                                              Pornographic: "#EF4444",
                                              Unknown: "#9CA3AF"
                                            };
                                            return <Cell key={`cell-${index}`} fill={ratingColors[entry.name] || "#10B981"} />;
                                          })}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-xs text-zinc-400 italic">No content rating data.</div>
                                  )}
                                </div>
                              </div>

                              {/* Publication Status Chart */}
                              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2">
                                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Publication Status</span>
                                <div className="h-44">
                                  {tag.statuses && tag.statuses.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={tag.statuses} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} />
                                        <XAxis type="number" allowDecimals={false} />
                                        <YAxis
                                          dataKey="name"
                                          type="category"
                                          width={120}
                                          style={{ fontSize: '10px', fontWeight: 'bold' }}
                                          tickFormatter={(name) => {
                                            const entry = tag.statuses.find((s: any) => s.name === name);
                                            const total = tag.statuses.reduce((sum: number, s: any) => sum + s.value, 0);
                                            return entry && total > 0 ? `${name} (${Math.round((entry.value / total) * 100)}%)` : name;
                                          }}
                                        />
                                        <Tooltip
                                          contentStyle={{
                                            backgroundColor: "var(--bg-card)",
                                            borderColor: "var(--border-primary)",
                                            color: "var(--text-primary)",
                                            borderRadius: "12px",
                                            fontSize: "12px"
                                          }}
                                          itemStyle={{ color: "var(--text-primary)" }}
                                          labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                                        />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                          {tag.statuses.map((entry: any, index: number) => {
                                            const statusColors: Record<string, string> = {
                                              Ongoing: "#3B82F6",
                                              Completed: "#10B981",
                                              Hiatus: "#F59E0B",
                                              Cancelled: "#EF4444",
                                              Unknown: "#9CA3AF"
                                            };
                                            return <Cell key={`cell-${index}`} fill={statusColors[entry.name] || "#3B82F6"} />;
                                          })}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-xs text-zinc-400 italic">No status data.</div>
                                  )}
                                </div>
                              </div>

                              {/* Read Statuses Chart */}
                              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2">
                                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Read Statuses</span>
                                <div className="h-44">
                                  {tag.read_statuses && tag.read_statuses.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={tag.read_statuses} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} />
                                        <XAxis type="number" allowDecimals={false} />
                                        <YAxis
                                          dataKey="name"
                                          type="category"
                                          width={120}
                                          style={{ fontSize: '10px', fontWeight: 'bold' }}
                                          tickFormatter={(name) => {
                                            const entry = tag.read_statuses.find((r: any) => r.name === name);
                                            const total = tag.read_statuses.reduce((sum: number, r: any) => sum + r.value, 0);
                                            return entry && total > 0 ? `${name} (${Math.round((entry.value / total) * 100)}%)` : name;
                                          }}
                                        />
                                        <Tooltip
                                          contentStyle={{
                                            backgroundColor: "var(--bg-card)",
                                            borderColor: "var(--border-primary)",
                                            color: "var(--text-primary)",
                                            borderRadius: "12px",
                                            fontSize: "12px"
                                          }}
                                          itemStyle={{ color: "var(--text-primary)" }}
                                          labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                                        />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                          {tag.read_statuses.map((entry: any, index: number) => {
                                            return <Cell key={`cell-${index}`} fill={getReadStatusColor(entry.name)} />;
                                          })}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-xs text-zinc-400 italic">No read status data.</div>
                                  )}
                                </div>
                              </div>

                              {/* Score Distribution Chart */}
                              <div className="bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-xl p-4 space-y-2 md:col-span-2">
                                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block">Personal Scores (Completed)</span>
                                <div className="h-44">
                                  {tag.ratings && tag.ratings.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={tag.ratings} margin={{ left: 5, right: 5, top: 10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                        <XAxis dataKey="score" style={{ fontSize: '10px', fontWeight: 'bold' }} />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip
                                          contentStyle={{
                                            backgroundColor: "var(--bg-card)",
                                            borderColor: "var(--border-primary)",
                                            color: "var(--text-primary)",
                                            borderRadius: "12px",
                                            fontSize: "12px"
                                          }}
                                          itemStyle={{ color: "var(--text-primary)" }}
                                          labelStyle={{ color: "var(--text-secondary)", fontWeight: "bold" }}
                                        />
                                        <Bar dataKey="count" fill="var(--brand-orange)" radius={[4, 4, 0, 0]} />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-xs text-zinc-400 italic">No ratings on completed mangas.</div>
                                  )}
                                </div>
                              </div>
                            </div>
                            </DeferredChartsWrapper>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )
        )}
      </div>

    </div>
  );
};

export default AnalyticsPage;
