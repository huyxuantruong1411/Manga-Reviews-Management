import React, { useState, useEffect } from "react";
import { Tag as TagIcon, Plus, Trash2 } from "lucide-react";
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
  
  // Custom Tag Form State
  const [enName, setEnName] = useState("");
  const [viName, setViName] = useState("");
  const [group, setGroup] = useState("custom");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#DA7500");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!enName.trim()) {
      setError("English name is required");
      return;
    }

    try {
      const payload = {
        name: {
          en: enName.trim(),
          vi: viName.trim() || undefined
        },
        group: group.trim() || "custom",
        description: description.trim() ? { en: description.trim() } : undefined,
        color: color
      };
      
      const res = await client.post("/api/tags/", payload);
      setSuccess("Tag created successfully!");
      setTags((prev) => [...prev, res.data].sort((a, b) => a.name.en.localeCompare(b.name.en)));
      
      // Reset form
      setEnName("");
      setViName("");
      setDescription("");
      setColor("#DA7500");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create tag");
    }
  };

  const handleDeleteTag = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this custom tag? It will be removed from all mangas.")) return;
    try {
      await client.delete(`/api/tags/${id}`);
      setTags((prev) => prev.filter((t) => t._id !== id));
    } catch (err: any) {
      showAlert({
        title: "Error Deleting Tag",
        message: err.response?.data?.detail || "Failed to delete tag",
        type: "error"
      });
    }
  };

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
        {/* Create Custom Tag Form */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6 h-fit space-y-4">
          <h2 className="text-xl font-bold flex items-center space-x-2">
            <Plus size={20} className="text-[var(--brand-orange)]" />
            <span>Create Custom Tag</span>
          </h2>
          
          <form onSubmit={handleCreateTag} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                English Name *
              </label>
              <input
                type="text"
                value={enName}
                onChange={(e) => setEnName(e.target.value)}
                placeholder="e.g. Recommended"
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition"
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
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition"
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
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief tag purpose..."
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] transition resize-none"
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
                <span className="text-sm font-mono">{color.toUpperCase()}</span>
              </div>
            </div>

            {error && <div className="text-xs text-red-500 font-semibold">{error}</div>}
            {success && <div className="text-xs text-green-500 font-semibold">{success}</div>}

            <button
              type="submit"
              className="w-full py-3 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold rounded-xl shadow-lg transition duration-200"
            >
              Add Custom Tag
            </button>
          </form>
        </div>

        {/* Tags List */}
        <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-6 flex items-center space-x-2">
            <TagIcon size={20} className="text-[var(--brand-orange)]" />
            <span>Library Tags ({tags.length})</span>
          </h2>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-orange)]"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tags.map((tag) => (
                <div
                  key={tag._id}
                  className="p-4 border border-[var(--border-primary)] bg-[var(--bg-primary)] rounded-xl flex items-start justify-between group transition hover:border-[var(--brand-orange)]"
                >
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-semibold text-white"
                        style={{ backgroundColor: tag.color || "#7E7E7E" }}
                      >
                        {tag.name.en}
                      </span>
                      {tag.name.vi && (
                        <span className="text-xs text-[var(--text-secondary)] italic">
                          ({tag.name.vi})
                        </span>
                      )}
                    </div>
                    {tag.description && (
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-[200px]">
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
                      onClick={() => handleDeleteTag(tag._id)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-zinc-800 transition"
                      title="Delete Custom Tag"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              
              {tags.length === 0 && (
                <div className="col-span-2 text-center py-12 text-[var(--text-secondary)]">
                  No tags added to the library yet.
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
