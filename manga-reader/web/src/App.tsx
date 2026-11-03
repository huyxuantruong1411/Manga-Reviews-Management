import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { AuthModal } from "./components/AuthModal";
import { CatalogPage } from "./pages/CatalogPage";
import { SearchPage } from "./pages/SearchPage";
import { MangaDetailPage } from "./pages/MangaDetailPage";
import { ReaderPage } from "./pages/ReaderPage";
import { ReadingListsPage } from "./pages/ReadingListsPage";
import { ListDetailPage } from "./pages/ListDetailPage";
import { HistoryPage } from "./pages/HistoryPage";
import { StatsPage } from "./pages/StatsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminPage } from "./pages/AdminPage";
import { api, type UserProfile, getStoredToken } from "./api/client";

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [, setLoadingUser] = useState<boolean>(true);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    if (!getStoredToken()) {
      setCurrentUser(null);
      setLoadingUser(false);
      return;
    }
    try {
      const user = await api.getCurrentUser();
      setCurrentUser(user);
    } catch {
      api.logout();
      setCurrentUser(null);
    } finally {
      setLoadingUser(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
  };

  const openAuth = () => {
    setShowAuthModal(true);
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
        {/* Navigation Bar */}
        <Navbar
          currentUser={currentUser}
          onOpenAuth={openAuth}
          onLogout={handleLogout}
        />

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Routes>
            <Route path="/" element={<CatalogPage currentUser={currentUser} />} />
            <Route path="/search" element={<SearchPage />} />
            <Route
              path="/mangas/:idOrSlug"
              element={<MangaDetailPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route
              path="/read/:chapterId"
              element={<ReaderPage currentUser={currentUser} />}
            />
            <Route
              path="/lists"
              element={<ReadingListsPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route path="/lists/:id" element={<ListDetailPage />} />
            <Route
              path="/history"
              element={<HistoryPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route
              path="/stats"
              element={<StatsPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route
              path="/profile"
              element={
                <ProfilePage
                  currentUser={currentUser}
                  onUpdateUser={(updated) => setCurrentUser(updated)}
                  onOpenAuth={openAuth}
                />
              }
            />
            <Route
              path="/admin"
              element={
                currentUser && currentUser.role === "admin" ? (
                  <AdminPage />
                ) : (
                  <div className="p-8 text-center font-mono">
                    <p className="text-red-400 font-bold mb-2">ACCESS RESTRICTED</p>
                    <p className="text-zinc-500 text-xs">
                      Administrator credentials required. Please sign in with an admin account.
                    </p>
                  </div>
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* IaaS Console Footer */}
        <footer className="border-t border-zinc-900 bg-zinc-950 py-4 px-4 sm:px-6 lg:px-8 text-xs font-mono text-zinc-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                <span>CLUSTER: D:\manga-reader (DRIVE D ISOLATED)</span>
              </span>
              <span>•</span>
              <span>PORT: :18000 (BACKEND) / :15173 (WEB)</span>
            </div>
            <div className="flex items-center gap-4 text-zinc-500">
              <span>Manga Reader Platform v2.0</span>
              <span>•</span>
              <span>Postgres 16 / MinIO / Redis 7</span>
            </div>
          </div>
        </footer>

        {/* Global Auth Modal */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={(user) => {
            setShowAuthModal(false);
            setCurrentUser(user);
          }}
        />
      </div>
    </BrowserRouter>
  );
};
export default App;
