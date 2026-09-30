import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Layout from "./components/layout/Layout";
const MangaListPage = lazy(() => import("./pages/MangaListPage"));
const MangaDetailPage = lazy(() => import("./pages/MangaDetailPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const TagsPage = lazy(() => import("./pages/TagsPage"));
const AuthorDetailPage = lazy(() => import("./pages/AuthorDetailPage"));
const ImageToolsPage = lazy(() => import("./pages/ImageToolsPage"));
const DownloadsPage = lazy(() => import("./pages/DownloadsPage"));
const SyncManagerPage = lazy(() => import("./pages/SyncManagerPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const MangaReaderPage = lazy(() => import("./pages/MangaReaderPage"));
const PanelWordsDetectorPage = lazy(() => import("./pages/PanelWordsDetectorPage"));
import { AlertProvider } from "./hooks/useAlert";
import { DownloadProvider } from "./hooks/useDownload";

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AlertProvider>
        <DownloadProvider>
          <Suspense fallback={<div role="status" className="p-8 text-center">Đang tải trang...</div>}>
          <Routes>
            {/* Dedicated full-screen MangaDex-style reader route */}
            <Route path="manga/:id/read/:chapterId" element={<MangaReaderPage />} />

            <Route path="/" element={<Layout />}>
              <Route index element={<MangaListPage />} />
              <Route path="manga/:id" element={<MangaDetailPage />} />
              <Route path="panel-words-detector" element={<PanelWordsDetectorPage />} />
              <Route path="panels" element={<PanelWordsDetectorPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="tags" element={<TagsPage />} />
              <Route path="author/:name" element={<AuthorDetailPage />} />
              <Route path="tools" element={<ImageToolsPage />} />
              <Route path="downloads" element={<DownloadsPage />} />
              <Route path="sync" element={<SyncManagerPage />} />
              <Route path="audit-logs" element={<AuditLogsPage />} />
              <Route path="audit" element={<AuditLogsPage />} />
              <Route path="*" element={<div className="p-8 text-center space-y-4"><h1>Không tìm thấy trang</h1><Link to="/" className="underline">Về thư viện manga</Link></div>} />
            </Route>
          </Routes>
          </Suspense>
        </DownloadProvider>
      </AlertProvider>
    </BrowserRouter>
  );
};

export default App;
