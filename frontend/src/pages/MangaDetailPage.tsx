import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
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
  Check,
  Loader2,
  Globe,
  Layers,
  Sparkles,
  Zap,
  Clock,
} from "lucide-react";
import client from "../api/client";
import { useAlert } from "../hooks/useAlert";
import { useDownload } from "../hooks/useDownload";
import { ReviewEditor } from "../components/editor/ReviewEditor";
import { GroupedTagSelector } from "../components/ui/GroupedTagSelector";
import { useMangaBlur } from "../hooks/useMangaBlur";
import { BlurredCover } from "../components/ui/BlurredCover";
import { CreatorLiveSearchInput } from "../components/ui/CreatorLiveSearchInput";
import { CoverArtGallery } from "../components/manga/CoverArtGallery";
import { RecommendationsPanel } from "../components/manga/RecommendationsPanel";
import { ChapterStorageManager } from "../components/manga/ChapterStorageManager";
import { MangaReader } from "../components/manga/MangaReader";

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

export interface TrackerMetadataCombined {

  published_start_date?: string | null;
  published_end_date?: string | null;
  average_score?: number | null;
  popularity?: number | null;
  source?: string | null;
  format?: string | null;
}

export interface AniListMetadata {
  id?: number;
  title?: { romaji?: string; english?: string; native?: string };
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  average_score?: number | null;
  mean_score?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  source?: string | null;
  format?: string | null;
  genres?: string[];
  site_url?: string;
}

export interface MALMetadata {
  id?: number;
  title?: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  score?: number | null;
  score_100?: number | null;
  scored_by?: number | null;
  rank?: number | null;
  popularity?: number | null;
  members?: number | null;
  favorites?: number | null;
  type?: string | null;
  site_url?: string;
}

export interface TrackerMetadataPayload {
  fetched_at?: string;
  anilist?: AniListMetadata | null;
  myanimelist?: MALMetadata | null;
  combined?: TrackerMetadataCombined;
}

export interface Manga {
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
  published_start_date?: string | null;
  published_end_date?: string | null;
  volumes?: number | null;
  chapters?: number | null;
  tracker_metadata?: TrackerMetadataPayload | null;
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

export const ALT_TITLE_LANGUAGES = [
  { code: "vi", label: "VI (Vietnamese)" },
  { code: "ja", label: "JA (Japanese)" },
  { code: "ja-ro", label: "JA-RO (Romanized)" },
  { code: "en", label: "EN (English)" },
  { code: "ko", label: "KO (Korean)" },
  { code: "ko-ro", label: "KO-RO (Romanized)" },
  { code: "zh", label: "ZH (Chinese)" },
  { code: "zh-ro", label: "ZH-RO (Romanized)" },
  { code: "ru", label: "RU (Russian)" },
  { code: "ru-ro", label: "RU-RO (Romanized)" },
  { code: "fr", label: "FR (French)" },
  { code: "de", label: "DE (German)" },
  { code: "es", label: "ES (Spanish)" },
  { code: "it", label: "IT (Italian)" },
  { code: "pl", label: "PL (Polish)" },
  { code: "tr", label: "TR (Turkish)" },
  { code: "uk", label: "UK (Ukrainian)" },
  { code: "id", label: "ID (Indonesian)" },
  { code: "th", label: "TH (Thai)" },
  { code: "pt-br", label: "PT-BR (Portuguese)" },
];

export const ORIGINAL_LANGUAGES = [
  { code: "ja", label: "Japanese (ja) - Manga" },
  { code: "ko", label: "Korean (ko) - Manhwa" },
  { code: "zh", label: "Chinese (zh) - Manhua" },
  { code: "en", label: "English (en) - OEL / Comic" },
  { code: "vi", label: "Vietnamese (vi)" },
  { code: "ru", label: "Russian (ru)" },
  { code: "fr", label: "French (fr) - Manfra" },
  { code: "de", label: "German (de)" },
  { code: "es", label: "Spanish (es)" },
  { code: "it", label: "Italian (it)" },
  { code: "id", label: "Indonesian (id)" },
  { code: "th", label: "Thai (th)" },
  { code: "pt-br", label: "Portuguese (pt-br)" },
];

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
  
