import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, BarChart3, Tag, Compass } from "lucide-react";
import ThemeToggle from "../ui/ThemeToggle";

export const Layout: React.FC = () => {
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
        <nav className="flex-1 p-4 space-y-2">
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
    </div>
  );
};

export default Layout;
