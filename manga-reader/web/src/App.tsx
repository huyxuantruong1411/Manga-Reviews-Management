import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { Navbar } from "./components/Navbar";
import { AuthModal } from "./components/AuthModal";
import { FeedbackProvider } from "./components/ToastProvider";
import { PageTransition } from "./components/MotionPrimitives";
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

const AppShell: React.FC = () => {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [loadingUser, setLoadingUser] = useState<boolean>(true);

  const isReaderRoute = location.pathname.startsWith("/read/");

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
      {/* Navigation Bar (hidden on full-bleed reader route so chapter HUD never overlaps) */}
      {!isReaderRoute && (
        <Navbar currentUser={currentUser} onOpenAuth={openAuth} onLogout={handleLogout} />
      )}

      {/* Main Content Area */}
      <main
        className={
          isReaderRoute ? "flex-1 w-full" : "flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6"
        }
      >
        <PageTransition pageKey={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<CatalogPage currentUser={currentUser} />} />
            <Route path="/search" element={<SearchPage />} />
            <Route
              path="/mangas/:idOrSlug"
              element={<MangaDetailPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route path="/read/:chapterId" element={<ReaderPage currentUser={currentUser} />} />
            <Route
              path="/lists"
              element={<ReadingListsPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route path="/lists/:listId" element={<ListDetailPage />} />
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
                loadingUser ? (
                  <div className="p-8 space-y-3 font-mono" role="status" aria-busy="true">
                    <div className="h-6 w-52 bg-zinc-900 rounded animate-shimmer motion-reduce:after:hidden mx-auto" />
                    <div className="h-4 w-72 bg-zinc-900/70 rounded animate-shimmer motion-reduce:after:hidden mx-auto" />
                  </div>
                ) : currentUser && currentUser.role === "admin" ? (
                  <AdminPage />
                ) : (
                  <div className="p-8 text-center font-mono bg-zinc-900/40 border border-zinc-800 rounded max-w-md mx-auto my-8">
                    <p className="text-red-400 font-bold mb-2">ACCESS RESTRICTED</p>
                    <p className="text-zinc-400 text-xs mb-4">
                      Administrator credentials required. Please sign in with an admin account.
                    </p>
                    {!currentUser && (
                      <button
                        type="button"
                        onClick={openAuth}
                        className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors"
                      >
                        Đăng nhập Admin
                      </button>
                    )}
                  </div>
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PageTransition>
      </main>

      {/* IaaS Console Footer */}
      {!isReaderRoute && (
        <footer className="border-t border-zinc-900 bg-zinc-950 py-4 px-4 sm:px-6 lg:px-8 text-xs font-mono text-zinc-400">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>CLUSTER: D:\manga-reader</span>
              </span>
              <span aria-hidden="true">•</span>
              <span>PORT: :18000 / :15173</span>
            </div>
            <div className="flex items-center gap-3 text-zinc-400">
              <span>Manga Reader v2.0</span>
              <span aria-hidden="true">•</span>
              <span>Postgres / MinIO / Redis</span>
            </div>
          </div>
        </footer>
      )}

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
  );
};

export const App: React.FC = () => {
  return (
    <MotionConfig reducedMotion="user">
      <FeedbackProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </FeedbackProvider>
    </MotionConfig>
  );
};
export default App;
