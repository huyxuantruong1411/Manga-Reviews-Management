import React, { useState, useEffect, useRef } from "react";
import client from "../../api/client";

interface CreatorLiveSearchInputProps {
  label: string;
  role: "author" | "artist";
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
}

export const CreatorLiveSearchInput: React.FC<CreatorLiveSearchInputProps> = ({
  label,
  role,
  value,
  onChange,
  placeholder,
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !value.trim()) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        setLoading(true);
        const res = await client.get("/api/creators/suggestions", {
          params: { query: value, role }
        });
        setSuggestions(res.data.slice(0, 5));
      } catch (err) {
        console.error("Error fetching creator suggestions:", err);
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(() => {
      fetchSuggestions();
    }, 200);

    return () => clearTimeout(debounceTimer);
  }, [value, role, isOpen]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)]"
      />
      {isOpen && (suggestions.length > 0 || loading) && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center py-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--brand-orange)]"></div>
            </div>
          ) : (
            suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(name);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-primary)] transition"
              >
                {name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