  // Pre-process: Remove empty lines between table rows.
  const rawLines = text.split("\n");
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const current = rawLines[i].trim();
    if (current === "" && i > 0 && i < rawLines.length - 1) {
      const prev = rawLines[i - 1].trim();
      const next = rawLines[i + 1].trim();
      if (prev.includes("|") && next.includes("|") && !prev.startsWith("#") && !next.startsWith("#")) {
        // Sandwich empty line between table rows - skip it!
        continue;
      }
    }
    lines.push(rawLines[i]);
  }

  const blocks: React.ReactNode[] = [];
  let currentList: string[] = [];
  let currentNumberedList: string[] = [];
  let currentTableRows: string[][] = [];

  const splitRowCells = (str: string): string[] => {
    const cells: string[] = [];
    let current = "";
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === "\\" && i + 1 < str.length && str[i + 1] === "|") {
        current += "|";
        i++;
      } else if (char === "|") {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const parseTableRow = (raw: string): string[] => {
    let str = raw.trim();
    if (str.startsWith("|")) str = str.slice(1);
    if (str.endsWith("|") && !str.endsWith("\\|")) str = str.slice(0, -1);
    return splitRowCells(str);
  };

  const isSeparatorRow = (cells: string[]): boolean => {
    if (cells.length === 0) return false;
    return cells.every((c) => /^:?-+:?$/.test(c.trim()));
  };

  const getAlignment = (cell: string): "left" | "center" | "right" => {
    const c = cell.trim();
    if (c.startsWith(":") && c.endsWith(":")) return "center";
    if (c.endsWith(":")) return "right";
    return "left";
  };

  const isTableLine = (
    rawLine: string,
    nextRawLine?: string,
    inTable: boolean = false
  ): boolean => {
    const trimmed = rawLine.trim();
    if (!trimmed) return false;

    if (/^#{1,6}\s/.test(trimmed)) return false;
    if (trimmed.startsWith("> ")) return false;
    const cleanLine = trimmed.replace(/\s+/g, "");
    if (/^(?:-[ -]*|_[ _]*|\*[ *]*)$/.test(cleanLine) && cleanLine.length >= 3 && !trimmed.includes("|")) {
      return false;
    }
    if (/^[-*]\s+/.test(trimmed) && !trimmed.startsWith("|")) return false;
    if (/^\d+\.\s+/.test(trimmed) && !trimmed.startsWith("|")) return false;

    if (!trimmed.includes("|")) return false;

    if (inTable) return true;
    if (trimmed.startsWith("|")) return true;

    if (nextRawLine) {
      const nextCells = parseTableRow(nextRawLine);
      if (nextCells.length >= 2 && isSeparatorRow(nextCells)) {
        return true;
      }
    }

    return false;
  };
  
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
    if (currentNumberedList.length > 0) {
      blocks.push(
        <ol key={`ol-list-${key}`} className="list-decimal pl-5 my-2 space-y-1">
          {currentNumberedList.map((item, idx) => (
            <li key={idx} className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {parseInlineMarkdown(item)}
            </li>
          ))}
        </ol>
      );
      currentNumberedList = [];
    }
  };

  const flushTable = (key: string | number) => {
    if (currentTableRows.length === 0) return;

    // Find delimiter/separator row (e.g. |:-|:-|)
    const separatorIdx = currentTableRows.findIndex((row) => isSeparatorRow(row));

    let headers: string[] = [];
    let dataRows: string[][] = [];
    let alignments: ("left" | "center" | "right")[] = [];

    if (separatorIdx !== -1) {
      headers = separatorIdx > 0 ? currentTableRows[0] : [];
      alignments = currentTableRows[separatorIdx].map(getAlignment);
      dataRows = currentTableRows.slice(separatorIdx + 1);
    } else {
      if (currentTableRows.length > 1) {
        headers = currentTableRows[0];
        dataRows = currentTableRows.slice(1);
      } else {
        dataRows = currentTableRows;
      }
      alignments = (headers.length > 0 ? headers : dataRows[0] || []).map(() => "left");
    }

    // Filter out separator rows and completely empty rows from dataRows
    dataRows = dataRows.filter(
      (row) => !isSeparatorRow(row) && row.some((cell) => cell.trim().length > 0)
    );

    const colCount = Math.max(
      headers.length,
      ...dataRows.map((r) => r.length),
      alignments.length,
      1
    );

    while (alignments.length < colCount) {
      alignments.push("left");
    }

    if (headers.length > 0 || dataRows.length > 0) {
      blocks.push(
        <div
          key={`table-wrapper-${key}`}
          className="overflow-x-auto my-4 rounded-xl border border-[var(--border-primary)] shadow-sm bg-[var(--bg-card)]"
        >
          <table className="min-w-full divide-y divide-[var(--border-primary)] text-sm">
            {headers.length > 0 && (
              <thead className="bg-zinc-100/70 dark:bg-zinc-800/40 border-b border-[var(--border-primary)]">
                <tr>
                  {Array.from({ length: colCount }).map((_, idx) => {
                    const header = headers[idx] || "";
                    const align = alignments[idx] || "left";
                    const alignClass =
                      align === "center"
                        ? "text-center"
                        : align === "right"
                        ? "text-right"
                        : "text-left";
                    return (
                      <th
                        key={idx}
                        className={`px-4 py-2.5 ${alignClass} text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 border-b border-[var(--border-primary)]`}
                      >
                        {parseInlineMarkdown(header.trim())}
                      </th>
                    );
                  })}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-card)]">
              {dataRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition duration-150"
                >
                  {Array.from({ length: colCount }).map((_, cellIdx) => {
                    const cell = row[cellIdx] || "";
                    const align = alignments[cellIdx] || "left";
                    const alignClass =
                      align === "center"
                        ? "text-center"
                        : align === "right"
                        ? "text-right"
                        : "text-left";
                    return (
                      <td
                        key={cellIdx}
                        className={`px-4 py-2.5 leading-relaxed text-sm ${alignClass} ${
                          cellIdx === 0
                            ? "text-[var(--text-primary)] font-bold"
                            : "text-[var(--text-secondary)] font-medium"
                        }`}
                      >
                        {parseInlineMarkdown(cell.trim())}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    currentTableRows = [];
  };

  const flushAll = (key: string | number) => {
    flushList(key);
    flushTable(key);
  };

  const parseInlineMarkdown = (line: string): React.ReactNode[] => {
    const tokenRegex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|~~.*?~~|\[.*?\]\(.*?\))/g;
    const parts = line.split(tokenRegex);
    let keyIdx = 0;

    return parts.map((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
        const content = part.slice(2, -2);
        return (
          <strong key={`bold-${keyIdx++}`} className="font-bold text-[var(--text-primary)]">
            {content}
          </strong>
        );
      } else if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
        const content = part.slice(1, -1);
        return (
          <em key={`em-${keyIdx++}`} className="italic text-[var(--text-secondary)]">
            {content}
          </em>
        );
      } else if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
        const content = part.slice(1, -1);
        return (
          <code key={`code-${keyIdx++}`} className="px-1.5 py-0.5 mx-0.5 rounded bg-zinc-200/60 dark:bg-zinc-800 text-xs font-mono text-[var(--brand-orange)]">
            {content}
          </code>
        );
      } else if (part.startsWith("~~") && part.endsWith("~~") && part.length >= 4) {
        const content = part.slice(2, -2);
        return (
          <del key={`del-${keyIdx++}`} className="line-through text-zinc-400">
            {content}
          </del>
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
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : undefined;
    const cleanLine = line.replace(/\s+/g, "");
    
    if (isTableLine(line, nextLine, currentTableRows.length > 0)) {
      flushList(i);
      currentTableRows.push(parseTableRow(line));
    } else {
      flushTable(i);
      if (/^(?:-[ -]*|_[ _]*|\*[ *]*)$/.test(cleanLine) && cleanLine.length >= 3) {
        flushList(i);
        blocks.push(<hr key={`hr-${i}`} className="my-4 border-[var(--border-primary)]" />);
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        if (currentNumberedList.length > 0) {
          blocks.push(
            <ol key={`ol-list-${i}`} className="list-decimal pl-5 my-2 space-y-1">
              {currentNumberedList.map((item, idx) => (
                <li key={idx} className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {parseInlineMarkdown(item)}
                </li>
              ))}
            </ol>
          );
          currentNumberedList = [];
        }
        currentList.push(line.substring(2));
      } else if (/^\d+\.\s+(.*)$/.test(line)) {
        if (currentList.length > 0) {
          blocks.push(
            <ul key={`list-${i}`} className="list-disc pl-5 my-2 space-y-1">
              {currentList.map((item, idx) => (
                <li key={idx} className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {parseInlineMarkdown(item)}
                </li>
              ))}
            </ul>
          );
          currentList = [];
        }
        const match = line.match(/^\d+\.\s+(.*)$/);
        if (match) {
          currentNumberedList.push(match[1]);
        }
      } else if (line.startsWith("> ")) {
        flushList(i);
        blocks.push(
          <blockquote key={`bq-${i}`} className="border-l-4 border-zinc-300 dark:border-zinc-700 pl-4 py-1 italic text-zinc-500 my-2">
            {parseInlineMarkdown(line.substring(2))}
          </blockquote>
        );
      } else if (/^(#{1,6})\s+(.*)$/.test(line)) {
        flushList(i);
        const match = line.match(/^(#{1,6})\s+(.*)$/);
        if (match) {
          const level = match[1].length;
          const content = match[2];
          let fontSize = "text-base font-bold my-3";
          if (level === 1) fontSize = "text-xl font-bold my-4";
          if (level === 2) fontSize = "text-lg font-bold my-3.5";
          const headingElement = React.createElement(
            `h${level}`,
            { key: `h-${i}`, className: `${fontSize} text-[var(--text-primary)]` },
            parseInlineMarkdown(content)
          );
          blocks.push(headingElement);
        }
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
  }
  flushAll("end");
  
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
  entity_title?: string;
  actor?: string;
  details?: any;
}

// DownloadTask interface is imported from useDownload.tsx


export const MangaDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showAlert, showToast } = useAlert();
  const { settings, shouldBlur } = useMangaBlur();
  const isRatingHidden = settings.enabled && settings.hideRating;

  // Core States
  const [manga, setManga] = useState<Manga | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomedCoverUrl, setZoomedCoverUrl] = useState<string | null>(null);

  // Sync manager integration states (tabs)
  const [activeTab, setActiveTab] = useState<"details" | "art" | "recommendations">("details");
  const [coversCount, setCoversCount] = useState<number>(0);
  const [recsCount, setRecsCount] = useState<number>(0);

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
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Expanded Metadata Edit States
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editContentRating, setEditContentRating] = useState("");
  const [editPublicationDemographic, setEditPublicationDemographic] = useState("");
  const [editOriginalLanguage, setEditOriginalLanguage] = useState("");
  const [editPublishedStartDate, setEditPublishedStartDate] = useState("");
  const [editPublishedEndDate, setEditPublishedEndDate] = useState("");
  const [editVolumes, setEditVolumes] = useState<number | "">("");
  const [editChapters, setEditChapters] = useState<number | "">("");

  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const autoResizeDescription = () => {
    if (descriptionTextareaRef.current) {
      descriptionTextareaRef.current.style.height = "auto";
      descriptionTextareaRef.current.style.height = `${Math.max(140, descriptionTextareaRef.current.scrollHeight)}px`;
    }
  };

  useEffect(() => {
    if (isEditOpen) {
      const timer = setTimeout(autoResizeDescription, 60);
      return () => clearTimeout(timer);
    }
  }, [isEditOpen, editDescription]);

  const handleOpenEdit = () => {
    if (!manga) return;
    setEditTitle(manga.title || "");
    setEditAuthor(manga.author || "");
    setEditArtist(manga.artist || "");
    setEditDescription(manga.description || "");
    setEditYear(manga.year || "");
    setEditStatus(manga.status || "");
    setEditContentRating(manga.content_rating || "");
    setEditPublicationDemographic(manga.publication_demographic || "");
    setEditOriginalLanguage(manga.original_language || "");
    setEditPublishedStartDate(manga.published_start_date || "");
    setEditPublishedEndDate(manga.published_end_date || "");
    setEditVolumes(manga.volumes ?? "");
    setEditChapters(manga.chapters ?? "");
    setEditTags(manga.tag_ids || []);
    setEditCoverFile(null);
    setEditCoverPreview(null);
    setIsEditOpen(true);
  };

  // Download Modal States
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [saveToDisk, setSaveToDisk] = useState(false);
  const [languages, setLanguages] = useState<string[]>([]);
  const [selectedLang, setSelectedLang] = useState("en");
  const [chapters, setChapters] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [customPath, setCustomPath] = useState("");

  // Reader & Storage States
  const [readingChapterId, setReadingChapterId] = useState<string | null>(null);
  const [readingPageNumber, setReadingPageNumber] = useState<number>(1);
  const [lastReadProgress, setLastReadProgress] = useState<any>(null);

  const uniqueGroups = useMemo(() => {
    const groupsMap = new Map();
    chapters.forEach((c: any) => {
      const gid = c.group_id || "no-group";
      const gname = c.group_name || "No Group";
      if (!groupsMap.has(gid)) {
        groupsMap.set(gid, gname);
      }
    });
    return Array.from(groupsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [chapters]);

  const displayedChapters = useMemo(() => {
    if (!selectedGroup) return chapters;
    return chapters.filter((c: any) => (c.group_id || "no-group") === selectedGroup);
  }, [chapters, selectedGroup]);
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

  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);

  const getTitleOptions = () => {
    if (!manga) return [];
    const options = [{
      title: manga.title,
      lang: manga.original_language || "en",
      label: manga.title,
      value: manga.title
    }];
    if (manga.alt_titles && manga.alt_titles.length > 0) {
      manga.alt_titles.forEach((alt: string) => {
        if (alt.includes("|")) {
          const parts = alt.split("|");
          const lang = parts[0];
          const val = parts.slice(1).join("|");
          if (!options.some(opt => opt.value === val)) {
            options.push({
              title: val,
              lang: lang,
              label: `${val} (${lang.toUpperCase()})`,
              value: val
            });
          }
        } else {
          if (!options.some(opt => opt.value === alt)) {
            options.push({
              title: alt,
              lang: "en",
              label: alt,
              value: alt
            });
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
    setVerifyResult(null);
  };
  const [downloading, setDownloading] = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [isOverwriteConfirmOpen, setIsOverwriteConfirmOpen] = useState(false);
  const [overwriteWarningMsg, setOverwriteWarningMsg] = useState("");

  // Path validation states
  const [verifyResult, setVerifyResult] = useState<{ exists: boolean; writable: boolean; message: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleVerifyPath = async () => {
    if (!customPath.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await client.post("/api/downloads/verify-path", { path: customPath.trim() });
      setVerifyResult(res.data);
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || "Không thể xác thực đường dẫn.";
      setVerifyResult({
        exists: false,
        writable: false,
        message: errMsg
      });
    } finally {
      setVerifying(false);
    }
  };

  // Global downloads context
  const { tasks, cancelTask: cancelGlobalTask, registerNewTask } = useDownload();
  const [dismissedTaskId, setDismissedTaskId] = useState<string | null>(null);
  const [seenActiveTaskIds, setSeenActiveTaskIds] = useState<Record<string, boolean>>({});

  // Sync active tasks seen in this session
  useEffect(() => {
    const active = tasks.filter(
      (t) => t.manga_id === id && ["pending", "downloading"].includes(t.status)
    );
    if (active.length > 0) {
      setSeenActiveTaskIds((prev) => {
        const next = { ...prev };
        active.forEach((t) => {
          next[t._id] = true;
        });
        return next;
      });
    }
  }, [tasks, id]);

  const activeTask = tasks.find((t) => {
    if (t.manga_id !== id) return false;
    if (t._id === dismissedTaskId) return false;
    if (["pending", "downloading"].includes(t.status)) return true;
    return seenActiveTaskIds[t._id] === true;
  });

  // Review states
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");
  const [isCreatingReview, setIsCreatingReview] = useState(false);
  const isSavingReviewRef = useRef(false);

  // Stepper sync states
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncSteps, setSyncSteps] = useState<{
    metadata: "pending" | "running" | "completed" | "failed";
    covers: "pending" | "running" | "completed" | "failed";
    recommendations: "pending" | "running" | "completed" | "failed";
  }>({
    metadata: "pending",
    covers: "pending",
    recommendations: "pending"
  });
  const [syncStatusMsg, setSyncStatusMsg] = useState("");
  const [syncStats, setSyncStats] = useState<{
    coversSynced: number;
    coversFailed: number;
    recsSynced: number;
  }>({
    coversSynced: 0,
    coversFailed: 0,
    recsSynced: 0
  });

  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncProgress, setSyncProgress] = useState<number>(0);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSyncLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
  };

  const fetchCounts = async (mangaDexId: string) => {
    if (!mangaDexId) return;
    try {
      const coversRes = await client.get(`/api/manga/${id}/covers`);
      setCoversCount(coversRes.data.length);
    } catch (countErr) {
      console.error("Error loading covers count:", countErr);
    }
    try {
      const recsRes = await client.get(`/api/manga/${id}/recommendations`);
      setRecsCount(recsRes.data.length);
    } catch (countErr) {
      console.error("Error loading recommendations count:", countErr);
    }
  };

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
      setEditTags(mangaRes.data.tag_ids);

      // Load reading progress
      client.get(`/api/manga/${id}/reading-progress`).then((progressRes) => {
        if (progressRes.data?.last_read_chapter_id) {
          setLastReadProgress(progressRes.data);
        }
      }).catch(() => {});

      // Load counts for covers and recommendations asynchronously (non-blocking)
      if (mangaRes.data.mangadex_id) {
        fetchCounts(mangaRes.data.mangadex_id);
      }
    } catch (err) {
      console.error("Error loading details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMangaDetails();
  }, [id]);

  // Sync details from MangaDex with real stepper progress modal
  const handleSyncMetadata = async () => {
    if (!manga?.mangadex_id) return;
    setIsSyncModalOpen(true);
    setSyncLogs([]);
    setSyncProgress(5);
    setSyncSteps({
      metadata: "running",
      covers: "pending",
      recommendations: "pending"
    });
    setSyncStatusMsg("Connecting to MangaDex API and downloading metadata...");
    addLog("Connecting to MangaDex API...");

    let progressInterval: any = null;

    try {
      // Step 1: Metadata
      addLog("Step 1: Synchronizing catalog metadata...");
      const metaRes = await client.post(`/api/manga/${manga._id}/sync`);
      setManga(metaRes.data);
      setSyncProgress(30);
      setSyncSteps(prev => ({ ...prev, metadata: "completed", covers: "running" }));
      setSyncStatusMsg("Metadata synced! Now scanning and fetching all Cover Arts...");
      addLog("Metadata updated in database successfully.");

      // Step 2: Cover Arts
      addLog("Step 2: Scanning cover art assets on MangaDex...");
      
      let coverTick = 0;
      progressInterval = setInterval(() => {
        coverTick++;
        setSyncProgress(prev => Math.min(prev + 3, 65));
        if (coverTick === 1) addLog("Resolving volume list & language locales...");
        if (coverTick === 2) addLog("Downloading cover art files...");
        if (coverTick === 3) addLog("Generating premium covers thumbnails (256px/512px)...");
        if (coverTick === 4) addLog("Saving assets to MinIO cloud storage...");
        if (coverTick === 5) addLog("Index caching in database...");
      }, 1500);

      try {
        const coverRes = await client.post(`/api/manga/${manga._id}/covers/sync`);
        if (progressInterval) clearInterval(progressInterval);
        
        setSyncStats(prev => ({
          ...prev,
          coversSynced: coverRes.data.covers_synced || 0,
          coversFailed: coverRes.data.covers_failed || 0
        }));
        setSyncProgress(70);
        setSyncSteps(prev => ({ ...prev, covers: "completed", recommendations: "running" }));
        setSyncStatusMsg(`Downloaded ${coverRes.data.covers_synced || 0} covers successfully! Now syncing recommended titles...`);
        addLog(`Step 2 complete: ${coverRes.data.covers_synced || 0} covers cached. (${coverRes.data.covers_failed || 0} failed)`);
      } catch (covErr) {
        if (progressInterval) clearInterval(progressInterval);
        console.error("Cover sync failed:", covErr);
        setSyncProgress(70);
        setSyncSteps(prev => ({ ...prev, covers: "failed", recommendations: "running" }));
        setSyncStatusMsg("Failed to sync some cover arts. Moving to recommendations sync...");
        addLog("Step 2 failure: An error occurred during cover art sync.");
      }

      // Step 3: Recommendations
      addLog("Step 3: Accessing similar titles and user recommendations...");
      let recTick = 0;
      progressInterval = setInterval(() => {
        recTick++;
        setSyncProgress(prev => Math.min(prev + 4, 95));
        if (recTick === 1) addLog("Deduplicating local system library entries...");
        if (recTick === 2) addLog("Fetching external covers from MangaDex for match list...");
        if (recTick === 3) addLog("Writing recommendations cache inside MongoDB...");
      }, 1500);

      try {
        const recRes = await client.post(`/api/manga/${manga._id}/recommendations/sync`);
        if (progressInterval) clearInterval(progressInterval);
        
        setSyncStats(prev => ({
          ...prev,
          recsSynced: recRes.data.recommendations_synced || 0
        }));
        setSyncProgress(100);
        setSyncSteps(prev => ({ ...prev, recommendations: "completed" }));
        setSyncStatusMsg("Sync complete! Cached recommendations successfully.");
        addLog(`Step 3 complete: ${recRes.data.recommendations_synced || 0} recommendations synchronized.`);
        addLog("Sync execution finished successfully!");
      } catch (recErr) {
        if (progressInterval) clearInterval(progressInterval);
        console.error("Rec sync failed:", recErr);
        setSyncProgress(100);
        setSyncSteps(prev => ({ ...prev, recommendations: "failed" }));
        setSyncStatusMsg("Failed to cache recommendations.");
        addLog("Step 3 failure: Failed to sync recommendations.");
      }

      // Reload counts and history in background
      try {
        const historyRes = await client.get(`/api/manga/${id}/history`);
        setHistory(historyRes.data);
      } catch (err) {
        console.error("Error reloading history:", err);
      }
      try {
        const coversRes = await client.get(`/api/manga/${id}/covers`);
        setCoversCount(coversRes.data.length);
      } catch (err) {
        console.error("Error reloading covers count:", err);
      }
      try {
        const recsRes = await client.get(`/api/manga/${id}/recommendations`);
        setRecsCount(recsRes.data.length);
      } catch (err) {
        console.error("Error reloading recommendations count:", err);
      }

    } catch (err) {
      if (progressInterval) clearInterval(progressInterval);
      console.error("Metadata sync failed:", err);
      setSyncSteps(prev => ({
        metadata: "failed",
        covers: prev.covers === "running" ? "failed" : prev.covers,
        recommendations: prev.recommendations === "running" ? "failed" : prev.recommendations
      }));
    }
  };

  const [enrichingTrackers, setEnrichingTrackers] = useState(false);

  const handleEnrichTrackers = async () => {
    if (!manga) return;
    try {
      setEnrichingTrackers(true);
      const res = await client.post(`/api/manga/${manga._id}/enrich-trackers?force_refresh=true`);
      setManga(res.data);
      // Reload history
      const historyRes = await client.get(`/api/manga/${id}/history`);
      setHistory(historyRes.data);
      showToast("Tracker metadata enriched successfully!", "success");
    } catch (err) {
      console.error("Failed to enrich tracker metadata:", err);
      showToast("Failed to fetch tracker metadata.", "error");
    } finally {
      setEnrichingTrackers(false);
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

  // Quick Update Status
  const handleQuickUpdateStatus = async (newStatus: string) => {
    if (!manga) return;
    try {
      const payload = {
        read_status: newStatus,
        tag_ids: manga.tag_ids,
        personal_rating: manga.personal_rating,
      };
      const formData = new FormData();
      formData.append("metadata", JSON.stringify(payload));
      
      const res = await client.put(`/api/manga/${manga._id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      
      setManga(res.data);
      // Refresh history
      const historyRes = await client.get(`/api/manga/${id}/history`);
      setHistory(historyRes.data);
      showToast("Read status updated!", "success");
    } catch (err) {
      console.error("Failed to update status:", err);
      showToast("Failed to update read status.", "error");
    }
  };

  // Quick Update Rating
  const handleQuickUpdateRating = async (newRating: number | null) => {
    if (!manga) return;
    try {
      const payload = {
        read_status: manga.read_status,
        tag_ids: manga.tag_ids,
        personal_rating: newRating,
      };
      const formData = new FormData();
      formData.append("metadata", JSON.stringify(payload));
      
      const res = await client.put(`/api/manga/${manga._id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      
      setManga((prev) => ({
        ...prev,
        ...res.data,
        cover_url: res.data.cover_url || prev?.cover_url || null,
      }));
      // Refresh history
      const historyRes = await client.get(`/api/manga/${id}/history`);
      setHistory(historyRes.data);
      showToast("Personal rating updated!", "success");
    } catch (err) {
      console.error("Failed to update rating:", err);
      showToast("Failed to update personal rating.", "error");
    }
  };

  // Save Edit Metadata
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUpdating(true);
      const payload: any = {
        title: editTitle,
        author: editAuthor,
        artist: editArtist,
        description: editDescription,
        year: editYear || null,
        status: editStatus || null,
        content_rating: editContentRating || null,
        publication_demographic: editPublicationDemographic || null,
        original_language: editOriginalLanguage || null,
        published_start_date: editPublishedStartDate || null,
        published_end_date: editPublishedEndDate || null,
        volumes: editVolumes === "" ? null : Number(editVolumes),
        chapters: editChapters === "" ? null : Number(editChapters),
        read_status: manga?.read_status || "unread",
        tag_ids: editTags,
        personal_rating: manga?.personal_rating ?? null,
      };

      const formData = new FormData();
      formData.append("metadata", JSON.stringify(payload));
      if (editCoverFile) {
        formData.append("cover", editCoverFile);
      }

      const res = await client.put(`/api/manga/${manga?._id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setManga((prev) => ({
        ...prev,
        ...res.data,
        cover_url: res.data.cover_url || prev?.cover_url || null,
      }));
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

  // Alt Titles Edit States & Handlers
  const [isEditingAltTitles, setIsEditingAltTitles] = useState(false);
  const [localAltTitles, setLocalAltTitles] = useState<string[]>([]);
  const [newAltTitle, setNewAltTitle] = useState("");
  const [newAltLang, setNewAltLang] = useState("vi");
  const [savingAltTitles, setSavingAltTitles] = useState(false);

  const handleStartEditAltTitles = () => {
    setLocalAltTitles(manga?.alt_titles || []);
    setNewAltTitle("");
    setNewAltLang("vi");
    setIsEditingAltTitles(true);
  };

  const handleAddAltTitle = () => {
    if (!newAltTitle.trim()) return;
    const item = `${newAltLang.trim().toLowerCase()}|${newAltTitle.trim()}`;
    if (!localAltTitles.includes(item)) {
      setLocalAltTitles([...localAltTitles, item]);
    }
    setNewAltTitle("");
  };

  const handleDeleteAltTitle = (index: number) => {
    setLocalAltTitles(localAltTitles.filter((_, idx) => idx !== index));
  };

  const handleSaveAltTitles = async () => {
    if (!manga) return;
    try {
      setSavingAltTitles(true);
      const payload = {
        alt_titles: localAltTitles,
      };

      const formData = new FormData();
      formData.append("metadata", JSON.stringify(payload));

      const res = await client.put(`/api/manga/${manga._id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setManga(res.data);
      setIsEditingAltTitles(false);

      // Reload history
      const historyRes = await client.get(`/api/manga/${id}/history`);
      setHistory(historyRes.data);

      showToast("Alternative titles updated successfully!", "success");
    } catch (err) {
      console.error("Failed to save alt titles:", err);
      showAlert({
        title: "Update Failed",
        message: "Failed to update alternative titles.",
        type: "error",
      });
    } finally {
      setSavingAltTitles(false);
    }
  };

  // Start Downloading
  const openDownloadModal = async () => {
    if (!manga?.mangadex_id) return;
    setIsDownloadOpen(true);
    setCustomPath("");
    setVerifyResult(null);
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
      const fetchedChapters = res.data;
      setChapters(fetchedChapters);
      setSelectedChapters([]); // Reset selections

      // Compute unique groups and select the first one by default
      const groupsMap = new Map();
      fetchedChapters.forEach((c: any) => {
        const gid = c.group_id || "no-group";
        const gname = c.group_name || "No Group";
        if (!groupsMap.has(gid)) {
          groupsMap.set(gid, gname);
        }
      });
      const uniqueGroupsList = Array.from(groupsMap.entries()).map(([id, name]) => ({ id, name }));
      if (uniqueGroupsList.length > 0) {
        setSelectedGroup(uniqueGroupsList[0].id);
      } else {
        setSelectedGroup("");
      }
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
    const allDisplayedIds = displayedChapters.map((c) => c.id);
    const allSelected = allDisplayedIds.length > 0 && allDisplayedIds.every((id) => selectedChapters.includes(id));
    
    if (allSelected) {
      setSelectedChapters((prev) => prev.filter((id) => !allDisplayedIds.includes(id)));
    } else {
      setSelectedChapters((prev) => {
        const newSelection = [...prev];
        allDisplayedIds.forEach((id) => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      });
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
        save_to_disk: saveToDisk,
        force,
      };
      if (saveToDisk && customPath.trim()) payload.download_path = customPath.trim();

      const res = await client.post(`/api/manga/${manga?._id}/download`, payload);
      showAlert({
        title: "Download Queued",
        message: "Download task successfully queued in the background!",
        type: "success",
      });
      setIsDownloadOpen(false);

      // Register task globally
      registerNewTask(res.data.task_id);
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

  const cancelActiveTask = async () => {
    if (!activeTask) return;
    const success = await cancelGlobalTask(activeTask._id);
    if (success) {
      showAlert({
        title: "Cancel Requested",
        message: "Cancellation request sent.",
        type: "info",
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
          if (isSavingReviewRef.current) return;
          isSavingReviewRef.current = true;
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
              setReviews((prev) => [res.data, ...prev.filter((r) => r._id !== res.data._id)]);
              setSelectedReview(res.data);
              setIsCreatingReview(false);
              showToast("Review saved successfully!", "success");
            }
          } catch (err) {
            showToast("Failed to save review.", "error");
          } finally {
            isSavingReviewRef.current = false;
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

  const formatLogTimestamp = (ts: string) => {
    if (!ts) return "";
    let dateStr = ts;
    if (!dateStr.endsWith("Z") && !dateStr.includes("+") && !dateStr.includes("-", 10)) {
      dateStr += "Z";
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? ts
      : d.toLocaleString(undefined, {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });
  };

  const formatHistoryValue = (field: string | undefined, val: any): string => {
    if (val === null || val === undefined) return "";
    let strVal = typeof val === "string" ? val : JSON.stringify(val);
    if (!strVal || strVal === '""' || strVal === "null" || strVal === "[]" || strVal === "{}") {
      return "(empty)";
    }

    if (field === "tag_ids") {
      const hex24Regex = /[0-9a-fA-F]{24}/g;
      const ids = strVal.match(hex24Regex);
      if (ids && ids.length > 0) {
        const names = ids.map((id) => {
          const tag = allTags.find((t) => t._id === id);
          return tag ? tag.name.en : `Tag(${id.slice(-4)})`;
        });
        return names.join(", ");
      }
    }

    if (field === "alt_titles") {
      try {
        const cleaned = strVal.replace(/'/g, '"');
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item: string) => {
              if (typeof item === "string" && item.includes("|")) {
                const [lang, ...rest] = item.split("|");
                return `[${lang.toUpperCase()}] ${rest.join("|")}`;
              }
              return item;
            })
            .join(", ");
        }
      } catch {
        const items = strVal.match(/'([^']+)'/g);
        if (items) {
          return items
            .map((s) => s.replace(/'/g, ""))
            .map((item) => {
              if (item.includes("|")) {
                const [lang, ...rest] = item.split("|");
                return `[${lang.toUpperCase()}] ${rest.join("|")}`;
              }
              return item;
            })
            .join(", ");
        }
      }
    }

    if (field === "read_status") {
      return strVal.replace(/_/g, " ").toUpperCase();
    }

    if (field === "personal_rating") {
      return strVal ? `${strVal} / 10 ★` : "None";
    }

    return strVal;
  };

  const getActionBadge = (action: string) => {
    const norm = (action || "").toLowerCase();
    if (norm.includes("create") && norm.includes("review")) {
      return { label: "Review Added", bg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" };
    }
    if (norm.includes("update") && norm.includes("review")) {
      return { label: "Review Updated", bg: "bg-blue-500/10 text-blue-500 border-blue-500/20" };
    }
    if (norm.includes("delete") && norm.includes("review")) {
      return { label: "Review Deleted", bg: "bg-red-500/10 text-red-500 border-red-500/20" };
    }
    if (norm === "create") {
      return { label: "Manga Created", bg: "bg-green-500/10 text-green-500 border-green-500/20" };
    }
    if (norm.includes("status")) {
      return { label: "Status Updated", bg: "bg-purple-500/10 text-purple-500 border-purple-500/20" };
    }
    if (norm.includes("rating")) {
      return { label: "Rating Updated", bg: "bg-amber-500/10 text-amber-500 border-amber-500/20" };
    }
    if (norm.includes("metadata")) {
      return { label: "Metadata Updated", bg: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" };
    }
    if (norm.includes("download")) {
      return { label: "Download Completed", bg: "bg-teal-500/10 text-teal-500 border-teal-500/20" };
    }
    return { label: action.replace(/_/g, " "), bg: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" };
  };

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
        {(() => {
          const isCoverBlurred = shouldBlur(manga);
          return (
            <div 
              onClick={() => {
                if (isCoverBlurred) return;
                if (manga.cover_url) setZoomedCoverUrl(manga.cover_url);
              }}
              className={`w-48 md:w-56 aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 shadow-lg flex-shrink-0 mx-auto md:mx-0 ${manga.cover_url && !isCoverBlurred ? "cursor-zoom-in" : ""}`}
            >
              {manga.cover_url ? (
                <BlurredCover
                  src={manga.cover_url}
                  alt={manga.title}
                  className="w-full h-full object-cover"
                  shouldBlur={isCoverBlurred}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-650 text-xs">
                  <span>No Cover Image</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Metadata Details */}
        <div className="flex-1 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Read Status Interactive Select */}
              <div className="relative inline-flex items-center">
                <select
                  value={manga.read_status}
                  onChange={(e) => handleQuickUpdateStatus(e.target.value)}
                  className={`px-3 py-1 pr-8 border rounded-full text-xs font-bold uppercase cursor-pointer outline-none transition hover:brightness-95 appearance-none bg-no-repeat bg-[right_0.5rem_center] ${getReadStatusInfo(manga.read_status).badgeClass}`}
                  style={{ 
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, 
                    backgroundSize: '1.25rem' 
                  }}
                  title="Click to change read status"
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

              {/* Personal Rating Interactive Select */}
              <div className={`relative inline-flex items-center ${isRatingHidden ? "blur-[4px] pointer-events-none select-none" : ""}`}>
                <Star size={12} className="absolute left-3 text-yellow-500 fill-yellow-500 pointer-events-none" />
                <select
                  value={manga.personal_rating ?? ""}
                  onChange={(e) => {
                    const val = e.target.value === "" ? null : Number(e.target.value);
                    handleQuickUpdateRating(val);
                  }}
                  className="pl-8 pr-8 py-1 border rounded-full text-xs font-bold outline-none cursor-pointer appearance-none transition bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400 bg-no-repeat bg-[right_0.5rem_center]"
                  style={{ 
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23eab308' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, 
                    backgroundSize: '1.25rem' 
                  }}
                  title="Click to change personal rating"
                >
                  <option value="" className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">★ No Rating</option>
                  {Array.from({ length: 21 }, (_, i) => {
                    const num = 10 - i * 0.5;
                    return (
                      <option key={num} value={num} className="text-zinc-800 bg-white dark:bg-zinc-900 dark:text-zinc-200">
                        {num.toFixed(1)} / 10
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <h1 className="text-3xl md:text-4xl font-spartan font-extrabold tracking-tight leading-tight text-[var(--text-primary)]">
              {manga.title}
            </h1>

            {/* Author details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 text-sm text-[var(--text-secondary)]">
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
              <div className="flex items-center space-x-2">
                <Calendar size={16} className="text-zinc-400" />
                <span>
                  <strong>Start Date:</strong> {manga.published_start_date || "N/A"}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar size={16} className="text-zinc-400" />
                <span>
                  <strong>End Date:</strong> {manga.published_end_date || "N/A"}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <BookOpen size={16} className="text-zinc-400" />
                <span>
                  <strong>Volumes:</strong> {manga.volumes ?? "N/A"}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <BookOpen size={16} className="text-zinc-400" />
                <span>
                  <strong>Chapters:</strong> {manga.chapters ?? "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons panel */}
          <div className="flex flex-wrap gap-3 pt-4 border-t border-[var(--border-primary)]">
            <button
              onClick={handleOpenEdit}
              className="flex items-center space-x-2 px-4 py-2 border border-[var(--border-primary)] rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 font-bold text-xs transition"
            >
              <Edit2 size={14} />
              <span>Edit Review Metadata</span>
            </button>

            <button
              onClick={handleEnrichTrackers}
              disabled={enrichingTrackers}
              className="flex items-center space-x-2 px-4 py-2 border border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/5 rounded-xl hover:bg-purple-500/10 font-bold text-xs transition disabled:opacity-50"
              title="Enrich metadata (dates, scores, status) from AniList & MyAnimeList"
            >
              <RefreshCw size={14} className={enrichingTrackers ? "animate-spin" : ""} />
              <span>{enrichingTrackers ? "Fetching Trackers..." : "Enrich Trackers"}</span>
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

            {lastReadProgress?.last_read_chapter_id ? (
              <button
                onClick={() => {
                  setReadingChapterId(lastReadProgress.last_read_chapter_id);
                  setReadingPageNumber(lastReadProgress.last_read_page || 1);
                  document.getElementById("manga-reader-section")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition shadow-sm"
              >
                <BookOpen size={14} />
                <span>Đọc tiếp Ch. {lastReadProgress.last_read_chapter_number || ""} (Trang {lastReadProgress.last_read_page || 1})</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  document.getElementById("manga-storage-section")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="flex items-center space-x-2 px-4 py-2 border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold text-xs transition shadow-sm"
              >
                <BookOpen size={14} />
                <span>Đọc truyện & Storage</span>
              </button>
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

      {/* Tracker Metadata Showcase Card */}
      {manga.tracker_metadata && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse"></span>
              Tracker Intelligence (AniList & MyAnimeList)
            </h3>
            {manga.tracker_metadata.fetched_at && (
              <span className="text-[10px] text-[var(--text-secondary)] font-medium">
                Last updated: {new Date(manga.tracker_metadata.fetched_at).toLocaleString()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* AniList Score */}
            {manga.tracker_metadata.anilist?.average_score != null && (
              <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-blue-500 block">AniList Score</span>
                  <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400">
                    {manga.tracker_metadata.anilist.average_score}%
                  </span>
                </div>
                {manga.tracker_metadata.anilist.popularity != null && (
                  <span className="text-[11px] font-bold text-blue-500 bg-blue-500/20 px-2 py-1 rounded-lg">
                    {(manga.tracker_metadata.anilist.popularity / 1000).toFixed(1)}k users
                  </span>
                )}
              </div>
            )}

            {/* MAL Score */}
            {manga.tracker_metadata.myanimelist?.score != null && (
              <div className="p-3.5 bg-sky-500/10 border border-sky-500/20 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-sky-500 block">MAL Score</span>
                  <span className="text-xl font-extrabold text-sky-600 dark:text-sky-400">
                    ★ {manga.tracker_metadata.myanimelist.score}
                  </span>
                </div>
                {manga.tracker_metadata.myanimelist.rank != null && (
                  <span className="text-[11px] font-bold text-sky-500 bg-sky-500/20 px-2 py-1 rounded-lg">
                    #{manga.tracker_metadata.myanimelist.rank}
                  </span>
                )}
              </div>
            )}

            {/* Source */}
            {manga.tracker_metadata.combined?.source && (
              <div className="p-3.5 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                <span className="text-[10px] uppercase font-bold text-purple-500 block">Original Source</span>
                <span className="text-sm font-bold text-purple-600 dark:text-purple-300 capitalize">
                  {manga.tracker_metadata.combined.source.replace(/_/g, ' ')}
                </span>
              </div>
            )}

            {/* Format */}
            {manga.tracker_metadata.combined?.format && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                <span className="text-[10px] uppercase font-bold text-emerald-500 block">Format</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-300 uppercase">
                  {manga.tracker_metadata.combined.format}
                </span>
              </div>
            )}
          </div>
        </div>
      )}


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
        <div className="p-6 bg-zinc-50/90 dark:bg-zinc-900/90 backdrop-blur-md border border-[var(--border-primary)] rounded-3xl shadow-xl flex flex-col md:flex-row gap-6 items-center transition-all duration-300 relative overflow-hidden">
          {/* Animated glow accent */}
          {!["completed", "failed", "cancelled"].includes(activeTask.status) && (
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 via-coral-500 to-amber-500 animate-pulse" />
          )}

          {/* Left side: Premium Image Live Preview */}
          {!["completed", "failed", "cancelled"].includes(activeTask.status) && (
            <div className="relative w-24 h-36 rounded-2xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 border border-[var(--border-primary)] shadow-md flex-shrink-0 flex items-center justify-center group">
              {activeTask.current_page_preview ? (
                <>
                  <img
                    src={activeTask.current_page_preview}
                    alt="Page preview"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {activeTask.current_page_number && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-zinc-950/80 backdrop-blur-sm text-[10px] font-bold text-white px-2 py-0.5 rounded-full border border-white/10 whitespace-nowrap shadow">
                      Page {activeTask.current_page_number}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-2 text-zinc-400 dark:text-zinc-500 p-2 text-center">
                  <Download className="animate-bounce" size={24} />
                  <span className="text-[10px] font-bold tracking-wider uppercase animate-pulse">Waiting...</span>
                </div>
              )}
            </div>
          )}

          {/* Right side: Detailed Stats and Progress Bars */}
          <div className="flex-1 space-y-4 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h4 className="font-spartan font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--brand-orange)] animate-ping" />
                  <span>Download Active: {activeTask.status.toUpperCase()}</span>
                </h4>
                {activeTask.current_chapter_name ? (
                  <p className="text-xs text-[var(--text-secondary)] font-medium mt-1">
                    {activeTask.current_chapter_name}
                    {activeTask.current_page_number && activeTask.current_page_total && (
                      <span className="font-semibold text-[var(--brand-orange)]">
                        {" • "}Page {activeTask.current_page_number} of {activeTask.current_page_total}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400 italic mt-1">Starting download process...</p>
                )}
              </div>
              
              <div className="text-right sm:text-right flex-shrink-0">
                <span className="text-sm font-extrabold text-[var(--brand-orange)]">
                  {Math.round(activeTask.progress * 100)}%
                </span>
                <span className="text-xs font-bold text-zinc-400 block sm:inline sm:ml-1">
                  ({activeTask.completed_chapters}/{activeTask.total_chapters} chapters)
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              {/* Overall Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">
                  <span>Overall Chapter Progress</span>
                </div>
                <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden shadow-inner border border-zinc-300/10">
                  <div
                    className="bg-gradient-to-r from-orange-500 to-amber-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${activeTask.progress * 100}%` }}
                  />
                </div>
              </div>

              {/* Page-by-page progress bar (only show if currently active and page numbers are present) */}
              {!["completed", "failed", "cancelled"].includes(activeTask.status) && activeTask.current_page_number && activeTask.current_page_total && (
                <div className="space-y-1 animate-fade-in">
                  <div className="flex justify-between text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider">
                    <span>Page Progress ({activeTask.current_page_number}/{activeTask.current_page_total})</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden shadow-inner border border-zinc-300/10">
                    <div
                      className="bg-amber-400 h-full transition-all duration-200 rounded-full"
                      style={{ width: `${(activeTask.current_page_number / activeTask.current_page_total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Rich Telemetry Chips */}
              {!["completed", "failed", "cancelled"].includes(activeTask.status) && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                  {/* Speed */}
                  <div className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <Zap size={12} className="text-amber-500 shrink-0" />
                    <span>
                      {activeTask.speed_pages_per_sec != null ? `${activeTask.speed_pages_per_sec} trang/s` : "Đang tính..."}
                      {activeTask.speed_mb_per_sec != null && ` • ${activeTask.speed_mb_per_sec} MB/s`}
                    </span>
                  </div>

                  {/* Time & ETA */}
                  <div className="px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Clock size={12} className="text-emerald-500 shrink-0" />
                    <span>
                      Đã chạy: {Math.floor((activeTask.elapsed_seconds || 0) / 60).toString().padStart(2, "0")}:{Math.floor((activeTask.elapsed_seconds || 0) % 60).toString().padStart(2, "0")}
                      {activeTask.eta_seconds != null && activeTask.eta_seconds > 0 && (
                        <> • ETA ~{Math.floor(activeTask.eta_seconds / 60).toString().padStart(2, "0")}:{Math.floor(activeTask.eta_seconds % 60).toString().padStart(2, "0")}</>
                      )}
                    </span>
                  </div>

                  {/* Remaining Chapters */}
                  <div className="px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <Layers size={12} className="text-indigo-500 shrink-0" />
                    <span>
                      Còn lại: {activeTask.remaining_chapters ?? Math.max(0, activeTask.total_chapters - activeTask.completed_chapters)} chapter
                    </span>
                  </div>

                  {/* Current File */}
                  {activeTask.current_filename && (
                    <div className="px-2.5 py-1 rounded-xl bg-zinc-200/50 dark:bg-zinc-800/50 border border-[var(--border-primary)] text-zinc-500 dark:text-zinc-400 font-mono text-[10px]">
                      {activeTask.current_filename}
                    </div>
                  )}
                </div>
              )}
            </div>

            {activeTask.error_message && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertTriangle size={14} />
                <span>{activeTask.error_message}</span>
              </div>
            )}
          </div>

          {/* Action button: Cancel or Dismiss */}
          {!["completed", "failed", "cancelled"].includes(activeTask.status) ? (
            <button
              onClick={cancelActiveTask}
              className="w-full md:w-auto px-5 py-2.5 bg-zinc-100 hover:bg-red-50 dark:bg-zinc-800/60 dark:hover:bg-red-950/20 border border-zinc-200 dark:border-zinc-700 hover:border-red-500/20 text-zinc-700 dark:text-zinc-300 hover:text-red-500 dark:hover:text-red-400 font-bold text-xs rounded-xl transition duration-150 shadow-sm flex-shrink-0"
            >
              Cancel Download
            </button>
          ) : (
            <button
              onClick={() => setDismissedTaskId(activeTask._id)}
              className="w-full md:w-auto px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition duration-150 shadow-sm flex-shrink-0"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-[var(--border-primary)] space-x-6 text-sm font-semibold pt-4 mb-6">
        <button
          onClick={() => setActiveTab("details")}
          className={`pb-3 px-1 transition-all cursor-pointer ${
            activeTab === "details"
              ? "border-b-2 border-[var(--brand-orange)] text-[var(--brand-orange)] font-bold"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          Details
        </button>
        {manga.mangadex_id && (
          <>
            <button
              onClick={() => setActiveTab("art")}
              className={`pb-3 px-1 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "art"
                  ? "border-b-2 border-[var(--brand-orange)] text-[var(--brand-orange)] font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Art
              {coversCount > 0 && (
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-850 text-zinc-500">
                  {coversCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("recommendations")}
              className={`pb-3 px-1 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "recommendations"
                  ? "border-b-2 border-[var(--brand-orange)] text-[var(--brand-orange)] font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Recommendations
              {recsCount > 0 && (
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-855 text-zinc-500">
                  {recsCount}
                </span>
              )}
            </button>
          </>
        )}
      </div>

      {/* Tab Contents */}
      {activeTab === "details" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Description & Audit Timeline */}
          <div className="lg:col-span-2 space-y-8">
            {/* Alternative Titles */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">Alternative Titles</h3>
                {!isEditingAltTitles ? (
                  <button
                    onClick={handleStartEditAltTitles}
                    className="flex items-center space-x-1.5 px-3 py-1.5 border border-[var(--border-primary)] rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 font-bold text-xs transition text-[var(--text-secondary)]"
                  >
                    <Edit2 size={12} />
                    <span>Edit</span>
                  </button>
                ) : (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleSaveAltTitles}
                      disabled={savingAltTitles}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition shadow-sm"
                    >
                      {savingAltTitles ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                      <span>Save</span>
                    </button>
                    <button
                      onClick={() => setIsEditingAltTitles(false)}
                      disabled={savingAltTitles}
                      className="flex items-center space-x-1 px-3 py-1.5 border border-[var(--border-primary)] rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 font-bold text-xs transition text-[var(--text-secondary)]"
                    >
                      <X size={12} />
                      <span>Cancel</span>
                    </button>
                  </div>
                )}
              </div>

              {!isEditingAltTitles ? (
                manga.alt_titles && manga.alt_titles.length > 0 ? (
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
                ) : (
                  <div className="text-sm text-[var(--text-secondary)] italic py-2">
                    No alternative titles available. Click Edit to add titles.
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  {localAltTitles.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <tbody>
                          {localAltTitles.map((alt, idx) => {
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
                                <td className="py-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAltTitle(idx)}
                                    className="p-1 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 hover:text-red-700 rounded transition"
                                    title="Delete alternative title"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-sm text-[var(--text-secondary)] italic py-2">
                      No alternative titles. Use the form below to add.
                    </div>
                  )}

                  {/* Add new Alt Title Form */}
                  <div className="pt-3 border-t border-[var(--border-primary)]/40 flex items-center gap-3">
                    <select
                      value={newAltLang}
                      onChange={(e) => setNewAltLang(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-xs font-bold text-[var(--text-primary)] focus:outline-none cursor-pointer"
                    >
                      {ALT_TITLE_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={newAltTitle}
                      onChange={(e) => setNewAltTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddAltTitle();
                        }
                      }}
                      placeholder="Enter alternative title..."
                      className="flex-1 px-3 py-1.5 text-sm rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition"
                    />
                    <button
                      type="button"
                      onClick={handleAddAltTitle}
                      className="px-3 py-1.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold text-xs rounded-xl flex items-center space-x-1 transition shadow-sm flex-shrink-0"
                    >
                      <Plus size={12} />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

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

            {/* Manga Reader Section */}
            {readingChapterId && (
              <div id="manga-reader-section" className="scroll-mt-6">
                <MangaReader
                  mangaId={manga._id}
                  mangaTitle={manga.title}
                  initialChapterId={readingChapterId}
                  initialPageNumber={readingPageNumber}
                  onClose={() => setReadingChapterId(null)}
                  onChapterChange={(newChapId) => {
                    setReadingChapterId(newChapId);
                    client.get(`/api/manga/${manga._id}/reading-progress`).then((res) => {
                      setLastReadProgress(res.data);
                    }).catch(() => {});
                  }}
                />
              </div>
            )}

            {/* Storage & Chapter Manager Section */}
            <div id="manga-storage-section" className="scroll-mt-6">
              <ChapterStorageManager
                mangaId={manga._id}
                mangaTitle={manga.title}
                onOpenReader={(chapId, page) => {
                  setReadingChapterId(chapId);
                  setReadingPageNumber(page || 1);
                  setTimeout(() => {
                    document.getElementById("manga-reader-section")?.scrollIntoView({ behavior: "smooth" });
                  }, 100);
                }}
                onRefreshChapters={() => {
                  client.get(`/api/manga/${manga._id}/reading-progress`).then((res) => {
                    setLastReadProgress(res.data);
                  }).catch(() => {});
                }}
              />
            </div>

            {/* Audit History Timeline */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 space-y-4">
              <h3 className="text-lg font-bold flex items-center space-x-2">
                <History size={18} className="text-zinc-500" />
                <span>Review Activity History</span>
              </h3>

              {history.length > 0 ? (
                <div className="relative border-l-2 border-zinc-200 dark:border-zinc-800/80 pl-4 space-y-5 ml-2.5">
                  {history.map((log) => {
                    const badge = getActionBadge(log.action);
                    const formattedOld = formatHistoryValue(log.field, log.old_value);
                    const formattedNew = formatHistoryValue(log.field, log.new_value);
                    const hasDiff =
                      (log.old_value !== null && log.old_value !== undefined && log.old_value !== "") ||
                      (log.new_value !== null && log.new_value !== undefined && log.new_value !== "");
                    const isDiffMeaningful = hasDiff && formattedOld !== formattedNew;

                    return (
                      <div key={log._id} className="relative group">
                        {/* Circle marker */}
                        <div className="absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[var(--bg-card)] bg-[var(--brand-orange)] shadow-sm group-hover:scale-110 transition-transform" />

                        <div className="space-y-1.5 bg-zinc-500/5 dark:bg-zinc-800/20 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
                          {/* Header: Action badge & Timestamp */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${badge.bg}`}>
                                {badge.label}
                              </span>
                              {log.field && (
                                <span className="text-[11px] text-[var(--text-secondary)]">
                                  on <code className="px-1.5 py-0.5 bg-zinc-200/70 dark:bg-zinc-800 text-[var(--text-primary)] rounded font-mono text-[10px]">{log.field}</code>
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                              {formatLogTimestamp(log.timestamp)}
                            </span>
                          </div>

                          {/* Diff changes if meaningful */}
                          {isDiffMeaningful && (
                            <div className="mt-1 p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-primary)] text-[11px] font-mono flex items-center gap-2 flex-wrap">
                              <span className="text-rose-400 line-through max-w-[200px] truncate" title={formattedOld}>
                                {formattedOld || "(empty)"}
                              </span>
                              <ArrowRight size={12} className="text-zinc-400 shrink-0" />
                              <span className="text-emerald-400 font-semibold max-w-[240px] truncate" title={formattedNew}>
                                {formattedNew || "(empty)"}
                              </span>
                            </div>
                          )}

                          {/* Note / Details */}
                          {log.note && (
                            <p className="text-[11px] text-[var(--text-secondary)] pt-0.5 leading-relaxed">
                              <span className="font-semibold text-[var(--text-primary)]">Details: </span>
                              {log.note}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
      )}

      {activeTab === "art" && manga.mangadex_id && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-sm">
          <CoverArtGallery key={`${id}-${manga.updated_at}`} mangaId={id!} onCoversCountChange={setCoversCount} />
        </div>
      )}

      {activeTab === "recommendations" && manga.mangadex_id && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 shadow-sm">
          <RecommendationsPanel key={`${id}-${manga.updated_at}`} mangaId={id!} onRecommendationsCountChange={setRecsCount} />
        </div>
      )}

      {/* SYNC PROGRESS MODAL */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl w-full max-w-md p-6 space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center">
              <h3 className="text-lg font-extrabold tracking-tight text-[var(--text-primary)]">MangaDex Sync Manager</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Synchronizing files and API metadata</p>
            </div>

            {/* Stepper progress */}
            <div className="space-y-3">
              {/* Step 1 */}
              <div className="flex items-center justify-between p-3 border border-[var(--border-primary)] rounded-2xl bg-[var(--bg-primary)]">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                    syncSteps.metadata === "completed" ? "bg-green-500 text-white" :
                    syncSteps.metadata === "running" ? "bg-[var(--brand-orange)] text-white animate-pulse" :
                    syncSteps.metadata === "failed" ? "bg-red-500 text-white" :
                    "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                  }`}>
                    {syncSteps.metadata === "completed" ? <Check size={14} /> : "1"}
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-[var(--text-primary)]">Metadata & Details</span>
                    <span className="text-[10px] text-[var(--text-secondary)]">Main info, tags, and creators</span>
                  </div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  syncSteps.metadata === "completed" ? "bg-green-50 dark:bg-green-950/20 text-green-600" :
                  syncSteps.metadata === "running" ? "bg-orange-50 dark:bg-orange-950/20 text-[var(--brand-orange)]" :
                  syncSteps.metadata === "failed" ? "bg-red-50 dark:bg-red-950/20 text-red-500" :
                  "text-zinc-400"
                }`}>
                  {syncSteps.metadata}
                </span>
              </div>

              {/* Step 2 */}
              <div className="flex items-center justify-between p-3 border border-[var(--border-primary)] rounded-2xl bg-[var(--bg-primary)]">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                    syncSteps.covers === "completed" ? "bg-green-500 text-white" :
                    syncSteps.covers === "running" ? "bg-[var(--brand-orange)] text-white animate-pulse" :
                    syncSteps.covers === "failed" ? "bg-red-500 text-white" :
                    "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                  }`}>
                    {syncSteps.covers === "completed" ? <Check size={14} /> : "2"}
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-[var(--text-primary)]">Cover Art Gallery</span>
                    <span className="text-[10px] text-[var(--text-secondary)]">
                      {syncSteps.covers === "completed" ? `Downloaded ${syncStats.coversSynced} covers` : "Download all versions"}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  syncSteps.covers === "completed" ? "bg-green-50 dark:bg-green-950/20 text-green-600" :
                  syncSteps.covers === "running" ? "bg-orange-50 dark:bg-orange-950/20 text-[var(--brand-orange)]" :
                  syncSteps.covers === "failed" ? "bg-red-50 dark:bg-red-950/20 text-red-500" :
                  "text-zinc-400"
                }`}>
                  {syncSteps.covers}
                </span>
              </div>

              {/* Step 3 */}
              <div className="flex items-center justify-between p-3 border border-[var(--border-primary)] rounded-2xl bg-[var(--bg-primary)]">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                    syncSteps.recommendations === "completed" ? "bg-green-500 text-white" :
                    syncSteps.recommendations === "running" ? "bg-[var(--brand-orange)] text-white animate-pulse" :
                    syncSteps.recommendations === "failed" ? "bg-red-500 text-white" :
                    "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                  }`}>
                    {syncSteps.recommendations === "completed" ? <Check size={14} /> : "3"}
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-[var(--text-primary)]">User Recommendations</span>
                    <span className="text-[10px] text-[var(--text-secondary)]">
                      {syncSteps.recommendations === "completed" ? `Found ${syncStats.recsSynced} similar titles` : "Similar readings cache"}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  syncSteps.recommendations === "completed" ? "bg-green-50 dark:bg-green-950/20 text-green-600" :
                  syncSteps.recommendations === "running" ? "bg-orange-50 dark:bg-orange-950/20 text-[var(--brand-orange)]" :
                  syncSteps.recommendations === "failed" ? "bg-red-50 dark:bg-red-950/20 text-red-500" :
                  "text-zinc-400"
                }`}>
                  {syncSteps.recommendations}
                </span>
              </div>
            </div>

            {/* Terminal log console */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Sync Execution Logs</span>
              <div className="h-40 bg-zinc-950 text-green-400 font-mono text-[10px] p-3 rounded-2xl overflow-y-auto border border-zinc-900 space-y-1 scrollbar-thin scrollbar-thumb-zinc-850">
                {syncLogs.length === 0 ? (
                  <span className="text-zinc-500 italic">No logs generated yet...</span>
                ) : (
                  syncLogs.map((log, idx) => (
                    <div key={idx} className="leading-normal whitespace-pre-wrap">{log}</div>
                  ))
                )}
              </div>
            </div>

            {/* Overall progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-extrabold text-zinc-450 uppercase tracking-wider">
                <span>Overall Progress</span>
                <span className="text-[var(--brand-orange)]">{syncProgress}%</span>
              </div>
              <div className="w-full bg-zinc-150 dark:bg-zinc-850 h-2 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800">
                <div
                  className="bg-gradient-to-r from-orange-500 to-amber-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            </div>

            {/* Status updates */}
            <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl text-center space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--brand-orange)]">Status Feed</span>
              <p className="text-xs font-semibold text-[var(--text-primary)] leading-normal">{syncStatusMsg}</p>
            </div>

            {/* Buttons */}
            <div className="flex justify-end pt-2">
              <button
                disabled={Object.values(syncSteps).includes("running")}
                onClick={() => setIsSyncModalOpen(false)}
                className="px-6 py-2.5 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold text-xs rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
          <form
            onSubmit={handleSaveEdit}
            className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[var(--border-primary)] bg-[var(--bg-card)]/90 backdrop-blur flex justify-between items-center z-10 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold font-spartan text-[var(--text-primary)]">
                    Edit Manga & Review Metadata
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Configure core details, publishing info, synopsis, and visual assets
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                title="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Group 1: Core Manga Identity */}
              <div className="bg-zinc-500/5 dark:bg-zinc-900/40 border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-4">
                <div className="flex items-center space-x-2 text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider">
                  <BookOpen size={15} />
                  <span>General Information</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Title */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                      Manga Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Enter official manga title..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)] transition"
                    />
                  </div>

                  {/* Author */}
                  <CreatorLiveSearchInput
                    label="Author"
                    role="author"
                    value={editAuthor}
                    onChange={setEditAuthor}
                    placeholder="e.g. Oda Eiichiro"
                  />

                  {/* Artist */}
                  <CreatorLiveSearchInput
                    label="Artist"
                    role="artist"
                    value={editArtist}
                    onChange={setEditArtist}
                    placeholder="e.g. Yusuke Murata"
                  />

                  {/* Original Language (Select Dropdown) */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                      <span className="flex items-center space-x-1.5">
                        <Globe size={13} className="text-zinc-400" />
                        <span>Original Language</span>
                      </span>
                    </label>
                    <select
                      value={editOriginalLanguage}
                      onChange={(e) => setEditOriginalLanguage(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)] transition cursor-pointer"
                    >
                      <option value="">Unknown / Not Specified</option>
                      {ORIGINAL_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                      {editOriginalLanguage &&
                        !ORIGINAL_LANGUAGES.some(
                          (l) => l.code === editOriginalLanguage.toLowerCase()
                        ) && (
                          <option value={editOriginalLanguage}>
                            {editOriginalLanguage.toUpperCase()} (Custom)
                          </option>
                        )}
                    </select>
                  </div>

                  {/* Publishing Status */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                      Publishing Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)] transition cursor-pointer"
                    >
                      <option value="">Unknown</option>
                      <option value="ongoing">Ongoing</option>
                      <option value="completed">Completed</option>
                      <option value="hiatus">Hiatus</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Group 2: Description / Synopsis (Auto-resizing & Wrap) */}
              <div className="bg-zinc-500/5 dark:bg-zinc-900/40 border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider">
                    <FileText size={15} />
                    <span>Description / Synopsis</span>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-[var(--text-secondary)] font-mono">
                    <span>{editDescription.length.toLocaleString()} chars</span>
                    <span>•</span>
                    <span>
                      {editDescription.trim() ? editDescription.trim().split(/\s+/).length : 0} words
                    </span>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    ref={descriptionTextareaRef}
                    value={editDescription}
                    onChange={(e) => {
                      setEditDescription(e.target.value);
                      autoResizeDescription();
                    }}
                    onInput={autoResizeDescription}
                    rows={4}
                    placeholder="Enter detailed plot synopsis, story overview, or background notes. Text wraps and automatically expands as you type..."
                    className="w-full px-4 py-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm leading-relaxed whitespace-pre-wrap break-words resize-none focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)] transition min-h-[140px] max-h-[460px] overflow-y-auto font-sans"
                  />
                </div>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  The synopsis box automatically expands vertically to accommodate long text without cutting off paragraphs.
                </p>
              </div>

              {/* Group 3: Publication Details & Scope */}
              <div className="bg-zinc-500/5 dark:bg-zinc-900/40 border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-4">
                <div className="flex items-center space-x-2 text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider">
                  <Layers size={15} />
                  <span>Publication Details & Scope</span>
                </div>

                {/* Scope Triplet: Year, Demographic, Content Rating */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Year */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                      Publishing Year
                    </label>
                    <input
                      type="text"
                      value={editYear}
                      onChange={(e) => setEditYear(e.target.value)}
                      placeholder="e.g. 2024"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)] transition"
                    />
                  </div>

                  {/* Publication Demographic */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                      Demographic
                    </label>
                    <select
                      value={editPublicationDemographic}
                      onChange={(e) => setEditPublicationDemographic(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)] transition cursor-pointer"
                    >
                      <option value="">None</option>
                      <option value="shounen">Shounen</option>
                      <option value="shoujo">Shoujo</option>
                      <option value="seinen">Seinen</option>
                      <option value="josei">Josei</option>
                    </select>
                  </div>

                  {/* Content Rating */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                      Content Rating
                    </label>
                    <select
                      value={editContentRating}
                      onChange={(e) => setEditContentRating(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)] transition cursor-pointer"
                    >
                      <option value="">None</option>
                      <option value="safe">Safe</option>
                      <option value="suggestive">Suggestive</option>
                      <option value="erotica">Erotica</option>
                      <option value="pornographic">Pornographic</option>
                    </select>
                  </div>
                </div>

                {/* Volumes, Chapters, Start Date, End Date */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                  {/* Volumes */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                      Volumes
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editVolumes}
                      onChange={(e) => setEditVolumes(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="e.g. 12"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)] transition"
                    />
                  </div>

                  {/* Chapters */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                      Chapters
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editChapters}
                      onChange={(e) => setEditChapters(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="e.g. 104"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)] transition"
                    />
                  </div>

                  {/* Start Date */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={editPublishedStartDate}
                      onChange={(e) => setEditPublishedStartDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)] transition"
                    />
                  </div>

                  {/* End Date */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={editPublishedEndDate}
                      onChange={(e) => setEditPublishedEndDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]/40 focus:border-[var(--brand-orange)] transition"
                    />
                  </div>
                </div>
              </div>

              {/* Group 4: Custom Tag Assignment */}
              {allTags.length > 0 && (
                <div className="bg-zinc-500/5 dark:bg-zinc-900/40 border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-3">
                  <div className="flex items-center space-x-2 text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider">
                    <Sparkles size={15} />
                    <span>Tags & Taxonomy</span>
                  </div>
                  <GroupedTagSelector
                    allTags={allTags}
                    selectedTags={editTags}
                    onChange={setEditTags}
                    label="Assign Tags"
                    placeholder="Search tags to assign..."
                  />
                </div>
              )}

              {/* Group 5: Cover Artwork */}
              <div className="bg-zinc-500/5 dark:bg-zinc-900/40 border border-[var(--border-primary)] rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center space-x-2 text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider">
                  <Upload size={15} />
                  <span>Cover Artwork</span>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <label className="flex items-center space-x-2 px-4 py-2.5 border border-[var(--border-primary)] bg-[var(--bg-primary)] hover:border-[var(--brand-orange)] rounded-xl cursor-pointer transition shadow-sm">
                    <Upload size={16} className="text-[var(--brand-orange)]" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">Upload New Cover</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleEditCoverChange} />
                  </label>
                  {editCoverPreview ? (
                    <div className="flex items-center space-x-2 text-xs text-[var(--text-secondary)]">
                      <div className="w-12 h-16 rounded-lg overflow-hidden bg-zinc-100 border border-[var(--border-primary)] shadow-sm">
                        <img src={editCoverPreview} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                      <span>New cover selected</span>
                    </div>
                  ) : (
                    manga?.cover_url && (
                      <div className="flex items-center space-x-2 text-xs text-[var(--text-secondary)]">
                        <div className="w-10 h-14 rounded-lg overflow-hidden bg-zinc-100 border border-[var(--border-primary)] opacity-80">
                          <img src={manga.cover_url} alt="Current" className="w-full h-full object-cover" />
                        </div>
                        <span>Current cover active</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Sticky Modal Footer */}
            <div className="px-6 py-4 border-t border-[var(--border-primary)] bg-[var(--bg-card)]/90 backdrop-blur flex items-center justify-between shrink-0">
              <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">
                Changes will be saved and tracked in activity history.
              </span>
              <div className="flex items-center space-x-3 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 border border-[var(--border-primary)] rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-6 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  {updating && <Loader2 size={14} className="animate-spin" />}
                  <span>{updating ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
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

              {/* Group Selector */}
              {uniqueGroups.length > 1 && (
                <div className="flex items-center space-x-4 animate-in fade-in duration-200">
                  <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Select Group:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {uniqueGroups.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => {
                          setSelectedGroup(group.id);
                          setSelectedChapters([]);
                        }}
                        className={`px-3 py-1 text-xs font-bold rounded-lg border transition ${
                          selectedGroup === group.id
                            ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                            : "bg-transparent border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                        }`}
                      >
                        {group.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Storage Destination & Save to Disk Option */}
              <div className="p-4 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-xl bg-[var(--brand-orange)]/10 text-[var(--brand-orange)]">
                      <Layers size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[var(--text-primary)]">Lưu trữ System Storage (Mặc định)</div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        Hệ thống tự động lưu trữ, lập chỉ mục và quản lý để bạn có thể đọc trực tiếp bất cứ lúc nào.
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                    Sẵn sàng
                  </span>
                </div>

                <div className="pt-3 border-t border-[var(--border-primary)]">
                  <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={saveToDisk}
                      onChange={(e) => setSaveToDisk(e.target.checked)}
                      className="w-4 h-4 rounded text-[var(--brand-orange)] focus:ring-[var(--brand-orange)] cursor-pointer"
                    />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      Tải thêm một bản sao lưu ra thư mục ổ đĩa trên máy tính (Duplicate to external folder)
                    </span>
                  </label>
                </div>

                {saveToDisk && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-primary)]/70 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[var(--brand-orange)] uppercase tracking-wider flex items-center space-x-1">
                        <FolderPlus size={14} />
                        <span>Download Destination Path</span>
                      </label>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--brand-orange)]/10 text-[var(--brand-orange)] border border-[var(--brand-orange)]/15">
                        Editable Base Path
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={customPath}
                        onChange={(e) => {
                          handlePathChange(e.target.value);
                          setVerifyResult(null);
                        }}
                        placeholder="e.g. C:\Downloads\Manga"
                        className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-[var(--brand-orange)]/30 focus:border-[var(--brand-orange)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none transition shadow-sm font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyPath}
                        disabled={verifying || !customPath.trim()}
                        className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-[var(--text-primary)] shadow-sm hover:shadow transition flex items-center space-x-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                      >
                        {verifying ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        <span>Verify Path</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsTitleModalOpen(true);
                          setVerifyResult(null);
                        }}
                        title="Select and append manga title or alternative title as subfolder"
                        className="px-4 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] border border-[var(--brand-orange)] rounded-xl text-xs font-bold text-white shadow-md hover:shadow-lg transition flex items-center space-x-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Plus size={14} className="stroke-[3]" />
                        <span>Append Title</span>
                      </button>
                    </div>
                    {verifyResult && (
                      <div className={`p-3 rounded-xl text-xs font-semibold flex items-start space-x-2 border animate-in fade-in duration-200 ${
                        verifyResult.writable 
                          ? (verifyResult.exists ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400")
                          : "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
                      }`}>
                        {verifyResult.writable ? (
                          verifyResult.exists ? <Check size={14} className="shrink-0 mt-0.5" /> : <Info size={14} className="shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        )}
                        <span className="leading-relaxed">{verifyResult.message}</span>
                      </div>
                    )}
                    <div className="flex items-start space-x-1.5 text-xs text-[var(--text-secondary)]">
                      <Info size={14} className="text-[var(--brand-orange)] shrink-0 mt-0.5" />
                      <span>
                        Đường dẫn này được khởi tạo từ cấu hình mặc định. Bạn có thể chỉnh sửa trực tiếp. Nhấn <strong>Append Title</strong> để thêm tên manga vào thư mục con.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chapters List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider pb-1">
                  <span>Available Chapters ({displayedChapters.length})</span>
                  <button onClick={toggleAllChapters} className="text-[var(--brand-orange)] hover:underline">
                    {displayedChapters.length > 0 && displayedChapters.every(c => selectedChapters.includes(c.id)) ? "Deselect All" : "Select All"}
                  </button>
                </div>

                {loadingChapters ? (
                  <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-orange)]"></div>
                  </div>
                ) : displayedChapters.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto border border-[var(--border-primary)] p-3 bg-[var(--bg-primary)] rounded-xl">
                    {displayedChapters.map((chap) => {
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
                    No chapters available for this language/group.
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

      {/* Select Title to Append Popup Modal */}
      {isTitleModalOpen && (
        <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-[var(--border-primary)] pb-3">
              <div>
                <h3 className="text-lg font-spartan font-bold text-[var(--text-primary)]">
                  Select Title to Append
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Choose a title format to append to your download destination path.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTitleModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* List of Titles */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {getTitleOptions().map((opt, idx) => {
                const flag = getFlagInfo(opt.lang);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      appendCleanedTitle(opt.value);
                      setIsTitleModalOpen(false);
                    }}
                    className="w-full text-left p-3.5 border border-[var(--border-primary)] rounded-2xl flex items-start gap-3.5 hover:bg-[var(--brand-orange)]/5 hover:border-[var(--brand-orange)]/30 transition duration-150 group cursor-pointer"
                  >
                    {/* Flag and language indicator */}
                    <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                      <img
                        src={flag.flagUrl}
                        alt={flag.label}
                        className="w-6 h-4 object-cover rounded shadow-sm border border-zinc-200/20"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://flagcdn.com/w20/us.png";
                        }}
                      />
                      <span className="text-[9px] font-extrabold text-zinc-400 group-hover:text-[var(--brand-orange)] transition uppercase">
                        {flag.label}
                      </span>
                    </div>

                    {/* Title string */}
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--brand-orange)] transition leading-relaxed break-words whitespace-pre-wrap">
                        {opt.title}
                      </p>
                      {flag.isRomanized && (
                        <span className="inline-block px-1.5 py-0.5 text-[8px] bg-zinc-100 dark:bg-zinc-800 text-[var(--text-secondary)] border border-[var(--border-primary)] rounded font-mono font-extrabold uppercase scale-90 origin-left">
                          Romanized (RO)
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Cancel Footer */}
            <div className="pt-3 border-t border-[var(--border-primary)] flex justify-end">
              <button
                type="button"
                onClick={() => setIsTitleModalOpen(false)}
                className="px-5 py-2 border border-[var(--border-primary)] rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-zinc-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MangaDetailPage;
