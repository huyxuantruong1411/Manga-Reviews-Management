import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Star,
  ExternalLink,
  Grid,
  List as ListIcon,
  LayoutGrid
} from "lucide-react";
import client from "../api/client";
import { useMangaBlur } from "../hooks/useMangaBlur";
import { BlurredCover } from "../components/ui/BlurredCover";

interface AuthorWork {
  id: string;
  local_id: string;
  title: string;
  coverUrl: string | null;
  status: string;
  year: number | string;
  demographic: string | null;
  tags: string[];
  description: string;
  ratingAverage: number | null;
  commentsCount: number | null;
  read_status: string;
  personal_rating: number | null;
  content_rating?: string | null;
  tag_ids?: string[];
}

export const AuthorDetailPage: React.FC = () => {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { settings, shouldBlur } = useMangaBlur();
  const isRatingHidden = settings.enabled && settings.hideRating;

  // State
  const [author, setAuthor] = useState<any>(null);
  const [works, setWorks] = useState<AuthorWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layout & Sorting
  const [viewMode, setViewMode] = useState<"grid" | "list" | "card">(() => {
    return (localStorage.getItem("author_view_mode") as any) || "card";
  });
  const [sortMode, setSortMode] = useState<string>("none");
  const [zoomedCoverUrl, setZoomedCoverUrl] = useState<string | null>(null);

  // Clean biography & extract Native Name
  const parseBiography = (biographyText: string) => {
    let nativeName = "";
    let cleanBio = biographyText || "";

    const nativeNameMatch = cleanBio.match(/\*\*Name\s+In\s+Native\s+Language:\*\*\s*(.*?)(\n|$)/i) || 
                           cleanBio.match(/Name\s+In\s+Native\s+Language:\s*(.*?)(\n|$)/i);

    if (nativeNameMatch) {
      nativeName = nativeNameMatch[1].trim();
      cleanBio = cleanBio.replace(nativeNameMatch[0], "").trim();
    }

    // Split bio into paragraphs using double-newlines
    const rawParagraphs = cleanBio.split(/\n\s*\n/);
    
    // For each paragraph, replace single newlines (hard wraps) with spaces
    const paragraphs = rawParagraphs
      .map(p => p.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    return { nativeName, paragraphs };
  };

  // Basic Markdown parser for bold (**text**) and links ([label](url))
  const renderMarkdown = (text: string) => {
    if (!text) return null;

    // Matches bold: **text**
    // Matches links: [label](url)
    const tokenRegex = /(\*\*.*?\*\*|\[.*?\]\(.*?\))/g;
    const parts = text.split(tokenRegex);

    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const content = part.slice(2, -2);
        return (
          <strong key={index} className="font-bold text-[var(--text-primary)]">
            {content}
          </strong>
        );
      } else if (part.startsWith("[") && part.endsWith(")") && part.includes("](")) {
        const closeBracketIndex = part.indexOf("](");
        const label = part.slice(1, closeBracketIndex);
        const url = part.slice(closeBracketIndex + 2, -1);
        return (
          <a
            key={index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--brand-orange)] hover:text-[var(--brand-coral)] underline transition font-medium"
          >
            {label}
          </a>
        );
      }
      return part;
    });
  };

  const fetchAuthorAndWorks = async () => {
    if (!name) return;
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Author from backend creators endpoint
      const authorRes = await client.get(`/api/creators/${encodeURIComponent(name)}`);
      const matchedAuthor = authorRes.data;
      setAuthor(matchedAuthor);

      // 2. Fetch local works (both as author and as artist) and tags list
      const [authorWorksRes, artistWorksRes, tagsRes] = await Promise.all([
        client.get("/api/manga/", { params: { author: name, limit: 10000 } }),
        client.get("/api/manga/", { params: { artist: name, limit: 10000 } }),
        client.get("/api/tags/")
      ]);

      const authorWorks = authorWorksRes.data.items || [];
      const artistWorks = artistWorksRes.data.items || [];
      const tagsList = tagsRes.data || [];

      // Merge and deduplicate works by local _id
      const mergedMap: Record<string, any> = {};
      [...authorWorks, ...artistWorks].forEach((manga) => {
        mergedMap[manga._id] = manga;
      });
      const uniqueWorks = Object.values(mergedMap);

      if (uniqueWorks.length === 0) {
        setWorks([]);
        setLoading(false);
        return;
      }

      // 3. Parse local manga into UI Works Model
      const parsedWorks: AuthorWork[] = uniqueWorks.map((w: any) => {
        const tags = (w.tag_ids || [])
          .map((tid: string) => {
            const tag = tagsList.find((t: any) => t._id === tid);
            return tag ? tag.name.en : null;
          })
          .filter(Boolean) as string[];

        return {
          id: w.mangadex_id || w._id,
          local_id: w._id,
          title: w.title,
          coverUrl: w.cover_url,
          status: w.status || "unknown",
          year: w.year || "N/A",
          demographic: w.publication_demographic || null,
          tags: tags,
          description: w.description || "",
          ratingAverage: w.personal_rating || null,
          commentsCount: null,
          read_status: w.read_status || "unread",
          personal_rating: w.personal_rating ?? null,
          content_rating: w.content_rating ?? null,
          tag_ids: w.tag_ids || []
        };
      });

      setWorks(parsedWorks);
    } catch (err: any) {
      console.error("Error fetching author details", err);
      setError(err.response?.data?.detail || err.message || "Failed to load creator profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthorAndWorks();
  }, [name]);



  // Sort works
  const getSortedWorks = () => {
    const worksCopy = [...works];
    if (sortMode === "title-asc") {
      worksCopy.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortMode === "title-desc") {
      worksCopy.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sortMode === "year-newest") {
      worksCopy.sort((a, b) => String(b.year).localeCompare(String(a.year)));
    } else if (sortMode === "year-oldest") {
      worksCopy.sort((a, b) => String(a.year).localeCompare(String(b.year)));
    } else if (sortMode === "rating-highest") {
      worksCopy.sort((a, b) => (b.ratingAverage || 0) - (a.ratingAverage || 0));
    }
    return worksCopy;
  };

  const sortedWorks = getSortedWorks();

  // Bio and native name details
  const bioText = author?.biography?.en || author?.attributes?.biography?.en || "";
  const { nativeName, paragraphs } = parseBiography(bioText);

  // Social handles
  const socials = {
    twitter: author?.twitter || author?.attributes?.twitter,
    pixiv: author?.pixiv || author?.attributes?.pixiv,
    youtube: author?.youtube || author?.attributes?.youtube,
    website: author?.website || author?.attributes?.website
  };

  const getReadStatusBadge = (manga: AuthorWork) => {
    const status = manga.read_status.toLowerCase();
    let bg = "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700";
    if (status === "reading") bg = "bg-blue-100 dark:bg-blue-950/40 text-blue-500 border-blue-200 dark:border-blue-900/50";
    else if (status === "completed") bg = "bg-green-100 dark:bg-green-950/40 text-green-500 border-green-200 dark:border-green-900/50";
    else if (status === "dropped") bg = "bg-red-100 dark:bg-red-950/40 text-red-500 border-red-200 dark:border-red-900/50";
    else if (status === "on_hold") bg = "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-600 dark:text-yellow-500 border-yellow-200 dark:border-yellow-900/50";
    else if (status === "plan_to_read") bg = "bg-purple-100 dark:bg-purple-950/40 text-purple-500 border-purple-200 dark:border-purple-900/50";
    else if (status === "re_reading") bg = "bg-pink-100 dark:bg-pink-950/40 text-pink-500 border-pink-200 dark:border-pink-900/50";

    return (
      <div className="flex items-center space-x-1">
        <span className={`px-2 py-0.5 border rounded-lg text-[10px] font-bold uppercase ${bg}`}>
          {manga.read_status.replace(/_/g, " ")}
        </span>
        {manga.personal_rating !== null && (
          <span className={`px-2 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-lg text-[10px] font-bold flex items-center space-x-0.5 ${isRatingHidden ? "blur-[4px] pointer-events-none select-none" : ""}`}>
            <Star size={9} className="fill-yellow-500 text-yellow-500" />
            <span>{manga.personal_rating}</span>
          </span>
        )}
      </div>
    );
  };

  const handleSaveLayout = (mode: "grid" | "list" | "card") => {
    setViewMode(mode);
    localStorage.setItem("author_view_mode", mode);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--brand-orange)]"></div>
      </div>
    );
  }

  if (error && !author) {
    return (
      <div className="space-y-4 max-w-lg mx-auto py-12 text-center">
        <h2 className="text-xl font-bold text-red-500">Error Occurred</h2>
        <p className="text-[var(--text-secondary)]">{error}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 border border-[var(--border-primary)] rounded-xl font-bold text-sm"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Back navigation */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center space-x-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
      >
        <ArrowLeft size={16} />
        <span>Back</span>
      </button>

      {/* Author Bio Header Card */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-6 md:p-8 space-y-6 relative overflow-hidden shadow-sm">
        {/* Decorative backdrop glow */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-[var(--brand-orange)]/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="space-y-4 relative z-10">
          <h1 className="text-3xl md:text-4xl font-spartan font-extrabold tracking-tight text-[var(--text-primary)]">
            {name}
          </h1>

          {nativeName && (
            <div className="text-sm">
              <span className="text-[var(--text-secondary)] font-bold">Name In Native Language: </span>
              <span className="text-[var(--text-primary)] font-medium font-spartan">{nativeName}</span>
            </div>
          )}

          {paragraphs && paragraphs.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="text-lg font-bold text-[var(--text-primary)] font-spartan">Biography</h3>
              <div className="text-sm leading-relaxed text-[var(--text-secondary)] space-y-4 w-full">
                {paragraphs.map((para, i) => (
                  <p key={i}>
                    {renderMarkdown(para)}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Social presence */}
        {(socials.twitter || socials.youtube || socials.pixiv || socials.website) && (
          <div className="pt-4 border-t border-[var(--border-primary)] space-y-3 relative z-10">
            <h3 className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">Where to find</h3>
            <div className="flex flex-wrap gap-3">
              {socials.twitter && (
                <a
                  href={socials.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-[var(--border-primary)] text-sm font-semibold text-[var(--text-primary)] transition"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span>X/Twitter</span>
                </a>
              )}
              {socials.youtube && (
                <a
                  href={socials.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-sm font-semibold transition"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.107C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.388.511a3.002 3.002 0 0 0-2.11 2.107C0 8.053 0 12 0 12s0 3.948.502 5.837a3.003 3.003 0 0 0 2.11 2.107c1.883.511 9.388.511 9.388.511s7.505 0 9.388-.511a3.002 3.002 0 0 0 2.11-2.107c.502-1.89.502-5.837.502-5.837s0-3.948-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                  <span>YouTube</span>
                </a>
              )}
              {socials.pixiv && (
                <a
                  href={socials.pixiv}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-500 text-sm font-semibold transition"
                >
                  <ExternalLink size={16} />
                  <span>Pixiv</span>
                </a>
              )}
              {socials.website && (
                <a
                  href={socials.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-[var(--border-primary)] text-sm font-semibold text-[var(--text-primary)] transition"
                >
                  <ExternalLink size={16} />
                  <span>Website</span>
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Works list container */}
      <div className="space-y-6">
        {/* Controls Toolbar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-4 shadow-sm">
          <div>
            <h2 className="font-spartan font-bold text-lg">Works ({works.length})</h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Sort by */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-[var(--text-secondary)] font-bold">Sort by</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-xs focus:outline-none"
              >
                <option value="none">None (Default)</option>
                <option value="title-asc">Title (A-Z)</option>
                <option value="title-desc">Title (Z-A)</option>
                <option value="year-newest">Year (Newest)</option>
                <option value="year-oldest">Year (Oldest)</option>
                <option value="rating-highest">Rating (Highest)</option>
              </select>
            </div>

            {/* Layout Toggles */}
            <div className="flex items-center rounded-xl overflow-hidden border border-[var(--border-primary)] p-0.5 bg-[var(--bg-primary)] ml-auto sm:ml-0">
              <button
                onClick={() => handleSaveLayout("list")}
                className={`p-1.5 rounded-lg transition ${
                  viewMode === "list"
                    ? "bg-[var(--brand-orange)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
                title="List View"
              >
                <ListIcon size={16} />
              </button>
              <button
                onClick={() => handleSaveLayout("card")}
                className={`p-1.5 rounded-lg transition ${
                  viewMode === "card"
                    ? "bg-[var(--brand-orange)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
                title="Detailed Card View"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => handleSaveLayout("grid")}
                className={`p-1.5 rounded-lg transition ${
                  viewMode === "grid"
                    ? "bg-[var(--brand-orange)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
                title="Grid View"
              >
                <Grid size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Display works */}
        {sortedWorks.length > 0 ? (
          viewMode === "grid" ? (
            /* GRID VIEW */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {sortedWorks.map((manga) => (
                  <div
                    key={manga.id}
                    className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition flex flex-col group relative cursor-pointer"
                    onClick={() => navigate(`/manga/${manga.local_id}`)}
                  >
                    {/* Cover Frame */}
                    <div className="aspect-[3/4] relative overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                      {manga.coverUrl ? (
                        <BlurredCover
                          src={manga.coverUrl}
                          alt={manga.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300 cursor-pointer"
                          shouldBlur={shouldBlur({ content_rating: manga.content_rating, tag_ids: manga.tag_ids })}
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            setZoomedCoverUrl(manga.coverUrl);
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600 text-xs">
                          <span>No Cover Image</span>
                        </div>
                      )}

                      {/* Status / Demographic Badges */}
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm text-white rounded text-[9px] uppercase font-bold tracking-wider">
                        {manga.status}
                      </span>
                    </div>

                    {/* Content details */}
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div className="space-y-1">
                        <h4
                          className="font-spartan font-bold text-xs leading-tight text-[var(--text-primary)] line-clamp-2 hover:text-[var(--brand-orange)] cursor-pointer"
                          title={manga.title}
                        >
                          {manga.title}
                        </h4>
                        <p className="text-[10px] text-[var(--text-secondary)]">
                          {manga.year} • <span className="capitalize">{manga.demographic || "none"}</span>
                        </p>
                      </div>

                      {/* Read Status Badge */}
                      {getReadStatusBadge(manga)}
                    </div>
                  </div>
                ))}
            </div>
          ) : viewMode === "list" ? (
            /* LIST VIEW */
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-primary)] text-xs text-[var(--text-secondary)] uppercase font-bold tracking-wider">
                      <th className="p-4 w-16">Cover</th>
                      <th className="p-4">Title</th>
                      <th className="p-4 w-28">Year / Status</th>
                      <th className="p-4 w-28">Demographic</th>
                      <th className="p-4 w-32">Rating</th>
                      <th className="p-4 w-36">Read Status</th>
                      <th className="p-4 w-28 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-primary)]">
                    {sortedWorks.map((manga) => (
                        <tr key={manga.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 text-sm transition cursor-pointer" onClick={() => navigate(`/manga/${manga.local_id}`)}>
                          <td className="p-3">
                            <div className="w-10 aspect-[3/4] rounded overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                              {manga.coverUrl ? (
                                <BlurredCover
                                  src={manga.coverUrl}
                                  alt={manga.title}
                                  className="w-full h-full object-cover cursor-pointer"
                                  shouldBlur={shouldBlur({ content_rating: manga.content_rating, tag_ids: manga.tag_ids })}
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setZoomedCoverUrl(manga.coverUrl);
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[8px] text-zinc-400">No cover</div>
                              )}
                            </div>
                          </td>
                          <td className="p-3 font-semibold">
                            <span className="hover:text-[var(--brand-orange)] cursor-pointer transition">
                              {manga.title}
                            </span>
                          </td>
                          <td className="p-3 text-zinc-500">
                            {manga.year} <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded ml-1.5">{manga.status}</span>
                          </td>
                          <td className="p-3 capitalize text-zinc-500">{manga.demographic || "none"}</td>
                          <td className="p-3 text-xs text-zinc-500">
                            {manga.ratingAverage !== null && (
                              <div className={`flex items-center space-x-1 font-bold text-yellow-600 dark:text-yellow-400 ${isRatingHidden ? "blur-[4px] pointer-events-none select-none" : ""}`}>
                                <Star size={11} className="fill-yellow-500 text-yellow-500" />
                                <span>{manga.ratingAverage.toFixed(2)} / 10</span>
                              </div>
                            )}
                          </td>
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            {getReadStatusBadge(manga)}
                          </td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => navigate(`/manga/${manga.local_id}`)}
                              className="px-3 py-1 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 hover:opacity-90 rounded-lg text-xs font-bold transition"
                            >
                              View Detail
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* DETAILED CARD VIEW */
            <div className="space-y-6">
              {sortedWorks.map((manga) => (
                  <div
                    key={manga.id}
                    className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl p-5 md:p-6 flex flex-col md:flex-row gap-6 relative shadow-sm hover:shadow-md transition"
                  >
                    {/* Cover (Larger) */}
                    <div
                      className="w-32 md:w-36 aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-200 dark:bg-zinc-800 shadow-md flex-shrink-0 mx-auto md:mx-0 cursor-pointer"
                      onClick={() => manga.coverUrl && setZoomedCoverUrl(manga.coverUrl)}
                    >
                      {manga.coverUrl ? (
                        <BlurredCover
                          src={manga.coverUrl}
                          alt={manga.title}
                          className="w-full h-full object-cover hover:scale-105 transition duration-300 cursor-pointer"
                          shouldBlur={shouldBlur({ content_rating: manga.content_rating, tag_ids: manga.tag_ids })}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 text-xs">
                          <span>No Cover</span>
                        </div>
                      )}
                    </div>

                    {/* Metadata & Synopsis Details */}
                    <div className="flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-2">
                        {/* Upper Stats Row */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Demographic */}
                          {manga.demographic && (
                            <span className="px-2.5 py-0.5 bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 rounded-xl text-[10px] font-bold uppercase">
                              {manga.demographic}
                            </span>
                          )}

                          {/* Publish Status */}
                          <span className="px-2.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 rounded-xl text-[10px] font-bold uppercase">
                            {manga.status}
                          </span>

                          {/* Rating */}
                          {manga.ratingAverage !== null && (
                            <span className={`px-2.5 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20 rounded-xl text-[10px] font-bold flex items-center space-x-0.5 ${isRatingHidden ? "blur-[4px] pointer-events-none select-none" : ""}`}>
                              <Star size={10} className="fill-yellow-500 text-yellow-500" />
                              <span>{manga.ratingAverage.toFixed(2)}</span>
                            </span>
                          )}

                          {/* Read Status */}
                          <div className="ml-auto">
                            {getReadStatusBadge(manga)}
                          </div>
                        </div>

                        {/* Title */}
                        <h3
                          onClick={() => navigate(`/manga/${manga.local_id}`)}
                          className="text-xl font-spartan font-extrabold tracking-tight text-[var(--text-primary)] hover:text-[var(--brand-orange)] cursor-pointer transition"
                        >
                          {manga.title}
                        </h3>

                        {/* Year */}
                        <p className="text-xs text-[var(--text-secondary)] font-medium">Released in {manga.year}</p>

                        {/* Synopsis */}
                        {manga.description ? (
                          <p className="text-sm text-[var(--text-secondary)] line-clamp-3 leading-relaxed max-w-3xl">
                            {manga.description}
                          </p>
                        ) : (
                          <p className="text-xs text-zinc-400 italic">No synopsis available.</p>
                        )}
                      </div>

                      {/* Genre Tags & Actions Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-[var(--border-primary)]">
                        {/* Genre Badges (max 4) */}
                        <div className="flex flex-wrap gap-1.5">
                          {manga.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] font-semibold text-[var(--text-secondary)] capitalize"
                            >
                              {tag}
                            </span>
                          ))}
                          {manga.tags.length > 4 && (
                            <span className="text-[10px] text-zinc-400 font-bold">+{manga.tags.length - 4} more</span>
                          )}
                        </div>

                        {/* Direct Button Action */}
                        <div className="flex gap-2 sm:ml-auto">
                          <button
                            onClick={() => navigate(`/manga/${manga.local_id}`)}
                            className="px-4 py-1.5 bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl text-xs font-bold transition hover:opacity-90"
                          >
                            View detail & review
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )
        ) : (
          <div className="text-center py-20 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-3xl text-[var(--text-secondary)]">
            No works found for this creator on MangaDex.
          </div>
        )}
      </div>

      {/* Shared Lightbox Cover Zoom Modal */}
      {zoomedCoverUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out transition duration-300 animate-in fade-in"
          onClick={() => setZoomedCoverUrl(null)}
        >
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            <img
              src={zoomedCoverUrl}
              alt="Zoomed cover"
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-zinc-800 transition duration-300 animate-in zoom-in-95"
            />
            {/* Close instruction */}
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-semibold text-zinc-400 bg-zinc-900/60 px-3 py-1.5 rounded-full pointer-events-none">
              Click anywhere to close
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthorDetailPage;
