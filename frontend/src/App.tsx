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
import { AlertProvider } from "./hooks/useAlert";
import { DownloadProvider } from "./hooks/useDownload";

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AlertProvider>
        <DownloadProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<MangaListPage />} />
              <Route path="manga/:id" element={<MangaDetailPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="tags" element={<TagsPage />} />
              <Route path="author/:name" element={<AuthorDetailPage />} />
              <Route path="tools" element={<ImageToolsPage />} />
              <Route path="downloads" element={<DownloadsPage />} />
            </Route>
          </Routes>
        </DownloadProvider>
      </AlertProvider>
    </BrowserRouter>
  );
};

export default App;
