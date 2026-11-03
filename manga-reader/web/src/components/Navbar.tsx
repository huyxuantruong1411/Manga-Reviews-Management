import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Search,
  Bookmark,
  Clock,
  BarChart2,
  Shield,
  User,
  LogOut,
  Activity,
  Layers,
  ChevronDown,
} from "lucide-react";
import { api, getStoredUser, clearStoredAuth, UserProfile } from "@/api/client";

interface NavbarProps {
  onOpenAuth: () => void;
  currentUser: UserProfile | null;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth, currentUser, onLogout }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [autocompleteItems, setAutocompleteItems] = useState<Array<{ pool_manga_id: string; title: string; slug: string }>>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [healthStatus, setHealthStatus] = useState<"ok" | "degraded" | "checking">("checking");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    api.getHealth()
      .then((res) => {
        setHealthStatus(res.status === "ready" ? "ok" : "degraded");
      })
      .catch(() => setHealthStatus("degraded"));
  }, []);

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setAutocompleteItems([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(() => {
      api.autocomplete(searchQuery.trim())
        .then((res) => {
          setAutocompleteItems(res.items || []);
          setShowDropdown(true);
        })
        .catch(() => {
          setAutocompleteItems([]);
        });
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowDropdown(false);
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 text-zinc-100 hover:text-emerald-400 transition-colors font-mono font-bold text-sm tracking-tight">
            <div className="w-7 h-7 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <span>MANGA.READER</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">
              v2.0
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-medium text-zinc-400">
            <Link
              to="/"
              className="px-3 py-1.5 rounded hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
            >
              Danh Mục
            </Link>
            <Link
              to="/lists"
              className="px-3 py-1.5 rounded hover:bg-zinc-900 hover:text-zinc-100 transition-colors flex items-center gap-1"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>List Của Tôi</span>
            </Link>
            <Link
              to="/history"
              className="px-3 py-1.5 rounded hover:bg-zinc-900 hover:text-zinc-100 transition-colors flex items-center gap-1"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Lịch Sử</span>
            </Link>
            <Link
              to="/stats"
              className="px-3 py-1.5 rounded hover:bg-zinc-900 hover:text-zinc-100 transition-colors flex items-center gap-1"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Thống Kê</span>
            </Link>
            {currentUser?.role === "admin" && (
              <Link
                to="/admin"
                className="px-3 py-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex items-center gap-1"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Console Quản Trị</span>
              </Link>
            )}
          </nav>
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 max-w-md hidden sm:block">
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => autocompleteItems.length > 0 && setShowDropdown(true)}
                placeholder="Tìm manga (tiếng Việt, không dấu, tên tác giả)..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all font-sans"
              />
            </div>
          </form>

          {/* Autocomplete Dropdown */}
          {showDropdown && autocompleteItems.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-800 rounded shadow-xl overflow-hidden z-50 divide-y divide-zinc-800/50">
              {autocompleteItems.map((item) => (
                <button
                  key={item.pool_manga_id}
                  onClick={() => {
                    setShowDropdown(false);
                    setSearchQuery("");
                    navigate(`/mangas/${item.slug || item.pool_manga_id}`);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 flex items-center justify-between transition-colors"
                >
                  <span className="font-medium truncate">{item.title}</span>
                  <span className="text-[10px] font-mono text-zinc-500 ml-2 shrink-0">Open &rarr;</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Actions / Profile */}
        <div className="flex items-center gap-3">
          {/* Health Indicator */}
          <div
            title={`Hạ tầng: ${healthStatus === "ok" ? "Sẵn sàng (Postgres, Redis, MinIO)" : "Đang kiểm tra"}`}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                healthStatus === "ok" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <span className="hidden lg:inline">:18000</span>
          </div>

          {currentUser ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-200 transition-colors"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px]">
                  {currentUser.display_name.charAt(0).toUpperCase()}
                </div>
                <span className="max-w-[100px] truncate">{currentUser.display_name}</span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-zinc-900 border border-zinc-800 rounded shadow-2xl py-1 z-50 text-xs text-zinc-300 divide-y divide-zinc-800">
                  <div className="px-3 py-2">
                    <p className="font-medium text-zinc-100 truncate">{currentUser.display_name}</p>
                    <p className="text-[10px] text-zinc-500 font-mono truncate">{currentUser.email}</p>
                    <span className="inline-block mt-1 text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      {currentUser.role}
                    </span>
                  </div>
                  <div className="py-1">
                    <Link
                      to="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-3 py-1.5 hover:bg-zinc-800 transition-colors"
                    >
                      Hồ Sơ & Cài Đặt
                    </Link>
                    <Link
                      to="/history"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-3 py-1.5 hover:bg-zinc-800 transition-colors"
                    >
                      Lịch Sử Đọc & Điểm Số
                    </Link>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3 py-1.5 text-rose-400 hover:bg-zinc-800 flex items-center gap-1.5 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Đăng Xuất</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-3 py-1.5 rounded bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-medium text-xs transition-colors flex items-center gap-1 shadow-sm"
            >
              <User className="w-3.5 h-3.5" />
              <span>Đăng Nhập</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
