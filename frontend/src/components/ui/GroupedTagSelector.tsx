import React, { useState } from "react";
import { Search, X } from "lucide-react";

interface Tag {
  _id: string;
  name: { en: string; vi?: string | null };
  color?: string;
  source: string;
  group: string;
}

interface GroupedTagSelectorProps {
  allTags: Tag[];
  selectedTags: string[];
  onChange: (selected: string[]) => void;
  label?: string;
  placeholder?: string;
}

export const GroupedTagSelector: React.FC<GroupedTagSelectorProps> = ({
  allTags,
  selectedTags,
  onChange,
  label,
  placeholder
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const handleTagToggle = (tagId: string) => {
    const isSelected = selectedTags.includes(tagId);
    if (isSelected) {
      onChange(selectedTags.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTags, tagId]);
    }
  };

  // Filter tags based on search query
  const filteredTags = allTags.filter((tag) => {
    const nameEn = (tag.name.en || "").toLowerCase();
    const nameVi = (tag.name.vi || "").toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    return nameEn.includes(query) || nameVi.includes(query);
  });

  // Group tags
  const groups = Array.from(new Set(filteredTags.map((t) => t.group || "other"))).sort();

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase">
          {label}
        </label>
      )}

      {/* Mini Live Search Box */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 text-zinc-400" size={14} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={placeholder || "Search tags..."}
          className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-orange)] transition"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-650 transition"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Grouped Tags Display */}
      <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
        {filteredTags.length === 0 ? (
          <div className="text-center text-xs text-[var(--text-secondary)] py-2">
            No matching tags found.
          </div>
        ) : (
          groups.map((groupName) => {
            const groupTags = filteredTags.filter((t) => (t.group || "other") === groupName);
            if (groupTags.length === 0) return null;
            return (
              <div key={groupName} className="space-y-1.5">
                <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border-primary)]/40 pb-0.5 capitalize">
                  {groupName}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {groupTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag._id);
                    return (
                      <button
                        key={tag._id}
                        type="button"
                        onClick={() => handleTagToggle(tag._id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                          isSelected
                            ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white font-bold"
                            : "bg-transparent border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-zinc-400"
                        }`}
                      >
                        {tag.name.en}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
