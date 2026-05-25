import React, { useState, useEffect } from "react";
import { Tag as TagIcon, Plus, Trash2, Edit2, Search, X } from "lucide-react";
import client from "../api/client";
import { useAlert } from "../hooks/useAlert";

interface Tag {
  _id: string;
  mangadex_id: string | null;
  source: "mangadex" | "custom";
  name: {
    en: string;
    vi?: string | null;
  };
  group: string;
  description?: { en: string; vi?: string | null } | string;
  color?: string;
}

export const TagsPage: React.FC = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Custom Tag Form State
  const [enName, setEnName] = useState("");
  const [viName, setViName] = useState("");
  const [group, setGroup] = useState("custom");
  const [descEn, setDescEn] = useState("");
  const [descVi, setDescVi] = useState("");
  const [color, setColor] = useState("#3f3f46"); // Default zinc grey
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  const { showAlert } = useAlert();

  const fetchTags = async () => {
    try {
      setLoading(true);
      const res = await client.get("/api/tags/");
      setTags(res.data);
    } catch (err: any) {
      console.error("Error fetching tags:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleEnNameChange = (val: string) => {
    setEnName(val);
    const valLower = val.trim().toLowerCase();
    
    // Auto-update color selector based on tag name rules
    if (valLower === "gore" || valLower === "sexual violence" || valLower === "mature") {
      setColor("#ef4444"); // Red
    } else if (valLower === "suggestive") {
      setColor("#eab308"); // Yellow
    } else if (valLower === "doujinshi") {
      setColor("#7c3aed"); // Purple
    } else {
      setColor("#3f3f46"); // Default Zinc Grey
    }
  };

  const handleCreateOrUpdateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!enName.trim()) {
      setError("English name is required");
      return;
    }

    // Front-end Duplicate validation check (case-insensitive)
    const nameLower = enName.trim().toLowerCase();
    const isDuplicate = tags.some((t) => {
      if (editingTag && t._id === editingTag._id) return false;
      return t.name.en.toLowerCase() === nameLower;
    });

    if (isDuplicate) {
      setError(`Tag name "${enName.trim()}" already exists (case-insensitive)`);
      return;
    }

    try {
      const descObj: { en?: string; vi?: string } = {};
      if (descEn.trim()) descObj.en = descEn.trim();
      if (descVi.trim()) descObj.vi = descVi.trim();

      const payload = {
        name: {
          en: enName.trim(),
          vi: viName.trim() || undefined
        },
        group: group.trim() || "custom",
        description: Object.keys(descObj).length > 0 ? descObj : undefined,
        color: color
      };
      
      if (editingTag) {
        // Update tag via PUT API
        const res = await client.put(`/api/tags/${editingTag._id}`, payload);
        setSuccess("Tag updated successfully!");
        setTags((prev) => 
          prev.map((t) => (t._id === editingTag._id ? res.data : t))
              .sort((a, b) => a.name.en.localeCompare(b.name.en))
        );
        handleCancelEdit();
      } else {
        // Create custom tag via POST API
        const res = await client.post("/api/tags/", payload);
        setSuccess("Tag created successfully!");
        setTags((prev) => [...prev, res.data].sort((a, b) => a.name.en.localeCompare(b.name.en)));
        
        // Reset form
        setEnName("");
        setViName("");
        setDescEn("");
        setDescVi("");
        setColor("#3f3f46");
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save tag");
    }
  };

  const handleSelectEditTag = (tag: Tag) => {
    setError("");
    setSuccess("");
    setEditingTag(tag);
    setEnName(tag.name.en);
    setViName(tag.name.vi || "");
    setGroup(tag.group);
    
    if (tag.description && typeof tag.description === "object") {
      setDescEn(tag.description.en || "");
      setDescVi(tag.description.vi || "");
    } else if (typeof tag.description === "string") {
      setDescEn(tag.description);
      setDescVi("");
    } else {
      setDescEn("");
      setDescVi("");
    }
    
    setColor(tag.color || "#3f3f46");
    
    // Smooth scroll to form on click
    const formElement = document.getElementById("tag-form");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleCancelEdit = () => {
    setEditingTag(null);
    setEnName("");
    setViName("");
    setGroup("custom");
    setDescEn("");
    setDescVi("");
    setColor("#3f3f46");
    setError("");
  };

  const handleDeleteTag = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this custom tag? It will be removed from all mangas.")) return;
    try {
      await client.delete(`/api/tags/${id}`);
      setTags((prev) => prev.filter((t) => t._id !== id));
      if (editingTag?._id === id) {
        handleCancelEdit();
      }
    } catch (err: any) {
      showAlert({
        title: "Error Deleting Tag",
        message: err.response?.data?.detail || "Failed to delete tag",
        type: "error"
      });
    }
  };

  // Get all unique colors currently used by tags in db
  const distinctColors = Array.from(
    new Set(tags.map((t) => t.color).filter((c): c is string => !!c && c.startsWith("#")))
  ).sort();

  // Get all unique groups currently used by tags in db
  const distinctGroups = Array.from(
    new Set(tags.map((t) => t.group).filter((g): g is string => !!g))
  ).sort();

  // Live filter computation
  const filteredTags = tags.filter((tag) => {
    const en = tag.name.en.toLowerCase();
    const vi = (tag.name.vi || "").toLowerCase();
    const g = tag.group.toLowerCase();
    const s = tag.source.toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    
    return en.includes(q) || vi.includes(q) || g.includes(q) || s.includes(q);
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Title */}
      <div className="flex items-center space-x-3">
        <div className="p-3 bg-gradient-to-tr from-[var(--brand-orange)] to-[var(--brand-coral)] text-white rounded-xl">
          <TagIcon size={24} />
        </div>
        <div>
          <h1 className="text-3xl font-spartan font-extrabold tracking-tight">Tag Management</h1>
          <p className="text-sm text-[var(--text-secondary)]">Create custom library tags or review imported MangaDex tags.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create / Edit Custom Tag Form */}
        <div 
          id="tag-form" 
          className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 h-fit space-y-4 scroll-mt-24 transition duration-300"
        >
          <h2 className="text-xl font-bold flex items-center space-x-2">
            {editingTag ? (
              <Edit2 size={20} className="text-[var(--brand-orange)] animate-pulse" />
            ) : (
              <Plus size={20} className="text-[var(--brand-orange)]" />
            )}
            <span>{editingTag ? `Edit Tag: ${editingTag.name.en}` : "Create Custom Tag"}</span>
          </h2>
          
          <form onSubmit={handleCreateOrUpdateTag} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                English Name *
              </label>
              <input
                type="text"
                value={enName}
                onChange={(e) => handleEnNameChange(e.target.value)}
                placeholder="e.g. Recommended"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition disabled:opacity-60 disabled:cursor-not-allowed"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Vietnamese Name (Optional)
              </label>
              <input
                type="text"
                value={viName}
                onChange={(e) => setViName(e.target.value)}
                placeholder="e.g. Khuyên đọc"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Group (Optional)
              </label>
              <input
                type="text"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="e.g. personal, review"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition"
              />
              {distinctGroups.length > 0 && (
                <div className="mt-2.5">
                  <span className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                    Or select an existing group:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-[70px] overflow-y-auto pr-1">
                    {distinctGroups.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGroup(g)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition duration-150 capitalize ${
                          group.toLowerCase() === g.toLowerCase()
                            ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                            : "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--brand-orange)]"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Description English (Optional)
              </label>
              <textarea
                value={descEn}
                onChange={(e) => setDescEn(e.target.value)}
                placeholder="Brief tag purpose in English..."
                rows={4}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition resize-y min-h-[80px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Description Vietnamese (Optional)
              </label>
              <textarea
                value={descVi}
                onChange={(e) => setDescVi(e.target.value)}
                placeholder="Mô tả tag bằng tiếng Việt..."
                rows={4}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition resize-y min-h-[80px]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Tag Color
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-12 h-10 border border-[var(--border-primary)] rounded-lg cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#3F3F46"
                  className="w-28 px-3 py-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono text-sm uppercase focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)]"
                />
              </div>
              {distinctColors.length > 0 && (
                <div className="mt-3">
                  <span className="block text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                    Or pick from existing color themes:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto pr-1">
                    {distinctColors.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`w-6 h-6 rounded-full border transition hover:scale-110 shadow-sm relative shrink-0 ${
                          color.toLowerCase() === c.toLowerCase()
                            ? "border-[var(--brand-orange)] ring-1 ring-[var(--brand-orange)] scale-110"
                            : "border-[var(--border-primary)]"
                        }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      >
                        {color.toLowerCase() === c.toLowerCase() && (
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-bold drop-shadow-md">
                            ✓
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && <div className="text-xs text-red-500 font-semibold">{error}</div>}
            {success && <div className="text-xs text-green-500 font-semibold">{success}</div>}

            <div className="flex gap-3">
              {editingTag && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="flex-1 py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl transition duration-200 border border-[var(--border-primary)]"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="flex-[2] py-3 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold rounded-xl shadow-lg transition duration-200"
              >
                {editingTag ? "Update Tag" : "Add Custom Tag"}
              </button>
            </div>
          </form>
        </div>

        {/* Tags List */}
        <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold flex items-center space-x-2">
              <TagIcon size={20} className="text-[var(--brand-orange)]" />
              <span>Library Tags ({filteredTags.length})</span>
            </h2>
            
            {/* Live Search Input */}
            <div className="relative w-full md:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tag name, group..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-orange)]"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2">
              {filteredTags.map((tag) => (
                <div
                  key={tag._id}
                  onClick={() => handleSelectEditTag(tag)}
                  className={`p-4 border bg-[var(--bg-primary)] rounded-xl flex items-start justify-between group transition hover:border-[var(--brand-orange)] cursor-pointer ${
                    editingTag?._id === tag._id
                      ? "border-[var(--brand-orange)] ring-1 ring-[var(--brand-orange)] bg-[var(--bg-card)]"
                      : "border-[var(--border-primary)]"
                  }`}
                  title="Click to Edit Tag"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-semibold text-white whitespace-nowrap"
                        style={{ backgroundColor: tag.color || "#3f3f46" }}
                      >
                        {tag.name.en}
                      </span>
                      {tag.name.vi && (
                        <span className="text-xs text-[var(--text-secondary)] italic truncate">
                          ({tag.name.vi})
                        </span>
                      )}
                    </div>
                    {tag.description && (
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                        {typeof tag.description === "object"
                          ? tag.description.en || tag.description.vi
                          : tag.description}
                      </p>
                    )}
                    <div className="flex items-center space-x-2 text-[10px] text-[var(--text-secondary)] font-semibold">
                      <span className="uppercase">{tag.source}</span>
                      <span>•</span>
                      <span>{tag.group}</span>
                    </div>
                  </div>
                  
                  {tag.source === "custom" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTag(tag._id);
                      }}
                      className="p-1.5 text-zinc-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-zinc-800 transition shrink-0 ml-2"
                      title="Delete Custom Tag"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              
              {filteredTags.length === 0 && (
                <div className="col-span-2 text-center py-12 text-[var(--text-secondary)]">
                  {tags.length === 0 
                    ? "No tags added to the library yet." 
                    : "No tags match your search query."}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TagsPage;
