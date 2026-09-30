import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import MangaListPage from "./pages/MangaListPage";
import MangaDetailPage from "./pages/MangaDetailPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import TagsPage from "./pages/TagsPage";
import AuthorDetailPage from "./pages/AuthorDetailPage";
import ImageToolsPage from "./pages/ImageToolsPage";
import DownloadsPage from "./pages/DownloadsPage";
import SyncManagerPage from "./pages/SyncManagerPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import MangaReaderPage from "./pages/MangaReaderPage";
import PanelWordsDetectorPage from "./pages/PanelWordsDetectorPage";
import { AlertProvider } from "./hooks/useAlert";
import { DownloadProvider } from "./hooks/useDownload";

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AlertProvider>
        <DownloadProvider>
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
            </Route>
          </Routes>
        </DownloadProvider>
      </AlertProvider>
    </BrowserRouter>
  );
};

export default App;
