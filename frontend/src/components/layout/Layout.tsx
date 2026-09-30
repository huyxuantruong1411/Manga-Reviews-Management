import React, { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, BarChart3, Tag, Compass, Settings, X, Save, Info, Wrench, DownloadCloud, RefreshCw, History, ScanSearch } from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";
import DownloadWidget from "../ui/DownloadWidget";
import client from "../../api/client";
import { useAlert } from "../../hooks/useAlert";
import { useMangaBlur, type BlurSettings } from "../../hooks/useMangaBlur";
import { GroupedTagSelector } from "../ui/GroupedTagSelector";

export const Layout: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [basePath, setBasePath] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const { showAlert } = useAlert();

  const { settings: blurSettings, updateSettings, tags: allTags } = useMangaBlur();
  const [tempBlurSettings, setTempBlurSettings] = useState<BlurSettings | null>(null);

  const fetchBasePath = async () => {
    try {
      const res = await client.get("/api/downloads/base-path");
      setBasePath(res.data.base_path || "");
    } catch (err) {
      console.error("Failed to fetch base path:", err);
    }
  };

  useEffect(() => {
    if (isSettingsOpen) {
      fetchBasePath();
      setTempBlurSettings(blurSettings);
    }
  }, [isSettingsOpen]);

  const handleSettingsPathChange = (val: string) => {
    // Keystroke validation
    let cleaned = val.replace(/[*?"<>|]/g, '');
    if (/^[A-Za-z]:/.test(cleaned)) {
      const drive = cleaned.slice(0, 2);
      const rest = cleaned.slice(2).replace(/:/g, '');
      cleaned = drive + rest;
    } else {
      cleaned = cleaned.replace(/:/g, '');
    }
    setBasePath(cleaned);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!basePath.trim()) {
      showAlert({
        title: "Validation Error",
        message: "Base path cannot be empty",
        type: "warning",
      });
      return;
    }
    try {
      setSavingSettings(true);
      await client.put("/api/downloads/base-path", { base_path: basePath.trim() });
      
      if (tempBlurSettings) {
        updateSettings(tempBlurSettings);
      }

      showAlert({
        title: "Settings Saved",
        message: "Global settings updated successfully!",
        type: "success",
      });
      setIsSettingsOpen(false);
    } catch (err: any) {
      console.error("Failed to save base path settings:", err);
      const errMsg = err.response?.data?.detail || "Failed to update base path settings.";
      showAlert({
        title: "Save Failed",
        message: errMsg,
        type: "error",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Sidebar */}
      <aside className="w-64 bg-[var(--bg-card)] border-r border-[var(--border-primary)] flex flex-col fixed h-full z-10">
        {/* Brand */}
        <div className="p-6 border-b border-[var(--border-primary)] flex items-center space-x-3">
          <BookOpen className="text-[var(--brand-orange)]" size={28} />
          <span className="font-spartan text-xl font-bold tracking-tight">
            Manga<span className="text-[var(--brand-orange)]">List</span>
          </span>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                isActive
                  ? "bg-[var(--brand-orange)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`
            }
          >
            <Compass size={20} />
            <span>Manga Library</span>
          </NavLink>

          <NavLink
            to="/panel-words-detector"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                isActive
                  ? "bg-[var(--brand-orange)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`
            }
          >
            <ScanSearch size={20} />
            <span>Panel Words Detector</span>
          </NavLink>
          
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                isActive
                  ? "bg-[var(--brand-orange)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`
            }
          >
            <BarChart3 size={20} />
            <span>Analytics</span>
          </NavLink>
          
          <NavLink
            to="/tags"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                isActive
                  ? "bg-[var(--brand-orange)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`
            }
          >
            <Tag size={20} />
            <span>Manage Tags</span>
          </NavLink>

          <NavLink
            to="/tools"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                isActive
                  ? "bg-[var(--brand-orange)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`
            }
          >
            <Wrench size={20} />
            <span>Image Tools</span>
          </NavLink>

          <NavLink
            to="/downloads"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                isActive
                  ? "bg-[var(--brand-orange)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`
            }
          >
            <DownloadCloud size={20} />
            <span>Downloads</span>
          </NavLink>

          <NavLink
            to="/sync"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                isActive
                  ? "bg-[var(--brand-orange)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`
            }
          >
            <RefreshCw size={20} />
            <span>Sync Manager</span>
          </NavLink>

          <NavLink
            to="/audit-logs"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                isActive
                  ? "bg-[var(--brand-orange)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`
            }
          >
            <History size={20} />
            <span>Audit Logs</span>
          </NavLink>
        </nav>
        
        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-primary)] text-xs text-[var(--text-secondary)] text-center">
          Manga Reviews Manager v1.0
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col ml-64 min-h-screen">
        {/* Header */}
        <header className="h-16 bg-[var(--bg-card)] border-b border-[var(--border-primary)] px-8 flex items-center justify-between sticky top-0 z-20">
          <h2 className="font-spartan text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            Dashboard
          </h2>
          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="Global Settings"
              className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center cursor-pointer"
            >
              <Settings size={20} />
            </button>
            <div className="h-8 w-px bg-[var(--border-primary)]" />
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[var(--brand-orange)] to-[var(--brand-coral)] flex items-center justify-center text-white font-bold text-sm">
                ME
              </div>
              <span className="text-sm font-semibold text-[var(--text-primary)] hidden md:inline">
                Admin
              </span>
            </div>
          </div>
        </header>

        {/* Page View */}
        <main className="flex-1 min-w-0 p-8">
          <Outlet />
        </main>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-2xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-[var(--border-primary)] flex justify-between items-center">
              <h2 className="text-lg font-bold flex items-center space-x-2">
                <Settings size={20} className="text-[var(--brand-orange)] animate-[spin_8s_linear_infinite]" />
                <span>Global Settings</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveSettings}>
              <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh] border-b border-[var(--border-primary)]">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    Default Download Base Path
                  </label>
                  <input
                    type="text"
                    value={basePath}
                    onChange={(e) => handleSettingsPathChange(e.target.value)}
                    placeholder="e.g. C:\Downloads\Manga"
                    className="w-full px-3 py-2 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-[var(--brand-orange)] transition"
                  />
                  <div className="flex items-start space-x-1.5 text-xs text-[var(--text-secondary)] mt-2">
                    <Info size={14} className="text-[var(--brand-orange)] shrink-0 mt-0.5" />
                    <span>
                      This path serves as the default target directory for all manga downloads across the system. It will be verified for write-access before saving.
                    </span>
                  </div>
                </div>

                <hr className="border-[var(--border-primary)] my-4" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                        Livestream Mode (Cover Blur)
                      </label>
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        Blur NSFW or selected tag covers while browsing.
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={tempBlurSettings?.enabled || false}
                        onChange={(e) =>
                          setTempBlurSettings((prev) =>
                            prev ? { ...prev, enabled: e.target.checked } : null
                          )
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-200 dark:bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--brand-orange)]"></div>
                    </label>
                  </div>

                  {tempBlurSettings?.enabled && (
                    <div className="space-y-4 pl-2 border-l-2 border-[var(--border-primary)] animate-in slide-in-from-left-2 duration-200">
                      {/* Hide Ratings */}
                      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-primary)]/50">
                        <div>
                          <span className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                            Hide Personal Ratings
                          </span>
                          <span className="text-[10px] text-[var(--text-secondary)]">
                            Blur or hide your scores during live stream.
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={tempBlurSettings.hideRating || false}
                            onChange={(e) =>
                              setTempBlurSettings((prev) =>
                                prev ? { ...prev, hideRating: e.target.checked } : null
                              )
                            }
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-zinc-200 dark:bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--brand-orange)]"></div>
                        </label>
                      </div>

                      {/* Content Ratings */}
                      <div className="space-y-2">
                        <span className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                          Blur Content Ratings
                        </span>
                        <div className="flex flex-wrap gap-3">
                          <label className="flex items-center space-x-2 text-xs cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={tempBlurSettings.blurSuggestive}
                              onChange={(e) =>
                                setTempBlurSettings((prev) =>
                                  prev ? { ...prev, blurSuggestive: e.target.checked } : null
                                )
                              }
                              className="rounded border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--brand-orange)] focus:ring-[var(--brand-orange)]"
                            />
                            <span>Suggestive</span>
                          </label>
                          <label className="flex items-center space-x-2 text-xs cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={tempBlurSettings.blurErotica}
                              onChange={(e) =>
                                setTempBlurSettings((prev) =>
                                  prev ? { ...prev, blurErotica: e.target.checked } : null
                                )
                              }
                              className="rounded border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--brand-orange)] focus:ring-[var(--brand-orange)]"
                            />
                            <span>Erotica</span>
                          </label>
                          <label className="flex items-center space-x-2 text-xs cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={tempBlurSettings.blurPornographic}
                              onChange={(e) =>
                                setTempBlurSettings((prev) =>
                                  prev ? { ...prev, blurPornographic: e.target.checked } : null
                                )
                              }
                              className="rounded border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--brand-orange)] focus:ring-[var(--brand-orange)]"
                            />
                            <span>Pornographic</span>
                          </label>
                        </div>
                      </div>

                      {/* Tag Groups to Blur */}
                      <div className="space-y-2">
                        <span className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                          Blur entire Tag Groups
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {Array.from(new Set(allTags.map((t) => t.group).filter(Boolean) as string[]))
                            .sort()
                            .map((g) => {
                              const groupLower = g.toLowerCase();
                              const isSelected = tempBlurSettings.blurGroups.includes(groupLower);
                              return (
                                <button
                                  type="button"
                                  key={groupLower}
                                  onClick={() =>
                                    setTempBlurSettings((prev) => {
                                      if (!prev) return null;
                                      const groups = isSelected
                                        ? prev.blurGroups.filter((x) => x !== groupLower)
                                        : [...prev.blurGroups, groupLower];
                                      return { ...prev, blurGroups: groups };
                                    })
                                  }
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                                    isSelected
                                      ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white"
                                      : "bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--brand-orange)]"
                                  }`}
                                >
                                  {g}
                                </button>
                              );
                            })}
                        </div>
                      </div>

                      {/* Specific Tags to Blur */}
                      {allTags.length > 0 && (
                        <div className="space-y-1">
                          <span className="block text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                            Blur specific Tags
                          </span>
                          <GroupedTagSelector
                            allTags={allTags}
                            selectedTags={tempBlurSettings.blurTags}
                            onChange={(tags) =>
                              setTempBlurSettings((prev) =>
                                prev ? { ...prev, blurTags: tags } : null
                              )
                            }
                            placeholder="Select tags to blur..."
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 flex justify-end space-x-3 bg-gray-50/50 dark:bg-zinc-900/30">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 border border-[var(--border-primary)] rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2 bg-[var(--brand-orange)] hover:bg-[var(--brand-coral)] text-white font-bold rounded-xl shadow-lg transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Save size={16} />
                  <span>{savingSettings ? "Saving..." : "Save Settings"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Global floating download widget */}
      <DownloadWidget />
    </div>
  );
};

export default Layout;
