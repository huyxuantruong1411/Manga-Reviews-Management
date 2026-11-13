import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  BookOpen,
  Search,
  Bookmark,
  Clock,
  BarChart2,
  Shield,
  User,
  LogOut,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { api, UserProfile } from "@/api/client";
import { AnimatedTabPill, MOTION_EASE, MOTION_SPRING } from "./MotionPrimitives";

interface NavbarProps {
  onOpenAuth: () => void;
  currentUser: UserProfile | null;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth, currentUser, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [autocompleteItems, setAutocompleteItems] = useState<
    Array<{ pool_manga_id: string; title: string; slug: string }>
  >([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [healthStatus, setHealthStatus] = useState<"ok" | "degraded" | "checking">("checking");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .getHealth()
      .then((res) => {
        setHealthStatus(res.status === "ready" ? "ok" : "degraded");
      })
      .catch(() => setHealthStatus("degraded"));
  }, []);

  // Close menus on route navigation
  useEffect(() => {
    setMobileMenuOpen(false);
    setShowDropdown(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  // Click outside + Escape + Ctrl+K / "/" search shortcut
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowDropdown(false);
        setUserMenuOpen(false);
        setMobileMenuOpen(false);
        return;
      }

      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !isTyping)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setAutocompleteItems([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(() => {
      api
        .autocomplete(searchQuery.trim())
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
      setMobileMenuOpen(false);
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const navItems = [
    { to: "/", label: "Danh Mục", icon: null, match: (p: string) => p === "/" || p.startsWith("/mangas/") },
    { to: "/lists", label: "List Của Tôi", icon: Bookmark, match: (p: string) => p.startsWith("/lists") },
    { to: "/history", label: "Lịch Sử", icon: Clock, match: (p: string) => p === "/history" },
    { to: "/stats", label: "Thống Kê", icon: BarChart2, match: (p: string) => p === "/stats" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-4 lg:gap-6 min-w-0">
          <Link
            to="/"
            className="flex items-center gap-2 text-zinc-100 hover:text-emerald-400 transition-colors font-mono font-bold text-sm tracking-tight shrink-0"
          >
            <div className="w-7 h-7 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <span>MANGA.READER</span>
            <span className="hidden xs:inline text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">
              v2.0
            </span>
          </Link>

          {/* Nav links with shared layout active pill */}
          <LayoutGroup id="reader-navbar-tabs">
            <nav className="hidden md:flex items-center gap-1 text-xs font-medium text-zinc-400">
              {navItems.map((item) => {
                const isActive = item.match(location.pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`relative px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                      isActive ? "text-emerald-300" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60"
                    }`}
                  >
                    {isActive && (
                      <AnimatedTabPill
                        layoutId="navbar-active-pill"
                        className="rounded bg-emerald-500/10 border border-emerald-500/30"
                      />
                    )}
                    {Icon && <Icon className="w-3.5 h-3.5 relative z-10" />}
                    <span className="relative z-10">{item.label}</span>
                  </Link>
                );
              })}

              {currentUser?.role === "admin" && (
                <Link
                  to="/admin"
                  className={`relative px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                    location.pathname.startsWith("/admin")
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Console Quản Trị</span>
                </Link>
              )}
            </nav>
          </LayoutGroup>
        </div>

        {/* Search Bar */}
        <div ref={searchBoxRef} className="relative flex-1 max-w-md hidden sm:block">
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => autocompleteItems.length > 0 && setShowDropdown(true)}
                placeholder="Tìm manga (tiếng Việt, không dấu, tên tác giả)..."
                aria-label="Tìm kiếm manga"
                className="w-full bg-zinc-900 border border-zinc-800 rounded pl-8 pr-14 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/50 transition-all font-sans"
              />
              {!searchQuery ? (
                <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 bg-zinc-950 border border-zinc-800 rounded absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  /
                </kbd>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setAutocompleteItems([]);
                    setShowDropdown(false);
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </form>

          {/* Animated Autocomplete Dropdown */}
          <AnimatePresence>
            {showDropdown && autocompleteItems.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.99 }}
                transition={{ duration: 0.14, ease: MOTION_EASE }}
                className="absolute top-full left-0 right-0 mt-1.5 bg-zinc-900 border border-zinc-800 rounded shadow-2xl overflow-hidden z-50 divide-y divide-zinc-800/60"
              >
                {autocompleteItems.map((item) => (
                  <button
                    key={item.pool_manga_id}
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      setSearchQuery("");
                      navigate(`/mangas/${item.slug || item.pool_manga_id}`);
                    }}
                    className="w-full text-left px-3 py-2.5 text-xs text-zinc-300 hover:bg-zinc-800/80 flex items-center justify-between transition-colors"
                  >
                    <span className="font-medium truncate">{item.title}</span>
                    <span className="text-[10px] font-mono text-emerald-400 ml-2 shrink-0">Mở &rarr;</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Actions / Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Health Indicator */}
          <div
            title={`Hạ tầng: ${healthStatus === "ok" ? "Sẵn sàng (Postgres, Redis, MinIO)" : "Đang kiểm tra"}`}
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                healthStatus === "ok" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <span className="hidden lg:inline">:18000</span>
          </div>

          {currentUser ? (
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-200 transition-colors"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px]">
                  {currentUser.display_name.charAt(0).toUpperCase()}
                </div>
                <span className="max-w-[84px] sm:max-w-[110px] truncate">{currentUser.display_name}</span>
                <ChevronDown
                  className={`w-3 h-3 text-zinc-400 transition-transform duration-150 ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={MOTION_SPRING}
                    role="menu"
                    className="absolute right-0 mt-1.5 w-52 bg-zinc-900 border border-zinc-800 rounded shadow-2xl py-1 z-50 text-xs text-zinc-300 divide-y divide-zinc-800"
                  >
                    <div className="px-3 py-2">
                      <p className="font-medium text-zinc-100 truncate">{currentUser.display_name}</p>
                      <p className="text-[10px] text-zinc-400 font-mono truncate">{currentUser.email}</p>
                      <span className="inline-block mt-1 text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {currentUser.role}
                      </span>
                    </div>
                    <div className="py-1">
                      <Link
                        to="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="block px-3 py-2 hover:bg-zinc-800 transition-colors"
                      >
                        Hồ Sơ & Cài Đặt
                      </Link>
                      <Link
                        to="/history"
                        onClick={() => setUserMenuOpen(false)}
                        className="block px-3 py-2 hover:bg-zinc-800 transition-colors"
                      >
                        Lịch Sử Đọc & Điểm Số
                      </Link>
                    </div>
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full text-left px-3 py-2 text-rose-400 hover:bg-zinc-800 flex items-center gap-1.5 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Đăng Xuất</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-3 py-1.5 rounded bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold text-xs transition-colors flex items-center gap-1 shadow-sm"
            >
              <User className="w-3.5 h-3.5" />
              <span>Đăng Nhập</span>
            </button>
          )}

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-2 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 transition-colors"
            aria-label={mobileMenuOpen ? "Đóng menu" : "Mở menu điều hướng"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Animated Mobile Drawer */}
      <AnimatePresence initial={false}>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: MOTION_EASE }}
            className="md:hidden overflow-hidden border-t border-zinc-800 bg-zinc-950/98"
          >
            <div className="px-4 py-3 space-y-3">
              {/* Mobile Search Bar */}
              <form onSubmit={handleSearchSubmit}>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm manga (tiếng Việt, không dấu)..."
                    aria-label="Tìm kiếm manga trên di động"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-8 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </form>

              {/* Mobile Navigation Links */}
              <nav className="flex flex-col space-y-1 text-xs font-medium text-zinc-300">
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-2.5 rounded transition-colors flex items-center gap-2 ${
                    location.pathname === "/" ? "bg-emerald-500/10 text-emerald-300" : "hover:bg-zinc-900 hover:text-zinc-100"
                  }`}
                >
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                  <span>Danh Mục Truyện</span>
                </Link>
                <Link
                  to="/lists"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-2.5 rounded transition-colors flex items-center gap-2 ${
                    location.pathname.startsWith("/lists")
                      ? "bg-amber-500/10 text-amber-300"
                      : "hover:bg-zinc-900 hover:text-zinc-100"
                  }`}
                >
                  <Bookmark className="w-4 h-4 text-amber-400" />
                  <span>List Của Tôi</span>
                </Link>
                <Link
                  to="/history"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-2.5 rounded transition-colors flex items-center gap-2 ${
                    location.pathname === "/history" ? "bg-cyan-500/10 text-cyan-300" : "hover:bg-zinc-900 hover:text-zinc-100"
                  }`}
                >
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span>Lịch Sử Đọc & Điểm Số</span>
                </Link>
                <Link
                  to="/stats"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-2.5 rounded transition-colors flex items-center gap-2 ${
                    location.pathname === "/stats" ? "bg-purple-500/10 text-purple-300" : "hover:bg-zinc-900 hover:text-zinc-100"
                  }`}
                >
                  <BarChart2 className="w-4 h-4 text-purple-400" />
                  <span>Thống Kê Thói Quen</span>
                </Link>
                {currentUser?.role === "admin" && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-3 py-2.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex items-center gap-2"
                  >
                    <Shield className="w-4 h-4" />
                    <span>Console Quản Trị Hệ Thống</span>
                  </Link>
                )}
              </nav>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
